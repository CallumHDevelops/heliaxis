'use client';

import type { SiteJobRow, SitePack } from './pack-shared';
import type { Answer, Answers, Stage } from './types';

/**
 * The site app's copy on the phone (IndexedDB "hx-site", version 1), so everything works with no
 * signal and nothing is lost when the app is closed:
 *
 *   device  'me': the device token (Authorization: Bearer), who it belongs to, remembered settings
 *   packs   one per job: the job pack, its version, when it was stored, what the office changed
 *   files   pack files (drawings, design PDFs, reference photos) as blobs
 *   drafts  one per job: every answer as given, the server's copy it started from, unsent keys
 *   outbox  operations waiting to send, oldest first (answers, photo deletes, sign-offs)
 *   photos  the photo queue: the shrunk photo and its thumbnail until the server has them
 *
 * Every tap writes the draft first; the change goes on the outbox 800 ms later. One writer per job
 * at a time (a Web Lock), so the screen and the background send never race. Changes fire
 * SITE_CHANGED on window so screens re-read.
 */

export const SITE_CHANGED = 'hx-site-changed';
const DB = 'hx-site';
type Store = 'device' | 'packs' | 'files' | 'drafts' | 'outbox' | 'photos';

export type DeviceRecord = {
  id: 'me';
  token: string;
  contact: { name: string; first: string };
  /** Jobs this phone knows about (from links opened and the home list). */
  jobs: string[];
  /** The home list as the server last sent it, for opening with no signal. */
  home?: { rows: SiteJobRow[]; at: string };
  /** Links opened on this phone (a hash of each) → their job, so a link opens its job with no signal. */
  links?: Record<string, string>;
  /** Set when the server turned this phone's session down (the office revoked it, or it ran out). */
  revoked?: string;
  savedAt: string;
  /** Test instruments and the like, remembered from the last job (Unit 2). */
  remember?: Record<string, unknown>;
};
export type PackRecord = {
  id: string;
  pack: SitePack;
  version: string;
  storedAt: string;
  /** What the office changed at the last refresh, until it's been seen. */
  changes: string[];
  /** The job was cancelled or taken off this person's list (P17); everything waiting stays. */
  problem?: { kind: string; message: string; at: string };
  /** The server turned a sign-off down: what it still needs (P11). Cleared when they sign again. */
  gate?: { stage: Stage; message: string; missing: { label: string; key: string; step: string }[]; at: string };
  /** From the sign-off's reply: the evening rule holds the PO's messages until then. */
  poGoesAt?: string | null;
};
export type FileRecord = { id: string; assignmentId: string; name: string; mime: string; blob: Blob; storedAt: string };
export type DraftRecord = { id: string; answers: Answers; base: Answers; baseRev: number; dirty: string[]; savedAt: string };
/** Units 2–4 add their own kinds (and a sender for each, sync.ts registerSender). */
export type OutboxKind = 'answers' | 'photo-delete' | 'capture-confirm' | 'signoff' | (string & {});
export type OutboxRecord = { op_id: string; assignmentId: string; kind: OutboxKind; payload: Record<string, unknown>; createdAt: string; tries: number; failed?: string };
export type PhotoRecord = {
  client_id: string;
  assignmentId: string;
  slot: string;
  /** Null once the server has it (only the thumbnail is kept). */
  full: Blob | null;
  thumb: Blob;
  mime: string;
  width: number;
  height: number;
  takenAt: string;
  tries: number;
  failed?: string;
  /** Read by Claude when it arrives (label and data-badge photos). */
  read?: boolean;
  /** The server's photo id once it's saved. */
  uploadedId?: string;
  lat?: number;
  lng?: number;
};

let opening: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('device', { keyPath: 'id' });
      db.createObjectStore('packs', { keyPath: 'id' });
      db.createObjectStore('files', { keyPath: 'id' }).createIndex('assignment', 'assignmentId');
      db.createObjectStore('drafts', { keyPath: 'id' });
      db.createObjectStore('outbox', { keyPath: 'op_id' }).createIndex('assignment', 'assignmentId');
      db.createObjectStore('photos', { keyPath: 'client_id' }).createIndex('assignment', 'assignmentId');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      opening = null;
      reject(req.error);
    };
  });
  return opening;
}

async function tx<T>(store: Store, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const r = fn(t.objectStore(store));
    t.oncomplete = () => resolve(r ? r.result : (undefined as T));
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const getRec = <T>(store: Store, key: string) => tx<T | undefined>(store, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>);
export const putRec = (store: Store, value: unknown) => tx(store, 'readwrite', (s) => s.put(value));
export const delRec = (store: Store, key: string) => tx(store, 'readwrite', (s) => s.delete(key));
export const allRec = <T>(store: Store) => tx<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>);
export const byJob = <T>(store: 'files' | 'outbox' | 'photos', assignmentId: string) =>
  tx<T[]>(store, 'readonly', (s) => s.index('assignment').getAll(assignmentId) as IDBRequest<T[]>);

export const changed = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SITE_CHANGED));
};

/* ── The device ──────────────────────────────────────────────────────────────── */

