import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Microsoft 365 (Graph, app-only): send email from the shared mailbox (e.g. hello@heliaxis.co.uk),
 * pick up replies and emails sent from Outlook, and read and write calendars (survey booking reads
 * the surveyor's diary; src/lib/booking/calendar-sync.ts writes the Outlook copy of surveys,
 * installs and diary entries). Off until the MS_* env vars are set — see CRM_GUIDE.md.
 */

const GRAPH = 'https://graph.microsoft.com/v1.0';

export function msConfigured() {
  return !!(process.env.MS_TENANT_ID && process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET && process.env.MS_MAILBOX);
}
export const mailbox = () => process.env.MS_MAILBOX || '';

let cached: { token: string; exp: number } | null = null;
async function token() {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const r = await fetch(`https://login.microsoftonline.com/${process.env.MS_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID!,
      client_secret: process.env.MS_CLIENT_SECRET!,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
    cache: 'no-store',
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new Error(d.error_description || 'Microsoft sign-in failed — check MS_CLIENT_SECRET');
  cached = { token: d.access_token, exp: Date.now() + (Number(d.expires_in) || 3000) * 1000 };
  return cached.token;
}

/** A Graph error with its HTTP status and code (e.g. 404 ErrorItemNotFound, 403 ErrorAccessDenied). */
export class GraphError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code = '') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * One Graph call. A caller's Prefer replaces the default; 429 waits (up to 5 s) and tries once more;
 * absolute @odata.nextLink URLs are accepted as the path.
 */
async function graph<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const headers = new Headers({ Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' });
  new Headers(init.headers).forEach((v, k) => headers.set(k, v));
  if (!headers.has('Prefer')) headers.set('Prefer', 'outlook.body-content-type="text"');
  const r = await fetch(path.startsWith('https://') ? path : `${GRAPH}${path}`, { ...init, headers, cache: 'no-store' });
  if (r.status === 429 && !retried) {
    const wait = Math.min(5, Math.max(1, Number(r.headers.get('Retry-After')) || 1));
    await new Promise((res) => setTimeout(res, wait * 1000));
    return graph<T>(path, init, true);
  }
  if (r.status === 202 || r.status === 204) return {} as T;
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new GraphError(d?.error?.message || `Microsoft returned ${r.status}`, r.status, d?.error?.code || '');
  return d as T;
}

export type MailAttachment = { name: string; contentType: string; bytes: Uint8Array };

/** Send from the shared mailbox. Returns the message's internetMessageId (to match it in Sent Items). */
export async function sendMail(opts: { to: string; subject: string; text: string; /** A branded HTML version; `text` is then only the fallback. */ html?: string; attachments?: MailAttachment[]; replyTo?: string }) {
  const box = encodeURIComponent(mailbox());
  const draft = await graph<{ id: string; internetMessageId: string }>(`/users/${box}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      subject: opts.subject,
      body: opts.html ? { contentType: 'HTML', content: opts.html } : { contentType: 'Text', content: opts.text },
      toRecipients: [{ emailAddress: { address: opts.to } }],
      ...(opts.replyTo ? { replyTo: [{ emailAddress: { address: opts.replyTo } }] } : {}),
      attachments: (opts.attachments ?? []).map((a) => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: a.name,
        contentType: a.contentType,
        contentBytes: Buffer.from(a.bytes).toString('base64'),
      })),
    }),
  });
  await graph(`/users/${box}/messages/${draft.id}/send`, { method: 'POST' });
  return draft.internetMessageId;
}

/* ── Calendars ────────────────────────────────────────────────────────────────── */

/** Stored event ids must never change, so every calendar call asks for immutable ids. */
const IMMUTABLE = 'IdType="ImmutableId"';
const READ_PREFER = `${IMMUTABLE}, outlook.timezone="UTC", outlook.body-content-type="text"`;

export type CalEvent = {
  id: string;
  iCalUId?: string;
  subject: string;
  start: Date;
  end: Date;
  isAllDay: boolean;
  /** All-day events: UK dates, `allDayTo` exclusive. */
  allDayFrom?: string;
  allDayTo?: string;
  showAs: string;
  isCancelled: boolean;
  sensitivity: string;
  response?: string;
  isOnlineMeeting: boolean;
  categories: string[];
  location: { displayName?: string; postalCode?: string; street?: string; city?: string; lat?: number; lng?: number } | null;
  bodyPreview: string;
  transactionId?: string;
};

