// The electrician's certificate on the server (src/lib/site/eic/*): the electrician signs off through
// the real sign-off route against an in-memory database, and the sign-off's documents step files the
// EIC as a draft (the design part still to sign), sets paperwork.eic_on and remembers their test
// instruments; the office signs the design part and the EIC is final, in handover slot CC21 and held
// for the pack, the draft archived; making it again changes nothing; a reading or a signature that
// never reached the server stops the sign-off; a single-signature EIC is final at once; Minor Works
// makes one sheet per circuit, kept out of CC21 while its wording is unverified.
// Usage: node --experimental-strip-types scripts/test-site-eic-signoff.mjs   (PDF_OUT=/dir keeps the PDFs)
import { createHash, randomUUID } from 'node:crypto';
import { registerHooks } from 'node:module';

const SRC = new URL('../src/', import.meta.url).href;
const mod = (code) => `data:text/javascript,${encodeURIComponent(code)}`;
// Everything outside the site code that would reach Supabase, Next, Resend, Meta or Microsoft is
// stood in for, recording what it was asked to do (globalThis.__rec).
const STUBS = {
  'server-only': 'export {}',
  'next/server': `
    export class NextResponse extends Response {
      static json(body, init = {}) { return new NextResponse(JSON.stringify(body), { status: init.status ?? 200, headers: { 'content-type': 'application/json', ...(init.headers ?? {}) } }); }
    }
    export function after(fn) { globalThis.__after.push(fn); }`,
  '@/lib/supabase/admin': 'export const createAdminClient = () => globalThis.__db;',
  '@/lib/crm/server': `
    export const DOCS_BUCKET = 'crm-docs'; export const CRM_BUCKET = 'crm-photos'; export const NO_STORE = {};
    export const thumbPath = (p) => p.replace(/\\.[a-z0-9]+$/i, '') + '.thumb.jpg';
    export const isUuid = (s) => /^[0-9a-f-]{36}$/i.test(s);
    export async function ensureDocsBucket() {} export async function fingerprintDocument() { return null; }
    export async function logActivity(a) { globalThis.__rec.activity.push(a); }
    export const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    export async function crmSession() { return { user: { id: 'staff-1', email: 'office@heliaxis.co.uk' }, profile: { full_name: 'Office' } }; }`,
  '@/lib/notify': 'export async function notify(n) { globalThis.__rec.notify.push(n); }',
  '@/lib/schema-ready': 'export async function schemaReady() { return { site: true, purchaseOrders: true, handover: false }; }',
  // The rest of the electrician's sign-off (electrician-signoff.ts): the job's stage and its deadline tasks.
  '@/lib/crm/move-stage': 'export async function applyStageEvent(id, event, o) { globalThis.__rec.stage.push({ id, event, note: o?.note }); return { moved: true, from: "installing" }; }',
  '@/lib/projects/server': 'export async function ensureDeadlineTasks(id) { globalThis.__rec.deadlines.push(id); return 0; }',
  '@/lib/surveys/server': `
    export async function addSourceTask(db, t) { if (globalThis.__rec.tasks.some((x) => x.key === t.key)) return false; globalThis.__rec.tasks.push(t); return true; }
    export async function closeSourceTask() {}`,
  '@/lib/purchase-orders/server': 'export async function logOrder(db, o, event, body) { globalThis.__rec.orders.push({ event, body }); }',
  '@/lib/whatsapp/settings': 'export async function getSettings() { return { quietFromMin: 1260, quietToMin: 525, lateRule: false, lateFromMin: 1230, lateSendAtMin: 420 }; }',
  '@/lib/whatsapp/api': `
    export const whatsappConfigured = () => true; export const defaultTemplate = () => ({ lang: 'en_GB' });
    export async function sendTemplate(to, name, lang, params) { globalThis.__rec.whatsapp.push({ to, name, params }); return { ok: true, data: { messages: [{ id: 'wamid.' + globalThis.__rec.whatsapp.length }] } }; }`,
  '@/lib/whatsapp/templates': `export async function fetchTemplates() { return { ok: true, items: ['site_job_pack', 'site_po_raised', 'site_strike_photos', 'site_clear_to_start', 'site_scaffold_hold'].map((name) => ({ name, status: 'APPROVED' })) }; }`,
  '@/lib/subcontractors/server': `
    import { createHash, randomBytes } from 'node:crypto';
    export const sha256 = (s) => createHash('sha256').update(s).digest('hex');
    export const newToken = () => randomBytes(24).toString('base64url');
    export const portalBaseUrl = (o) => (o || 'http://localhost:3000').replace(/\\/$/, '');
    export const clientIp = () => '203.0.113.7';
    export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    export const emailShell = (title, body) => '<h1>' + title + '</h1>' + body;
    export function validSignature(sig) { return typeof sig === 'string' && /^data:image\\/png;base64,[A-Za-z0-9+/=]+$/.test(sig) && sig.length < 300000; }
    export async function sendEmail(m) { globalThis.__rec.email.push(m); return { ok: true, id: 'resend-' + globalThis.__rec.email.length }; }`,
};
registerHooks({
  resolve(specifier, context, next) {
    if (STUBS[specifier]) return { url: mod(STUBS[specifier]), shortCircuit: true };
    const spec = specifier.startsWith('@/') ? SRC + specifier.slice(2) : specifier;
    try {
      return next(spec, context);
    } catch (e) {
      if (!/^(?:\.\.?\/|file:)/.test(spec) || /\.\w+$/.test(spec)) throw e;
      // Without ".ts", as the bundler expects; a folder is its index.ts.
      try {
        return next(`${spec}.ts`, context);
      } catch {
        return next(`${spec}/index.ts`, context);
      }
    }
  },
});

