// The handover pack on the server (src/lib/handover/server.ts, its API route and the documents route)
// against an in-memory stand-in for the database and storage: the pack's own documents are made
// from a solar + battery job (held until it's sent) and the library's manual attached; an MCS
// certificate uploaded straight into the pack shows in the customer's portal at once (and its
// number is offered), held until sent when asked; Build gives one PDF with the contents after the
// cover, the signed certificate and a 30 MB manual left separate, and a rebuild makes v2 with v1
// archived; Send releases everything, sets the dates, moves the job and, at 22:00, holds the message
// for 07:00 (sent once, by the cron); an upload after it rebuilds the pack; a payment makes the
// receipt with exactly what was recorded; the portal never shows archived or held documents, and
// shows nothing new before handover.sql; and every document it makes, and the pack, has a print
// version with the same words on the same pages and no cream page, made on request, never stored.
// Regenerate on any of the electrician's documents that went Out of date after Send (HX-PV-02, their EV
// record, the EIC) makes it again from their sign-off; a Send whose pack doesn't build hands nothing over.
// Usage: node --experimental-strip-types scripts/test-handover-send.mjs
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { registerHooks } from 'node:module';

const SRC = new URL('../src/', import.meta.url).href;
const mod = (code) => `data:text/javascript,${encodeURIComponent(code)}`;
const STUBS = {
  'server-only': 'export {}',
  'next/server': `
    export class NextResponse extends Response {
      static json(body, init = {}) { return new NextResponse(JSON.stringify(body), { status: init.status ?? 200, headers: { 'content-type': 'application/json' } }); }
    }
    export function after(fn) { globalThis.__after.push(fn); }`,
  '@/lib/supabase/admin': 'export const createAdminClient = () => globalThis.__db;',
  '@/lib/crm/server': `
    export const DOCS_BUCKET = 'crm-docs'; export const CRM_BUCKET = 'crm-photos'; export const MAX_DOC_BYTES = 25 * 1024 * 1024;
    export const DOC_MIME = ['application/pdf', 'image/jpeg', 'image/png'];
    export const isUuid = (s) => /^[0-9a-f-]{36}$/i.test(s); export const thumbPath = (p) => p;
    export const safeName = (n) => (n || 'document').replace(/[^\\w.\\- ]+/g, '').replace(/\\s+/g, '-').slice(0, 80) || 'document';
    export async function ensureDocsBucket() {} export async function fingerprintDocument() { return null; }
    export async function docCategoryOf(v, fallback = 'other') { return typeof v === 'string' && v ? v : fallback; }
    export async function logActivity(a) { globalThis.__rec.activity.push(a.body); }
    export async function ensurePortalToken() { return 'portal-token-0123456789'; }
    export const portalUrl = (t) => 'https://heliaxis.test/my/' + t;
    export const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    export async function crmSession() { return { user: { id: 'staff-1' }, profile: { full_name: 'Sarah Office', role: globalThis.__role ?? 'admin' } }; }`,
  '@/lib/crm/portal': `export const SIGNABLE_CATEGORIES = ['quote', 'contract'];`,
  '@/lib/crm/move-stage': `export async function moveStage(id, to, o) { globalThis.__rec.moves.push(to); const p = globalThis.__db.rows('crm_projects').find((x) => x.id === id); if (p && (!o?.onlyFrom || o.onlyFrom.includes(p.stage))) { p.stage = to; return { moved: true }; } return { moved: false }; }`,
  '@/lib/projects/server': `
    export const projectRow = (raw) => ({ ...raw, products: raw.products ?? [], checklist: raw.checklist ?? {}, paperwork: raw.paperwork ?? {}, system: raw.system ?? {}, reminders_sent: [] });
    import { addWorkingDays, ukDay } from '${SRC}lib/bank-holidays.ts';
    export async function calendarNow() { return { today: globalThis.__today, hols: new Set(), addWorkingDays, ukDay }; }
    export async function ensureDeadlineTasks(id) { globalThis.__rec.deadlines.push(id); return 0; }`,
  '@/lib/notify': 'export async function notify(n) { globalThis.__rec.notify.push(n.title); }',
  '@/lib/schema-ready': 'export async function schemaReady() { return { site: true, handover: globalThis.__handover !== false, purchaseOrders: true }; }',
  '@/lib/whatsapp/inbox': `export async function sendSystem(enquiryId, msg, via) { globalThis.__rec.whatsapp.push({ template: msg.template, params: msg.params, via }); return { ok: true }; }`,
  '@/lib/whatsapp/settings': `export async function getSettings() { return { quietFromMin: 1260, quietToMin: 525, lateRule: true, lateFromMin: 1230, lateSendAtMin: 420 }; }`,
  '@/lib/ms365': `export const msConfigured = () => false; export async function sendMail(m) { globalThis.__rec.email.push(m.subject); }`,
  '@/lib/subcontractors/server': `
    export const emailShell = (t, b) => '<h1>' + t + '</h1>' + b;
    export function validSignature(s) { return typeof s === 'string' && s.startsWith('data:image/png;base64,'); }
    export async function sendEmail(m) { globalThis.__rec.email.push(m.subject); return { ok: true, id: 'r1' }; }`,
  '@/lib/subcontractors/pdf-engine': `export async function buildPdf(files) { return { bytes: files[0].bytes, keptOriginal: true }; }`,
  '@/lib/surveys/server': `
    export async function addSourceTask(db, t) { if (globalThis.__rec.tasks.some((x) => x.key === t.key)) return false; globalThis.__rec.tasks.push(t); return true; }
    export async function closeSourceTask(db, p, key) { globalThis.__rec.closed.push(key); }
    export function addDaysYmd(ymd, n) { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }`,
  '@/lib/handover/read': `export async function readMcsNumber() { return 'MCS-00998877'; }`,
  // The electrician's documents are made from their sign-off (test-site-electrician has the real
  // thing, force included); here Regenerate's call is recorded and the new version stored as it would be.
  '@/lib/site/electrician-docs': `
    import { saveGenerated } from '${SRC}lib/documents/store.ts';
    export async function saveElectricianDocs(db, id, opts = {}) {
      globalThis.__rec.siteDocs.push({ id, ...opts });
      const a = db.rows('site_assignments').find((x) => x.id === id);
      const out = [];
      // Only what the electrician's sign-off makes for that item (none of their own certificate's pages here).
      for (const slot of (opts.force ?? []).filter((x) => x !== 'HX-HO-04')) { const key = globalThis.__siteDoc.key ?? slot; out.push(await saveGenerated(db, a.project_id, { key, name: 'HX-0042 ' + key + '.pdf', bytes: globalThis.__siteDoc.bytes, inputs: globalThis.__siteDoc.inputs, category: 'commissioning', slot, release: 'with_pack', visible: false, force: !!opts.force?.includes(slot), by: opts.by ?? null })); }
      return out;
    }`,
  // The EIC made in the app (test-site-eic-signoff has the real thing): Regenerate's call recorded, the new version stored as it would be.
  '@/lib/site/eic/server': `
    import { saveGenerated } from '${SRC}lib/documents/store.ts';
    export async function saveCertificate(db, id, by = null, opt = {}) {
      globalThis.__rec.certs.push({ id, by, ...opt });
      const a = db.rows('site_assignments').find((x) => x.id === id);
      const r = await saveGenerated(db, a.project_id, { key: 'EIC', name: 'HX-0043 EIC.pdf', bytes: globalThis.__siteDoc.bytes, inputs: globalThis.__siteDoc.inputs, category: 'certificate', slot: 'HX-HO-04', release: 'with_pack', visible: false, force: opt.force, by });
      return { route: 'eic', saved: [{ key: 'EIC', status: r.status, final: true, missing: null }] };
    }`,
};
registerHooks({
  resolve(specifier, context, next) {
    if (STUBS[specifier]) return { url: mod(STUBS[specifier]), shortCircuit: true };
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
// Bank holidays come from GOV.UK: none here, at once.
const realFetch = globalThis.fetch;
globalThis.fetch = (u, i) => (String(u).includes('gov.uk') ? Promise.resolve(new Response(JSON.stringify({ 'england-and-wales': { events: [] } }))) : realFetch(u, i));

/* ── An in-memory database and storage ─────────────────────────────────────── */
function fakeDb() {
  const t = {};
  const rows = (name) => (t[name] ??= []);
  const files = new Map();
  const now = () => new Date().toISOString();
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const defaults = (table, r) => {
    const base = { id: r.id ?? randomUUID(), created_at: now() };
    if (table === 'crm_documents') return { ...base, visible: false, archived_at: null, archived_by: null, handover_slot: null, release: 'now', source: null, generated_key: null, version: 1, inputs_hash: null, uploaded_by: null, ...r };
    if (table === 'handover_slots') return { na: false, na_reason: null, note: null, data: {}, updated_by: null, updated_at: now(), ...r };
    if (table === 'handover_packs') return { version: 0, document_id: null, contents: null, built_at: null, built_by: null, sent_at: null, sent_by: null, sent_via: [], invoice_prompted_at: null, queued: null, ...r };
    return { ...base, ...r };
  };
  const KEYS = { handover_slots: ['project_id', 'slot'], handover_packs: ['project_id'], cms_kv: ['key'] };
  const from = (table) => {
    const where = [];
    let mode = 'select';
    let payload = null;
    let order = [];
    let lim = null;
    let returning = false;
    const exec = () => {
      if (mode === 'insert' || mode === 'upsert') {
        const list = (Array.isArray(payload) ? payload : [payload]).map((r) => structuredClone(r));
        const out = [];
        for (const r of list) {
          const keys = KEYS[table];
          const hit = mode === 'upsert' && keys ? rows(table).find((x) => keys.every((k) => x[k] === r[k])) : null;
          if (hit) {
            Object.assign(hit, r);
            out.push(hit);
          } else {
            const row = defaults(table, r);
            rows(table).push(row);
            out.push(row);
          }
        }
        return { data: Array.isArray(payload) ? out : out[0], error: null, many: Array.isArray(payload) };
      }
      let list = rows(table).filter((r) => where.every((w) => w(r)));
      if (mode === 'update') {
        for (const r of list) Object.assign(r, structuredClone(payload));
        return { data: list, error: null, many: true };
      }
      if (mode === 'delete') {
        t[table] = rows(table).filter((r) => !list.includes(r));
        return { data: list, error: null, many: true };
      }
      for (const o of [...order].reverse()) list = [...list].sort((a, b) => (a[o.col] < b[o.col] ? -1 : a[o.col] > b[o.col] ? 1 : 0) * (o.asc ? 1 : -1));
      if (lim != null) list = list.slice(0, lim);
      return { data: list.map((r) => structuredClone(r)), error: null, many: true };
    };
    const out = (r, one) => {
      if (!one) return { data: mode === 'select' || returning || r.many === false ? r.data : null, error: null };
      const list = Array.isArray(r.data) ? r.data : [r.data];
      if (one === 'single' && list.length !== 1) return { data: null, error: { message: 'not one row' } };
      return { data: list[0] ? structuredClone(list[0]) : null, error: null };
    };
    const b = {
      select: () => ((returning = mode !== 'select'), b),
      insert: (r) => ((mode = 'insert'), (payload = r), b),
      upsert: (r) => ((mode = 'upsert'), (payload = r), b),
      update: (p) => ((mode = 'update'), (payload = p), b),
      delete: () => ((mode = 'delete'), b),
      // A jsonb column compared with a JSON string, as PostgREST casts it.
      eq: (c, v) => (where.push((r) => (r[c] && typeof r[c] === 'object' && typeof v === 'string' ? same(r[c], JSON.parse(v)) : r[c] === v)), b),
      neq: (c, v) => (where.push((r) => r[c] !== v), b),
      in: (c, v) => (where.push((r) => v.includes(r[c])), b),
      is: (c, v) => (where.push((r) => (r[c] ?? null) === v), b),
      not: (c, op, v) => (where.push((r) => !(op === 'is' && (r[c] ?? null) === v)), b),
      contains: (c, v) => (where.push((r) => same(r[c], v)), b),
      containedBy: (c, v) => (where.push((r) => same(r[c], v)), b),
      lt: (c, v) => (where.push((r) => r[c] < v), b),
      lte: (c, v) => (where.push((r) => r[c] <= v), b),
      like: () => b,
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
      upload: async (path, bytes) => (files.set(`${bucket}/${path}`, new Uint8Array(bytes)), { error: null }),
      download: async (path) => ({ data: files.has(`${bucket}/${path}`) ? new Blob([files.get(`${bucket}/${path}`)]) : null }),
      copy: async (a, b2) => (files.has(`${bucket}/${a}`) ? (files.set(`${bucket}/${b2}`, files.get(`${bucket}/${a}`)), { error: null }) : { error: { message: 'not found' } }),
      remove: async (paths) => (paths.forEach((p) => files.delete(`${bucket}/${p}`)), { error: null }),
      createSignedUrl: async (path) => ({ data: { signedUrl: `https://storage.test/${bucket}/${path}` } }),
    }),
  };
  const rpc = async (name, a) => {
    globalThis.__rec.rpc.push([name, a.p_key]);
    const p = rows('crm_projects').find((x) => x.id === a.p_project);
    if (p) p.checklist = { ...(p.checklist ?? {}), [a.p_key]: a.p_value };
    return { data: null, error: null };
  };
  return { t, rows, files, from, storage, rpc };
}

globalThis.__after = [];
globalThis.__rec = { email: [], whatsapp: [], notify: [], tasks: [], closed: [], activity: [], moves: [], rpc: [], siteDocs: [], certs: [], deadlines: [] };
globalThis.__today = '2026-11-03';
const db = (globalThis.__db = fakeDb());
const runAfter = async () => {
  while (globalThis.__after.length) await globalThis.__after.shift()();
};

const H = await import('../src/lib/handover/server.ts');
const P = await import('../src/lib/handover/portal.ts');
const route = await import('../src/app/api/crm/projects/[id]/handover/route.ts');
const docsRoute = await import('../src/app/api/crm/projects/[id]/documents/route.ts');
const K = await import('../src/lib/documents/pdf-kit.ts');
const D = await import('../src/lib/handover/settings-shared.ts');
const { PDFDocument, PDFName } = await import('pdf-lib');
const sharp = (await import('sharp')).default;

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

/* ── A solar + battery job, signed off by the electrician ──────────────────── */
const SIG = new Uint8Array(await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="90"><path d="M10 60 C 40 10, 70 90, 100 40 S 160 20, 290 30" fill="none" stroke="#111" stroke-width="4"/></svg>')).png().toBuffer());
const pid = randomUUID();
const enq = randomUUID();
db.rows('crm_projects').push({
  id: pid,
  enquiry_id: enq,
  owner_id: 'owner-1',
  title: 'Solar and battery',
  stage: 'installing',
  project_ref: 'HX-0042',
  address: '12 High Street, Maindee, Newport',
  postcode: 'NP20 4AB',
  products: ['solar', 'battery'],
  install_at: '2026-11-02T08:00:00Z',
  install_days: 2,
  commissioned_at: '2026-11-03T16:00:00Z',
  handover_at: null,
  value: 9500,
  deposit_amount: 500,
  deposit_paid_at: '2026-10-05T10:00:00Z',
  deposit_ref: 'pi_3QX',
  dno_ref: null,
  dno_status: 'not_started',
  portal_token: 'portal-token-0123456789',
  checklist: {},
  system: { kwp: 5.28, panel_count: 12, panel_model: 'JA Solar JAM54S30 440', inverter_model: 'GivEnergy Gen 3 5 kW', inverter_kw: 5, battery_model: 'GivEnergy 9.5 kWh', battery_kwh: 9.5, mpan: '1012345678901', est_kwh_year: 4620, shade_factor: 0.95, eess_class: 1, battery_kw: 3.6, roof_faces: 'Rear roof', battery_backup: true, pas63100: false },
  paperwork: { dno_route: 'g98' },
});
db.rows('enquiries').push({ id: enq, name: 'Jane Smith', email: 'jane@example.test', phone: '07700 900123', postcode: 'NP20 4AB' });
db.rows('profiles').push({ id: 'owner-1', full_name: 'Callum Hughes', email: 'callum@heliaxis.co.uk' }, { id: 'staff-1', full_name: 'Sarah Office', email: 'sarah@heliaxis.co.uk' });
db.t.cms_kv = [
  {
    key: 'handover-settings',
    value: JSON.stringify({
      approved: Object.fromEntries(Object.entries(D.DRAFTS).map(([k, d]) => [k, { version: d.version, at: '2026-10-01T09:00:00Z', by: 'Callum' }])),
      warrantyYears: 10,
      warrantyStart: 'commissioning',
      warrantyText: 'FIXTURE WORDING.',
      nextInspectionYears: 10,
    }),
  },
];
const contact = { id: randomUUID(), name: 'Dave Price', company: 'Price Electrical', part_p_by: 'heliaxis' };
db.rows('site_contacts').push(contact);
const ea = { id: randomUUID(), project_id: pid, contact_id: contact.id, trade: 'electrician', cert_route: 'own', status: 'done', created_at: '2026-11-01T00:00:00Z', flags: [], answers: { hos_kind: { v: 'initial' }, eess_backup: { v: 'yes' }, CERT_NO: { v: 'HX-0042-EIC' }, pvt_iso_where: { v: ['Built into the inverter'] } } };
db.rows('site_assignments').push(ea);
db.files.set('crm-docs/signatures/p/site-s1.png', SIG);
db.files.set('crm-docs/signatures/p/cust.png', SIG);
db.rows('site_signoffs').push({ id: 's1', assignment_id: ea.id, stage: 'main', signed_name: 'Dave Price', signed_at: '2026-11-03T17:41:00Z', signature_path: 'signatures/p/site-s1.png', extra: { customer: { completion: { name: 'Jane Smith', signed_at: '2026-11-03T17:50:00Z', path: 'signatures/p/cust.png' } } } });
// Unit 2 and 3's documents, as they arrive through the registry (held until the pack goes).
async function simplePdf(title) {
  const k = await K.newDocument({ code: 'X', title, jobRef: 'HX-0042', issued: '2026-11-03' });
  k.header();
  return k.save();
}
for (const [slot, key, title] of [
  ['HX-PV-02', 'HX-PV-02', 'Solar PV string test results'],
  ['HX-PV-01', 'HX-PV-01', 'Solar PV inspection record'],
  ['HX-PV-03', 'HX-PV-03', 'Solar PV switch-on record'],
  ['HX-BAT-01', 'HX-BAT-01', 'Battery inspection record'],
  ['HX-BAT-02', 'HX-BAT-02', 'Battery switch-on and test record'],
  ['HX-HO-04', 'EIC', 'Electrical Installation Certificate'],
]) {
  const path = `projects/${pid}/generated/${key}-v1.pdf`;
  db.files.set(`crm-docs/${path}`, await simplePdf(title));
  db.rows('crm_documents').push({ id: randomUUID(), project_id: pid, category: 'commissioning', name: `HX-0042 ${title}.pdf`, storage_path: path, mime: 'application/pdf', size: 1, visible: false, created_at: '2026-11-03T17:45:00Z', handover_slot: slot, release: 'with_pack', source: 'generated', generated_key: key, version: 1, inputs_hash: 'u2', archived_at: null });
}
// The product library: a 30 MB battery manual, and a switch the switching-off page needs (typed by the office).
const bigDoc = await PDFDocument.create();
bigDoc.addPage(K.A4).drawText('Battery manual', { x: 60, y: 760, size: 14 });
bigDoc.context.register(bigDoc.context.stream(new Uint8Array(30 * 1024 * 1024).fill(7), {}));
db.files.set('crm-docs/library/manual.pdf', await bigDoc.save({ useObjectStreams: false }));
db.rows('crm_library').push({ id: randomUUID(), name: 'GivEnergy battery manual', kind: 'manual', models: ['GivEnergy 9.5 kWh'], handover_slot: 'HX-HO-17', technologies: ['battery'], every_pack: false, details: {}, storage_path: 'library/manual.pdf', compact_path: null, mime: 'application/pdf', size: 31457280, archived_at: null });
db.rows('handover_slots').push({ project_id: pid, slot: 'HX-HO-09', na: false, data: { values: { cu: 'Under the stairs, labelled Solar PV', ac: 'Loft, next to the inverter', battery: 'Side of the battery' } } });
// …and the inverter maker's start-up and shutdown procedure, which goes with the switching-off page.
db.files.set('crm-docs/library/procedure.pdf', await simplePdf('Inverter start-up and shutdown'));
db.rows('crm_library').push({ id: randomUUID(), name: 'GivEnergy inverter start-up and shutdown', kind: 'procedure', models: ['GivEnergy Gen 3 5 kW'], handover_slot: 'HX-HO-09', technologies: ['solar'], every_pack: false, details: {}, storage_path: 'library/procedure.pdf', compact_path: null, mime: 'application/pdf', size: 2048, archived_at: null });

const post = async (body) => {
  const res = await route.POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id: pid }) });
  return { status: res.status, body: await res.json() };
};
const docs = () => db.rows('crm_documents').filter((d) => d.project_id === pid);
const cur = (key) => docs().find((d) => d.generated_key === key && !d.archived_at);