export type CalWrite = {
  subject: string;
  start?: Date;
  end?: Date;
  allDay?: { from: string; toExclusive: string };
  location?: { displayName: string; street?: string; city?: string; postalCode?: string };
  body: string;
  categories?: string[];
  showAs?: 'busy' | 'tentative';
  transactionId?: string;
};

/** The event isn't there any more (deleted in Outlook). */
export class CalendarNotFound extends Error {}

type GraphDate = { dateTime?: string; timeZone?: string };
type GraphEvent = {
  id: string;
  iCalUId?: string;
  subject?: string | null;
  start?: GraphDate;
  end?: GraphDate;
  isAllDay?: boolean;
  showAs?: string;
  isCancelled?: boolean;
  sensitivity?: string;
  responseStatus?: { response?: string };
  isOnlineMeeting?: boolean;
  categories?: string[];
  bodyPreview?: string;
  transactionId?: string | null;
  location?: {
    displayName?: string;
    address?: { street?: string; city?: string; postalCode?: string };
    coordinates?: { latitude?: number; longitude?: number };
  } | null;
};

/** Graph's "2026-10-21T09:00:00.0000000" (UTC, as asked for) → a Date. */
const utc = (d?: GraphDate) => new Date(`${(d?.dateTime || '').slice(0, 23)}Z`);
const ukYmd = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

function toCalEvent(e: GraphEvent): CalEvent {
  const start = utc(e.start);
  const end = utc(e.end);
  const loc = e.location;
  const lat = loc?.coordinates?.latitude;
  const lng = loc?.coordinates?.longitude;
  const ev: CalEvent = {
    id: e.id,
    iCalUId: e.iCalUId,
    subject: e.subject || '',
    start,
    end,
    isAllDay: !!e.isAllDay,
    showAs: String(e.showAs || 'busy'),
    isCancelled: !!e.isCancelled,
    sensitivity: String(e.sensitivity || 'normal'),
    response: e.responseStatus?.response,
    isOnlineMeeting: !!e.isOnlineMeeting,
    categories: Array.isArray(e.categories) ? e.categories : [],
    location:
      loc && (loc.displayName || loc.address || loc.coordinates)
        ? {
            displayName: loc.displayName || undefined,
            postalCode: loc.address?.postalCode || undefined,
            street: loc.address?.street || undefined,
            city: loc.address?.city || undefined,
            ...(typeof lat === 'number' && typeof lng === 'number' && (lat !== 0 || lng !== 0) ? { lat, lng } : {}),
          }
        : null,
    bodyPreview: e.bodyPreview || '',
    transactionId: e.transactionId || undefined,
  };
  if (ev.isAllDay) {
    // Noon either side lands on the right UK date whichever way Graph sends midnight.
    ev.allDayFrom = ukYmd(start.getTime() + 12 * 3_600_000);
    ev.allDayTo = ukYmd(end.getTime() + 12 * 3_600_000);
  }
  return ev;
}

const CAL_SELECT =
  'subject,start,end,isAllDay,showAs,isCancelled,sensitivity,responseStatus,location,locations,isOnlineMeeting,categories,bodyPreview,type,transactionId,iCalUId';

/**
 * Everything in a mailbox's calendar between two moments (recurring events expanded). Read in 7-day
 * chunks one after another (Graph allows about 4 requests at once per mailbox), following
 * @odata.nextLink, without repeats.
 */
export async function calendarView(mailbox: string, from: Date, to: Date, o: { signal?: AbortSignal } = {}): Promise<CalEvent[]> {
  const box = encodeURIComponent(mailbox);
  const seen = new Map<string, CalEvent>();
  const WEEK = 7 * 24 * 3_600_000;
  for (let a = from.getTime(); a < to.getTime(); a += WEEK) {
    const b = Math.min(a + WEEK, to.getTime());
    let next: string | null =
      `/users/${box}/calendarView?startDateTime=${new Date(a).toISOString()}&endDateTime=${new Date(b).toISOString()}` +
      `&$top=100&$select=${CAL_SELECT}`;
    for (let page = 0; next && page < 20; page++) {
      const d: { value?: GraphEvent[]; '@odata.nextLink'?: string } = await graph(next, { headers: { Prefer: READ_PREFER }, signal: o.signal });
      for (const e of d.value ?? []) if (e?.id && !seen.has(e.id)) seen.set(e.id, toCalEvent(e));
      next = d['@odata.nextLink'] ?? null;
    }
  }
  return [...seen.values()].sort((x, y) => x.start.getTime() - y.start.getTime());
}

