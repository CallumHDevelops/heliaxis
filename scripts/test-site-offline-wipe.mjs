// One phone, two people (round-1 review, security): when someone else opens their link on a phone,
// nothing of the last person's stays on it (their packs with customers' names, mobiles, addresses
// and access codes, the drawings, photos, drafts, POs and pay, and anything still waiting to send);
// the same person opening another link, or a new session after theirs was turned down, keeps
// everything. Runs src/lib/site/offline.ts against a small stand-in for IndexedDB.
// Usage: node --experimental-strip-types scripts/test-site-offline-wipe.mjs
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

/* ── A small IndexedDB: object stores with a key path and an index, in transactions ── */
function fakeIDB() {
  const dbs = new Map();
  const later = (f) => setTimeout(f, 0);
  return {
    open(name) {
      const req = {};
      later(() => {
        let db = dbs.get(name);
        const fresh = !db;
        if (!db) {
          const stores = new Map();
          db = {
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
                get: (k) => done(() => structuredClone(s.data.get(k))),
                put: (v) => done(() => (s.data.set(v[s.keyPath], structuredClone(v)), v[s.keyPath])),
                delete: (k) => done(() => void s.data.delete(k)),
                clear: () => done(() => void s.data.clear()),
                getAll: () => done(() => [...s.data.values()].map((x) => structuredClone(x))),
                index: (i) => ({ getAll: (k) => done(() => [...s.data.values()].filter((x) => x[s.indexes.get(i)] === k).map((x) => structuredClone(x))) }),
              });
              later(() => t.oncomplete?.());
              return t;
            },
          };
          dbs.set(name, db);
        }
        req.result = db;
        if (fresh) req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    },
  };
}
globalThis.indexedDB = fakeIDB();

const O = await import('../src/lib/site/offline.ts');

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

const boss = { id: 'c-boss', name: 'Boss Man', first: 'Boss' };
const op = { id: 'c-op', name: 'Op Erative', first: 'Op' };
/** Everything a job leaves on the phone. */
async function fill(job) {
  await O.putRec('packs', { id: job, pack: { job: { customer: { name: `Customer of ${job}`, phone: '07700 900123' } }, po: { payable_pence: 123400 } }, version: 'v1', storedAt: 'x', changes: [] });
  await O.putRec('files', { id: `${job}-f`, assignmentId: job, name: 'drawing.pdf', mime: 'application/pdf', blob: null, storedAt: 'x' });
  await O.putRec('drafts', { id: job, answers: { RX5: { v: 16 } }, base: {}, baseRev: 1, dirty: [], savedAt: 'x' });
  await O.putRec('outbox', { op_id: `${job}-op`, assignmentId: job, kind: 'answers', payload: {}, createdAt: 'x', tries: 0 });
  await O.putRec('photos', { client_id: `${job}-p`, assignmentId: job, slot: 'RF1', full: null, thumb: null, mime: 'image/jpeg', width: 1, height: 1, takenAt: 'x', tries: 0 });
}
const counts = async () => Object.fromEntries(await Promise.all(['packs', 'files', 'drafts', 'outbox', 'photos'].map(async (s) => [s, (await O.allRec(s)).length])));

// The boss opens his link on the operative's phone, and loads two jobs.
await O.saveDevice({ token: 'TA', contact: boss, job: 'J1' });
await O.updateDevice({ jobs: ['J1', 'J2'], home: { rows: [{ id: 'J1' }, { id: 'J2' }], at: 'x' }, links: { abc: 'J1' }, remember: { instruments: ['MFT'] } });
await fill('J1');
await fill('J2');
eq('the boss’s jobs are on the phone', await counts(), { packs: 2, files: 2, drafts: 2, outbox: 2, photos: 2 });

// The boss opens another of his links: everything stays.
await O.saveDevice({ token: 'TA', contact: boss, job: 'J4' });
eq('the same person, another link: everything stays', [await counts(), (await O.getDevice()).jobs], [{ packs: 2, files: 2, drafts: 2, outbox: 2, photos: 2 }, ['J1', 'J2', 'J4']]);

// His session was turned down, and a new one is made for him: still his, so it stays too.
await O.deviceRevoked();
await O.saveDevice({ token: 'TA2', contact: boss, job: 'J1' });
const again = await O.getDevice();
eq('the same person, a new session: everything stays, and the remembered bits', [(await counts()).outbox, again.jobs, again.remember, again.revoked ?? null], [2, ['J1', 'J2', 'J4'], { instruments: ['MFT'] }, null]);

// The operative opens his own link on the same phone.
eq('another person is told apart by id', [O.otherPerson(again, op), O.otherPerson(again, { ...boss })], [true, false]);
await O.saveDevice({ token: 'TB', contact: op, job: 'J3' });
const now = await O.getDevice();
eq('someone else’s link: nothing of the boss’s stays', await counts(), { packs: 0, files: 0, drafts: 0, outbox: 0, photos: 0 });
eq('…the phone knows only the operative’s job; no home list, links or remembered instruments of the boss’s', [now.contact, now.jobs, now.home ?? null, now.links ?? null, now.remember ?? null, now.token], [op, ['J3'], null, null, null, 'TB']);

// A phone from before the contact's id came with the session: told apart by name.
await O.putRec('device', { id: 'me', token: 'TOLD', contact: { name: 'Op Erative', first: 'Op' }, jobs: ['J3'], savedAt: 'x' });
await fill('J3');
await O.saveDevice({ token: 'TNEW', contact: op, job: 'J3' });
eq('an older record, the same name: kept', (await counts()).packs, 1);
await O.putRec('device', { id: 'me', token: 'TOLD', contact: { name: 'Op Erative', first: 'Op' }, jobs: ['J3'], savedAt: 'x' });
await O.saveDevice({ token: 'TC', contact: { id: 'c-other', name: 'Someone Else', first: 'Someone' }, job: 'J9' });
eq('an older record, another name: wiped', [(await counts()).packs, (await O.getDevice()).jobs], [0, ['J9']]);

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