/* ── 1. The pack's own documents, made as their data lands ─────────────────── */
const r1 = await H.refreshHandover(db, pid, { by: 'staff-1' });
eq('made from the job: the warranty, completion, switching off, schedule, the G98 data sheet, the receipt, the covering letter', r1.made.sort(), ['HX-HO-18-RECEIPT', 'HX-HO-09', 'HX-HO-01', 'HX-HO-08', 'HX-HO-06', 'HX-HO-15-SHEET', 'HX-HO-11'].sort());
eq('the G98 data sheet is an office helper: in no pack item', cur('HX-HO-15-SHEET')?.handover_slot ?? null, null);
eq('file names carry the title, not the code', [cur('HX-HO-06').name, cur('HX-HO-08').name], ['HX-0042 Heliaxis workmanship warranty.pdf', 'HX-0042 Completion sign-off.pdf']);
eq('system summary not made yet', !!cur('HX-HO-02'), false);
// Circuits tested: the electrician skipped it and their own certificate lists none, so it's the office's (never "Not answered" on the summary).
const summaryQ = (await H.handoverView(db, pid)).slots.find((s) => s.code === 'HX-HO-02');
eq('system summary with no circuits tested anywhere: Missing, fill it in on Summary details', [summaryQ.state, summaryQ.fix, summaryQ.why], ['missing', 'values', 'Say which circuits were tested (Summary details): the electrician didn’t, and the electrical certificate doesn’t list them.']);
await post({ action: 'values', slot: 'HX-HO-02', values: { circuits: '2 PV strings; 1 AC circuit' } });
eq('system summary not made until the design part is signed (Missing: sign the design part)', (await H.handoverView(db, pid)).slots.find((s) => s.code === 'HX-HO-02').fix, 'sign-design');
eq('Send waits on it from the office, with its own button (not "from site")', (await H.handoverView(db, pid)).send.blocking.map((b) => [b.code, b.from, b.fix]), [['HX-HO-02', 'office', 'sign-design']]);
const sheetsSrc = fs.readFileSync(new URL('../src/app/admin/crm/[id]/HandoverSheets.tsx', import.meta.url), 'utf8');
const tabSrc = fs.readFileSync(new URL('../src/app/admin/crm/[id]/HandoverTab.tsx', import.meta.url), 'utf8');
eq('the Send sheet lists the office’s items apart, each with its button', [/Still needed from the office:/.test(sheetsSrc), /actions\[b\.code\]\.run/.test(sheetsSrc), /label: FIX_LABEL\[f\], run: \(\) => fix\(rowOf\(b\.code as SlotCode\), f\)/.test(tabSrc)], [true, true, true]);
// Not needed on an item Send waits for is an admin's call, like sending without it.
globalThis.__role = 'office';
const naTests = await post({ action: 'na', slot: 'HX-PV-02', reason: 'Other: not needed' });
globalThis.__role = undefined;
eq('Not needed on the string tests by someone who isn’t an admin: refused, still waited for', [naTests.status, db.rows('handover_slots').some((x) => x.project_id === pid && x.slot === 'HX-PV-02' && x.na)], [403, false]);
eq('…and the tab offers it only to an admin', /\(isAdmin \|\| !SITE_SLOTS\.includes\(s\.code\)\)/.test(tabSrc), true);
eq('the manual attached from the library into Product manuals and warranties, the procedure into Switching off', docs().filter((d) => d.source === 'library').map((d) => d.handover_slot), ['HX-HO-17', 'HX-HO-09']);
const switching = (await H.handoverView(db, pid)).slots.find((s) => s.code === 'HX-HO-09');
eq('switching off lists the procedure beside its own page (Complete from the page)', [switching.state, switching.docs.map((d) => d.source).sort()], ['complete', ['generated', 'library']]);
eq('all held until the pack goes (with_pack, not visible)', docs().filter((d) => d.source === 'generated' && d.handover_slot).every((d) => d.release === 'with_pack' && !d.visible), true);
const r1b = await H.refreshHandover(db, pid, { by: 'staff-1' });
eq('nothing new the second time (same inputs)', r1b.made, []);
// The office signs the design part: the system summary follows.
const signed = await post({ action: 'sign-summary-design', name: 'Callum Hughes', signature: `data:image/png;base64,${Buffer.from(SIG).toString('base64')}` });
eq('design signed → system summary made', [signed.status, !!cur('HX-HO-02'), signed.body.slots.find((s) => s.code === 'HX-HO-02').state], [200, true, 'complete']);