const isoUtc = (d: Date) => d.toISOString().slice(0, 19);

/** The Graph body for an event. Never any attendees: Outlook would email the customer. */
function eventBody(e: Partial<CalWrite>) {
  const out: Record<string, unknown> = {};
  if (e.subject !== undefined) out.subject = e.subject;
  if (e.body !== undefined) out.body = { contentType: 'Text', content: e.body };
  if (e.allDay) {
    out.isAllDay = true;
    out.start = { dateTime: `${e.allDay.from}T00:00:00`, timeZone: 'Europe/London' };
    out.end = { dateTime: `${e.allDay.toExclusive}T00:00:00`, timeZone: 'Europe/London' };
  } else if (e.start && e.end) {
    out.isAllDay = false;
    out.start = { dateTime: isoUtc(e.start), timeZone: 'UTC' };
    out.end = { dateTime: isoUtc(e.end), timeZone: 'UTC' };
  }
  if (e.location !== undefined) {
    out.location = {
      displayName: e.location.displayName,
      address: { street: e.location.street || '', city: e.location.city || '', postalCode: e.location.postalCode || '', countryOrRegion: 'United Kingdom' },
    };
  }
  if (e.categories !== undefined) out.categories = e.categories;
  if (e.showAs !== undefined) out.showAs = e.showAs;
  if (e.transactionId !== undefined) out.transactionId = e.transactionId;
  return out;
}

export async function createCalendarEvent(mailbox: string, e: CalWrite): Promise<{ id: string; iCalUId?: string }> {
  const d = await graph<{ id: string; iCalUId?: string }>(`/users/${encodeURIComponent(mailbox)}/events`, {
    method: 'POST',
    headers: { Prefer: IMMUTABLE },
    body: JSON.stringify({ ...eventBody(e), isReminderOn: !e.allDay, responseRequested: false }),
  });
  return { id: d.id, iCalUId: d.iCalUId };
}

/** Throws CalendarNotFound if it was deleted in Outlook. */
export async function updateCalendarEvent(mailbox: string, id: string, e: Partial<CalWrite>): Promise<void> {
  try {
    await graph(`/users/${encodeURIComponent(mailbox)}/events/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { Prefer: IMMUTABLE },
      body: JSON.stringify(eventBody(e)),
    });
  } catch (err) {
    if (err instanceof GraphError && err.status === 404) throw new CalendarNotFound(err.message);
    throw err;
  }
}

/** One event (null if it was deleted), e.g. to check it's in the past before touching it. */
export async function getCalendarEvent(mailbox: string, id: string): Promise<CalEvent | null> {
  try {
    const e = await graph<GraphEvent>(`/users/${encodeURIComponent(mailbox)}/events/${encodeURIComponent(id)}?$select=${CAL_SELECT}`, {
      headers: { Prefer: READ_PREFER },
    });
    return e?.id ? toCalEvent(e) : null;
  } catch (err) {
    if (err instanceof GraphError && err.status === 404) return null;
    throw err;
  }
}

/** Already gone counts as done. */
export async function deleteCalendarEvent(mailbox: string, id: string): Promise<void> {
  try {
    await graph(`/users/${encodeURIComponent(mailbox)}/events/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Prefer: IMMUTABLE } });
  } catch (err) {
    if (err instanceof GraphError && err.status === 404) return;
    throw err;
  }
}

/** Can the CRM read this mailbox's calendar? The error is in plain words for the settings screen. */
export async function testCalendar(mailbox: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!msConfigured()) return { ok: false, error: 'Microsoft 365 isn’t connected yet.' };
  try {
    const now = Date.now();
    await graph(
      `/users/${encodeURIComponent(mailbox)}/calendarView?startDateTime=${new Date(now).toISOString()}` +
        `&endDateTime=${new Date(now + 3_600_000).toISOString()}&$top=1&$select=subject`,
      { headers: { Prefer: READ_PREFER }, signal: AbortSignal.timeout(8000) }
    );
    return { ok: true };
  } catch (err) {
    const status = err instanceof GraphError ? err.status : 0;
    if (status === 401 || status === 403) {
      return {
        ok: false,
        error: 'Access denied: this mailbox isn’t in the CRM’s Microsoft 365 access. Add it to the same access as hello@ and callum@ (see the Microsoft 365 to-do).',
      };
    }
    if (status === 404) return { ok: false, error: 'There’s no Microsoft 365 mailbox with this address.' };
    return { ok: false, error: err instanceof Error ? err.message : 'Couldn’t reach Microsoft 365.' };
  }
}

