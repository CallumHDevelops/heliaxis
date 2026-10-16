import { createAdminClient } from '@/lib/supabase/admin';
import { json, session } from '@/lib/whatsapp/routes';
import { cleanRule } from './clean';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await session())) return json({ error: 'unauthorized' }, 401);
  const { data, error } = await createAdminClient()
    .from('whatsapp_rules')
    .select('*')
    .order('priority', { ascending: false })
    .order('created_at');
  if (error) return json({ error: error.message, items: [] }, 500);
  return json({ items: data ?? [] });
}

export async function POST(req: Request) {
  if (!(await session())) return json({ error: 'unauthorized' }, 401);
  const rule = cleanRule(await req.json().catch(() => ({})));
  if ('error' in rule) return json(rule, 400);
  const { data, error } = await createAdminClient().from('whatsapp_rules').insert(rule).select('*').single();
  if (error) return json({ error: error.message }, 500);
  return json({ item: data });
}