/* ── 2. Upload straight into the customer's portal (owner's ask [8]) ───────── */
const upload = async (name, bytes, extra) => {
  const path = `projects/${pid}/${Date.now()}-${name}`;
  db.files.set(`crm-docs/${path}`, bytes);
  const res = await docsRoute.POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ action: 'save', path, name, mime: 'application/pdf', size: bytes.length, ...extra }) }), { params: Promise.resolve({ id: pid }) });
  const body = await res.json();
  await runAfter();
  return body;
};
const signedDoc = await PDFDocument.create();
signedDoc.addPage(K.A4).drawText('MCS certificate', { x: 60, y: 760, size: 14 });
signedDoc.context.register(signedDoc.context.obj({ Type: 'Sig', ByteRange: [0, 10, 20, 30], Contents: PDFName.of('X') }));
const mcs = await upload('MCS certificate', await signedDoc.save(), { handover_slot: 'HX-HO-03', category: 'mcs' });
eq('MCS certificate in the pack, in their portal at once, its number offered', [mcs.document.handover_slot, mcs.document.visible, mcs.document.release, mcs.read?.mcs_cert_no], ['HX-HO-03', true, 'now', 'MCS-00998877']);
let portal = await P.portalHandover(pid);
const shownIds = portal.groups.flatMap((g) => g.items.flatMap((i) => i.docs.map((d) => d.id)));
eq('the portal shows it straight away, and nothing that’s held', [shownIds.includes(mcs.document.id), shownIds.length], [true, 1]);
// The certificate is in, so the warranty insurance is next: its 7 days start the day it's uploaded (no registered date on the job).
const insurance = (await H.handoverView(db, pid)).slots.find((s) => s.code === 'HX-HO-07');
eq('the MCS certificate uploaded: registered today, the warranty insurance Missing with its 7-day deadline and task', [db.rows('crm_projects')[0].paperwork.mcs_registered_on, insurance.state, insurance.fix, insurance.due, globalThis.__rec.deadlines.includes(pid)], ['2026-11-03', 'missing', 'upload', '2026-11-10', true]);
// The number saved on its own (typed, or "Save it" from the read): the job save starts the same clock, unless a date comes with it.
const jobRoute = fs.readFileSync(new URL('../src/app/api/crm/projects/[id]/route.ts', import.meta.url), 'utf8');
eq('saving the MCS number with no registered date sets it to today', /'mcs_cert_no' in input && !\('mcs_registered_on' in input\) && m\.mcs_cert_no && !m\.mcs_registered_on\) m\.mcs_registered_on = \(await calendarNow\(\)\)\.today/.test(jobRoute), true);
const held = await upload('Guarantee', await simplePdf('Guarantee'), { handover_slot: 'HX-HO-07', hold: true });
portal = await P.portalHandover(pid);
eq('"Hold it until the pack is sent": hidden', portal.groups.flatMap((g) => g.items.flatMap((i) => i.docs.map((d) => d.id))).includes(held.document.id), false);
// A Docs-tab upload with a pack item (whatever its category) lands the same way.
const viaDocs = await upload('Building control certificate', await simplePdf('BC'), { handover_slot: 'HX-HO-05', category: 'other', visible: true });
eq('from the Docs tab, any category: in the pack and the portal', [viaDocs.document.handover_slot, viaDocs.document.visible], ['HX-HO-05', true]);
// The G98 notice is done in the office (owner decision 9): the app's data sheet is the office's helper, the notice as sent is uploaded.
let hv = await H.handoverView(db, pid);
const sheet = cur('HX-HO-15-SHEET');
eq('the G98 data sheet: made for the office, in no pack item, never shown to the customer', [sheet.handover_slot, sheet.release, sheet.visible, hv.helpers.g98Sheet === sheet.id], [null, 'now', false, true]);
eq('G98 notice: Missing until the notice as sent is uploaded', [hv.slots.find((s) => s.code === 'HX-HO-15').state, hv.slots.find((s) => s.code === 'HX-HO-15').fix, hv.slots.find((s) => s.code === 'HX-HO-15').docs.length], ['missing', 'upload', 0]);
eq('the portal asks the customer to sign the G98 form until then', (await P.portalHandover(pid)).signs.map((x) => x.kind), ['g98']);
const g98 = await upload('G98 notice as sent', await simplePdf('G98 notice'), { handover_slot: 'HX-HO-15', hold: true });
hv = await H.handoverView(db, pid);
eq('the notice as sent uploaded: Complete, the G98 notice ticked as sent', [hv.slots.find((s) => s.code === 'HX-HO-15').state, hv.slots.find((s) => s.code === 'HX-HO-15').docs.map((d) => d.id), globalThis.__rec.rpc.some(([n, k]) => n === 'crm_checklist_set' && k === 'c_dno_notified')], ['complete', [g98.document.id], true]);
eq('…and the portal stops asking for a G98 signature', (await P.portalHandover(pid)).signs.map((x) => x.kind), []);

