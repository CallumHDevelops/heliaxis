import 'server-only';
import { createHash } from 'node:crypto';
import { after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { leadSourceLabel } from '@/lib/lead-source';
import { postcodeKey } from '@/lib/crm/site-postcode';
import { syncEnquiryStatus } from '@/lib/projects/server';
import { resetDuplicateIndex } from '@/lib/projects/duplicates';
import { isOrdered } from '@/lib/purchase-orders/money';
import { chunks, notThere } from './delete-customer';
import {
  checkInput,
  hasContract,
  isOpen,
  MERGE_TABLES,
  planMerge,
  suggestKeep,
  summaryWords,
  type Choices,
  type Customer,
  type Job,
  type JobFacts,
  type Origin,
  type Planned,
  type Side,
} from './merge-rules';
import { moveSitePostcodes } from './move-site-postcodes';

/**
 * Merging duplicate customers, and joining their jobs for the same work (CRM_GUIDE.md "Merging
 * duplicates"). The rules are in merge-rules.ts; the database does the merge itself in one go
 * (crm_merge() in supabase/merge.sql), so it's all or nothing. A preview runs the very same merge and
 * undoes it, to show what will move. Files in storage are moved straight after (they can't be part of a
 * database transaction): each row keeps pointing at the old, still-there file until its file has moved,
 * and the every-minute job finishes any that were cut off.
 */

type Db = ReturnType<typeof createAdminClient>;
type By = { id: string; name: string; admin: boolean };
export type MergeAsk = { a: string; b: string | null; choices?: Partial<Choices>; jobPair?: [string, string] | null };

/** A database message (merge:<code>) in plain words. */
const PLAIN: Record<string, string> = {
  'merge:changed': 'Something changed while you were looking. Check the summary again.',
  'merge:gone': 'One of them isn’t in the CRM any more (deleted, or merged already).',
  'merge:kept-gone': 'The customer you’re keeping isn’t in the CRM any more.',
  'merge:same': 'That’s the same customer.',
  'merge:same-job': 'That’s the same job.',
  'merge:job-gone': 'One of the jobs isn’t there any more.',
  'merge:nothing': 'Pick a job to join.',
  'merge:both-signed': 'Both jobs have a signed quote or a paid deposit, so they can’t be joined. Keep them as separate jobs.',
  'merge:both-delivery': 'Both jobs are already projects (Won or later), so they can’t be joined. Keep them as separate jobs.',
  'merge:rams': 'The jobs are linked to different RAMS projects, so they can’t be joined.',
  'merge:surveys': 'Both jobs have a survey with answers in it. Finish or cancel one, then try again.',
  'merge:clash': 'Both records have something that can only be on one (nothing was changed).',
  'merge:left': 'Something still pointed at the merged-away record, so nothing was changed. Try again; if it happens again, tell Claude.',
  'merge:bad-plan': 'That merge didn’t make sense to the database. Nothing was changed.',
};
const TABLE_WORDS: Record<string, string> = { tasks: 'a task', crm_surveys: 'an open survey', survey_bookings: 'a survey booking', crm_lead_origins: 'a lead' };

export class MergeError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = 'merge') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function plainError(e: { message?: string; details?: string | null; code?: string } | null): MergeError {
  const msg = e?.message ?? '';
  const code = /^merge:[a-z-]+/.exec(msg)?.[0] ?? '';
  if (code === 'merge:merged-elsewhere') return new MergeError(`That record was merged into ${e?.details || 'another customer'} already.`, 409, code);
  if (code === 'merge:clash') {
    const what = TABLE_WORDS[e?.details ?? ''] ?? `“${e?.details}”`;
    return new MergeError(`Both records have ${what} that can only be on one, so nothing was changed.`, 409, code);
  }
  if (code) return new MergeError(PLAIN[code] ?? msg, code === 'merge:changed' ? 409 : 400, code);
  if (e?.code === '23505') return new MergeError('Both records have something that can only be on one, so nothing was changed.', 409, 'merge:clash');
  return new MergeError(msg || 'The merge didn’t work. Nothing was changed.', 500);
}

/** merge.sql has been run. */
export async function mergeReady(db: Db = createAdminClient()): Promise<boolean> {
  const { error } = await db.from('crm_merges').select('id').limit(1);
  return !error;
}

/* ── Reading both records ──────────────────────────────────────────────────────────── */

