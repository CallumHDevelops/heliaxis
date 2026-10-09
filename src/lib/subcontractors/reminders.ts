import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { CATEGORY_BY_KEY, DOC_CATEGORIES } from './documents';
import { issueNtpSigningLink } from './ntp';
import { ADMIN_EMAIL, emailShell, esc, logEvent, portalBaseUrl, sendEmail, siteBaseUrl } from './server';
import {
  missingDetails,
  SUB_COLUMNS,
  type AssignmentRow,
  type DocumentRow,
  type NtpRow,
  type OperativeRow,
  type SubcontractorRow,
} from './types';

/**
 * Subcontractor reminders.
 *
 * Once a day every firm with something newly due gets ONE digest email listing
 * everything outstanding, and Heliaxis gets one summary of anything that needs us
 * (countersigning, stalled onboarding, lapsed cover, crews not chosen close to a
 * start date). Each chase is a numbered step in a sequence — e.g. onboarding at
 * day 3, 7 and 14 after the invite — recorded in subcontractor_nudges BEFORE the
 * email goes (and removed again if it fails), so a step is never sent twice and a
 * missed day sends the latest due step once, not a backlog.
 *
 * Firms with reminders paused (admin switch) and terminated firms are skipped.
 */

const DAY = 86_400_000;
const PAGE = 1000;

type Chase = {
  kind: string;
  subjectKey: string;
  /** Steps that are due now (elapsed ≥ step). Unsent ones are recorded when the digest goes. */
  dueSteps: number[];
  text: string;
  urgent?: boolean;
  /** For ntp_sign chases: which agreement, so its NTP can be sent a fresh link. */
  ntpId?: string;
};

type AdminNote = { kind: string; subjectKey: string; steps: number[]; text: string };

export type FirmData = {
  sub: SubcontractorRow & { reminders_paused?: boolean };
  framework: { sub_signed_at: string | null; hlx_signed_at: string | null } | null;
  docs: DocumentRow[];
  ops: OperativeRow[];
  jobs: AssignmentRow[];
  ntps: NtpRow[];
  /** In-force NTP agreements — a renewal whose original has lapsed is chased on its own. */
  activeNtpIds: Set<string>;
};

