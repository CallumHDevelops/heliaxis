import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { HELIAXIS_PARTY } from './agreement';
import { NTP_SECTIONS, NTP_TECHNOLOGIES, NTP_VERSION, type NtpSupervision } from './ntp-agreement';
import { emailShell, esc, logEvent, portalBaseUrl, sendEmail, sha256 } from './server';
import type { NtpRow, NtpSnapshot, SubcontractorRow } from './types';

export const NTP_COLUMNS = '*';

export function buildNtpSnapshot(
  sub: Pick<SubcontractorRow, 'ref' | 'company_name' | 'details'>,
  p: { ref: string; technologies: string[]; ntpName: string; minDaysPerMonth: number | null; supervision: NtpSupervision; fee: string | null }
): NtpSnapshot {
  return {
    version: NTP_VERSION,
    ref: p.ref,
    frameworkRef: sub.ref,
    companyName: sub.details?.legalName || sub.company_name,
    ntpName: p.ntpName,
    technologies: p.technologies.map((k) => ({ key: k, ...NTP_TECHNOLOGIES[k] })),
    minDaysPerMonth: p.minDaysPerMonth,
    supervision: p.supervision,
    fee: p.fee,
    heliaxis: HELIAXIS_PARTY,
    sections: NTP_SECTIONS,
  };
}

export function ntpHash(s: NtpSnapshot) {
  return sha256(JSON.stringify(s));
}

async function nextNtpRef() {
  const prefix = `HLX-NTP-${new Date().getFullYear()}-`;
  const { data } = await createAdminClient()
    .from('subcontractor_ntp_agreements')
    .select('ref')
    .like('ref', `${prefix}%`)
    .order('ref', { ascending: false })
    .limit(1);
  const last = data?.[0]?.ref ? parseInt(String(data[0].ref).slice(prefix.length), 10) : 0;
  return `${prefix}${String((Number.isFinite(last) ? last : 0) + 1).padStart(3, '0')}`;
}

export type NtpRequest = {
  technologies: string[];
  operativeId: string | null;
  ntpName: string;
  minDaysPerMonth: number | null;
  supervision: NtpSupervision;
  fee: string | null;
};

/** Create an NTP agreement awaiting the subcontractor's signature, and email them. */
export async function createNtpAgreement(
  sub: SubcontractorRow,
  req: NtpRequest,
  actor: string,
  renewalOf: NtpRow | null = null
): Promise<{ ok: true; ntp: NtpRow } | { ok: false; error: string }> {
  const techs = [...new Set(req.technologies)].filter((k) => NTP_TECHNOLOGIES[k]);
  if (!techs.length) return { ok: false, error: 'Choose at least one technology.' };
  if (req.ntpName.trim().length < 2) return { ok: false, error: 'Name the NTP.' };

  const admin = createAdminClient();
  for (let i = 0; i < 3; i++) {
    const ref = await nextNtpRef();
    const snapshot = buildNtpSnapshot(sub, {
      ref,
      technologies: techs,
      ntpName: req.ntpName.trim(),
      minDaysPerMonth: req.minDaysPerMonth,
      supervision: req.supervision,
      fee: req.fee,
    });
    const { data, error } = await admin
      .from('subcontractor_ntp_agreements')
      .insert({
        subcontractor_id: sub.id,
        ref,
        technologies: techs,
        operative_id: req.operativeId,
        ntp_name: req.ntpName.trim(),
        min_days_per_month: req.minDaysPerMonth,
        supervision: req.supervision,
        fee: req.fee,
        renewal_of: renewalOf?.id ?? null,
        snapshot,
        content_hash: ntpHash(snapshot),
        requested_by: actor,
      })
      .select('*')
      .single();
    if (data) {
      const ntp = data as NtpRow;
      await logEvent(sub.id, actor, renewalOf ? 'ntp_renewal_sent' : 'ntp_sent', { ref, technologies: techs });
      const techList = techs.map((k) => NTP_TECHNOLOGIES[k].label).join(', ');
      await sendEmail({
        to: sub.email,
        subject: `${renewalOf ? 'Renew your' : 'Please sign the'} Heliaxis NTP agreement (${ref})`,
        html: emailShell(
          renewalOf ? 'Time to renew your NTP agreement' : 'NTP agreement to sign',
          `<p>Hi ${esc(sub.contact_name.split(' ')[0])},</p>
           <p>${renewalOf ? `The NTP agreement for ${esc(ntp.ntp_name)} expires on ${esc(renewalOf.expires_on || '')}. A renewal` : 'An agreement'} appointing <strong>${esc(ntp.ntp_name)}</strong> as Heliaxis's Nominated Technical Person for <strong>${esc(techList)}</strong> is ready to sign.</p>
           <p>Please sign in to the portal, read it and sign. It runs for 12 months from when Heliaxis countersigns.</p>`,
          { href: `${portalBaseUrl()}/portal`, label: 'Review and sign' }
        ),
      });
      return { ok: true, ntp };
    }
    if (error && error.code !== '23505') return { ok: false, error: error.message };
  }
  return { ok: false, error: 'Could not allocate a reference — try again.' };
}

/** Requests from the form, normalised. */
export function parseNtpRequest(input: Record<string, unknown>): NtpRequest {
  const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const sup = (input.supervision || {}) as Record<string, unknown>;
  const days = Number(input.minDaysPerMonth);
  return {
    technologies: Array.isArray(input.technologies) ? input.technologies.map((t) => str(t, 20)) : [],
    operativeId: str(input.operativeId, 40) || null,
    ntpName: str(input.ntpName, 120),
    minDaysPerMonth: Number.isFinite(days) && days > 0 ? Math.min(days, 31) : null,
    supervision: {
      geography: str(sup.geography, 300) || undefined,
      installsPerMonth: str(sup.installsPerMonth, 60) || undefined,
      typicalDuration: str(sup.typicalDuration, 120) || undefined,
      installersToSupervise: str(sup.installersToSupervise, 60) || undefined,
      notes: str(sup.notes, 1000) || undefined,
    },
    fee: str(input.fee, 200) || null,
  };
}
