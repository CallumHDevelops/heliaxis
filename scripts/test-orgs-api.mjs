// Organisations on the server (src/lib/organisations/server.ts and the routes under /api/crm/organisations
// and /api/crm/projects/[id]/organisation) against an in-memory stand-in for the database that does what
// supabase/organisations.sql does (contacts go with their organisation, a job is unlinked when its
// organisation or contact goes, one primary contact per organisation). The owner's flow end to end: add an
// organisation with its first contact, two more, make one primary, link a job to it and that contact,
// find it in search, remove the primary contact, unlink, delete. Also: signed out → 401, before
// organisations.sql → "not ready", bad input → 400 naming the field, and one organisation's address never
// reaching another's contact (no IDOR). Nothing in the flow ever writes a customer record (enquiries) or a
// WhatsApp row: organisation contacts never become leads.
// Usage: node --experimental-strip-types scripts/test-orgs-api.mjs
import { randomUUID } from 'node:crypto';
import { registerHooks } from 'node:module';

const SRC = new URL('../src/', import.meta.url).href;
const mod = (code) => `data:text/javascript,${encodeURIComponent(code)}`;
const STUBS = {
  'server-only': 'export {}',
  '@/lib/supabase/admin': 'export const createAdminClient = () => globalThis.__db;',
  '@/lib/schema-ready': 'export async function schemaReady() { return { organisations: globalThis.__ready !== false }; }',
  '@/lib/crm/server': `
    export const isUuid = (s) => /^[0-9a-f-]{36}$/i.test(s);
    export const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    export async function crmSession() { return globalThis.__session; }
    export async function logActivity(a) { globalThis.__activity.push(a); }`,
  // Customers found by name, as the real search does word by word (it has its own tests).
  '@/lib/customer-search': `export async function findCustomers(db, q, limit) { const w = q.toLowerCase().split(' '); return { customers: db.rows('enquiries').filter((e) => w.every((x) => e.name.toLowerCase().includes(x))).slice(0, limit), refs: [], error: null }; }`,
};
registerHooks({
  resolve(specifier, context, next) {
    if (STUBS[specifier]) return { url: mod(STUBS[specifier]), shortCircuit: true };
    const spec = specifier.startsWith('@/') ? SRC + specifier.slice(2) : specifier;
    try {
      return next(spec, context);
    } catch (e) {
      if (!/\.\w+$/.test(spec)) return next(`${spec}.ts`, context);
      throw e;
    }
  },
});

/* ── The stand-in database ──────────────────────────────────────────────────── */

