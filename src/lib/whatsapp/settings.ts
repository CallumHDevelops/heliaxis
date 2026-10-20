import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { cleanSettings, DEFAULT_SETTINGS, type WaSettings } from './settings-shared';

const KEY = 'whatsapp-settings';

export async function getSettings(): Promise<WaSettings> {
  try {
    const { data } = await createAdminClient().from('cms_kv').select('value').eq('key', KEY).maybeSingle();
    // Through cleanSettings, so settings saved before a change (quiet hours in whole hours) read right.
    return cleanSettings(data?.value ? JSON.parse(data.value) : {});
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(s: WaSettings) {
  const { error } = await createAdminClient()
    .from('cms_kv')
    .upsert({ key: KEY, value: JSON.stringify(s), updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}
