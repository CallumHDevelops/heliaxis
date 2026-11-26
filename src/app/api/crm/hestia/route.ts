import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { DIAGNOSES, isGeneral, namesFrom } from '@/lib/hestia/learning';

export const dynamic = 'force-dynamic';

const TABS = ['review', 'candidate', 'approved', 'rejected'] as const;
const missing = (m: string) => /hestia_answers/.test(m);

/** The Hestia review queue: ?tab=review (thumbs-down) | candidate (thumbs-up, general) | approved | rejected. Also the counts and the causes found so far. */
export async function GET(req: Request) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const t = new URL(req.url).searchParams.get('tab') ?? 'review';
  const tab = (TABS as readonly string[]).includes(t) ? t : 'review';
  const db = createAdminClient();
  const { data, error } = await db.from('hestia_answers').select('*').eq('status', tab).order(tab === 'approved' ? 'reviewed_at' : 'at', { ascending: false }).limit(200);
  if (error) return json({ error: error.message, missing: missing(error.message) }, 500);
  const counts: Record<string, number> = {};
  await Promise.all(
    TABS.map(async (s) => {
      const r = await db.from('hestia_answers').select('id', { count: 'exact', head: true }).eq('status', s);
      counts[s] = r.count ?? 0;
    }),
  );
  const { data: causes } = await db.from('hestia_answers').select('cause, cause_note, reviewed_at').not('cause', 'is', null).order('reviewed_at', { ascending: false }).limit(300);
  return json({ rows: data ?? [], counts, causes: causes ?? [] });
}

type Body = { id?: string; action?: string; question?: string; answer?: string; cause?: string; cause_note?: string };

/**
 * A reviewer's decision on one row. approve: keep { question, answer } as an example for Hestia (the wording is
 * re-checked here for personal details and refused if it fails); reject: don't reuse it, optionally noting the
 * cause (a missing portal fact, a prompt gap) so it can be fixed at the root; retire: stop using an approved example.
 */
export async function PATCH(req: Request) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const b = (await req.json().catch(() => ({}))) as Body;
  if (!isUuid(String(b.id ?? ''))) return json({ error: 'Choose an answer.' }, 400);
  const action = b.action;
  if (action !== 'approve' && action !== 'reject' && action !== 'retire') return json({ error: 'Unknown action.' }, 400);
  const db = createAdminClient();
  const { data: row } = await db.from('hestia_answers').select('id, question, answer, facts, status').eq('id', b.id!).maybeSingle();
  if (!row) return json({ error: 'Not found' }, 404);

  const who = (s.profile as { full_name?: string | null; email?: string | null }).full_name || (s.profile as { email?: string | null }).email || 'staff';
  const stamp = { reviewed_by: who, reviewed_at: new Date().toISOString() };
  const cause = typeof b.cause === 'string' && (DIAGNOSES as string[]).includes(b.cause) ? b.cause : null;
  const cause_note = typeof b.cause_note === 'string' ? b.cause_note.trim().slice(0, 1000) || null : null;

  let patch: Record<string, unknown>;
  if (action === 'approve') {
    const q = String(b.question ?? row.question).trim().slice(0, 600);
    const a = String(b.answer ?? '').trim().slice(0, 2000);
    if (!a) return json({ error: 'Write the answer Hestia should give.' }, 400);
    const f = (row.facts ?? {}) as { customerFirstName?: string; lookedAfterBy?: string; projectRef?: string };
    const check = isGeneral(q, a, namesFrom([f.customerFirstName, f.lookedAfterBy, f.projectRef]));
    if (!check.ok) return json({ error: `Not kept: ${check.reason} Examples must be general, with no names, dates, prices or references.` }, 400);
    patch = { status: 'approved', example_q: q, example_a: a, general: true, cause, cause_note, ...stamp };
  } else if (action === 'reject') {
    patch = { status: 'rejected', cause, cause_note, ...stamp };
  } else {
    if (row.status !== 'approved') return json({ error: 'Only an approved example can be retired.' }, 400);
    patch = { status: 'rejected', ...stamp };
  }
  const { error } = await db.from('hestia_answers').update(patch).eq('id', b.id!);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}
