import { cleanSettings } from '@/lib/whatsapp/settings-shared';
import { getSettings, saveSettings } from '@/lib/whatsapp/settings';
import { json, session } from '@/lib/whatsapp/routes';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await session())) return json({ error: 'unauthorized' }, 401);
  return json({ settings: await getSettings() });
}

export async function PUT(req: Request) {
  if (!(await session())) return json({ error: 'unauthorized' }, 401);
  const settings = cleanSettings(await req.json().catch(() => ({})));
  try {
    await saveSettings(settings);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Not saved' }, 500);
  }
  return json({ settings });
}