// Not needed after it was made: the document made for it leaves the pack (archived, kept) before the customer has it.
const schedule = cur('HX-HO-11');
const na = await post({ action: 'na', slot: 'HX-HO-11', reason: 'Other: covered by the maintenance plan' });
eq('marked Not needed: its made document archived, not on the item', [na.status, !!docs().find((d) => d.id === schedule.id).archived_at, na.body.slots.find((s) => s.code === 'HX-HO-11').state, na.body.slots.find((s) => s.code === 'HX-HO-11').docs.length], [200, true, 'na', 0]);
eq('…and nothing left to catch up', na.body.dirty, false);
const back = await post({ action: 'restore', slot: 'HX-HO-11' });
eq('Needed after all: made again as the next version', [back.body.slots.find((s) => s.code === 'HX-HO-11').state, cur('HX-HO-11')?.version], ['complete', 2]);

/* ── 3. Build ──────────────────────────────────────────────────────────────── */
const b1 = await post({ action: 'build' });
const pack1 = cur('PACK');
eq('one PDF, stored as the pack (v1, held until sent)', [b1.status, b1.body.built.version, pack1.storage_path, pack1.release, pack1.visible], [200, 1, `projects/${pid}/handover/pack-v1.pdf`, 'with_pack', false]);
const packRow = db.rows('handover_packs').find((x) => x.project_id === pid);
const sep = Object.fromEntries(packRow.contents.filter((c) => c.separate).map((c) => [c.slot, c.separate]));
eq('the signed certificate and the 30 MB manual left as separate files', sep, { 'HX-HO-03': 'signed', 'HX-HO-17': 'size' });
eq('switching off: the page and the procedure both in the pack', packRow.contents.filter((c) => c.slot === 'HX-HO-09').length, 2);
eq('under Grid connection: only the G98 notice as sent, never the data sheet', [packRow.contents.filter((c) => c.slot === 'HX-HO-15').map((c) => c.document_id), packRow.contents.some((c) => c.document_id === sheet.id)], [[g98.document.id], false]);
const packPdf = await PDFDocument.load(db.files.get(`crm-docs/${pack1.storage_path}`));
const coverPages = (await PDFDocument.load(db.files.get(`crm-docs/${cur('HX-HO-01').storage_path}`))).getPageCount();
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const pageText = async (bytes, n) => (await (await (await pdfjs.getDocument({ data: new Uint8Array(bytes), disableFontFace: true }).promise).getPage(n)).getTextContent()).items.map((x) => x.str).join(' ');
const contentsText = (await pageText(db.files.get(`crm-docs/${pack1.storage_path}`), coverPages + 1)).replace(/\s+/g, ' ');
eq('the contents page straight after the cover letter', contentsText.includes('Your handover pack'), true);
eq('…with the procedure on its own line under Switching your system off and on', contentsText.includes('GivEnergy inverter start-up and shutdown'), true);
eq('under 20 MB', db.files.get(`crm-docs/${pack1.storage_path}`).length < 20 * 1024 * 1024, true);
eq('pages add up', packPdf.getPageCount() > coverPages + 1, true);
const b2 = await post({ action: 'build' });
eq('rebuilding makes v2 and archives v1', [b2.body.built.version, !!docs().find((d) => d.id === pack1.id).archived_at, cur('PACK').version], [2, true, 2]);

