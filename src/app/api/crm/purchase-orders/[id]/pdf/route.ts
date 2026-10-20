import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { pdfName, purchaseOrderPdf } from '@/lib/purchase-orders/pdf';
import { NOT_READY, ordersReady, pdfInputFor, readOrder } from '@/lib/purchase-orders/server';

export const dynamic = 'force-dynamic';

/** The order as a PDF, to download (?inline=1 to open it in the browser). Made fresh each time from what's saved. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  if (!(await ordersReady())) return json({ error: NOT_READY }, 409);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const full = await readOrder(createAdminClient(), id);
  if (!full) return json({ error: 'That order isn’t there any more.' }, 404);
  const bytes = await purchaseOrderPdf(pdfInputFor(full));
  const inline = new URL(req.url).searchParams.get('inline') === '1';
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${pdfName(full.order)}"`,
      'Cache-Control': 'no-store',
    },
  });
}
