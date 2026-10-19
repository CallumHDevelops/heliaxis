'use client';

import { createClient } from '@/lib/supabase/client';
import { PHOTO_UPLOADED, queued, setQueuedSlot, uploadQueued } from '@/lib/crm/photo-queue';
import { mergeSurvey, same } from './merge';
import type { Markup } from './markup';
import type { Answers, SurveyPayload } from './solar-schema';

/**
 * Surveys on the phone, so a survey works with no signal from start to finish.
 *
 * IndexedDB "hx-surveys" (v1):
 * - drafts: the answers on this phone, the server copy they started from (base, baseRev), whether
 *   they've been saved to the server (synced), and "Finish on site" details (signature, name, time).
 * - packs:  the last full copy of each survey from the server (the offline pack, or opening it online).
 * - outbox: drawings on photos already uploaded, and finishing a survey, waiting for signal.
 *
 * Every change writes the draft first, then (after 800 ms) PUTs it with the rev it started from. A 409
 * means someone else saved meanwhile: the two are merged (merge.ts) and sent again. Finishing waits
 * until the answers are saved and the survey's photos have gone up, then POSTs /complete.
 * Photos themselves stay in the photo queue (src/lib/crm/photo-queue.ts).
 *
 * Window events: SURVEYS_CHANGED (detail { id?, merged? }) whenever a draft, the outbox or a sync state
 * changes. `merged` means answers saved elsewhere were merged into this phone's copy: a survey open on
 * screen merges them into what it shows (mergeSurvey(merged.base, onScreen, merged.server)), or its
 * next save would undo them.
 */

export type Finish = { signature: string | null; signedName: string; at: string };
export type Draft = {
  id: string;
  answers: Answers;
  /** The server's answers these started from, and their rev. */
  base: Answers;
  baseRev: number;
  savedAt: string;
  /** True once the server has these exact answers. */
  synced: boolean;
  /** "Finish on site" was tapped on this phone. */
  finish?: Finish;
  /** The customer's signature (PNG data URL), kept here until "Finish on site" sends it. */
  signature?: string;
  /** The server won't take changes: 'complete', 'cancelled' or 'deleted'. */
  locked?: string;
  /** The last save was refused (shown to the surveyor). */
  error?: string;
};
export type FinishFailure = { message: string; missing?: { label: string }[]; blocks?: { message: string }[] };
export type OutboxItem =
  | { id: string; surveyId: string; kind: 'markup'; photoId: string; markup: Markup | null; blob: Blob | null; at: string; failed?: string }
  | { id: string; surveyId: string; kind: 'complete'; finish: Finish; at: string; failed?: FinishFailure };
type Pack = { id: string; payload: SurveyPayload; storedAt: string };

export const SURVEYS_CHANGED = 'hx-surveys-changed';
export type SurveysChangedDetail = { id?: string; merged?: { base: Answers; server: Answers } };

const DB = 'hx-surveys';
const DRAFTS = 'drafts';
const PACKS = 'packs';
const OUTBOX = 'outbox';
const WARM_KEY = 'hx.surveys.warmedAt';
const WARM_EVERY = 10 * 60_000;
const SAVE_DELAY = 800;

/* ── IndexedDB ────────────────────────────────────────────────────────────────── */

