// Uploads from the site app straight to storage (photos, thumbnails, certificate PDFs: client.ts
// putToStorage): a stalled upload gives up after its time limit and counts as no signal, so it
// can't hold up everything queued behind it; the limit is slow enough (a minute plus about 10 KB/s)
// that a photo crawling up on weak signal still finishes; and storage's answers are sorted.
// Usage: node --experimental-strip-types scripts/test-site-upload.mjs
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (e) {
      if (/^(?:\.\.?\/|file:)/.test(specifier) && !/\.\w+$/.test(specifier)) return next(`${specifier}.ts`, context);
      throw e;
    }
  },
});
const C = await import('../src/lib/site/client.ts');

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

/* ── The time limit ────────────────────────────────────────────────────────── */

eq('a minute at the least', C.uploadTimeoutMs(0), 60_000);
eq('1 MB: about 160 s', C.uploadTimeoutMs(1_000_000), 160_000);
eq('2 MB (a label photo): about 260 s', C.uploadTimeoutMs(2_000_000), 260_000);
eq('15 MB certificate PDF: about 27 minutes', Math.round(C.uploadTimeoutMs(15 * 1024 * 1024) / 60_000), 27);
// The reviewer's first idea (30 s + 1 s per 100 KB) assumes ~100 KB/s: a 2 MB photo on weak 3G (~15 KB/s,
// 133 s) would be cut off every try and never send. This one allows 10 KB/s on top of the minute.
const weak3g = (bytes) => (bytes / 15_000) * 1000;
eq('a slow but moving 2 MB upload on weak 3G finishes inside the limit', [500_000, 1_000_000, 2_000_000, 2_400_000].every((b) => weak3g(b) < C.uploadTimeoutMs(b)), true);
eq('the old 30 s + 1 s/100 KB would have cut it off', weak3g(2_000_000) > 30_000 + 2_000_000 / 100, true);

/* ── A stalled upload ──────────────────────────────────────────────────────── */

const realFetch = globalThis.fetch;
const blob = new Blob([new Uint8Array(1234)], { type: 'image/jpeg' });
let seen = null;
// The connection hangs: nothing ever answers, until the request is aborted.
globalThis.fetch = (url, init) => {
  seen = { url, method: init.method, headers: init.headers, credentials: init.credentials, signal: init.signal };
  return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
};
const t0 = Date.now();
const r = await C.putToStorage('https://storage.example/upload/sign/x.jpg?token=t', blob, { 'content-type': 'image/jpeg', 'x-upsert': 'true' }, 60);
const took = Date.now() - t0;
eq('a stalled upload counts as no signal (sent again later)', r, 'offline');
eq('… once its time is up, not before', took >= 50 && took < 2000, true);
eq('… and the request itself was stopped', seen.signal.aborted, true);
eq('a PUT with the upload headers, no cookies', [seen.method, seen.headers, seen.credentials], ['PUT', { 'content-type': 'image/jpeg', 'x-upsert': 'true' }, 'omit']);

// The default limit comes from the blob's size.
const realTimeout = globalThis.setTimeout;
let limit = null;
globalThis.setTimeout = (fn, ms, ...rest) => {
  if (limit === null) limit = ms;
  return realTimeout(fn, 1, ...rest);
};
const big = new Blob([new Uint8Array(500_000)]);
await C.putToStorage('https://storage.example/u', big, {});
globalThis.setTimeout = realTimeout;
eq('the default limit is scaled to the size (500 KB → 110 s)', limit, 110_000);

/* ── Storage's answers ─────────────────────────────────────────────────────── */

const answer = (res) => {
  globalThis.fetch = async () => res;
  return C.putToStorage('https://storage.example/u', blob, {});
};
eq('stored', await answer({ ok: true, status: 200 }), 'ok');
eq('storage said no', await answer({ ok: false, status: 400 }), 'error');
globalThis.fetch = async () => {
  throw new TypeError('Failed to fetch');
};
eq('no signal at all', await C.putToStorage('https://storage.example/u', blob, {}), 'offline');
// A quick answer leaves no timer behind (the test would hang on a live one).
globalThis.fetch = realFetch;

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
