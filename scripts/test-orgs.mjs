// Organisations and their contacts, the pure parts (src/lib/organisations/shared.ts): what the forms may
// save (names, types, phones, emails, websites, postcodes, company and VAT numbers), the primary contact
// rules, the list's search and counts, the call / WhatsApp / email / website links, the database search
// filter staying safe, the global search's organisations (src/lib/global-search.ts), a joined job keeping
// its organisation (src/lib/crm/merge-rules.ts), and supabase/organisations.sql being additive, idempotent,
// server-only, listed for Setup and gated in schema-ready.ts.
// Usage: node --experimental-strip-types scripts/test-orgs.mjs
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

// The modules import their neighbours without the .ts on the end (as the app's bundler expects); Node needs it.
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
const O = await import('../src/lib/organisations/shared.ts');
const { searchOptions, stepOption, orgResults } = await import('../src/lib/global-search.ts');
const { combineJobs } = await import('../src/lib/crm/merge-rules.ts');

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

/* ── An organisation's details ──────────────────────────────────────────────── */

const add = (b) => O.cleanOrganisation(b, true);
eq('a name is needed', add({ name: '   ' }), { ok: false, error: 'The organisation needs a name.', field: 'name' });
eq('type defaults to Commercial customer', add({ name: 'Acme Ltd' }), { ok: true, fields: { name: 'Acme Ltd', type: 'commercial' } });
eq('names: one line, spaces squashed, 160 at most', add({ name: '  Bron  Afon\nHousing ' }).fields.name, 'Bron Afon Housing');
eq('…capped', add({ name: 'x'.repeat(300) }).fields.name.length, 160);
eq('every type is one of the six', O.ORG_TYPES.map((t) => t.key), ['commercial', 'landlord', 'public_sector', 'partner', 'supplier', 'other']);
eq('an unknown type is refused', add({ name: 'A', type: 'customer' }).ok, false);
eq('a type that isn’t a string is refused', add({ name: 'A', type: ['supplier'] }).ok, false);
eq('an edit changes only what was sent', O.cleanOrganisation({ notes: 'Gate code 1234' }, false), { ok: true, fields: { notes: 'Gate code 1234' } });
eq('an edit can’t empty the name', O.cleanOrganisation({ name: '' }, false).ok, false);
eq('empty values clear the field', O.cleanOrganisation({ phone: '', email: ' ', website: '', postcode: '', company_number: '', vat_number: '', address: '\n', notes: '' }, false).fields, {
  phone: null, email: null, website: null, address: null, postcode: null, company_number: null, vat_number: null, notes: null,
});

eq('phone as typed', add({ name: 'A', phone: '01633 965205' }).fields.phone, '01633 965205');
eq('+44 (0) phone', add({ name: 'A', phone: '+44 (0)1633 965205' }).fields.phone, '+44 (0)1633 965205');
eq('words aren’t a phone', add({ name: 'A', phone: 'ring the office' }), { ok: false, error: '“ring the office” isn’t a phone number.', field: 'phone' });
eq('nor is 123', add({ name: 'A', phone: '123' }).ok, false);
eq('email in lower case', add({ name: 'A', email: ' Accounts@Acme.CO.UK ' }).fields.email, 'accounts@acme.co.uk');
eq('a bad email is refused', add({ name: 'A', email: 'acme.co.uk' }).field, 'email');

eq('website: https:// added', add({ name: 'A', website: 'acme.co.uk' }).fields.website, 'https://acme.co.uk');
eq('website: kept as typed', add({ name: 'A', website: 'http://www.acme.co.uk/contact' }).fields.website, 'http://www.acme.co.uk/contact');
eq('website: javascript: refused', add({ name: 'A', website: 'javascript:alert(1)' }).ok, false);
eq('website: data: refused', add({ name: 'A', website: 'data:text/html,hi' }).ok, false);
eq('website: no dot refused', add({ name: 'A', website: 'localhost' }).ok, false);
eq('website: a password in it refused', add({ name: 'A', website: 'https://user:pw@acme.co.uk' }).ok, false);
eq('website link: only http(s)', [O.websiteHref('acme.co.uk'), O.websiteHref('javascript:alert(1)'), O.websiteHref(null)], ['https://acme.co.uk', null, null]);
eq('website shown short', O.websiteShown('https://www.acme.co.uk/'), 'acme.co.uk');

eq('postcode with its space, in capitals', add({ name: 'A', postcode: 'np204ab' }).fields.postcode, 'NP20 4AB');
eq('postcode already right', add({ name: 'A', postcode: 'CF10 1AA' }).fields.postcode, 'CF10 1AA');
eq('not a UK postcode: capitals, as typed', add({ name: 'A', postcode: 'd02 x285' }).fields.postcode, 'D02 X285');
eq('address keeps its lines', add({ name: 'A', address: ' Unit 4\n\n  Celtic Business Park \r\nNewport ' }).fields.address, 'Unit 4\nCeltic Business Park\nNewport');

