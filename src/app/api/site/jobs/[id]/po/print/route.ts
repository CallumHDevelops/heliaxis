import { printName } from '@/lib/documents/print-shared';
import { deviceSession, isResponse, siteJson, theirAssignment } from '@/lib/site/device';
import { labourPoPdf, livePo } from '@/lib/site/labour-po';

export const dynamic = 'force-dynamic';

/**
 * The print version of the trade's issued PO (the ink saver, P13's "Print version"): made now from the
 * PO as it went to them (purchase_orders.labour), never stored or sent. The phone fetches it with its
 * device token and opens the PDF. Nothing while the office is still checking it.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await deviceSession(req);
  if (isResponse(s)) return s;
  const a = await theirAssignment(s, (await params).id);
  if (isResponse(a)) return a;
  const po = await livePo(s.db, a.id);
  if (!po?.labour || po.labour.version < 1) return siteJson({ error: 'not_issued', message: 'Your PO hasn’t been sent yet.' }, 404);
  const bytes = await labourPoPdf(po.labour, { variant: 'print' });
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${printName(`${po.po_number}.pdf`)}"`,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
