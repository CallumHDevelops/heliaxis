// Searching word by word (src/lib/search-words.ts): how what's typed splits into words (a reference,
// postcode or phone number typed with spaces stays one), accents, the order results come in, and the
// filter the database gets; then every search box's matcher on the same people (the CRM, Enquiries, the
// WhatsApp dock, the dashboard's jobs), so "rob evans" finds Robert Evans everywhere.
// Usage: node --experimental-strip-types scripts/test-search-words.mjs
import { registerHooks } from 'node:module';

// The files under test import with the app's '@/' alias and without the .ts on the end; Node needs both spelled out.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('@/')) specifier = new URL(`../src/${specifier.slice(2)}`, import.meta.url).href;
    try {
      return next(specifier, context);
    } catch (e) {
      if (/^(?:\.\.?\/|file:)/.test(specifier) && !/\.\w+$/.test(specifier)) return next(`${specifier}.ts`, context);
      throw e;
    }
  },
});
const { accentPattern, everyGroup, everyWord, fold, hasText, MAX_WORDS, nameRank, searchWords, withoutAccents } = await import('../src/lib/search-words.ts');
const { cleanSearch, customerRank, groupResults, jobMatches } = await import('../src/lib/global-search.ts');
const { refPatterns } = await import('../src/lib/projects/refs.ts');
const { matchesSearch } = await import('../src/app/admin/crm/crm-shared.ts');
const { leadMatches } = await import('../src/lib/enquiries.ts');
const { chatMatches } = await import('../src/components/admin/whatsapp/dock-shared.ts');

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

// ── Splitting into words ──
eq('two words', searchWords('rob evans'), ['rob', 'evans']);
eq('either order', searchWords('evans rob'), ['evans', 'rob']);
eq('extra spaces', searchWords('  rob   evans  '), ['rob', 'evans']);
eq('a name and part of a postcode', searchWords('rob np15'), ['rob', 'np15']);
eq('a single letter counts', searchWords('robert e'), ['robert', 'e']);
eq('one letter alone', searchWords('r'), ['r']);
eq('a postcode with its space is one word', searchWords('np15 1dg'), ['np15 1dg']);
eq('...and without', searchWords('np151dg'), ['np151dg']);
eq('...and among other words', searchWords('rob np15 1dg'), ['rob', 'np15 1dg']);
eq('a phone number in groups is one word', searchWords('07791 120089'), ['07791 120089']);
eq('...+44 too', searchWords('+44 7791'), ['+44 7791']);
eq('...and among other words', searchWords('rob 07791 120089'), ['rob', '07791 120089']);
eq('...but house numbers stay apart', searchWords('flat 2 12 high st'), ['flat', '2', '12', 'high', 'st']);
eq('a reference', searchWords('HX-0080'), ['HX-0080']);
eq('...short', searchWords('hx80'), ['hx80']);
eq('...by its number', searchWords('0080'), ['0080']);
eq('...typed with a space', searchWords('hx 80'), ['hx 80']);
eq('...among other words', searchWords('rob hx 80'), ['rob', 'hx 80']);
eq('accents kept as typed (the database is given them)', searchWords('Siân'), ['Siân']);
eq('commas and brackets split words', searchWords('evans,rob (np15)'), ['evans', 'rob', 'np15']);
eq('quotes too', searchWords(`o'brien “rob”`), ['o', 'brien', 'rob']);
eq('the same word twice counts once', searchWords('rob ROB'), ['rob']);
eq(`at most ${MAX_WORDS} words`, searchWords('a b c d e f g'), ['a', 'b', 'c', 'd', 'e']);
eq('nothing', [searchWords(''), searchWords('   '), searchWords(null), searchWords(',,')], [[], [], [], []]);
eq('capped at 80 characters', searchWords(`${'a'.repeat(78)} bcd`), ['a'.repeat(78), 'b']);
eq('everyWord: nothing typed passes', everyWord('', () => false), true);

// ── Accents ──
eq('fold', [fold('Siân'), fold('Llŷr'), fold('ŴŶÉ'), fold(null)], ['sian', 'llyr', 'wye', '']);
eq('sian finds Siân', hasText('Siân Davies', 'sian'), true);
eq('Siân finds Sian', hasText('Sian Davies', 'Siân'), true);
eq('case aside', hasText('ROBERT EVANS', 'rob'), true);