async function rows<T>(q: PromiseLike<{ data: unknown; error: { message: string; code?: string } | null; status?: number }>, optional = true): Promise<T[]> {
  const r = await q;
  if (r.error) {
    if (optional && (notThere({ error: r.error, status: r.status }) || /column|does not exist/i.test(r.error.message))) return [];
    throw new Error(r.error.message);
  }
  return (r.data ?? []) as T[];
}

/** One customer and everything the rules look at: their jobs (contracts, orders, surveys, bookings), chat and waiting messages. */
async function readSide(db: Db, enquiryId: string, names: Map<string, string>): Promise<Side | null> {
  const { data: customer, error } = await db.from('enquiries').select('*').eq('id', enquiryId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!customer) return null;
  const jobs = await rows<Job>(db.from('crm_projects').select('*').eq('enquiry_id', enquiryId).order('created_at'), false);
  const ids = jobs.map((j) => j.id);
  const none = Promise.resolve([] as never[]);
  type Doc = { project_id: string; category: string; needs_signature: boolean; signed_outside_at?: string | null };
  const [docs, orders, surveys, bookings, origins, messages, outbox] = await Promise.all([
    ids.length ? rows<Doc>(db.from('crm_documents').select('*').in('project_id', ids)) : none,
    ids.length ? rows<{ project_id: string; status: string }>(db.from('purchase_orders').select('project_id, status').in('project_id', ids)) : none,
    ids.length ? rows<{ id: string; project_id: string; type: string; status: string; answers: unknown }>(db.from('crm_surveys').select('id, project_id, type, status, answers').in('project_id', ids).in('status', ['booked', 'draft'])) : none,
    ids.length
      ? rows<{ id: string; project_id: string; status: string; onsite: string }>(db.from('survey_bookings').select('id, project_id, status, onsite').in('project_id', ids).in('status', ['requested', 'confirmed']))
      : none,
    ids.length ? rows<Origin & { project_id: string }>(db.from('crm_lead_origins').select('*').in('project_id', ids).eq('role', 'own')) : none,
    db
      .from('whatsapp_messages')
      .select('id', { count: 'exact', head: true })
      .eq('enquiry_id', enquiryId)
      .then((r) => (r.error ? 0 : (r.count ?? 0))),
    rows<Record<string, unknown>>(db.from('whatsapp_outbox').select('*').eq('enquiry_id', enquiryId).eq('status', 'pending').limit(200)),
  ]);
  const facts: JobFacts[] = jobs.map((job) => {
    const mine = docs.filter((d) => d.project_id === job.id);
    const live = bookings.find((b) => b.project_id === job.id);
    // onsite as Postgres prints it: ["2026-11-03 11:45:00+00","2026-11-03 12:45:00+00")
    const start = live ? /^[[(]"?([^",]+)"?,/.exec(String(live.onsite))?.[1]?.trim().replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00') ?? null : null;
    return {
      job,
      signed: !!(job.accepted_at || job.accepted_signature || mine.some((d) => d.signed_outside_at)),
      paid: !!job.deposit_paid_at,
      ordersSent: orders.filter((o) => o.project_id === job.id && isOrdered(o.status)).length,
      surveys: surveys
        .filter((s) => s.project_id === job.id)
        .map((s) => ({ id: s.id, type: s.type, answered: !!s.answers && typeof s.answers === 'object' && Object.keys(s.answers as object).length > 0 })),
      booking: live ? { id: live.id, status: live.status, start: start && Number.isFinite(Date.parse(start)) ? new Date(start).toISOString() : null } : null,
      waitingQuote: mine.some((d) => d.needs_signature),
      own: (() => {
        const o = origins.find((x) => x.project_id === job.id);
        if (!o) return null;
        const { project_id: _p, ...rest } = o;
        void _p;
        return rest as Origin;
      })(),
    };
  });
  // Staff's Send later messages (kind 'scheduled') move and stay; the automatic ones are cancelled.
  const automatic = outbox.filter((o) => !o.kind || ['reply', 'intro', 'chase'].includes(String(o.kind))).length;
  const scheduled = outbox
    .filter((o) => o.kind === 'scheduled')
    .map((o) => ({ at: String(o.send_after), by: (typeof o.created_by === 'string' ? names.get(o.created_by) : null) ?? (typeof o.by_name === 'string' ? o.by_name : null) }));
  return { customer: customer as Customer, jobs: facts, messages, outbox: { automatic, scheduled } };
}