/* ── An in-memory database: the PostgREST calls the site code makes ────────── */
const UNIQUE = { site_signoffs: [['assignment_id', 'stage']], purchase_orders: [['signoff_id']], site_messages: [['dedupe_key']], site_ops: [['assignment_id', 'op_id']] };
function fakeDb() {
  const t = {};
  const rows = (name) => (t[name] ??= []);
  const files = new Map();
  let poNo = 0;
  const now = () => new Date().toISOString();
  const defaults = (table, r) => {
    const base = { id: r.id ?? randomUUID(), created_at: now(), updated_at: now() };
    if (table === 'purchase_orders') return { ...base, po_number: `PO-${String(++poNo).padStart(4, '0')}`, status: 'draft', changed_since_sent: false, sent_at: null, sent_to: null, paid_on: null, cancelled_at: null, ...r };
    if (table === 'site_signoffs') return { ...base, received_at: now(), po_done_at: null, docs_done_at: null, notified_at: null, flags: [], extra: {}, ...r };
    if (table === 'site_messages') return { ...base, status: 'queued', sent_at: null, provider_id: null, error: null, ...r };
    if (table === 'crm_documents') return { ...base, archived_at: null, visible: false, ...r };
    return { ...base, ...r };
  };
  const clash = (table, r) => (UNIQUE[table] ?? []).some((cols) => cols.every((c) => r[c] != null) && rows(table).some((x) => x !== r && cols.every((c) => x[c] === r[c])));
  const from = (table) => {
    const where = [];
    let mode = 'select';
    let payload = null;
    let order = [];
    let lim = null;
    let returning = false;
    const like = (v, p) => new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`).test(String(v ?? ''));
    const exec = () => {
      if (mode === 'insert') {
        const list = (Array.isArray(payload) ? payload : [payload]).map((r) => defaults(table, structuredClone(r)));
        for (const r of list) if (clash(table, r)) return { data: null, error: { code: '23505', message: 'duplicate key' } };
        rows(table).push(...list);
        return { data: Array.isArray(payload) ? list : list[0], error: null, many: Array.isArray(payload) };
      }
      let list = rows(table).filter((r) => where.every((w) => w(r)));
      if (mode === 'update') {
        for (const r of list) {
          const was = { ...r };
          Object.assign(r, structuredClone(payload));
          if (clash(table, r)) {
            Object.assign(r, was);
            return { data: null, error: { code: '23505', message: 'duplicate key' } };
          }
        }
        return { data: list, error: null, many: true };
      }
      if (mode === 'delete') {
        t[table] = rows(table).filter((r) => !list.includes(r));
        // purchase_orders.signoff_id … on delete set null
        if (table === 'site_signoffs') for (const po of rows('purchase_orders')) if (list.some((s) => s.id === po.signoff_id)) po.signoff_id = null;
        return { data: list, error: null, many: true };
      }
      for (const o of [...order].reverse()) list = [...list].sort((a, b) => (a[o.col] < b[o.col] ? -1 : a[o.col] > b[o.col] ? 1 : 0) * (o.asc ? 1 : -1));
      if (lim != null) list = list.slice(0, lim);
      return { data: list.map((r) => structuredClone(r)), error: null, many: true };
    };
    const out = (r, one) => {
      if (r.error) return { data: null, error: r.error };
      if (!one) return { data: mode === 'select' || returning || r.many === false ? r.data : null, error: null };
      const list = Array.isArray(r.data) ? r.data : [r.data];
      if (one === 'single' && list.length !== 1) return { data: null, error: { code: 'PGRST116', message: 'not one row' } };
      return { data: list[0] ? structuredClone(list[0]) : null, error: null };
    };
    const b = {
      select: () => ((returning = mode !== 'select'), b),
      insert: (r) => ((mode = 'insert'), (payload = r), b),
      upsert: (r) => ((mode = 'insert'), (payload = r), b),
      update: (p) => ((mode = 'update'), (payload = p), b),
      delete: () => ((mode = 'delete'), b),
      eq: (c, v) => (where.push((r) => r[c] === v), b),
      neq: (c, v) => (where.push((r) => r[c] !== v), b),
      in: (c, v) => (where.push((r) => v.includes(r[c])), b),
      is: (c, v) => (where.push((r) => (r[c] ?? null) === v), b),
      lt: (c, v) => (where.push((r) => r[c] < v), b),
      lte: (c, v) => (where.push((r) => r[c] <= v), b),
      gt: (c, v) => (where.push((r) => r[c] > v), b),
      like: (c, p) => (where.push((r) => like(r[c], p)), b),
      or: (s) => {
        const parts = s.split(',').map((x) => x.split('.'));
        where.push((r) => parts.some(([c, op, v]) => op === 'is' && v === 'null' && (r[c] ?? null) === null));
        return b;
      },
      order: (col, o) => (order.push({ col, asc: o?.ascending !== false }), b),
      limit: (n) => ((lim = n), b),
      range: () => b,
      maybeSingle: async () => out(exec(), 'maybe'),
      single: async () => out(exec(), 'single'),
      then: (res, rej) => Promise.resolve(out(exec(), null)).then(res, rej),
    };
    return b;
  };
  const storage = {
    from: (bucket) => ({
      upload: async (path, bytes, o) => {
        const k = `${bucket}/${path}`;
        if (files.has(k) && !o?.upsert) return { error: { message: 'exists' } };
        files.set(k, new Uint8Array(bytes));
        return { error: null };
      },
      download: async (path) => ({ data: files.has(`${bucket}/${path}`) ? new Blob([files.get(`${bucket}/${path}`)]) : null }),
      remove: async (paths) => (paths.forEach((p) => files.delete(`${bucket}/${p}`)), { error: null }),
      createSignedUrl: async (path) => ({ data: { signedUrl: `https://storage.test/${bucket}/${path}` } }),
    }),
    getBucket: async () => ({ data: {} }),
    createBucket: async () => ({}),
  };
  return { t, rows, files, from, storage, rpc: async () => ({ data: null, error: { message: 'no rpc' } }) };
}

