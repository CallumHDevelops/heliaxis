import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { jobHref } from '@/lib/global-search';
import { PREVIEW_COOKIE, previewJob } from '@/lib/crm/portal-preview';

export const dynamic = 'force-dynamic';

/** Leave the staff preview: clear the cookie and go back to the job. */
export async function GET(req: Request) {
  const id = await previewJob();
  let to = '/admin/crm';
  if (id) {
    const { data } = await createAdminClient().from('crm_projects').select('stage').eq('id', id).maybeSingle();
    to = jobHref({ id, stage: String(data?.stage ?? '') });
  }
  const res = NextResponse.redirect(new URL(to, req.url));
  res.cookies.set(PREVIEW_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
