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

/* ── The manifest ──────────────────────────────────────────────────────────── */

const token = 'A'.repeat(43);
const m = M.siteManifest(`/portal/site/j/${token}`);
eq('manifest from a link starts there, scoped to the app', [m.start_url, m.scope, m.id, m.display], [`/portal/site/j/${token}`, '/portal/site', '/portal/site/', 'standalone']);
eq('a link token is recognised', M.isLinkToken(token), true);
eq('a path is not a token', M.isLinkToken('../../admin'), false);

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
