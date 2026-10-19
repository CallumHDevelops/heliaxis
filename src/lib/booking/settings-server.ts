import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { cleanBookingSettings, DEFAULT_BOOKING_SETTINGS, type BookingSettings } from './settings';

/** Survey booking settings in cms_kv ('survey-booking'). Unknown or missing keys fall back to the defaults. */

export const BOOKING_KV = 'survey-booking';

let memo: { at: number; value: BookingSettings } | null = null;

/** Never throws: no row (or no table) gives the owner's defaults, booking switched off. */
export async function getBookingSettings(o: { fresh?: boolean } = {}): Promise<BookingSettings> {
  // A short memory cache: one search reads the settings several times.
  if (!o.fresh && memo && Date.now() - memo.at < 5_000) return memo.value;
  let value = DEFAULT_BOOKING_SETTINGS;
  try {
    const { data } = await createAdminClient().from('cms_kv').select('value').eq('key', BOOKING_KV).maybeSingle();
    if (data?.value) value = cleanBookingSettings(JSON.parse(data.value));
  } catch {
    value = DEFAULT_BOOKING_SETTINGS;
  }
  memo = { at: Date.now(), value };
  return value;
}

/** Admins only (the route checks). Saves the cleaned settings and returns them. */
export async function saveBookingSettings(next: unknown): Promise<BookingSettings> {
  const clean = cleanBookingSettings(next);
  const { error } = await createAdminClient()
    .from('cms_kv')
    .upsert({ key: BOOKING_KV, value: JSON.stringify(clean), updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  memo = { at: Date.now(), value: clean };
  return clean;
}
