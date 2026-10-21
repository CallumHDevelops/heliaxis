// The Enquiries list's status cards and search (src/lib/enquiries.ts): ?status= in the address bar,
// and which leads show for a status card plus the search box.
// Usage: node --experimental-strip-types scripts/test-enquiry-filter.mjs
import { registerHooks } from 'node:module';

// enquiries.ts imports './search-words' without the .ts on the end (as the app's bundler expects); Node needs it.
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (e) {
      if (/^\.\.?\//.test(specifier) && !/\.\w+$/.test(specifier)) return next(`${specifier}.ts`, context);
      throw e;
    }
  },
});
const { leadMatches, shownLeads, statusFromParam } = await import('../src/lib/enquiries.ts');

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

// ?status= → the card's label; anything else means everyone.
eq('new', statusFromParam('new'), 'New');
eq('any case, spaces', statusFromParam(' NEW '), 'New');
eq('contacted', statusFromParam('contacted'), 'Contacted');
eq('quoted (the label)', statusFromParam('quoted'), 'Quoted');
eq('qualified (the database word) is Quoted too', statusFromParam('qualified'), 'Quoted');
eq('won', statusFromParam('won'), 'Won');
eq('lost', statusFromParam('lost'), 'Lost');
eq('unknown is everyone', statusFromParam('banana'), '');
eq('empty is everyone', statusFromParam(''), '');
eq('missing is everyone', statusFromParam(null), '');
eq('undefined is everyone', statusFromParam(undefined), '');

const lead = (id, name, status, extra = {}) => ({
  id, name, org: '', email: `${id}@example.com`, phone: '', town: '—', postcode: '', sector: '—', interests: [], msg: '',
  src: 'website', time: '', isnew: status === 'New', status, created_at: '', ref: '', ...extra,
});
// Newest first, as the server sends them.
const leads = [
  lead('a', 'Esther Smith', 'New', { postcode: 'CF10 1AA', phone: '07700 900100', ref: 'HX-0042' }),
  lead('b', 'Tom Hughes', 'Contacted', { postcode: 'NP20 4AB' }),
  lead('c', 'Priya Smith', 'New', { postcode: 'NP44 3HQ' }),
  lead('d', 'Gareth Jones', 'Won'),
  lead('e', 'Aisha Khan', 'New'),
];
const ids = (list) => list.map((l) => l.id);

eq('no filter, no search: everyone', ids(shownLeads(leads, '', '')), ['a', 'b', 'c', 'd', 'e']);
eq('New: only New, newest first', ids(shownLeads(leads, '', 'New')), ['a', 'c', 'e']);
eq('Contacted', ids(shownLeads(leads, '', 'Contacted')), ['b']);
eq('Quoted: nobody', ids(shownLeads(leads, '', 'Quoted')), []);
eq('search alone', ids(shownLeads(leads, 'smith', '')), ['a', 'c']);
eq('New + search', ids(shownLeads(leads, 'smith', 'New')), ['a', 'c']);
eq('Won + search that only finds New leads', ids(shownLeads(leads, 'smith', 'Won')), []);
eq('New + postcode search', ids(shownLeads(leads, 'np44', 'New')), ['c']);
eq('New + HX ref', ids(shownLeads(leads, 'hx42', 'New')), ['a']);
eq('whitespace search is no search', ids(shownLeads(leads, '   ', 'New')), ['a', 'c', 'e']);

// A lead changed from New to Contacted while New is picked stays on screen (keep)...
const moved = leads.map((l) => (l.id === 'c' ? { ...l, status: 'Contacted', isnew: false } : l));
eq('changed while filtered stays', ids(shownLeads(moved, '', 'New', new Set(['c']))), ['a', 'c', 'e']);
eq('...without keep it goes', ids(shownLeads(moved, '', 'New')), ['a', 'e']);
eq('...but the search still applies to it', ids(shownLeads(moved, 'aisha', 'New', new Set(['c']))), ['e']);
eq('keep means nothing without a status card', ids(shownLeads(moved, 'tom', '', new Set(['c']))), ['b']);
// ...and Select all (the list without keep) leaves it out, so "delete the rest of New" can't take it.
eq('Select all skips the kept lead', ids(shownLeads(moved, '', 'New')), ['a', 'e']);
eq('Select all with a search skips it too', ids(shownLeads(moved, 'smith', 'New')), ['a']);

// The search itself (moved here from the page unchanged).
eq('phone digits', leadMatches(leads[0], '900100'), true);
eq('phone with +44', leadMatches(leads[0], '+44 7700 900100'), true);
eq('postcode without the space', leadMatches(leads[0], 'cf101aa'), true);
eq('email', leadMatches(leads[1], 'b@example'), true);
eq('no match', leadMatches(leads[1], 'zzz'), false);

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
