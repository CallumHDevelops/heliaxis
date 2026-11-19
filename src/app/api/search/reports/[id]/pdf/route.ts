import { searchSession } from '@/lib/search/server';
import { readReport, reportFileName, reportPdf } from '@/lib/search/reporting/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** A Search report as a PDF (document kit, Heliaxis header). Anyone with Search can download it. ?inline=1 opens it in the browser. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await searchSession();
  if (!s) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const r = await readReport(Number(id));
  if (!r) return Response.json({ error: 'Not found' }, { status: 404 });
  try {
    const bytes = await reportPdf(r);
    const inline = new URL(req.url).searchParams.get('inline') === '1';
    return new Response(Buffer.from(bytes), {
      headers: { 'content-type': 'application/pdf', 'content-disposition': `${inline ? 'inline' : 'attachment'}; filename="${reportFileName(r, 'pdf')}"`, 'cache-control': 'no-store' },
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Couldn’t make the PDF.' }, { status: 500 });
  }
}
