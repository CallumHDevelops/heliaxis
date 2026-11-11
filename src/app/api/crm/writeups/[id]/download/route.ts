import { crmSession, isUuid, json } from '@/lib/crm/server';
import { ukDay } from '@/lib/bank-holidays';
import { writeupDocx } from '@/lib/writeups/docx';
import { writeupPdf } from '@/lib/writeups/pdf';
import { forWhom, loadImages, loadQuoteTables, readWriteup } from '@/lib/writeups/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'document';

/** The document as a download: ?format=pdf (the branded PDF) or ?format=docx (a Word file to edit). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const w = await readWriteup(id);
  if (!w) return json({ error: 'Not found' }, 404);
  const format = new URL(req.url).searchParams.get('format') === 'docx' ? 'docx' : 'pdf';
  const [who, images, quotes] = await Promise.all([forWhom(w), loadImages(w.content), loadQuoteTables(w.content)]);
  const facts = { id, number: w.number, title: w.title, issued: ukDay(new Date()), content: w.content, who, images, quotes };
  try {
    const bytes = format === 'docx' ? await writeupDocx(facts) : await writeupPdf(facts);
    const name = `${w.number}-${slug(w.title)}.${format}`;
    return new Response(Buffer.from(bytes), {
      headers: {
        'Content-Type': format === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf',
        'Content-Disposition': `${new URL(req.url).searchParams.get('inline') === '1' ? 'inline' : 'attachment'}; filename="${name}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Couldn’t make the file.' }, 500);
  }
}