/* ── 4. Send, at 22:00 ─────────────────────────────────────────────────────── */
const late = new Date('2026-11-03T22:00:00Z');
const s1 = await H.sendHandover(db, pid, { via: ['whatsapp', 'email'], by: 'staff-1', byName: 'Sarah Office', now: late });
eq('sent: the message waits for 07:00', [s1.ok, s1.notes, s1.at], [true, ['Goes at 07:00.'], '2026-11-04T07:00:00.000Z']);
eq('nothing sent to the customer yet', [globalThis.__rec.whatsapp.length, globalThis.__rec.email.length], [0, 0]);
eq('every held document released, with the pack', docs().filter((d) => d.handover_slot && !d.archived_at).every((d) => d.visible), true);
const packSent = db.rows('handover_packs').find((x) => x.project_id === pid);
eq('sent_at, handover_at, the stage moved', [!!packSent.sent_at, !!db.rows('crm_projects')[0].handover_at, db.rows('crm_projects')[0].stage], [true, true, 'handover']);
eq('the final invoice task, due the next working day', globalThis.__rec.tasks.find((t) => t.key === 'final-invoice')?.dueDate, '2026-11-04');
eq('the tab says when it goes', (await H.handoverView(db, pid)).pack.queued?.words, '07:00');
eq('the cron before 07:00 sends nothing', await H.sendQueuedHandover(db, new Date('2026-11-04T06:58:00Z')), 0);
const seven = new Date('2026-11-04T07:00:00Z');
eq('at 07:00: sent once (WhatsApp template and email)', [await H.sendQueuedHandover(db, seven), globalThis.__rec.whatsapp.map((w) => w.template), globalThis.__rec.email.length], [1, ['handover_pack_ready'], 1]);
eq('and not again', await H.sendQueuedHandover(db, seven), 0);
portal = await P.portalHandover(pid);
eq('the portal: Download everything first, the cover letter to start', [!!portal.pack, portal.groups[0].title], [true, 'Start here']);
eq('the portal’s switching-off item has the procedure too', portal.groups.flatMap((g) => g.items).find((i) => i.code === 'HX-HO-09')?.docs.length, 2);
eq('the guarantee is in their portal now (released at Send)', portal.groups.flatMap((g) => g.items.flatMap((i) => i.docs.map((d) => d.id))).includes(held.document.id), true);

