import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { notify } from '@/lib/notify';
import { canAccess } from '@/lib/portals';
import { sendSystem } from '@/lib/whatsapp/inbox';
import { getSettings as getWaSettings } from '@/lib/whatsapp/settings';
import { isQuiet } from '@/lib/whatsapp/schedule';
import { msConfigured, sendMail } from '@/lib/ms365';
import { getCrmSettings } from './crm-settings';
import { fillText } from './settings-shared';
import { daysWord } from './tracker';
import { ensurePortalToken, logActivity, portalUrl } from './server';

/**
 * Everything the CRM does by itself, run every minute by the cron (Supabase pg_cron):
 *  - booking confirmations and countdowns before surveys and installs ("3 days to go")
 *  - Google review requests after Complete
 *  - "new lead not contacted" alerts
 *  - follow-up sequences for new leads (stop when they reply)
 * Each message is sent once (keys in crm_projects.reminders_sent) and never in quiet hours.
 */

const TZ = 'Europe/London';
const ymd = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ });
const dateLabel = (d: Date) => d.toLocaleDateString('en-GB', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
const timeLabel = (d: Date) => d.toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });

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

async function crmTeam() {
  const { data } = await createAdminClient().from('profiles').select('*').eq('status', 'approved');
  return (data ?? []).filter((p) => canAccess(p, 'crm')).map((p) => p.id as string);
}

async function markSent(p: Proj, key: string) {
  const sent = [...(p.reminders_sent ?? []), key];
  p.reminders_sent = sent;
  await createAdminClient().from('crm_projects').update({ reminders_sent: sent }).eq('id', p.id);
}

async function customer(enquiryId: string) {
  const { data } = await createAdminClient().from('enquiries').select('id, name, email').eq('id', enquiryId).maybeSingle();
  return data;
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
  const link = portalUrl(await ensurePortalToken(p.id));
  const what = kind === 'install' ? 'installation' : 'survey';
  let sent = 0;

  // 1) Booking confirmation, as soon as the date is set.
  const bookedKey = `${kind}-booked:${day}`;
  if (!p.reminders_sent?.includes(bookedKey)) {
    const text = `Hi ${first}, your Heliaxis ${what} is booked for ${dateLabel(when)} at ${timeLabel(when)}. We'll send you a reminder nearer the time. You can see all your details here: ${link}`;
    const r = await sendSystem(p.enquiry_id, { text, template, params: [first, `booked for ${dateLabel(when)}`, timeLabel(when)] }, 'reminder');
    await markSent(p, bookedKey);
    await logActivity({
      enquiryId: p.enquiry_id,
      projectId: p.id,
      kind: 'system',
      body: r.ok ? `WhatsApp: ${what} booking confirmation sent` : `${what[0].toUpperCase()}${what.slice(1)} confirmation not sent: ${r.error}`,
    });
    if (r.ok) sent++;
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
    const lead = n === 0 ? `your Heliaxis ${what} is today` : `just ${n} day${n === 1 ? '' : 's'} to go until your Heliaxis ${what}`;
    const extra =
      kind === 'install' && n <= 1
        ? ' Please make sure we can get to the loft / install areas, and that someone over 18 is home.'
        : kind === 'survey' && n <= 1
          ? ' It helps if we can see your fuse box, meter and loft.'
          : '';
    const text = `Hi ${first}, ${lead} — ${dateLabel(when)} at ${timeLabel(when)}.${extra} Any questions, just reply here. ${link}`;
    const r = await sendSystem(p.enquiry_id, { text, template, params: [first, daysWord(n), `${dateLabel(when)}, ${timeLabel(when)}`] }, 'reminder');
    await markSent(p, key);
    await logActivity({
      enquiryId: p.enquiry_id,
      projectId: p.id,
      kind: 'system',
      body: r.ok ? `WhatsApp: “${daysWord(n)}” ${what} reminder sent` : `${what} reminder (${daysWord(n)}) not sent: ${r.error}`,
    });
    if (r.ok) sent++;
  }
  return sent;
}

