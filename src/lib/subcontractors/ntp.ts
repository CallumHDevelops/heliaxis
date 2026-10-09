import 'server-only';
import { randomBytes } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { HELIAXIS_PARTY } from './agreement';
import { NTP_SECTIONS, NTP_TECHNOLOGIES, NTP_VERSION, type NtpSupervision } from './ntp-agreement';
import { ADMIN_EMAIL, emailShell, esc, logEvent, portalBaseUrl, sendEmail, sha256, siteBaseUrl, validSignature } from './server';
import type { NtpRow, NtpSnapshot, SubcontractorRow } from './types';

export const NTP_COLUMNS = '*';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  /** The NTP's own email — they get a personal signing link. Falls back to the firm contact. */
  ntpEmail: string | null;
  /** Something was typed in the email box but it isn't an email address. */
  ntpEmailInvalid?: boolean;
  minDaysPerMonth: number | null;
  supervision: NtpSupervision;
  fee: string | null;
};

/** Create an NTP agreement awaiting the subcontractor's signature, and email them. */
export async function createNtpAgreement(
  sub: SubcontractorRow,
  reqIn: NtpRequest,
  actor: string,
  renewalOf: NtpRow | null = null
): Promise<{ ok: true; ntp: NtpRow; warning?: string } | { ok: false; error: string }> {
  let req = reqIn;
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
        ...(req.ntpEmail ? { ntp_email: req.ntpEmail } : {}),
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
      let warning: string | undefined;
      if (req.ntpEmail) {
        // The NTP signs personally from their own link; the firm is told it's gone (if it went).
        const link = await issueNtpSigningLink(ntp, sub);
        await logEvent(sub.id, actor, 'ntp_link_sent', { ref, to: req.ntpEmail, delivered: link.ok });
        if (!link.ok) warning = `Agreement ${ref} created, but the email to ${req.ntpEmail} failed (${link.error}). Use "Resend link".`;
        if (link.ok && req.ntpEmail.toLowerCase() !== sub.email.toLowerCase()) {
          await sendEmail({
            to: sub.email,
            subject: `NTP agreement sent to ${ntp.ntp_name} (${ref})`,
            html: emailShell(
              renewalOf ? 'NTP renewal sent' : 'NTP agreement sent',
              `<p>Hi ${esc(sub.contact_name.split(' ')[0])},</p>
               <p>We've emailed <strong>${esc(ntp.ntp_name)}</strong> an agreement appointing them as Heliaxis's Nominated Technical Person for <strong>${esc(techList)}</strong>${renewalOf ? ' (annual renewal)' : ''}. They sign it from the link in that email. You can see its progress in the portal's NTP tab.</p>`,
              { href: `${portalBaseUrl()}/portal`, label: 'Open the portal' }
            ),
          });
        }
      } else {
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
      }
      return { ok: true, ntp, warning };
    }
    // Before supabase/reminders.sql there's no ntp_email column: fall back to the firm-portal flow.
    if (error && req.ntpEmail && (error.code === 'PGRST204' || /ntp_email/.test(error.message))) {
      req = { ...req, ntpEmail: null };
      continue;
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
    ntpEmail: EMAIL_RE.test(str(input.ntpEmail, 160)) ? str(input.ntpEmail, 160).toLowerCase() : null,
    ntpEmailInvalid: str(input.ntpEmail, 160) !== '' && !EMAIL_RE.test(str(input.ntpEmail, 160)),
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

// ---------------------------------------------------------------- personal signing links

export const NTP_LINK_DAYS = 14;

/**
 * Email the named NTP a personal link to read and sign their agreement. Each call
 * issues a fresh link (the previous one stops working); only its hash is stored.
 */
export async function issueNtpSigningLink(
  ntp: NtpRow,
  sub: Pick<SubcontractorRow, 'company_name'>,
  reminder = false
): Promise<{ ok: true } | { ok: false; error: string }> {
  const to = ntp.ntp_email;
  if (!to) return { ok: false, error: 'No email address for the NTP.' };
  const db = createAdminClient();
  // Keep the current link so a failed send can put it back rather than leave the NTP with nothing.
  const { data: prev, error: readErr } = await db
    .from('subcontractor_ntp_agreements')
    .select('sign_token_hash, sign_token_created_at')
    .eq('id', ntp.id)
    .maybeSingle();
  if (readErr) return { ok: false, error: 'Signing links are not set up yet (run supabase/reminders.sql).' };

  const token = randomBytes(32).toString('base64url');
  const hash = sha256(token);
  const { error: rotErr } = await db
    .from('subcontractor_ntp_agreements')
    .update({ sign_token_hash: hash, sign_token_created_at: new Date().toISOString() })
    .eq('id', ntp.id);
  if (rotErr) return { ok: false, error: rotErr.message };

  const techList = ntp.technologies.map((k) => NTP_TECHNOLOGIES[k]?.label ?? k).join(', ');
  const link = `${portalBaseUrl()}/portal/ntp-sign/${token}`;
  const sent = await sendEmail({
    to,
    subject: `${reminder ? 'Reminder: please sign' : 'Please sign'} your Heliaxis NTP agreement (${ntp.ref})`,
    html: emailShell(
      'Your NTP agreement',
      `<p>Hi ${esc(ntp.ntp_name.split(' ')[0])},</p>
       <p>Heliaxis would like to appoint you, through ${esc(sub.company_name)}, as its <strong>Nominated Technical Person</strong> for <strong>${esc(techList)}</strong> under its MCS certification.</p>
       <p>Please read the agreement and sign it from the link below. It takes a few minutes and works on your phone. The link is personal to you, works for ${NTP_LINK_DAYS} days, and replaces any earlier link we've sent you.</p>`,
      { href: link, label: 'Read and sign' },
      'NTP agreement'
    ),
  });
  if (!sent.ok) {
    await db
      .from('subcontractor_ntp_agreements')
      .update({ sign_token_hash: prev?.sign_token_hash ?? null, sign_token_created_at: prev?.sign_token_created_at ?? null })
      .eq('id', ntp.id)
      .eq('sign_token_hash', hash);
    return { ok: false, error: sent.error || 'Email failed' };
  }
  return { ok: true };
}

/** Resolve a personal signing link: unexpired, and the agreement still waiting for signature. */
export async function findNtpBySigningToken(token: string | null | undefined) {
  if (!token || token.length < 30 || token.length > 100) return null;
  const { data } = await createAdminClient()
    .from('subcontractor_ntp_agreements')
    .select('*')
    .eq('sign_token_hash', sha256(token))
    .maybeSingle();
  const ntp = data as (NtpRow & { sign_token_created_at?: string | null }) | null;
  if (!ntp || ntp.status !== 'awaiting_signature') return null;
  const issued = ntp.sign_token_created_at ? new Date(ntp.sign_token_created_at).getTime() : 0;
  if (Date.now() - issued > NTP_LINK_DAYS * 86_400_000) return null;
  return ntp;
}

// ---------------------------------------------------------------- recording a signature

/**
 * Record the NTP's signature (from the firm's portal or the NTP's personal link).
 * Checks consent, name, drawn signature and that the text is exactly what was
 * issued; the status guard means a second submission can't overwrite the first.
 */
export async function recordNtpSignature(
  ntp: NtpRow,
  sub: Pick<SubcontractorRow, 'id' | 'company_name' | 'email'>,
  body: { name?: unknown; title?: unknown; signature?: unknown; agree?: unknown; hash?: unknown },
  meta: { ip: string | null; userAgent: string | null; origin: string; via: 'portal' | 'personal link' }
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  if (ntp.status !== 'awaiting_signature') return { ok: false, error: 'This agreement is not waiting for a signature.', status: 409 };
  if (meta.via === 'portal' && signsByLink(ntp)) {
    return { ok: false, error: `${ntp.ntp_name} signs this themselves, from the personal link we emailed them.`, status: 409 };
  }
  if (body.agree !== true) return { ok: false, error: 'Please confirm you have read and agree to the agreement.', status: 400 };
  const name = str(body.name, 120);
  if (name.length < 2) return { ok: false, error: 'Please type your full name.', status: 400 };
  if (!validSignature(body.signature)) return { ok: false, error: 'Please draw your signature.', status: 400 };
  if (body.hash !== ntp.content_hash || ntpHash(ntp.snapshot) !== ntp.content_hash) {
    return { ok: false, error: 'The agreement has changed since you opened it. Please reload and review it again.', status: 409 };
  }

  const { data: updated, error: updateErr } = await createAdminClient()
    .from('subcontractor_ntp_agreements')
    .update({
      status: 'awaiting_countersign',
      sub_name: name,
      sub_title: str(body.title, 120) || null,
      sub_signature: body.signature,
      sub_signed_at: new Date().toISOString(),
      sub_ip: meta.ip,
      sub_user_agent: meta.userAgent?.slice(0, 400) || null,
      // A personal link is single-use (column exists once supabase/reminders.sql has run).
      ...('sign_token_hash' in ntp ? { sign_token_hash: null } : {}),
    })
    .eq('id', ntp.id)
    .eq('status', 'awaiting_signature')
    .select('id');
  if (updateErr) return { ok: false, error: 'Could not record the signature — please try again.', status: 500 };
  if (!updated?.length) return { ok: false, error: 'This agreement has already been signed.', status: 409 };

  await logEvent(sub.id, meta.via === 'portal' ? 'subcontractor' : `ntp:${ntp.ntp_name}`, 'ntp_signed', { ref: ntp.ref, name, via: meta.via }, meta.ip);
  await sendEmail({
    to: ADMIN_EMAIL(),
    replyTo: ntp.ntp_email || sub.email,
    subject: `Signed: NTP agreement ${ntp.ref} (${sub.company_name}) needs countersigning`,
    html: emailShell(
      'NTP agreement signed',
      `<p><strong>${esc(name)}</strong> signed NTP agreement <strong>${esc(ntp.ref)}</strong> for ${esc(sub.company_name)} (via ${esc(meta.via)}).</p>`,
      { href: `${siteBaseUrl(meta.origin)}/admin/subcontractors/${sub.id}`, label: 'Countersign' }
    ),
  });
  return { ok: true };
}

/** True when the agreement went to the NTP personally (someone other than the firm contact). */
export function signsByLink(ntp: Pick<NtpRow, 'ntp_email'>) {
  // Any agreement issued with a personal link is signed only from that link — even if the
  // address happens to be the firm contact's (it then just arrives in their inbox).
  return !!ntp.ntp_email;
}

export function isEmail(v: string | null | undefined): v is string {
  return !!v && EMAIL_RE.test(v.trim());
}
