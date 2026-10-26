import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { notify } from '@/lib/notify';
import { leadRef } from '@/lib/notification-refs';
import { canAccess } from '@/lib/portals';
import { sendSystem } from '@/lib/whatsapp/inbox';
import { getSettings as getWaSettings } from '@/lib/whatsapp/settings';
import { isQuiet } from '@/lib/whatsapp/schedule';
import { msConfigured, sendMail } from '@/lib/ms365';
import { getCrmSettings, getSavedCrmSettings } from './crm-settings';
import { fillText, sequenceHad, sequenceNext, type SequenceStep } from './settings-shared';
import { daysWord } from './tracker';
import { ensurePortalToken, logActivity, portalUrl } from './server';
import { bookingUrl, ensureBookingToken } from './booking-link';
import { applyStageEvent } from './move-stage';
import { DEFAULT_SURVEY_MINUTES, isSurveyType } from './stages';

/**
 * Everything the CRM does by itself, run every minute by the cron (Supabase pg_cron):
 *  - booking confirmations and countdowns before surveys and installs ("3 days to go")
 *  - Google review requests after Complete
 *  - "new lead not contacted" alerts
 *  - follow-up sequences for new leads (stop when they reply)
 *  - on the install morning, Install booked → Installing; "Was the survey done?" to the owner
 * Each message is sent once (keys in crm_projects.reminders_sent) and never in quiet hours. WhatsApp
 * goes only where it's allowed (src/lib/whatsapp/permission.ts); otherwise, with Microsoft 365
 * connected and an email address, the same message goes by email. Jobs on hold get no countdowns or
 * follow-ups.
 */

