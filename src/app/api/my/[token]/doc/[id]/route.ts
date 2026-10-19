import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isUuid, signedDoc } from '@/lib/crm/server';
import { projectByToken, SIGNABLE_CATEGORIES } from '@/lib/crm/portal';

export const dynamic = 'force-dynamic';

/**
 * A customer opening one of their documents. On the quote-only page that's just the quote to sign
 * (or the one they signed); in the full portal, documents marked visible on their own job as well.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const p = await projectByToken(token);
  if (!p || !isUuid(id)) return new NextResponse('Not found', { status: 404 });
  const db = createAdminClient();
  const [{ data: d }, { data: toSign }] = await Promise.all([
    db.from('crm_documents').select('storage_path, name, visible').eq('id', id).eq('project_id', p.id).maybeSingle(),
    // The same quote the portal shows: the newest one marked "needs signing".
    db
      .from('crm_documents')
      .select('id')
      .eq('project_id', p.id)
      .eq('needs_signature', true)
      .in('category', SIGNABLE_CATEGORIES)
      .order('created_at', { ascending: false })
      .limit(1),
  ]);
  if (!d) return new NextResponse('Not found', { status: 404 });
  const isQuote = id === p.accepted_document_id || (!p.accepted_at && toSign?.[0]?.id === id);
  if (!(p.mode === 'quote' ? isQuote : d.visible || isQuote)) return new NextResponse('Not found', { status: 404 });
  const url = await signedDoc(d.storage_path, 300, new URL(req.url).searchParams.has('download') ? d.name : undefined);
  return url ? NextResponse.redirect(url) : new NextResponse('Not found', { status: 404 });
}
