import 'server-only';
import { randomUUID } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseKv, toKv } from '@/lib/kv-json';
import { ukBankHolidays } from '@/lib/bank-holidays';
import { notify } from '@/lib/notify';
import { findCallAsk, findCallRequest, quickReplies, type QuickReply } from '@/lib/email/call-request';
import { freeStarts, WINDOWS, type Busy } from '@/lib/email/slots';
import { msConfigured, sendMail } from '@/lib/ms365';
import { sendManual } from '@/lib/whatsapp/inbox';
import { entryFromInput, loadDiary, surveyorProfileId, type EntryRow } from '@/lib/booking/diary';
import { basePlace } from '@/lib/booking/book';
import { getBookingSettings } from '@/lib/booking/settings-server';
import { londonSlot, ukDate, ukTime } from '@/lib/booking/engine';
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
  /** 'time': they named a time (the diary is checked). 'ask': they want a call but gave no time (a reply asking what time suits). */
  kind: 'time' | 'ask';
  /** The reply to send (editable before it goes), and the other quick replies to choose from. */
  reply: string;
  replies: QuickReply[];
  /** Free times offered, "10:00" style. */
  times: string[];
  replied?: boolean;
  /** The email's subject, for "Re: …". */
  subject?: string;
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
  status: 'open' | 'added' | 'dismissed' | 'replied';
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
  return (await read(db)).filter(
    (s) =>
      s.status === 'open' &&
      (o.projectId ? s.projectId === o.projectId : s.enquiryId === o.enquiryId) &&
      // A time they named is stale half an hour after it; a request with no time stays for a day.
      (s.kind === 'ask' ? Date.parse(s.at_created) > now - 24 * 3_600_000 : Date.parse(s.at) > now - 30 * MIN)
  );
}

/** What the diary has at that time, and the next free quarter hour. Never throws: if the diary can't be read, it says nothing is known. */
async function diaryAround(atMs: number, surveyorKey: string): Promise<{ clash: string[]; nextFree: number | null; known: boolean; busy: Busy[] }> {
  try {
    const s = await getBookingSettings();
    const sv = s.surveyors.find((x) => x.key === surveyorKey) ?? s.surveyors[0];
    if (!sv) return { clash: [], nextFree: null, known: false, busy: [] };
    const base = await basePlace(sv);
    if (!base) return { clash: [], nextFree: null, known: false, busy: [] };
    const day = ukDate(atMs);
    const d = await loadDiary(sv, day, day, { s, base, hols: await ukBankHolidays(), fresh: true });
    if (!d.outlookOk && d.outlookError) return { clash: [], nextFree: null, known: false, busy: [] };
    const busy = d.items.filter((i) => !i.allDayBlock || i.kind === 'outlook').sort((a, b) => a.start - b.start);
    const end = atMs + CALL_MINUTES * MIN;
    const hit = (from: number) => busy.filter((i) => i.start < from + CALL_MINUTES * MIN && i.end > from);
    const clash = hit(atMs).map((i) => `${i.private ? 'Busy' : i.label} ${ukTime(i.start)} to ${ukTime(i.end)}`);
    let nextFree: number | null = null;
    if (clash.length) for (let t = Math.max(end, atMs + 15 * MIN); t < atMs + 8 * 60 * MIN; t += 15 * MIN) if (!hit(t).length && ukDate(t) === day) { nextFree = t; break; }
    return { clash, nextFree, known: true, busy: busy.map((i) => ({ start: i.start, end: i.end })) };
  } catch {
    return { clash: [], nextFree: null, known: false, busy: [] };
  }
}

