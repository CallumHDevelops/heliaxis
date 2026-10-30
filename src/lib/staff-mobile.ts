import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { toMsisdn } from '@/lib/sms';

/** A team member's own mobile, for texts to them (a copy of what a customer gets). Kept in cms_kv, asked for once. */
const key = (userId: string) => `staff-mobile:${userId}`;

export async function readStaffMobile(userId: string): Promise<string | null> {
  const { data } = await createAdminClient().from('cms_kv').select('value').eq('key', key(userId)).maybeSingle();
  return toMsisdn(typeof data?.value === 'string' ? data.value : null);
}

export async function saveStaffMobile(userId: string, phone: string): Promise<string | null> {
  const msisdn = toMsisdn(phone);
  if (!msisdn) return null;
  await createAdminClient().from('cms_kv').upsert({ key: key(userId), value: msisdn, updated_at: new Date().toISOString() });
  return msisdn;
}
