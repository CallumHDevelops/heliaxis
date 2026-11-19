import { searchSession } from '@/lib/search/server';
import { readReport, reportFileName } from '@/lib/search/reporting/server';
import { reportTables, toCsv } from '@/lib/search/reporting/shape';

export const dynamic = 'force-dynamic';

/** Every table in a Search report as CSV (?table=measures|movers|leads|content|health for one). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await searchSession();
  if (!s) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const r = await readReport(Number(id));
  if (!r) return Response.json({ error: 'Not found' }, { status: 404 });
  const only = new URL(req.url).searchParams.get('table');
  const tables = reportTables(r).filter((t) => !only || t.key === only);
  // A byte-order mark so Excel reads the curly quotes and the en dashes correctly.
  return new Response(`﻿${toCsv(tables)}`, {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${reportFileName(r, 'csv')}"`, 'cache-control': 'no-store' },
  });
}
