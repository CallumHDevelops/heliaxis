import 'server-only';
import { installDayList, ukBankHolidays, ukDay } from '@/lib/bank-holidays';
import { getBookingSettings } from '@/lib/booking/settings-server';
import { installCalendar } from '@/lib/install-dates';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Installations already on each day: booked installs (every working day they run) and other customers' provisional holds.
 * `exceptProjectId` leaves out the customer asking, so changing their own date doesn't count against them.
 */
export async function installLoad(hols: ReadonlySet<string>, exceptProjectId?: string): Promise<Map<string, number>> {
  const db = createAdminClient();
  const since = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const [{ data: booked }, { data: held }] = await Promise.all([
    db.from('crm_projects').select('id, install_at, install_days').gte('install_at', since).neq('stage', 'lost').limit(500),
    db.from('crm_projects').select('id, install_pref').not('install_pref', 'is', null).is('install_at', null).neq('stage', 'lost').limit(500),
  ]);
  const load = new Map<string, number>();
  const add = (d: string) => load.set(d, (load.get(d) ?? 0) + 1);
  for (const p of booked ?? []) {
    if (p.id === exceptProjectId || !p.install_at) continue;
    for (const d of installDayList(ukDay(String(p.install_at)), Number(p.install_days) || 1, hols)) add(d);
  }
  for (const p of held ?? []) {
    const pref = p.install_pref as { dates?: string[]; provisional?: boolean } | null;
    if (p.id === exceptProjectId || !pref?.provisional) continue;
    for (const d of (pref.dates ?? []).slice(0, 1)) add(d);
  }
  return load;
}

export async function calendarFor(today: string, from: string | null, exceptProjectId?: string) {
  const [hols, settings] = await Promise.all([ukBankHolidays(), getBookingSettings()]);
  const load = await installLoad(hols, exceptProjectId);
  return { hols, cal: installCalendar(today, from, hols, new Set(settings.closedDates), load) };
}
