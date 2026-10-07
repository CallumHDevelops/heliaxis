import { NextResponse } from 'next/server';
import { getSessionProfile } from '@/lib/auth';
import { canAccess } from '@/lib/portals';
import { createAdminClient } from '@/lib/supabase/admin';
import { clientIp, logEvent, signedDocUrl } from '@/lib/subcontractors/server';

export const dynamic = 'force-dynamic';

/** Admin: open (or ?download=1) a subcontractor document via a 2-minute signed URL. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, profile } = await getSessionProfile();
  if (!user || !canAccess(profile, 'subcontractors')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const { data: doc } = await createAdminClient()
    .from('subcontractor_documents')
    .select('subcontractor_id, storage_path, file_name, category')
    .eq('id', id)
    .maybeSingle();
  if (!doc) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const download = new URL(req.url).searchParams.get('download') ? doc.file_name : undefined;
  const url = await signedDocUrl(doc.storage_path, download);
  if (!url) return NextResponse.json({ error: 'unavailable' }, { status: 500 });
  // Access to ID / insurance / qualification files is audited per view.
  await logEvent(
    doc.subcontractor_id,
    user.email || profile?.email || 'admin',
    download ? 'document_downloaded' : 'document_viewed',
    { file: doc.file_name, category: doc.category },
    clientIp(req.headers)
  );
  return NextResponse.redirect(url);
}
