import { createAdminClient } from '@/lib/supabase/admin';
import { json } from '@/lib/crm/server';
import { notify } from '@/lib/notify';
import { readByToken } from '@/lib/eic-manual/request';
import { viewOf } from '@/lib/eic-manual/server';

export const dynamic = 'force-dynamic';

/** "Send to Heliaxis": marks it sent, and tells the person who asked (the bell, and a push) that the information is in. */
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const db = createAdminClient();
  const row = await readByToken(db, (await params).token);
  if (!row || !row.request) return json({ error: 'This link isn’t working any more.' }, 404);
  if (row.status === 'issued') return json({ error: 'It’s been issued already.' }, 409);
  const v = await viewOf(db, row, { name: row.request.name });
  if (v.missing.length) return json({ error: `A few things are still to answer (${v.missing.length}). Press See all questions to find them.` }, 422);
  const request = { ...row.request, submitted_at: new Date().toISOString() };
  await db.from('eic_manual').update({ request, updated_at: new Date().toISOString() }).eq('id', row.id);
  // Whoever made the certificate is told.
  const { data: made } = await db.from('eic_manual').select('created_by').eq('id', row.id).maybeSingle();
  const to = (made as { created_by?: string | null } | null)?.created_by;
  if (to) await notify({ userId: to, kind: 'eic', title: `${row.request.name} has filled in ${row.number}`, body: 'The certificate is ready for you to check and issue.', href: `/admin/eic/${row.id}`, tag: `eic-${row.id}` }).catch(() => null);
  return json({ ...(await viewOf(db, { ...row, request }, { name: row.request.name })), customer: null, project: null });
}
