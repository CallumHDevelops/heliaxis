import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCrmSettings } from './crm-settings';

/** Survey slots customers can book from their portal (CRM → Settings → Booking). One survey per slot. */

const TZ = 'Europe/London';

/** UTC instant for a UK wall-clock date + "HH:MM". */
export function londonSlot(date: string, hhmm: string) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  let t = Date.UTC(y, m - 1, d, hh, mm, 0);
  const h = Number(new Date(t).toLocaleString('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }));
  t -= (h - hh) * 3_600_000;
  return new Date(t);
}

export type Slot = { at: string; day: string; time: string };

export async function availableSlots(): Promise<{ enabled: boolean; slots: Slot[] }> {
  const s = await getCrmSettings();
  if (!s.bookingEnabled) return { enabled: false, slots: [] };
  const now = Date.now();
  const earliest = now + s.bookingMinNoticeHours * 3_600_000;
  const latest = now + s.bookingHorizonDays * 86_400_000;
  const { data: taken } = await createAdminClient()
    .from('crm_projects')
    .select('survey_at')
    .gte('survey_at', new Date(earliest).toISOString())
    .lte('survey_at', new Date(latest).toISOString())
    .not('stage', 'eq', 'lost');
  const busy = new Set((taken ?? []).map((t) => new Date(t.survey_at as string).toISOString()));
  const slots: Slot[] = [];
  for (let i = 0; i <= s.bookingHorizonDays; i++) {
    const day = new Date(now + i * 86_400_000).toLocaleDateString('en-CA', { timeZone: TZ });
    const dow = ((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7) + 1; // 1 = Monday
    if (!s.bookingDays.includes(dow)) continue;
    for (const time of s.bookingSlots) {
      const at = londonSlot(day, time);
      if (at.getTime() < earliest || at.getTime() > latest || busy.has(at.toISOString())) continue;
      slots.push({ at: at.toISOString(), day, time });
    }
  }
  return { enabled: true, slots: slots.slice(0, 60) };
}
