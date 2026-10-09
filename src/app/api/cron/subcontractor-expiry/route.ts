import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ADMIN_EMAIL, emailShell, esc, logEvent, portalBaseUrl, sendEmail, siteBaseUrl } from '@/lib/subcontractors/server';
import { createNtpAgreement, isEmail, issueNtpSigningLink } from '@/lib/subcontractors/ntp';
import { runReminders } from '@/lib/subcontractors/reminders';
import type { NtpRow, SubcontractorRow } from '@/lib/subcontractors/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

/**
 * Daily (Vercel cron, see vercel.json):
 *  1. NTP agreements: issue annual renewals, chase them, expire lapsed ones.
 *  2. Subcontractor reminders: one digest per firm with everything outstanding
 *     (onboarding, missing / rejected / expiring / expired documents, crews to
 *     choose, NTP agreements to sign) and one summary for Heliaxis.
 * Each run writes a heartbeat to cron_runs so admin can see it's working.
 */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = createAdminClient();
  const result: Record<string, unknown> = {};
  let ok = true;
  for (const [name, job] of [
    ['ntp', runNtpRenewals],
    ['reminders', runReminders],
  ] as const) {
    try {
      result[name] = await job();
    } catch (e) {
      ok = false;
      result[name] = { error: e instanceof Error ? e.message : String(e) };
      console.error(`[cron] ${name}`, e);
    }
  }
  await db.from('cron_runs').insert({ job: 'subcontractor-reminders', ok, summary: result });
  return NextResponse.json({ ok, ...result }, { status: ok ? 200 : 500 });
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
  const warnings: string[] = [];

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

    const { data: subData } = await admin.from('subcontractors').select('*').eq('id', n.subcontractor_id).maybeSingle();
    const sub = subData as (SubcontractorRow & { reminders_paused?: boolean }) | null;
    if (!sub || sub.status !== 'active') continue;

    const days = Math.round((new Date(`${n.expires_on}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86_400_000);
    const threshold = [7, 14, 30].find((t) => days <= t);

    if (!renewal) {
      // Renew to the same person only if they're still on the firm's team (with their current
      // email); if they've left, the renewal goes to the firm contact to sort out.
      let ntpEmail: string | null = n.ntp_email ?? null;
      if (n.operative_id) {
        const { data: op } = await admin
          .from('subcontractor_operatives')
          .select('email, archived_at')
          .eq('id', n.operative_id)
          .eq('subcontractor_id', n.subcontractor_id)
          .maybeSingle();
        const onTeam = !!op && !op.archived_at;
        ntpEmail = onTeam ? (isEmail(op?.email) ? String(op?.email).trim().toLowerCase() : ntpEmail) : null;
        if (!onTeam) await logEvent(n.subcontractor_id, 'system', 'ntp_renewal_to_firm', { ref: n.ref, reason: `${n.ntp_name} is no longer on the team` });
      }
      const r = await createNtpAgreement(
        sub,
        {
          technologies: n.technologies,
          operativeId: n.operative_id,
          ntpName: n.ntp_name,
          ntpEmail,
          minDaysPerMonth: n.min_days_per_month,
          supervision: n.supervision || {},
          fee: n.fee,
        },
        'system (annual renewal)',
        n
      );
      if (r.ok) {
        issued++;
        if (r.warning) {
          // The link didn't go — leave the band open so tomorrow's chase retries it.
          warnings.push(r.warning);
          console.error('[cron] ntp renewal', r.warning);
        } else if (threshold !== undefined) {
          // Issuing it is this band's chase — don't chase (and rotate the link) tomorrow.
          await admin.from('subcontractor_ntp_reminders').insert({ ntp_id: r.ntp.id, threshold_days: threshold });
        }
      } else {
        warnings.push(`${n.ref}: renewal could not be issued (${r.error})`);
        await logEvent(n.subcontractor_id, 'system', 'ntp_renewal_failed', { ref: n.ref, error: r.error });
      }
      continue;
    }

    // Renewal exists but isn't in force yet — chase whoever it's waiting on.
    if (renewal.status === 'active') continue;
    if (threshold === undefined) continue;
    const waitingOnUs = renewal.status === 'awaiting_countersign';
    // Paused firms aren't chased; the band isn't used up, so it fires once they're resumed.
    if (!waitingOnUs && sub.reminders_paused) continue;
    const { error: dup } = await admin.from('subcontractor_ntp_reminders').insert({ ntp_id: renewal.id, threshold_days: threshold });
    if (dup) continue; // already chased at this point

    // The NTP signs from their own link, so chase them directly first — fresh link — but only
    // while they're still on the firm's team. The firm's email then says what actually happened.
    let linkSent = false;
    if (!waitingOnUs && renewal.ntp_email) {
      const { data: op } = renewal.operative_id
        ? await admin.from('subcontractor_operatives').select('archived_at').eq('id', renewal.operative_id).maybeSingle()
        : { data: null };
      const onTeam = !renewal.operative_id || (!!op && !op.archived_at);
      if (onTeam) {
        const l = await issueNtpSigningLink(renewal, sub, true);
        await logEvent(sub.id, 'system', 'ntp_link_sent', { ref: renewal.ref, to: renewal.ntp_email, delivered: l.ok });
        if (l.ok) linkSent = true;
        else {
          warnings.push(`${renewal.ref}: signing link to ${renewal.ntp_email} failed (${l.error})`);
          // Not chased after all — let tomorrow's run try again.
          await admin.from('subcontractor_ntp_reminders').delete().eq('ntp_id', renewal.id).eq('threshold_days', threshold);
          continue;
        }
      }
    }
    await sendEmail({
      to: waitingOnUs ? ADMIN_EMAIL() : sub.email,
      subject: `${days <= 7 ? 'Urgent: ' : ''}NTP agreement ${n.ref} expires in ${days} day${days === 1 ? '' : 's'}`,
      html: emailShell(
        waitingOnUs ? 'NTP renewal needs countersigning' : 'Please sign your NTP renewal',
        waitingOnUs
          ? `<p>${esc(sub.company_name)} has signed renewal ${esc(renewal.ref)} for ${esc(n.ntp_name)}. Countersign before ${esc(n.expires_on!)} to avoid a gap.</p>`
          : `<p>Hi ${esc((sub.contact_name || '').split(' ')[0] || 'there')},</p><p>${esc(n.ntp_name)}'s NTP agreement with Heliaxis ends on ${esc(n.expires_on!)}. The renewal (${esc(renewal.ref)}) is waiting for ${linkSent ? `${esc(n.ntp_name)} to sign — we've just emailed them a fresh signing link` : 'signature in the portal'} — without it, ${esc(n.ntp_name)} can't act as our NTP after that date.</p>`,
        waitingOnUs
          ? { href: `${siteBaseUrl()}/admin/subcontractors/${sub.id}`, label: 'Countersign renewal' }
          : { href: `${portalBaseUrl()}/portal`, label: 'Sign renewal' }
      ),
    });
    chased++;
  }
  return { ntpRenewalsIssued: issued, ntpChased: chased, ntpExpired: expired, warnings };
}
