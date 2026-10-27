import 'server-only';
import { createHash, randomBytes } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { getResendApiKey } from '@/lib/resend';
import { brandEmail, emailShell, esc } from '@/lib/email-brand';

export { emailShell, esc };
import {
  AGREEMENT_VERSION,
  DEFAULT_RATES,
  HELIAXIS_PARTY,
  SCHEDULE_A_FIELDS,
  SECTIONS,
} from './agreement';
import { ALLOWED_MIME, MAX_FILE_BYTES } from './documents';
import { agreementFingerprint } from './hashing';
import { FRESH_LINK_MESSAGE } from './messages';
import { SUB_COLUMNS, type AgreementSnapshot, type SubcontractorRow } from './types';

export const DOCS_BUCKET = process.env.SUBCONTRACTOR_DOCS_BUCKET || 'subcontractor-docs';
export const PORTAL_PATH = '/portal';

// ---------- magic-link tokens ----------

export function sha256(s: string) {
  return createHash('sha256').update(s).digest('hex');
}

/** A fresh 256-bit link token. Only its hash is stored. */
export function newToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: sha256(token) };
}

/**
 * Resolve an emailed invite link. Links are single-purpose bearer secrets, so they
 * expire after 14 days; afterwards the subcontractor signs in with an email code.
 */
export async function findByToken(token: string | null | undefined) {
  if (!token || token.length < 30 || token.length > 100) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from('subcontractors')
    .select(`${SUB_COLUMNS}, token_created_at`)
    .eq('token_hash', sha256(token))
    .maybeSingle();
  const row = data as (SubcontractorRow & { token_created_at: string | null }) | null;
  if (!row) return null;
  const issued = row.token_created_at ? new Date(row.token_created_at).getTime() : 0;
  if (Date.now() - issued > 14 * 86_400_000) return null;
  return row as SubcontractorRow;
}

/** Public URL of the portal. Production uses the subdomain; previews/local use the current origin. */
export function portalBaseUrl(origin?: string | null) {
  if (process.env.SUBCONTRACTOR_PORTAL_URL) return process.env.SUBCONTRACTOR_PORTAL_URL.replace(/\/$/, '');
  if (process.env.VERCEL_ENV === 'production') return 'https://subcontractor.heliaxis.co.uk';
  return (origin || 'http://localhost:3000').replace(/\/$/, '');
}

/** Main-site URL (for admin links in emails — the portal subdomain only serves /portal). */
export function siteBaseUrl(origin?: string | null) {
  if (process.env.VERCEL_ENV === 'production') return 'https://heliaxis.co.uk';
  return (origin || 'http://localhost:3000').replace(/\/$/, '');
}

export function validSignature(sig: unknown): sig is string {
  return typeof sig === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(sig) && sig.length < 300_000;
}

export function portalLink(token: string, origin?: string | null) {
  return `${portalBaseUrl(origin)}${PORTAL_PATH}/${token}`;
}

/** Next ref in the HLX-SC-[YEAR]-[NUMBER] series from the agreement. */
export async function nextRef() {
  const year = new Date().getFullYear();
  const prefix = `HLX-SC-${year}-`;
  const admin = createAdminClient();
  const { data } = await admin
    .from('subcontractors')
    .select('ref')
    .like('ref', `${prefix}%`)
    .order('ref', { ascending: false })
    .limit(1);
  const last = data?.[0]?.ref ? parseInt(String(data[0].ref).slice(prefix.length), 10) : 0;
  return `${prefix}${String((Number.isFinite(last) ? last : 0) + 1).padStart(3, '0')}`;
}

export function clientIp(headers: Headers) {
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip') ||
    null
  );
}

export async function logEvent(
  subId: string,
  actor: string,
  type: string,
  detail?: Record<string, unknown> | null,
  ip?: string | null
) {
  const admin = createAdminClient();
  await admin
    .from('subcontractor_events')
    .insert({ subcontractor_id: subId, actor, type, detail: detail ?? null, ip: ip ?? null });
}

// ---------- agreement integrity ----------

export function buildSnapshot(sub: SubcontractorRow): AgreementSnapshot {
  return {
    version: AGREEMENT_VERSION,
    ref: sub.ref,
    companyName: sub.company_name,
    contactName: sub.contact_name,
    trade: sub.trade || '',
    rateOption: sub.rate_option,
    bespokeRates: sub.rate_option === 'bespoke' ? sub.bespoke_rates || [] : [],
    defaultRates: DEFAULT_RATES,
    details: sub.details || {},
    heliaxis: HELIAXIS_PARTY,
    sections: SECTIONS,
    scheduleA: SCHEDULE_A_FIELDS,
  };
}