/* ── 5. After sending, an upload rebuilds the pack ─────────────────────────── */
const v = cur('PACK').version;
await upload('Schematic', await simplePdf('Schematic'), { handover_slot: 'HX-HO-13' });
eq('an upload after Send: the pack rebuilt by itself, released at once', [cur('PACK').version, cur('PACK').visible], [v + 1, true]);
// "Tell the customer" on the final invoice, in the day: it's their final invoice (not "paid"), and an
// added document never goes as the "your pack is ready" WhatsApp template.
const [mails, was] = [globalThis.__rec.email.length, globalThis.__rec.whatsapp.length];
const told = await H.tellCustomer(db, pid, 'HX-HO-18', ['whatsapp', 'email'], 'staff-1', new Date('2026-11-05T11:00:00Z'));
eq('told now, by both', [told.at, told.notes], [null, ['Sent by WhatsApp.', 'Emailed.']]);
eq('the email: “We’ve added your final invoice”', globalThis.__rec.email.slice(mails), ['We’ve added your final invoice to your handover pack']);
eq('WhatsApp: as text, no template', globalThis.__rec.whatsapp.slice(was).map((w) => w.template), [null]);
eq('…and the timeline says what went', globalThis.__rec.activity.at(-1), 'Handover pack: final invoice sent to the customer (Sent by WhatsApp. Emailed.)');

// After Send the electrician's string tests (HX-PV-02) are the customer's; a reading is corrected and they sign again, so
// the store marks it Out of date (newer inputs than the customer's copy). Regenerate on HX-PV-02 makes it
// again from the sign-off, releases it into their portal and rebuilds the pack.
const ST = await import('../src/lib/documents/store.ts');
globalThis.__siteDoc = { bytes: await simplePdf('Solar PV string test results (corrected)'), inputs: { doc: 'HX-PV-02', corrected: true } };
const testsBefore = cur('HX-PV-02');
db.rows('handover_slots').push({ project_id: pid, slot: 'HX-PV-02', na: false, data: { stale: { key: 'HX-PV-02', hash: ST.inputsHash(globalThis.__siteDoc.inputs), at: '2026-11-04T09:00:00Z' } } });
const hv5 = await H.handoverView(db, pid);
eq('the string tests behind their sign-off after they went: Out of date (the electrician’s: maker site)', [hv5.slots.find((s) => s.code === 'HX-PV-02').state, hv5.slots.find((s) => s.code === 'HX-PV-02').maker], ['stale', 'site']);
const packBefore = cur('PACK').version;
const regen = await post({ action: 'regenerate', slot: 'HX-PV-02' });
const testsAfter = cur('HX-PV-02');
eq('Regenerate on the string tests: made again by the site app for that item only, by whoever pressed it', globalThis.__rec.siteDocs, [{ id: ea.id, force: ['HX-PV-02'], by: 'staff-1' }]);
eq('…the new version in their portal, the old one archived, nothing Out of date, the pack rebuilt', [regen.status, testsAfter.version, testsAfter.visible, !!docs().find((d) => d.id === testsBefore.id).archived_at, regen.body.slots.find((s) => s.code === 'HX-PV-02').state, cur('PACK').version], [200, 2, true, true, 'complete', packBefore + 1]);
eq('…and logged', globalThis.__rec.activity.includes('Handover pack: Solar PV string test results made again'), true);

// The Overview card after Send: the final invoice to send, then (uploaded, unpaid) their payment to wait for.
eq('Overview card after Send: send the final invoice', (await H.handoverSummary(db, pid)).next, 'Send the final invoice');
await upload('Final invoice', await simplePdf('Final invoice'), { handover_slot: 'HX-HO-18' });
eq('…uploaded and not paid yet: waiting for payment, not “send” again', (await H.handoverSummary(db, pid)).next, 'Waiting for payment');
const sheets = fs.readFileSync(new URL('../src/app/admin/crm/[id]/HandoverSheets.tsx', import.meta.url), 'utf8');
eq('Record a payment: “This is the final payment” starts unticked', /const \[final, setFinal\] = useState\(false\)/.test(sheets), true);

/* ── 6. Payments and the receipt ───────────────────────────────────────────── */
const pay = await post({ action: 'record-payment', amount_pence: 900000, paid_on: '2026-11-10', method: 'bank_transfer', reference: 'INV-0042', kind: 'final' });
eq('payment recorded, Final invoice paid ticked', [pay.status, globalThis.__rec.rpc.some(([n, k]) => n === 'crm_checklist_set' && k === 'x_paid')], [200, true]);
const receipt = cur('HX-HO-18-RECEIPT');
const rText = await pageText(db.files.get(`crm-docs/${receipt.storage_path}`), 1);
eq('the receipt lists exactly the recorded payments, nothing worked out', [rText.includes('£500.00'), rText.includes('£9,000.00'), /balance|total/i.test(rText)], [true, true, false]);
eq('the receipt follows its data even after Send (v2, visible)', [receipt.version, receipt.visible], [2, true]);

/* ── 7. Archived and before handover.sql ───────────────────────────────────── */
await post({ action: 'archive', doc: viaDocs.document.id });
portal = await P.portalHandover(pid);
eq('an archived document never shows', portal.groups.flatMap((g) => g.items.flatMap((i) => i.docs.map((d) => d.id))).includes(viaDocs.document.id), false);
globalThis.__handover = false;
eq('before handover.sql: nothing new in the portal', await P.portalHandover(pid), null);
globalThis.__handover = true;

