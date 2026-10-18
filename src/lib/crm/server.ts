import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePortal } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { guessProducts, portalOpen, type StageKey } from './stages';

/** CRM server helpers: access, the photo bucket, activity logging. */

export const CRM_BUCKET = 'crm-photos';
export const PHOTO_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;

export const NO_STORE = { 'Cache-Control': 'no-store' };
export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
export const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

export async function crmSession() {
  return requirePortal('crm');
}

let bucketReady = false;
export async function ensureCrmBucket() {
  if (bucketReady) return;
  const admin = createAdminClient();
  const { data } = await admin.storage.getBucket(CRM_BUCKET);
  if (!data) {
    await admin.storage.createBucket(CRM_BUCKET, { public: false, fileSizeLimit: MAX_PHOTO_BYTES, allowedMimeTypes: PHOTO_MIME });
  }
  bucketReady = true;
}

/** Each photo has a small copy beside it for grids (made on the phone before upload). */
export const thumbPath = (path: string) => path.replace(/\.[a-z0-9]+$/i, '') + '.thumb.jpg';

export async function logActivity(a: {
  enquiryId: string;
  projectId?: string | null;
  kind: 'note' | 'call' | 'visit' | 'email' | 'stage' | 'photo' | 'system';
  body?: string | null;
  meta?: Record<string, unknown> | null;
  byId?: string | null;
}) {
  await createAdminClient()
    .from('crm_activities')
    .insert({
      enquiry_id: a.enquiryId,
      project_id: a.projectId ?? null,
      kind: a.kind,
      body: a.body ?? null,
      meta: a.meta ?? null,
      by_id: a.byId ?? null,
    });
}

/** Keep the Enquiries pipeline in step with the project's stage. */
export function enquiryStatusFor(stage: StageKey): string {
  switch (stage) {
    case 'lead':
      return 'new';
    case 'contacted':
    case 'survey_booked':
    case 'surveyed':
      return 'contacted';
    case 'quote_sent':
      return 'qualified';
    case 'lost':
      return 'lost';
    default:
      return 'won';
  }
}

/**
 * Push the project's owner (or everyone on the CRM if it has none) when a next step falls due.
 * Once per step; not in quiet hours (they go out in the morning). Runs with the every-minute cron.
 */
export async function remindNextSteps() {
  const { getSettings } = await import('@/lib/whatsapp/settings');
  const { isQuiet } = await import('@/lib/whatsapp/schedule');
  const { notify } = await import('@/lib/notify');
  const { canAccess } = await import('@/lib/portals');
  const settings = await getSettings();
  if (isQuiet(new Date(), settings.quietFrom, settings.quietTo)) return 0;
  const db = createAdminClient();
  const { data: due } = await db
    .from('crm_projects')
    .select('id, enquiry_id, title, owner_id, next_step, next_step_at')
    .lte('next_step_at', new Date().toISOString())
    .is('next_step_notified_at', null)
    .not('stage', 'in', '(complete,lost)')
    .limit(50);
  if (!due?.length) return 0;
  const [{ data: people }, { data: customers }] = await Promise.all([
    db.from('profiles').select('*').eq('status', 'approved'),
    db.from('enquiries').select('id, name').in('id', [...new Set(due.map((d) => d.enquiry_id))]),
  ]);
  const crmUsers = (people ?? []).filter((p) => canAccess(p, 'crm')).map((p) => p.id as string);
  const nameOf = new Map((customers ?? []).map((c) => [c.id, c.name]));
  for (const p of due) {
    await db.from('crm_projects').update({ next_step_notified_at: new Date().toISOString() }).eq('id', p.id);
    const to = p.owner_id && crmUsers.includes(p.owner_id) ? [p.owner_id] : crmUsers;
    await Promise.all(
      to.map((userId) =>
        notify({
          userId,
          kind: 'crm_next_step',
          title: `Follow up: ${nameOf.get(p.enquiry_id) || p.title}`,
          body: p.next_step || 'Next step due',
          href: `/admin/crm/${p.id}`,
          tag: `crm-${p.id}`,
        })
      )
    );
  }
  return due.length;
}

/**
 * Every enquiry is an opportunity: make one (stage Lead) the moment an enquiry arrives — website,
 * Meta lead form or a new WhatsApp number. The enquiry row is the contact. Never throws (the CRM
 * tables may not exist yet), and never makes a second one.
 */
export async function ensureOpportunity(enquiryId: string, source: string) {
  try {
    const db = createAdminClient();
    const { data: existing } = await db.from('crm_projects').select('id').eq('enquiry_id', enquiryId).limit(1);
    if (existing?.length) return existing[0].id as string;
    const { data: e } = await db.from('enquiries').select('name, postcode, interest').eq('id', enquiryId).maybeSingle();
    if (!e) return null;
    const { data: row } = await db
      .from('crm_projects')
      .insert({
        enquiry_id: enquiryId,
        title: `${e.name}${e.postcode ? ` · ${e.postcode}` : ''}`,
        stage: 'lead',
        postcode: e.postcode,
        products: guessProducts(e.interest),
      })
      .select('id')
      .single();
    if (row) {
      await logActivity({ enquiryId, projectId: row.id, kind: 'system', body: `New enquiry via ${source}` });
      const { assignNewLead } = await import('./automation');
      await assignNewLead(row.id, e.name).catch(() => null);
    }
    return (row?.id as string) ?? null;
  } catch {
    return null;
  }
}

/* ── Documents (opportunity paperwork + company library) ───────────────────────── */

export const DOCS_BUCKET = 'crm-docs';
export const DOC_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
export const MAX_DOC_BYTES = 25 * 1024 * 1024;
export const DOC_CATEGORIES = ['quote', 'invoice', 'dno', 'mcs', 'warranty', 'handover', 'design', 'contract', 'receipt', 'other'] as const;

let docsReady = false;
export async function ensureDocsBucket() {
  if (docsReady) return;
  const admin = createAdminClient();
  const { data } = await admin.storage.getBucket(DOCS_BUCKET);
  if (!data) await admin.storage.createBucket(DOCS_BUCKET, { public: false, fileSizeLimit: MAX_DOC_BYTES, allowedMimeTypes: DOC_MIME });
  docsReady = true;
}

export function safeName(name: string) {
  return (name || 'document').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-').slice(0, 80) || 'document';
}

export async function signedDoc(path: string, seconds = 600, download?: string) {
  const { data } = await createAdminClient()
    .storage.from(DOCS_BUCKET)
    .createSignedUrl(path, seconds, download ? { download } : undefined);
  return data?.signedUrl ?? null;
}

/* ── Customer portal ─────────────────────────────────────────────────────────── */

export const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://heliaxis.co.uk').replace(/\/$/, '');
export const portalUrl = (token: string) => `${siteUrl()}/my/${token}`;

/**
 * The opportunity's private portal link (created on first use). Null until the job has started
 * (Won onwards) — customers don't get a portal while they're still a lead.
 */
export async function ensurePortalToken(projectId: string): Promise<string | null> {
  const db = createAdminClient();
  const { data } = await db.from('crm_projects').select('portal_token, stage').eq('id', projectId).maybeSingle();
  if (!data || !portalOpen(data.stage)) return null;
  if (data.portal_token) return data.portal_token as string;
  const { randomBytes } = await import('node:crypto');
  const token = randomBytes(18).toString('base64url');
  await db.from('crm_projects').update({ portal_token: token }).eq('id', projectId).is('portal_token', null);
  const { data: again } = await db.from('crm_projects').select('portal_token').eq('id', projectId).maybeSingle();
  return (again?.portal_token as string) || token;
}