async function teamNames(db: Db): Promise<Map<string, string>> {
  const { data } = await db.from('profiles').select('id, full_name, email');
  return new Map((data ?? []).map((p) => [p.id as string, ((p.full_name as string) || (p.email as string) || 'Someone').split(/\s+/)[0]]));
}

/* ── Preview and merge ─────────────────────────────────────────────────────────────── */

export type CustomerCard = {
  id: string;
  ref: string | null;
  name: string;
  source: string;
  cameIn: string;
  postcode: string | null;
  messages: number;
  jobs: { id: string; ref: string | null; title: string | null; stage: string; open: boolean; contract: boolean }[];
};

export type MergePreview = {
  ready: boolean;
  /** The two customers (b null when joining two of one customer's jobs). */
  a: CustomerCard;
  b: CustomerCard | null;
  keep: 'a' | 'b';
  keepWhy: string;
  suggested: 'a' | 'b';
  fields: Planned['fields'];
  whatsapp: Planned['whatsapp'];
  permission: Planned['permission'];
  joins: Planned['joins'];
  warnings: Planned['warnings'];
  /** From the dry run: "14 WhatsApp messages, 2 timeline notes …", and what's cancelled. */
  moves: string;
  cancelled: Record<string, number>;
  /** Only an admin can do this one; and with both sides signed, the kept ref typed to confirm. */
  needsAdmin: boolean;
  confirmRef: string | null;
  check: string;
  choices: Choices;
};

const cardOf = (s: Side): CustomerCard => ({
  id: s.customer.id,
  ref: s.customer.customer_ref ?? null,
  name: s.customer.name,
  source: leadSourceLabel(s.customer.source),
  cameIn: s.customer.created_at,
  postcode: s.customer.postcode ?? null,
  messages: s.messages,
  jobs: s.jobs.map((f) => ({ id: f.job.id, ref: f.job.project_ref ?? null, title: f.job.title, stage: f.job.stage, open: isOpen(f.job.stage), contract: hasContract(f) })),
});

type Loaded = { db: Db; a: Side; b: Side | null; names: Map<string, string>; check: string };

async function load(ask: MergeAsk): Promise<Loaded> {
  const db = createAdminClient();
  if (!(await mergeReady(db))) throw new MergeError('Merging needs one more database step: run supabase/merge.sql (Setup → SQL).', 409, 'merge:not-ready');
  if (ask.b && ask.a === ask.b) throw new MergeError('That’s the same customer.');
  const names = await teamNames(db);
  const [a, b] = await Promise.all([readSide(db, ask.a, names), ask.b ? readSide(db, ask.b, names) : Promise.resolve(null)]);
  if (!a || (ask.b && !b)) throw new MergeError('One of them isn’t in the CRM any more (deleted, or merged already).', 404, 'merge:gone');
  if (!ask.b) {
    const [goes, into] = ask.jobPair ?? [];
    if (!goes || !into || goes === into || !a.jobs.some((f) => f.job.id === goes) || !a.jobs.some((f) => f.job.id === into)) throw new MergeError('Pick two of their jobs to join.');
  }
  return { db, a, b, names, check: createHash('sha256').update(checkInput(a, b)).digest('hex') };
}

function choicesFor(l: Loaded, asked: Partial<Choices> | undefined): Choices {
  const keep = l.b ? (asked?.keep === 'a' || asked?.keep === 'b' ? asked.keep : suggestKeep(l.a, l.b).keep) : 'a';
  return { keep, fields: asked?.fields ?? {}, joins: asked?.joins, credit: asked?.credit ?? {} };
}

function planFor(l: Loaded, ask: MergeAsk, choices: Choices, by: By, dryRun: boolean) {
  return planMerge({ a: l.a, b: l.b, choices, by: { id: by.id, name: by.name }, now: new Date().toISOString(), dryRun, jobPair: ask.b ? null : (ask.jobPair ?? null) });
}

/** Who may: anyone with the CRM, unless either side has a contract (signed, paid or kit ordered): then admins. */
function access(l: Loaded) {
  const contracts = (s: Side | null) => !!s?.jobs.some(hasContract);
  const needsAdmin = contracts(l.a) || contracts(l.b);
  return { needsAdmin, bothSigned: !!l.b && contracts(l.a) && contracts(l.b) };
}

