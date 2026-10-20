/**
 * The CRM home's two lists across every job: Latest notes (GET /api/crm/activity) and My work
 * (GET /api/crm/my-work). What kind each timeline row is, which rows are milestones, how WhatsApp
 * chats become rows (one per chat per busy day) and merge with the timeline, and which UK-day group a
 * due date falls in.
 *
 * Pure (no imports), so scripts/test-projects.mjs and scripts/test-imported-chats.mjs load it straight
 * into node. Days are 'YYYY-MM-DD' in UK time, worked out by the caller (ukDay in
 * src/lib/bank-holidays.ts).
 */

/** The Latest notes chips, plus the two kinds only shown with "Show stage changes" (or as milestones). */
export type FeedKind = 'note' | 'call' | 'visit' | 'survey' | 'email' | 'doc' | 'stage' | 'update' | 'whatsapp';
/** The timeline's chips (crm_activities). */
export const FEED_CHIPS = ['note', 'call', 'visit', 'survey', 'email', 'doc'] as const;
export type FeedChip = (typeof FEED_CHIPS)[number];
/** Every chip Latest notes shows: the timeline's, then WhatsApp (whatsapp_messages, a row per chat per day). */
export const NOTE_CHIPS = [...FEED_CHIPS, 'whatsapp'] as const;
export type NoteChip = (typeof NOTE_CHIPS)[number];

export type ActivityRow = { kind: string; body: string | null; meta: Record<string, unknown> | null };

/** Rows that come from an import or the automatic WhatsApp/email messages: never in Latest notes. */
const AUTOMATIC =
  /^(Imported\b|Also filled in\b|WhatsApp:|Follow-up \d+ (sent|skipped)|Review request not sent|.* (confirmation|reminder)( \(.*\))? not sent)|Added by import\.$/i;
const DOC = /^(Document added|Survey document added)\b|\bsent for signing\b|\b(marked as signed|no longer marked as signed)\b/i;
const SIGNED = /\b(accepted and signed|marked as signed by)\b/i;
const MILESTONE_STAGES = new Set(['won', 'complete']);

/**
 * What a timeline row is for the feed, and whether it's a milestone (moved to Won or Complete, a quote
 * signed, a survey finished: always shown). `hidden`: imports and automatic messages.
 */
export function classifyActivity(row: ActivityRow): { kind: FeedKind; milestone: boolean; hidden: boolean } {
  const body = (row.body ?? '').trim();
  const meta = row.meta ?? {};
  switch (row.kind) {
    case 'note':
    case 'call':
    case 'email':
      return { kind: row.kind, milestone: false, hidden: meta.via === 'import' };
    case 'visit': {
      const survey = typeof meta.survey_id === 'string' || /\bsurvey\b/i.test(body);
      return { kind: survey ? 'survey' : 'visit', milestone: survey && /\bcompleted\b/i.test(body), hidden: false };
    }
    case 'stage': {
      if (SIGNED.test(body)) return { kind: 'doc', milestone: true, hidden: false };
      const to = typeof meta.to === 'string' ? meta.to : '';
      return { kind: 'stage', milestone: MILESTONE_STAGES.has(to), hidden: false };
    }
    case 'system':
      if (AUTOMATIC.test(body)) return { kind: 'update', milestone: false, hidden: true };
      if (DOC.test(body)) return { kind: 'doc', milestone: SIGNED.test(body), hidden: false };
      return { kind: 'update', milestone: false, hidden: false };
    default:
      // Photos and anything newer: an update.
      return { kind: 'update', milestone: false, hidden: false };
  }
}

/**
 * Is this row in the feed? `chips`: the kinds asked for (all six when none are picked). Documents and
 * signatures count as their own kind. Stage moves and other updates show only with "Show stage
 * changes", except milestones, which show whenever every kind is wanted.
 */
