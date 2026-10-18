import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isUuid, signedDoc } from '@/lib/crm/server';
import { projectByToken } from '@/lib/crm/portal';

export const dynamic = 'force-dynamic';

/** A customer opening one of their documents (only ones marked visible on their own project). */
export async function GET(req: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const p = await projectByToken(token);
  if (!p || !isUuid(id)) return new NextResponse('Not found', { status: 404 });
  const { data: d } = await createAdminClient()
    .from('crm_documents')
    .select('storage_path, name')
    .eq('id', id)
    .eq('project_id', p.id)
    .eq('visible', true)
    .maybeSingle();
  if (!d) return new NextResponse('Not found', { status: 404 });
  const url = await signedDoc(d.storage_path, 300, new URL(req.url).searchParams.has('download') ? d.name : undefined);
  return url ? NextResponse.redirect(url) : new NextResponse('Not found', { status: 404 });
}