globalThis.__after = [];
// The PO's messages carry the trade's link, made with this key.
process.env.SITE_LINK_SECRET = 'a-test-key-for-site-links-0123456789abcdef';
globalThis.__rec = { email: [], whatsapp: [], notify: [], tasks: [], orders: [], activity: [], stage: [], deadlines: [] };
const db = (globalThis.__db = fakeDb());

const route = await import('../src/app/api/site/jobs/[id]/signoff/route.ts');
const EICS = await import('../src/lib/site/eic/server.ts');
const { signDesign } = await import('../src/lib/site/eic/design.ts');
const { assignmentRow } = await import('../src/lib/site/server.ts');
const FIX = await import('../src/lib/site/fixed/iet-eic.ts');
const E = await import('../src/lib/site/forms/electrician/eic.ts');
const { full, scribble } = await import('./site-eic-fixture.mjs');
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}
const textOf = async (bytes) => {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, disableFontFace: true }).promise;
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) out.push((await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str).join(' '));
  return out.join(' ').replace(/\s+/g, ' ');
};

/* ── A job, an electrician and their phone ─────────────────────────────────── */
const PNG = scribble();
const SIG = `data:image/png;base64,${Buffer.from(PNG).toString('base64')}`;
const TOKEN = 'phone-token-for-the-electrician-0123456789';
const project = {
  id: randomUUID(),
  enquiry_id: randomUUID(),
  owner_id: 'owner-1',
  project_ref: 'HX-0042',
  address: '12 High Street\nMaindee, Newport',
  postcode: 'NP20 4AB',
  products: ['solar', 'battery'],
  system: { kwp: 5.28, inverter_model: 'GivEnergy Gen 3 5 kW', battery_model: 'GivEnergy 9.5 kWh' },
  paperwork: {},
  scaffold_up_on: null,
  scaffold_down_on: null,
};
db.rows('crm_projects').push(project);
db.rows('enquiries').push({ id: project.enquiry_id, name: 'Jane Smith', postcode: 'NP20 4AB', customer_ref: null });
const contact = {
  id: randomUUID(),
  subcontractor_id: null,
  name: 'Dave Price',
  company: 'Price Electrical Ltd',
  email: 'dave@example.test',
  mobile: '07700 900123',
  wa_id: '447700900123',
  whatsapp_ok: false,
  vat_number: null,
  cis_rate: 'net',
  cis_verified_on: '2026-01-10',
  instruments: [{ k: 'f43_tester', v: 'Kept by another part of the pack' }],
  part_p_by: 'self',
  scheme: 'NAPIT',
  scheme_number: '12345',
  archived_at: null,
};
db.rows('site_contacts').push(contact);
db.rows('site_devices').push({ id: randomUUID(), contact_id: contact.id, token_hash: createHash('sha256').update(TOKEN).digest('hex'), last_seen_at: new Date().toISOString(), expires_at: '2099-01-01T00:00:00Z', revoked_at: null });
db.t.cms_kv = [{ key: 'site-settings', value: '{}' }];

