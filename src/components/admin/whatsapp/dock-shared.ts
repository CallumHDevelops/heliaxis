/**
 * The WhatsApp dock's rules, shared by the admin layout (server), the dock (browser) and
 * scripts/test-dock.mjs. Pure: `import type` only and erasable TypeScript, so the test runs it with
 * `node --experimental-strip-types`.
 *
 * The dock sits on the right of every desktop admin page (src/app/admin/layout.tsx). Each page starts
 * it open, folded to a strip of chat heads, hidden (the WhatsApp inbox, where the chat already fills
 * the page) or not at all, worked out here from the URL. The person's own open/folded choice is kept
 * in the `hx-dock` cookie and wins after that.
 *
 * The record page (Unit P) talks to the dock only through the window events and the DOM below, never
 * by importing this file, so either can ship first.
 */
import type { CrmDoc } from '@/app/admin/crm/[id]/ProjectExtras';

/** Window events (`window.dispatchEvent(new CustomEvent(name, { detail }))`). */
export const DOCK_EVENTS = {
  /** Dock → page, no detail: the dock has mounted (a record page that's already loaded sends its job again). */
  ready: 'hx:dock-ready',
  /** Page → dock, `DockJob | null`: the record page's customer, whenever it loads or changes; null when it goes. */
  job: 'hx:dock-job',
  /** Page → dock, `DockOpenDetail`: open the dock (docked from 1280px, over the page below that). */
  open: 'hx:dock-open',
  /** Dock → page, `DockStateDetail`: after every change, and after each `hx:dock-job`. */
  state: 'hx:dock-state',
  /** Dock → page, `DockActionDetail`: e.g. "Add mobile" in This job. */
  action: 'hx:dock-action',
  /** Dock → page and menu, `WaCounts`: after each poll of the chat list. */
  counts: 'hx:wa-counts',
} as const;

/** This page's dock: open (the panel), collapsed (the 56px strip), hidden (inbox pages) or none (no dock). */
export type DockState = 'open' | 'collapsed' | 'hidden' | 'none';
export type DockAccess = { inbox: boolean; crm: boolean };
/** One half of the remembered choice: open, folded, or not chosen yet. */
export type DockPick = 'o' | 'c' | '-';
/** a = pages that start open (CRM home, job pages); b = pages that start folded (everything else). */
export type DockChoice = { a: DockPick; b: DockPick };
export type CrmView = 'home' | 'board' | 'list';
/** 'all' is "All active" (the last 14 days); 'everyone' is "All chats" (any history, imported too). */
export type ChatFilter = 'needs_reply' | 'unread' | 'all' | 'waiting' | 'everyone';

/** The record page's customer, for the dock's This job tab. */
export type DockJob = {
  projectId: string;
  /** The job's customer (enquiries.id). */
  enquiryId: string;
  /** Every enquiry on the same WhatsApp number; at least [enquiryId]. */
  enquiryIds: string[];
  /** The enquiry the live chat is on; null = no mobile number. */
  threadId: string | null;
  waId: string | null;
  name: string;
  ref: string | null;
  customerRef: string | null;
  stage: string;
  unread: number;
  docs: CrmDoc[];
};

export type DockOpenDetail = {
  tab?: 'job' | 'chats';
  threadId?: string;
  /** Opens this customer's chat (the dock looks up their number). */
  enquiryId?: string;
  /** whatsapp_messages.id to scroll to and highlight. */
  messageId?: string;
  filter?: ChatFilter;
  /** Fills an empty reply box, or goes on a new line after what's there. */
  draft?: string;
  /** Puts the cursor in the reply box. */
  focus?: boolean;
};

export type DockStateDetail = {
  state: DockState;
  /** The panel is on screen (docked open from 1280px, or the overlay). */
  panel: boolean;
  overlay: boolean;
  /** Set while the empty #hx-dock-tasks element is on screen for the record page's Tasks card. */
  tasksSlot: 'hx-dock-tasks' | null;
};

export type DockActionDetail = { action: 'edit-customer'; projectId: string };

/** unread = people (WhatsApp numbers) with unread messages. */
export type WaCounts = { unread: number; needsReply: number; active: number };
export type ActiveCounts = WaCounts & { waiting: number };

/** One WhatsApp number in GET /api/whatsapp/active. */
export type ActiveChat = {
  /** The enquiry the live chat is on (the latest message), as /api/whatsapp/conversations/{id}. */
  threadId: string;
  enquiryIds: string[];
  /** Those of enquiryIds with unread messages. */
  unreadIds: string[];
  waId: string | null;
  name: string;
  phone: string | null;
  customerRef: string | null;
  postcode: string | null;
  last: { direction: 'in' | 'out'; body: string | null; kind: string; at: string } | null;
  unread: number;
  /** They wrote last and nothing is queued. */
  needsReply: boolean;
  /** The free 24-hour reply window: their last message plus 24h (null = never messaged us). */
  windowClosesAt: string | null;
  queued: boolean;
  chasing: boolean;
  /** The latest open opportunity on this number (not Complete or Lost). */
  project: { id: string; ref: string | null; stage: string; title: string } | null;
  /** Any opportunity at all, open or not. */
  hasProject: boolean;
  /** The full chat: the inbox for Enquiries staff, otherwise /admin/crm/chats/{threadId}. */
  chatHref: string;
};