export function inFeed(c: { kind: FeedKind; milestone: boolean; hidden: boolean }, chips: readonly string[], stages: boolean): boolean {
  if (c.hidden) return false;
  if (c.kind === 'stage' || c.kind === 'update') return chips.length === FEED_CHIPS.length && (stages || c.milestone);
  return chips.includes(c.kind);
}

/** The DB kinds worth reading for these chips (fewer rows to page through). */
export function dbKindsFor(chips: readonly string[], stages: boolean): string[] {
  const kinds = new Set<string>();
  for (const c of chips) {
    if (c === 'note' || c === 'call' || c === 'email') kinds.add(c);
    if (c === 'visit' || c === 'survey') kinds.add('visit');
    if (c === 'doc') kinds.add('system').add('stage');
  }
  if (chips.length === FEED_CHIPS.length) {
    kinds.add('stage');
    if (stages) kinds.add('system').add('photo');
  }
  return [...kinds];
}

/**
 * The same as a PostgREST `or` filter, narrowing updates to ones that could be about documents when
 * only those are wanted (most updates are tasks and automatic messages). classifyActivity still has
 * the last word.
 */
export function dbFilterFor(chips: readonly string[], stages: boolean): string {
  const kinds = dbKindsFor(chips, stages);
  const plain = kinds.filter((k) => k !== 'system');
  const parts = plain.length ? [`kind.in.(${plain.join(',')})`] : [];
  if (kinds.includes('system')) {
    parts.push(stages && chips.length === FEED_CHIPS.length ? 'kind.eq.system' : 'and(kind.eq.system,or(body.ilike.*document*,body.ilike.*signed*,body.ilike.*signing*))');
  }
  return parts.join(',');
}

/* ── Latest notes: WhatsApp chats, a row per chat per busy day ──────────────── */

/** A WhatsApp message as Latest notes reads it (whatsapp_messages, without its text). */
export type ChatMessage = {
  id: string;
  enquiry_id: string;
  direction: 'in' | 'out';
  kind: string;
  sent_by: string | null;
  rule_id: string | null;
  /** null = sent from Heliaxis; 'import', 'whatsapp-app', 'chase', … (see whatsapp-chasers.sql). */
  via: string | null;
  created_at: string;
};

/** One chat's day: a row in Latest notes. */
export type ChatDay = {
  /** `wa:{enquiry id}:{day}`, the same on every page and every refresh. */
  id: string;
  enquiryId: string;
  day: string;
  /** The day's last message: where the row sits. */
  at: string;
  count: number;
  /** How many of them came from an import. */
  imported: number;
  /** Written by a person: the customer, someone on the team, or in the WhatsApp Business app. */
  people: number;
  last: ChatMessage;
};

/**
 * A database time as a number of microseconds, for comparing: timestamps come back with up to six
 * decimals ("…:22.5+00:00", "…:22.123456+00:00"), so neither the strings nor Date.parse (milliseconds)
 * put two rows in the same order the database does.
 */
export function micros(iso: string): number {
  const frac = /:\d{2}\.(\d+)/.exec(iso)?.[1] ?? '';
  return Math.floor(Date.parse(iso) / 1000) * 1_000_000 + Number(frac.padEnd(6, '0').slice(0, 6));
}

/**
 * A place in Latest notes, which runs newest first and, at the same moment, by row id from the top down
 * (`wa:…` chat rows before timeline rows). FIRST_AT is the place before every row at that moment.
 */
export type FeedPos = { at: string; key: string };
export const FIRST_AT = '~';

/** Negative when `a` comes before `b` in Latest notes. */
export function feedOrder(a: { at: string; id?: string; key?: string }, b: { at: string; id?: string; key?: string }): number {
  const ka = a.key ?? a.id ?? '';
  const kb = b.key ?? b.id ?? '';
  return micros(b.at) - micros(a.at) || (ka > kb ? -1 : ka < kb ? 1 : 0);
}

/** The `before=` value for the page after `p` (rows after it). */
export const cursorOf = (p: FeedPos) => `${p.at}|${p.key}`;