const TZ = 'Europe/London';
const ymd = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ });
const dateLabel = (d: Date) => d.toLocaleDateString('en-GB', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
const timeLabel = (d: Date) => d.toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const ukHour = (d: Date) => Number(d.toLocaleString('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }));

/** The UTC instant for a UK wall-clock date (YYYY-MM-DD) and hour. */
function londonAt(date: string, hour: number) {
  const [y, m, d] = date.split('-').map(Number);
  let t = Date.UTC(y, m - 1, d, hour, 0, 0);
  const h = Number(new Date(t).toLocaleString('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }));
  t -= (h - hour) * 3_600_000; // BST / GMT
  return new Date(t);
}
function minusDays(date: string, n: number) {
  const t = new Date(`${date}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() - n);
  return t.toISOString().slice(0, 10);
}
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** "No WhatsApp permission" → "no WhatsApp permission", for the middle of a sentence. */
const inSentence = (s: string) => (/^(WhatsApp|STOP)/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));

type Proj = {
  id: string;
  enquiry_id: string;
  title: string;
  stage: string;
  owner_id: string | null;
  survey_at: string | null;
  install_at: string | null;
  reminders_sent: string[] | null;
  stage_changed_at: string;
  created_at: string;
  sequence_step: number;
  sequence_stopped_at: string | null;
  first_contact_at: string | null;
  first_response_alerted_at: string | null;
};

const COLS =
  'id, enquiry_id, title, stage, owner_id, survey_at, install_at, reminders_sent, stage_changed_at, created_at, sequence_step, sequence_stopped_at, first_contact_at, first_response_alerted_at';

async function crmTeam() {
  const { data } = await createAdminClient().from('profiles').select('*').eq('status', 'approved');
  return (data ?? []).filter((p) => canAccess(p, 'crm')).map((p) => p.id as string);
}

/**
 * Mark a message as sent before sending it, so it goes once. crm_mark_sent (crm-v3.sql) adds the key
 * in the database, so two automations marking different keys at once both keep theirs, and false
 * means someone else got there first. Before crm-v3.sql: the whole list, as before.
 */
async function markSent(p: Proj, key: string): Promise<boolean> {
  if (p.reminders_sent?.includes(key)) return false;
  const db = createAdminClient();
  const r = await db.rpc('crm_mark_sent', { p_project: p.id, p_key: key }).then(
    (x) => x,
    () => ({ data: null, error: { message: 'missing' } })
  );
  p.reminders_sent = [...(p.reminders_sent ?? []), key];
  if (!r.error) return r.data === true;
  await db.from('crm_projects').update({ reminders_sent: p.reminders_sent }).eq('id', p.id);
  return true;
}

type Customer = { id: string; name: string | null; email: string | null };

async function customer(enquiryId: string): Promise<Customer | null> {
  const { data } = await createAdminClient().from('enquiries').select('id, name, email').eq('id', enquiryId).maybeSingle();
  return (data as Customer | null) ?? null;
}

/** Jobs on hold (crm-v3.sql). Empty before it's run. */
async function onHold(ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await createAdminClient()
      .from('crm_projects')
      .select('id')
      .in('id', ids.slice(i, i + 100))
      .eq('on_hold', true)
      .then(
        (r) => r,
        () => ({ data: null })
      );
    for (const r of (data ?? []) as { id: string }[]) out.add(r.id);
  }
  return out;
}

/** An email from the shared mailbox, filed on the customer's timeline like one sent by hand. */
async function emailCustomer(p: Proj, to: string, subject: string, text: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const id = await sendMail({ to, subject, text });
    await createAdminClient().from('crm_emails').insert({
      enquiry_id: p.enquiry_id,
      project_id: p.id,
      graph_id: id,
      direction: 'out',
      subject,
      body: text,
      from_address: process.env.MS_MAILBOX,
      to_address: to,
      at: new Date().toISOString(),
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'email failed' };
  }
}

/**
 * An automatic message to the customer: WhatsApp, or, when WhatsApp isn't allowed (no permission,
 * replied STOP) or possible (not connected, no mobile, no template outside the 24h window) and
 * Microsoft 365 is connected, the same message by email. `what` names it on the timeline
 * ("survey booking confirmation"). True if it went either way.
 */
async function sendToCustomer(
  p: Proj,
  c: Customer | null,
  msg: { text: string; template?: string | null; params?: string[] },
  via: string,
  what: string,
  subject: string
): Promise<boolean> {
  const log = (body: string) => logActivity({ enquiryId: p.enquiry_id, projectId: p.id, kind: 'system', body });
  const r = await sendSystem(p.enquiry_id, msg, via);
  if (r.ok) {
    await log(`WhatsApp: ${what} sent`);
    return true;
  }
  if (msConfigured() && c?.email) {
    const e = await emailCustomer(p, c.email, subject, msg.text);
    if (e.ok) {
      await log(`Email: ${what} sent (${inSentence(r.error)})`);
      return true;
    }
    await log(`${capital(what)} not sent: ${r.error}. The email didn’t go either: ${e.error}`);
    return false;
  }
  await log(`${capital(what)} not sent: ${r.error}`);
  return false;
}

/** This UK day already has a "<kind>-booked:<ISO start>" key (the key used to be just the day). */
function bookedAtTimeOn(sent: string[], kind: string, day: string) {
  const prefix = `${kind}-booked:`;
  return sent.some((k) => {
    if (!k.startsWith(prefix) || !k.includes('T')) return false;
    const t = new Date(k.slice(prefix.length));
    return Number.isFinite(t.getTime()) && ymd(t) === day;
  });
}

/** Confirmation when a date is booked, then countdowns. kind = install | survey. */
async function countdowns(p: Proj, kind: 'install' | 'survey', days: number[], hour: number, template: string, now: Date) {
  const whenIso = kind === 'install' ? p.install_at : p.survey_at;
  if (!whenIso) return 0;
  const when = new Date(whenIso);
  if (when.getTime() < now.getTime()) return 0;
  const day = ymd(when);
  const c = await customer(p.enquiry_id);
  if (!c) return 0;
  const first = (c.name || '').split(/\s+/)[0] || 'there';
  const token = await ensurePortalToken(p.id); // none before the job starts (e.g. survey reminders)
  const link = token ? portalUrl(token) : null;
  // While the job is still bookable the customer can move their survey online.
  const bookingToken = kind === 'survey' ? await ensureBookingToken(p.id) : null;
  const change = bookingToken ? ` Need to change it? ${bookingUrl(bookingToken)}` : '';
  const what = kind === 'install' ? 'installation' : 'survey';
  const subject = `Your Heliaxis ${what}`;
  let sent = 0;

  // 1) Booking confirmation, as soon as the date is set. One per start time, so moving it to another
  //    time on the same day sends a new one. One sent under the old day-only key isn't sent again.
  const bookedKey = `${kind}-booked:${when.toISOString()}`;
  const list = p.reminders_sent ?? [];
  if (!list.includes(bookedKey)) {
    const legacy = list.includes(`${kind}-booked:${day}`) && !bookedAtTimeOn(list, kind, day);
    if ((await markSent(p, bookedKey)) && !legacy) {
      const text = `Hi ${first}, your Heliaxis ${what} is booked for ${dateLabel(when)} at ${timeLabel(when)}. We'll send you a reminder nearer the time.${change}${link ? ` You can see all your details here: ${link}` : ''}`;
      const ok = await sendToCustomer(
        p,
        c,
        { text, template, params: [first, `booked for ${dateLabel(when)}`, timeLabel(when)] },
        'reminder',
        `${what} booking confirmation`,
        subject
      );
      if (ok) sent++;
    }
  }

  // 2) "N days to go" at the reminder hour, N days before.
  for (const n of days) {
    const key = `${kind}-${n}:${day}`;
    if (p.reminders_sent?.includes(key)) continue;
    const target = londonAt(minusDays(day, n), hour);
    if (now < target) continue;
    // Booked too late for this one (e.g. a 7-day reminder for a job in 2 days): skip it quietly.
    if (now.getTime() - target.getTime() > 6 * 3_600_000) {
      await markSent(p, key);
      continue;
    }
    if (!(await markSent(p, key))) continue;
    const lead = n === 0 ? `your Heliaxis ${what} is today` : `just ${n} day${n === 1 ? '' : 's'} to go until your Heliaxis ${what}`;
    const extra =
      kind === 'install' && n <= 1
        ? ' Please make sure we can get to the loft / install areas, and that someone over 18 is home.'
        : kind === 'survey' && n <= 1
          ? ' It helps if we can see your fuse box, meter and loft.'
          : '';
    const text = `Hi ${first}, ${lead} — ${dateLabel(when)} at ${timeLabel(when)}.${extra} Any questions, just reply here.${n > 0 ? change : ''}${link ? ` ${link}` : ''}`;
    const ok = await sendToCustomer(
      p,
      c,
      { text, template, params: [first, daysWord(n), `${dateLabel(when)}, ${timeLabel(when)}`] },
      'reminder',
      `“${daysWord(n)}” ${what} reminder`,
      subject
    );
    if (ok) sent++;
  }
  return sent;
}

/**
 * The install morning: from 07:00 UK on the install date, Install booked → Installing, once per job
 * and day. It sends nothing, so it runs in quiet hours too.
 */
async function startInstalls(now: Date) {
  if (ukHour(now) < 7) return 0;
  const today = ymd(now);
  const { data } = await createAdminClient()
    .from('crm_projects')
    .select(COLS)
    .eq('stage', 'install_booked')
    .gte('install_at', londonAt(today, 0).toISOString())
    .lt('install_at', londonAt(minusDays(today, -1), 0).toISOString())
    .limit(50);
  const jobs = (data ?? []) as Proj[];
  const held = await onHold(jobs.map((p) => p.id));
  let n = 0;
  for (const p of jobs) {
    if (held.has(p.id) || !(await markSent(p, `install-start:${today}`))) continue;
    if ((await applyStageEvent(p.id, 'install_started', { note: 'install day' })).moved) n++;
  }
  return n;
}

/**
 * Three hours after a survey should have finished, the job is still at Survey booked and no survey has
 * been completed for it in the app: ask the owner (or the CRM team) once whether it happened.
 */
async function surveyDoneChecks(now: Date) {
  const db = createAdminClient();
  // select('*'): survey_minutes, survey_type and on_hold come with the newer SQL files.
  const { data } = await db
    .from('crm_projects')
    .select('*')
    .eq('stage', 'survey_booked')
    .lte('survey_at', new Date(now.getTime() - 3 * 3_600_000).toISOString())
    .gte('survey_at', new Date(now.getTime() - 3 * 86_400_000).toISOString())
    .limit(50);
  type Row = Proj & { survey_minutes?: number | null; survey_type?: string | null; on_hold?: boolean | null };
  const due = ((data ?? []) as Row[]).filter((p) => {
    if (!p.survey_at || p.on_hold) return false;
    const minutes = p.survey_minutes || (isSurveyType(p.survey_type) ? DEFAULT_SURVEY_MINUTES[p.survey_type] : 60);
    return new Date(p.survey_at).getTime() + (minutes + 180) * 60_000 <= now.getTime();
  });
  if (!due.length) return 0;
  // A survey completed in the app (surveys.sql) means it happened and the stage is catching up.
  const { data: done } = await db
    .from('crm_surveys')
    .select('project_id')
    .in(
      'project_id',
      due.map((p) => p.id)
    )
    .eq('status', 'complete')
    .then(
      (r) => r,
      () => ({ data: null })
    );
  const surveyed = new Set(((done ?? []) as { project_id: string }[]).map((r) => r.project_id));
  const team = await crmTeam();
  let n = 0;
  for (const p of due) {
    if (surveyed.has(p.id) || !(await markSent(p, `survey-done-check:${new Date(p.survey_at!).toISOString()}`))) continue;
    const c = await customer(p.enquiry_id);
    const to = p.owner_id && team.includes(p.owner_id) ? [p.owner_id] : team;
    await Promise.all(
      to.map((userId) =>
        notify({
          userId,
          kind: 'crm_survey_check',
          title: `Was ${c?.name || 'the customer'}’s survey done?`,
          body: 'Mark the job as Surveyed, or set a new survey date.',
          href: `/admin/crm/${p.id}`,
          tag: `survey-check-${p.id}`,
        })
      )
    );
    n++;
  }
  return n;
}

export async function runCrmAutomations() {
  const db = createAdminClient();
  const [s, wa] = await Promise.all([getCrmSettings(), getWaSettings()]);
  const now = new Date();
  const quiet = isQuiet(now, wa);
  const out = { reminders: 0, reviews: 0, alerts: 0, sequence: 0, installsStarted: 0, surveyChecks: 0 };
  out.installsStarted = await startInstalls(now).catch(() => 0);
  if (quiet) return out;

  const cols = COLS;
  const horizon = new Date(now.getTime() + 31 * 86_400_000).toISOString();

  // Countdowns: surveys and installs in the next month (none for jobs on hold).
  const [{ data: surveys }, { data: installs }] = await Promise.all([
    db.from('crm_projects').select(cols).gte('survey_at', now.toISOString()).lte('survey_at', horizon).not('stage', 'in', '(lost,complete)'),
    db.from('crm_projects').select(cols).gte('install_at', now.toISOString()).lte('install_at', horizon).not('stage', 'in', '(lost,complete)'),
  ]);
  const held = await onHold([...((surveys ?? []) as Proj[]), ...((installs ?? []) as Proj[])].map((p) => p.id));
  for (const p of (surveys ?? []) as Proj[]) {
    if (!held.has(p.id)) out.reminders += await countdowns(p, 'survey', s.surveyReminderDays, s.reminderHour, s.surveyTemplate, now);
  }
  for (const p of (installs ?? []) as Proj[]) {
    if (!held.has(p.id)) out.reminders += await countdowns(p, 'install', s.installReminderDays, s.reminderHour, s.installTemplate, now);
  }
  out.surveyChecks = await surveyDoneChecks(now).catch(() => 0);

  // Review requests a few days after Complete, at the reminder hour.
  if (s.reviewUrl) {
    const cutoff = new Date(now.getTime() - s.reviewDelayDays * 86_400_000).toISOString();
    const { data: done } = await db
      .from('crm_projects')
      .select(cols)
      .eq('stage', 'complete')
      .lte('stage_changed_at', cutoff)
      .gte('stage_changed_at', new Date(now.getTime() - (s.reviewDelayDays + 14) * 86_400_000).toISOString());
    for (const p of (done ?? []) as Proj[]) {
      if (p.reminders_sent?.includes('review')) continue;
      if (ukHour(now) < s.reminderHour) continue;
      if (!(await markSent(p, 'review'))) continue;
      const c = await customer(p.enquiry_id);
      const first = (c?.name || '').split(/\s+/)[0] || 'there';
      const text = `Hi ${first}, thank you for choosing Heliaxis! If you're happy with your installation, would you mind leaving us a quick Google review? It really helps a small local business: ${s.reviewUrl}`;
      const ok = await sendToCustomer(p, c, { text, template: s.reviewTemplate, params: [first, s.reviewUrl] }, 'review', 'review request', 'Thank you from Heliaxis');
      if (ok) out.reviews++;
    }
  }

  // Speed to lead: alert when a new lead hasn't been contacted in time.
  if (s.firstResponseMinutes > 0) {
    const late = new Date(now.getTime() - s.firstResponseMinutes * 60_000).toISOString();
    const { data: waiting } = await db
      .from('crm_projects')
      .select(cols)
      .eq('stage', 'lead')
      .is('first_contact_at', null)
      .is('first_response_alerted_at', null)
      .lte('created_at', late)
      .gte('created_at', new Date(now.getTime() - 3 * 86_400_000).toISOString())
      .limit(20);
    if (waiting?.length) {
      const team = await crmTeam();
      for (const p of waiting as Proj[]) {
        await db.from('crm_projects').update({ first_response_alerted_at: now.toISOString() }).eq('id', p.id);
        const c = await customer(p.enquiry_id);
        const mins = Math.round((now.getTime() - new Date(p.created_at).getTime()) / 60_000);
        const to = p.owner_id && team.includes(p.owner_id) ? [p.owner_id] : team;
        await Promise.all(
          to.map((userId) =>
            notify({
              userId,
              kind: 'crm_first_response',
              title: `⏱ ${c?.name || 'A new lead'} hasn't been contacted`,
              body: `New enquiry ${mins >= 90 ? `${Math.round(mins / 60)}h` : `${mins} min`} ago — message them now.`,
              href: `/admin/crm/${p.id}`,
              tag: `crm-${p.id}`,
              ref: leadRef(p.enquiry_id),
            })
          )
        );
        out.alerts++;
      }
    }
  }

  // Follow-up sequences for leads that haven't replied (not for jobs on hold).
  if (s.sequenceEnabled && s.sequence.length) {
    // Leads a step added or removed still has to put back, if the run after that Save was cut off.
    await finishSequenceChange().catch(() => 0);
    // A Save since the start has put its leads back: go by the list as saved now, not the one read at the start, or this
    // pass would undo that. If it can't be read, the list read at the start stands.
    const sequence = (await getSavedCrmSettings().catch(() => s)).sequence;
    const { data: seq } = await db
      .from('crm_projects')
      .select(cols)
      .in('stage', ['lead', 'contacted'])
      .is('sequence_stopped_at', null)
      .lt('sequence_step', sequence.length)
      .gte('created_at', new Date(now.getTime() - 45 * 86_400_000).toISOString())
      .limit(50);
    const seqHeld = await onHold(((seq ?? []) as Proj[]).map((p) => p.id));
    for (const p of (seq ?? []) as Proj[]) {
      if (seqHeld.has(p.id)) continue;
      // sequence_step is the place of the lead's next step (the list's length once it has had them all), for the
      // query above; which steps it has had go by id.
      const had = sequenceHad(p.reminders_sent, p.sequence_step);
      const { at, skip } = sequenceNext(sequence, had, p.created_at);
      const step = sequence[at];
      const due = !!step && now.getTime() >= new Date(p.created_at).getTime() + step.afterHours * 3_600_000;
      if (!due && !skip.length && at === p.sequence_step) continue;
      // What it has had goes down by id first (for a lead from before ids, the steps its sequence_step counted),
      // so adding, moving or removing a step never re-sends another. Steps it came in too early for (it was
      // past them when the sequence was switched on, or the step added) are skipped quietly, not sent late.
      for (const id of [...had, ...skip]) await markSent(p, `seq:${id}`);
      if (!due || !(await markSent(p, `seq:${step.id}`))) {
        await db.from('crm_projects').update({ sequence_step: at }).eq('id', p.id);
        continue;
      }
      const c = await customer(p.enquiry_id);
      const token = step.text.includes('{portal_link}') ? await ensurePortalToken(p.id) : null;
      const link = token ? portalUrl(token) : null;
      const bookingToken = step.text.includes('{booking_link}') ? await ensureBookingToken(p.id) : null;
      const text = fillText(step.text, { name: c?.name, portalLink: link, bookingLink: bookingToken ? bookingUrl(bookingToken) : null });
      const subject = fillText(step.subject || 'Your Heliaxis enquiry', { name: c?.name });
      let ok = false;
      let why = '';
      let by = step.channel === 'email' ? 'email' : 'WhatsApp';
      if (step.channel === 'email') {
        if (msConfigured() && c?.email) {
          const e = await emailCustomer(p, c.email, subject, text);
          ok = e.ok;
          if (!e.ok) why = e.error;
        } else why = c?.email ? 'Microsoft 365 not connected' : 'no email address';
      } else {
        const first = (c?.name || '').split(/\s+/)[0] || 'there';
        const r = await sendSystem(p.enquiry_id, { text, template: step.template, params: [first] }, 'sequence');
        ok = r.ok;
        if (!r.ok) {
          why = r.error;
          // WhatsApp isn't allowed or possible: the same message by email instead.
          if (msConfigured() && c?.email && (await emailCustomer(p, c.email, subject, text)).ok) {
            ok = true;
            by = `email, ${inSentence(r.error)}`;
          }
        }
      }
      await db.from('crm_projects').update({ sequence_step: at + 1 }).eq('id', p.id);
      await logActivity({
        enquiryId: p.enquiry_id,
        projectId: p.id,
        kind: 'system',
        body: ok ? `Follow-up ${at + 1} sent (${by})` : `Follow-up ${at + 1} skipped: ${why}`,
      });
      if (ok) out.sequence++;
    }
  }
  return out;
}

/** cms_kv: when a Save added or removed a step, kept until a run finds no lead left to put back (finishSequenceChange). */
const SEQUENCE_CHECK = 'crm-sequence-check';
const PAGE = 1000;

/**
 * After a save that added or removed a step (CRM settings): a lead whose sequence_step is at or past the new
 * list's length, though there's a step in it the lead hasn't had (one added after a step it had was removed, or a
 * step removed in front of the one it's waiting for), has to be put back to that step's place, so the runner's
 * query finds it again. Only noted here, so the Save answers straight away: finishSequenceChange does it once the
 * answer has gone, and the next Save or the every-minute job finishes a run that's cut off. Never throws.
 */
export async function sequenceChanged(prev: SequenceStep[], next: SequenceStep[]) {
  const ids = (l: SequenceStep[]) => l.map((x) => x.id).sort().join();
  if (!next.length || ids(prev) === ids(next)) return;
  const at = new Date().toISOString();
  await createAdminClient()
    .from('cms_kv')
    .upsert({ key: SEQUENCE_CHECK, value: at, updated_at: at })
    .then(
      () => null,
      () => null
    );
}

/**
 * Put back the leads sequenceChanged noted: once the Save has answered, and again after every Save and from the
 * every-minute job until a run finds none left, so a run cut off is finished. Every lead past the end is read first,
 * a page at a time by id (none missed past PostgREST's row limit, or skipped as others are put back). A lead from
 * before ids has what its sequence_step counted written down by id and its new place in one write, so it's never
 * left with part of its history; the others go back in one write per place. The runner works out the rest by id,
 * including skipping a step the lead was already past when it was added. → how many leads it found to put back.
 * Throws if the saved settings can't be read or aren't there, so the note stays and a later run tries again (the
 * defaults would find nothing owed, and the note would go).
 */
export async function finishSequenceChange(): Promise<number> {
  const db = createAdminClient();
  const { data: noted } = await db.from('cms_kv').select('value').eq('key', SEQUENCE_CHECK).maybeSingle();
  if (!noted) return 0;
  // Read after the note, so a Save from here on leaves a new one.
  const { sequence } = await getSavedCrmSettings();
  type Row = Pick<Proj, 'id' | 'reminders_sent' | 'sequence_step'>;
  const found: Row[] = [];
  while (sequence.length) {
    const q = db
      .from('crm_projects')
      .select('id, reminders_sent, sequence_step')
      .in('stage', ['lead', 'contacted'])
      .is('sequence_stopped_at', null)
      .gte('sequence_step', sequence.length)
      .gte('created_at', new Date(Date.now() - 45 * 86_400_000).toISOString())
      .order('id')
      .limit(PAGE);
    const { data, error } = await (found.length ? q.gt('id', found[found.length - 1].id) : q);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    found.push(...(data as Row[]));
  }
  const before: { p: Row; at: number; keys: string[] }[] = [];
  const back = new Map<number, string[]>();
  for (const p of found) {
    const had = sequenceHad(p.reminders_sent, p.sequence_step);
    const at = sequence.findIndex((x) => !had.includes(x.id));
    if (at < 0) continue;
    const keys = had.map((id) => `seq:${id}`).filter((k) => !p.reminders_sent?.includes(k));
    if (keys.length) before.push({ p, at, keys });
    else back.set(at, [...(back.get(at) ?? []), p.id]);
  }
  if (!before.length && !back.size) {
    await db.from('cms_kv').delete().eq('key', SEQUENCE_CHECK).eq('value', noted.value);
    return 0;
  }
  // From before ids: only while nothing else has written to it since it was read (a key added meanwhile would be
  // lost); one that has is left for the next run.
  for (let i = 0; i < before.length; i += 10) {
    await Promise.all(
      before.slice(i, i + 10).map(async ({ p, at, keys }) => {
        const sent = p.reminders_sent ?? [];
        const { error } = await db
          .from('crm_projects')
          .update({ reminders_sent: [...sent, ...keys], sequence_step: at })
          .eq('id', p.id)
          .eq('sequence_step', p.sequence_step)
          .contains('reminders_sent', sent)
          .containedBy('reminders_sent', sent);
        if (error) throw new Error(error.message);
      })
    );
  }
  for (const [at, ids] of back) {
    for (let i = 0; i < ids.length; i += 100) {
      const { error } = await db.from('crm_projects').update({ sequence_step: at }).in('id', ids.slice(i, i + 100)).gte('sequence_step', sequence.length);
      if (error) throw new Error(error.message);
    }
  }
  return before.length + [...back.values()].reduce((n, ids) => n + ids.length, 0);
}

/**
 * Give a new lead to the next person in the rotation (CRM → Settings) and tell them. Only people who can
 * still open the CRM take a turn: someone rejected, set back to pending or without the CRM portal is
 * skipped (they stay ticked and keep their place, and take turns again when their access comes back).
 */
export async function assignNewLead(projectId: string, customerName: string, enquiryId?: string) {
  const s = await getCrmSettings();
  const n = s.leadRotation.length;
  if (!n) return null;
  const team = new Set(await crmTeam());
  // rotationIndex is a place in the whole ticked list (not just who's on the team today), so the turn order
  // holds when someone's access changes: from there, the first person who can still take a lead gets it.
  const at = Array.from({ length: n }, (_, k) => (s.rotationIndex + k) % n).find((i) => team.has(s.leadRotation[i]));
  if (at === undefined) return null;
  const owner = s.leadRotation[at];
  const { saveCrmSettings } = await import('./crm-settings');
  await saveCrmSettings({ ...s, rotationIndex: (at + 1) % n });
  await createAdminClient().from('crm_projects').update({ owner_id: owner }).eq('id', projectId).is('owner_id', null);
  await notify({
    userId: owner,
    kind: 'crm_new_lead',
    title: `New lead for you: ${customerName}`,
    body: 'Message them now — the quicker the reply, the better the chance.',
    href: `/admin/crm/${projectId}`,
    tag: `crm-${projectId}`,
    ref: enquiryId ? leadRef(enquiryId) : undefined,
  });
  return owner;
}