type GraphMessage = {
  internetMessageId: string;
  subject: string | null;
  body?: { content?: string };
  bodyPreview?: string;
  from?: { emailAddress?: { address?: string } };
  toRecipients?: { emailAddress?: { address?: string } }[];
  receivedDateTime?: string;
  sentDateTime?: string;
  hasAttachments?: boolean;
};

const POLL_KEY = 'ms365-poll';

/**
 * Every minute: new emails in the inbox (customer replies) and in Sent Items (sent from Outlook),
 * matched to customers by email address and saved to their timeline. Returns how many were added.
 */
export async function pollMailbox(onInbound: (enquiryId: string, name: string, subject: string) => Promise<void>) {
  if (!msConfigured()) return 0;
  const db = createAdminClient();
  const { data: kv } = await db.from('cms_kv').select('value').eq('key', POLL_KEY).maybeSingle();
  const since = kv?.value || new Date(Date.now() - 15 * 60_000).toISOString();
  const startedAt = new Date().toISOString();
  const box = encodeURIComponent(mailbox());
  const sel = 'internetMessageId,subject,body,bodyPreview,from,toRecipients,receivedDateTime,sentDateTime,hasAttachments';
  const [inbox, sent] = await Promise.all([
    graph<{ value: GraphMessage[] }>(
      `/users/${box}/mailFolders/inbox/messages?$select=${sel}&$top=50&$orderby=receivedDateTime&$filter=receivedDateTime ge ${since}`
    ),
    graph<{ value: GraphMessage[] }>(
      `/users/${box}/mailFolders/sentitems/messages?$select=${sel}&$top=50&$orderby=sentDateTime&$filter=sentDateTime ge ${since}`
    ),
  ]);

  const me = mailbox().toLowerCase();
  let added = 0;
  const handle = async (m: GraphMessage, direction: 'in' | 'out') => {
    const other =
      direction === 'in'
        ? m.from?.emailAddress?.address
        : m.toRecipients?.map((r) => r.emailAddress?.address).find((a) => a && a.toLowerCase() !== me);
    if (!other) return;
    const { data: enq } = await db
      .from('enquiries')
      .select('id, name')
      .ilike('email', other.trim())
      .order('created_at', { ascending: false })
      .limit(1);
    let e = enq?.[0];
    if (!e) {
      // An address kept on a customer when two records were merged (src/lib/crm/merge.ts).
      const { mergedInto } = await import('@/lib/crm/aliases');
      const hit = await mergedInto('email', other, db);
      if (hit) e = (await db.from('enquiries').select('id, name').eq('id', hit.enquiry_id).maybeSingle()).data ?? undefined;
    }
    if (!e) return;
    // Their latest job that's still going (not complete or lost), else their latest.
    const { data: proj } = await db.from('crm_projects').select('id, stage').eq('enquiry_id', e.id).order('created_at', { ascending: false }).limit(20);
    const job = (proj ?? []).find((p) => p.stage !== 'complete' && p.stage !== 'lost') ?? proj?.[0];
    const { error } = await db.from('crm_emails').insert({
      enquiry_id: e.id,
      project_id: job?.id ?? null,
      graph_id: m.internetMessageId,
      direction,
      subject: m.subject,
      body: (m.body?.content || m.bodyPreview || '').trim().slice(0, 4000),
      from_address: direction === 'in' ? other : mailbox(),
      to_address: direction === 'in' ? mailbox() : other,
      at: (direction === 'in' ? m.receivedDateTime : m.sentDateTime) || new Date().toISOString(),
    });
    if (error) return; // duplicate (already recorded when sent from the CRM)
    added++;
    if (direction === 'in') {
      await db.from('crm_projects').update({ sequence_stopped_at: new Date().toISOString() }).eq('enquiry_id', e.id).is('sequence_stopped_at', null);
      await onInbound(e.id, e.name, m.subject || '(no subject)');
    } else {
      const { markContacted } = await import('@/lib/crm/server');
      await markContacted({ enquiryId: e.id });
    }
  };
  for (const m of inbox.value ?? []) await handle(m, 'in');
  for (const m of sent.value ?? []) await handle(m, 'out');
  await db.from('cms_kv').upsert({ key: POLL_KEY, value: startedAt, updated_at: startedAt });
  return added;
}
