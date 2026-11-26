import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import { entryFromInput, entryView, ENTRY_KINDS, type EntryRow } from '@/lib/booking/diary';
import { getBookingSettings } from '@/lib/booking/settings-server';
import { logActivity } from '@/lib/crm/server';
import { schemaReady } from '@/lib/schema-ready';
import { createAdminClient } from '@/lib/supabase/admin';
import { s } from './design-tools';
import type { AssistantAction } from './tools';

/**
 * Metis adds an entry to the diary, through the same checks as the Diary page in HAP (times, postcode lookup, one day at
 * a time). It goes in the user's own diary; it never guesses whose, and never invites or tells anyone else.
 */

const str = { type: 'string' } as const;
const nullable = (description: string) => ({ type: ['string', 'null'], description }) as const;
const obj = (properties: Record<string, unknown>) => ({ type: 'object' as const, properties, required: Object.keys(properties), additionalProperties: false });

export const DIARY_TOOLS: Anthropic.Tool[] = [
  {
    name: 'create_diary_entry',
    description:
      'Add an entry to the user’s own diary (a site visit, install, meeting, personal or other). A timed entry needs day, start and end (UK time, HH:MM); an all-day entry needs day and optionally last_day. Choose where_kind "address" with a postcode (the travel time is worked out from it), "home" or "online". Link it to a customer with project_id when it is about one. It goes in the diary of the person you are talking to.',
    input_schema: obj({
      title: str,
      kind: { type: 'string', enum: [...ENTRY_KINDS] },
      all_day: { type: 'boolean' },
      day: { type: 'string', description: 'YYYY-MM-DD (UK date).' },
      last_day: nullable('Last day of an all-day entry, YYYY-MM-DD, or null.'),
      start: nullable('HH:MM, for a timed entry.'),
      end: nullable('HH:MM, for a timed entry.'),
      where_kind: { type: 'string', enum: ['address', 'home', 'online'] },
      postcode: nullable('Needed when where_kind is address.'),
      address: nullable('Street address, or null.'),
      project_id: nullable('The customer’s opportunity id, or null.'),
      allow_clash: { type: 'boolean', description: 'false normally. true only after the user has seen a clash and said to book it anyway.' },
    }),
  },
];

export const DIARY_NAMES = new Set(DIARY_TOOLS.map((t) => t.name));

export async function runDiaryTool(name: string, input: Record<string, unknown>, me: { id: string; name: string }, actions: AssistantAction[]): Promise<string> {
  if (name !== 'create_diary_entry') return `Unknown tool ${name}`;
  if (!(await schemaReady()).booking) return 'The diary is not set up in HAP yet (supabase/survey-booking.sql).';
  const db = createAdminClient();
  const settings = await getBookingSettings();

  // Whose diary: the person's own. Never guessed.
  const { data: profile } = await db.from('profiles').select('email').eq('id', me.id).maybeSingle();
  const email = String(profile?.email ?? '').toLowerCase();
  const mine = settings.surveyors.filter((sv) => sv.profileEmail.toLowerCase() === email);
  if (mine.length !== 1) return `I can't tell which diary is yours (${settings.surveyors.map((sv) => sv.name).join(', ') || 'none are set up'}), so I have not added anything. Add it from the Diary page in HAP, or ask an admin to link your profile to your diary.`;

  const allDay = input.all_day === true;
  const raw: Record<string, unknown> = { surveyor_key: mine[0].key, kind: s(input.kind), title: s(input.title), all_day: allDay, where_kind: s(input.where_kind) || 'address', postcode: s(input.postcode) || null, address: s(input.address) || null, project_id: s(input.project_id) || null };
  if (allDay) {
    raw.day_from = s(input.day);
    raw.day_to = s(input.last_day) || s(input.day);
  } else {
    raw.day = s(input.day);
    raw.start = s(input.start);
    raw.end = s(input.end);
  }
  const made = await entryFromInput(raw, null, settings);
  if ('error' in made) return `Not added: ${made.error}`;
  // Never double-book without saying: anything already in that diary at that time is shown first.
  if (!allDay && input.allow_clash !== true && made.row.starts_at && made.row.ends_at) {
    const { data: clash } = await db
      .from('diary_entries')
      .select('title, kind, starts_at, ends_at')
      .eq('surveyor_key', mine[0].key)
      .is('deleted_at', null)
      .eq('all_day', false)
      .lt('starts_at', made.row.ends_at)
      .gt('ends_at', made.row.starts_at)
      .limit(5);
    if (clash?.length) {
      const at = (iso: unknown) => new Date(String(iso)).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
      return `Not booked: that clashes with ${clash.map((c) => `${c.title || c.kind} ${at(c.starts_at)}–${at(c.ends_at)}`).join(', ')}. Tell the user, suggest another time (list_diary shows the day), and only book it anyway if they say so (allow_clash true).`;
    }
  }
  const { data, error } = await db.from('diary_entries').insert({ ...made.row, created_by: me.id }).select('*').single();
  if (error || !data) return `Not added: ${error?.message ?? 'no row'}`;
  const v = entryView(data as EntryRow);
  if (made.row.project_id) {
    const { data: p } = await db.from('crm_projects').select('enquiry_id').eq('id', made.row.project_id).maybeSingle();
    if (p) await logActivity({ enquiryId: p.enquiry_id as string, projectId: made.row.project_id, kind: 'system', body: `Diary: ${v.title || v.kindLabel} added by Metis`, byId: me.id });
  }
  actions.push({ kind: 'diary', label: `Diary: ${v.title || v.kindLabel}, ${v.day ?? ''}${v.start ? ` ${v.start}–${v.end}` : ''}`, href: '/admin/surveys' });
  return JSON.stringify({ added: true, title: v.title, kind: v.kindLabel, day: v.day, start: v.start, end: v.end, postcode: v.postcode, note: 'It is in the user’s own diary. HAP’s calendar sync copies it to Outlook as it does for any diary entry. No one else was invited. Offer to send the customer a confirmation (draft_whatsapp or draft_email) if the entry is about a customer.' });
}
