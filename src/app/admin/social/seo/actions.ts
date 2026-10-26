'use server';

import { revalidatePath } from 'next/cache';
import { requirePortal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

/** The monthly check: for one search, where each business appeared (blank = not in the top ten). Admins only. */
export async function recordRanks(f: FormData) {
  const s = await requirePortal('social_monitoring');
  if (!s || s.profile.role !== 'admin') throw new Error('Only an admin can record these');
  const keywordId = Number(f.get('keyword_id'));
  const device = f.get('device') === 'desktop' ? 'desktop' : 'mobile';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(f.get('date'))) ? String(f.get('date')) : new Date().toISOString().slice(0, 10);
  const rank = (v: FormDataEntryValue | null) => {
    const n = Number(String(v ?? '').trim());
    return String(v ?? '').trim() !== '' && Number.isInteger(n) && n >= 1 && n <= 50 ? n : null;
  };
  const rows = [];
  for (const [k, v] of f.entries()) {
    if (!k.startsWith('o:')) continue;
    const id = k.slice(2);
    const organic = rank(v);
    const pack = rank(f.get(`l:${id}`));
    if (organic == null && pack == null) continue;
    rows.push({ date, keyword_id: keywordId, device, competitor_id: id, organic_rank: organic, local_pack_rank: pack });
  }
  // A business with only a local-pack figure still needs its row.
  for (const [k, v] of f.entries()) {
    if (!k.startsWith('l:')) continue;
    const id = k.slice(2);
    if (rows.some((r) => r.competitor_id === id)) continue;
    const pack = rank(v);
    if (pack != null) rows.push({ date, keyword_id: keywordId, device, competitor_id: id, organic_rank: null, local_pack_rank: pack });
  }
  if (rows.length) await createAdminClient().from('social_seo_rank').upsert(rows, { onConflict: 'date,keyword_id,device,competitor_id' });
  revalidatePath('/admin/social/seo');
}