eq('company number padded', add({ name: 'A', company_number: '1234567' }).fields.company_number, '01234567');
eq('Scottish company number', add({ name: 'A', company_number: 'sc 123456' }).fields.company_number, 'SC123456');
eq('company number: too long refused', add({ name: 'A', company_number: '123456789' }), { ok: false, error: 'A company number is 8 characters, like 01234567 or SC123456.', field: 'company_number' });
eq('company number: letters refused', add({ name: 'A', company_number: 'ACME' }).ok, false);
eq('VAT: GB added', add({ name: 'A', vat_number: '123 4567 89' }).fields.vat_number, 'GB123456789');
eq('VAT: as typed', add({ name: 'A', vat_number: 'gb 123456789' }).fields.vat_number, 'GB123456789');
eq('VAT: branch (12 digits)', add({ name: 'A', vat_number: 'GB123456789001' }).fields.vat_number, 'GB123456789001');
eq('VAT: Northern Ireland', add({ name: 'A', vat_number: 'XI123456789' }).fields.vat_number, 'XI123456789');
eq('VAT: government department', add({ name: 'A', vat_number: 'GBGD001' }).fields.vat_number, 'GBGD001');
eq('VAT: 8 digits refused', add({ name: 'A', vat_number: '12345678' }).field, 'vat_number');
eq('notes: lines kept, 4000 at most', add({ name: 'A', notes: 'a\n'.repeat(3000) }).fields.notes.length, 4000);

/* ── A contact ──────────────────────────────────────────────────────────────── */

const person = (b) => O.cleanContact(b, true);
eq('a contact needs a name', person({ role: 'Bursar' }), { ok: false, error: 'The contact needs a name.', field: 'name' });
eq('a contact', person({ name: ' Siân  Evans ', role: 'Facilities manager', mobile: '07700 900123', email: 'Sian@School.org.uk', notes: 'Mornings' }), {
  ok: true, fields: { name: 'Siân Evans', role: 'Facilities manager', mobile: '07700 900123', email: 'sian@school.org.uk', notes: 'Mornings' },
});
eq('a bad mobile is refused', person({ name: 'A', mobile: 'n/a' }).field, 'mobile');
eq('a bad email is refused', person({ name: 'A', email: 'sian@' }).field, 'email');
eq('primary only when sent as true or false', [person({ name: 'A', is_primary: true }).fields.is_primary, person({ name: 'A', is_primary: 'yes' }).fields.is_primary], [true, undefined]);
eq('an edit changes only what was sent', O.cleanContact({ role: 'Head' }, false), { ok: true, fields: { role: 'Head' } });

/* ── The primary contact ────────────────────────────────────────────────────── */

const c = (id, name, is_primary, created_at) => ({ id, name, is_primary, created_at });
const three = [c('c', 'Zoe', false, '2026-10-03'), c('a', 'Anna', false, '2026-10-01'), c('b', 'Bob', true, '2026-10-02')];
eq('primary first, then A to Z', O.sortContacts(three).map((x) => x.name), ['Bob', 'Anna', 'Zoe']);
eq('the list given isn’t changed', three.map((x) => x.id), ['c', 'a', 'b']);
eq('after the primary goes: the one added first', O.nextPrimary(three.filter((x) => x.id !== 'b')).name, 'Anna');
eq('nobody left: nobody', O.nextPrimary([]), null);

/* ── Links ──────────────────────────────────────────────────────────────────── */

eq('call', O.telHref('07700 900123'), 'tel:07700900123');
eq('call +44 (0): the 0 dropped', O.telHref('+44 (0)7700 900123'), 'tel:+447700900123');
eq('no number, no link', [O.telHref(''), O.telHref(null)], [null, null]);
eq('WhatsApp on the device', O.waMeHref('07700 900123'), 'https://wa.me/447700900123');
eq('WhatsApp: too short, no link', O.waMeHref('12345'), null);
eq('email', [O.mailHref('a@b.co'), O.mailHref('not an email')], ['mailto:a@b.co', null]);
eq('an email that would add headers is no link', O.mailHref('a@b.co?bcc=x@y.z,'), null);
eq('…and can’t be saved', add({ name: 'A', email: 'x@y.com?cc=a@b.com' }).field, 'email');

/* ── The list: search, order and counts ─────────────────────────────────────── */

