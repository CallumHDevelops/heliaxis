'use client';

import { ping, siteFetch, type Outcome } from './client';
import {
  allRec,
  byJob,
  changed,
  delRec,
  flushAll,
  getDevice,
  getPack,
  keepStorage,
  mergeServer,
  putRec,
  SITE_CHANGED,
  storageUse,
  updatePack,
  whenQueued,
  type DraftRecord,
  type OutboxRecord,
  type PackRecord,
  type PhotoRecord,
} from './offline';
import { sendPhoto, whenPhotoQueued } from './photo-queue';
import type { Answers, Flag } from './types';

/**
 * Sending what's waiting on the phone. A probe first (GET /api/site/ping, 4 s); with no signal it
 * tries again after 5 s, doubling to a minute. Then per job, in order: answers → photos (prepare →
 * storage → save) → photo deletes → confirmations → the sign-off last, once its photos are up.
 * Every operation carries an op_id (site_ops), so a retry never applies twice. "All sent ✓" shows
 * only after a real reply from the server with nothing left. Uploads to storage have a time limit
 * (client.ts uploadTimeoutMs), and answers typed while a slow one is going go alongside it.
 *
 * Units 2–4 add outbox kinds with registerSender (a customer's signature, the EIC's boards…).
 */

export type SyncState = {
  /** The last probe: null before the first. */
  online: boolean | null;
  phase: 'idle' | 'checking' | 'sending' | 'offline';
  done: number;
  total: number;
  /**
   * Things waiting, as a person counts them: each photo; a job's answers as one, however many
   * batches they went on the outbox in; each other item (`kinds` says what, so each is named: a
   * sign-off, a put right, the customer's signature…). `total` is their sum. `signoffs` (among
   * `other`) is the sign-offs.
   */
  waiting: { answers: number; photos: number; other: number; total: number; signoffs?: number; kinds?: Record<string, number> };
  failed: { photos: number; other: number; total: number };
  /** The last real round trip that left nothing waiting. */
  lastOkAt: string | null;
  nextTryAt: number | null;
  storage: { used: number; quota: number } | null;
  nearlyFull: boolean;
  /** The office turned this phone's session off (or it ran out): open the link again. */
  revoked: boolean;
  /** Jobs whose sign-off the server turned down (P11): what's waiting behind it needs them to sign again. */
  gated?: number;
};