async function rpc(db: Db, plan: unknown) {
  const { data, error } = await db.rpc('crm_merge', { p: plan });
  if (error) throw plainError(error);
  return data as { ok: boolean; already?: boolean; merge_id?: string; kept: { id: string; ref: string | null }; summary?: Record<string, number>; cancelled?: Record<string, number>; files?: unknown[] };
}

/** What merging would do, worked out by the database itself (the same merge, undone). Changes nothing. */
export async function previewMerge(ask: MergeAsk, by: By): Promise<MergePreview> {
  const l = await load(ask);
  const choices = choicesFor(l, ask.choices);
  const planned = planFor(l, ask, choices, by, true);
  // Two of one customer's jobs that can't be joined: nothing to run, the sheet says why.
  const dry = planned.plan.merge || planned.plan.joins.length ? await rpc(l.db, planned.plan) : { summary: {}, cancelled: {} };
  const { needsAdmin, bothSigned } = access(l);
  const kept = planned.kept.customer;
  return {
    ready: true,
    a: cardOf(l.a),
    b: l.b ? cardOf(l.b) : null,
    keep: choices.keep,
    keepWhy: planned.keepWhy,
    suggested: l.b ? suggestKeep(l.a, l.b).keep : 'a',
    fields: planned.fields,
    whatsapp: planned.whatsapp,
    permission: planned.permission,
    joins: planned.joins,
    warnings: planned.warnings,
    moves: summaryWords(dry.summary),
    cancelled: dry.cancelled ?? {},
    needsAdmin,
    confirmRef: bothSigned ? (kept.customer_ref ?? kept.name) : null,
    check: l.check,
    choices,
  };
}

export type MergeDone = { ok: true; already: boolean; kept: { id: string; ref: string | null; name: string }; job: string | null; moves: string; files: number };

/**
 * Merge (or join), as the preview showed: the records are read again and the merge refused if anything
 * that matters has changed since (`check`). Then the customer's status follows their jobs, a changed
 * postcode moves the jobs that only had a copy of it, and the files move once the answer has gone.
 */
export async function runMerge(ask: MergeAsk & { check: string; confirm?: string | null; ticked?: number }, by: By): Promise<MergeDone> {
  const l = await load(ask);
  if (l.check !== ask.check) throw new MergeError('Something changed while you were looking. Check the summary again.', 409, 'merge:changed');
  const { needsAdmin, bothSigned } = access(l);
  if (needsAdmin && !by.admin) throw new MergeError('Only an admin can merge records with a signed quote, a paid deposit or kit ordered.', 403, 'merge:admin');
  const choices = choicesFor(l, ask.choices);
  const planned = planFor(l, ask, choices, by, false);
  const K = planned.kept.customer;
  if (bothSigned && (ask.confirm ?? '').trim().toUpperCase() !== String(K.customer_ref ?? K.name).toUpperCase()) {
    throw new MergeError(`Both have signed paperwork: type ${K.customer_ref ?? K.name} to merge them.`, 409, 'merge:confirm');
  }
  const ticks = planned.warnings.filter((w) => w.tick).length;
  if (ticks && ask.ticked !== ticks) throw new MergeError('Tick the boxes above Merge first.', 400, 'merge:ticks');

  const done = await rpc(l.db, planned.plan);
  const keptId = done.kept?.id ?? K.id;
  if (!done.already) {
    await syncEnquiryStatus(l.db, keptId).catch(() => null);
    // Their postcode came from the other record: the kept customer's jobs carrying the old one follow it.
    const pc = planned.plan.customer?.set.postcode;
    if (pc && typeof pc.to === 'string' && postcodeKey(pc.to) !== postcodeKey(String(pc.from ?? ''))) {
      await moveSitePostcodes(keptId, (pc.from as string | null) ?? null, pc.to, by.id).catch(() => []);
    }
    resetDuplicateIndex();
    if (done.merge_id) {
      const id = done.merge_id;
      after(() => finishMergeFiles(id).catch((e) => console.error('[merge] files not moved yet:', e instanceof Error ? e.message : e)));
    }
  }
  const job =
    planned.plan.joins[0]?.into ??
    [...planned.kept.jobs, ...planned.other.jobs.filter((f) => !planned.plan.joins.some((j) => j.from === f.job.id))].sort((x, y) => Number(isOpen(y.job.stage)) - Number(isOpen(x.job.stage)) || y.job.created_at.localeCompare(x.job.created_at))[0]?.job.id ??
    null;
  return { ok: true, already: !!done.already, kept: { id: keptId, ref: done.kept?.ref ?? K.customer_ref ?? null, name: K.name }, job, moves: summaryWords(done.summary), files: (done.files ?? []).length };
}

