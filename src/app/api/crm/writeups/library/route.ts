import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, json } from '@/lib/crm/server';
import { standardSections } from '@/lib/writeups/standard';
import { cleanContent, type Block } from '@/lib/writeups/types';

export const dynamic = 'force-dynamic';

/** The section library: Heliaxis's ready-made sections, and the ones saved from documents. */
export async function GET() {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { data, error } = await createAdminClient().from('crm_writeup_library').select('id, name, blocks, created_at').order('created_at', { ascending: false }).limit(300);
  const saved = (data ?? []).map((r) => ({ id: r.id as string, name: r.name as string, blocks: cleanContent({ blocks: r.blocks }).blocks as Block[] }));
  return json({ standard: standardSections(), saved, missing: !!error && /crm_writeup_library/.test(error.message) });
}

/** Save sections to the library: { name, blocks } (a heading and what follows it, or a single block). */
export async function POST(req: Request) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const b = await req.json().catch(() => ({}));
  const name = String(b.name || '').trim().slice(0, 120);
  const blocks = cleanContent({ blocks: b.blocks }).blocks;
  if (!name) return json({ error: 'Give it a name.' }, 400);
  if (!blocks.length) return json({ error: 'There is nothing to save.' }, 400);
  const { data, error } = await createAdminClient().from('crm_writeup_library').insert({ name, blocks, created_by: s.user.id }).select('id').single();
  if (error || !data) return json({ error: error?.message || 'Couldn’t save it.' }, 500);
  return json({ id: data.id });
}