const row = (name, o = {}) => ({ name, type: 'commercial', postcode: null, email: null, phone: null, company_number: null, vat_number: null, people: [], contacts: 0, jobs: 0, open_jobs: 0, ...o });
const list = [
  row('Bron Afon Community Housing', { type: 'landlord', postcode: 'NP44 3HQ', phone: '01633 620111', people: ['Rhys Jones Asset manager rhys@bronafon.org.uk'] }),
  row('CEF Newport', { type: 'supplier', email: 'newport@cef.co.uk', company_number: '01234567' }),
  row('Ysgol Gymraeg Casnewydd', { type: 'public_sector', people: ['Siân Evans Bursar'] }),
  row('Afon Builders', { type: 'partner' }),
];
const find = (q) => list.filter((o) => O.matchesOrg(o, q)).map((o) => o.name);
eq('by name, any order', find('housing bron'), ['Bron Afon Community Housing']);
eq('by a contact’s name', find('rhys'), ['Bron Afon Community Housing']);
eq('by a contact’s role', find('bursar'), ['Ysgol Gymraeg Casnewydd']);
eq('accents don’t count', find('sian'), ['Ysgol Gymraeg Casnewydd']);
eq('by postcode, no space', find('np443hq'), ['Bron Afon Community Housing']);
eq('by phone, spaced differently', find('01633620111'), ['Bron Afon Community Housing']);
eq('by phone, +44', find('+44 1633 620111'), ['Bron Afon Community Housing']);
eq('by email', find('cef.co.uk'), ['CEF Newport']);
eq('by company number', find('01234567'), ['CEF Newport']);
eq('a word on two of them', find('afon'), ['Bron Afon Community Housing', 'Afon Builders']);
eq('nothing typed: all of them', find('').length, 4);
eq('order: names the words start first', O.sortOrgs(list.filter((o) => O.matchesOrg(o, 'afon')), 'afon').map((o) => o.name), ['Afon Builders', 'Bron Afon Community Housing']);
eq('order: A to Z with nothing typed', O.sortOrgs(list, '').map((o) => o.name)[0], 'Afon Builders');
eq('counts by type', O.countByType(list), { all: 4, commercial: 0, landlord: 1, public_sector: 1, partner: 1, supplier: 1, other: 0 });
eq('counts line', [O.countsLine({ contacts: 1, jobs: 0, open_jobs: 0 }), O.countsLine({ contacts: 3, jobs: 2, open_jobs: 1 }), O.countsLine({ contacts: 0, jobs: 2, open_jobs: 2 })], [
  '1 contact · no jobs yet', '3 contacts · 2 jobs (1 open)', '0 contacts · 2 jobs',
]);
eq('type words', [O.orgTypeLabel('landlord'), O.orgTypeShort('public_sector'), O.orgTypeLabel('nonsense')], ['Landlord or housing association', 'Public sector', 'Other']);

/* ── The database search filter ─────────────────────────────────────────────── */

eq('org: text columns', O.orgWordFilter('acme', 'org'), ['name.ilike.%acme%', 'postcode.ilike.%acme%', 'email.ilike.%acme%', 'company_number.ilike.%acme%']);
eq('org: a postcode without its space', O.orgWordFilter('np443hq', 'org').at(-1), 'postcode.ilike.%np44%3hq%');
eq('contact: a mobile however it was typed', O.orgWordFilter('07700 900123', 'contact').at(-1), 'mobile.ilike.%7700%900%123%');
eq('contact: +44 finds 07…', O.orgWordFilter('+447700900123', 'contact').at(-1), 'mobile.ilike.%7700%900%123%');
eq('contact: short digits', O.orgWordFilter('0770', 'contact').at(-1), 'mobile.ilike.%770%');
// What reaches the filter has been through cleanSearch: no comma, bracket or quote to add a condition.
const { cleanSearch } = await import('../src/lib/global-search.ts');
const sneaky = cleanSearch('acme,id.neq.0),or(name.ilike.*');
eq('a typed comma or bracket can’t add a condition', O.orgWordFilter(sneaky, 'org').every((f) => !/[,()]/.test(f)), true);

/* ── Global search: organisations after the people ──────────────────────────── */