// The certificate, and Finish's three confirmations (the pack's other sections aren't on these assignments: forms []).
const values = { ...Object.fromEntries(Object.entries(full(FIX.INSPECTIONS, E.INSPECTION_KEY)).map(([k, v]) => [k, v.v])), EF1: true, EF2: 'yes', EF3: true };
const wrap = (vals) => Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, { v, src: 'typed', at: '2026-11-03T10:00:00Z' }]));
let made = 0;
function electrician(answers, sigs, extra = {}) {
  made++;
  const a = {
    id: randomUUID(), project_id: project.id, contact_id: contact.id, trade: 'electrician', trade_label: null, scope: null, forms: [], cert_route: 'eic', starts_on: '2026-11-03', days: 1,
    rate_pence: 45000, rate_basis: 'fixed', rate_qty: null, raise_po: true, vat_treatment: 'none', vat_note: null, cis_override: null, share_customer_phone: false, note_to_trade: null,
    status: 'started', link_hash: null, link_generation: 1, link_created_at: null, sent_at: null, opened_at: null, started_at: null, signed_at: null, done_at: null, cancelled_at: null,
    answers: wrap(answers), rev: 3, answers_saved_at: null, flags: [], schema_version: 2, created_by: null, created_at: `2026-11-0${made}T08:00:00Z`, updated_at: '2026-11-03T08:00:00Z', ...extra,
  };
  db.rows('site_assignments').push(a);
  for (const slot of sigs) {
    const path = `projects/${project.id}/site/${a.id}/${slot}/${randomUUID()}.png`;
    db.rows('crm_photos').push({ id: randomUUID(), assignment_id: a.id, project_id: project.id, slot, storage_path: path, taken_at: '2026-11-03T16:20:00Z', created_at: '2026-11-03T16:20:00Z' });
    db.files.set(`crm-photos/${path}`, PNG);
  }
  return a;
}
const sign = async (a) => {
  const req = new Request(`http://localhost/api/site/jobs/${a.id}/signoff`, {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ op_id: randomUUID(), stage: 'main', name: 'Dave Price', signature: SIG, declaration: 'I confirm…', signed_at: new Date().toISOString(), rev: 3 }),
  });
  const res = await route.POST(req, { params: Promise.resolve({ id: a.id }) });
  return { status: res.status, body: await res.json() };
};
const afterReply = async () => {
  for (const fn of globalThis.__after.splice(0)) await fn();
};
const read = (id) => assignmentRow(db.rows('site_assignments').find((x) => x.id === id));
const docs = (key) => db.rows('crm_documents').filter((d) => d.project_id === project.id && d.generated_key === key);
const current = (key) => docs(key).find((d) => !d.archived_at);
const fileOf = (d) => db.files.get(`crm-docs/${d.storage_path}`);
const STAFF = { id: 'staff-1', name: 'Sarah Jones' };
const DESIGN = { name: 'Sarah Jones', company: 'Heliaxis Ltd', address: '9 Turner Street, Newport, Gwent', postcode: 'NP19 7AZ', tel: '01633 965205', next_n: 10, next_unit: 'years', departures: null, signature: SIG };