/* ── 8. Print versions (handoverDocPrint, packPrint): made on request, never stored ─── */
// As in production, each stored document was made on the day the job's facts call today.
for (const d of docs()) if (d.source === 'generated') d.created_at = `${globalThis.__today}T12:00:00.000Z`;
db.rows('handover_packs').find((x) => x.project_id === pid).built_at = `${globalThis.__today}T12:00:00.000Z`;
const PS = await import('../src/lib/documents/print-shared.ts');
const allText = async (bytes) => {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), disableFontFace: true }).promise;
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) out.push((await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str).join(' '));
  return out;
};
/** The fill colours a PDF's pages set, as "#rrggbb". */
const fills = async (bytes) => {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), disableFontFace: true }).promise;
  const out = new Set();
  for (let i = 1; i <= doc.numPages; i++) {
    const ops = await (await doc.getPage(i)).getOperatorList();
    ops.fnArray.forEach((fn, k) => fn === pdfjs.OPS.setFillRGBColor && out.add(`#${[...Object.values(ops.argsArray[k])].slice(0, 3).map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`));
  }
  return out;
};
const refOf = (d) => ({ projectId: d.project_id, key: d.generated_key, hash: d.inputs_hash, madeAt: d.created_at });
const printOf = (d) => (d.generated_key === 'PACK' ? H.packPrint(db, refOf(d), (row) => (row.source === 'generated' && PS.hasPrintVersion(row.generated_key) ? H.handoverDocPrint(db, refOf(row)) : Promise.resolve(null))) : H.handoverDocPrint(db, refOf(d)));
const filesBefore = db.files.size;
const rowsBefore = docs().length;
// The pack's own (the electrician's documents and the EIC here are stand-ins: test-site-eic-signoff has theirs).
const OWN = ['HX-HO-02', 'HX-HO-06', 'HX-HO-08', 'HX-HO-09', 'HX-HO-10', 'HX-HO-11', 'HX-HO-12', 'HX-HO-15-SHEET', 'HX-HO-16-SHEET', 'HX-HO-18-RECEIPT', 'HX-HO-01', 'PACK'];
const printable = docs().filter((d) => !d.archived_at && d.source === 'generated' && OWN.includes(d.generated_key));
eq('the pack’s own documents and the pack have print versions; the library’s manual and their own certificate haven’t', [printable.map((d) => d.generated_key).includes('PACK'), PS.hasPrintVersion('LIB-1'), PS.hasPrintVersion('CERT_OWN')], [true, false, false]);
const same = [];
const cream = [];
for (const d of printable) {
  const bytes = await printOf(d);
  if (!(bytes instanceof Uint8Array)) continue;
  // The same words on the same pages as the stored (digital) copy.
  const stored = db.files.get(`crm-docs/${d.storage_path}`);
  if (JSON.stringify(await allText(bytes)) === JSON.stringify(await allText(stored))) same.push(d.generated_key);
  if (d.generated_key !== 'PACK' && (await fills(bytes)).has('#f7f2e7')) cream.push(d.generated_key);
}
eq('every one: the same words on the same pages as the stored copy', same.sort(), printable.map((d) => d.generated_key).sort());
eq('none on the cream page', cream, []);
eq('nothing stored or added for a print version', [db.files.size, docs().length], [filesBefore, rowsBefore]);
// What it's made from changes: the stored copy is behind, so no print version until it's made again.
const receiptNow = cur('HX-HO-18-RECEIPT');
eq('a copy behind what it’s made from has no print version', await H.handoverDocPrint(db, { ...refOf(receiptNow), hash: 'something else' }), 'changed');
eq('nor a pack behind its documents', await H.packPrint(db, { ...refOf(cur('PACK')), hash: 'something else' }, async () => null), 'changed');

/* ── 9. The same job the next day (and the next): nothing changed, so nothing new ─────── */
// The day a document is made isn't part of what it's hashed on: the daily cron mustn't re-date the
// warranty and cover letter, rebuild the pack or leave anything Out of date.
const genVersions = () => Object.fromEntries(docs().filter((d) => d.source === 'generated' && !d.archived_at).map((d) => [d.generated_key, d.version]));
const day0 = { view: await H.handoverView(db, pid), versions: genVersions(), rows: docs().length, pack: cur('PACK').version, log: globalThis.__rec.activity.length };
eq('today: nothing to catch up', [day0.view.dirty, day0.view.headline.stale], [false, 0]);
const coverWords = await allText(db.files.get(`crm-docs/${cur('HX-HO-01').storage_path}`));
for (const day of ['2026-11-04', '2026-11-05']) {
  globalThis.__today = day;
  const v9 = await H.handoverView(db, pid);
  eq(`${day}: the same headline, nothing Out of date, nothing to make`, [v9.headline.words, v9.headline.stale, v9.slots.filter((s) => s.state === 'stale').map((s) => s.code), v9.dirty], [day0.view.headline.words, 0, [], false]);
  const r9 = await H.refreshHandover(db, pid, {}); // what the daily /api/cron/site handover job runs
  eq(`${day}: the cron makes nothing and leaves the pack as it is`, [r9.made, r9.stale, r9.rebuilt], [[], [], false]);
  eq(`${day}: no new versions, no new rows, nothing logged`, [genVersions(), docs().length, cur('PACK').version, globalThis.__rec.activity.length], [day0.versions, day0.rows, day0.pack, day0.log]);
}
const coverPrint = await H.handoverDocPrint(db, refOf(cur('HX-HO-01')));
eq('a print version asked for days later: the same words as the stored copy (dated the day it was made)', coverPrint instanceof Uint8Array && JSON.stringify(await allText(coverPrint)) === JSON.stringify(coverWords), true);
globalThis.__today = '2026-11-03';

/* ── 10. A warranty dated from the handover goes in the pack that's sent ───────── */
const settingsRow = db.t.cms_kv.find((x) => x.key === 'handover-settings');
const settingsWas = settingsRow.value;
settingsRow.value = JSON.stringify({ ...JSON.parse(settingsWas), warrantyStart: 'handover' });
const pid2 = randomUUID();
const enq2 = randomUUID();
db.rows('crm_projects').push({ id: pid2, enquiry_id: enq2, owner_id: 'owner-1', title: 'EV charger', stage: 'installing', project_ref: 'HX-0043', address: '3 Mill Lane, Newport', postcode: 'NP20 5CD', products: ['ev'], install_at: '2026-11-04T08:00:00Z', install_days: 1, commissioned_at: '2026-11-04T15:00:00Z', handover_at: null, value: 1200, portal_token: 'portal-token-2', checklist: {}, system: { ev_charger_model: 'Zappi 2' }, paperwork: {} });
db.rows('enquiries').push({ id: enq2, name: 'Tom Jones', email: 'tom@example.test', phone: null, postcode: 'NP20 5CD' });
await H.refreshHandover(db, pid2, {});
const w0 = (await H.handoverView(db, pid2)).slots.find((s) => s.code === 'HX-HO-06');
eq('warranty dated from the handover: Waiting until the pack goes', [w0.state, w0.why], ['waiting', 'Dated when the pack goes to the customer.']);
const sent2 = await H.sendHandover(db, pid2, { via: [], by: 'staff-1', byName: 'Sarah Office', override: true, now: new Date('2026-11-05T10:00:00Z') });
const pack2 = db.rows('handover_packs').find((x) => x.project_id === pid2);
const docs2 = db.rows('crm_documents').filter((d) => d.project_id === pid2 && !d.archived_at);
const f19 = docs2.find((d) => d.generated_key === 'HX-HO-06');
eq('Send: the warranty made and in the very pack that was sent (v1), in their portal', [sent2.ok, !!f19, pack2.version, pack2.contents.some((c) => c.slot === 'HX-HO-06' && c.document_id === f19?.id), f19?.visible], [true, true, 1, true, true]);
eq('…dated the day the pack went', !!f19 && (await allText(db.files.get(`crm-docs/${f19.storage_path}`))).join(' ').includes('5 November 2026'), true);
const cover2 = (await allText(db.files.get(`crm-docs/${docs2.find((d) => d.generated_key === 'HX-HO-01').storage_path}`))).join(' ').replace(/\s+/g, ' ');
eq('…and the covering letter sent with it says it’s enclosed', /Heliaxis workmanship warranty Enclosed/.test(cover2), true);
settingsRow.value = settingsWas;

