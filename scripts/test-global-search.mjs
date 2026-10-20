// The search on the dashboard and in the header (src/lib/global-search.ts): what's typed made safe for a
// filter, which jobs match, how people and their jobs are put together, ordered and capped, where picking
// each one goes, and the list the box shows (one job, several, none; ↑/↓ skipping lines that open nothing).
// Usage: node --experimental-strip-types scripts/test-global-search.mjs
import { registerHooks } from 'node:module';

// global-search.ts imports its neighbours without the .ts on the end (as the app's bundler expects); Node needs it.
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
const { refPatterns } = await import('../src/lib/projects/refs.ts');
const { cleanSearch, customerRank, groupResults, jobHref, jobMatches, JOBS_EACH, MAX_PEOPLE, personHint, postcodePattern, searchOptions, stepOption } = await import(
  '../src/lib/global-search.ts'
);

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

// What's typed, made safe for a PostgREST filter (as /api/crm/customers always did).
eq('plain', cleanSearch('Esther Smith'), 'Esther Smith');
eq('filter characters out', cleanSearch('smith,(id.eq.1)'), 'smith id.eq.1');
eq('wildcards and quotes out', cleanSearch(`50% "off" 'x' \`y\` a*b c\\d`), '50 off x y a b c d');
eq('spaces squashed and trimmed', cleanSearch('  np20   4ab  '), 'np20 4ab');
eq('capped at 80', cleanSearch('a'.repeat(300)).length, 80);
eq('nothing', cleanSearch(null), '');

// Postcodes with or without the space.
eq('postcode without space', postcodePattern('np204ab'), '%np20%4ab%');
eq('postcode with space', postcodePattern('NP20 4AB'), '%NP20%4AB%');
eq('London-style', postcodePattern('sw1a1aa'), '%sw1a%1aa%');
eq('not a postcode', postcodePattern('smith'), null);
eq('half a postcode', postcodePattern('np20'), null);

// Ranking: references first, then names starting with what's typed.
const refs = refPatterns('hx42');
eq('their own ref', customerRank('hx42', refs, { name: 'Zed', ref: 'HX-0042', jobRefs: [] }), 0);
eq('one of their jobs’ refs', customerRank('hx42', refs, { name: 'Zed', ref: 'HX-0007', jobRefs: ['HX-0042-2'] }), 0);
eq('name starts with it', customerRank('est', [], { name: 'Esther Smith', ref: null, jobRefs: [] }), 1);
eq('name has it', customerRank('smith', [], { name: 'Esther Smith', ref: null, jobRefs: [] }), 2);

// A job matching by itself.
const job = (id, enquiry_id, stage, extra = {}) => ({ id, enquiry_id, title: 'Solar PV', stage, created_at: '2026-10-01T10:00:00Z', address: null, postcode: null, project_ref: null, ...extra });
eq('job by title', jobMatches(job('j', 'e', 'lead', { title: 'Battery for the barn' }), 'barn'), true);
eq('job by address', jobMatches(job('j', 'e', 'lead', { address: '12 Heol y Coed, Cwmbran' }), 'heol y'), true);
eq('job by postcode, no space', jobMatches(job('j', 'e', 'lead', { postcode: 'NP44 3HQ' }), 'np443hq'), true);
eq('job by ref', jobMatches(job('j', 'e', 'won', { project_ref: 'HX-0042-2' }), 'HX-0042-2'), true);
eq('job: another ref', jobMatches(job('j', 'e', 'won', { project_ref: 'HX-0043' }), 'hx42'), false);
eq('job: no match', jobMatches(job('j', 'e', 'lead'), 'zzz'), false);
eq('job href: sales stage → CRM record', jobHref({ id: 'j1', stage: 'survey_booked' }), '/admin/crm/j1');
eq('job href: won → Projects', jobHref({ id: 'j2', stage: 'won' }), '/admin/projects/j2');

// Putting the results together.
const person = (id, name, created_at, extra = {}) => ({ id, name, postcode: 'CF10 1AA', phone: '07700 900100', source: 'meta: Video 4', status: 'new', created_at, customer_ref: null, ...extra });
const people = [
  person('a', 'Tom Smith', '2026-10-19T10:00:00Z', { customer_ref: 'HX-0042' }),
  person('b', 'Smithers', '2026-10-18T10:00:00Z', { source: 'website', status: 'contacted' }),
  person('c', 'Esther Smith', '2026-10-20T10:00:00Z'),
];
const jobs = [
  job('a1', 'a', 'lost', { title: 'Solar (2024)', created_at: '2024-05-01T10:00:00Z' }),
  job('a2', 'a', 'survey_booked', { title: 'Solar + battery', project_ref: 'HX-0042', created_at: '2026-10-19T11:00:00Z' }),
  job('a3', 'a', 'won', { title: 'EV charger', project_ref: 'HX-0042-2', created_at: '2026-09-01T10:00:00Z' }),
  job('a4', 'a', 'complete', { title: 'LEDs', created_at: '2025-01-01T10:00:00Z' }),
  job('c1', 'c', 'lead', { title: 'Solar PV' }),
];
const crm = groupResults({ q: 'smith', refs: [], people, jobs, matched: new Set(), enquiries: true });
eq('names starting with it first, then newest', crm.map((p) => p.id), ['b', 'c', 'a']);
const tom = crm.find((p) => p.id === 'a');
eq('jobs: open ones first, newest first, 3 of them', tom.jobs.map((j) => j.id), ['a2', 'a3', 'a4']);
eq('...and how many more', tom.more, 1);
eq('...a person goes to their latest open job', tom.href, '/admin/crm/a2');
eq('job labels', tom.jobs[1], { id: 'a3', title: 'EV charger', stage: 'Won', ref: 'HX-0042-2', href: '/admin/projects/a3' });
eq('person fields', crm.find((p) => p.id === 'b'), {
  id: 'b', name: 'Smithers', ref: null, postcode: 'CF10 1AA', phone: '07700 900100', source: 'Website', status: 'Contacted', created_at: '2026-10-18T10:00:00Z',
  href: '/admin/enquiries?open=b', jobs: [], more: 0,
});
eq('Meta source in words', crm.find((p) => p.id === 'c').source, 'Meta ad · Video 4');
eq('one job: the job', crm.find((p) => p.id === 'c').href, '/admin/crm/c1');

