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
