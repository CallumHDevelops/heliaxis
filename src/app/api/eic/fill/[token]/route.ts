import { createAdminClient } from '@/lib/supabase/admin';
import { json } from '@/lib/crm/server';
import { readByToken } from '@/lib/eic-manual/request';
import { applyAnswers, viewOf, type EicRow } from '@/lib/eic-manual/server';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ token: string }> };

const gone = () => json({ error: 'This link isn’t working any more. Ask Heliaxis to send it again.' }, 404);
const locked = (row: EicRow) => row.status === 'issued';

/** The installer's copy of the certificate: its questions, boards and circuits. No customer or job details beyond the address. */
export async function GET(_req: Request, { params }: Ctx) {
  const db = createAdminClient();
  const row = await readByToken(db, (await params).token);
  if (!row) return gone();
  const v = await viewOf(db, row, { name: row.request!.name });
  // Only what the installer needs: not who the customer is or which job it is.
  return json({ ...v, customer: null, project: null });
}

/** { set, unset }: their answers. Never the office's parts (the design signature, the route, who it is for). */
export async function PATCH(req: Request, { params }: Ctx) {
  const db = createAdminClient();
  const row = await readByToken(db, (await params).token);
  if (!row) return gone();
  if (locked(row)) return json({ error: 'This certificate has been issued, so it can’t be changed.' }, 409);
  const b = (await req.json().catch(() => ({}))) as { set?: unknown; unset?: unknown };
  const answers = applyAnswers(row.answers, b.set, b.unset, { design: false });
  // Typing again after sending reopens it for the office's attention.
  const request = row.request ? { ...row.request, submitted_at: null } : null;
  await db.from('eic_manual').update({ answers, request, updated_at: new Date().toISOString() }).eq('id', row.id);
  const next = { ...row, answers, request };
  return json({ ...(await viewOf(db, next, { name: row.request!.name })), customer: null, project: null });
}