/* ── The three-part EIC: the electrician signs off, then the office signs the design ── */
const one = electrician(values, ['eic_sig_con', 'eic_sig_ins']);
const r = await sign(one);
eq('signed off: 200, done, its PO raised', [r.status, r.body.status, !!r.body.po?.po_number], [200, 'done', true]);
eq('paperwork.eic_on is the day it was signed', /^\d{4}-\d{2}-\d{2}$/.test(db.rows('crm_projects')[0].paperwork.eic_on ?? ''), true);
await afterReply();
eq('the documents step made the EIC as a draft: not in the pack, not visible', docs('EIC_DRAFT').map((d) => [d.category, d.handover_slot, d.visible]), [['certificate', null, false]]);
eq('…and no final EIC yet', docs('EIC').length, 0);
eq('the instruments are remembered on the contact (anything else kept there stays)', db.rows('site_contacts')[0].instruments, [
  { k: 'f43_tester', v: 'Kept by another part of the pack' },
  { k: 'eic_mft', v: 'Megger MFT1741 · 101234567' },
]);
const so = db.rows('site_signoffs').find((s) => s.assignment_id === one.id);
eq('every step after the reply stamped', [!!so.po_done_at, !!so.docs_done_at, !!so.notified_at], [true, true, true]);
let st = await EICS.certificateStatus(db, read(one.id));
eq('the Site tab: the design part to sign; their scheme notifies', [st.state, st.ref, st.notify.who, st.notify.scheme, st.notify.reference], ['to_design', 'HX-0042-EIC', 'self', 'NAPIT', 'HX-0042-EIC']);
const draftText = await textOf(fileOf(current('EIC_DRAFT')));
eq('the draft says so, and the design is to follow', [draftText.includes('Draft: not signed yet'), draftText.includes('To follow: Heliaxis signs the design part')], [true, true]);

const bad = await signDesign(db, read(one.id), { ...DESIGN, next_n: '' }, STAFF);
eq('the design part needs the next inspection (no default)', [bad.ok, bad.error], [false, 'Say when it should next be inspected: a whole number of years or months.']);
const ok = await signDesign(db, read(one.id), DESIGN, STAFF);
eq('signed by the office', ok.ok, true);
const design = read(one.id).answers.eic_design?.v;
eq('kept on the assignment, its signature in crm-docs', [design?.name, design?.next_n, design?.next_unit, db.files.has(`crm-docs/${design?.path}`)], ['Sarah Jones', 10, 'years', true]);
const fin = current('EIC');
eq('the EIC is final: handover slot CC21, held for the pack, not visible yet', [fin?.handover_slot, fin?.release, fin?.visible, fin?.category, fin?.version], ['CC21', 'with_pack', false, 'certificate', 1]);
eq('the draft is archived (kept)', [docs('EIC_DRAFT').length, !!docs('EIC_DRAFT')[0].archived_at], [1, true]);
eq('its file name starts with the job ref', fin.name, 'HX-0042 EIC Electrical Installation Certificate.pdf');
const finText = await textOf(fileOf(fin));
eq('the final: the design signed, three declarations, the next inspection, no draft banner', [
  finText.includes('SARAH JONES'),
  finText.includes('Designer No. 1'),
  finText.split('hereby CERTIFY').length - 1,
  finText.includes('Draft: not signed yet'),
  finText.includes('not more than 10 years'),
], [true, true, 3, false, true]);
st = await EICS.certificateStatus(db, read(one.id));
eq('the Site tab: complete, the final to download, up to date', [st.state, st.doc?.final, st.design?.name, st.doc?.stale], ['complete', true, 'Sarah Jones', false]);
const again = await EICS.saveCertificate(db, one.id);
eq('made again with nothing changed: no new version', [again.saved[0].status, docs('EIC').length], ['same', 1]);
// The office corrects the client's name (a reopened sign-off would do the same): the filed one is out of date.
db.rows('site_assignments').find((x) => x.id === one.id).answers.eic_client = { v: 'Jane A Smith', src: 'typed' };
eq('changed since: the Site tab offers Make it again', (await EICS.certificateStatus(db, read(one.id))).doc?.stale, true);
const remade = await EICS.saveCertificate(db, one.id, 'staff-1');
eq('made again: version 2, the first archived', [remade.saved[0].status, current('EIC')?.version, docs('EIC').filter((d) => d.archived_at).length], ['saved', 2, 1]);
// Once the customer can see it, it isn't replaced without the office saying so.
current('EIC').visible = true;
db.rows('site_assignments').find((x) => x.id === one.id).answers.eic_client = { v: 'Jane Smith', src: 'typed' };
eq('visible to the customer: out of date, not replaced', (await EICS.saveCertificate(db, one.id, 'staff-1')).saved[0].status, 'out_of_date');
eq('…until the office replaces it on purpose', [(await EICS.saveCertificate(db, one.id, 'staff-1', { force: true })).saved[0].status, current('EIC')?.version], ['saved', 3]);