let state: SyncState = {
  online: null,
  phase: 'idle',
  done: 0,
  total: 0,
  waiting: { answers: 0, photos: 0, other: 0, total: 0 },
  failed: { photos: 0, other: 0, total: 0 },
  lastOkAt: null,
  nextTryAt: null,
  storage: null,
  nearlyFull: false,
  revoked: false,
};
const listeners = new Set<() => void>();
const set = (patch: Partial<SyncState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
export const syncState = () => state;
export const subscribeSync = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
export const isDraining = () => running !== null;

/* ── Senders for each kind on the outbox ─────────────────────────────────────── */

export type Sender = {
  /** Order within a job: answers are 0 and photos 10; photo deletes 20, confirmations 30, sign-offs 100. */
  rank: number;
  /** Waits until every photo for the job is up (a sign-off). */
  afterPhotos?: boolean;
  send: (op: OutboxRecord) => Promise<Outcome<unknown>>;
};
const senders = new Map<string, Sender>();
export const registerSender = (kind: string, s: Sender) => void senders.set(kind, s);

registerSender('photo-delete', {
  rank: 20,
  send: (op) => siteFetch(`/api/site/jobs/${op.assignmentId}/photos`, { body: { action: 'delete', client_id: op.payload.client_id }, job: op.assignmentId }),
});

/* ── Counting ────────────────────────────────────────────────────────────────── */

/**
 * What's waiting for one job. `answers` is the answer batches (and a draft with unsent keys): they
 * count as one thing however many there are (thingsOf). `kinds` counts the other items by kind.
 */
export type JobWork = { answers: number; photos: number; other: number; failed: number; failedPhotos: number; signoffs: number; kinds: Record<string, number> };

/** Each outbox kind in words, for the sending sheet and anything that couldn't be sent. */
export const OUTBOX_LABEL: Record<string, string> = {
  answers: 'Answers',
  'photo-delete': 'Taking a photo off',
  signoff: 'Sign-off',
  'put-right': 'Put right',
  'customer-sign': 'Customer’s signature',
  file: 'Certificate file',
  'file-delete': 'Taking a file off',
};
export const outboxLabel = (kind: string) => OUTBOX_LABEL[kind] ?? 'Something else';

/** Things waiting for a job, as a person counts them: each photo and item, and its answers as one. */
export const thingsOf = (w: Pick<JobWork, 'answers' | 'photos' | 'other'>) => w.photos + w.other + (w.answers ? 1 : 0);

/** What's waiting for each job (drafts with unsent keys count as answers). */
export async function workByJob(): Promise<Map<string, JobWork>> {
  const out = new Map<string, JobWork>();
  const of = (id: string) => {
    let w = out.get(id);
    if (!w) out.set(id, (w = { answers: 0, photos: 0, other: 0, failed: 0, failedPhotos: 0, signoffs: 0, kinds: {} }));
    return w;
  };
  for (const d of await allRec<DraftRecord>('drafts')) if (d.dirty.length) of(d.id).answers++;
  const failedAnswers = new Set<string>();
  for (const op of await allRec<OutboxRecord>('outbox')) {
    const w = of(op.assignmentId);
    // A job's answers that couldn't be sent are one thing too.
    if (op.failed) {
      if (op.kind !== 'answers' || !failedAnswers.has(op.assignmentId)) w.failed++;
      if (op.kind === 'answers') failedAnswers.add(op.assignmentId);
    } else if (op.kind === 'answers') w.answers++;
    else {
      w.other++;
      w.kinds[op.kind] = (w.kinds[op.kind] ?? 0) + 1;
      if (op.kind === 'signoff') w.signoffs++;
    }
  }
  for (const p of await allRec<PhotoRecord>('photos')) {
    if (!p.full) continue;
    const w = of(p.assignmentId);
    if (p.failed) w.failedPhotos++;
    else w.photos++;
  }
  return out;
}

/** Every job's work added up for the pill (pure: scripts/test-site-app.mjs). */
export function countWaiting(work: Iterable<JobWork>) {
  const waiting = { answers: 0, photos: 0, other: 0, total: 0, signoffs: 0, kinds: {} as Record<string, number> };
  const failed = { photos: 0, other: 0, total: 0 };
  for (const w of work) {
    if (w.answers) waiting.answers++;
    waiting.photos += w.photos;
    waiting.other += w.other;
    waiting.signoffs += w.signoffs;
    waiting.total += thingsOf(w);
    for (const [k, v] of Object.entries(w.kinds)) waiting.kinds[k] = (waiting.kinds[k] ?? 0) + v;
    failed.photos += w.failedPhotos;
    failed.other += w.failed;
  }
  failed.total = failed.photos + failed.other;
  return { waiting, failed };
}

async function recount() {
  const work = await workByJob();
  const { waiting, failed } = countWaiting(work.values());
  const storage = await storageUse();
  const device = await getDevice().catch(() => undefined);
  const gated = (await allRec<PackRecord>('packs').catch(() => [] as PackRecord[])).filter((p) => p.gate).length;
  set({ waiting, failed, storage, nearlyFull: !!storage && storage.used / storage.quota > 0.8, revoked: !!device?.revoked, gated });
  return { waiting, failed, work };
}

/** "a", "a and b", "a, b and c". */
const listOf = (parts: string[]) => (parts.length < 2 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`);

/** The pill and the line under it (P12), in words. */
export function syncWords(s: SyncState): { pill: string; line: string; tone: 'ok' | 'wait' | 'bad' } {
  const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
  if (s.revoked) return { pill: 'Signed out', line: 'Open the link in your message again. Nothing waiting is lost.', tone: 'bad' };
  if (s.phase === 'sending' && s.total) return { pill: `Sending ${Math.min(s.done + 1, s.total)} of ${s.total}…`, line: 'Sending now. Keep the app open.', tone: 'wait' };
  if (s.failed.total) {
    const what = s.failed.photos && !s.failed.other ? n(s.failed.photos, 'photo') : n(s.failed.total, 'item');
    return { pill: `${s.failed.total} not sent`, line: `Couldn’t send ${what}. Tap to retry.`, tone: 'bad' };
  }
  if (s.waiting.total) {
    // Each kind by name (an older state without `kinds` still names its sign-offs).
    const k = s.waiting.kinds ?? (s.waiting.signoffs ? { signoff: s.waiting.signoffs } : {});
    const named: [string, (c: number) => string][] = [
      ['photo-delete', (c) => n(c, 'photo to take off', 'photos to take off')],
      ['file', (c) => n(c, 'certificate file')],
      ['file-delete', (c) => n(c, 'file to take off', 'files to take off')],
      ['customer-sign', (c) => (c === 1 ? 'the customer’s signature' : 'the customer’s signatures')],
      ['signoff', () => 'your sign-off'],
      ['put-right', () => 'your put right'],
    ];
    const known = named.reduce((t, [kind]) => t + (k[kind] ?? 0), 0);
    const others = Math.max(0, s.waiting.other - known);
    const parts = [
      s.waiting.photos ? n(s.waiting.photos, 'photo') : '',
      s.waiting.answers ? 'your answers' : '',
      others ? n(others, 'other item') : '',
      ...named.map(([kind, words]) => (k[kind] ? words(k[kind]) : '')),
    ].filter(Boolean);
    const many = s.waiting.photos + s.waiting.other > 1 || s.waiting.answers;
    // A sign-off the server turned down: what's behind it waits for them, not for signal.
    const after = s.gated ? 'Not signed off yet: open the job to see what Heliaxis still needs, then sign again.' : `${many ? 'They’ll' : 'It’ll'} send when you have signal.`;
    const line = `${listOf(parts)} waiting. ${after}`;
    return { pill: `${s.waiting.total} waiting`, line: line[0].toUpperCase() + line.slice(1), tone: 'wait' };
  }
  if (s.lastOkAt) return { pill: 'All sent ✓', line: 'Everything on this phone has reached Heliaxis.', tone: 'ok' };
  if (s.online === false) return { pill: 'No signal', line: 'No signal. Everything is kept on this phone.', tone: 'wait' };
  return { pill: 'Checking…', line: 'Checking the signal…', tone: 'wait' };
}

/* ── Draining ────────────────────────────────────────────────────────────────── */

type JobResult = 'ok' | 'offline' | 'device' | 'stop';

const fromProblem = (r: Outcome<unknown>): JobResult | null => {
  if (r.ok) return null;
  if (r.kind === 'offline') return 'offline';
  if (r.kind === 'problem') return r.problem === 'device' ? 'device' : 'stop';
  return null;
};

async function markFailed(op: OutboxRecord, message: string) {
  await putRec('outbox', { ...op, failed: message });
}

/** Answers being sent right now (by the send, or alongside it): never picked up twice. */
const claimed = new Set<string>();
/** Jobs whose answers the send has in hand: answers sent alongside wait, so a job's answers land in order. */
const answering = new Set<string>();

/** One job's answers, up to 50 operations at a time. Null when they're all dealt with. */
async function sendAnswers(id: string, answers: OutboxRecord[], tick: () => void): Promise<JobResult | null> {
  for (let i = 0; i < answers.length; i += 50) {
    const chunk = answers.slice(i, i + 50);
    const r = await siteFetch<{ rev: number; answers: Answers; flags: Flag[]; status: string }>(`/api/site/jobs/${id}/answers`, {
      body: { ops: chunk.map((o) => ({ op_id: o.op_id, set: o.payload.set, unset: o.payload.unset })) },
      job: id,
    });
    const stop = fromProblem(r);
    if (stop) return stop;
    if (r.ok) {
      for (const o of chunk) await delRec('outbox', o.op_id);
      await mergeServer(id, r.data.answers ?? {}, r.data.rev);
      await updatePack(id, (p) => ({ ...p, pack: { ...p.pack, assignment: { ...p.pack.assignment, flags: r.data.flags ?? p.pack.assignment.flags, status: r.data.status ?? p.pack.assignment.status, rev: r.data.rev } } }));
      chunk.forEach(tick);
      continue;
    }
    if (r.kind === 'signed' || (r.kind === 'error' && !r.retry)) {
      for (const o of chunk) await markFailed(o, r.message);
      if (r.kind === 'signed') await updatePack(id, (p) => ({ ...p, pack: { ...p.pack, assignment: { ...p.pack.assignment, status: p.pack.assignment.status === 'done' ? 'done' : 'signed' } } }));
      continue;
    }
    for (const o of chunk) await putRec('outbox', { ...o, tries: o.tries + 1 });
    return 'stop';
  }
  return null;
}

async function drainJob(id: string, tick: () => void): Promise<JobResult> {
  const rec = await getPack(id);
  // Cancelled or taken off the list: everything stays on the phone, nothing is sent.
  if (rec?.problem) return 'stop';
  // Answers on their way alongside a long upload (answersAlongside) land first: nothing of this
  // job's (its sign-off least of all) overtakes them.
  let ops: OutboxRecord[];
  do {
    if (side) await side;
    ops = (await byJob<OutboxRecord>('outbox', id)).filter((o) => !o.failed).sort((x, y) => x.createdAt.localeCompare(y.createdAt));
  } while (ops.some((o) => claimed.has(o.op_id)));

  // 1. Answers.
  const answers = ops.filter((o) => o.kind === 'answers');
  answering.add(id);
  answers.forEach((o) => claimed.add(o.op_id));
  let stopped: JobResult | null;
  // A job's answers are one thing on the pill ("Sending 2 of 3…"), however many batches.
  let ticked = false;
  try {
    stopped = await sendAnswers(id, answers, () => {
      if (!ticked) tick();
      ticked = true;
    });
  } finally {
    answering.delete(id);
    answers.forEach((o) => claimed.delete(o.op_id));
  }
  if (stopped) return stopped;

  // 2. Photos, oldest first.
  let photosLeft = false;
  const photos = (await byJob<PhotoRecord>('photos', id)).filter((p) => p.full && !p.failed).sort((x, y) => x.takenAt.localeCompare(y.takenAt));
  for (const p of photos) {
    const r = await sendPhoto(p);
    if (r === 'offline') return 'offline';
    if (r === 'sent') tick();
    else if (r === 'later') photosLeft = true;
    else if (typeof r === 'object') {
      const stop = fromProblem(r);
      if (stop) return stop;
    }
  }

  // 3. Everything else, by kind (the sign-off last, and only once the photos are all up).
  const rest = ops
    .filter((o) => o.kind !== 'answers' && senders.has(o.kind))
    .sort((x, y) => senders.get(x.kind)!.rank - senders.get(y.kind)!.rank || x.createdAt.localeCompare(y.createdAt));
  for (const op of rest) {
    const s = senders.get(op.kind)!;
    if (s.afterPhotos && (photosLeft || (await byJob<PhotoRecord>('photos', id)).some((p) => p.full && !p.failed))) continue;
    const r = await s.send(op);
    const stop = fromProblem(r);
    if (stop) return stop;
    if (r.ok) {
      await delRec('outbox', op.op_id);
      tick();
    } else if (r.kind === 'signed' || (r.kind === 'error' && !r.retry)) await markFailed(op, r.message);
    else {
      await putRec('outbox', { ...op, tries: op.tries + 1 });
      return 'stop';
    }
  }
  return photosLeft ? 'stop' : 'ok';
}

let running: Promise<boolean> | null = null;
let again = false;
let backoff = 5000;
let timer: ReturnType<typeof setTimeout> | null = null;

function later(ms: number) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void drain(), ms);
  set({ nextTryAt: Date.now() + ms });
}

/** Send everything waiting. Resolves true when nothing is left (after a real reply from the server). */
export function drain(): Promise<boolean> {
  if (running) {
    again = true;
    // A photo can take minutes to go up on a weak signal: answers typed meanwhile don't wait for it.
    answersAlongside();
    return running;
  }
  if (timer) clearTimeout(timer);
  timer = null;
  running = (async () => {
    await flushAll().catch(() => {});
    const { waiting } = await recount();
    if (state.revoked) return false;
    set({ phase: 'checking', nextTryAt: null });
    if (!(await ping())) {
      set({ online: false, phase: 'offline' });
      if (waiting.total) {
        later(backoff);
        backoff = Math.min(backoff * 2, 60_000);
        void askBackgroundSync();
      }
      return false;
    }
    backoff = 5000;
    set({ online: true, phase: waiting.total ? 'sending' : 'idle', done: 0, total: waiting.total });
    let clean = true;
    if (waiting.total) {
      const work = await workByJob();
      for (const [id, w] of work) {
        if (!w.answers && !w.photos && !w.other) continue;
        const r = await drainJob(id, () => set({ done: Math.min(state.done + 1, state.total) }));
        if (r === 'offline') {
          set({ online: false, phase: 'offline' });
          later(backoff);
          return false;
        }
        if (r === 'device') {
          clean = false;
          break;
        }
        if (r !== 'ok') clean = false;
      }
    }
    const after = await recount();
    const left = after.waiting.total;
    set({ phase: 'idle', done: 0, total: 0, ...(clean && !left && !state.revoked ? { lastOkAt: new Date().toISOString() } : {}) });
    // Something the server couldn't take just now: try again in half a minute.
    if (left && !state.revoked) later(30_000);
    return !left;
  })().finally(() => {
    running = null;
    changed();
    if (again) {
      again = false;
      void drain();
    }
  });
  return running;
}

let side: Promise<void> | null = null;
let sideAgain = false;

/**
 * While a send is going (held up by a slow photo, say), the answers queued since go straight away
 * instead of after it. Only answers: photos and the sign-off keep their order in the send.
 */
function answersAlongside() {
  if (side) {
    sideAgain = true;
    return;
  }
  side = (async () => {
    if (state.revoked) return;
    await flushAll().catch(() => {});
    const ops = (await allRec<OutboxRecord>('outbox'))
      .filter((o) => o.kind === 'answers' && !o.failed && !claimed.has(o.op_id) && !answering.has(o.assignmentId))
      .sort((x, y) => x.createdAt.localeCompare(y.createdAt));
    if (!ops.length) return;
    ops.forEach((o) => claimed.add(o.op_id));
    try {
      const jobs = new Map<string, OutboxRecord[]>();
      for (const o of ops) jobs.set(o.assignmentId, [...(jobs.get(o.assignmentId) ?? []), o]);
      for (const [id, list] of jobs) {
        if ((await getPack(id))?.problem) continue;
        const r = await sendAnswers(id, list, () => {});
        if (r === 'offline' || r === 'device') break;
      }
    } finally {
      ops.forEach((o) => claimed.delete(o.op_id));
      changed();
    }
  })()
    .catch(() => {})
    .finally(() => {
      side = null;
      if (sideAgain) {
        sideAgain = false;
        if (running) answersAlongside();
      }
    });
}

/** Soon, not at once: a few taps in a row go as one. */
let soonTimer: ReturnType<typeof setTimeout> | null = null;
export function drainSoon(ms = 400) {
  if (soonTimer) clearTimeout(soonTimer);
  soonTimer = setTimeout(() => {
    soonTimer = null;
    void drain();
  }, ms);
}

/** Android: ask to be woken when the signal comes back, even with the app in the background. */
async function askBackgroundSync() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration('/portal/site/');
    await (reg as (ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } }) | undefined)?.sync?.register('site-sync');
  } catch {
    // Not every browser has Background Sync; the app sends when it's next open.
  }
}

/** Take a failed item off the list ("Remove") or try it again ("Retry"). */
export async function retryFailed() {
  for (const op of await allRec<OutboxRecord>('outbox')) if (op.failed) await putRec('outbox', { ...op, failed: undefined, tries: 0 });
  for (const p of await allRec<PhotoRecord>('photos')) if (p.failed) await putRec('photos', { ...p, failed: undefined, tries: 0 });
  changed();
  void drain();
}
export async function removeFailed(id: string, what: 'op' | 'photo') {
  await delRec(what === 'op' ? 'outbox' : 'photos', id);
  changed();
  void recount();
}

let started = false;
/** Once per page: listen for the signal coming back, the app coming to the front, and the service worker's nudge. */
export function startSync() {
  if (started || typeof window === 'undefined') return;
  started = true;
  void keepStorage();
  whenQueued(() => drainSoon());
  whenPhotoQueued(() => drainSoon());
  window.addEventListener('online', () => drainSoon(0));
  window.addEventListener(SITE_CHANGED, () => void recount());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') drainSoon(0);
    // Going to the background: everything typed goes on the outbox now, and Android may finish it.
    else
      void flushAll().then(async () => {
        if ((await recount()).waiting.total) void askBackgroundSync();
      });
  });
  navigator.serviceWorker?.addEventListener('message', (e) => {
    if ((e.data as { type?: string } | null)?.type === 'SITE_SYNC') drainSoon(0);
  });
  setInterval(() => {
    if (state.waiting.total && !running) void drain();
  }, 60_000);
  void drain();
}
