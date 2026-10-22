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
  const primaryClash = (r) => r.is_primary && rows('organisation_contacts').some((x) => x !== r && x.is_primary && x.organisation_id === r.organisation_id);
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
        if (table === 'organisation_contacts') {
          if (!rows('organisations').some((o) => o.id === r.organisation_id)) return { data: null, error: { code: '23503', message: 'fk' } };
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
          if (table === 'organisation_contacts' && primaryClash(r)) {
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
          const gone = rows('organisation_contacts').filter((c) => ids.includes(c.organisation_id)).map((c) => c.id);
          t.organisation_contacts = rows('organisation_contacts').filter((c) => !ids.includes(c.organisation_id));
          for (const p of rows('crm_projects')) {
            if (ids.includes(p.organisation_id)) p.organisation_id = null;
            if (gone.includes(p.organisation_contact_id)) p.organisation_contact_id = null;
          }
        }
        if (table === 'organisation_contacts') for (const p of rows('crm_projects')) if (list.some((c) => c.id === p.organisation_contact_id)) p.organisation_contact_id = null;
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
const S = await import('../src/lib/organisations/server.ts');

const db = fakeDb();
globalThis.__db = db;
globalThis.__activity = [];
globalThis.__session = { user: { id: 'staff-1' }, profile: { full_name: 'Callum', role: 'admin' } };
const customer = { id: randomUUID(), name: 'Rhys Jones', phone: '07700 900111', email: '' };
db.rows('enquiries').push(customer);
const job = { id: randomUUID(), enquiry_id: customer.id, title: 'Solar for 12 flats', stage: 'surveyed', project_ref: 'HX-0042', postcode: 'NP44 3HQ', created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z', organisation_id: null, organisation_contact_id: null };
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
const primaries = () => db.rows('organisation_contacts').filter((c) => c.organisation_id === org.id && c.is_primary).map((c) => c.name);
eq('…one primary contact, always', primaries(), ['Gareth Price']);

const made2 = await call(Contact.PATCH, { method: 'PATCH', params: { id: org.id, contactId: sian.id }, body: { is_primary: true } });
eq('make Siân primary', [made2.status, made2.body.contact.is_primary, primaries()], [200, true, ['Siân Evans']]);
eq('unmarking the primary (false) does nothing: someone has to replace them', [(await call(Contact.PATCH, { method: 'PATCH', params: { id: org.id, contactId: sian.id }, body: { is_primary: false } })).status, primaries()], [200, ['Siân Evans']]);
eq('edit a contact’s role', (await call(Contact.PATCH, { method: 'PATCH', params: { id: org.id, contactId: gareth.id }, body: { role: 'Senior surveyor' } })).body.contact.role, 'Senior surveyor');
eq('an edit can’t empty a contact’s name', (await call(Contact.PATCH, { method: 'PATCH', params: { id: org.id, contactId: gareth.id }, body: { name: ' ' } })).status, 400);
eq('adding to an organisation that isn’t there', (await call(Contacts.POST, { params: { id: randomUUID() }, body: { name: 'Nobody' } })).status, 404);

// Another organisation, and its contact: neither address reaches the other's people.
const cef = (await call(Orgs.POST, { body: { name: 'CEF Newport', type: 'supplier', contact: { name: 'Dai the rep' } } })).body;
eq('another organisation’s address can’t edit this one’s contact', (await call(Contact.PATCH, { method: 'PATCH', params: { id: cef.organisation.id, contactId: sian.id }, body: { name: 'Hacked' } })).status, 404);
eq('…or make them primary there', (await call(Contact.PATCH, { method: 'PATCH', params: { id: cef.organisation.id, contactId: sian.id }, body: { is_primary: true } })).status, 404);
eq('…or remove them', (await call(Contact.DELETE, { method: 'DELETE', params: { id: cef.organisation.id, contactId: sian.id } })).status, 404);
eq('…and Siân is untouched', db.rows('organisation_contacts').find((c) => c.id === sian.id)?.name, 'Siân Evans');
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
eq('saved on the job, and its updated_at moved (others with it open reload it)', [j.organisation_id, j.organisation_contact_id, j.updated_at !== '2026-10-01T10:00:00Z'], [org.id, sian.id, true]);
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

// Find it in search (the global search's organisations).
const names = (hits) => hits.map((h) => `${h.name}${h.contact ? `/${h.contact.name}` : ''}`);
eq('search: by name', names(await S.searchOrganisations(db, 'bron afon')), ['Bron Afon Community Housing']);
eq('search: by a contact’s name', names(await S.searchOrganisations(db, 'gareth')), ['Bron Afon Community Housing/Gareth Price']);
eq('search: by a contact’s mobile, typed another way', names(await S.searchOrganisations(db, '+44 7700 900222')), ['Bron Afon Community Housing/Siân Evans']);
eq('search: by postcode without its space', names(await S.searchOrganisations(db, 'np443hq')), ['Bron Afon Community Housing']);
eq('search: a supplier too', names(await S.searchOrganisations(db, 'cef')), ['CEF Newport']);
eq('search: nothing', await S.searchOrganisations(db, 'zzz'), []);

// Remove the primary contact: the one added first takes over, the job keeps its organisation.
const gone = await call(Contact.DELETE, { method: 'DELETE', params: { id: org.id, contactId: sian.id } });
eq('Siân removed: Rhys (added first) is primary now', [gone.body.primary, primaries()], ['Rhys Jones', ['Rhys Jones']]);
eq('…the job keeps its organisation, without her', [j.organisation_id, j.organisation_contact_id], [org.id, null]);
const noPrimary = await call(Contact.DELETE, { method: 'DELETE', params: { id: org.id, contactId: gareth.id } });
eq('removing someone who isn’t primary changes nobody', [noPrimary.body.primary, primaries()], [null, ['Rhys Jones']]);

// Edit, unlink, delete.
eq('edit the details', (await call(Org.PATCH, { method: 'PATCH', params: { id: org.id }, body: { notes: 'Key safe at the office', vat_number: '123456789' } })).body.organisation.vat_number, 'GB123456789');
eq('a bad company number is refused', (await call(Org.PATCH, { method: 'PATCH', params: { id: org.id }, body: { company_number: 'ACME LTD' } })).body.field, 'company_number');
const unlinked = await call(Link.PUT, { method: 'PUT', params: { id: job.id }, body: { organisation_id: null, contact_id: rhys.id } });
eq('unlink (a contact sent with no organisation is ignored)', [unlinked.body.organisation, j.organisation_id, j.organisation_contact_id], [null, null, null]);
eq('…on the timeline', globalThis.__activity.at(-1).body, 'No longer linked to Bron Afon Community Housing');
await call(Link.PUT, { method: 'PUT', params: { id: job.id }, body: { organisation_id: org.id, contact_id: rhys.id } });
const del = await call(Org.DELETE, { method: 'DELETE', params: { id: org.id } });
eq('delete: its jobs are unlinked, not deleted', [del.body, db.rows('crm_projects').length, db.rows('crm_projects').every((p) => p.organisation_id === null && p.organisation_contact_id === null)], [{ deleted: true, jobs: 2 }, 2, true]);
eq('…its contacts go with it', db.rows('organisation_contacts').filter((c) => c.organisation_id === org.id).length, 0);
eq('…each job’s timeline says so', globalThis.__activity.slice(-2).map((a) => a.body), Array(2).fill('No longer linked to Bron Afon Community Housing (the organisation was deleted)'));
eq('…and again: not found', (await call(Org.DELETE, { method: 'DELETE', params: { id: org.id } })).status, 404);

/* ── Never a lead ───────────────────────────────────────────────────────────── */

eq('no customer record (enquiry) was made for any contact', db.rows('enquiries').length, customersAtStart);
eq('no WhatsApp, outbox or opportunity rows either', ['whatsapp_messages', 'whatsapp_outbox', 'crm_activities'].map((x) => db.rows(x).length), [0, 0, 0]);
eq('no new job', db.rows('crm_projects').length, 2);

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
