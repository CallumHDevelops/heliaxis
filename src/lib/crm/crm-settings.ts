import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { cleanCrmSettings, DEFAULT_CRM_SETTINGS, storedSteps, type CrmSettings } from './settings-shared';

const KEY = 'crm-settings';

/** The saved settings. Throws if they can't be read or nothing is saved yet: for what mustn't be decided from the defaults. */
export async function getSavedCrmSettings(): Promise<CrmSettings> {
  const { data, error } = await createAdminClient().from('cms_kv').select('value').eq('key', KEY).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.value) throw new Error('CRM settings are not saved');
  const saved = JSON.parse(data.value);
  return cleanCrmSettings({ ...DEFAULT_CRM_SETTINGS, ...saved, sequence: storedSteps(saved.sequence ?? DEFAULT_CRM_SETTINGS.sequence) });
}

export async function getCrmSettings(): Promise<CrmSettings> {
  return getSavedCrmSettings().catch(() => DEFAULT_CRM_SETTINGS);
}

export async function saveCrmSettings(s: CrmSettings) {
  const { error } = await createAdminClient()
    .from('cms_kv')
    .upsert({ key: KEY, value: JSON.stringify(s), updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}
