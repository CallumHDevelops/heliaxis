import { listTemplates } from '@/lib/whatsapp/api';
import { json, session } from '@/lib/whatsapp/routes';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await session())) return json({ error: 'unauthorized' }, 401);
  return json({ items: await listTemplates() });
}
