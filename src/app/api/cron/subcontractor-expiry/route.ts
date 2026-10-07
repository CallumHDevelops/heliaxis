import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { CATEGORY_BY_KEY } from '@/lib/subcontractors/documents';
import { ADMIN_EMAIL, emailShell, esc, logEvent, portalBaseUrl, sendEmail, siteBaseUrl } from '@/lib/subcontractors/server';
import { createNtpAgreement } from '@/lib/subcontractors/ntp';
import { SUB_COLUMNS, type DocumentRow, type NtpRow, type SubcontractorRow } from '@/lib/subcontractors/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Chase at these points before expiry. Each (document, threshold, expiry date) is sent once. */
const THRESHOLDS = [30, 14, 7];

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

function daysUntil(date: string) {
  const end = new Date(`${date}T00:00:00Z`).getTime();
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime();
  return Math.round((end - today) / 86_400_000);
}

/**
 * Daily (Vercel cron, see vercel.json): email each subcontractor whose current
 * documents expire in 30 / 14 / 7 days, asking for a renewal (Cl. 3A.2), and send
 * Heliaxis one summary. A document that has already been replaced by a newer one
 * of the same kind for the same person isn't chased.
 */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ntp = await runNtpRenewals();
  const admin = createAdminClient();
  const horizon = new Date(Date.now() + 31 * 86_400_000).toISOString().slice(0, 10);

  const { data: subs } = await admin
    .from('subcontractors')
    .select('id, ref, company_name, contact_name, email')
    .in('status', ['active', 'awaiting_countersign', 'in_progress', 'suspended']);
  const subMap = new Map((subs ?? []).map((s) => [s.id as string, s]));
  if (!subMap.size) return NextResponse.json({ ok: true, sent: 0, ...ntp });

  const { data: docData } = await admin
    .from('subcontractor_documents')
    .select('*')
    .in('subcontractor_id', [...subMap.keys()])
    .neq('status', 'rejected')
    .not('expires_on', 'is', null);
  const docs = (docData ?? []) as DocumentRow[];

  // Newest document per (firm, category, person, description) — older ones are superseded.
  const key = (d: DocumentRow) =>
    `${d.subcontractor_id}|${d.category}|${d.operative_id || (d.operative_name || '').toLowerCase()}|${(d.label || '').toLowerCase()}`;
  const latest = new Map<string, DocumentRow>();
  for (const d of [...docs].sort((a, b) => a.uploaded_at.localeCompare(b.uploaded_at))) latest.set(key(d), d);

  const due = [...latest.values()]
    .filter((d) => d.expires_on! <= horizon)
    .map((d) => ({ doc: d, days: daysUntil(d.expires_on!) }))
    // The tightest band it falls in: 25 days → the 30-day chase, 10 → 14, 3 → 7. A missed
    // run still sends the right one, and never an earlier, looser one afterwards.
    .map((x) => ({ ...x, threshold: [...THRESHOLDS].sort((a, b) => a - b).find((t) => x.days <= t) }))
    .filter((x) => x.days >= 0 && x.threshold !== undefined);

  // Skip anything already chased at this threshold for this expiry date.
  const { data: sentRows } = due.length
    ? await admin
        .from('subcontractor_reminders')
        .select('document_id, threshold_days, expires_on')
        .in('document_id', due.map((x) => x.doc.id))
    : { data: [] };
  const sent = new Set((sentRows ?? []).map((r) => `${r.document_id}|${r.threshold_days}|${r.expires_on}`));
  const todo = due.filter((x) => !sent.has(`${x.doc.id}|${x.threshold}|${x.doc.expires_on}`));

  const bySub = new Map<string, typeof todo>();
  for (const x of todo) bySub.set(x.doc.subcontractor_id, [...(bySub.get(x.doc.subcontractor_id) ?? []), x]);

  const summary: string[] = [];
  for (const [subId, items] of bySub) {
    const sub = subMap.get(subId)!;
    const rows = items
      .sort((a, b) => a.days - b.days)
      .map(
        (x) =>
          `<li><strong>${esc(x.doc.label || CATEGORY_BY_KEY[x.doc.category]?.label || x.doc.file_name)}</strong>${
            x.doc.operative_name ? ` (${esc(x.doc.operative_name)})` : ''
          } — expires ${esc(new Date(`${x.doc.expires_on}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }))}, in ${x.days} day${x.days === 1 ? '' : 's'}</li>`
      )
      .join('');
    const soonest = Math.min(...items.map((x) => x.days));
    const res = await sendEmail({
      to: sub.email,
      subject: `${soonest <= 7 ? 'Urgent: ' : ''}Document${items.length > 1 ? 's' : ''} expiring soon — ${sub.company_name}`,
      html: emailShell(
        'Please upload a renewal',
        `<p>Hi ${esc(String(sub.contact_name).split(' ')[0])},</p>
         <p>The following ${items.length > 1 ? 'documents are' : 'document is'} about to expire:</p>
         <ul style="padding-left:18px">${rows}</ul>
         <p>Please upload the renewed ${items.length > 1 ? 'versions' : 'version'} in the portal. Under clause 3A.2 of your
         agreement, anyone whose qualification or cover has lapsed can't be put on a Heliaxis site.</p>`,
        { href: `${portalBaseUrl()}/portal`, label: 'Upload renewal' }
      ),
    });
    if (!res.ok) continue;
    await admin.from('subcontractor_reminders').insert(
      items.map((x) => ({
        subcontractor_id: subId,
        document_id: x.doc.id,
        threshold_days: x.threshold,
        expires_on: x.doc.expires_on,
        sent_to: sub.email,
      }))
    );
    await logEvent(subId, 'system', 'expiry_reminder_sent', { count: items.length, soonestDays: soonest });
    summary.push(`<li>${esc(sub.company_name)} (${esc(sub.ref)}): ${items.length} item(s), soonest in ${soonest} day(s)</li>`);
  }

  if (summary.length) {
    await sendEmail({
      to: ADMIN_EMAIL(),
      subject: `Subcontractor renewals chased: ${summary.length} firm(s)`,
      html: emailShell('Renewal reminders sent today', `<ul style="padding-left:18px">${summary.join('')}</ul>`),
    });
  }
  return NextResponse.json({ ok: true, firms: summary.length, items: todo.length, ...ntp });
}