const today0 = () => new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime();
const daysSince = (iso: string) => Math.floor((today0() - new Date(iso.slice(0, 10) + 'T00:00:00Z').getTime()) / DAY);
const daysUntil = (ymd: string) => Math.round((new Date(`${ymd}T00:00:00Z`).getTime() - today0()) / DAY);
const fmtDate = (ymd: string) =>
  new Date(`${ymd.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const docLabel = (d: DocumentRow) =>
  `${d.label || CATEGORY_BY_KEY[d.category]?.label || d.file_name}${d.operative_name ? ` (${d.operative_name})` : ''}`;
const later = (a: string, b: string) => (a > b ? a : b);
const sameKind = (x: DocumentRow, r: DocumentRow) => x.category === r.category && (x.operative_id || null) === (r.operative_id || null);

/** Newest non-rejected document per (category, person, description): older ones are superseded by renewals. */
function currentDocs(docs: DocumentRow[]) {
  const norm = (s: string | null | undefined) => (s || '').toLowerCase().trim();
  const latest = new Map<string, DocumentRow>();
  for (const d of docs.filter((x) => x.status !== 'rejected').sort((a, b) => a.uploaded_at.localeCompare(b.uploaded_at))) {
    latest.set(`${d.category}|${d.operative_id || norm(d.operative_name)}|${norm(d.label)}`, d);
  }
  return [...latest.values()];
}

/**
 * Everything this firm still has to do, as chase sequences, plus notes for Heliaxis.
 * Keys are stable (they never contain the current list of what's missing), so
 * uploading one of several things doesn't restart a sequence.
 */
export function chasesFor(f: FirmData): { firm: Chase[]; admin: AdminNote[] } {
  const { sub, framework, docs, ops, jobs, ntps, activeNtpIds } = f;
  const firm: Chase[] = [];
  const admin: AdminNote[] = [];
  const due = (elapsed: number, steps: number[]) => steps.filter((s) => elapsed >= s);
  const signedAt = framework?.sub_signed_at ?? null;

  // Documents of people the firm has removed from its team are no longer its business to renew.
  const archived = new Set(ops.filter((o) => o.archived_at).map((o) => o.id));
  const activeDocs = docs.filter((x) => !(x.operative_id && archived.has(x.operative_id)));

  // 1. Onboarding not finished (details / framework signature), measured from the latest invite.
  if (!signedAt && sub.invited_at && (sub.status === 'invited' || sub.status === 'in_progress')) {
    const d = daysSince(sub.invited_at);
    const left = [
      missingDetails(sub.details || {}).length ? 'complete your business details' : null,
      'read and sign the Subcontractor Framework Agreement',
    ].filter(Boolean);
    const invited = sub.invited_at.slice(0, 10);
    firm.push({
      kind: 'onboarding',
      subjectKey: `${sub.id}:${invited}`,
      dueSteps: due(d, [3, 7, 14]),
      text: `Finish your onboarding: ${left.join(', then ')}.`,
    });
    if (d >= 21) {
      admin.push({
        kind: 'escalation',
        subjectKey: `onboarding:${sub.id}:${invited}`,
        steps: [21],
        text: `${sub.company_name} hasn't finished onboarding ${d} days after being invited.`,
      });
    }
  }

  // 2. Heliaxis to countersign the framework agreement.
  if (signedAt && framework && !framework.hlx_signed_at) {
    const d = daysSince(signedAt);
    const steps = due(d, [2, 7]);
    if (steps.length) {
      admin.push({
        kind: 'countersign',
        subjectKey: `framework:${sub.id}`,
        steps,
        text: `${sub.company_name} signed their Framework Agreement ${d} days ago — waiting for your countersignature.`,
      });
    }
  }

  if (signedAt) {
    const signedDay = signedAt.slice(0, 10);

    // 3. Required documents never uploaded. Rejected and expired ones are chased separately
    //    below, so only "nothing at all" counts here.
    const missingCats = DOC_CATEGORIES.filter(
      (c) => c.required(sub.details || {}) && !c.operative && !docs.some((x) => x.category === c.key)
    ).map((c) => c.label);
    if (missingCats.length) {
      firm.push({
        kind: 'missing_docs',
        subjectKey: `${sub.id}:firm:${signedDay}`,
        dueSteps: due(daysSince(signedAt), [2, 7, 14, 28]),
        text: `Still needed: ${missingCats.join(', ')}.`,
      });
    }
    const team = ops.filter((o) => !o.archived_at);
    if (!team.length) {
      firm.push({
        kind: 'missing_docs',
        subjectKey: `${sub.id}:team:${signedDay}`,
        dueSteps: due(daysSince(signedAt), [2, 7, 14, 28]),
        text: 'Add your team — everyone you might send to a Heliaxis site.',
      });
    }
    // Each person's sequence runs from when they were added (or signing, if earlier).
    for (const o of team) {
      const missing = DOC_CATEGORIES.filter(
        (c) => c.operative && c.required({}) && !docs.some((x) => x.operative_id === o.id && x.category === c.key)
      ).map((c) => c.label.toLowerCase());
      if (!missing.length) continue;
      firm.push({
        kind: 'missing_docs',
        subjectKey: `op:${o.id}`,
        dueSteps: due(daysSince(later(signedAt, o.created_at)), [2, 7, 14, 28]),
        text: `${o.full_name}: upload ${missing.join(' and ')}.`,
      });
    }

    // 4. Rejected and not replaced. Any later upload of the same kind replaces it (including
    //    one sent before we got round to reviewing), and only the newest rejection is chased.
    const live = activeDocs.filter((x) => x.status !== 'rejected');
    for (const r of activeDocs.filter((x) => x.status === 'rejected' && x.reviewed_at)) {
      if (live.some((x) => sameKind(x, r) && x.uploaded_at > r.uploaded_at)) continue;
      if (activeDocs.some((x) => x.id !== r.id && x.status === 'rejected' && sameKind(x, r) && x.uploaded_at > r.uploaded_at)) continue;
      firm.push({
        kind: 'rejected',
        subjectKey: r.id,
        dueSteps: due(daysSince(r.reviewed_at as string), [2, 7]),
        text: `Please upload a new ${docLabel(r)} — we couldn't accept the last one${r.review_note ? `: “${r.review_note}”` : '.'}`,
      });
    }
  }

  // 5 + 6. Expiring soon (30 / 14 / 7 days) and already expired (on the day, then weekly).
  //        Firms mid-onboarding still get these — their cover can lapse before they sign.
  const chaseExpiry = !!signedAt || ['in_progress', 'awaiting_countersign', 'active', 'suspended'].includes(sub.status);
  if (chaseExpiry) {
    for (const d of currentDocs(activeDocs).filter((x) => x.expires_on)) {
      const until = daysUntil(d.expires_on as string);
      const key = `${d.id}|${d.expires_on}`;
      const siteCritical = d.category !== 'other';
      if (until >= 0 && until <= 30) {
        const band = [7, 14, 30].find((t) => until <= t)!;
        firm.push({
          kind: 'expiring',
          subjectKey: key,
          dueSteps: [band],
          urgent: until <= 7,
          text: `${docLabel(d)} expires on ${fmtDate(d.expires_on as string)} (in ${until} day${until === 1 ? '' : 's'}) — upload the renewal.`,
        });
      } else if (until < 0) {
        firm.push({
          kind: 'expired',
          subjectKey: key,
          dueSteps: due(-until, [0, 7, 14, 28]),
          urgent: siteCritical,
          text: siteCritical
            ? `${docLabel(d)} EXPIRED on ${fmtDate(d.expires_on as string)}. Anyone relying on it can't work on a Heliaxis site until the renewal is uploaded (clause 3A.2).`
            : `${docLabel(d)} expired on ${fmtDate(d.expires_on as string)} — upload the current version if you have one.`,
        });
        if (signedAt && siteCritical) {
          admin.push({
            kind: 'escalation',
            subjectKey: `expired:${key}`,
            steps: [0],
            text: `${sub.company_name}: ${docLabel(d)} expired on ${fmtDate(d.expires_on as string)}.`,
          });
        }
      }
    }
  }

  // 7. Jobs waiting for the firm to choose its crew.
  for (const j of jobs.filter((x) => x.status === 'awaiting_crew')) {
    const steps = due(daysSince(j.created_at), [1, 3]);
    const toStart = j.start_date ? daysUntil(j.start_date) : null;
    if (toStart !== null && toStart <= 3 && toStart >= 0) steps.push(1003);
    if (toStart !== null && toStart <= 1 && toStart >= 0) steps.push(1001);
    firm.push({
      kind: 'crew',
      subjectKey: j.id,
      dueSteps: steps,
      urgent: toStart !== null && toStart <= 3,
      text: `Choose who's going to ${j.rams_project_name}${j.start_date ? ` (starts ${fmtDate(j.start_date)})` : ''}, or let us know you can't do it.`,
    });
    if (toStart !== null && toStart <= 1 && toStart >= 0) {
      admin.push({
        kind: 'escalation',
        subjectKey: `crew:${j.id}`,
        steps: [1001],
        text: `${sub.company_name} still hasn't chosen a crew for ${j.rams_project_name}, which starts ${fmtDate(j.start_date as string)}.`,
      });
    }
  }

  // 8. NTP agreements waiting for the NTP's signature. Renewals are chased by the renewal job
  //    while the agreement they renew is in force; once that has lapsed they're chased here.
  for (const n of ntps.filter((x) => x.status === 'awaiting_signature')) {
    const lapsedRenewal = !!n.renewal_of && !activeNtpIds.has(n.renewal_of);
    if (n.renewal_of && !lapsedRenewal) continue;
    firm.push({
      kind: 'ntp_sign',
      subjectKey: lapsedRenewal ? `${n.id}:lapsed` : n.id,
      dueSteps: lapsedRenewal ? due(daysSince(n.created_at), [31, 38, 45, 59]) : due(daysSince(n.created_at), [3, 7, 14]),
      urgent: lapsedRenewal,
      ntpId: n.id,
      text: n.ntp_email
        ? `${n.ntp_name} still needs to sign${lapsedRenewal ? ' the renewal of' : ''} their NTP agreement ${n.ref}${lapsedRenewal ? ' — their previous one has expired' : ''}. We've emailed them a personal signing link; ask them to check their inbox, or ask us to resend it.`
        : `Sign the NTP agreement ${n.ref} for ${n.ntp_name} (NTP tab in the portal).`,
    });
  }
  // …and first-time NTP agreements waiting on us (renewal countersigning is chased by the renewal job).
  for (const n of ntps.filter((x) => x.status === 'awaiting_countersign' && x.sub_signed_at && !x.renewal_of)) {
    const steps = due(daysSince(n.sub_signed_at as string), [2, 7]);
    if (steps.length) {
      admin.push({ kind: 'countersign', subjectKey: `ntp:${n.id}`, steps, text: `NTP agreement ${n.ref} (${sub.company_name}) is waiting for your countersignature.` });
    }
  }

  return { firm, admin };
}

