import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadPortal } from '@/lib/crm/portal';
import { suggestDiagnosis } from '@/lib/hestia/learning';

export const dynamic = 'force-dynamic';

const reply = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { 'Cache-Control': 'no-store' } });
const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

/**
 * A customer's thumbs up or down on one Hestia answer: { id, rating: 1 | -1 }. Only an answer given on this
 * customer's own portal can be rated. Thumbs-up on a general answer becomes a candidate for staff to approve;
 * thumbs-down goes to the review queue with a suggested diagnosis. Nothing is reused until staff approve it
 * (Admin > Hestia), and a row staff have already decided on can no longer be changed from the portal.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await loadPortal(token);
  if (!data) return reply({ error: 'Not found' }, 404);
  const b = (await req.json().catch(() => ({}))) as { id?: unknown; rating?: unknown };
  const id = typeof b.id === 'string' ? b.id : '';
  const rating = b.rating === 1 ? 1 : b.rating === -1 ? -1 : 0;
  if (!isUuid(id) || !rating) return reply({ error: 'Nothing to rate.' }, 400);

  const db = createAdminClient();
  const { data: row, error } = await db.from('hestia_answers').select('id, project_id, question, answer, facts, general, status').eq('id', id).maybeSingle();
  if (error || !row || row.project_id !== data.projectId) return reply({ error: 'Not found' }, 404);
  if (row.status === 'approved' || row.status === 'rejected') return reply({ ok: true, rating });

  const patch: Record<string, unknown> = { rating, rated_at: new Date().toISOString() };
  if (rating === 1) {
    Object.assign(patch, { status: row.general ? 'candidate' : 'open', diagnosis: null, diagnosis_note: null });
  } else {
    const d = suggestDiagnosis(String(row.question), String(row.answer), JSON.stringify(row.facts ?? {}));
    Object.assign(patch, { status: 'review', diagnosis: d.diagnosis, diagnosis_note: d.note });
  }
  const { error: e2 } = await db.from('hestia_answers').update(patch).eq('id', id);
  if (e2) return reply({ error: 'Couldn’t save that just now.' }, 500);
  return reply({ ok: true, rating });
}
