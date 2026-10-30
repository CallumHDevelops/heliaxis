import { crmSession, isUuid, json } from '@/lib/crm/server';
import { readProposal } from '@/lib/quotes/proposal';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Read an OpenSolar proposal (PDF, up to 20 MB): { options } for the builder to keep on the quote. Nothing is saved here. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return json({ error: 'Choose the proposal PDF.' }, 400);
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) return json({ error: 'Use the proposal as a PDF.' }, 400);
  if (file.size > 20 * 1024 * 1024) return json({ error: 'That file is over 20 MB.' }, 400);
  const out = await readProposal(new Uint8Array(await file.arrayBuffer()));
  if (!out.ok) return json({ error: out.error }, 422);
  return json({ options: out.options, file: file.name.slice(0, 160) });
}