/** Read every row of a query, a page at a time — PostgREST caps a single response at 1000 rows. */
async function readAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

/** Load everything the rules need, for every firm or just one. */
export async function loadFirms(onlyId?: string): Promise<FirmData[]> {
  const db = createAdminClient();
  // A fresh query per page (builders aren't reusable), optionally scoped to one firm.
  type Filter = { col: string; op: 'eq' | 'neq' | 'in'; val: string | string[] };
  const rows = <T>(table: string, columns: string, extra?: Filter) =>
    readAll<T>((a, b) => {
      let q = db.from(table).select(columns);
      if (extra?.op === 'eq') q = q.eq(extra.col, extra.val as string);
      if (extra?.op === 'neq') q = q.neq(extra.col, extra.val as string);
      if (extra?.op === 'in') q = q.in(extra.col, extra.val as string[]);
      if (onlyId) q = q.eq(table === 'subcontractors' ? 'id' : 'subcontractor_id', onlyId);
      return q.order('id').range(a, b) as unknown as PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
    });

  const subs = await rows<SubcontractorRow & { reminders_paused?: boolean }>('subcontractors', `${SUB_COLUMNS}, reminders_paused`, {
    col: 'status',
    op: 'neq',
    val: 'terminated',
  });
  if (!subs.length) return [];

  type AgrLite = { subcontractor_id: string; sub_signed_at: string; hlx_signed_at: string | null; created_at: string };
  const [agrs, docs, ops, jobs, ntps] = await Promise.all([
    rows<AgrLite>('subcontractor_agreements', 'id, subcontractor_id, sub_signed_at, hlx_signed_at, created_at'),
    rows<DocumentRow>('subcontractor_documents', '*'),
    rows<OperativeRow>('subcontractor_operatives', '*'),
    rows<AssignmentRow>('subcontractor_assignments', '*', { col: 'status', op: 'eq', val: 'awaiting_crew' }),
    rows<NtpRow>('subcontractor_ntp_agreements', '*', { col: 'status', op: 'in', val: ['awaiting_signature', 'awaiting_countersign', 'active'] }),
  ]);

  const group = <T extends { subcontractor_id: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) m.set(r.subcontractor_id, [...(m.get(r.subcontractor_id) ?? []), r]);
    return m;
  };
  const [agrBy, docBy, opBy, jobBy, ntpBy] = [group(agrs), group(docs), group(ops), group(jobs), group(ntps)];

  return subs.map((sub) => {
    const framework = (agrBy.get(sub.id) ?? []).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const firmNtps = ntpBy.get(sub.id) ?? [];
    return {
      sub,
      framework: framework ? { sub_signed_at: framework.sub_signed_at, hlx_signed_at: framework.hlx_signed_at } : null,
      docs: docBy.get(sub.id) ?? [],
      ops: opBy.get(sub.id) ?? [],
      jobs: jobBy.get(sub.id) ?? [],
      ntps: firmNtps.filter((n) => n.status !== 'active'),
      activeNtpIds: new Set(firmNtps.filter((n) => n.status === 'active').map((n) => n.id)),
    };
  });
}