export const getDevice = () => getRec<DeviceRecord>('device', 'me');
/** A session from an opened link: the jobs already known stay, and a revoked session is replaced. */
export async function saveDevice(d: Pick<DeviceRecord, 'token' | 'contact'> & { job?: string }) {
  const was = await getDevice();
  const jobs = [...new Set([...(was?.jobs ?? []), ...(d.job ? [d.job] : [])])];
  const keep = was && was.token === d.token ? was : { remember: was?.remember, home: was?.home, links: was?.links };
  await putRec('device', { ...keep, token: d.token, contact: d.contact, jobs, id: 'me', revoked: undefined, savedAt: new Date().toISOString() } satisfies DeviceRecord);
  changed();
}
export async function updateDevice(patch: Partial<Omit<DeviceRecord, 'id'>>) {
  const d = await getDevice();
  if (!d) return;
  await putRec('device', { ...d, ...patch, id: 'me' });
  changed();
}
/** The server turned the session down: keep the token's record (and everything waiting to send) until a link is opened again. */
export const deviceRevoked = () => updateDevice({ revoked: new Date().toISOString() });

/** A short hash of a link token: enough to know the link again, useless to anyone reading the phone. */
export async function linkKey(token: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ── Packs and files ─────────────────────────────────────────────────────────── */

export const getPack = (id: string) => getRec<PackRecord>('packs', id);
export const allPacks = () => allRec<PackRecord>('packs');
export const getFile = (id: string) => getRec<FileRecord>('files', id);
export async function updatePack(id: string, fn: (p: PackRecord) => PackRecord) {
  const p = await getPack(id);
  if (!p) return;
  await putRec('packs', fn(p));
  changed();
}

/* ── Drafts: every tap, kept first ───────────────────────────────────────────── */

/** One writer per job at a time (the screen and the background send), across tabs too. */
export function withJobLock<T>(assignmentId: string, fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  return locks?.request ? (locks.request(`hx-site-job-${assignmentId}`, fn) as Promise<T>) : fn();
}

export async function getDraft(assignmentId: string): Promise<DraftRecord> {
  const d = await getRec<DraftRecord>('drafts', assignmentId);
  if (d) return d;
  const p = await getPack(assignmentId);
  const answers = p?.pack.assignment.answers ?? {};
  return { id: assignmentId, answers: { ...answers }, base: { ...answers }, baseRev: p?.pack.assignment.rev ?? 0, dirty: [], savedAt: new Date().toISOString() };
}

const flushTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** Called after answers go on the outbox (sync.ts listens and sends). */
let onQueued: () => void = () => {};
export const whenQueued = (fn: () => void) => {
  onQueued = fn;
};

/** Set (or clear, with undefined) one answer: kept on the phone now, sent with the next batch. */
export async function setAnswer(assignmentId: string, key: string, value: unknown, src: Answer['src'] = 'typed') {
  await withJobLock(assignmentId, async () => {
    const d = await getDraft(assignmentId);
    if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)) delete d.answers[key];
    else d.answers[key] = { v: value, src, at: new Date().toISOString() };
    if (!d.dirty.includes(key)) d.dirty.push(key);
    d.savedAt = new Date().toISOString();
    await putRec('drafts', d);
  });
  changed();
  clearTimeout(flushTimers.get(assignmentId));
  flushTimers.set(
    assignmentId,
    setTimeout(() => void flushDraft(assignmentId), 800)
  );
}

/** The draft's unsent keys → one answers operation on the outbox. */
export async function flushDraft(assignmentId: string) {
  flushTimers.delete(assignmentId);
  let queued = false;
  await withJobLock(assignmentId, async () => {
    const d = await getRec<DraftRecord>('drafts', assignmentId);
    if (!d?.dirty.length) return;
    const set: Answers = {};
    const unset: string[] = [];
    for (const k of d.dirty) {
      if (d.answers[k]) set[k] = d.answers[k];
      else unset.push(k);
    }
    const op: OutboxRecord = { op_id: crypto.randomUUID(), assignmentId, kind: 'answers', payload: { set, unset }, createdAt: new Date().toISOString(), tries: 0 };
    await putRec('outbox', op);
    await putRec('drafts', { ...d, dirty: [] });
    queued = true;
  });
  if (queued) {
    changed();
    onQueued();
  }
}

/** Every job's unsent keys onto the outbox now (Send now, the app going to the background). */
export async function flushAll() {
  for (const d of await allRec<DraftRecord>('drafts')) if (d.dirty.length) await flushDraft(d.id);
}

/** The server's answers after a send: kept as the base; any answer not changed here since takes the server's value (another phone's). */
export async function mergeServer(assignmentId: string, server: Answers, rev: number) {
  await withJobLock(assignmentId, async () => {
    const d = await getDraft(assignmentId);
    const pending = new Set(d.dirty);
    for (const op of await byJob<OutboxRecord>('outbox', assignmentId)) {
      if (op.kind !== 'answers') continue;
      for (const k of Object.keys((op.payload.set as Answers) ?? {})) pending.add(k);
      for (const k of (op.payload.unset as string[]) ?? []) pending.add(k);
    }
    const answers: Answers = {};
    for (const [k, v] of Object.entries(server)) if (!pending.has(k)) answers[k] = v;
    for (const k of pending) if (d.answers[k]) answers[k] = d.answers[k];
    await putRec('drafts', { ...d, answers, base: server, baseRev: rev, savedAt: new Date().toISOString() });
  });
  changed();
}

/* ── Storage on the phone ────────────────────────────────────────────────────── */

/** Ask the phone to keep this data (and not clear it when space is short). */
export async function keepStorage() {
  try {
    if (navigator.storage?.persisted && !(await navigator.storage.persisted())) await navigator.storage.persist?.();
  } catch {
    // Not every browser lets a page ask.
  }
}

export async function storageUse(): Promise<{ used: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e && e.quota ? { used: e.usage ?? 0, quota: e.quota } : null;
  } catch {
    return null;
  }
}
