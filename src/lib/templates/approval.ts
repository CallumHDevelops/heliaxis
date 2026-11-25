import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { templateHash, type Approval, type Approvals } from './legal';
import { templateByCode } from './registry';

/** Where the approvals are kept: pv_settings, key "template_approvals" (an admin-write table). */
const KEY = 'template_approvals';

export async function readApprovals(db: SupabaseClient): Promise<Approvals> {
  const { data } = await db.from('pv_settings').select('value').eq('key', KEY).maybeSingle();
  return (data?.value && typeof data.value === 'object' ? data.value : {}) as Approvals;
}

export async function setApproval(db: SupabaseClient, code: string, approved: boolean, by: string): Promise<{ ok: true; approval: Approval } | { ok: false; error: string }> {
  const t = templateByCode(code);
  if (!t) return { ok: false, error: 'No such template.' };
  if (!t.legalReview) return { ok: false, error: 'That template does not need legal approval.' };
  const all = await readApprovals(db);
  const approval: Approval = { approved, hash: templateHash(t), issue: 'Issue 1', by, at: new Date().toISOString() };
  const { error } = await db.from('pv_settings').upsert({ key: KEY, value: { ...all, [code]: approval }, description: 'Legal approval of fixed template wording, by template code', updated_at: new Date().toISOString() }, { onConflict: 'key' });
  return error ? { ok: false, error: error.message } : { ok: true, approval };
}
