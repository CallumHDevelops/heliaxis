import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isUuid, signedDoc } from '@/lib/crm/server';
import { projectByToken, SIGNABLE_CATEGORIES } from '@/lib/crm/portal';
import { printResponse, printVersion, type PrintDoc } from '@/lib/documents/print';

export const dynamic = 'force-dynamic';
// A print version of the combined handover pack is built again on request.
export const maxDuration = 60;

/**
 * A customer opening one of their documents. On the quote-only page that's just the quote to sign
 * (or the one they signed), even if it isn't marked visible; in the full portal, documents marked
 * visible on their own job, plus the one they signed. ?variant=print: the print version of one Heliaxis
 * made (documents/print.ts), made now and never stored.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const p = await projectByToken(token);
  if (!p || !isUuid(id)) return new NextResponse('Not found', { status: 404 });
  const db = createAdminClient();
  // The same quote the portal shows: the newest one marked "needs signing" (in the full portal, only a visible one).
  let signable = db.from('crm_documents').select('id').eq('project_id', p.id).eq('needs_signature', true).in('category', SIGNABLE_CATEGORIES);
  if (p.mode === 'full') signable = signable.eq('visible', true);
  const [{ data: d }, { data: toSign }] = await Promise.all([
    db.from('crm_documents').select('*').eq('id', id).eq('project_id', p.id).maybeSingle(),
    signable.order('created_at', { ascending: false }).limit(1),
  ]);
  if (!d) return new NextResponse('Not found', { status: 404 });
  const isQuote = id === p.accepted_document_id || (!p.accepted_at && toSign?.[0]?.id === id);
  // Only the quote-only page serves a document that isn't marked visible (and the signed one stays viewable).
  if (!(p.mode === 'quote' ? isQuote : d.visible || id === p.accepted_document_id)) return new NextResponse('Not found', { status: 404 });
  const q = new URL(req.url).searchParams;
  if (q.get('variant') === 'print') return printResponse(await printVersion(db, d as PrintDoc), q.has('download'));
  const url = await signedDoc(d.storage_path, 300, q.has('download') ? d.name : undefined);
  return url ? NextResponse.redirect(url) : new NextResponse('Not found', { status: 404 });
}
