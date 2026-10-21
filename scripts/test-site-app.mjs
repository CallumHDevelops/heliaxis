// The site app's pure parts: what the office changed between two packs (pack-shared.ts), a labour
// PO's state for the trade, the sync pill and its sentence (sync.ts), and the link manifest.
// Usage: node --experimental-strip-types scripts/test-site-app.mjs
import { registerHooks } from 'node:module';

// The site modules import their neighbours without ".ts", as the bundler expects.
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
const P = await import('../src/lib/site/pack-shared.ts');
const S = await import('../src/lib/site/sync.ts');
const M = await import('../src/lib/site/manifest.ts');

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

/* ── Updated by the office ─────────────────────────────────────────────────── */

const pack = {
  assignment: { starts_on: '2026-11-03', days: 2, note_to_trade: null, scope: 'Mount 16 panels', answers: {} },
  job: { address: ['12 High Street'], postcode: 'NP20 4AB', install_dates: ['2026-11-03'] },
  access: [{ label: 'Parking', value: 'Driveway' }],
  files: [{ id: 'f1' }],
};
const copy = () => JSON.parse(JSON.stringify(pack));
eq('nothing changed', P.packChanges(pack, copy()), []);
let now = copy();
now.assignment.starts_on = '2026-11-04';
now.access = [{ label: 'Parking', value: 'On the road' }];
eq('start date and access notes', P.packChanges(pack, now), ['start date', 'access notes']);
now = copy();
now.assignment.answers = { RF1: { v: 'yes' } };
eq('answers are not the office’s changes', P.packChanges(pack, now), []);
now = copy();
now.files = [{ id: 'f1' }, { id: 'f2' }];
now.assignment.note_to_trade = 'Keys at number 14';
eq('a new drawing and a note', P.packChanges(pack, now), ['notes from the office', 'drawings']);

/* ── A labour PO for the trade ─────────────────────────────────────────────── */

eq('issued', P.poState({ status: 'sent', paid_on: null }), 'Issued');
eq('held for the office', P.poState({ status: 'draft', paid_on: null }), 'Being checked');
eq('paid', P.poState({ status: 'sent', paid_on: '2026-11-14' }), 'Paid 14 Nov');

/* ── The sync pill (P12) ───────────────────────────────────────────────────── */

const base = { ...S.syncState() };
const words = (patch) => S.syncWords({ ...base, ...patch });
eq('before any reply', words({}).pill, 'Checking…');
eq('no signal, nothing waiting', words({ online: false }).pill, 'No signal');
eq('All sent only after a real reply', words({ lastOkAt: '2026-10-21T08:00:00Z' }).pill, 'All sent ✓');
const waiting = { answers: 0, photos: 3, other: 0, total: 3 };
eq('3 photos waiting', words({ online: false, waiting }), { pill: '3 waiting', line: '3 photos waiting. They’ll send when you have signal.', tone: 'wait' });
eq('photos and answers', words({ waiting: { answers: 1, photos: 2, other: 0, total: 3 } }).line, '2 photos and your answers waiting. They’ll send when you have signal.');
eq('one photo', words({ waiting: { answers: 0, photos: 1, other: 0, total: 1 } }).line, '1 photo waiting. It’ll send when you have signal.');
eq('a sign-off is named', words({ waiting: { answers: 0, photos: 0, other: 1, total: 1, signoffs: 1 } }).line, 'Your sign-off waiting. It’ll send when you have signal.');
eq('photos and a sign-off', words({ waiting: { answers: 0, photos: 2, other: 1, total: 3, signoffs: 1 } }).line, '2 photos and your sign-off waiting. They’ll send when you have signal.');
eq('sending 2 of 5', words({ phase: 'sending', done: 1, total: 5 }).pill, 'Sending 2 of 5…');
eq('a failed photo', words({ failed: { photos: 1, other: 0, total: 1 } }), { pill: '1 not sent', line: 'Couldn’t send 1 photo. Tap to retry.', tone: 'bad' });
eq('waiting beats an old All sent', words({ lastOkAt: '2026-10-21T08:00:00Z', waiting }).pill, '3 waiting');
eq('signed out', words({ revoked: true, waiting }).line, 'Open the link in your message again. Nothing waiting is lost.');

// Things, not batches: a job's answers go on the outbox every 800 ms, but they're one thing to the trade.
const job = (patch) => ({ answers: 0, photos: 0, other: 0, failed: 0, failedPhotos: 0, signoffs: 0, kinds: {}, ...patch });
const offline1 = S.countWaiting([job({ answers: 8, photos: 6, other: 1, signoffs: 1, kinds: { signoff: 1 } })]);
eq('8 answer batches, 6 photos and the sign-off: 8 things, not 15', [offline1.waiting.total, offline1.waiting.answers], [8, 1]);
eq('… and the line names them', words({ online: false, waiting: offline1.waiting }), { pill: '8 waiting', line: '6 photos, your answers and your sign-off waiting. They’ll send when you have signal.', tone: 'wait' });
eq('two jobs’ answers are two things', S.countWaiting([job({ answers: 3 }), job({ answers: 1, photos: 1 })]).waiting.total, 3);
eq('the job card counts the same way', S.thingsOf(job({ answers: 5, photos: 2, other: 1 })), 4);
const pr = S.countWaiting([job({ other: 1, kinds: { 'put-right': 1 } })]).waiting;
eq('a put right waiting is a put right, not a sign-off', words({ waiting: pr }).line, 'Your put right waiting. It’ll send when you have signal.');
const el = S.countWaiting([job({ other: 4, signoffs: 1, kinds: { file: 2, 'customer-sign': 1, signoff: 1 } })]).waiting;
eq('the electrician’s items by name', words({ waiting: el }).line, '2 certificate files, the customer’s signature and your sign-off waiting. They’ll send when you have signal.');
eq('an item of a kind with no words yet', words({ waiting: S.countWaiting([job({ other: 1, kinds: { 'eic-board': 1 } })]).waiting }).line, '1 other item waiting. It’ll send when you have signal.');
// The customer's signature after a sign-off the server turned down: it waits for them, not for signal.
eq('waiting behind a turned-down sign-off', words({ online: true, gated: 1, waiting: S.countWaiting([job({ other: 1, kinds: { 'customer-sign': 1 } })]).waiting }).line, 'The customer’s signature waiting. Not signed off yet: open the job to see what Heliaxis still needs, then sign again.');
eq('a failed batch of answers is one item, as is each other', S.countWaiting([job({ failed: 2 })]).failed.total, 2);

/* ── What each item is called (the sending sheet, "Couldn’t send") ─────────── */

eq('failed items by kind', ['answers', 'photo-delete', 'signoff', 'put-right', 'customer-sign', 'file', 'file-delete', 'eic-board'].map(S.outboxLabel), [
  'Answers',
  'Taking a photo off',
  'Sign-off',
  'Put right',
  'Customer’s signature',
  'Certificate file',
  'Taking a file off',
  'Something else',
]);

/* ── The manifest ──────────────────────────────────────────────────────────── */

const token = 'A'.repeat(43);
const m = M.siteManifest(`/portal/site/j/${token}`);
eq('manifest from a link starts there, scoped to the app', [m.start_url, m.scope, m.id, m.display], [`/portal/site/j/${token}`, '/portal/site', '/portal/site/', 'standalone']);
eq('a link token is recognised', M.isLinkToken(token), true);
eq('a path is not a token', M.isLinkToken('../../admin'), false);

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