let dbp: Promise<IDBDatabase> | null = null;
function openDb(): Promise<IDBDatabase> {
  dbp ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of [DRAFTS, PACKS, OUTBOX]) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        dbp = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  }).catch((e) => {
    dbp = null;
    throw e;
  });
  return dbp;
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const r = fn(t.objectStore(store));
    t.oncomplete = () => resolve(r.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const getDraft = (id: string) => tx<Draft | undefined>(DRAFTS, 'readonly', (s) => s.get(id) as IDBRequest<Draft | undefined>).then((d) => d ?? null);
const putDraft = (d: Draft) => tx(DRAFTS, 'readwrite', (s) => s.put(d));
const deleteDraft = (id: string) => tx(DRAFTS, 'readwrite', (s) => s.delete(id));
export const allDrafts = () => tx<Draft[]>(DRAFTS, 'readonly', (s) => s.getAll() as IDBRequest<Draft[]>);

export const getPack = (id: string) =>
  tx<Pack | undefined>(PACKS, 'readonly', (s) => s.get(id) as IDBRequest<Pack | undefined>).then((p) => p?.payload ?? null);
const putPack = (payload: SurveyPayload) => tx(PACKS, 'readwrite', (s) => s.put({ id: payload.survey.id, payload, storedAt: new Date().toISOString() } satisfies Pack));
/** Every survey copied to this phone (for the lists when there's no signal). */
export const allPacks = () => tx<Pack[]>(PACKS, 'readonly', (s) => s.getAll() as IDBRequest<Pack[]>).then((l) => l.map((p) => p.payload));

export const outboxItems = () => tx<OutboxItem[]>(OUTBOX, 'readonly', (s) => s.getAll() as IDBRequest<OutboxItem[]>);
const putOutbox = (i: OutboxItem) => tx(OUTBOX, 'readwrite', (s) => s.put(i));
const deleteOutbox = (id: string) => tx(OUTBOX, 'readwrite', (s) => s.delete(id));

const emit = (id?: string, merged?: SurveysChangedDetail['merged']) =>
  window.dispatchEvent(new CustomEvent<SurveysChangedDetail>(SURVEYS_CHANGED, { detail: { id, merged } }));
const isOpen = (status: string) => status === 'booked' || status === 'draft';
const isEmpty = (a: Answers | null | undefined) => !a || Object.keys(a).length === 0;
const online = () => typeof navigator === 'undefined' || navigator.onLine !== false;

/** One read-modify-write of a survey's draft at a time (typing, saving and merging all touch it). */
const chains = new Map<string, Promise<unknown>>();
function serial<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(id) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  chains.set(
    id,
    next.catch(() => null)
  );
  return next;
}

/** Keep the phone's copy of the server record in step after a save, so it reopens offline as saved. */
async function patchPack(id: string, change: (p: SurveyPayload) => SurveyPayload) {
  const p = await getPack(id).catch(() => null);
  if (p) await putPack(change(p)).catch(() => null);
}

/* ── Opening a survey ─────────────────────────────────────────────────────────── */

export type Loaded = {
  /** The server copy (fresh, or the phone's last copy when there's no signal). */
  payload: SurveyPayload | null;
  /** What to show: this phone's answers merged over the server's. */
  answers: Answers;
  draft: Draft | null;
  /** 'phone': opened from the copy on this phone ("Ready offline ✓"). */
  source: 'network' | 'phone';
  error?: 'signin' | 'not_found' | 'offline';
};

/**
 * Open a survey: the server copy (kept on the phone for next time), or the phone's copy with no
 * signal; changes on this phone that haven't been saved yet are merged over it.
 */