/* ── Files ─────────────────────────────────────────────────────────────────────────── */

const PAGE = 1000;

/** Every file under a folder (and its folders), as full paths. */
async function filesUnder(db: Db, bucket: string, prefix: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string, depth: number) => {
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await db.storage.from(bucket).list(dir, { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } });
      if (error || !data) return;
      for (const f of data) {
        if (f.id) out.push(`${dir}/${f.name}`);
        else if (depth < 4) await walk(`${dir}/${f.name}`, depth + 1);
      }
      if (data.length < PAGE) return;
    }
  };
  await walk(prefix.replace(/\/$/, ''), 0);
  return out;
}

/** The rows that name files in a bucket: [table, column]. */
const fileColumns = (bucket: string) =>
  Object.entries(MERGE_TABLES).flatMap(([key, t]) => (t.files?.bucket === bucket ? t.files.columns.map((c) => [key.slice(0, key.indexOf('.')), c] as const) : []));

/**
 * Move one folder's files to the kept record's folder, then the rows that name them. Retry-safe: a file
 * already gone from the old folder is taken as moved; one already in the new folder is the same file in
 * the WhatsApp bucket (named by its content), so the old copy goes; elsewhere it's left where it is, and
 * its row with it. → how many couldn't be moved.
 */
export async function moveFolder(db: Db, m: { bucket: string; from: string; to: string }): Promise<number> {
  const store = db.storage.from(m.bucket);
  const stuck = new Set<string>();
  for (const part of chunks(await filesUnder(db, m.bucket, m.from), 20)) {
    await Promise.all(
      part.map(async (path) => {
        const to = m.to + path.slice(m.from.length);
        const r = await store.move(path, to).catch((e: unknown) => ({ error: { message: e instanceof Error ? e.message : String(e) } }));
        if (!r.error) return;
        if (/exist/i.test(r.error.message) && m.bucket === 'whatsapp-media') {
          await store.remove([path]).catch(() => null);
          return;
        }
        if (/not.?found/i.test(r.error.message)) return;
        stuck.add(path);
        console.error(`[merge] ${m.bucket}/${path} not moved: ${r.error.message}`);
      })
    );
  }
  for (const [table, col] of fileColumns(m.bucket)) {
    const { data, error } = await db.from(table).select(`id, ${col}`).like(col, `${m.from}%`).limit(5000);
    if (error) continue; // a table or column that isn't there yet
    for (const row of (data ?? []) as unknown as Record<string, string>[]) {
      const path = row[col];
      if (!path || stuck.has(path)) continue;
      await db.from(table).update({ [col]: m.to + path.slice(m.from.length) }).eq('id', row.id);
    }
  }
  return stuck.size;
}

/**
 * The storage step of merges not finished yet: straight after a merge, and from the every-minute job
 * for any cut off (those over two minutes old, so it never races the first try). Never throws.
 */
export async function finishMergeFiles(mergeId?: string): Promise<number> {
  try {
    const db = createAdminClient();
    let q = db.from('crm_merges').select('id, files').is('files_done_at', null).order('at').limit(5);
    // A file that still won't move after a week is left where it is (its row still points at it).
    q = mergeId ? q.eq('id', mergeId) : q.lt('at', new Date(Date.now() - 120_000).toISOString()).gt('at', new Date(Date.now() - 7 * 86_400_000).toISOString());
    const { data, error } = await q;
    if (error || !data?.length) return 0;
    for (const m of data as { id: string; files: { bucket: string; from: string; to: string }[] | null }[]) {
      let stuck = 0;
      for (const f of m.files ?? []) stuck += await moveFolder(db, f).catch(() => 1);
      await db
        .from('crm_merges')
        .update(stuck ? { files_error: `${stuck} file${stuck === 1 ? '' : 's'} couldn’t be moved yet` } : { files_done_at: new Date().toISOString(), files_error: null })
        .eq('id', m.id);
    }
    return data.length;
  } catch {
    return 0;
  }
}