export type ActiveList = { v: string; configured: boolean; canInbox: boolean; counts: ActiveCounts; rows: ActiveChat[] };
/** A page of "All chats" (GET /api/whatsapp/active?all=1): `next` gives the page after, null at the end. */
export type AllChatsPage = { rows: ActiveChat[]; next: string | null };

export const NO_CHOICE: DockChoice = { a: '-', b: '-' };
export const DOCK_COOKIE = 'hx-dock';
export const CRM_VIEW_COOKIE = 'hx-crm-view';
/** Path=/admin, a year, so it's sent with every admin page and the server paints the right state first. */
export const COOKIE_ATTRS = 'Path=/admin; Max-Age=31536000; SameSite=Lax';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const JOB_PAGE = new RegExp(`^/admin/(?:crm|projects)/(${UUID})$`, 'i');

/** Every page under these starts with the strip. */
const FOLDED_SECTIONS = [
  '/admin/crm',
  '/admin/projects',
  '/admin/surveys',
  '/admin/enquiries',
  '/admin/tasks',
  '/admin/cms',
  '/admin/analytics',
  '/admin/users',
  '/admin/setup',
  '/admin/assistant',
  '/admin/sso',
  '/admin/app',
];
/** The chat already fills these pages. */
const HIDDEN_SECTIONS = ['/admin/enquiries/inbox', '/admin/crm/chats'];
/** Pages with no dock even though they sit under a section above (Unit S's offline survey shell). */
const NO_DOCK = ['/admin/surveys/shell'];

const under = (p: string, section: string) => p === section || p.startsWith(`${section}/`);
const tidy = (path: string) => (path.split(/[?#]/)[0].replace(/\/+$/, '') || '/');

/** The CRM view the page shows: ?view= first, then the hx-crm-view cookie, then Home. */
export function crmViewOf(param: string | null | undefined, cookie: string | null | undefined): CrmView {
  for (const v of [param, cookie]) if (v === 'home' || v === 'board' || v === 'list') return v;
  return 'home';
}

/** The job id on a record page (/admin/crm/{id} or /admin/projects/{id}), or null. */
export function jobIdFromPath(path: string): string | null {
  return JOB_PAGE.exec(tidy(path))?.[1].toLowerCase() ?? null;
}

/**
 * How this page starts the dock, before the person's own choice. Anything not listed (previews,
 * printable subcontractor pages, the legacy redirects) has no dock. A new admin section needs adding
 * to FOLDED_SECTIONS.
 */
export function dockDefaultFor(path: string, crmView: CrmView | string): DockState {
  const p = tidy(path);
  if (!under(p, '/admin')) return 'none';
  if (HIDDEN_SECTIONS.some((s) => under(p, s))) return 'hidden';
  if (NO_DOCK.some((s) => under(p, s))) return 'none';
  if (p === '/admin/crm') return crmView === 'board' || crmView === 'list' ? 'collapsed' : 'open';
  if (JOB_PAGE.test(p)) return 'open';
  if (p === '/admin' || p === '/admin/blog' || p === '/admin/subcontractors') return 'collapsed';
  // A subcontractor's page, but not their printable agreement or NTP pages.
  if (/^\/admin\/subcontractors\/[^/]+$/.test(p)) return 'collapsed';
  if (FOLDED_SECTIONS.some((s) => under(p, s))) return 'collapsed';
  return 'none';
}

/** The page's state once access and the remembered choice are applied. */
export function effectiveDock(def: DockState, choice: DockChoice, access: DockAccess): DockState {
  if (!access.inbox && !access.crm) return 'none';
  if (def === 'hidden' || def === 'none') return def;
  const pick = def === 'open' ? choice.a : choice.b;
  return pick === 'o' ? 'open' : pick === 'c' ? 'collapsed' : def;
}

/** The choice after opening or folding the dock on a page that starts `def`. */
export function chooseDock(choice: DockChoice, def: DockState, open: boolean): DockChoice {
  const pick: DockPick = open ? 'o' : 'c';
  return def === 'open' ? { ...choice, a: pick } : { ...choice, b: pick };
}

/**
 * The hx-dock cookie: "{first 8 of the user id}.{a}.{b}". Someone else's cookie (a shared office PC)
 * counts as no choice, so each person keeps their own.
 */
export function parseDockCookie(value: string | null | undefined, userId: string): DockChoice {
  const m = /^([0-9a-z]{1,8})\.([oc-])\.([oc-])$/i.exec((value ?? '').trim());
  if (!m || !userId || m[1].toLowerCase() !== userId.slice(0, 8).toLowerCase()) return NO_CHOICE;
  return { a: m[2] as DockPick, b: m[3] as DockPick };
}

export const dockCookieValue = (userId: string, c: DockChoice) => `${userId.slice(0, 8)}.${c.a}.${c.b}`;

/** One cookie's value from document.cookie (or a Cookie header). */
export function cookieFrom(cookies: string, name: string): string {
  for (const part of cookies.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return part.slice(i + 1).trim();
      }
    }
  }
  return '';
}

/* ── Customer and job refs (HX-0042, HX-0042-2) ──────────────────────────────────────────────────── */

const REF_QUERY = /^(?:hx[\s-]?(\d{1,6})|(0\d{0,5}))(?:-(\d{1,3}))?$/i;
const REF = /^hx-(\d+)(?:-(\d+))?$/i;

/** "HX-0042", "hx42", "hx-0042-2" or a number starting with 0 ("0042"). "42" on its own isn't a ref. */
export function looksLikeRef(q: string): boolean {
  return REF_QUERY.test(q.trim());
}

/**
 * Does the search `q` find `ref`? Either what was typed is the start of the ref ("HX-004" while typing
 * HX-0042), or the numbers match ("hx42" finds HX-0042 and HX-0042-2; "hx-0042-2" only HX-0042-2).
 */
export function refMatches(q: string, ref: string | null | undefined): boolean {
  const m = REF_QUERY.exec(q.trim());
  const r = REF.exec((ref ?? '').trim());
  if (!m || !r) return false;
  const digits = m[1] ?? m[2];
  const suffix = m[3];
  const typed = `HX-${digits}${suffix ? `-${suffix}` : ''}`;
  if (ref!.trim().toUpperCase().startsWith(typed.toUpperCase())) return true;
  if (Number(r[1]) !== Number(digits)) return false;
  return !suffix || Number(r[2] ?? 0) === Number(suffix);
}

const digitsOf = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

/** The dock's search box: name, number (07700… or +44 7700…), postcode or HX-ref. */
export function chatMatches(q: string, row: Pick<ActiveChat, 'name' | 'phone' | 'waId' | 'postcode' | 'customerRef' | 'project'>): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  if (looksLikeRef(t)) return refMatches(t, row.customerRef) || refMatches(t, row.project?.ref);
  if (row.name.toLowerCase().includes(t)) return true;
  if ((row.postcode ?? '').replace(/\s/g, '').toLowerCase().includes(t.replace(/\s/g, ''))) return true;
  const d = digitsOf(t);
  if (d.length >= 3) {
    const local = d.startsWith('0') ? `44${d.slice(1)}` : d;
    const numbers = [digitsOf(row.phone), digitsOf(row.waId)];
    return numbers.some((n) => n.includes(d) || n.includes(local));
  }
  return false;
}