/* ── 11. The electrician's other documents after Send: Out of date, then Regenerate ─────── */
// Their EV charger record (in HX-HO-19) and the EIC made in the app (HX-HO-04) are theirs too: a correction
// after the pack has gone puts them Out of date, and Regenerate makes them again from the sign-off.
{
  const ev = { id: randomUUID(), project_id: pid2, contact_id: contact.id, trade: 'electrician', status: 'done', created_at: '2026-11-04T00:00:00Z', flags: [], answers: {} };
  db.rows('site_assignments').push(ev);
  const docs2 = () => db.rows('crm_documents').filter((d) => d.project_id === pid2);
  const cur2 = (key) => docs2().find((d) => d.generated_key === key && !d.archived_at);
  const regen2 = async (slot) => {
    const res = await route.POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ action: 'regenerate', slot }) }), { params: Promise.resolve({ id: pid2 }) });
    return { status: res.status, body: await res.json() };
  };
  const ST = await import('../src/lib/documents/store.ts');
  for (const [slot, key, title] of [['HX-HO-19', 'HX-EV-01', 'EV Charge Point Installation Record'], ['HX-HO-04', 'EIC', 'Electrical Installation Certificate']]) {
    const path = `projects/${pid2}/generated/${key}-v1.pdf`;
    db.files.set(`crm-docs/${path}`, await simplePdf(title));
    db.rows('crm_documents').push({ id: randomUUID(), project_id: pid2, category: 'commissioning', name: `HX-0043 ${title}.pdf`, storage_path: path, mime: 'application/pdf', size: 1, visible: true, created_at: '2026-11-05T09:00:00Z', handover_slot: slot, release: 'now', source: 'generated', generated_key: key, version: 1, inputs_hash: `${key}-1`, archived_at: null });
    db.rows('handover_slots').push({ project_id: pid2, slot, na: false, data: { stale: { key, hash: ST.inputsHash({ doc: key, corrected: true }), at: '2026-11-06T09:00:00Z' } } });
  }
  await H.buildHandover(db, pid2, { by: 'staff-1' });
  const hv11 = await H.handoverView(db, pid2);
  eq('EV record and EIC behind their sign-off after Send: Out of date', ['HX-HO-19', 'HX-HO-04'].map((c) => hv11.slots.find((s) => s.code === c).state), ['stale', 'stale']);
  eq('…and the tab offers Regenerate on any made document that’s Out of date', /\|\| s\.docs\.some\(\(d\) => d\.source === 'generated' && d\.stale\)/.test(tabSrc), true);
  for (const [slot, key] of [['HX-HO-19', 'HX-EV-01'], ['HX-HO-04', 'EIC']]) {
    globalThis.__rec.siteDocs = [];
    globalThis.__rec.certs = [];
    globalThis.__siteDoc = { key, bytes: await simplePdf(`${key} (corrected)`), inputs: { doc: key, corrected: true } };
    const before = cur2(key);
    const packV = cur2('PACK').version;
    const r = await regen2(slot);
    const after = cur2(key);
    eq(`Regenerate on ${slot}: the site app makes it again for that item, by whoever pressed it`, [globalThis.__rec.siteDocs, slot === 'HX-HO-04' ? globalThis.__rec.certs : []], [[{ id: ev.id, force: [slot], by: 'staff-1' }], slot === 'HX-HO-04' ? [{ id: ev.id, by: 'staff-1', force: true }] : []]);
    eq(`…${key} v2 in their portal, v1 archived, nothing Out of date, the pack rebuilt`, [r.status, after.version, after.visible, !!docs2().find((d) => d.id === before.id).archived_at, r.body.slots.find((s) => s.code === slot).state, cur2('PACK').version], [200, 2, true, true, 'complete', packV + 1]);
  }
}

/* ── 12. A Send whose pack doesn't build hasn't handed anything over ─────────────────── */
{
  settingsRow.value = JSON.stringify({ ...JSON.parse(settingsWas), warrantyStart: 'handover' });
  const pid5 = randomUUID();
  const enq5 = randomUUID();
  db.rows('crm_projects').push({ id: pid5, enquiry_id: enq5, owner_id: 'owner-1', title: 'EV charger', stage: 'installing', project_ref: 'HX-0044', address: '5 Mill Lane, Newport', postcode: 'NP20 5CD', products: ['ev'], install_at: '2026-11-04T08:00:00Z', install_days: 1, commissioned_at: '2026-11-04T15:00:00Z', handover_at: null, value: 1200, portal_token: 'portal-token-5', checklist: {}, system: { ev_charger_model: 'Zappi 2' }, paperwork: {} });
  db.rows('enquiries').push({ id: enq5, name: 'Sam Hill', email: 'sam@example.test', phone: null, postcode: 'NP20 5CD' });
  const realStorage = db.storage.from;
  db.storage.from = (bucket) => {
    const b = realStorage(bucket);
    return { ...b, upload: async (path, bytes) => (/\/handover\/pack-/.test(path) ? { error: { message: 'storage is down' } } : b.upload(path, bytes)) };
  };
  const failed5 = await H.sendHandover(db, pid5, { via: [], by: 'staff-1', byName: 'Sarah Office', override: true, now: new Date('2026-11-05T10:00:00Z') }).then(() => 'sent', (e) => String(e.message));
  const p5 = () => db.rows('crm_projects').find((p) => p.id === pid5);
  eq('the pack didn’t build: the Send fails, the job isn’t marked handed over, the pack not sent', [failed5, p5().handover_at, db.rows('handover_packs').find((x) => x.project_id === pid5)?.sent_at ?? null, p5().stage], ['Couldn’t store the pack: storage is down', null, null, 'installing']);
  db.storage.from = realStorage;
  const sent5 = await H.sendHandover(db, pid5, { via: [], by: 'staff-1', byName: 'Sarah Office', override: true, now: new Date('2026-11-06T10:00:00Z') });
  const warranty5 = db.rows('crm_documents').find((d) => d.project_id === pid5 && d.generated_key === 'HX-HO-06' && !d.archived_at);
  eq('…sent the next day: handed over that day, the warranty dated from it', [sent5.ok, p5().handover_at, (await allText(db.files.get(`crm-docs/${warranty5.storage_path}`))).join(' ').includes('6 November 2026')], [true, '2026-11-06T10:00:00.000Z', true]);
  settingsRow.value = settingsWas;
}

if (process.env.PDF_OUT) fs.writeFileSync(`${process.env.PDF_OUT}/PACK-server.pdf`, db.files.get(`crm-docs/${cur('PACK').storage_path}`));
console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);