function fakeDb() {
  const t = {};
  const rows = (name) => (t[name] ??= []);
  const now = () => new Date(Date.now() + rows('_tick').push(1)).toISOString();
  const like = (v, p) => new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`, 'i').test(String(v ?? ''));
  /** "name.ilike.%x%" → a test; "and(or(a,b),or(c))" and "a,b" (any of) are the two shapes everyGroup makes. */
  const cond = (s) => {
    const [c, op, ...rest] = s.split('.');
    const v = rest.join('.');
    if (op === 'ilike') return (r) => like(r[c], v);
    if (op === 'eq') return (r) => String(r[c]) === v;
    if (op === 'is' && v === 'null') return (r) => (r[c] ?? null) === null;
    throw new Error(`filter not understood: ${s}`);
  };
  const anyOf = (s) => {
    const parts = s.split(',').map(cond);
    return (r) => parts.some((p) => p(r));
  };
  const parseOr = (s) => {
    const m = /^and\((.*)\)$/.exec(s);
    if (!m) return anyOf(s);
    const groups = [...m[1].matchAll(/or\(([^()]*)\)/g)].map((g) => anyOf(g[1]));
    return (r) => groups.every((g) => g(r));
  };
  const primaryClash = (r) => r.is_primary && rows('crm_contacts').some((x) => x !== r && x.is_primary && x.organisation_id === r.organisation_id);
  const from = (table) => {
    const where = [];
    let mode = 'select';
    let payload = null;
    let order = [];
    let lim = null;
    let returning = false;
    let counting = null;
    const exec = () => {
      if (mode === 'insert') {
        const r = { id: randomUUID(), created_at: now(), updated_at: now(), ...structuredClone(payload) };
        if (table === 'organisations' && !['commercial', 'landlord', 'public_sector', 'partner', 'supplier', 'other'].includes(r.type)) return { data: null, error: { code: '23514', message: 'check' } };
        if (table === 'crm_contacts') {
          if (r.organisation_id && !rows('organisations').some((o) => o.id === r.organisation_id)) return { data: null, error: { code: '23503', message: 'fk' } };
          if (primaryClash(r)) return { data: null, error: { code: '23505', message: 'duplicate key' } };
        }
        rows(table).push(r);
        return { data: r, error: null, many: false };
      }
      const list = rows(table).filter((r) => where.every((w) => w(r)));
      if (mode === 'update') {
        for (const r of list) {
          const was = { ...r };
          Object.assign(r, structuredClone(payload));
          if (table === 'crm_contacts' && primaryClash(r)) {
            Object.assign(r, was);
            return { data: null, error: { code: '23505', message: 'duplicate key' } };
          }
        }
        return { data: list, error: null, many: true };
      }
      if (mode === 'delete') {
        t[table] = rows(table).filter((r) => !list.includes(r));
        // What the foreign keys in organisations.sql do.
        if (table === 'organisations') {
          const ids = list.map((r) => r.id);
          for (const c of rows('crm_contacts')) if (ids.includes(c.organisation_id)) c.organisation_id = null;
          for (const p of rows('crm_projects')) if (ids.includes(p.organisation_id)) p.organisation_id = null;
        }
        if (table === 'crm_contacts') for (const p of rows('crm_projects')) if (list.some((c) => c.id === p.contact_id)) p.contact_id = null;
        return { data: list, error: null, many: true };
      }
      let out = list;
      for (const o of [...order].reverse()) out = [...out].sort((a, b) => (a[o.col] < b[o.col] ? -1 : a[o.col] > b[o.col] ? 1 : 0) * (o.asc ? 1 : -1));
      if (lim != null) out = out.slice(0, lim);
      return { data: out.map((r) => structuredClone(r)), error: null, many: true };
    };
    const out = (r, one) => {
      if (r.error) return { data: null, error: r.error };
      if (counting && mode === 'select') return { data: counting.head ? null : r.data, count: r.data.length, error: null };
      if (!one) return { data: mode === 'select' || returning ? r.data : null, error: null };
      const list = Array.isArray(r.data) ? r.data : r.data == null ? [] : [r.data];
      if (one === 'single' && list.length !== 1) return { data: null, error: { code: 'PGRST116', message: 'not one row' } };
      return { data: list[0] ? structuredClone(list[0]) : null, error: null };
    };
    const b = {
      select: (_cols, o) => ((returning = mode !== 'select'), (counting = o?.count ? o : null), b),
      insert: (r) => ((mode = 'insert'), (payload = r), b),
      update: (p) => ((mode = 'update'), (payload = p), b),
      delete: () => ((mode = 'delete'), b),
      eq: (c, v) => (where.push((r) => r[c] === v), b),
      neq: (c, v) => (where.push((r) => r[c] !== v), b),
      in: (c, v) => (where.push((r) => v.includes(r[c])), b),
      is: (c, v) => (where.push((r) => (r[c] ?? null) === v), b),
      not: (c, op, v) => (where.push((r) => !(op === 'is' && v === null ? (r[c] ?? null) === null : r[c] === v)), b),
      or: (s) => (where.push(parseOr(s)), b),
      order: (col, o) => (order.push({ col, asc: o?.ascending !== false }), b),
      limit: (n) => ((lim = n), b),
      range: (f, to) => ((lim = to + 1), b),
      maybeSingle: async () => out(exec(), 'maybe'),
      single: async () => out(exec(), 'single'),
      then: (res, rej) => Promise.resolve(out(exec(), null)).then(res, rej),
    };
    return b;
  };
  return { t, rows, from };
}

/* ── Calling the routes ─────────────────────────────────────────────────────── */

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}
async function call(handler, { body, params = {}, method = 'POST' } = {}) {
  const req = new Request('https://heliaxis.test/api', { method, headers: { 'content-type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const r = await handler(req, { params: Promise.resolve(params) });
  return { status: r.status, body: await r.json() };
}

const Orgs = await import('../src/app/api/crm/organisations/route.ts');
const Org = await import('../src/app/api/crm/organisations/[id]/route.ts');
const Contacts = await import('../src/app/api/crm/organisations/[id]/contacts/route.ts');
const Contact = await import('../src/app/api/crm/organisations/[id]/contacts/[contactId]/route.ts');
const Link = await import('../src/app/api/crm/projects/[id]/organisation/route.ts');
const People = await import('../src/app/api/crm/contacts/route.ts');
const Person = await import('../src/app/api/crm/contacts/[id]/route.ts');
const Customers = await import('../src/app/api/crm/contacts/customers/route.ts');
const S = await import('../src/lib/organisations/server.ts');

const db = fakeDb();
globalThis.__db = db;
globalThis.__activity = [];
globalThis.__session = { user: { id: 'staff-1' }, profile: { full_name: 'Callum', role: 'admin' } };
const customer = { id: randomUUID(), name: 'Rhys Jones', phone: '07700 900111', email: '' };
db.rows('enquiries').push(customer);
const job = { id: randomUUID(), enquiry_id: customer.id, title: 'Solar for 12 flats', stage: 'surveyed', project_ref: 'HX-0042', postcode: 'NP44 3HQ', created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z', organisation_id: null, contact_id: null };
const done = { ...job, id: randomUUID(), title: 'Battery, block B', stage: 'complete', project_ref: 'HX-0042-2', created_at: '2026-09-01T10:00:00Z' };
db.rows('crm_projects').push(job, done);
const customersAtStart = db.rows('enquiries').length;

/* ── Signed out, and before organisations.sql ───────────────────────────────── */

globalThis.__session = null;
eq('signed out: the list is refused', (await call(Orgs.GET, { method: 'GET' })).status, 401);
eq('signed out: adding is refused', (await call(Orgs.POST, { body: { name: 'X' } })).status, 401);
eq('signed out: linking a job is refused', (await call(Link.PUT, { method: 'PUT', params: { id: job.id }, body: { organisation_id: null } })).status, 401);
globalThis.__session = { user: { id: 'staff-1' }, profile: { full_name: 'Callum', role: 'admin' } };

globalThis.__ready = false;
eq('before organisations.sql: the list says not ready', (await call(Orgs.GET, { method: 'GET' })).body, { ready: false, organisations: [] });
const early = await call(Orgs.POST, { body: { name: 'X' } });
eq('…and adding says to run it', [early.status, /organisations\.sql/.test(early.body.error)], [409, true]);
eq('…and so does linking a job', (await call(Link.PUT, { method: 'PUT', params: { id: job.id }, body: { organisation_id: null } })).status, 409);
globalThis.__ready = true;

/* ── The owner's flow ───────────────────────────────────────────────────────── */

eq('a bad email is refused, naming the field', (await call(Orgs.POST, { body: { name: 'Bron Afon', email: 'bronafon' } })).body.field, 'email');
eq('a bad type is refused', (await call(Orgs.POST, { body: { name: 'Bron Afon', type: 'landlords' } })).status, 400);
eq('a bad first contact is refused before anything is saved', [(await call(Orgs.POST, { body: { name: 'Bron Afon', contact: { name: 'Rhys', mobile: 'none' } } })).body.field, db.rows('organisations').length], ['contact.mobile', 0]);

const made = await call(Orgs.POST, {
  body: { name: ' Bron Afon Community Housing ', type: 'landlord', phone: '01633 620111', website: 'bronafon.org.uk', postcode: 'np443hq', company_number: '1234567', contact: { name: 'Rhys Jones', role: 'Asset manager', mobile: '07700 900111' } },
});
const org = made.body.organisation;
eq('added, tidied', [made.status, org.name, org.type, org.website, org.postcode, org.company_number], [200, 'Bron Afon Community Housing', 'landlord', 'https://bronafon.org.uk', 'NP44 3HQ', '01234567']);
eq('its first contact is its primary contact', [made.body.contact.name, made.body.contact.is_primary], ['Rhys Jones', true]);
const rhys = made.body.contact;

const sian = (await call(Contacts.POST, { params: { id: org.id }, body: { name: 'Siân Evans', role: 'Tenant liaison', mobile: '07700 900222', email: 'Sian@BronAfon.org.uk' } })).body.contact;
const gareth = (await call(Contacts.POST, { params: { id: org.id }, body: { name: 'Gareth Price', role: 'Surveyor', is_primary: true } })).body.contact;
eq('a second contact isn’t primary', [sian.is_primary, sian.email], [false, 'sian@bronafon.org.uk']);
eq('a third added as primary takes over', gareth.is_primary, true);
const primaries = () => db.rows('crm_contacts').filter((c) => c.organisation_id === org.id && c.is_primary).map((c) => c.name);
eq('…one primary contact, always', primaries(), ['Gareth Price']);

const made2 = await call(Contact.PATCH, { method: 'PATCH', params: { id: org.id, contactId: sian.id }, body: { is_primary: true } });
eq('make Siân primary', [made2.status, made2.body.contact.is_primary, primaries()], [200, true, ['Siân Evans']]);
eq('unmarking the primary (false) does nothing: someone has to replace them', [(await call(Contact.PATCH, { method: 'PATCH', params: { id: org.id, contactId: sian.id }, body: { is_primary: false } })).status, primaries()], [200, ['Siân Evans']]);
const ghost = await S.setPrimary(db, org.id, randomUUID());
eq('making someone primary who has just been removed: said, and the primary stays who it was', [ghost.ok, primaries()], [false, ['Siân Evans']]);
eq('edit a contact’s role', (await call(Contact.PATCH, { method: 'PATCH', params: { id: org.id, contactId: gareth.id }, body: { role: 'Senior surveyor' } })).body.contact.role, 'Senior surveyor');
eq('an edit can’t empty a contact’s name', (await call(Contact.PATCH, { method: 'PATCH', params: { id: org.id, contactId: gareth.id }, body: { name: ' ' } })).status, 400);
eq('adding to an organisation that isn’t there', (await call(Contacts.POST, { params: { id: randomUUID() }, body: { name: 'Nobody' } })).status, 404);

// Another organisation, and its contact: neither address reaches the other's people.
const cef = (await call(Orgs.POST, { body: { name: 'CEF Newport', type: 'supplier', contact: { name: 'Dai the rep' } } })).body;
eq('another organisation’s address can’t edit this one’s contact', (await call(Contact.PATCH, { method: 'PATCH', params: { id: cef.organisation.id, contactId: sian.id }, body: { name: 'Hacked' } })).status, 404);
eq('…or make them primary there', (await call(Contact.PATCH, { method: 'PATCH', params: { id: cef.organisation.id, contactId: sian.id }, body: { is_primary: true } })).status, 404);
eq('…or remove them', (await call(Contact.DELETE, { method: 'DELETE', params: { id: cef.organisation.id, contactId: sian.id } })).status, 404);
eq('…and Siân is untouched', db.rows('crm_contacts').find((c) => c.id === sian.id)?.name, 'Siân Evans');
eq('a made-up id is just not found', (await call(Org.GET, { method: 'GET', params: { id: 'not-a-uuid' } })).status, 404);

// Link the job, with the contact we deal with.
eq('a contact from another organisation can’t be linked', (await call(Link.PUT, { method: 'PUT', params: { id: job.id }, body: { organisation_id: org.id, contact_id: cef.contact.id } })).status, 400);
eq('an id that isn’t one is refused', (await call(Link.PUT, { method: 'PUT', params: { id: job.id }, body: { organisation_id: "x' or 1=1" } })).status, 400);
eq('a job that isn’t there', (await call(Link.PUT, { method: 'PUT', params: { id: randomUUID() }, body: { organisation_id: org.id } })).status, 404);
const linked = await call(Link.PUT, { method: 'PUT', params: { id: job.id }, body: { organisation_id: org.id, contact_id: sian.id } });
eq('linked: the card gets the organisation, its contacts and who this job is with', [linked.status, linked.body.organisation.name, linked.body.organisation.contact_id, linked.body.organisation.contacts.map((c) => c.name)], [
  200, 'Bron Afon Community Housing', sian.id, ['Siân Evans', 'Gareth Price', 'Rhys Jones'],
]);
const j = db.rows('crm_projects').find((p) => p.id === job.id);
eq('saved on the job, and its updated_at moved (others with it open reload it)', [j.organisation_id, j.contact_id, j.updated_at !== '2026-10-01T10:00:00Z'], [org.id, sian.id, true]);
eq('on the timeline', globalThis.__activity.at(-1), { enquiryId: customer.id, projectId: job.id, kind: 'system', body: 'Linked to Bron Afon Community Housing (contact: Siân Evans)', byId: 'staff-1' });
const n = globalThis.__activity.length;
await call(Link.PUT, { method: 'PUT', params: { id: job.id }, body: { organisation_id: org.id, contact_id: sian.id } });
eq('the same link again: nothing new on the timeline', globalThis.__activity.length, n);
await call(Link.PUT, { method: 'PUT', params: { id: done.id }, body: { organisation_id: org.id } });
eq('a second job, no contact', globalThis.__activity.at(-1).body, 'Linked to Bron Afon Community Housing');

const page = await call(Org.GET, { method: 'GET', params: { id: org.id } });
eq('its page: contacts primary first', page.body.contacts.map((c) => c.name), ['Siân Evans', 'Gareth Price', 'Rhys Jones']);
eq('its page: jobs, open ones first, with the customer and contact', page.body.jobs.map((x) => [x.ref, x.customer, x.stage, x.contact_id]), [
  ['HX-0042', 'Rhys Jones', 'surveyed', sian.id],
  ['HX-0042-2', 'Rhys Jones', 'complete', null],
]);
const list = (await call(Orgs.GET, { method: 'GET' })).body.organisations;
const row = list.find((o) => o.id === org.id);
eq('the list: counts and primary contact', [row.contacts, row.jobs, row.open_jobs, row.primary.name], [3, 2, 1, 'Siân Evans']);
eq('the list: A to Z', list.map((o) => o.name), ['Bron Afon Community Housing', 'CEF Newport']);
eq('the list: people, for the search box', row.people.includes('Siân Evans Tenant liaison sian@bronafon.org.uk'), true);

// Find it in search (the global search's organisations and contacts).
const names = (hits) => hits.map((h) => `${h.name}${h.kind === 'contact' ? ` (contact${h.organisation ? ` at ${h.organisation.name}` : ', on their own'})` : ''}`);
eq('search: by name (and the contacts whose email says it too)', names(await S.searchOrgsAndContacts(db, 'bron afon')), ['Bron Afon Community Housing', 'Siân Evans (contact at Bron Afon Community Housing)']);
eq('search: by a contact’s name', names(await S.searchOrgsAndContacts(db, 'gareth')), ['Gareth Price (contact at Bron Afon Community Housing)']);
eq('search: by a contact’s mobile, typed another way', names(await S.searchOrgsAndContacts(db, '+44 7700 900222')), ['Siân Evans (contact at Bron Afon Community Housing)']);
eq('search: by postcode without its space', names(await S.searchOrgsAndContacts(db, 'np443hq')), ['Bron Afon Community Housing']);
eq('search: a supplier too', names(await S.searchOrgsAndContacts(db, 'cef')), ['CEF Newport']);
eq('search: nothing', await S.searchOrgsAndContacts(db, 'zzz'), []);

// Remove the primary contact: the one added first takes over, the job keeps its organisation.
const gone = await call(Contact.DELETE, { method: 'DELETE', params: { id: org.id, contactId: sian.id } });
eq('Siân removed: Rhys (added first) is primary now', [gone.body.primary, primaries()], ['Rhys Jones', ['Rhys Jones']]);
eq('…the job keeps its organisation, without her', [j.organisation_id, j.contact_id], [org.id, null]);
const noPrimary = await call(Contact.DELETE, { method: 'DELETE', params: { id: org.id, contactId: gareth.id } });
eq('removing someone who isn’t primary changes nobody', [noPrimary.body.primary, primaries()], [null, ['Rhys Jones']]);

// Edit, unlink, delete.
eq('edit the details', (await call(Org.PATCH, { method: 'PATCH', params: { id: org.id }, body: { notes: 'Key safe at the office', vat_number: '123456789' } })).body.organisation.vat_number, 'GB123456789');
eq('a bad company number is refused', (await call(Org.PATCH, { method: 'PATCH', params: { id: org.id }, body: { company_number: 'ACME LTD' } })).body.field, 'company_number');
const unlinked = await call(Link.PUT, { method: 'PUT', params: { id: job.id }, body: { organisation_id: null, contact_id: null } });
eq('unlink', [unlinked.body.organisation, unlinked.body.contact, j.organisation_id, j.contact_id], [null, null, null, null]);
eq('…on the timeline', globalThis.__activity.at(-1).body, 'No longer linked to Bron Afon Community Housing');
const viaContact = await call(Link.PUT, { method: 'PUT', params: { id: job.id }, body: { organisation_id: null, contact_id: rhys.id } });
eq('linking just a contact in an organisation brings their organisation', [viaContact.body.organisation.name, viaContact.body.contact.name, j.organisation_id], ['Bron Afon Community Housing', 'Rhys Jones', org.id]);
eq('…and the card also gets the person, with their organisation', [viaContact.body.contact.organisation_name, viaContact.body.contact.role], ['Bron Afon Community Housing', 'Asset manager']);
await call(Link.PUT, { method: 'PUT', params: { id: job.id }, body: { organisation_id: org.id, contact_id: rhys.id } });
const rhysNow = db.rows('crm_contacts').find((c) => c.id === rhys.id);
const del = await call(Org.DELETE, { method: 'DELETE', params: { id: org.id } });
eq('delete: its jobs are unlinked, not deleted; its people stay', [del.body, db.rows('crm_projects').length, db.rows('crm_projects').every((p) => p.organisation_id === null)], [{ deleted: true, jobs: 2, contacts: 1 }, 2, true]);
eq('…its contacts stay, on their own, and nobody is primary of nothing', [rhysNow.organisation_id, rhysNow.is_primary], [null, false]);
eq('…the job keeps the contact it was dealt with through', db.rows('crm_projects').find((p) => p.id === job.id).contact_id, rhys.id);
eq('…each job’s timeline says so', globalThis.__activity.slice(-2).map((a) => a.body), Array(2).fill('No longer linked to Bron Afon Community Housing (the organisation was deleted)'));
eq('…and again: not found', (await call(Org.DELETE, { method: 'DELETE', params: { id: org.id } })).status, 404);

/* ── Contacts: on their own, or part of an organisation ─────────────────────── */

const cefOrg = cef.organisation.id;
const dai = (await call(People.POST, { body: { name: ' Dai  Builder ', role: 'Builder', mobile: '07700 900333', email: 'Dai@Builders.example' } })).body.contact;
eq('a contact on their own', [dai.name, dai.organisation_id, dai.is_primary, dai.email], ['Dai Builder', null, false, 'dai@builders.example']);
eq('…can’t be primary of nothing', (await call(People.POST, { body: { name: 'X', is_primary: true } })).status, 400);
eq('…a bad organisation id is refused', (await call(People.POST, { body: { name: 'X', organisation_id: 'nope' } })).status, 400);
eq('…an organisation that isn’t there', (await call(People.POST, { body: { name: 'X', organisation_id: randomUUID() } })).status, 404);
eq('…a bad mobile is refused, naming the field', (await call(People.POST, { body: { name: 'X', mobile: 'none' } })).body.field, 'mobile');
const inCef = (await call(People.POST, { body: { name: 'Kerry Lewis', role: 'Branch manager', organisation_id: cefOrg } })).body.contact;
eq('a contact added to an organisation that has a primary isn’t primary', [inCef.organisation_id === cefOrg, inCef.is_primary], [true, false]);

const everyone = (await call(People.GET, { method: 'GET' })).body;
eq('the list: everyone we added, with their organisation (or none)', everyone.people.map((p) => `${p.name}|${p.organisation?.name ?? '-'}`).sort(), ['Dai Builder|-', 'Dai the rep|CEF Newport', 'Kerry Lewis|CEF Newport', 'Rhys Jones|-']);
eq('the list: opens their own page', everyone.people.find((p) => p.name === 'Dai Builder').href, `/admin/crm/contacts/${dai.id}`);

// Customers are people too, read-only here.
const cust = (await call(Customers.GET, { method: 'GET' })).body;
eq('customers: the newest, flagged as such, opening their job', [cust.newest, cust.people.map((p) => [p.kind, p.name, p.jobs, p.open_jobs, p.href])], [true, [['customer', 'Rhys Jones', 2, 1, `/admin/crm/${job.id}`]]]);
eq('customers: found by name', (await call(Customers.GET, { method: 'GET' })).body.people.length, 1);
eq('…signed out: refused', await (async () => { globalThis.__session = null; const r = (await call(Customers.GET, { method: 'GET' })).status; globalThis.__session = { user: { id: 'staff-1' }, profile: { full_name: 'Callum', role: 'admin' } }; return r; })(), 401);

// A job can be dealt with through someone who isn't part of any organisation.
const solo = await call(Link.PUT, { method: 'PUT', params: { id: job.id }, body: { organisation_id: null, contact_id: dai.id } });
eq('a job linked to a contact on their own: no organisation, but the person', [solo.body.organisation, solo.body.contact.name, solo.body.contact.organisation_id], [null, 'Dai Builder', null]);
eq('…on the timeline', globalThis.__activity.at(-1).body, 'Dealing with Dai Builder');
const withOrg = await call(Link.PUT, { method: 'PUT', params: { id: job.id }, body: { organisation_id: cefOrg, contact_id: dai.id } });
eq('…and a solo contact can go with any organisation', [withOrg.body.organisation.name, withOrg.body.contact.name], ['CEF Newport', 'Dai Builder']);
const otherOrg = (await call(Orgs.POST, { body: { name: 'Other Ltd' } })).body.organisation;
const rhysOrgOther = () => otherOrg.id;
// A key left out leaves what the job has; null clears it.
const keepOrg = await call(Link.PUT, { method: 'PUT', params: { id: job.id }, body: { contact_id: null } });
eq('only the contact cleared: the organisation stays', [keepOrg.body.organisation?.name, keepOrg.body.contact, j.contact_id], ['CEF Newport', null, null]);
const keepOrg2 = await call(Link.PUT, { method: 'PUT', params: { id: job.id }, body: { contact_id: dai.id } });
eq('only a contact on their own sent: the job keeps its organisation', [keepOrg2.body.organisation?.name, keepOrg2.body.contact?.name], ['CEF Newport', 'Dai Builder']);
const dropOrg = await call(Link.PUT, { method: 'PUT', params: { id: job.id }, body: { organisation_id: null } });
eq('only the organisation cleared: a contact on their own stays', [dropOrg.body.organisation, dropOrg.body.contact?.name], [null, 'Dai Builder']);
eq('…and the timeline says both', globalThis.__activity.at(-1).body, 'No longer linked to CEF Newport (still dealing with Dai Builder)');
eq('nothing to say is refused', (await call(Link.PUT, { method: 'PUT', params: { id: job.id }, body: {} })).status, 400);
await call(Link.PUT, { method: 'PUT', params: { id: job.id }, body: { contact_id: inCef.id } });
const swap = await call(Link.PUT, { method: 'PUT', params: { id: job.id }, body: { organisation_id: rhysOrgOther() } });
eq('a different organisation lets go of the contact who was in the old one', [swap.body.organisation.name, swap.body.contact], ['Other Ltd', null]);
await call(Link.PUT, { method: 'PUT', params: { id: job.id }, body: { organisation_id: cefOrg, contact_id: dai.id } });

eq('a contact in one organisation can’t be put on a job with another’s name', (await call(Link.PUT, { method: 'PUT', params: { id: job.id }, body: { organisation_id: otherOrg.id, contact_id: inCef.id } })).status, 400);
eq('…and the job isn’t changed', [j.organisation_id, j.contact_id], [cefOrg, dai.id]);

// Their page.
await call(Link.PUT, { method: 'PUT', params: { id: job.id }, body: { organisation_id: null, contact_id: dai.id } });
const daiPage = (await call(Person.GET, { method: 'GET', params: { id: dai.id } })).body;
eq('a contact’s page: details, no organisation, the jobs they’re dealt with through', [daiPage.contact.name, daiPage.contact.organisation, daiPage.jobs.map((x) => [x.ref, x.customer])], ['Dai Builder', null, [['HX-0042', 'Rhys Jones']]]);
eq('a contact that isn’t there', (await call(Person.GET, { method: 'GET', params: { id: randomUUID() } })).status, 404);

// Add them to an organisation: their jobs go with them.
const before2 = globalThis.__activity.length;
const joined = await call(Person.PATCH, { method: 'PATCH', params: { id: dai.id }, body: { organisation_id: cefOrg } });
eq('moved into an organisation that has a primary: not primary; the job goes too', [joined.status, joined.body.contact.organisation_id === cefOrg, joined.body.contact.is_primary, joined.body.jobsMoved, j.organisation_id], [200, true, false, 1, cefOrg]);
eq('…and says so on the job’s timeline', globalThis.__activity.slice(before2).map((a) => a.body), ['Dai Builder is part of CEF Newport now: this job is linked to CEF Newport']);
eq('…one primary contact in CEF, still', db.rows('crm_contacts').filter((c) => c.organisation_id === cefOrg && c.is_primary).map((c) => c.name), ['Dai the rep']);
const moveBad = await call(Person.PATCH, { method: 'PATCH', params: { id: dai.id }, body: { organisation_id: randomUUID() } });
eq('…to an organisation that isn’t there: refused, nothing changes', [moveBad.status, db.rows('crm_contacts').find((c) => c.id === dai.id).organisation_id === cefOrg], [404, true]);

// The primary moves out: the next takes over.
const daiRep = cef.contact;
const out = await call(Person.PATCH, { method: 'PATCH', params: { id: daiRep.id }, body: { organisation_id: null } });
eq('the primary contact goes out on their own: Dai Builder (added first of those left) takes over', [out.body.contact.organisation_id, out.body.contact.is_primary, db.rows('crm_contacts').filter((c) => c.organisation_id === cefOrg && c.is_primary).map((c) => c.name)], [null, false, ['Dai Builder']]);
eq('…a contact on their own can’t be made primary', (await call(Person.PATCH, { method: 'PATCH', params: { id: daiRep.id }, body: { is_primary: true } })).status, 400);
eq('…put into an organisation with nobody else: primary at once', await (async () => {
  const solo2 = (await call(Orgs.POST, { body: { name: 'Taff Valley Builders', type: 'partner' } })).body.organisation;
  const r = await call(Person.PATCH, { method: 'PATCH', params: { id: daiRep.id }, body: { organisation_id: solo2.id } });
  return [r.body.contact.is_primary, r.body.contact.organisation_id === solo2.id];
})(), [true, true]);
eq('edit just a role', (await call(Person.PATCH, { method: 'PATCH', params: { id: dai.id }, body: { role: 'Roofer' } })).body.contact.role, 'Roofer');
eq('…a bad email is refused', (await call(Person.PATCH, { method: 'PATCH', params: { id: dai.id }, body: { email: 'nope' } })).body.field, 'email');
eq('…a bad organisation id is refused', (await call(Person.PATCH, { method: 'PATCH', params: { id: dai.id }, body: { organisation_id: 'x' } })).status, 400);

// Delete.
const rm = await call(Person.DELETE, { method: 'DELETE', params: { id: dai.id } });
eq('delete a contact: their job stays with its organisation, without the person', [rm.status, j.contact_id, j.organisation_id], [200, null, cefOrg]);
eq('…twice: not found', (await call(Person.DELETE, { method: 'DELETE', params: { id: dai.id } })).status, 404);
eq('before organisations.sql: the list, a contact and adding say so', await (async () => {
  globalThis.__ready = false;
  const out = [(await call(People.GET, { method: 'GET' })).body.ready, (await call(Person.GET, { method: 'GET', params: { id: dai.id } })).status, (await call(People.POST, { body: { name: 'X' } })).status];
  globalThis.__ready = true;
  return out;
})(), [false, 409, 409]);

/* ── Never a lead ───────────────────────────────────────────────────────────── */

eq('no customer record (enquiry) was made for any contact', db.rows('enquiries').length, customersAtStart);
eq('no WhatsApp, outbox or opportunity rows either', ['whatsapp_messages', 'whatsapp_outbox', 'crm_activities'].map((x) => db.rows(x).length), [0, 0, 0]);
eq('no new job', db.rows('crm_projects').length, 2);

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
