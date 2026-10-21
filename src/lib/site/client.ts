'use client';

import { deviceRevoked, getDevice, updatePack } from './offline';

/**
 * The site app talking to the server: the phone's device token as Authorization: Bearer, a time
 * limit, and every reply sorted into what the screens and the sync need to do about it. Never
 * throws: no signal is an outcome like any other.
 */

/** Problems with their own screens (P17), from src/lib/site/device.ts PROBLEM. */
export type Problem = 'device' | 'cancelled' | 'gone' | 'link' | 'not_ready' | 'slow_down';
const PROBLEMS: Problem[] = ['device', 'cancelled', 'gone', 'link', 'not_ready', 'slow_down'];

export type Body = Record<string, unknown>;
export type Outcome<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; kind: 'offline' }
  | { ok: false; kind: 'problem'; problem: Problem; status: number; message: string }
  /** Signed off: the form is locked (the reply has the server's answers). */
  | { ok: false; kind: 'signed'; status: number; message: string; data: Body }
  /** Anything else: try again later (5xx), or give up on this item (4xx). */
  | { ok: false; kind: 'error'; status: number; message: string; data: Body; retry: boolean };

export const OFFICE_PHONE = '01633 965205';

type Opts = { method?: 'GET' | 'POST'; body?: unknown; timeoutMs?: number; token?: string | null; job?: string };

export async function siteFetch<T = Body>(path: string, opts: Opts = {}): Promise<Outcome<T>> {
  const token = opts.token !== undefined ? opts.token : ((await getDevice().catch(() => undefined))?.token ?? null);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 25_000);
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      cache: 'no-store',
      credentials: 'omit',
      signal: ctl.signal,
    });
  } catch {
    return { ok: false, kind: 'offline' };
  } finally {
    clearTimeout(timer);
  }
  // A proxy or captive portal (hotel wifi) answers with a web page: as good as no signal.
  if (!res.headers.get('content-type')?.includes('json')) return { ok: false, kind: 'offline' };
  const data = (await res.json().catch(() => ({}))) as Body;
  if (res.ok) return { ok: true, status: res.status, data: data as T };
  const error = String(data.error ?? '');
  const message = String(data.message ?? 'That didn’t work. It will try again.');
  if (error === 'signed') return { ok: false, kind: 'signed', status: res.status, message, data };
  if (PROBLEMS.includes(error as Problem)) {
    const problem = error as Problem;
    // Remembered, so the screens show it with no signal too, and nothing waiting is thrown away.
    if (problem === 'device' && token) await deviceRevoked().catch(() => {});
    if ((problem === 'cancelled' || problem === 'gone') && opts.job) {
      await updatePack(opts.job, (p) => ({ ...p, problem: { kind: problem, message, at: new Date().toISOString() } })).catch(() => {});
    }
    return { ok: false, kind: 'problem', problem, status: res.status, message };
  }
  return { ok: false, kind: 'error', status: res.status, message, data, retry: res.status >= 500 || res.status === 408 };
}

/**
 * How long one upload straight to storage may take before it counts as no signal: a minute, plus
 * about 10 KB a second (about 160 s for 1 MB, 260 s for 2 MB). Slow enough that a photo crawling up
 * on weak 3G still finishes (a retry starts again from nothing); a connection that has simply hung
 * no longer holds up everything queued behind it.
 */
export const uploadTimeoutMs = (bytes: number) => 60_000 + Math.ceil(Math.max(0, bytes) / 10);

/**
 * A PUT to a signed storage link (a photo, its thumbnail, a certificate PDF), with that time limit.
 * 'offline' when it couldn't get through or ran out of time (sent again later, from the start: the
 * upload overwrites), 'error' when storage said no.
 */
export async function putToStorage(url: string, blob: Blob, headers: Record<string, string>, timeoutMs = uploadTimeoutMs(blob.size)): Promise<'ok' | 'offline' | 'error'> {
  // AbortController and a timer, as siteFetch (older iPhones have no AbortSignal.timeout).
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { method: 'PUT', body: blob, headers, credentials: 'omit', signal: ctl.signal });
    return r.ok ? 'ok' : 'error';
  } catch {
    return 'offline';
  } finally {
    clearTimeout(timer);
  }
}

/** A real answer from the server within 4 seconds (navigator.onLine can't be trusted on a roof). */
export async function ping(): Promise<boolean> {
  const r = await siteFetch<{ ok: boolean }>('/api/site/ping', { token: null, timeoutMs: 4000 });
  return r.ok && r.data.ok === true;
}

export const pounds = (pence: number | null | undefined) =>
  pence == null ? '' : `£${(pence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "Mon 3 Nov" (dates are kept as YYYY-MM-DD, or a timestamp). */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return '';
  // Built from parts: some browsers put a comma after the weekday.
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short' }).formatToParts(d);
  const part = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${part('weekday')} ${part('day')} ${part('month')}`;
}
