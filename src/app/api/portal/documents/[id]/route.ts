import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { findByToken, signedDocUrl } from '@/lib/subcontractors/server';

/** Open one of your own uploaded documents (short-lived signed URL). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sub = await findByToken(new URL(req.url).searchParams.get('t'));
  if (!sub) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: doc } = await admin
    .from('subcontractor_documents')
    .select('storage_path')
    .eq('id', id)
    .eq('subcontractor_id', sub.id)
    .maybeSingle();
  if (!doc) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const url = await signedDocUrl(doc.storage_path);
  if (!url) return NextResponse.json({ error: 'unavailable' }, { status: 500 });
  return NextResponse.redirect(url);
}