/**
 * Lists of chats as one, newest message first: the live list's row wins over an older copy of the
 * same chat (All chats and search results aren't polled), and nobody is in it twice.
 */
export function mergeChats(...lists: ActiveChat[][]): ActiveChat[] {
  const out: ActiveChat[] = [];
  for (const list of lists) {
    for (const r of list) {
      const same = (x: ActiveChat) => x.threadId === r.threadId || (!!r.waId && x.waId === r.waId) || x.enquiryIds.some((e) => r.enquiryIds.includes(e));
      if (!out.some(same)) out.push(r);
    }
  }
  const at = (r: ActiveChat) => (r.last?.at ? Date.parse(r.last.at) : 0);
  return out.sort((a, b) => at(b) - at(a));
}

/* ── Small display helpers ───────────────────────────────────────────────────────────────────────── */

/** "Esther Smith" → "ES", "Esther" → "ES", "+44 7700…" → "+44". */
export function initialsOf(name: string): string {
  const n = name.trim();
  if (!n) return '?';
  if (/^\+?\d/.test(n)) return n.replace(/\s/g, '').slice(0, 3);
  const words = n.split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0].slice(0, 2);
  return letters.toUpperCase();
}

/** "Free reply · 18h left" while the 24-hour window is open, otherwise "Template only". */
export function windowPill(closesAt: string | null, now: number): { open: boolean; label: string } {
  const left = closesAt ? new Date(closesAt).getTime() - now : -1;
  if (!now || left <= 0) return { open: false, label: 'Template only' };
  const h = Math.floor(left / 3_600_000);
  return { open: true, label: `Free reply · ${h >= 1 ? `${h}h` : `${Math.max(1, Math.round(left / 60_000))}m`} left` };
}

/** "2m", "3h", "Tue", "12 Oct", "12 Oct 2025": how long ago, as short as the list needs. */
export function shortAgo(iso: string | null | undefined, now: number): string {
  if (!iso || !now) return '';
  const t = new Date(iso).getTime();
  const mins = Math.max(0, Math.round((now - t) / 60_000));
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const d = new Date(t);
  if (hours < 24 * 6) return d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'Europe/London' });
  // An imported chat can be from years back: the year once it's more than about ten months ago.
  if (hours > 24 * 300) return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' });
}