/** Every chase step already sent (new table + the previous expiry job's table). */
async function loadSent(onlyId?: string) {
  const db = createAdminClient();
  const page = <T>(table: string, columns: string) =>
    readAll<T>((a, b) => {
      let q = db.from(table).select(columns);
      if (onlyId) q = q.eq('subcontractor_id', onlyId);
      return q.order('id').range(a, b) as unknown as PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
    });
  const [nudges, legacy] = await Promise.all([
    page<{ kind: string; subject_key: string; step: number }>('subcontractor_nudges', 'id, kind, subject_key, step'),
    page<{ document_id: string; threshold_days: number; expires_on: string }>('subcontractor_reminders', 'id, document_id, threshold_days, expires_on'),
  ]);
  const sent = new Set(nudges.map((r) => `${r.kind}|${r.subject_key}|${r.step}`));
  for (const l of legacy) sent.add(`expiring|${l.document_id}|${l.expires_on}|${l.threshold_days}`);
  return sent;
}

const unsentSteps = (sent: Set<string>, kind: string, subjectKey: string, steps: number[]) =>
  steps.filter((s) => !sent.has(`${kind}|${subjectKey}|${s}`));

/**
 * Record steps BEFORE emailing, so a failed write can never cause a repeat send.
 * Returns the ids written (to undo if the email then fails), or null on failure.
 */