/** `before=` back as a place: "{time}|{row id}", or a bare time (an older page: everything before that moment). */
export function parseCursor(raw: string | null | undefined): FeedPos | null {
  if (!raw) return null;
  const bar = raw.lastIndexOf('|');
  const at = bar < 0 ? raw : raw.slice(0, bar);
  const key = bar < 0 ? '' : raw.slice(bar + 1);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}(:?\d{2})?)$/.test(at) || !Number.isFinite(Date.parse(at))) return null;
  if (key !== '' && key !== FIRST_AT && !/^[0-9a-z:-]{1,80}$/i.test(key)) return null;
  return { at, key };
}

/** Sent by a person, not an automatic message (a smart reply, chaser, follow-up, reminder or template). */
export const byPerson = (m: Pick<ChatMessage, 'direction' | 'sent_by' | 'via'>) =>
  m.direction === 'in' || !!m.sent_by || m.via === 'import' || m.via === 'whatsapp-app';

/** Messages, newest first, as one row per chat per UK day (newest first). */
export function groupChatDays(messages: ChatMessage[], dayOf: (iso: string) => string): ChatDay[] {
  const out = new Map<string, ChatDay>();
  for (const m of messages) {
    const day = dayOf(m.created_at);
    const id = `wa:${m.enquiry_id}:${day}`;
    let g = out.get(id);
    if (!g) {
      g = { id, enquiryId: m.enquiry_id, day, at: m.created_at, count: 0, imported: 0, people: 0, last: m };
      out.set(id, g);
    }
    // Newest first, but a later read (the rest of a day) can come after: the newest still wins.
    if (micros(m.created_at) > micros(g.at)) {
      g.at = m.created_at;
      g.last = m;
    }
    g.count++;
    if (m.via === 'import') g.imported++;
    if (byPerson(m)) g.people++;
  }
  return [...out.values()].sort(feedOrder);
}

/** Where a read of whatsapp_messages carries on from (newest first, by time then id). */
export type ChatCursor = { at: string; id: string };

/** How Latest notes reads whatsapp_messages (the database on the server; an array in the tests). */
export type ChatReader = {
  /** Up to `limit` messages at or before `before` (or the newest) and after `cursor` in that order, newest first. */
  page: (o: { before: string | null; cursor: ChatCursor | null; limit: number }) => Promise<ChatMessage[]>;
  /** The rest of these chats' messages on a day that was cut short: from `from` up to `cursor`. */
  rest: (enquiryIds: string[], from: string, cursor: ChatCursor) => Promise<ChatMessage[]>;
  /** Which of these chats have messages after `after` and before `to` (shown on the page before). */
  busy: (enquiryIds: string[], after: string, to: string) => Promise<Set<string>>;
};

/**
 * The chat-days after `before` (a place in Latest notes), newest first: whole days only (a day cut short
 * by the read is counted to its start), never one shown on a page before (its day carries on past
 * `before`), and never a day of automatic messages only. `horizon`: how far back it read (null = to the
 * very first message), so rows from the timeline older than that wait for the next page. `dayOf`: ukDay
 * (bank-holidays.ts).
 */
