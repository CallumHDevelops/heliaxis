import 'server-only';
import { after } from 'next/server';
import { parseKv, toKv } from '@/lib/kv-json';
import { createAdminClient } from '@/lib/supabase/admin';
import { canAccess } from '@/lib/portals';
import { notify } from '@/lib/notify';
import { logActivity } from '@/lib/crm/server';

/**
 * Where a customer has got to with their quote link: opened it, looked at the PDF, started to accept, started to decline or chose
 * dates, with when. Kept in cms_kv (no SQL), shown on the quote and the job's timeline. Only meaningful steps are written to the
 * timeline (the first of each, and a return visit at most every six hours); the first opening and the start of accepting also ping the team.
 * Called from the browser (a link-preview robot never runs it) and from the PDF route.
 */
export const TRACK_EVENTS = ['opened', 'viewed_pdf', 'sign_started', 'decline_started', 'dates_started'] as const;
/** Sections of the customer's page we note being scrolled into view. */
export const TRACK_SECTIONS = ['quote', 'steps', 'dates', 'messages', 'contact'] as const;
export type TrackEvent = (typeof TRACK_EVENTS)[number];

export type QuoteTrack = {
  opens: number;
  firstOpenedAt?: string;
  lastOpenedAt?: string;
  pdfViewedAt?: string;
  signStartedAt?: string;
  declineStartedAt?: string;
  datesStartedAt?: string;
  lastLoggedOpenAt?: string;
  /** Seconds the page was open and on screen, all visits together, and the sections they scrolled to. */
  engagedSeconds?: number;
  lastEngagedAt?: string;
  sections?: string[];
  declined?: { at: string; reason: string };
};

const key = (projectId: string) => `quote-track:${projectId}`;
const HOUR = 3_600_000;

export async function readTrack(projectId: string): Promise<QuoteTrack> {
  const { data } = await createAdminClient().from('cms_kv').select('value').eq('key', key(projectId)).maybeSingle();
  const t = parseKv<QuoteTrack>(data?.value);
  return { ...t, opens: Number(t.opens) || 0 };
}

async function save(projectId: string, t: QuoteTrack) {
  await createAdminClient().from('cms_kv').upsert({ key: key(projectId), value: toKv(t), updated_at: new Date().toISOString() });
}

type Proj = { id: string; enquiry_id: string; owner_id?: string | null; title: string };

/** Tell whoever looks after the job, or the whole CRM team when nobody does. */
export async function tellTeam(p: Proj, n: { kind: string; title: string; body?: string }) {
  const db = createAdminClient();
  let ids: string[] = p.owner_id ? [p.owner_id] : [];
  if (!ids.length) {
    const { data: people } = await db.from('profiles').select('*').eq('status', 'approved');
    ids = (people ?? []).filter((x) => canAccess(x, 'crm')).map((x) => x.id as string);
  }
  await Promise.all(ids.map((userId) => notify({ userId, kind: n.kind, title: n.title, body: n.body, href: `/admin/crm/${p.id}`, tag: `${n.kind}-${p.id}` })));
}

export async function recordQuoteEvent(p: Proj, ev: TrackEvent): Promise<void> {
  const now = new Date();
  const at = now.toISOString();
  const t = await readTrack(p.id);
  const log = (body: string) => logActivity({ enquiryId: p.enquiry_id, projectId: p.id, kind: 'system', body });
  if (ev === 'opened') {
    const first = !t.firstOpenedAt;
    // A visit is an opening more than half an hour after the last one: a refresh is not another visit.
    const newVisit = first || now.getTime() - Date.parse(t.lastOpenedAt ?? at) > HOUR / 2;
    t.lastOpenedAt = at;
    if (first) t.firstOpenedAt = at;
    if (newVisit) t.opens += 1;
    if (first) {
      await log('Customer opened their quote link for the first time');
      t.lastLoggedOpenAt = at;
      after(() => tellTeam(p, { kind: 'crm_quote_opened', title: `Quote opened: ${p.title}`, body: 'The customer has opened their quote.' }));
    } else if (newVisit && now.getTime() - Date.parse(t.lastLoggedOpenAt ?? '1970-01-01') > 6 * HOUR) {
      await log(`Customer opened their quote again (visit ${t.opens})`);
      t.lastLoggedOpenAt = at;
    }
  } else if (ev === 'viewed_pdf' && !t.pdfViewedAt) {
    t.pdfViewedAt = at;
    await log('Customer opened the quote PDF');
  } else if (ev === 'sign_started' && !t.signStartedAt) {
    t.signStartedAt = at;
    await log('Customer started to accept the quote');
    after(() => tellTeam(p, { kind: 'crm_quote_accepting', title: `Customer is accepting: ${p.title}`, body: 'They have opened the sign box.' }));
  } else if (ev === 'decline_started' && !t.declineStartedAt) {
    t.declineStartedAt = at;
    await log('Customer opened the decline box');
  } else if (ev === 'dates_started' && !t.datesStartedAt) {
    t.datesStartedAt = at;
    await log('Customer is choosing installation dates');
  } else return;
  await save(p.id, t);
}

/** The customer declined, with their reason: recorded, on the timeline, and the team told. */
export async function recordDecline(p: Proj, reason: string): Promise<void> {
  const t = await readTrack(p.id);
  t.declined = { at: new Date().toISOString(), reason };
  await save(p.id, t);
  await logActivity({ enquiryId: p.enquiry_id, projectId: p.id, kind: 'note', body: `Customer declined the quote${reason ? `: ${reason}` : ' (no comment)'}` });
  after(() => tellTeam(p, { kind: 'crm_quote_declined', title: `Quote declined: ${p.title}`, body: reason || 'No comment given.' }));
}

/** The page's heartbeat: seconds it has been on screen since the last beat (never more than 45, never faster than every 8 s) and the sections seen. */
export async function recordEngagement(p: { id: string }, seconds: number, sections: string[]): Promise<void> {
  const t = await readTrack(p.id);
  const now = Date.now();
  if (t.lastEngagedAt && now - Date.parse(t.lastEngagedAt) < 8_000) return;
  const add = Math.max(0, Math.min(45, Math.round(seconds) || 0));
  const seen = sections.filter((x): x is (typeof TRACK_SECTIONS)[number] => (TRACK_SECTIONS as readonly string[]).includes(x));
  if (!add && !seen.length) return;
  t.engagedSeconds = (t.engagedSeconds ?? 0) + add;
  t.lastEngagedAt = new Date(now).toISOString();
  t.sections = [...new Set([...(t.sections ?? []), ...seen])];
  await save(p.id, t);
}
