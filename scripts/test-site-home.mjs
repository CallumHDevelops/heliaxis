// The trade's home list counts what's on the phone, as the job screen does (ui/home-state.ts,
// ui/progress.ts): a sign-off or put right signed with no signal moves the job at once, answers and
// photos given here make it In progress, and "Roof checks n of m" counts photos from the moment
// they're taken (not only once the server has them), less any being taken off.
// Usage: node --experimental-strip-types scripts/test-site-home.mjs
import { registerHooks } from 'node:module';

const SRC = new URL('../src/', import.meta.url).href;
registerHooks({
  resolve(specifier, context, next) {
    const spec = specifier.startsWith('@/') ? SRC + specifier.slice(2) : specifier;
    try {
      return next(spec, context);
    } catch (e) {
      if (!/^(?:\.\.?\/|file:)/.test(spec) || /\.\w+$/.test(spec)) throw e;
      try {
        return next(`${spec}.ts`, context);
      } catch {
        return next(`${spec}/index.ts`, context);
      }
    }
  },
});
const H = await import('../src/app/portal/site/ui/home-state.ts');
const { jobProgress } = await import('../src/app/portal/site/ui/progress.ts');

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

const JOB = 'b1000000-0000-4000-8000-000000000001';
const at = '2026-10-21T09:00:00Z';
const op = (kind, payload = {}, extra = {}) => ({ op_id: `${kind}-${Math.random()}`, assignmentId: JOB, kind, payload, createdAt: at, tries: 0, ...extra });
const photo = (slot, client_id = `c-${Math.random()}`, extra = {}) => ({ client_id, assignmentId: JOB, slot, full: {}, thumb: {}, mime: 'image/jpeg', width: 1, height: 1, takenAt: at, tries: 0, ...extra });
const row = (patch = {}) => ({ id: JOB, status: 'sent', status_label: 'Sent', put_right: null, ...patch });
const draft = (answers) => ({ id: JOB, answers, base: {}, baseRev: 0, dirty: [], savedAt: at });
const pick = (c) => [c.status, c.status_label, c.put_right, c.local];

/* ── Where the card sits ───────────────────────────────────────────────────── */

eq('nothing done here: as the server last said', pick(H.onThisPhone(row(), [], [], undefined)), ['sent', 'Sent', null, null]);
eq('signed off with no signal: Signed off, "waiting to send"', pick(H.onThisPhone(row({ status: 'started', status_label: 'Started' }), [op('signoff', { stage: 'main' })], [], undefined)), ['done', H.SIGNED_HERE, null, H.SIGNED_HERE]);
eq('the scaffold erection signed here: signed (the strike is still to come)', H.onThisPhone(row({ status: 'started' }), [op('signoff', { stage: 'erection' })], [], undefined).status, 'signed');
eq('the strike signed here: done', H.onThisPhone(row({ status: 'signed' }), [op('signoff', { stage: 'strike' })], [], undefined).status, 'done');
eq('a sign-off the server turned down (failed) does not count', pick(H.onThisPhone(row({ status: 'started', status_label: 'Started' }), [op('signoff', { stage: 'main' }, { failed: 'No' })], [], undefined)), ['started', 'Started', null, null]);
eq('another job’s sign-off does not count', H.onThisPhone(row({ status: 'started' }), [{ ...op('signoff', { stage: 'main' }), assignmentId: 'other' }], [], undefined).status, 'started');
const fix = row({ status: 'done', status_label: 'Done', put_right: { n: 1, fix_by: '2026-10-30' } });
eq('a put right signed with no signal: out of Return to site required, "waiting to send"', pick(H.onThisPhone(fix, [op('put-right', { n: 1 })], [], undefined)), ['done', 'Done', null, H.PUT_RIGHT_HERE]);
eq('a put right for an older return leaves a newer one showing', H.onThisPhone(row({ put_right: { n: 2, fix_by: '2026-11-06' } }), [op('put-right', { n: 1 })], [], undefined).put_right, { n: 2, fix_by: '2026-11-06' });
eq('answers given here: In progress', H.onThisPhone(row(), [op('answers', { set: {} })], [], undefined).status, 'started');
eq('a photo taken here: In progress', H.onThisPhone(row({ status: 'opened' }), [], [photo('RF1')], undefined).status, 'started');
eq('answers kept in the draft (already sent, the list not refreshed): In progress', H.onThisPhone(row(), [], [], draft({ RF5: { v: 'no' } })).status, 'started');
eq('a signed job stays signed', H.onThisPhone(row({ status: 'done' }), [op('answers', { set: {} })], [], undefined).status, 'done');

/* ── "Roof checks n of m" ──────────────────────────────────────────────────── */

const pack = (photos = [], signoffs = []) => ({
  assignment: { id: JOB, trade: 'roofer', forms: [], cert_route: 'eic', schema_version: 3, signoffs, answers: {}, rev: 1, status: 'started' },
  job: { products: ['solar', 'battery'] },
  design: {},
  system: { kwp: 7.2, panel_count: 16, panel_model: null },
  sides: [],
  reads: [],
  photos,
});
const count = (s) => Number(/ (\d+) of \d+$/.exec(s ?? '')?.[1] ?? -1);
const none = jobProgress(pack(), {});
eq('the roofer’s form, counted', /^Roof checks 0 of \d+$/.test(none ?? ''), true);
const two = [photo('RF1'), photo('RF1')];
eq('photos still waiting to send count (the "Before you start" photos)', count(jobProgress(pack(), {}, two)), count(none) + 1);
eq('another job’s photos do not', count(jobProgress(pack(), {}, two.map((p) => ({ ...p, assignmentId: 'other' })))), count(none));
const server = [{ id: 's1', client_id: 'c1', slot: 'RF1' }, { id: 's2', client_id: 'c2', slot: 'RF1' }];
eq('photos already on the server count', count(jobProgress(pack(server), {})), count(none) + 1);
eq('a photo on the phone and on the server counts once', count(jobProgress(pack([server[0]]), {}, [photo('RF1', 'c1', { full: null })])), count(none));
eq('a photo being taken off does not count', count(jobProgress(pack(server), {}, [], [op('photo-delete', { client_id: 'c2' })])), count(none));
eq('signed on this phone: no form left to count (the card says "waiting to send")', jobProgress(pack(), {}, [], [op('signoff', { stage: 'main' })]), null);
eq('signed on the server: the same', jobProgress(pack([], [{ stage: 'main', signed_at: at, signed_name: 'Dave' }]), {}), null);

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
