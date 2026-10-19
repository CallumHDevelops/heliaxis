import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, json } from '@/lib/crm/server';
import { schemaReady } from '@/lib/schema-ready';
import { addDays, londonSlot, ukDate } from '@/lib/booking/engine';
import { entryFromInput, entryView, type EntryRow } from '@/lib/booking/diary';
import { getBookingSettings } from '@/lib/booking/settings-server';
import { readBody } from '@/lib/booking/rate-limit';

export const dynamic = 'force-dynamic';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** His own diary entries overlapping ?from&to (UK dates; default the next 3 weeks), optionally for one ?surveyor. */
export async function GET(req: Request) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  if (!(await schemaReady()).booking) return json({ ready: false, entries: [] });
  const q = new URL(req.url).searchParams;
  const today = ukDate(Date.now());
  const from = YMD.test(q.get('from') || '') ? (q.get('from') as string) : today;
  const to = YMD.test(q.get('to') || '') ? (q.get('to') as string) : addDays(from, 20);
  const surveyor = (q.get('surveyor') || '').toLowerCase();
  const db = createAdminClient();
  const a = new Date(londonSlot(from, '00:00')).toISOString();
  const b = new Date(londonSlot(addDays(to, 1), '00:00')).toISOString();
  let timed = db.from('diary_entries').select('*').is('deleted_at', null).eq('all_day', false).lt('starts_at', b).gt('ends_at', a);
  let allDay = db.from('diary_entries').select('*').is('deleted_at', null).eq('all_day', true).lte('day_from', to).gte('day_to', from);
  if (surveyor) {
    timed = timed.eq('surveyor_key', surveyor);
    allDay = allDay.eq('surveyor_key', surveyor);
  }
  const [t, d] = await Promise.all([timed.limit(500), allDay.limit(500)]);
  const rows = [...((t.data ?? []) as EntryRow[]), ...((d.data ?? []) as EntryRow[])];
  rows.sort((x, y) => (x.starts_at || `${x.day_from}T00:00`).localeCompare(y.starts_at || `${y.day_from}T00:00`));
  return json({ ready: true, entries: rows.map(entryView) });
}

/** + Add to my diary. The postcode is looked up on save; the sync copies it to Outlook. */
export async function POST(req: Request) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!(await schemaReady()).booking) return json({ error: 'Run survey-booking.sql in Supabase first.' }, 409);
  const made = await entryFromInput(await readBody(req), null, await getBookingSettings());
  if ('error' in made) return json({ error: made.error }, 400);
  const { data, error } = await createAdminClient()
    .from('diary_entries')
    .insert({ ...made.row, created_by: s.user.id })
    .select('*')
    .single();
  if (error || !data) return json({ error: error?.message || 'Not saved' }, 500);
  return json({ entry: entryView(data as EntryRow) });
}
