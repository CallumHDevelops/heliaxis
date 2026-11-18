import 'server-only';
import { randomUUID } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseKv, toKv } from '@/lib/kv-json';
import { ukBankHolidays } from '@/lib/bank-holidays';
import { notify } from '@/lib/notify';
import { findCallRequest } from '@/lib/email/call-request';
import { entryFromInput, loadDiary, surveyorProfileId, type EntryRow } from '@/lib/booking/diary';
import { basePlace } from '@/lib/booking/book';
import { getBookingSettings } from '@/lib/booking/settings-server';
import { ukDate, ukTime } from '@/lib/booking/engine';
import { logActivity } from '@/lib/crm/server';

/**
 * A customer's email or WhatsApp asks for a call at a particular time: check the diary for that time, then ask the person who owns
 * the job "Brandon has asked for a call at 12:00 today. Add to the diary?". Nothing goes in the diary until they say yes.
 */
const KEY = 'call-suggestions';
const CALL_MINUTES = 15;
const MIN = 60_000;

export type CallSuggestion = {
  id: string;
  enquiryId: string;
  projectId: string | null;
  name: string;
  /** Where it came from: an email's id or a WhatsApp message's id, so one message makes one suggestion. */
  source: string;
  via: 'email' | 'whatsapp';
  at: string;
  label: string;
  snippet: string;
  /** What is already in the diary then ("Survey: Jones 11:30 to 12:30"), empty when it is free. */
  clash: string[];
  /** The next time that day with 15 free minutes, when there is a clash. */
  nextFree: string | null;
  /** Whose diary (an Outlook address). */
  surveyor: string;
  status: 'open' | 'added' | 'dismissed';
  at_created: string;
};

type Db = ReturnType<typeof createAdminClient>;
async function read(db: Db): Promise<CallSuggestion[]> {
  const { data } = await db.from('cms_kv').select('value').eq('key', KEY).maybeSingle();
  const v = parseKv<{ items: CallSuggestion[] }>(data?.value);
  return Array.isArray(v.items) ? v.items : [];
}
async function write(db: Db, items: CallSuggestion[]) {
  await db.from('cms_kv').upsert({ key: KEY, value: toKv({ items: items.slice(0, 200) }), updated_at: new Date().toISOString() });
}

export async function openSuggestions(db: Db, o: { projectId?: string; enquiryId?: string }): Promise<CallSuggestion[]> {
  const now = Date.now();
  return (await read(db)).filter((s) => s.status === 'open' && (o.projectId ? s.projectId === o.projectId : s.enquiryId === o.enquiryId) && Date.parse(s.at) > now - 30 * MIN);
}

/** What the diary has at that time, and the next free quarter hour. Never throws: if the diary can't be read, it says nothing is known. */
async function diaryAround(atMs: number, surveyorKey: string): Promise<{ clash: string[]; nextFree: number | null; known: boolean }> {
  try {
    const s = await getBookingSettings();
    const sv = s.surveyors.find((x) => x.key === surveyorKey) ?? s.surveyors[0];
    if (!sv) return { clash: [], nextFree: null, known: false };
    const base = await basePlace(sv);
    if (!base) return { clash: [], nextFree: null, known: false };
    const day = ukDate(atMs);
    const d = await loadDiary(sv, day, day, { s, base, hols: await ukBankHolidays(), fresh: true });
    if (!d.outlookOk && d.outlookError) return { clash: [], nextFree: null, known: false };
    const busy = d.items.filter((i) => !i.allDayBlock || i.kind === 'outlook').sort((a, b) => a.start - b.start);
    const end = atMs + CALL_MINUTES * MIN;
    const hit = (from: number) => busy.filter((i) => i.start < from + CALL_MINUTES * MIN && i.end > from);
    const clash = hit(atMs).map((i) => `${i.private ? 'Busy' : i.label} ${ukTime(i.start)} to ${ukTime(i.end)}`);
    let nextFree: number | null = null;
    if (clash.length) for (let t = Math.max(end, atMs + 15 * MIN); t < atMs + 8 * 60 * MIN; t += 15 * MIN) if (!hit(t).length && ukDate(t) === day) { nextFree = t; break; }
    return { clash, nextFree, known: true };
  } catch {
    return { clash: [], nextFree: null, known: false };
  }
}