/* ── The server's gate: what never reached it ─────────────────────────────── */
const missingZs = structuredClone(values);
delete missingZs['eic_db:c-c2'].zs;
const two = electrician(missingZs, ['eic_sig_con', 'eic_sig_ins']);
const g = await sign(two);
eq('a reading missing: 422 with the circuit named, nothing signed', [g.status, g.body.error, g.body.missing.map((m) => m.label), db.rows('site_signoffs').filter((s) => s.assignment_id === two.id).length], [
  422,
  'gate',
  ['DB1 circuit 8 (Battery inverter supply): test results'],
  0,
]);
const unsigned = electrician(values, ['eic_sig_con']);
const g2 = await sign(unsigned);
eq('a signature still on the phone: 422', [g2.status, g2.body.missing.map((m) => m.label)], [422, ['Sign for the inspection and testing']]);

/* ── Single signature: final as soon as the electrician signs off ────────────── */
const single = electrician({ ...values, eic_route: 'eic_single', eic_route_why: 'I designed it too', eic_next: 5, eic_next_unit: 'years' }, ['eic_sig_one']);
const r3 = await sign(single);
await afterReply();
const sref = (await EICS.certificateStatus(db, read(single.id))).ref;
const skey = EICS.certKey(sref);
eq('single signature: its own reference and key (the fourth electrician on the job)', [sref, skey], ['HX-0042-EIC4', 'EIC4']);
eq('…final at once, in CC21', [r3.status, current(skey)?.handover_slot, docs(`${skey}_DRAFT`).length], [200, 'CC21', 0]);
const sText = await textOf(fileOf(current(skey)));
eq('one signatory, the next inspection from the electrician', [sText.includes('Designer, constructor and inspector'), sText.includes('Designer No. 1'), sText.includes('not more than 5 years')], [true, false, true]);

/* ── Minor Works: a sheet per circuit, kept out of CC21 while unverified ─────── */
const minor = electrician(
  {
    ...values,
    eic_route: 'meiwc',
    eic_route_why: 'One existing circuit',
    eic_mw_fp: 'ADS (automatic disconnection of supply)',
    ...Object.fromEntries(Object.entries(values).filter(([k]) => k.startsWith('eic_db:c-')).map(([k, v]) => [k, { ...v, work: 'Extended the circuit' }])),
  },
  ['eic_sig_one']
);
const r4 = await sign(minor);
await afterReply();
const sheets = db.rows('crm_documents').filter((d) => /^MEIWC5-/.test(d.generated_key ?? ''));
eq('Minor Works: three sheets, one per circuit, kept out of CC21', [r4.status, sheets.map((d) => d.generated_key).sort(), sheets.every((d) => d.handover_slot === null && d.category === 'certificate')], [
  200,
  ['MEIWC5-1', 'MEIWC5-2', 'MEIWC5-3'],
  true,
]);
const mText = await textOf(fileOf(sheets.find((d) => d.generated_key === 'MEIWC5-1')));
eq('each is a data sheet for its circuit', [mText.includes('Minor Works data sheet'), mText.includes('HX-0042-MW5.1'), mText.includes('Extended the circuit')], [true, true, true]);
eq('the Site tab says their signed Minor Works goes in the pack', (await EICS.certificateStatus(db, read(minor.id))).state, 'data_sheet');

if (process.env.PDF_OUT) {
  const fs = await import('node:fs');
  for (const [k, v] of db.files) if (k.endsWith('.pdf')) fs.writeFileSync(`${process.env.PDF_OUT}/${k.split('/').pop()}`, v);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
