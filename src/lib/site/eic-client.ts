'use client';

import { boardKey, circuitKey, newId, nextNumber, COPIED, type Board, type Circuit, type Rec } from './forms/electrician/eic-model';
import { changed, getDraft, putRec, setAnswer, type PhotoRecord } from './offline';
import { drainSoon } from './sync';
import type { Answer } from './types';

/**
 * The certificate's writes on the phone. Boards and circuits are one answer each (eic_db:b-…,
 * eic_db:c-…), changed a field at a time: each change reads the latest draft and writes the whole
 * record back, one after another per job, so two quick taps never lose one another. Signatures are
 * kept in the photo queue (slot eic_sig_con…) as PNGs, so they wait for signal and send like photos,
 * and the server's gate counts them only once they've arrived.
 */

const chains = new Map<string, Promise<unknown>>();
/** Run one change to the job's draft after the ones before it. */
function inTurn<T>(job: string, fn: () => Promise<T>): Promise<T> {
  const run = (chains.get(job) ?? Promise.resolve()).then(fn, fn);
  chains.set(job, run.catch(() => null));
  return run;
}

/** Change one answer from what it is now (the draft's, not what the screen last drew). */
export function updateAnswer(job: string, key: string, fn: (was: unknown) => unknown) {
  return inTurn(job, async () => {
    const d = await getDraft(job);
    const was = (d.answers[key] as Answer | undefined)?.v;
    await setAnswer(job, key, fn(was), 'typed');
  });
}

const obj = (v: unknown): Rec => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {});

/** One field of a board or circuit: set, or taken off when it's emptied. Text is kept short (an answer is at most 4 kB on the server). */
export function setProp(job: string, key: string, prop: string, value: unknown) {
  return updateAnswer(job, key, (was) => {
    const next = { ...obj(was) };
    if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)) delete next[prop];
    else next[prop] = typeof value === 'string' ? value.slice(0, 400) : value;
    return next;
  });
}

/** A new board ("DB2"), after the others. */
export async function addBoard(job: string, boards: Board[]): Promise<string> {
  const id = newId();
  const o = Math.max(0, ...boards.map((b) => b.o)) + 1;
  await updateAnswer(job, boardKey(id), () => ({ o, ref: boards.length ? `DB${boards.length + 1}` : 'DB1' }));
  return id;
}

/** A new circuit on a board, numbered after the board's highest; a suggested one brings its description only. */
export async function addCircuit(job: string, board: string, circuits: Circuit[], from: { desc?: string; sug?: string; copy?: Circuit } = {}): Promise<string> {
  const id = newId();
  const o = Math.max(0, ...circuits.map((x) => x.o)) + 1;
  const copied = from.copy ? Object.fromEntries(COPIED.filter((k) => k in from.copy!).map((k) => [k, from.copy![k]])) : {};
  await updateAnswer(job, circuitKey(id), () => ({ ...copied, board, o, n: nextNumber(board, circuits), ...(from.desc ? { desc: from.desc } : {}), ...(from.sug ? { sug: from.sug } : {}) }));
  return id;
}

export const removeRecord = (job: string, key: string) => updateAnswer(job, key, () => undefined);

/** A suggested circuit the electrician doesn't need, remembered on the first board. */
export const skipSuggestion = (job: string, board: Board, sug: string) =>
  updateAnswer(job, boardKey(board.id), (was) => {
    const o = obj(was);
    const skip = Array.isArray(o.skip) ? (o.skip as string[]) : [];
    return { ...o, skip: [...new Set([...skip, sug])] };
  });

/** A signature from the pad, kept as a PNG in the photo queue for its slot (it sends with the photos). */
export async function addSignature(job: string, slot: string, dataUrl: string): Promise<void> {
  const bin = atob(dataUrl.split(',')[1] ?? '');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: 'image/png' });
  const rec: PhotoRecord = {
    client_id: crypto.randomUUID(),
    assignmentId: job,
    slot,
    full: blob,
    thumb: blob,
    mime: 'image/png',
    width: 0,
    height: 0,
    takenAt: new Date().toISOString(),
    tries: 0,
  };
  await putRec('photos', rec);
  changed();
  drainSoon(0);
}