// ── The order results come in ──
eq('rob → Rob', nameRank('rob', 'Rob Rennie'), 0);
eq('rob → Robert', nameRank('rob', 'Robert Evans'), 0);
eq('rob → Jane Robson (a later word) next', nameRank('rob', 'Jane Robson'), 1);
eq('rob inside a word after that', nameRank('rob', 'Barrob Farm'), 3);
eq('rob evans → Robert Evans, in order', nameRank('rob evans', 'Robert Evans'), 0);
eq('rob evans → Evans Robinson, out of order', nameRank('rob evans', 'Evans Robinson'), 2);
eq('evans rob → Evans Robinson, in order', nameRank('evans rob', 'Evans Robinson'), 0);
eq('evans rob → Robert Evans, out of order', nameRank('evans rob', 'Robert Evans'), 2);
eq('robert e → Robert Evans', nameRank('robert e', 'Robert Evans'), 0);
eq('robert e → Robert Stitch (e only inside a word)', nameRank('robert e', 'Robert Stitch'), 3);
eq('rob np15: the postcode is elsewhere', nameRank('rob np15', 'Robert Evans'), 3);
eq('...Robert ahead of Evans Robinson', nameRank('rob np15', 'Evans Robinson'), 4);
eq('sian → Siân', nameRank('sian', 'Siân Davies'), 0);
eq('O’Brien’s words', nameRank('o brien', "Sean O'Brien"), 1);
eq('nothing typed', nameRank('', 'Anyone'), 0);

// ── The database's filter ──
eq('one word: its alternatives', everyGroup([['name.ilike.%rob%', 'email.ilike.%rob%']]), 'name.ilike.%rob%,email.ilike.%rob%');
eq('several: every one needed', everyGroup([['name.ilike.%rob%'], ['name.ilike.%evans%', 'email.ilike.%evans%']]), 'and(or(name.ilike.%rob%),or(name.ilike.%evans%,email.ilike.%evans%))');
const sian = accentPattern('sian');
eq('accent pattern finds Siân, Sian and SIÂN', ['Siân', 'Sian', 'SIÂN', 'Sean'].map((n) => new RegExp(sian, 'i').test(n)), [true, true, true, false]);
eq('...typed with the accent, the same pattern', accentPattern('Siân'), sian);
eq('...Llŷr, Gwenllïan, Siôn', [['llyr', 'Llŷr'], ['gwenllian', 'Gwenllïan'], ['sion', 'Siôn']].map(([w, n]) => new RegExp(accentPattern(w), 'i').test(n)), [true, true, true]);
eq('...a double-barrelled name', new RegExp(accentPattern('lloyd-williams'), 'i').test('Bethan Lloyd-Williams'), true);
eq('...nothing but letters, hyphens and [ ] in it', /^[\p{L}\-[\]]+$/u.test(sian), true);
eq('...none for numbers, emails, long words', [accentPattern('np15'), accentPattern('rob@x.com'), accentPattern('a'.repeat(25)), accentPattern('hx80')], [null, null, null, null]);
eq('...and left off on request', withoutAccents([['name.ilike.%sian%', `name.imatch.${sian}`]]), [['name.ilike.%sian%']]);