// A job that matched by itself comes first under its person, even a closed one.
const byRef = groupResults({ q: 'hx-0042-2', refs: refPatterns('hx-0042-2'), people, jobs, matched: new Set(['a3']), enquiries: true });
eq('ref match ranks first', byRef[0].id, 'a');
eq('matched job first', byRef[0].jobs[0].id, 'a3');
eq('...and picking the person opens it', byRef[0].href, '/admin/projects/a3');

// Typing someone's name "matches" their first job by its default title ("Tom Hughes · NP20 4AB"): an old Lost one doesn't jump ahead of their live job.
const hughes = [person('h', 'Tom Hughes', '2026-10-10T10:00:00Z')];
const hJobs = [
  job('old', 'h', 'lost', { title: 'Tom Hughes · NP20 4AB', address: '3 Mill Lane', created_at: '2025-03-01T10:00:00Z' }),
  job('new', 'h', 'survey_booked', { title: 'Solar + battery · NP20 4AB', created_at: '2026-10-10T11:00:00Z' }),
];
const byName = groupResults({ q: 'Tom Hughes', refs: [], people: hughes, jobs: hJobs, matched: new Set(['old']), enquiries: true });
eq('by name: the live job first', byName[0].jobs.map((j) => j.id), ['new', 'old']);
eq('...and picking them opens it', byName[0].href, '/admin/crm/new');
eq('by part of the name too', groupResults({ q: 'hughes', refs: [], people: hughes, jobs: hJobs, matched: new Set(['old']), enquiries: true })[0].href, '/admin/crm/new');
// Found by something that isn't their name (the old job's address): that job still comes first.
const byAddress = groupResults({ q: 'mill lane', refs: [], people: hughes, jobs: hJobs, matched: new Set(['old']), enquiries: true });
eq('by address: the matched job first, even Lost', byAddress[0].jobs.map((j) => j.id), ['old', 'new']);
eq('...and picking them opens it', byAddress[0].href, '/admin/crm/old');

// Enquiries only: no jobs, so everyone opens on Enquiries.
const enqOnly = groupResults({ q: 'smith', refs: [], people, jobs: [], matched: new Set(), enquiries: true });
eq('enquiries only: details on Enquiries', enqOnly.map((p) => p.href), ['/admin/enquiries?open=b', '/admin/enquiries?open=c', '/admin/enquiries?open=a']);
// CRM without Enquiries: someone with no job has nowhere to open.
const crmOnly = groupResults({ q: 'smith', refs: [], people, jobs, matched: new Set(), enquiries: false });
eq('CRM only, no job: nothing to open', crmOnly.find((p) => p.id === 'b').href, null);

// Caps.
const many = Array.from({ length: 20 }, (_, i) => person(`p${i}`, `Smith ${i}`, `2026-10-${String(10 + (i % 10)).padStart(2, '0')}T10:00:00Z`));
eq('at most 8 people', groupResults({ q: 'smith', refs: [], people: many, jobs: [], matched: new Set(), enquiries: true }).length, MAX_PEOPLE);
eq('caps are 8 and 3', [MAX_PEOPLE, JOBS_EACH], [8, 3]);

// The list: one job → just the person; several → the person, then each job; none → just the person.
const opts = searchOptions(crm);
eq('lines', opts.map((o) => o.key), ['p-b', 'p-c', 'p-a', 'j-a2', 'j-a3', 'j-a4']);
eq('a job line opens the job', opts[3].href, '/admin/crm/a2');
eq('hints', crm.map(personHint), ['Contacted', 'Lead', '4 jobs']);
eq('hint: CRM only, no job', personHint(crmOnly.find((p) => p.id === 'b')), 'No job yet');

// ↑/↓ round the ends, skipping lines that open nothing.
const ok = (href) => ({ key: href ?? 'x', kind: 'person', person: null, job: null, href });
const list = [ok('/1'), ok(null), ok('/3')];
eq('down from nothing: first', stepOption(list, -1, 1), 0);
eq('down skips the dead line', stepOption(list, 0, 1), 2);
eq('down from the last: round to the first', stepOption(list, 2, 1), 0);
eq('up from nothing: last', stepOption(list, -1, -1), 2);
eq('up skips the dead line', stepOption(list, 2, -1), 0);
eq('nothing to pick', stepOption([ok(null)], -1, 1), -1);
eq('empty list', stepOption([], -1, 1), -1);

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
