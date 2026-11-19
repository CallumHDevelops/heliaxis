import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Needs you (spec §10.4): one open item per cause (kind + ref). Raising the same cause again updates it; when the cause
 * clears, clearAction closes it by itself.
 */

type Db = ReturnType<typeof createAdminClient>;

export type ActionKind = 'review' | 'ai_fact' | 'rank_drop' | 'index' | 'approval' | 'refresh' | 'meta' | 'setup' | 'budget';

/** Working days to the due date for each kind. */
const DUE_DAYS: Record<ActionKind, number> = { review: 2, ai_fact: 5, rank_drop: 3, index: 3, approval: 2, refresh: 14, meta: 7, setup: 7, budget: 1 };

export function dueDate(kind: ActionKind, from = new Date(), days = DUE_DAYS[kind]): string {
  const d = new Date(from);
  let left = days;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) left--;
  }
  return d.toISOString().slice(0, 10);
}

export async function raiseAction(a: { kind: ActionKind; ref: string; title: string; why?: string; fixHref?: string; owner?: string; dueDays?: number }, db: Db = createAdminClient()) {
  const { data: open } = await db.from('seo_action').select('id').eq('kind', a.kind).eq('ref', a.ref).in('status', ['open', 'snoozed']).maybeSingle();
  const row = { title: a.title, why: a.why ?? null, fix_href: a.fixHref ?? null, owner: a.owner ?? null };
  if (open) {
    await db.from('seo_action').update(row).eq('id', open.id);
    return;
  }
  // A cause marked "Not relevant" stays closed for 30 days so it doesn't come straight back.
  const { data: dismissed } = await db
    .from('seo_action')
    .select('id')
    .eq('kind', a.kind)
    .eq('ref', a.ref)
    .eq('status', 'not_relevant')
    .gte('closed_at', new Date(Date.now() - 30 * 86_400_000).toISOString())
    .limit(1);
  if (dismissed?.length) return;
  await db.from('seo_action').insert({ kind: a.kind, ref: a.ref, ...row, due: dueDate(a.kind, new Date(), a.dueDays) });
}

export async function clearAction(kind: ActionKind, ref: string, db: Db = createAdminClient()) {
  await db.from('seo_action').update({ status: 'cleared', closed_at: new Date().toISOString(), closed_reason: 'The cause cleared' }).eq('kind', kind).eq('ref', ref).in('status', ['open', 'snoozed']);
}

/** Open items (snoozed ones come back on their date). */
export async function openActions(limit = 200, db: Db = createAdminClient()) {
  const today = new Date().toISOString().slice(0, 10);
  await db.from('seo_action').update({ status: 'open', snoozed_until: null }).eq('status', 'snoozed').lte('snoozed_until', today);
  const { data } = await db.from('seo_action').select('*').in('status', ['open', 'snoozed']).order('due', { ascending: true }).limit(limit);
  return (data ?? []) as SeoAction[];
}

export type SeoAction = {
  id: number;
  kind: ActionKind;
  ref: string;
  title: string;
  why: string | null;
  fix_href: string | null;
  owner: string | null;
  due: string | null;
  status: 'open' | 'snoozed' | 'done' | 'not_relevant' | 'cleared';
  snoozed_until: string | null;
  created_at: string;
};