/** Fingerprint for a new signature — canonical JSON, so it survives the jsonb round trip (see hashing.ts). */
export function agreementHash(snapshot: AgreementSnapshot) {
  return agreementFingerprint(snapshot);
}

// ---------- storage ----------

export async function ensureDocsBucket() {
  const admin = createAdminClient();
  const { data } = await admin.storage.getBucket(DOCS_BUCKET);
  if (data) return;
  await admin.storage.createBucket(DOCS_BUCKET, {
    public: false,
    fileSizeLimit: MAX_FILE_BYTES,
    allowedMimeTypes: ALLOWED_MIME,
  });
}

export async function signedDocUrl(path: string, download?: string) {
  const admin = createAdminClient();
  const { data } = await admin.storage
    .from(DOCS_BUCKET)
    .createSignedUrl(path, 120, download ? { download } : undefined);
  return data?.signedUrl ?? null;
}

// ---------- email ----------

export const ADMIN_EMAIL = () => process.env.ADMIN_EMAIL || 'callum@heliaxis.co.uk';

/** A file sent with an email: its name and bytes (sent to Resend as base64). */
export type EmailAttachment = { filename: string; content: Uint8Array | Buffer; contentType?: string };

/**
 * Send through Resend. `attachments`: files to go with it (a PO's PDF). `idempotencyKey`: the same
 * key within 24 hours sends once, however often it's retried (Resend's Idempotency-Key header), so a
 * sign-off retried from a phone with flaky signal never emails twice. Replies with Resend's id.
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  from?: string;
  text?: string;
  attachments?: EmailAttachment[];
  idempotencyKey?: string;
}): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  const key = getResendApiKey();
  if (!key) {
    console.warn('[subcontractors] RESEND_API_KEY missing — email not sent:', opts.subject);
    return { ok: false, error: 'Email is not configured (RESEND_API_KEY missing).' };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      ...(opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey.slice(0, 256) } : {}),
    },
    body: JSON.stringify({
      from: opts.from || 'Heliaxis Subcontractors <noreply@heliaxis.co.uk>',
      to: [opts.to],
      subject: opts.subject,
      // Whatever a caller hands in comes out in the Heliaxis template (already-branded mail is left alone).
      html: brandEmail({ subject: opts.subject, html: opts.html, text: opts.text }),
      text: opts.text,
      reply_to: opts.replyTo,
      ...(opts.attachments?.length
        ? {
            attachments: opts.attachments.map((a) => ({
              filename: a.filename,
              content: Buffer.from(a.content).toString('base64'),
              ...(a.contentType ? { content_type: a.contentType } : {}),
            })),
          }
        : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error('[subcontractors] email failed', body);
    return { ok: false, error: (body as { message?: string }).message || `Resend error ${res.status}` };
  }
  const body = (await res.json().catch(() => ({}))) as { id?: string };
  return { ok: true as const, id: body.id ?? null };
}

export function inviteEmail(sub: SubcontractorRow, link: string, reminder = false) {
  return {
    to: sub.email,
    subject: reminder
      ? `Reminder: complete your Heliaxis subcontractor onboarding (${sub.ref})`
      : `Heliaxis subcontractor agreement — ${sub.company_name}`,
    html: emailShell(
      reminder ? 'Your onboarding is waiting' : 'Welcome to the Heliaxis subcontractor network',
      `<p>Hi ${esc(sub.contact_name.split(' ')[0])},</p>
       <p>We'd like to set ${esc(sub.company_name)} up as a Heliaxis subcontractor. Your secure onboarding link lets you:</p>
       <ol style="padding-left:20px;margin:0 0 12px">
         <li>Confirm your company, CIS and payment details</li>
         <li>Read and sign our Subcontractor Framework Agreement (ref ${esc(sub.ref)})</li>
         <li>Upload photo ID, qualifications, cards and insurance certificates</li>
       </ol>
       <p>It takes about 10 minutes. This link works for 14 days; after that, or any time later, sign in at the portal with this email address and we will email you a one-time code.</p>`,
      { href: link, label: 'Start onboarding' }
    ),
  };
}

/** One-off apology + fresh personal link (see messages.ts for the wording). */
export function freshLinkEmail(sub: SubcontractorRow, link: string) {
  const m = FRESH_LINK_MESSAGE;
  return {
    to: sub.email,
    subject: m.subject,
    html: emailShell(
      m.title,
      `<p>Hi ${esc((sub.contact_name || '').split(' ')[0] || 'there')},</p>${m.paragraphs.map((t) => `<p>${esc(t)}</p>`).join('')}
       <p>The Heliaxis team</p>`,
      { href: link, label: m.button }
    ),
  };
}
