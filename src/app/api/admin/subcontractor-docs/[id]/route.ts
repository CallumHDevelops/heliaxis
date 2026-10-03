import { NextResponse } from 'next/server';
import { getSessionProfile } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { signedDocUrl } from '@/lib/subcontractors/server';

/** Admin: open (or ?download=1) a subcontractor document via a 2-minute signed URL. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, profile } = await getSessionProfile();
  if (!user || profile?.status !== 'approved' || profile.role !== 'admin') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const { data: doc } = await createAdminClient()
    .from('subcontractor_documents')
    .select('storage_path, file_name')
    .eq('id', id)
    .maybeSingle();
  if (!doc) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const download = new URL(req.url).searchParams.get('download') ? doc.file_name : undefined;
  const url = await signedDocUrl(doc.storage_path, download);
  if (!url) return NextResponse.json({ error: 'unavailable' }, { status: 500 });
  return NextResponse.redirect(url);
}