async function claim(rows: { subcontractor_id: string; kind: string; subject_key: string; step: number; sent_to: string }[]) {
  if (!rows.length) return [] as string[];
  const { data, error } = await createAdminClient()
    .from('subcontractor_nudges')
    .upsert(rows, { onConflict: 'kind,subject_key,step', ignoreDuplicates: true })
    .select('id');
  if (error) {
    console.error('[reminders] could not record steps', error.message);
    return null;
  }
  return (data ?? []).map((r) => r.id as string);
}
async function unclaim(ids: string[]) {
  if (ids.length) await createAdminClient().from('subcontractor_nudges').delete().in('id', ids);
}

function digestHtml(sub: SubcontractorRow, items: Chase[]) {
  const urgent = items.filter((i) => i.urgent);
  const rest = items.filter((i) => !i.urgent);
  const list = (xs: Chase[]) => `<ul style="padding-left:18px;margin:6px 0 14px">${xs.map((i) => `<li style="margin:0 0 8px">${esc(i.text)}</li>`).join('')}</ul>`;
  return emailShell(
    items.length === 1 ? 'One thing to do for Heliaxis' : `${items.length} things to do for Heliaxis`,
    `<p>Hi ${esc((sub.contact_name || '').split(' ')[0] || 'there')},</p>
     <p>Here's what's outstanding for ${esc(sub.company_name)} (${esc(sub.ref)}):</p>
     ${urgent.length ? `<p style="margin:14px 0 0;font-weight:700;color:#a3322a">Urgent</p>${list(urgent)}` : ''}
     ${rest.length ? `${urgent.length ? '<p style="margin:14px 0 0;font-weight:700">Also</p>' : ''}${list(rest)}` : ''}
     <p>Sign in with this email address and we'll send you a one-time code.</p>`,
    { href: `${portalBaseUrl()}/portal`, label: 'Open the portal' }
  );
}

function sendDigest(sub: SubcontractorRow, items: Chase[]) {
  const urgent = items.some((i) => i.urgent);
  return sendEmail({
    to: sub.email,
    subject: `${urgent ? 'Action needed: ' : 'Reminder: '}${items.length} thing${items.length === 1 ? '' : 's'} to do for Heliaxis`,
    html: digestHtml(sub, items),
    text: `Outstanding for ${sub.company_name}:\n${items.map((i) => `- ${i.text}`).join('\n')}\n\n${portalBaseUrl()}/portal`,
  });
}

/**
 * Remind one firm: record its newly-due steps, send any due NTP links first (so the
 * digest can say so truthfully), then the digest. `force` sends even if nothing is
 * newly due (admin "Send reminder now"). Returns null if nothing was sent.
 */
async function remindFirm(f: FirmData, sent: Set<string>, actor: string, force: boolean) {
  const { firm } = chasesFor(f);
  if (!firm.length) return { sent: false as const, reason: 'Nothing is outstanding for this subcontractor.' };
  const dueNow = firm
    .map((c) => ({ c, steps: unsentSteps(sent, c.kind, c.subjectKey, c.dueSteps) }))
    .filter((x) => x.steps.length);
  if (!dueNow.length && !force) return { sent: false as const, reason: 'nothing due' };

  const claimed = await claim(
    dueNow.flatMap(({ c, steps }) =>
      steps.map((step) => ({ subcontractor_id: f.sub.id, kind: c.kind, subject_key: c.subjectKey, step, sent_to: f.sub.email }))
    )
  );
  if (claimed === null) return { sent: false as const, reason: 'Could not record the reminder — not sent.' };

  // A due NTP chase goes to the NTP too, with a fresh link; say so only if it went.
  for (const { c } of dueNow.filter((x) => x.c.kind === 'ntp_sign' && x.c.ntpId)) {
    const ntp = f.ntps.find((n) => n.id === c.ntpId);
    if (!ntp?.ntp_email) continue;
    const r = await issueNtpSigningLink(ntp, f.sub, true);
    if (r.ok) c.text = `${ntp.ntp_name} still needs to sign their NTP agreement ${ntp.ref} — we've just emailed them a fresh signing link.`;
  }

  const r = await sendDigest(f.sub, firm);
  if (!r.ok) {
    await unclaim(claimed);
    return { sent: false as const, reason: r.error || 'Email failed' };
  }
  await logEvent(f.sub.id, actor, 'reminder_digest_sent', { items: firm.length, due: dueNow.map((x) => x.c.kind), manual: force || undefined });
  return { sent: true as const, items: firm.length };
}

