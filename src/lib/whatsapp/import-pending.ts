/**
 * Chats added on the import page (Enquiries → Import → WhatsApp chats) and not imported yet. Each
 * one stays on the page, on any computer, until it's imported or removed, with the choices made for
 * it: its text is kept privately in Storage and a small entry in cms_kv says what it is
 * (/api/whatsapp/import/pending). Pure and dependency-free, so the page, the server and
 * scripts/test-wa-import-pending.mjs share it.
 */

/** One cms_kv row per chat, not one list, so two added at once can't lose either. */
export const PENDING_PREFIX = 'wa-import-pending:';
export const pendingKey = (id: string) => `${PENDING_PREFIX}${id}`;

/** A chat's id is the SHA-256 of its text, so the same chat can't be on the list twice. */
export const isPendingId = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);
/** Where its text is kept: a random name made on the server, never the file's own. */
export const isPendingPath = (s: unknown): s is string => typeof s === 'string' && /^pending\/[0-9a-f-]{36}\.txt$/.test(s);

/** The same as the server's id for the text; null where the browser can't work it out (not https). */
export async function chatHash(text: string): Promise<string | null> {
  try {
    const d = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

export type ChosenCustomer = { id: string; name: string; phone: string | null; email: string | null; byPhone: boolean };

export type PendingChoices = {
  /** The "Heliaxis is" choice: `a:<author>`, or 'none' (only the customer wrote). Absent: the page's best guess. */
  us?: string;
  /**
   * Who it's for, once picked by hand: someone in the CRM, a new lead, or still searching ("Find
   * them in the CRM" with nobody picked yet). Absent: found by number or name again, as for a new file.
   */
  customer?: ({ kind: 'match' } & ChosenCustomer) | { kind: 'new'; name: string; phone: string } | { kind: 'search'; q: string };
};

/** What the page gets for each chat. */
export type PendingChat = {
  id: string;
  fileName: string;
  /** The customer's name from the file name, or null. */
  title: string | null;
  /** Bytes of chat text. */
  size: number;
  uploadedAt: string;
  uploadedBy: { id: string; name: string | null };
  choices: PendingChoices;
};

/** As stored in cms_kv: also where its text is. */
export type PendingEntry = PendingChat & { path: string };

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const orNull = (v: unknown, max: number) => (typeof v === 'string' && v ? v.slice(0, max) : null);

/** Choices as sent by the page or read back, with anything unexpected left out. Lengths as the import route takes them. */
export function cleanChoices(v: unknown): PendingChoices {
  const o = obj(v);
  const out: PendingChoices = {};
  if (o.us === 'none' || (typeof o.us === 'string' && o.us.startsWith('a:') && o.us.length > 2 && o.us.length <= 202)) out.us = o.us;
  const c = obj(o.customer);
  if (c.kind === 'match' && typeof c.id === 'string' && /^[0-9a-f-]{36}$/i.test(c.id)) {
    out.customer = {
      kind: 'match',
      id: c.id,
      name: str(c.name, 200),
      phone: orNull(c.phone, 40),
      email: orNull(c.email, 320),
      byPhone: c.byPhone === true,
    };
  } else if (c.kind === 'new') {
    out.customer = { kind: 'new', name: str(c.name, 200), phone: str(c.phone, 40) };
  } else if (c.kind === 'search') {
    out.customer = { kind: 'search', q: str(c.q, 80) };
  }
  return out;
}

/** A cms_kv value back as an entry, or null if it isn't one. */
export function readEntry(raw: unknown): PendingEntry | null {
  let v: unknown;
  try {
    v = typeof raw === 'string' ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
  const o = obj(v);
  if (!isPendingId(o.id) || !isPendingPath(o.path)) return null;
  const by = obj(o.uploadedBy);
  return {
    id: o.id,
    path: o.path,
    fileName: str(o.fileName, 255),
    title: orNull(o.title, 200),
    size: typeof o.size === 'number' && o.size >= 0 ? o.size : 0,
    uploadedAt: str(o.uploadedAt, 40),
    uploadedBy: { id: str(by.id, 64), name: orNull(by.name, 200) },
    choices: cleanChoices(o.choices),
  };
}

/** An entry without where it's stored, for the page. */
export function shownChat({ id, fileName, title, size, uploadedAt, uploadedBy, choices }: PendingEntry): PendingChat {
  return { id, fileName, title, size, uploadedAt, uploadedBy, choices };
}

/** The parts of an import row that are kept with it. */
export type RowChoices = {
  us?: string;
  /** The customer was chosen by hand (otherwise it's looked up again each visit). */
  picked: boolean;
  match: ChosenCustomer | null;
  adding: boolean;
  newName: string;
  newPhone: string;
  q: string;
};

/** What to save for a row. */
export function choicesOf(r: RowChoices): PendingChoices {
  const out: PendingChoices = {};
  if (r.us) out.us = r.us;
  if (r.picked) {
    const m = r.match;
    out.customer = m
      ? { kind: 'match', id: m.id, name: m.name, phone: m.phone, email: m.email, byPhone: m.byPhone }
      : r.adding
        ? { kind: 'new', name: r.newName, phone: r.newPhone }
        : { kind: 'search', q: r.q };
  }
  return cleanChoices(out);
}

/** A row's fields from saved choices (the opposite of choicesOf). */
export function restoreChoices(c: PendingChoices): Partial<RowChoices> & { picked: boolean } {
  const out: Partial<RowChoices> & { picked: boolean } = { us: c.us, picked: !!c.customer };
  const k = c.customer;
  if (k?.kind === 'match') {
    Object.assign(out, { match: { id: k.id, name: k.name, phone: k.phone, email: k.email, byPhone: k.byPhone }, adding: false });
  } else if (k?.kind === 'new') {
    Object.assign(out, { match: null, adding: true, newName: k.name, newPhone: k.phone });
  } else if (k?.kind === 'search') {
    Object.assign(out, { match: null, adding: false, q: k.q });
  }
  return out;
}

/** "Saved today by Callum", "Saved 18 Oct", "Saved 3 Mar 2025", in UK time. */
export function savedLabel(iso: string, by: string | null, now = new Date()): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return 'Saved';
  // YYYY-MM-DD in UK time.
  const day = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  const today = day(now);
  const [y, m, d] = today.split('-').map(Number);
  const yesterday = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
  const then = day(t);
  const when =
    then === today
      ? 'today'
      : then === yesterday
        ? 'yesterday'
        : t.toLocaleDateString('en-GB', {
            timeZone: 'Europe/London',
            day: 'numeric',
            month: 'short',
            ...(then.slice(0, 4) === today.slice(0, 4) ? {} : { year: 'numeric' }),
          });
  return `Saved ${when}${by ? ` by ${by}` : ''}`;
}