// Whatever's typed, the filter keeps its shape: one or() per word, each part column.op.value.
const splitTop = (s) => {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  return [...out, cur];
};
const filterFor = (raw) => {
  const words = searchWords(cleanSearch(raw));
  const groups = words.map((w) => [`name.ilike.%${w}%`, `email.ilike.%${w}%`, ...(accentPattern(w) ? [`name.imatch.${accentPattern(w)}`] : [])]);
  return { words, groups, filter: everyGroup(groups) };
};
const shape = (raw) => {
  const { words, filter } = filterFor(raw);
  const groups = words.length === 1 ? [filter] : /^and\((.*)\)$/.exec(filter)[1].split(/(?<=\)),(?=or\()/).map((g) => /^or\((.*)\)$/.exec(g)[1]);
  const leaves = groups.flatMap(splitTop);
  return { words: words.length, groups: groups.length, safe: leaves.every((l) => /^(name|email)\.(ilike|imatch)\.[^,()"\\]*$/.test(l)) };
};
for (const evil of [
  'rob),name.eq.x,(evans',
  `rob' "or(1)" %* \\ evans`,
  'and(or(id.eq.1)),rob',
  'rob,email.not.is.null',
  'a.b.c d:e',
  '))))((((rob',
]) {
  const s = shape(evil);
  eq(`can't change the filter: ${evil}`, s.safe && s.groups === s.words && s.words <= MAX_WORDS, true);
}
eq('6+ words: capped at 5 groups', filterFor('one two three four five six seven').groups.length, 5);

// ── Every search box, on the same people ──
const rob80 = { customer: 'Robert Evans', title: 'Robert Evans · NP15 1DG', postcode: 'NP15 1DG', phone: '07791 120089', project_ref: 'HX-0080', customer_ref: 'HX-0080' };
const rob69 = { customer: 'Robert Evans', title: 'Solar + battery', postcode: 'CF10 1AA', phone: '07700 900169', project_ref: 'HX-0069', customer_ref: 'HX-0069' };
const stitch = { customer: 'Robert Stitch', title: 'Robert Stitch · NP20 4AB', postcode: 'NP20 4AB', phone: '07700 900171', project_ref: 'HX-0071', customer_ref: 'HX-0071' };
const rennie = { customer: 'Rob Rennie', title: 'Rob Rennie · NP44 3HQ', postcode: 'NP44 3HQ', phone: '07700 900175', project_ref: 'HX-0075', customer_ref: 'HX-0075' };
const sianD = { customer: 'Siân Davies', title: 'Siân Davies · CF5 2QH', postcode: 'CF5 2QH', phone: null, project_ref: null, customer_ref: null };
const crmRows = { rob80, rob69, stitch, rennie, sianD };
const crmFinds = (q) => Object.entries(crmRows).filter(([, p]) => matchesSearch(p, q)).map(([k]) => k);
eq('CRM: rob → all four Robs', crmFinds('rob'), ['rob80', 'rob69', 'stitch', 'rennie']);
eq('CRM: rob evans → both Robert Evanses', crmFinds('rob evans'), ['rob80', 'rob69']);
eq('CRM: evans rob → the same', crmFinds('evans rob'), ['rob80', 'rob69']);
eq('CRM: rob np15 → the one in NP15', crmFinds('rob np15'), ['rob80']);
eq('CRM: robert e → every Robert (the e is in Robert too)…', crmFinds('robert e'), ['rob80', 'rob69', 'stitch']);
eq('…with the Evanses first', ['stitch', 'rob80'].map((k) => nameRank('robert e', crmRows[k].customer)), [3, 0]);
eq('CRM: np15 1dg', crmFinds('np15 1dg'), ['rob80']);
eq('CRM: np151dg', crmFinds('np151dg'), ['rob80']);
eq('CRM: 07791 120089', crmFinds('07791 120089'), ['rob80']);
eq('CRM: +44 7791', crmFinds('+44 7791'), ['rob80']);
eq('CRM: HX-0080', crmFinds('HX-0080'), ['rob80']);
eq('CRM: hx80', crmFinds('hx80'), ['rob80']);
eq('CRM: 0080', crmFinds('0080'), ['rob80']);
eq('CRM: rob hx 69', crmFinds('rob hx 69'), ['rob69']);
eq('CRM: rob 07791 120089', crmFinds('rob 07791 120089'), ['rob80']);
eq('CRM: sian → Siân', crmFinds('sian'), ['sianD']);
eq('CRM: Siân → Siân', crmFinds('Siân'), ['sianD']);
eq('CRM: rob smith → nobody', crmFinds('rob smith'), []);
eq('CRM: the 6th word is left off', crmFinds('robert evans np15 hx80 07791 zzz'), ['rob80']);
eq('CRM: injection is just words', crmFinds('rob),(evans'), ['rob80', 'rob69']);
eq('CRM: nothing typed → everyone', crmFinds('').length, 5);

const lead = (id, name, extra = {}) => ({ id, name, org: '', email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`, phone: '', town: '—', postcode: '', sector: '—', interests: [], msg: '', src: 'website', time: '', isnew: true, status: 'New', created_at: '', ref: '', ...extra });
const leads = [
  lead('rob80', 'Robert Evans', { postcode: 'NP15 1DG', phone: '07791 120089', ref: 'HX-0080' }),
  lead('rob69', 'Robert Evans', { postcode: 'CF10 1AA', phone: '07700 900169', ref: 'HX-0069' }),
  lead('stitch', 'Robert Stitch', { postcode: 'NP20 4AB', ref: 'HX-0071' }),
  lead('rennie', 'Rob Rennie', { postcode: 'NP44 3HQ', ref: 'HX-0075' }),
  lead('sianD', 'Siân Davies', { postcode: 'CF5 2QH' }),
];
const enqFinds = (q) => leads.filter((l) => leadMatches(l, q)).map((l) => l.id);
eq('Enquiries: rob evans', enqFinds('rob evans'), ['rob80', 'rob69']);
eq('Enquiries: evans rob', enqFinds('evans rob'), ['rob80', 'rob69']);
eq('Enquiries: rob np15', enqFinds('rob np15'), ['rob80']);
eq('Enquiries: robert e', enqFinds('robert e'), ['rob80', 'rob69', 'stitch']);
eq('Enquiries: np15 1dg / np151dg', [enqFinds('np15 1dg'), enqFinds('np151dg')], [['rob80'], ['rob80']]);
eq('Enquiries: 07791 120089 / +44 7791', [enqFinds('07791 120089'), enqFinds('+44 7791')], [['rob80'], ['rob80']]);
eq('Enquiries: HX-0080 / hx80 / 0080', [enqFinds('HX-0080'), enqFinds('hx80'), enqFinds('0080')], [['rob80'], ['rob80'], ['rob80']]);
eq('Enquiries: rob evans hx69', enqFinds('rob evans hx69'), ['rob69']);
eq('Enquiries: sian / Siân', [enqFinds('sian'), enqFinds('Siân')], [['sianD'], ['sianD']]);
eq('Enquiries: email words', enqFinds('stitch example'), ['stitch']);

const chat = (name, extra = {}) => ({ name, phone: null, waId: null, postcode: null, customerRef: null, project: null, ...extra });
const chats = {
  rob80: chat('Robert Evans', { phone: '07791 120089', waId: '447791120089', postcode: 'NP15 1DG', customerRef: 'HX-0080' }),
  rennie: chat('Rob Rennie', { waId: '447700900175', postcode: 'NP44 3HQ', customerRef: 'HX-0075' }),
  sianD: chat('Siân Davies', { waId: '447700900180' }),
};
const dockFinds = (q) => Object.entries(chats).filter(([, r]) => chatMatches(q, r)).map(([k]) => k);
eq('Dock: rob evans / evans rob', [dockFinds('rob evans'), dockFinds('evans rob')], [['rob80'], ['rob80']]);
eq('Dock: rob np15 / rob np44', [dockFinds('rob np15'), dockFinds('rob np44')], [['rob80'], ['rennie']]);
eq('Dock: +44 7791 / 07791 120089', [dockFinds('+44 7791'), dockFinds('07791 120089')], [['rob80'], ['rob80']]);
eq('Dock: rob hx80 / hx 75', [dockFinds('rob hx80'), dockFinds('hx 75')], [['rob80'], ['rennie']]);
eq('Dock: sian', dockFinds('sian'), ['sianD']);

// The dashboard's search: a job matching by itself, every word, and the order people come in.
const job = { id: 'j', enquiry_id: 'e', title: 'Robert Evans · NP15 1DG', stage: 'lead', created_at: '2026-10-01T10:00:00Z', address: '12 Heol y Coed, Newport', postcode: 'NP15 1DG', project_ref: 'HX-0080' };
eq('job: rob heol (name in the title, street in the address)', jobMatches(job, 'rob heol'), true);
eq('job: evans 1dg', jobMatches(job, 'evans np15 1dg'), true);
eq('job: rob hx80', jobMatches(job, 'rob hx80'), true);
eq('job: rob barn', jobMatches(job, 'rob barn'), false);
eq('job: nothing typed', jobMatches(job, ''), false);
eq('customerRank: a reference among other words', customerRank('rob hx80', refPatterns('hx80'), { name: 'Robert Evans', ref: 'HX-0080', jobRefs: [] }), 0);
const person = (id, name, created_at, extra = {}) => ({ id, name, postcode: null, phone: null, source: 'website', status: 'new', created_at, customer_ref: null, ...extra });
const people = [
  person('barrob', 'Barrob Farm', '2026-10-20T10:00:00Z'),
  person('robson', 'Jane Robson', '2026-10-19T10:00:00Z'),
  person('robinson', 'Evans Robinson', '2026-10-18T10:00:00Z'),
  person('rob80', 'Robert Evans', '2026-10-10T10:00:00Z', { customer_ref: 'HX-0080' }),
  person('rennie', 'Rob Rennie', '2026-10-05T10:00:00Z'),
  person('rob69', 'Robert Evans', '2026-09-01T10:00:00Z', { customer_ref: 'HX-0069' }),
];
const order = (q) => groupResults({ q, refs: [], people, jobs: [], matched: new Set(), enquiries: true }).map((p) => p.id);
eq('dashboard: rob → names starting rob, then a later word starting rob, then inside a word', order('rob'), ['rob80', 'rennie', 'rob69', 'robson', 'robinson', 'barrob']);
eq('dashboard: rob evans → the Evanses first, newest first', order('rob evans').slice(0, 3), ['rob80', 'rob69', 'robinson']);
eq('dashboard: evans rob → Evans Robinson first', order('evans rob')[0], 'robinson');

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
