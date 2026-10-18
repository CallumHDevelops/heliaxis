import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, json } from '@/lib/crm/server';

export const dynamic = 'force-dynamic';

/** Saved replies for WhatsApp and email ({first_name}, {portal_link}). */
export async function GET() {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { data, error } = await createAdminClient().from('crm_snippets').select('*').order('title');
  if (error) return json({ error: error.message, items: [] }, 500);
  return json({ items: data ?? [] });
}

export async function POST(req: Request) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const b = await req.json().catch(() => ({}));
  const title = String(b.title || '').trim().slice(0, 80);
  const body = String(b.body || '').trim().slice(0, 4000);
  if (!title || !body) return json({ error: 'Give it a title and the message.' }, 400);
  const { data, error } = await createAdminClient().from('crm_snippets').insert({ title, body, created_by: s.user.id }).select('*').single();
  return error ? json({ error: error.message }, 500) : json({ item: data });
}