const hits = orgResults('afon', [
  { id: 'o1', name: 'Bron Afon Community Housing', type: 'landlord', postcode: 'NP44 3HQ', contact: null },
  { id: 'o2', name: 'Afon Builders', type: 'partner', postcode: null, contact: null },
  { id: 'o1', name: 'Bron Afon Community Housing', type: 'landlord', postcode: 'NP44 3HQ', contact: { id: 'k1', name: 'Afon Rees', role: 'Surveyor' } },
]);
eq('names the words start first (an org’s, or its contact’s)', hits.map((h) => `${h.name}${h.contact ? `/${h.contact.name}` : ''}`), ['Afon Builders', 'Bron Afon Community Housing/Afon Rees', 'Bron Afon Community Housing']);
eq('type in words, and where it opens', [hits[0].type, hits[0].href], ['Partner who refers work', '/admin/crm/organisations/o2']);
const person1 = { id: 'p', name: 'Tom', ref: null, postcode: null, phone: null, source: '', status: 'New', created_at: '', href: '/admin/crm/j', jobs: [], more: 0 };
const opts = searchOptions([person1], hits);
eq('lines: people, then organisations (one per contact matched)', opts.map((o) => o.key), ['p-p', 'o-o2', 'o-o1-k1', 'o-o1']);
eq('an organisation line opens its page', opts[1].href, '/admin/crm/organisations/o2');
eq('↑/↓ reach the organisations', stepOption(opts, 0, 1), 1);
eq('no organisations: as before', searchOptions([person1]).map((o) => o.key), ['p-p']);
eq('an organisation whose name is what was typed comes before half-matching people', searchOptions([{ ...person1, name: 'Mrs J Afon' }], hits.slice(0, 1), 'afon b').map((o) => o.key), ['o-o2', 'p-p']);
eq('…but not before a person whose name fits as well', searchOptions([{ ...person1, name: 'Afon Rees' }], hits.slice(0, 1), 'afon').map((o) => o.key), ['p-p', 'o-o2']);

/* ── Merging: a joined job keeps its organisation ───────────────────────────── */

const job = (id, o = {}) => ({ id, enquiry_id: 'e', title: 'Solar', stage: 'lead', products: [], created_at: '2026-10-01', organisation_id: null, organisation_contact_id: null, ...o });
const into = combineJobs(job('k'), job('f', { organisation_id: 'org', organisation_contact_id: 'con' }), '2026-10-20T10:00:00Z');
eq('kept job had none: both come across, together', [into.set.organisation_id?.to, into.set.organisation_contact_id?.to], ['org', 'con']);
const keeps = combineJobs(job('k', { organisation_id: 'org2', organisation_contact_id: null }), job('f', { organisation_id: 'org', organisation_contact_id: 'con' }), '2026-10-20T10:00:00Z');
eq('kept job has one: it stays, and no other org’s contact is put on it', [keeps.set.organisation_id, keeps.set.organisation_contact_id], [undefined, undefined]);
const before = combineJobs({ ...job('k'), organisation_id: undefined }, job('f'), '2026-10-20T10:00:00Z');
eq('before organisations.sql: nothing to do', 'organisation_id' in before.set, false);

/* ── The SQL, Setup and the gate ────────────────────────────────────────────── */

const sql = read('supabase/organisations.sql').replace(/--[^\n]*/g, '');
eq('only additive statements (no drop, no delete, no truncate)', /\b(drop|truncate|delete\s+from)\b/i.test(sql), false);
eq('every table and index "if not exists"', [...sql.matchAll(/create (?:unique )?(?:table|index) (?!if not exists)/gi)].length, 0);
eq('every column "if not exists"', [...sql.matchAll(/add column (?!if not exists)/gi)].length, 0);
eq('server-only: RLS on both tables, no policies', [/enable row level security/.test(sql) && /organisations\s+enable row level security/.test(sql), /organisation_contacts\s+enable row level security/.test(sql), /create policy/i.test(sql)], [true, true, false]);
eq('contacts go with their organisation', /organisation_id\s+uuid not null references public\.organisations\(id\) on delete cascade/.test(sql), true);
eq('a job is unlinked, never deleted, when its organisation or contact goes', [
  /crm_projects add column if not exists organisation_id\s+uuid references public\.organisations\(id\) on delete set null/.test(sql),
  /crm_projects add column if not exists organisation_contact_id uuid references public\.organisation_contacts\(id\) on delete set null/.test(sql),
], [true, true]);
eq('one primary contact per organisation', /unique index if not exists \w+ on public\.organisation_contacts \(organisation_id\) where is_primary/.test(sql), true);
eq('the type check matches ORG_TYPES', sql.match(/type in \(([^)]*)\)/)[1].replace(/'/g, '').split(','), O.ORG_TYPES.map((t) => t.key));
eq('PostgREST told to reload', /notify pgrst, 'reload schema'/.test(sql), true);
eq('listed for Setup', read('src/lib/setup-files.ts').includes("'organisations.sql'"), true);
eq('on the to-do list', /sql\('organisations\.sql'/.test(read('src/lib/setup-checks.ts')), true);
eq('gated on both the contacts table and the job’s link', /has\('organisation_contacts'\)[\s\S]*has\('crm_projects', 'organisation_contact_id'\)[\s\S]*organisations: orgContacts && jobOrgs/.test(read('src/lib/schema-ready.ts')), true);
eq('no foreign key to a customer or a job (nothing for merge.sql to move)', /references public\.(enquiries|crm_projects)\(id\)/.test(sql), false);

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
