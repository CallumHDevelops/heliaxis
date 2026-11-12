import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { cleanLibraryCategory } from '@/lib/writeups/categories';
import { readWriteup } from '@/lib/writeups/server';
import { standardTemplates } from '@/lib/writeups/templates';
import { cleanContent } from '@/lib/writeups/types';

export const dynamic = 'force-dynamic';

/** The template library: Heliaxis's standard templates and the ones saved from documents. */
export async function GET() {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { data, error } = await createAdminClient().from('crm_writeup_templates').select('id, name, category, description, content, created_at').order('created_at', { ascending: false }).limit(300);
  const standard = standardTemplates().map((t) => ({ id: t.key, name: t.name, category: t.category, note: t.note, standard: true, blocks: t.blocks.length }));
  const saved = (data ?? []).map((r) => ({ id: r.id as string, name: r.name as string, category: (r.category as string | null) ?? 'Other', note: (r.description as string | null) ?? '', standard: false, blocks: cleanContent(r.content).blocks.length }));
  return json({ templates: [...standard, ...saved], missing: !!error && /crm_writeup_templates/.test(error.message) });
}

/** Save a document as a template: { writeup_id, name, category?, description? } */
export async function POST(req: Request) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const b = await req.json().catch(() => ({}));
  const name = String(b.name || '').trim().slice(0, 120);
  if (!name) return json({ error: 'Give the template a name.' }, 400);
  if (!isUuid(String(b.writeup_id ?? ''))) return json({ error: 'Not found' }, 404);
  const w = await readWriteup(String(b.writeup_id));
  if (!w) return json({ error: 'Not found' }, 404);
  const { data, error } = await createAdminClient()
    .from('crm_writeup_templates')
    .insert({ name, category: cleanLibraryCategory(b.category), description: String(b.description || '').trim().slice(0, 300) || null, title: w.title, content: w.content, created_by: s.user.id })
    .select('id')
    .single();
  if (error || !data) return json({ error: /crm_writeup_templates/.test(error?.message ?? '') ? 'Run supabase/document-templates.sql in Supabase first, then try again.' : error?.message || 'Couldn’t save the template.' }, 500);
  return json({ id: data.id });
}
