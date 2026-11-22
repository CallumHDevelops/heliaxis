import 'server-only';
import { requireApproved } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { PRIORITY_RANK } from './shared';

/** My email: reads for the screens. Everything is the signed-in person's own mailbox; nobody sees anyone else's. */

type Db = ReturnType<typeof createAdminClient>;

export type MailBox = {
  id: string;
  address: string;
  filing: boolean;
  marketing: boolean;
  drafts: boolean;
  signature: string | null;
  highlight: boolean;
  outlook_drafts: boolean;
  categories_ready: boolean;
  style: string | null;
  style_examples: { to: string; text: string }[] | null;
  style_from: number | null;
  style_at: string | null;
  style_edited: boolean;
  scan_before: string | null;
  sent_before: string | null;
  scan_done_at: string | null;
  last_run_at: string | null;
  last_error: string | null;
  created_at: string;
};

const BOX_COLS = 'id, address, filing, marketing, drafts, signature, highlight, outlook_drafts, categories_ready, style, style_examples, style_from, style_at, style_edited, scan_before, sent_before, scan_done_at, last_run_at, last_error, created_at';

/** The person's mailbox; null if they haven't connected one; 'missing' before mail-sort.sql has been run. */
export async function boxFor(userId: string, db: Db = createAdminClient()): Promise<MailBox | null | 'missing'> {
  const { data, error } = await db.from('mail_boxes').select(BOX_COLS).eq('user_id', userId).maybeSingle();
  if (error) return 'missing';
  return (data as MailBox | null) ?? null;
}

/** For the API routes: the signed-in person and their mailbox, or why not. */
export async function mailSession(): Promise<{ ok: true; userId: string; email: string; box: MailBox | null; db: Db } | { ok: false; status: number; error: string }> {
  const s = await requireApproved();
  if (!s) return { ok: false, status: 401, error: 'unauthorized' };
  const db = createAdminClient();
  const box = await boxFor(s.user.id, db);
  if (box === 'missing') return { ok: false, status: 400, error: 'Run supabase/mail-sort.sql first.' };
  return { ok: true, userId: s.user.id, email: String(s.profile.email || s.user.email || '').toLowerCase(), box, db };
}

export type ThreadRow = {
  id: string;
  subject: string | null;
  who_name: string | null;
  who_address: string | null;
  state: string;
  priority: string | null;
  kind: string | null;
  summary: string | null;
  why: string | null;
  due: string | null;
  prospect: { name?: string; phone?: string; postcode?: string } | null;
  enquiry_id: string | null;
  last_in_at: string | null;
  last_out_at: string | null;
  messages: number;
  draft: string | null;
  draft_for: string | null;
  draft_error: string | null;
  rule: { label: string; folder: string; status: string } | null;
};

export const THREAD_LIST_COLS =
  'id, subject, who_name, who_address, state, priority, kind, summary, why, due, prospect, enquiry_id, last_in_at, last_out_at, messages, draft, draft_for, draft_error, rule:mail_rules(label, folder, status)';

export type View = 'reply' | 'waiting' | 'people' | 'fyi' | 'marketing';

const DAY = 86_400_000;

/** One list on Email: To reply (most important first), Waiting on them, New people, No reply needed, Marketing. */
export async function threadsFor(db: Db, boxId: string, view: View): Promise<ThreadRow[]> {
  let q = db.from('mail_threads').select(THREAD_LIST_COLS).eq('box_id', boxId);
  if (view === 'reply') q = q.eq('state', 'reply');
  else if (view === 'waiting')
    // You emailed last, three or more days ago, in the last six weeks, and nothing has come back.
    q = q
      .eq('state', 'replied')
      .lt('last_out_at', new Date(Date.now() - 3 * DAY).toISOString())
      .gt('last_out_at', new Date(Date.now() - 42 * DAY).toISOString());
  else if (view === 'people') q = q.not('prospect', 'is', null).is('enquiry_id', null);
  else if (view === 'fyi') q = q.in('state', ['fyi', 'done']).gt('last_in_at', new Date(Date.now() - 14 * DAY).toISOString());
  else q = q.eq('state', 'marketing');
  const order = view === 'waiting' ? 'last_out_at' : 'last_in_at';
  const { data } = await q.order(order, { ascending: view === 'waiting', nullsFirst: false }).limit(view === 'reply' ? 200 : 100);
  const rows = ((data ?? []) as unknown as ThreadRow[]).map((r) => ({ ...r, rule: Array.isArray(r.rule) ? (r.rule[0] ?? null) : r.rule }));
  if (view === 'reply') rows.sort(byImportance);
  return rows;
}

/** Urgent first, then high…; within each, the one waiting longest first. */
export function byImportance(a: Pick<ThreadRow, 'priority' | 'last_in_at'>, b: Pick<ThreadRow, 'priority' | 'last_in_at'>) {
  const p = (PRIORITY_RANK[a.priority ?? 'normal'] ?? 2) - (PRIORITY_RANK[b.priority ?? 'normal'] ?? 2);
  if (p) return p;
  return String(a.last_in_at ?? '').localeCompare(String(b.last_in_at ?? ''));
}

export type MailCounts = { reply: number; urgent: number; waiting: number; people: number; drafts: number };

export async function countsFor(db: Db, boxId: string): Promise<MailCounts> {
  const head = { count: 'exact' as const, head: true };
  const since = new Date(Date.now() - 3 * DAY).toISOString();
  const [reply, urgent, waiting, people, drafts] = await Promise.all([
    db.from('mail_threads').select('id', head).eq('box_id', boxId).eq('state', 'reply'),
    db.from('mail_threads').select('id', head).eq('box_id', boxId).eq('state', 'reply').in('priority', ['urgent', 'high']),
    db.from('mail_threads').select('id', head).eq('box_id', boxId).eq('state', 'replied').lt('last_out_at', since).gt('last_out_at', new Date(Date.now() - 42 * DAY).toISOString()),
    db.from('mail_threads').select('id', head).eq('box_id', boxId).not('prospect', 'is', null).is('enquiry_id', null),
    db.from('mail_threads').select('id', head).eq('box_id', boxId).eq('state', 'reply').not('draft', 'is', null),
  ]);
  return { reply: reply.count ?? 0, urgent: urgent.count ?? 0, waiting: waiting.count ?? 0, people: people.count ?? 0, drafts: drafts.count ?? 0 };
}

export type HomeMail = { counts: MailCounts; top: ThreadRow[]; reading: boolean };

/**
 * Dashboard → Email: the counts and the most important few to reply to. 'none' when this person hasn't connected
 * their mailbox; null before mail-sort.sql has been run.
 */
export async function mailForHome(userId: string): Promise<HomeMail | 'none' | null> {
  const db = createAdminClient();
  const box = await boxFor(userId, db);
  if (box === 'missing') return null;
  if (!box) return 'none';
  const [counts, rows] = await Promise.all([countsFor(db, box.id), threadsFor(db, box.id, 'reply')]);
  return { counts, top: rows.slice(0, 6), reading: !box.scan_done_at };
}