/** Look at a message; if it asks for a call at a clear time, save a suggestion and tell the owner. Returns it, or null. */
export async function suggestCall(x: { enquiryId: string; name: string; body: string; source: string; via: 'email' | 'whatsapp'; receivedAt?: string }, tellTeam: (title: string, body: string, href: string) => Promise<unknown>): Promise<CallSuggestion | null> {
  try {
    const req = findCallRequest(x.body, x.receivedAt ? new Date(x.receivedAt) : new Date());
    if (!req) return null;
    const db = createAdminClient();
    const all = await read(db);
    if (all.some((s) => s.source === x.source)) return null;
    // Their job and who owns it: that person is asked, and it's their diary that's checked.
    const { data: jobs } = await db.from('crm_projects').select('id, stage, owner_id, created_at').eq('enquiry_id', x.enquiryId).order('created_at', { ascending: false }).limit(20);
    const job = (jobs ?? []).find((j) => j.stage !== 'complete' && j.stage !== 'lost') ?? (jobs ?? [])[0] ?? null;
    const s = await getBookingSettings();
    let surveyor = s.surveyors[0]?.key ?? '';
    if (job?.owner_id) for (const sv of s.surveyors) if ((await surveyorProfileId(sv)) === job.owner_id) surveyor = sv.key;
    const { clash, nextFree, known } = await diaryAround(req.at.getTime(), surveyor);
    const first = x.name.trim().split(/\s+/)[0] || 'The customer';
    const sug: CallSuggestion = {
      id: randomUUID(),
      enquiryId: x.enquiryId,
      projectId: (job?.id as string | null) ?? null,
      name: x.name,
      source: x.source,
      via: x.via,
      at: req.at.toISOString(),
      label: req.label,
      snippet: req.snippet,
      clash: known ? clash : [],
      nextFree: nextFree ? new Date(nextFree).toISOString() : null,
      surveyor,
      status: 'open',
      at_created: new Date().toISOString(),
    };
    await write(db, [sug, ...all]);
    const href = job ? `/admin/crm/${job.id}` : `/admin/enquiries/inbox/${x.enquiryId}`;
    const title = `${first} has asked for a call ${req.label}`;
    const body = !known ? 'I couldn’t read your diary to check. Add to diary?' : clash.length ? `Clash: ${clash[0]}${clash.length > 1 ? ` and ${clash.length - 1} more` : ''}.${nextFree ? ` Free from ${ukTime(nextFree)}.` : ''} Add to diary anyway?` : 'You’re free then. Add to diary?';
    if (job?.owner_id) await notify({ userId: job.owner_id as string, kind: 'call_request', title, body, href, tag: `callreq-${sug.id}` });
    else await tellTeam(title, body, href);
    return sug;
  } catch {
    return null;
  }
}

/** Yes: put the call in the diary (15 minutes, online so no postcode), copied to Outlook by the diary's sync. */
export async function addSuggestionToDiary(id: string, by: { id: string; name: string }, db: Db = createAdminClient()): Promise<{ ok: true } | { ok: false; error: string }> {
  const all = await read(db);
  const sug = all.find((s) => s.id === id);
  if (!sug) return { ok: false, error: 'That suggestion is gone.' };
  if (sug.status !== 'open') return { ok: false, error: 'That one has already been dealt with.' };
  const startMs = Date.parse(sug.at);
  const made = await entryFromInput(
    { surveyor_key: sug.surveyor, kind: 'other', title: `Call ${sug.name}`, where_kind: 'online', starts_at: new Date(startMs).toISOString(), ends_at: new Date(startMs + CALL_MINUTES * MIN).toISOString(), project_id: sug.projectId },
    null,
    await getBookingSettings()
  );
  if ('error' in made) return { ok: false, error: made.error };
  const { data, error } = await db.from('diary_entries').insert({ ...made.row, created_by: by.id }).select('*').single();
  if (error || !data) return { ok: false, error: error?.message || 'Not saved' };
  void (data as EntryRow);
  await write(db, all.map((s) => (s.id === id ? { ...s, status: 'added' } : s)));
  await logActivity({ enquiryId: sug.enquiryId, projectId: sug.projectId, kind: 'system', body: `Call with ${sug.name} added to the diary for ${sug.label}`, byId: by.id }).catch(() => null);
  return { ok: true };
}

export async function dismissSuggestion(id: string, db: Db = createAdminClient()) {
  const all = await read(db);
  await write(db, all.map((s) => (s.id === id && s.status === 'open' ? { ...s, status: 'dismissed' } : s)));
}
