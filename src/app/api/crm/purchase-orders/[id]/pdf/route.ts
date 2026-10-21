import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, DOCS_BUCKET, isUuid, json } from '@/lib/crm/server';
import { currentGenerated } from '@/lib/documents/store';
import { labourPoPdf } from '@/lib/site/labour-po';
import { pdfName, purchaseOrderPdf } from '@/lib/purchase-orders/pdf';
import { NOT_READY, ordersReady, pdfInputFor, readOrder } from '@/lib/purchase-orders/server';

export const dynamic = 'force-dynamic';

/** The order as a PDF, to download (?inline=1 to open it in the browser). Made fresh each time from what's saved. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  if (!(await ordersReady())) return json({ error: NOT_READY }, 409);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const db = createAdminClient();
  const full = await readOrder(db, id);
  if (!full) return json({ error: 'That order isn’t there any more.' }, 404);
  const inline = new URL(req.url).searchParams.get('inline') === '1';
  let bytes: Uint8Array;
  let name = pdfName(full.order);
  if (full.order.kind === 'labour') {
    // The copy that went (frozen, stored when it was issued); a held one shows as it would go.
    const o = full.order;
    const doc = (o.labour?.version ?? 0) > 0 ? await currentGenerated(db, o.project_id, o.po_number) : null;
    const { data } = doc ? await db.storage.from(DOCS_BUCKET).download(doc.storage_path) : { data: null };
    if (data) {
      bytes = new Uint8Array(await data.arrayBuffer());
      name = doc!.name;
    } else if (o.labour) bytes = await labourPoPdf(o.labour);
    else return json({ error: 'Nothing on this PO yet.' }, 404);
  } else bytes = await purchaseOrderPdf(pdfInputFor(full));
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${name.replace(/"/g, '')}"`,
      'Cache-Control': 'no-store',
    },
  });
}