export async function loadSurvey(id: string): Promise<Loaded> {
  let payload: SurveyPayload | null = null;
  let source: Loaded['source'] = 'network';
  let error: Loaded['error'];
  try {
    const r = await fetch(`/api/crm/surveys/${id}`, { cache: 'no-store' });
    if (r.ok) {
      payload = (await r.json()) as SurveyPayload;
      await putPack(payload).catch(() => null);
    } else if (r.status === 401 || r.status === 403) error = 'signin';
    else if (r.status === 404) error = 'not_found';
    else error = 'offline';
  } catch {
    error = 'offline';
  }
  if (!payload) {
    payload = await getPack(id).catch(() => null);
    source = 'phone';
  }

  const draft = await serial(id, async () => {
    let d = await getDraft(id).catch(() => null);
    const server = payload?.survey;
    if (error === 'not_found' && d && !d.locked) {
      d = { ...d, locked: 'deleted' };
      await putDraft(d);
      return d;
    }
    if (!server) return d;
    const locked = isOpen(server.status) ? undefined : server.status;
    if (d && !d.synced && server.rev > d.baseRev) {
      // Saved elsewhere while this phone had changes: merge ours over it.
      const m = mergeSurvey(d.base, d.answers, server.answers);
      d = { ...d, answers: m.answers, base: server.answers, baseRev: server.rev, locked };
      await putDraft(d);
      await renameSlots(id, m.renamedRoofs);
    } else if (!d || (d.synced && server.rev >= d.baseRev)) {
      const prefill = !locked && isEmpty(server.answers) && payload?.defaults ? payload.defaults : null;
      d = {
        id,
        answers: prefill ?? server.answers,
        base: server.answers,
        baseRev: server.rev,
        savedAt: server.answers_saved_at ?? new Date().toISOString(),
        // Pre-filled answers (address, scope) go up with the first real change, so just looking at a
        // booked survey doesn't start it.
        synced: true,
        finish: d?.finish,
        signature: d?.signature,
        locked,
      };
      await putDraft(d);
    } else if (d.locked !== locked) {
      d = { ...d, locked };
      await putDraft(d);
    }
    return d;
  }).catch(() => null);

  if (draft && !draft.synced && !draft.locked) scheduleSync(id, 0);
  if (!payload && !draft) return { payload: null, answers: {}, draft: null, source, error: error ?? 'offline' };
  return { payload, answers: draft?.answers ?? payload?.survey.answers ?? {}, draft, source, error };
}

/* ── Saving answers ───────────────────────────────────────────────────────────── */

