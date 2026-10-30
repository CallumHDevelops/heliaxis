import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePortal } from '@/lib/auth';
import { clearLeadNotifications } from '@/lib/notify';
import { NextResponse } from 'next/server';
import { guessProducts, portalMode, type StageKey } from './stages';

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

/**
 * Speed to lead: the first time anyone contacts the customer (WhatsApp, a logged call or visit, an
 * email). Their "new lead" and "hasn't been contacted" notifications go, for everyone. Ignores
 * missing CRM tables. `note` goes on the timeline's stage line ("we got in touch" unless given);
 * returns how many jobs moved to Contacted.
 */
export async function markContacted(
  where: { projectId: string } | { enquiryId: string },
  at = new Date().toISOString(),
  opts: { note?: string; byId?: string | null } = {}
): Promise<number> {
  try {
    const update = createAdminClient().from('crm_projects').update({ first_contact_at: at }).is('first_contact_at', null);
    const q = 'projectId' in where ? update.eq('id', where.projectId) : update.eq('enquiry_id', where.enquiryId);
    const { data, error } = await q.select('id, enquiry_id');
    if (error) {
      // No CRM tables yet: a new lead's notifications can still go.
      if ('enquiryId' in where) await clearLeadNotifications(where.enquiryId, []);
      return 0;
    }
    const byEnquiry = new Map<string, string[]>();
    for (const p of data ?? []) byEnquiry.set(p.enquiry_id, [...(byEnquiry.get(p.enquiry_id) ?? []), p.id]);
    for (const [enquiryId, projectIds] of byEnquiry) await clearLeadNotifications(enquiryId, projectIds);

    // We've been in touch, so a job still at Lead moves to Contacted (never back from further on).
    const atLead = createAdminClient().from('crm_projects').select('id').eq('stage', 'lead');
    const { data: leads } = await ('projectId' in where ? atLead.eq('id', where.projectId) : atLead.eq('enquiry_id', where.enquiryId));
    let moved = 0;
    if (leads?.length) {
      const { applyStageEvent } = await import('./move-stage');
      for (const p of leads) {
        if ((await applyStageEvent(p.id, 'contacted', { note: opts.note ?? 'we got in touch', byId: opts.byId ?? null })).moved) moved++;
      }
    }
    return moved;
  } catch {
    // never block the caller
    return 0;
  }
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
 * Once per step, at the time staff picked, quiet hours included: they're for messages to customers,
 * not our own reminders (a 9pm call-back from a chat goes off at 9pm, not 8am the next day). Runs
 * with the every-minute cron.
 */
export async function remindNextSteps() {
  const { notify } = await import('@/lib/notify');
  const { canAccess } = await import('@/lib/portals');
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
      await assignNewLead(row.id, e.name, enquiryId).catch(() => null);
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
export const DOC_CATEGORIES = ['quote', 'invoice', 'dno', 'mcs', 'warranty', 'handover', 'design', 'contract', 'receipt', 'other', 'commissioning', 'certificate', 'po'] as const;
/** The kinds site-commissioning.sql adds to crm_documents' check list: before it's run, the database refuses them. */
export const SITE_DOC_CATEGORIES: readonly string[] = ['commissioning', 'certificate', 'po'];

/** A document kind from a request, or `fallback` when it isn't one (or is a site kind and site-commissioning.sql hasn't been run). */
export async function docCategoryOf(v: unknown, fallback = 'other'): Promise<string> {
  const c = String(v ?? '');
  if (!(DOC_CATEGORIES as readonly string[]).includes(c)) return fallback;
  if (SITE_DOC_CATEGORIES.includes(c)) {
    const { schemaReady } = await import('@/lib/schema-ready');
    if (!(await schemaReady()).site) return fallback;
  }
  return c;
}

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

/**
 * A fingerprint (sha256) of a stored document, so a signed quote can be matched to the exact file.
 * Worked out once and kept on the document (crm-v3.sql; until then it's just returned). Never throws.
 */
export async function fingerprintDocument(docId: string): Promise<string | null> {
  try {
    const db = createAdminClient();
    const { data: d } = await db.from('crm_documents').select('*').eq('id', docId).maybeSingle();
    if (!d?.storage_path) return null;
    if (d.sha256) return d.sha256 as string;
    const { data: blob } = await db.storage.from(DOCS_BUCKET).download(d.storage_path as string);
    if (!blob) return null;
    const { createHash } = await import('node:crypto');
    const hash = createHash('sha256').update(Buffer.from(await blob.arrayBuffer())).digest('hex');
    await db.from('crm_documents').update({ sha256: hash }).eq('id', docId);
    return hash;
  } catch {
    return null;
  }
}

/* ── Customer portal ─────────────────────────────────────────────────────────── */

export const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://heliaxis.co.uk').replace(/\/$/, '');
export const portalUrl = (token: string) => `${siteUrl()}/my/${token}`;

/**
 * The opportunity's private customer link (created on first use). It opens as a quote-only page
 * once the quote is sent for signing, and as the full portal from Won. Null before that (and when
 * Lost): customers don't get a link while they're still a lead.
 */
export async function ensurePortalToken(projectId: string): Promise<string | null> {
  const db = createAdminClient();
  const { data } = await db.from('crm_projects').select('portal_token, stage').eq('id', projectId).maybeSingle();
  if (!data || !portalMode(data.stage)) return null;
  if (data.portal_token) return data.portal_token as string;
  const { randomBytes } = await import('node:crypto');
  const token = randomBytes(18).toString('base64url');
  await db.from('crm_projects').update({ portal_token: token }).eq('id', projectId).is('portal_token', null);
  const { data: again } = await db.from('crm_projects').select('portal_token').eq('id', projectId).maybeSingle();
  return (again?.portal_token as string) || token;
}

/**
 * The portal token whatever the stage (made if there isn't one). The link only opens once the job is at a stage with a portal
 * (loadPortal checks), so a quote's "Accept" button can carry it before the quote has been sent.
 */
export async function mintPortalToken(projectId: string): Promise<string | null> {
  const db = createAdminClient();
  const { data } = await db.from('crm_projects').select('portal_token').eq('id', projectId).maybeSingle();
  if (!data) return null;
  if (data.portal_token) return data.portal_token as string;
  const { randomBytes } = await import('node:crypto');
  const token = randomBytes(18).toString('base64url');
  await db.from('crm_projects').update({ portal_token: token }).eq('id', projectId).is('portal_token', null);
  const { data: again } = await db.from('crm_projects').select('portal_token').eq('id', projectId).maybeSingle();
  return (again?.portal_token as string) || token;
}

/** A fresh portal link: the old one stops working straight away (e.g. it was shared by mistake). */
export async function resetPortalToken(projectId: string): Promise<string | null> {
  const db = createAdminClient();
  const { data } = await db.from('crm_projects').select('stage').eq('id', projectId).maybeSingle();
  if (!data || !portalMode(data.stage)) return null;
  const { randomBytes } = await import('node:crypto');
  const token = randomBytes(18).toString('base64url');
  const { error } = await db.from('crm_projects').update({ portal_token: token }).eq('id', projectId);
  return error ? null : token;
}
