import { DOCS_BUCKET } from '@/lib/crm/server';
import { currentGenerated } from '@/lib/documents/store';
import { deviceSession, isResponse, siteJson, theirAssignment } from '@/lib/site/device';
import { livePo } from '@/lib/site/labour-po';
import { packPo } from '@/lib/site/pack';

export const dynamic = 'force-dynamic';

/**
 * The trade's PO (P13): the PO as it stands, and a link to its PDF for ten minutes once it has been
 * issued (the copy that went to them). Nothing while the office is still checking it.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await deviceSession(req);
  if (isResponse(s)) return s;
  const a = await theirAssignment(s, (await params).id);
  if (isResponse(a)) return a;
  const po = await livePo(s.db, a.id);
  if (!po) return siteJson({ po: null, url: null });
  let url: string | null = null;
  if ((po.labour?.version ?? 0) > 0) {
    const doc = await currentGenerated(s.db, a.project_id, po.po_number);
    if (doc) {
      const { data } = await s.db.storage.from(DOCS_BUCKET).createSignedUrl(doc.storage_path, 600);
      url = data?.signedUrl ?? null;
    }
  }
  return siteJson({ po: packPo(po as unknown as Record<string, unknown>), url });
}
