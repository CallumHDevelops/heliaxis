import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { cleanHandoverSettings, DEFAULT_HANDOVER_SETTINGS, type HandoverSettings } from './settings-shared';

/** Handover pack settings in cms_kv (no SQL needed), as the site and CRM settings are. Never throws on read. */
const KEY = 'handover-settings';

export async function getHandoverSettings(): Promise<HandoverSettings> {
  try {
    const { data } = await createAdminClient().from('cms_kv').select('value').eq('key', KEY).maybeSingle();
    return data?.value ? cleanHandoverSettings({ ...DEFAULT_HANDOVER_SETTINGS, ...JSON.parse(data.value) }) : DEFAULT_HANDOVER_SETTINGS;
  } catch {
    return DEFAULT_HANDOVER_SETTINGS;
  }
}

export async function saveHandoverSettings(s: HandoverSettings) {
  const { error } = await createAdminClient()
    .from('cms_kv')
    .upsert({ key: KEY, value: JSON.stringify(cleanHandoverSettings(s)), updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}