/**
 * NTP agreements run 12 months and renew yearly:
 *  - 30 days before expiry the renewal is issued automatically (same terms) for signature;
 *  - unsigned / uncountersigned renewals are chased at 30 / 14 / 7 days (firm + Heliaxis);
 *  - on expiry the agreement is marked expired (or "renewed" if a renewal is in force).
 */
async function runNtpRenewals() {
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const { data } = await admin
    .from('subcontractor_ntp_agreements')
    .select('*')
    .in('status', ['active', 'awaiting_signature', 'awaiting_countersign']);
  const all = (data ?? []) as NtpRow[];
  const renewalOf = new Map(all.filter((n) => n.renewal_of).map((n) => [n.renewal_of!, n]));
  let issued = 0;
  let chased = 0;
  let expired = 0;

  for (const n of all.filter((x) => x.status === 'active' && x.expires_on)) {
    const renewal = renewalOf.get(n.id);

    if (n.expires_on! < today) {
      const live = renewal?.status === 'active';
      await admin.from('subcontractor_ntp_agreements').update({ status: live ? 'superseded' : 'expired' }).eq('id', n.id);
      if (!live) {
        await logEvent(n.subcontractor_id, 'system', 'ntp_expired', { ref: n.ref });
        await sendEmail({
          to: ADMIN_EMAIL(),
          subject: `NTP agreement expired: ${n.ref} (${n.ntp_name})`,
          html: emailShell(
            'NTP agreement expired',
            `<p>${esc(n.ntp_name)} is no longer Heliaxis's NTP for ${esc(n.technologies.join(', '))} (${esc(n.ref)} expired ${esc(n.expires_on!)}). Notify your Certification Body if no replacement is in place.</p>`
          ),
        });
        expired++;
      }
      continue;
    }
    if (n.expires_on! > horizon) continue;

    const { data: subData } = await admin.from('subcontractors').select(SUB_COLUMNS).eq('id', n.subcontractor_id).maybeSingle();
    const sub = subData as SubcontractorRow | null;
    if (!sub || sub.status !== 'active') continue;

    if (!renewal) {
      const r = await createNtpAgreement(
        sub,
        {
          technologies: n.technologies,
          operativeId: n.operative_id,
          ntpName: n.ntp_name,
          minDaysPerMonth: n.min_days_per_month,
          supervision: n.supervision || {},
          fee: n.fee,
        },
        'system (annual renewal)',
        n
      );
      if (r.ok) issued++;
      continue;
    }

    // Renewal exists but isn't in force yet — chase whoever it's waiting on.
    if (renewal.status === 'active') continue;
    const days = Math.round((new Date(`${n.expires_on}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86_400_000);
    const threshold = [7, 14, 30].find((t) => days <= t);
    if (threshold === undefined) continue;
    const { error: dup } = await admin.from('subcontractor_ntp_reminders').insert({ ntp_id: renewal.id, threshold_days: threshold });
    if (dup) continue; // already chased at this point
    const waitingOnUs = renewal.status === 'awaiting_countersign';
    await sendEmail({
      to: waitingOnUs ? ADMIN_EMAIL() : sub.email,
      subject: `${days <= 7 ? 'Urgent: ' : ''}NTP agreement ${n.ref} expires in ${days} day${days === 1 ? '' : 's'}`,
      html: emailShell(
        waitingOnUs ? 'NTP renewal needs countersigning' : 'Please sign your NTP renewal',
        waitingOnUs
          ? `<p>${esc(sub.company_name)} has signed renewal ${esc(renewal.ref)} for ${esc(n.ntp_name)}. Countersign before ${esc(n.expires_on!)} to avoid a gap.</p>`
          : `<p>Hi ${esc(sub.contact_name.split(' ')[0])},</p><p>${esc(n.ntp_name)}'s NTP agreement with Heliaxis ends on ${esc(n.expires_on!)}. The renewal (${esc(renewal.ref)}) is waiting for signature in the portal — without it, ${esc(n.ntp_name)} can't act as our NTP after that date.</p>`,
        waitingOnUs
          ? { href: `${siteBaseUrl()}/admin/subcontractors/${sub.id}`, label: 'Countersign renewal' }
          : { href: `${portalBaseUrl()}/portal`, label: 'Sign renewal' }
      ),
    });
    chased++;
  }
  return { ntpRenewalsIssued: issued, ntpChased: chased, ntpExpired: expired };
}
