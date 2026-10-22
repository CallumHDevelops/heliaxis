import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { cleanSiteSettings, DEFAULT_SITE_SETTINGS, type SiteSettings } from './settings-shared';

/** Site and handover settings in cms_kv (no SQL needed), as crm-settings does. Never throws on read. */
const KEY = 'site-settings';

export async function getSiteSettings(): Promise<SiteSettings> {
  try {
    const { data } = await createAdminClient().from('cms_kv').select('value').eq('key', KEY).maybeSingle();
    return data?.value ? cleanSiteSettings({ ...DEFAULT_SITE_SETTINGS, ...JSON.parse(data.value) }) : DEFAULT_SITE_SETTINGS;
  } catch {
    return DEFAULT_SITE_SETTINGS;
  }
}

export async function saveSiteSettings(s: SiteSettings) {
  const { error } = await createAdminClient()
    .from('cms_kv')
    .upsert({ key: KEY, value: JSON.stringify(cleanSiteSettings(s)), updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}
