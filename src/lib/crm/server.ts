import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePortal } from '@/lib/auth';
import { NextResponse } from 'next/server';
import type { StageKey } from './stages';

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