export async function readChatDays(
  r: ChatReader,
  o: { before: FeedPos | null; want: number; dayOf: (iso: string) => string; pageSize?: number; rounds?: number }
): Promise<{ days: ChatDay[]; horizon: FeedPos | null }> {
  const size = o.pageSize ?? 500;
  const rounds = o.rounds ?? 4;
  const from = o.before?.at ?? null;
  const seen: ChatMessage[] = [];
  let cursor: ChatCursor | null = null;
  let done = false;
  // (More reads while every message so far is at the very moment the page starts, so it always moves on.)
  for (let i = 0; i < rounds || (i < rounds + 20 && from && cursor && micros(cursor.at) === micros(from)); i++) {
    const rows = await r.page({ before: from, cursor, limit: size });
    seen.push(...rows);
    if (rows.length < size) {
      done = true;
      break;
    }
    const last = rows[rows.length - 1];
    cursor = { at: last.created_at, id: last.id };
    // Every chat-day newer than the last message's day is whole: stop once there are enough.
    const lastDay = o.dayOf(last.created_at);
    const whole = new Set(seen.filter((m) => o.dayOf(m.created_at) > lastDay).map((m) => `${m.enquiry_id}|${o.dayOf(m.created_at)}`));
    if (whole.size > o.want) break;
  }
  let days = groupChatDays(seen, o.dayOf);
  if (!done && cursor) {
    const day = o.dayOf(cursor.at);
    const cut = days.filter((d) => d.day === day).map((d) => d.enquiryId);
    if (cut.length) days = groupChatDays([...seen, ...(await r.rest(cut, ukDayStart(day), cursor))], o.dayOf);
  }
  if (o.before) {
    const b = o.before;
    // Read again from the middle of a day: a chat that carries on past `before` that day was on a page before.
    const day = o.dayOf(b.at);
    const split = days.filter((d) => d.day === day).map((d) => d.enquiryId);
    const shown = split.length ? await r.busy(split, b.at, ukDayStart(plusDays(day, 1))) : new Set<string>();
    days = days.filter((d) => !(d.day === day && shown.has(d.enquiryId)) && feedOrder(d, b) > 0);
  }
  // Read to `cursor`: every row after its moment is known; one at that moment may not be yet.
  return { days: days.filter((d) => d.people > 0), horizon: done || !cursor ? null : { at: cursor.at, key: FIRST_AT } };
}

/**
 * One page of Latest notes from lists read newest first (the timeline and the chat-days), each read back
 * to its `horizon` (null: to the end; the horizon itself has been read). Rows past the first horizon wait
 * for the next page, as another list may have rows before them. The page is the first `limit`; `next` is
 * the place the next page starts after (cursorOf), null at the end.
 */
export function mergeFeed<T extends { id: string; at: string }>(
  lists: { items: T[]; horizon: FeedPos | null }[],
  limit: number
): { items: T[]; next: FeedPos | null } {
  const horizon = lists.reduce<FeedPos | null>((h, l) => (l.horizon && (!h || feedOrder(l.horizon, h) < 0) ? l.horizon : h), null);
  const known = lists
    .flatMap((l) => l.items)
    .filter((i) => !horizon || feedOrder(i, horizon) <= 0)
    .sort(feedOrder);
  if (known.length > limit) {
    const last = known[limit - 1];
    return { items: known.slice(0, limit), next: { at: last.at, key: last.id } };
  }
  return { items: known, next: horizon };
}

/* ── My work: due dates in UK-day groups ─────────────────────────────────────── */

export type DueGroup = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'nodate';
export const DUE_GROUPS: DueGroup[] = ['overdue', 'today', 'tomorrow', 'week', 'later', 'nodate'];

/** n calendar days after a UK date. */
export function plusDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n, 12));
  return t.toISOString().slice(0, 10);
}

const LONDON_HOUR = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hourCycle: 'h23' });

/** The moment a UK day starts (00:00 in London), as an ISO time, for "from today" database filters. */
export function ukDayStart(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const midnightUtc = Date.UTC(y, m - 1, d);
  // London is on UTC or an hour ahead, so its midnight is that many hours before midnight UTC.
  const ahead = Number(LONDON_HOUR.format(midnightUtc));
  return new Date(midnightUtc - ahead * 3_600_000).toISOString();
}

/** Which group a due day is in, from `today` (both UK dates). "week" is the 5 days after tomorrow. */
export function dueGroup(due: string | null | undefined, today: string): DueGroup {
  if (!due) return 'nodate';
  if (due < today) return 'overdue';
  if (due === today) return 'today';
  if (due === plusDays(today, 1)) return 'tomorrow';
  if (due <= plusDays(today, 6)) return 'week';
  return 'later';
}