/** Look at a message; if it asks for a call at a clear time, save a suggestion and tell the owner. Returns it, or null. */
export async function suggestCall(x: { enquiryId: string; name: string; body: string; source: string; via: 'email' | 'whatsapp'; receivedAt?: string; subject?: string }, tellTeam: (title: string, body: string, href: string) => Promise<unknown>): Promise<CallSuggestion | null> {
  try {
    const when = x.receivedAt ? new Date(x.receivedAt) : new Date();
    const req = findCallRequest(x.body, when);
    const ask = req ? null : findCallAsk(x.body, when);
    if (!req && !ask) return null;
    const db = createAdminClient();
    const all = await read(db);
    if (all.some((s) => s.source === x.source)) return null;
    // Their job and who owns it: that person is asked, and it's their diary that's checked.
    const { data: jobs } = await db.from('crm_projects').select('id, stage, owner_id, created_at').eq('enquiry_id', x.enquiryId).order('created_at', { ascending: false }).limit(20);
    const job = (jobs ?? []).find((j) => j.stage !== 'complete' && j.stage !== 'lost') ?? (jobs ?? [])[0] ?? null;
    const s = await getBookingSettings();
    let surveyor = s.surveyors[0]?.key ?? '';
    if (job?.owner_id) for (const sv of s.surveyors) if ((await surveyorProfileId(sv)) === job.owner_id) surveyor = sv.key;
    const first = x.name.trim().split(/\s+/)[0] || 'The customer';
    // Who is writing back: the job's owner, else whoever's diary it is.
    let me = 'Heliaxis';
    const meId = (job?.owner_id as string | null) ?? null;
    if (meId) {
      const { data: who } = await db.from('profiles').select('full_name').eq('id', meId).maybeSingle();
      me = String(who?.full_name ?? '').trim().split(/\s+/)[0] || me;
    }
    // The diary for the day they mean: the time they named, or the day (and part of it) they asked for.
    const dayMs = req ? req.at.getTime() : londonSlot(ask!.ymd, '12:00');
    const diary = await diaryAround(dayMs, surveyor);
    const { clash, nextFree, known, busy } = diary;
    // Free times to offer: nearest the asked-for time when it clashes; inside the part of the day when no time was given.
    const soon = Date.now() + 30 * 60_000;
    let startsMs: number[] = [];
    if (known && req && clash.length) startsMs = freeStarts(busy, ukDate(dayMs), WINDOWS.day, soon, { count: 12, spacing: 30 }).sort((a, b) => Math.abs(a - dayMs) - Math.abs(b - dayMs)).slice(0, 3).sort((a, b) => a - b);
    if (known && ask) startsMs = freeStarts(busy, ask.ymd, WINDOWS[ask.bit ?? 'day'], soon);
    const times = startsMs.map((t) => ukTime(t));
    const replies = quickReplies(req ? { kind: 'time', first, label: req.label, me, channel: x.via, times, clash: clash.length > 0 } : { kind: 'ask', first, part: ask!.part, me, channel: x.via, times, clash: false });
    const sug: CallSuggestion = {
      id: randomUUID(),
      kind: req ? 'time' : 'ask',
      reply: replies[0].text,
      replies,
      times,
      subject: x.subject,
      enquiryId: x.enquiryId,
      projectId: (job?.id as string | null) ?? null,
      name: x.name,
      source: x.source,
      via: x.via,
      at: req ? req.at.toISOString() : '',
      label: req ? req.label : ask!.part ? `${ask!.part}, no time given` : 'no time given',
      snippet: (req ?? ask)!.snippet,
      clash: known ? clash : [],
      nextFree: nextFree ? new Date(nextFree).toISOString() : null,
      surveyor,
      status: 'open',
      at_created: new Date().toISOString(),
    };
    await write(db, [sug, ...all]);
    const href = job ? `/admin/crm/${job.id}` : `/admin/enquiries/inbox/${x.enquiryId}`;
    const title = req ? `${first} has asked for a call ${req.label}` : `${first} wants a call${ask!.part ? ` ${ask!.part}` : ''}`;
    const text = !req
      ? times.length ? `They gave no time. You’re free at ${times.join(', ')}: a reply offering them is ready.` : 'They gave no time. A reply asking what suits is ready to send.'
      : !known
        ? 'I couldn’t read your diary to check. Add to diary?'
        : clash.length
          ? `Clash: ${clash[0]}${clash.length > 1 ? ` and ${clash.length - 1} more` : ''}.${nextFree ? ` Free from ${ukTime(nextFree)}.` : ''} Add to diary anyway?`
          : 'You’re free then. Add to diary?';
    if (job?.owner_id) await notify({ userId: job.owner_id as string, kind: 'call_request', title, body: text, href, tag: `callreq-${sug.id}` });
    else await tellTeam(title, text, href);
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
  if (sug.kind === 'ask') return { ok: false, error: 'They didn’t name a time, so there’s nothing to add yet.' };
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

/** Send the reply (edited or not) by the way they wrote: an email back to them, or a WhatsApp. */
export async function sendSuggestionReply(id: string, text: string, by: { id: string; name: string }, db: Db = createAdminClient()): Promise<{ ok: true } | { ok: false; error: string }> {
  const all = await read(db);
  const sug = all.find((s) => s.id === id);
  if (!sug) return { ok: false, error: 'That suggestion is gone.' };
  const body = text.trim();
  if (!body) return { ok: false, error: 'Write the reply first.' };
  if (sug.via === 'whatsapp') {
    const r = await sendManual(sug.enquiryId, by.id, { text: body });
    if (!r.ok) return { ok: false, error: r.error || 'The WhatsApp didn’t go.' };
  } else {
    if (!msConfigured()) return { ok: false, error: 'Email isn’t set up.' };
    const { data: c } = await db.from('enquiries').select('id, email').eq('id', sug.enquiryId).maybeSingle();
    if (!c?.email) return { ok: false, error: 'They have no email address.' };
    const subject = /^re:/i.test(sug.subject ?? '') ? (sug.subject as string) : `Re: ${sug.subject || 'Your Heliaxis enquiry'}`;
    let graphId: string;
    try {
      graphId = await sendMail({ to: c.email as string, subject, text: body });
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'The email didn’t go.' };
    }
    await db.from('crm_emails').insert({ enquiry_id: sug.enquiryId, project_id: sug.projectId, graph_id: graphId, direction: 'out', subject, body: body.slice(0, 4000), from_address: process.env.MS_MAILBOX, to_address: c.email, at: new Date().toISOString() });
  }
  // A time they named can still be added to the diary; a request with no time is dealt with once answered.
  await write(db, all.map((s) => (s.id === id ? { ...s, replied: true, status: s.kind === 'ask' ? 'replied' : s.status } : s)));
  await logActivity({ enquiryId: sug.enquiryId, projectId: sug.projectId, kind: 'system', body: `Replied to ${sug.name}’s request for a call by ${sug.via === 'whatsapp' ? 'WhatsApp' : 'email'}`, byId: by.id }).catch(() => null);
  return { ok: true };
}
