// A photo sent again after an upload that went wrong (the round-1 review's two fix branches together):
// the phone gives up on a stalled or broken upload and sends the photo again later (photo-queue.ts,
// client.ts putToStorage), and the server never lets an upload link overwrite a file and gives no
// link for one that has arrived (api/site/jobs/[id]/photos). So an upload that reached storage but
// whose reply was lost, or one that loses a race with an earlier try, still ends with the photo
// saved once, never stuck and never marked "Couldn't send"; and the phone never asks to overwrite.
// Runs the phone's photo-queue.ts (on a small IndexedDB stand-in) against the real photos route.
// Usage: node --experimental-strip-types scripts/test-site-upload-retry.mjs
import { randomUUID } from 'node:crypto';
import * as kit from './site-test-kit.mjs';

const db = kit.setup();
const { eq } = kit;

/* ── A small IndexedDB, enough for offline.ts (as test-site-offline-wipe.mjs) ── */
function fakeIDB() {
  const dbs = new Map();
  const later = (f) => setTimeout(f, 0);
  return {
    open(name) {
      const req = {};
      later(() => {
        let d = dbs.get(name);
        const fresh = !d;
        if (!d) {
          const stores = new Map();
          d = {
            createObjectStore(n, { keyPath }) {
              const s = { keyPath, data: new Map(), indexes: new Map() };
              stores.set(n, s);
              return { createIndex: (i, kp) => s.indexes.set(i, kp) };
            },
            transaction(n) {
              const s = stores.get(n);
              const t = {};
              const done = (fn) => ({ result: fn() });
              t.objectStore = () => ({
                get: (k) => done(() => s.data.get(k)),
                put: (v) => done(() => (s.data.set(v[s.keyPath], v), v[s.keyPath])),
                delete: (k) => done(() => void s.data.delete(k)),
                clear: () => done(() => void s.data.clear()),
                getAll: () => done(() => [...s.data.values()]),
                index: (i) => ({ getAll: (k) => done(() => [...s.data.values()].filter((x) => x[s.indexes.get(i)] === k)) }),
              });
              later(() => t.oncomplete?.());
              return t;
            },
          };
          dbs.set(name, d);
        }
        req.result = d;
        if (fresh) req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    },
  };
}
globalThis.indexedDB = fakeIDB();

const O = await import('../src/lib/site/offline.ts');
const PQ = await import('../src/lib/site/photo-queue.ts');
const photoRoute = await import('../src/app/api/site/jobs/[id]/photos/route.ts');

/* ── The network: the photos route, and storage's signed upload links ──────── */

const puts = [];
/** Client ids whose next main-photo upload lands in storage but whose reply never reaches the phone. */
const loseReply = new Set();
/** Client ids whose next main-photo upload finds the file already there (an earlier try landed first). */
const beaten = new Set();
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  const route = /^\/api\/site\/jobs\/([0-9a-f-]{36})\/photos$/.exec(url);
  if (route) {
    const req = new Request(`http://localhost${url}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: init.headers.Authorization }, body: init.body });
    return photoRoute.POST(req, { params: Promise.resolve({ id: route[1] }) });
  }
  const up = /^https:\/\/storage\.test\/upload\/([^/]+)\/(.+)$/.exec(url);
  if (up && init.method === 'PUT') {
    const key = `${up[1]}/${up[2]}`;
    const client = /\/([0-9a-f-]{36})\.jpg$/.exec(key)?.[1];
    puts.push({ key, headers: init.headers });
    if (client && beaten.delete(client)) db.files.set(key, new Uint8Array([1]));
    // Storage never overwrites through a link made without upsert.
    if (db.files.has(key)) return json(400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
    db.files.set(key, new Uint8Array(await init.body.arrayBuffer()));
    if (client && loseReply.delete(client)) throw new TypeError('The network connection was lost.');
    return json(200, { Key: key });
  }
  throw new TypeError('offline in the test');
};

/* ── A roofer's phone with a photo to send ─────────────────────────────────── */

const project = kit.addJob(db);
const c = kit.addContact(db);
const a = kit.addAssignment(db, project, c, { photos: {} });
const phone = await kit.addPhone(db, c);
await O.saveDevice({ token: phone.token, contact: { id: c.id, name: c.name, first: 'Dave' }, job: a.id });

async function takePhoto() {
  const rec = { client_id: randomUUID(), assignmentId: a.id, slot: 'RF1', full: new Blob([new Uint8Array(2048)]), thumb: new Blob([new Uint8Array(256)]), mime: 'image/jpeg', width: 1, height: 1, takenAt: new Date().toISOString(), tries: 0 };
  await O.putRec('photos', rec);
  return rec.client_id;
}
const send = async (id) => PQ.sendPhoto(await O.getRec('photos', id));
const mainKey = (id) => `crm-photos/${project.id}/site/${a.id}/RF1/${id}.jpg`;
const putsOf = (id) => puts.filter((p) => p.key.includes(id)).map((p) => (p.key.endsWith('.thumb.jpg') ? 'thumb' : 'photo'));
const saved = (id) => db.rows('crm_photos').filter((p) => p.storage_path.endsWith(`/${id}.jpg`)).length;

// 1. The photo reaches storage, but the reply is lost (signal drops; or the time limit ran out just as it landed).
const p1 = await takePhoto();
loseReply.add(p1);
const first = await send(p1);
eq('an upload whose reply was lost: no signal, sent again later (not "Couldn’t send")', [first, db.files.has(mainKey(p1)), saved(p1), (await O.getRec('photos', p1)).failed ?? null], ['offline', true, 0, null]);
const second = await send(p1);
const r1 = await O.getRec('photos', p1);
eq('…sent again: no link for the photo that arrived, only the thumbnail goes, and it’s saved once', [second, putsOf(p1), saved(p1), r1.full, typeof r1.uploadedId, r1.failed ?? null], ['sent', ['photo', 'thumb'], 1, null, 'string', null]);

// 2. An earlier try lands between this one's prepare and its upload: storage refuses the second copy.
const p2 = await takePhoto();
beaten.add(p2);
const raced = await send(p2);
eq('an upload that finds the photo already there: tried again later, not failed', [raced, saved(p2), (await O.getRec('photos', p2)).failed ?? null], ['later', 0, null]);
const after = await send(p2);
eq('…next time: no link for the photo, the thumbnail goes, saved once', [after, putsOf(p2), saved(p2)], ['sent', ['photo', 'thumb'], 1]);

// 3. Nothing has gone wrong: one upload each, saved.
const p3 = await takePhoto();
eq('a plain send: the photo and its thumbnail, saved', [await send(p3), putsOf(p3), saved(p3)], ['sent', ['photo', 'thumb'], 1]);

eq('the phone never asks storage to overwrite', puts.some((p) => Object.keys(p.headers ?? {}).some((h) => h.toLowerCase() === 'x-upsert')), false);
eq('every upload link the server made can’t overwrite', db.uploads.every((u) => !u.upsert), true);

kit.done();
