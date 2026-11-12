import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { forWhom, rowOf } from '@/lib/writeups/server';
import { contentFromStandard } from '@/lib/writeups/templates';
import { cleanContent, type WriteupContent } from '@/lib/writeups/types';

export const dynamic = 'force-dynamic';

/** Documents (tenders and the like), newest edit first, each with who it is for. */
export async function GET() {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const db = createAdminClient();
  const { data, error } = await db.from('crm_writeups').select('*').order('updated_at', { ascending: false }).limit(300);
  if (error) return json({ error: error.message, missing: /crm_writeups/.test(error.message) }, 500);
  const rows = await Promise.all((data ?? []).map(async (r) => {
    const w = rowOf(r);
    const who = await forWhom(w);
    return { id: w.id, number: w.number, title: w.title, kind: w.kind, for: who.name, updated_at: w.updated_at };
  }));
  return json({ documents: rows });
}

/** A new document, empty or a copy of a template ({ template_id }: a standard template's key, or a saved one's id): { title?, enquiry_id?, organisation_id?, project_id? } → { id } */
export async function POST(req: Request) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const b = await req.json().catch(() => ({}));
  const pick = (v: unknown) => (isUuid(String(v ?? '')) ? String(v) : null);
  const db = createAdminClient();
  let start: { title: string; content: WriteupContent } = { title: '', content: { blocks: [], subtitle: '' } };
  const tid = String(b.template_id ?? '');
  if (tid) {
    const std = contentFromStandard(tid);
    if (std) start = std;
    else if (isUuid(tid)) {
      const { data: t } = await db.from('crm_writeup_templates').select('title, content').eq('id', tid).maybeSingle();
      if (t) start = { title: String(t.title || ''), content: cleanContent(t.content) };
    }
    if (!start.content.blocks.length) return json({ error: 'That template couldn’t be found.' }, 404);
  }
  const { data, error } = await db
    .from('crm_writeups')
    .insert({
      title: String(b.title || '').trim().slice(0, 200) || start.title.slice(0, 200) || 'Untitled document',
      kind: 'tender',
      enquiry_id: pick(b.enquiry_id),
      organisation_id: pick(b.organisation_id),
      project_id: pick(b.project_id),
      content: start.content,
      created_by: s.user.id,
    })
    .select('id')
    .single();
  if (error || !data) return json({ error: error?.message || 'Couldn’t start the document.' }, 500);
  return json({ id: data.id });
}