/** Admin "Send reminder now": everything outstanding for one firm, now. Records due steps so tomorrow doesn't repeat it. */
export async function sendReminderNow(subId: string, actor: string) {
  const [f] = await loadFirms(subId);
  if (!f) return { ok: false as const, error: 'Not found' };
  const r = await remindFirm(f, await loadSent(subId), actor, true);
  return r.sent ? { ok: true as const, items: r.items } : { ok: false as const, error: r.reason };
}

/** Daily run (cron). Returns a summary for the cron heartbeat. */
export async function runReminders() {
  const started = Date.now();
  const firms = await loadFirms();
  const sent = await loadSent();

  let digests = 0;
  let failures = 0;
  let deferred = 0;
  const adminNotes: { subId: string; note: AdminNote; steps: number[] }[] = [];

  for (const f of firms) {
    const { admin } = chasesFor(f);
    for (const note of admin) {
      const steps = unsentSteps(sent, note.kind, note.subjectKey, note.steps);
      if (steps.length) adminNotes.push({ subId: f.sub.id, note, steps });
    }
    if (f.sub.reminders_paused) continue;
    // Leave headroom under the 60s function limit; anything left goes tomorrow (and is reported).
    if (Date.now() - started > 45_000) {
      deferred++;
      continue;
    }
    const r = await remindFirm(f, sent, 'system', false);
    if (r.sent) digests++;
    else if (r.reason !== 'nothing due' && r.reason !== 'Nothing is outstanding for this subcontractor.') failures++;
  }

  let adminSent = false;
  if (adminNotes.length) {
    const claimed = await claim(
      adminNotes.flatMap(({ subId, note, steps }) =>
        steps.map((step) => ({ subcontractor_id: subId, kind: note.kind, subject_key: note.subjectKey, step, sent_to: ADMIN_EMAIL() }))
      )
    );
    if (claimed !== null) {
      const res = await sendEmail({
        to: ADMIN_EMAIL(),
        subject: `Subcontractors: ${adminNotes.length} thing${adminNotes.length === 1 ? '' : 's'} need you`,
        html: emailShell(
          'Needs your attention',
          `<ul style="padding-left:18px">${adminNotes.map(({ note }) => `<li style="margin:0 0 8px">${esc(note.text)}</li>`).join('')}</ul>
           <p>${digests} subcontractor reminder email${digests === 1 ? '' : 's'} went out today.</p>`,
          { href: `${siteBaseUrl()}/admin/subcontractors`, label: 'Open subcontractors' },
          'Daily summary'
        ),
      });
      if (res.ok) adminSent = true;
      else await unclaim(claimed);
    }
  }

  return { firmsChecked: firms.length, digests, failures, deferred, adminNotes: adminNotes.length, adminSent };
}

/** Preview for the admin page: what the firm would be told today. */
export async function outstandingFor(subId: string) {
  const [f] = await loadFirms(subId);
  return f ? chasesFor(f).firm.map((c) => ({ kind: c.kind, text: c.text, urgent: !!c.urgent })) : [];
}

/** Has today's run happened? Shown on the subcontractors list. */
export async function lastReminderRun() {
  const { data, error } = await createAdminClient()
    .from('cron_runs')
    .select('ok, summary, ran_at')
    .eq('job', 'subcontractor-reminders')
    .order('ran_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { available: false as const };
  const run = data as { ok: boolean; summary: Record<string, unknown> | null; ran_at: string } | null;
  return { available: true as const, run, hoursAgo: run ? (Date.now() - new Date(run.ran_at).getTime()) / 3_600_000 : Infinity };
}
