import { cleanSettings } from '@/lib/whatsapp/settings-shared';
import { getSettings, saveSettings } from '@/lib/whatsapp/settings';
import { json, session } from '@/lib/whatsapp/routes';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await session())) return json({ error: 'unauthorized' }, 401);
  return json({ settings: await getSettings() });
}

export async function PUT(req: Request) {
  const s = await session();
  if (!s) return json({ error: 'unauthorized' }, 401);
  // Merged with what's saved, so a page can change one setting (WhatsApp templates → Use for).
  const current = await getSettings();
  const settings = cleanSettings({ ...current, ...(await req.json().catch(() => ({}))) });
  // What every new Meta lead receives automatically: admins only.
  if (s.profile.role !== 'admin') settings.firstContactTemplate = current.firstContactTemplate;
  try {
    await saveSettings(settings);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Not saved' }, 500);
  }
  return json({ settings });
}