export async function runCrmAutomations() {
  const db = createAdminClient();
  const [s, wa] = await Promise.all([getCrmSettings(), getWaSettings()]);
  const now = new Date();
  const quiet = isQuiet(now, wa.quietFrom, wa.quietTo);
  const out = { reminders: 0, reviews: 0, alerts: 0, sequence: 0 };
  if (quiet) return out;

  const cols =
    'id, enquiry_id, title, stage, owner_id, survey_at, install_at, reminders_sent, stage_changed_at, created_at, sequence_step, sequence_stopped_at, first_contact_at, first_response_alerted_at';
  const horizon = new Date(now.getTime() + 31 * 86_400_000).toISOString();

  // Countdowns: surveys and installs in the next month.
  const [{ data: surveys }, { data: installs }] = await Promise.all([
    db.from('crm_projects').select(cols).gte('survey_at', now.toISOString()).lte('survey_at', horizon).not('stage', 'in', '(lost,complete)'),
    db.from('crm_projects').select(cols).gte('install_at', now.toISOString()).lte('install_at', horizon).not('stage', 'in', '(lost,complete)'),
  ]);
  for (const p of (surveys ?? []) as Proj[]) out.reminders += await countdowns(p, 'survey', s.surveyReminderDays, s.reminderHour, s.surveyTemplate, now);
  for (const p of (installs ?? []) as Proj[]) out.reminders += await countdowns(p, 'install', s.installReminderDays, s.reminderHour, s.installTemplate, now);

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
      if (Number(now.toLocaleString('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' })) < s.reminderHour) continue;
      const c = await customer(p.enquiry_id);
      const first = (c?.name || '').split(/\s+/)[0] || 'there';
      const text = `Hi ${first}, thank you for choosing Heliaxis! If you're happy with your installation, would you mind leaving us a quick Google review? It really helps a small local business: ${s.reviewUrl}`;
      const r = await sendSystem(p.enquiry_id, { text, template: s.reviewTemplate, params: [first, s.reviewUrl] }, 'review');
      await markSent(p, 'review');
      await logActivity({ enquiryId: p.enquiry_id, projectId: p.id, kind: 'system', body: r.ok ? 'WhatsApp: review request sent' : `Review request not sent: ${r.error}` });
      if (r.ok) out.reviews++;
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
            })
          )
        );
        out.alerts++;
      }
    }
  }

  // Follow-up sequences for leads that haven't replied.
  if (s.sequenceEnabled && s.sequence.length) {
    const { data: seq } = await db
      .from('crm_projects')
      .select(cols)
      .in('stage', ['lead', 'contacted'])
      .is('sequence_stopped_at', null)
      .lt('sequence_step', s.sequence.length)
      .gte('created_at', new Date(now.getTime() - 45 * 86_400_000).toISOString())
      .limit(50);
    for (const p of (seq ?? []) as Proj[]) {
      const step = s.sequence[p.sequence_step];
      if (!step || now.getTime() < new Date(p.created_at).getTime() + step.afterHours * 3_600_000) continue;
      const c = await customer(p.enquiry_id);
      const link = step.text.includes('{portal_link}') ? portalUrl(await ensurePortalToken(p.id)) : null;
      const text = fillText(step.text, { name: c?.name, portalLink: link });
      let ok = false;
      let why = '';
      if (step.channel === 'email') {
        if (msConfigured() && c?.email) {
          try {
            const id = await sendMail({ to: c.email, subject: fillText(step.subject || 'Your Heliaxis enquiry', { name: c.name }), text });
            await db.from('crm_emails').insert({
              enquiry_id: p.enquiry_id,
              project_id: p.id,
              graph_id: id,
              direction: 'out',
              subject: step.subject || 'Your Heliaxis enquiry',
              body: text,
              from_address: process.env.MS_MAILBOX,
              to_address: c.email,
              at: now.toISOString(),
            });
            ok = true;
          } catch (e) {
            why = e instanceof Error ? e.message : 'email failed';
          }
        } else why = c?.email ? 'Microsoft 365 not connected' : 'no email address';
      } else {
        const first = (c?.name || '').split(/\s+/)[0] || 'there';
        const r = await sendSystem(p.enquiry_id, { text, template: step.template, params: [first] }, 'sequence');
        ok = r.ok;
        if (!r.ok) why = r.error;
      }
      await db.from('crm_projects').update({ sequence_step: p.sequence_step + 1 }).eq('id', p.id);
      await logActivity({
        enquiryId: p.enquiry_id,
        projectId: p.id,
        kind: 'system',
        body: ok
          ? `Follow-up ${p.sequence_step + 1} sent (${step.channel === 'email' ? 'email' : 'WhatsApp'})`
          : `Follow-up ${p.sequence_step + 1} skipped: ${why}`,
      });
      if (ok) out.sequence++;
    }
  }
  return out;
}

/** Give a new lead to the next person in the rotation (CRM → Settings) and tell them. */
export async function assignNewLead(projectId: string, customerName: string) {
  const s = await getCrmSettings();
  if (!s.leadRotation.length) return null;
  const owner = s.leadRotation[s.rotationIndex % s.leadRotation.length];
  const { saveCrmSettings } = await import('./crm-settings');
  await saveCrmSettings({ ...s, rotationIndex: (s.rotationIndex + 1) % s.leadRotation.length });
  await createAdminClient().from('crm_projects').update({ owner_id: owner }).eq('id', projectId).is('owner_id', null);
  await notify({
    userId: owner,
    kind: 'crm_new_lead',
    title: `New lead for you: ${customerName}`,
    body: 'Message them now — the quicker the reply, the better the chance.',
    href: `/admin/crm/${projectId}`,
    tag: `crm-${projectId}`,
  });
  return owner;
}