/** Every change: keep it on the phone now, save it to the server shortly after. */
export async function saveAnswers(id: string, answers: Answers): Promise<void> {
  await serial(id, async () => {
    const d = await getDraft(id);
    const base: Draft = d ?? { id, answers: {}, base: {}, baseRev: 0, savedAt: '', synced: false };
    await putDraft({ ...base, answers, savedAt: new Date().toISOString(), synced: false, error: undefined });
  });
  emit(id);
  scheduleSync(id);
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();
function scheduleSync(id: string, ms = SAVE_DELAY) {
  clearTimeout(timers.get(id));
  timers.set(
    id,
    setTimeout(() => {
      timers.delete(id);
      void syncSurvey(id).then((r) => (r === 'saved' ? drainOutbox() : null));
    }, ms)
  );
}

export type SyncResult = 'saved' | 'offline' | 'signin' | 'locked' | 'error';
const syncing = new Map<string, Promise<SyncResult>>();

/** Save this survey's answers to the server now (merging with anyone else's changes). */
export function syncSurvey(id: string): Promise<SyncResult> {
  const running = syncing.get(id);
  if (running) return running.then(() => syncSurvey(id));
  const job = doSync(id).finally(() => {
    syncing.delete(id);
    emit(id);
  });
  syncing.set(id, job);
  return job;
}

async function doSync(id: string): Promise<SyncResult> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const d = await getDraft(id).catch(() => null);
    if (!d) return 'saved';
    if (d.locked) return 'locked';
    if (d.synced) return 'saved';
    if (!online()) return 'offline';
    let r: Response;
    try {
      r = await fetch(`/api/crm/surveys/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: d.answers, base_rev: d.baseRev, saved_at: d.savedAt }),
        cache: 'no-store',
      });
    } catch {
      return 'offline';
    }
    const body = (await r.json().catch(() => ({}))) as { rev?: number; status?: string; error?: string; answers?: Answers };
    if (r.ok && typeof body.rev === 'number') {
      const rev = body.rev;
      await serial(id, async () => {
        const now = await getDraft(id);
        if (!now) return;
        await putDraft({ ...now, base: d.answers, baseRev: rev, synced: same(now.answers, d.answers), error: undefined });
      });
      await patchPack(id, (p) => ({
        ...p,
        defaults: null,
        survey: { ...p.survey, answers: d.answers, rev, status: (body.status as SurveyPayload['survey']['status']) ?? p.survey.status },
      }));
      continue; // anything typed meanwhile goes in the next round
    }
    if (r.status === 409 && body.error === 'locked') {
      await serial(id, async () => {
        const now = await getDraft(id);
        if (now) await putDraft({ ...now, locked: body.status || 'complete' });
      });
      return 'locked';
    }
    if (r.status === 409 && typeof body.rev === 'number') {
      const serverRev = body.rev;
      const serverAnswers = body.answers ?? {};
      const seen: { base?: Answers } = {};
      await serial(id, async () => {
        const now = await getDraft(id);
        if (!now) return;
        seen.base = now.base;
        const m = mergeSurvey(now.base, now.answers, serverAnswers);
        await putDraft({ ...now, answers: m.answers, base: serverAnswers, baseRev: serverRev, synced: same(m.answers, serverAnswers) });
        await renameSlots(id, m.renamedRoofs);
      });
      if (seen.base) emit(id, { base: seen.base, server: serverAnswers });
      continue;
    }
    if (r.status === 401 || r.status === 403) return 'signin';
    if (r.status === 404) {
      await serial(id, async () => {
        const now = await getDraft(id);
        if (now) await putDraft({ ...now, locked: 'deleted' });
      });
      return 'locked';
    }
    if (r.status === 408 || r.status === 429 || r.status >= 500) return 'offline';
    await serial(id, async () => {
      const now = await getDraft(id);
      if (now) await putDraft({ ...now, error: body.error || 'Couldn’t save' });
    });
    return 'error';
  }
  return 'offline';
}

/** A roof area renumbered by a merge: move this phone's waiting photos for it too. */
async function renameSlots(surveyId: string, renamed: Record<string, string>) {
  const from = Object.keys(renamed);
  if (!from.length) return;
  for (const p of await queued().catch(() => [])) {
    if (p.surveyId !== surveyId || !p.slot) continue;
    const [field, roof] = p.slot.split(':');
    if (roof && renamed[roof]) await setQueuedSlot(p.id, `${field}:${renamed[roof]}`).catch(() => null);
  }
}

/** Keep (or with null, forget) the customer's signature on the phone; it goes up with "Finish on site". */
export async function setSignature(id: string, image: string | null) {
  await serial(id, async () => {
    const d = await getDraft(id);
    if (d) await putDraft({ ...d, signature: image ?? undefined });
  });
}

export const getSignature = (id: string) => getDraft(id).then((d) => d?.signature ?? null, () => null);

/* ── Drawings and finishing (the outbox) ──────────────────────────────────────── */

/**
 * A drawing on a photo that has already gone up: kept here and sent when there's signal (a newer
 * drawing on the same photo replaces it). `blob` is the flattened JPEG; markup null removes the drawing.
 * Drawings on photos still in the queue go with the photo instead (setQueuedMarkup).
 */
export async function queueMarkup(surveyId: string, photoId: string, markup: Markup | null, blob: Blob | null) {
  await putOutbox({ id: `markup:${photoId}`, surveyId, kind: 'markup', photoId, markup, blob, at: new Date().toISOString() });
  emit(surveyId);
  void drainSurveys();
}

/**
 * "Finish on site": kept on the phone straight away (works with no signal) and sent once the answers
 * are saved and the photos are up. Tapping it again (after fixing what the server said) replaces it.
 */
export async function finishSurvey(surveyId: string, finish: Finish) {
  await serial(surveyId, async () => {
    const d = await getDraft(surveyId);
    if (d) await putDraft({ ...d, finish });
  });
  await putOutbox({ id: `complete:${surveyId}`, surveyId, kind: 'complete', finish, at: new Date().toISOString() });
  emit(surveyId);
  void drainSurveys();
}

/** Take back "Finish on site" before it has gone up (to change something). */
export async function undoFinish(surveyId: string) {
  await deleteOutbox(`complete:${surveyId}`).catch(() => null);
  await serial(surveyId, async () => {
    const d = await getDraft(surveyId);
    if (d) await putDraft({ ...d, finish: undefined });
  });
  emit(surveyId);
}

type Upload = { bucket: string; path: string; token: string };

async function post(url: string, body: unknown): Promise<{ status: number; data: Record<string, unknown> } | null> {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
    return { status: r.status, data: (await r.json().catch(() => ({}))) as Record<string, unknown> };
  } catch {
    return null;
  }
}

const refused = (data: Record<string, unknown>) =>
  data.error === 'photo_not_found' || data.error === 'survey_not_found' ? 'The photo for this drawing has been deleted.' : String(data.error || 'The drawing wasn’t accepted.');

/** 'stop' = no signal or signed out: try the rest later. */
async function sendMarkup(it: Extract<OutboxItem, { kind: 'markup' }>): Promise<{ r: 'ok' } | { r: 'stop' } | { r: 'failed'; message: string }> {
  const url = `/api/crm/surveys/${it.surveyId}/markup`;
  const stop = (x: { status: number } | null) => !x || x.status === 401 || x.status === 408 || x.status === 429 || x.status >= 500;
  let markupPath: string | null = null;
  if (it.markup && it.blob) {
    const prep = await post(url, { action: 'prepare', photo_id: it.photoId });
    if (stop(prep)) return { r: 'stop' };
    if (prep!.status !== 200) return { r: 'failed', message: refused(prep!.data) };
    const u = prep!.data as Upload;
    const up = await createClient()
      .storage.from(u.bucket)
      .uploadToSignedUrl(u.path, u.token, it.blob, { contentType: 'image/jpeg', upsert: true })
      .catch(() => ({ error: new Error('offline') }));
    if (up.error) return { r: 'stop' };
    markupPath = u.path;
  }
  const save = await post(url, { action: 'save', photo_id: it.photoId, markup: it.markup, markup_path: markupPath });
  if (stop(save)) return { r: 'stop' };
  return save!.status === 200 ? { r: 'ok' } : { r: 'failed', message: refused(save!.data) };
}

async function sendComplete(it: Extract<OutboxItem, { kind: 'complete' }>): Promise<'ok' | 'failed' | 'stop' | 'wait'> {
  const d = await getDraft(it.surveyId).catch(() => null);
  if (d && !d.synced && !d.locked) {
    if ((await syncSurvey(it.surveyId)) !== 'saved') return 'wait';
  }
  const photos = (await queued().catch(() => [])).filter((p) => p.surveyId === it.surveyId && !p.failed);
  if (photos.length) return 'wait';
  const drawings = (await outboxItems()).filter((o) => o.kind === 'markup' && o.surveyId === it.surveyId && !o.failed);
  if (drawings.length) return 'wait';
  const r = await post(`/api/crm/surveys/${it.surveyId}/complete`, {
    signature: it.finish.signature,
    signed_name: it.finish.signedName,
    finished_at: it.finish.at,
  });
  if (!r || r.status === 401 || r.status === 408 || r.status === 429 || r.status >= 500) return 'stop';
  if (r.status === 200) {
    await deleteOutbox(it.id);
    await serial(it.surveyId, () => deleteDraft(it.surveyId));
    await patchPack(it.surveyId, (p) => ({
      ...p,
      survey: { ...p.survey, status: 'complete', flags: (r.data.flags as string[]) ?? p.survey.flags, completed_at: (r.data.completed_at as string) ?? p.survey.completed_at },
    }));
    return 'ok';
  }
  const failed: FinishFailure = {
    message: String(r.data.message || r.data.error || 'The survey couldn’t be finished.'),
    missing: Array.isArray(r.data.missing) ? (r.data.missing as { label: string }[]) : undefined,
    blocks: Array.isArray(r.data.blocks) ? (r.data.blocks as { message: string }[]) : undefined,
  };
  await putOutbox({ ...it, failed });
  return 'failed';
}

let draining: Promise<void> | null = null;

/** Send waiting drawings, then finished surveys whose answers and photos are all up. */
export function drainOutbox(): Promise<void> {
  if (draining) return draining;
  draining = (async () => {
    if (!online()) return;
    const items = (await outboxItems().catch(() => [] as OutboxItem[])).sort((a, b) => a.at.localeCompare(b.at));
    for (const it of items) {
      if (it.kind !== 'markup' || it.failed) continue;
      const res = await sendMarkup(it);
      if (res.r === 'stop') return;
      if (res.r === 'ok') await deleteOutbox(it.id);
      else await putOutbox({ ...it, failed: res.message });
      emit(it.surveyId);
    }
    for (const it of items) {
      if (it.kind !== 'complete' || it.failed) continue;
      const r = await sendComplete(it);
      emit(it.surveyId);
      if (r === 'stop') return;
    }
  })()
    .catch(() => undefined)
    .finally(() => {
      draining = null;
    });
  return draining;
}

/** Remove a waiting drawing that can't go up ("the photo has been deleted"). */
export async function removeOutboxItem(id: string) {
  await deleteOutbox(id).catch(() => null);
  emit();
}

/**
 * Everything waiting, in order: photos, answers, drawings, finished surveys. Only one tab does it at
 * a time (another tab already at it means this one skips).
 */
export async function drainSurveys(): Promise<void> {
  const run = async () => {
    if (!online()) return;
    await uploadQueued().catch(() => 0);
    for (const d of await allDrafts().catch(() => [] as Draft[])) if (!d.synced && !d.locked) await syncSurvey(d.id);
    await drainOutbox();
  };
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (locks?.request) await locks.request('hx-surveys', { ifAvailable: true }, async (lock) => (lock ? run() : undefined));
  else await run();
}

/** Keep sending: when the signal comes back, when the app comes to the front, after each photo, every 60 s. */
export function watchSurveys(): () => void {
  const go = () => void drainSurveys();
  const onVisible = () => document.visibilityState === 'visible' && go();
  let t: ReturnType<typeof setTimeout> | undefined;
  const afterPhoto = () => {
    clearTimeout(t);
    t = setTimeout(() => void drainOutbox(), 1500);
  };
  window.addEventListener('online', go);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener(PHOTO_UPLOADED, afterPhoto);
  const every = setInterval(go, 60_000);
  go();
  return () => {
    window.removeEventListener('online', go);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener(PHOTO_UPLOADED, afterPhoto);
    clearInterval(every);
    clearTimeout(t);
  };
}

/* ── What the header shows ────────────────────────────────────────────────────── */

export type SaveStatus = {
  /** The server has these answers. */
  saved: boolean;
  photosWaiting: number;
  photosFailed: { id: string; slot?: string; message: string }[];
  drawingsWaiting: number;
  /** "Finish on site" tapped and not yet received by the server ("Finished, uploading"). */
  finishing: boolean;
  /** The server said the survey isn't finished (what's missing). */
  finishFailed: FinishFailure | null;
  locked: string | null;
  error: string | null;
};

export async function saveStatus(id: string): Promise<SaveStatus> {
  const [d, photos, out] = await Promise.all([getDraft(id).catch(() => null), queued().catch(() => []), outboxItems().catch(() => [] as OutboxItem[])]);
  const mine = photos.filter((p) => p.surveyId === id);
  const finish = out.find((o) => o.kind === 'complete' && o.surveyId === id) as Extract<OutboxItem, { kind: 'complete' }> | undefined;
  return {
    saved: !d || d.synced,
    photosWaiting: mine.filter((p) => !p.failed).length,
    photosFailed: mine.filter((p) => p.failed).map((p) => ({ id: p.id, slot: p.slot, message: p.failed as string })),
    drawingsWaiting: out.filter((o) => o.kind === 'markup' && o.surveyId === id && !o.failed).length,
    finishing: !!finish && !finish.failed,
    finishFailed: finish?.failed ?? null,
    locked: d?.locked ?? null,
    error: d?.error ?? null,
  };
}

/* ── The offline pack and the service worker ──────────────────────────────────── */

/** Ask the service worker to keep these pages (and their scripts) for offline use. */
export function warmPages(urls: string[]) {
  const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
  if (!sw) return;
  const msg = { type: 'WARM', urls };
  if (sw.controller) sw.controller.postMessage(msg);
  else void sw.ready.then((r) => r.active?.postMessage(msg)).catch(() => null);
}

/**
 * Copy today's and tomorrow's surveys to the phone, and have the service worker keep their pages.
 * At most every 10 minutes unless `force`. Quietly does nothing when signed out or without signal.
 * Resolves to how many surveys are on the phone, or null if it didn't run.
 */
export async function warmSurveys(opts: { force?: boolean } = {}): Promise<number | null> {
  if (!online()) return null;
  // A new deploy's service worker starts with empty caches: warm straight away, whenever it last ran.
  const shellKept = typeof caches !== 'undefined' ? !!(await caches.match('/admin/surveys/shell').catch(() => undefined)) : true;
  try {
    const last = Number(localStorage.getItem(WARM_KEY) || 0);
    if (!opts.force && shellKept && Date.now() - last < WARM_EVERY) return null;
  } catch {
    /* no localStorage: go ahead */
  }
  let body: { ready?: boolean; surveys?: SurveyPayload[] };
  try {
    const r = await fetch('/api/crm/surveys/offline-pack?days=2', { cache: 'no-store' });
    if (!r.ok) return null; // signed out, no CRM access, or the server's busy
    body = await r.json();
  } catch {
    return null;
  }
  try {
    localStorage.setItem(WARM_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
  const surveys = body.surveys ?? [];
  for (const p of surveys) {
    const id = p.survey.id;
    await serial(id, async () => {
      const d = await getDraft(id);
      if (d && !d.synced) return; // this phone's changes come first; they're merged when it's opened
      await putPack(p);
      if (d && d.synced && p.survey.rev > d.baseRev) {
        await putDraft({ ...d, answers: p.survey.answers, base: p.survey.answers, baseRev: p.survey.rev, locked: isOpen(p.survey.status) ? undefined : p.survey.status });
        emit(id, { base: d.answers, server: p.survey.answers }); // saved elsewhere: an open form takes it in
      }
    }).catch(() => null);
  }
  warmPages(['/admin', '/admin/surveys/todo', '/admin/surveys/shell', ...surveys.map((p) => `/admin/surveys/${p.survey.id}`)]);
  emit();
  return surveys.length;
}

/* ── Signing out ──────────────────────────────────────────────────────────────── */

/** Survey changes on this phone that haven't reached the server ("3 survey changes haven't uploaded yet"). */
export async function unsyncedSurveyChanges(): Promise<number> {
  const [drafts, out] = await Promise.all([allDrafts().catch(() => [] as Draft[]), outboxItems().catch(() => [] as OutboxItem[])]);
  return drafts.filter((d) => !d.synced && !d.locked).length + out.filter((o) => !o.failed).length;
}

/** On sign-out: wipe surveys from the phone, unless changes haven't uploaded (then returns how many). */
export async function clearSurveyStorage(): Promise<number> {
  const waiting = await unsyncedSurveyChanges();
  if (waiting) return waiting;
  try {
    (await dbp)?.close();
  } catch {
    /* ignore */
  }
  dbp = null;
  try {
    localStorage.removeItem(WARM_KEY);
  } catch {
    /* ignore */
  }
  await new Promise<void>((resolve) => {
    const r = indexedDB.deleteDatabase(DB);
    r.onsuccess = r.onerror = r.onblocked = () => resolve();
  });
  return 0;
}
