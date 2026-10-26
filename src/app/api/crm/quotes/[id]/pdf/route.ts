import { crmSession, isUuid, json } from '@/lib/crm/server';
import { readQuote, renderQuote } from '@/lib/quotes/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** The quote as it will go, as a PDF to look over (nothing is saved or sent). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const q = await readQuote(id);
  if (!q) return json({ error: 'Not found' }, 404);
  try {
    const bytes = await renderQuote(q);
    return new Response(Buffer.from(bytes), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${q.number}.pdf"`, 'Cache-Control': 'no-store' } });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Couldn’t make the PDF' }, 500);
  }
}
