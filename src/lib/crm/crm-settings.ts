import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { cleanCrmSettings, DEFAULT_CRM_SETTINGS, storedSteps, type CrmSettings } from './settings-shared';

const KEY = 'crm-settings';

export async function getCrmSettings(): Promise<CrmSettings> {
  try {
    const { data } = await createAdminClient().from('cms_kv').select('value').eq('key', KEY).maybeSingle();
    if (!data?.value) return DEFAULT_CRM_SETTINGS;
    const saved = JSON.parse(data.value);
    return cleanCrmSettings({ ...DEFAULT_CRM_SETTINGS, ...saved, sequence: storedSteps(saved.sequence ?? DEFAULT_CRM_SETTINGS.sequence) });
  } catch {
    return DEFAULT_CRM_SETTINGS;
  }
}

export async function saveCrmSettings(s: CrmSettings) {
  const { error } = await createAdminClient()
    .from('cms_kv')
    .upsert({ key: KEY, value: JSON.stringify(s), updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}
