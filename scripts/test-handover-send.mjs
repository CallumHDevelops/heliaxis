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
    export const isUuid = (s) => /^[0-9a-f-]{36}$/i.test(s);
    export const safeName = (n) => (n || 'document').replace(/[^\\w.\\- ]+/g, '').replace(/\\s+/g, '-').slice(0, 80) || 'document';
    export async function ensureDocsBucket() {} export async function fingerprintDocument() { return null; }
    export async function docCategoryOf(v, fallback = 'other') { return typeof v === 'string' && v ? v : fallback; }
    export async function logActivity(a) { globalThis.__rec.activity.push(a.body); }
    export async function ensurePortalToken() { return 'portal-token-0123456789'; }
    export const portalUrl = (t) => 'https://heliaxis.test/my/' + t;
    export const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    export async function crmSession() { return { user: { id: 'staff-1' }, profile: { full_name: 'Sarah Office', role: 'admin' } }; }`,
  '@/lib/crm/portal': `export const SIGNABLE_CATEGORIES = ['quote', 'contract'];`,
  '@/lib/crm/move-stage': `export async function moveStage(id, to, o) { globalThis.__rec.moves.push(to); const p = globalThis.__db.rows('crm_projects').find((x) => x.id === id); if (p && (!o?.onlyFrom || o.onlyFrom.includes(p.stage))) { p.stage = to; return { moved: true }; } return { moved: false }; }`,
  '@/lib/projects/server': `
    export const projectRow = (raw) => ({ ...raw, products: raw.products ?? [], checklist: raw.checklist ?? {}, paperwork: raw.paperwork ?? {}, system: raw.system ?? {}, reminders_sent: [] });
    import { addWorkingDays, ukDay } from '${SRC}lib/bank-holidays.ts';
    export async function calendarNow() { return { today: globalThis.__today, hols: new Set(), addWorkingDays, ukDay }; }`,
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
globalThis.__rec = { email: [], whatsapp: [], notify: [], tasks: [], closed: [], activity: [], moves: [], rpc: [] };
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
const ea = { id: randomUUID(), project_id: pid, contact_id: contact.id, trade: 'electrician', status: 'done', created_at: '2026-11-01T00:00:00Z', flags: [], answers: { f78_kind: { v: 'initial' }, eess_backup: { v: 'yes' }, CERT_NO: { v: 'HX-0042-EIC' }, f43_iso_loc: { v: ['Built into the inverter'] } } };
db.rows('site_assignments').push(ea);
db.files.set('crm-docs/signatures/p/site-s1.png', SIG);
db.files.set('crm-docs/signatures/p/cust.png', SIG);
db.rows('site_signoffs').push({ id: 's1', assignment_id: ea.id, stage: 'main', signed_name: 'Dave Price', signed_at: '2026-11-03T17:41:00Z', signature_path: 'signatures/p/site-s1.png', extra: { customer: { f16e: { name: 'Jane Smith', signed_at: '2026-11-03T17:50:00Z', path: 'signatures/p/cust.png' } } } });
// Unit 2 and 3's documents, as they arrive through the registry (held until the pack goes).
async function simplePdf(title) {
  const k = await K.newDocument({ code: 'X', title, jobRef: 'HX-0042', issued: '2026-11-03' });
  k.header();
  return k.save();
}
for (const [slot, key, title] of [
  ['F43', 'F43', 'PV Array Test Report'],
  ['F44', 'F44', 'Solar PV Installation Checklist'],
  ['F44A', 'F44A', 'Solar PV Commissioning Checklist'],
  ['F74', 'F74', 'Battery Testing Checklist'],
  ['F75', 'F75', 'Battery Commissioning Checklist'],
  ['CC21', 'EIC', 'Electrical Installation Certificate'],
]) {
  const path = `projects/${pid}/generated/${key}-v1.pdf`;
  db.files.set(`crm-docs/${path}`, await simplePdf(title));
  db.rows('crm_documents').push({ id: randomUUID(), project_id: pid, category: 'commissioning', name: `HX-0042 ${key} ${title}.pdf`, storage_path: path, mime: 'application/pdf', size: 1, visible: false, created_at: '2026-11-03T17:45:00Z', handover_slot: slot, release: 'with_pack', source: 'generated', generated_key: key, version: 1, inputs_hash: 'u2', archived_at: null });
}
// The product library: a 30 MB battery manual, and a switch the CC4 page needs (typed by the office).
const bigDoc = await PDFDocument.create();
bigDoc.addPage(K.A4).drawText('Battery manual', { x: 60, y: 760, size: 14 });
bigDoc.context.register(bigDoc.context.stream(new Uint8Array(30 * 1024 * 1024).fill(7), {}));
db.files.set('crm-docs/library/manual.pdf', await bigDoc.save({ useObjectStreams: false }));
db.rows('crm_library').push({ id: randomUUID(), name: 'GivEnergy battery manual', kind: 'manual', models: ['GivEnergy 9.5 kWh'], handover_slot: 'CC5', technologies: ['battery'], every_pack: false, details: {}, storage_path: 'library/manual.pdf', compact_path: null, mime: 'application/pdf', size: 31457280, archived_at: null });
db.rows('handover_slots').push({ project_id: pid, slot: 'CC4', na: false, data: { values: { cu: 'Under the stairs, labelled Solar PV', ac: 'Loft, next to the inverter', battery: 'Side of the battery' } } });

const post = async (body) => {
  const res = await route.POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id: pid }) });
  return { status: res.status, body: await res.json() };
};
const docs = () => db.rows('crm_documents').filter((d) => d.project_id === pid);
const cur = (key) => docs().find((d) => d.generated_key === key && !d.archived_at);

/* ── 1. The pack's own documents, made as their data lands ─────────────────── */
const r1 = await H.refreshHandover(db, pid, { by: 'staff-1' });
eq('made from the job: F19I, F16E, CC4, F49, F47, the receipt, the cover letter', r1.made.sort(), ['CC13_RECEIPT', 'CC4', 'F07BI', 'F16E', 'F19I', 'F47', 'F49'].sort());
eq('F78 not made yet', !!cur('F78'), false);
eq('F78 not made until the design part is signed (Missing: sign the design part)', (await H.handoverView(db, pid)).slots.find((s) => s.code === 'F78').fix, 'sign-design');
eq('the manual attached from the library into CC5', docs().filter((d) => d.source === 'library').map((d) => d.handover_slot), ['CC5']);
eq('all held until the pack goes (with_pack, not visible)', docs().filter((d) => d.source === 'generated' && d.handover_slot).every((d) => d.release === 'with_pack' && !d.visible), true);
const r1b = await H.refreshHandover(db, pid, { by: 'staff-1' });
eq('nothing new the second time (same inputs)', r1b.made, []);
// The office signs the design part: F78 follows.
const signed = await post({ action: 'sign-f78-design', name: 'Callum Hughes', signature: `data:image/png;base64,${Buffer.from(SIG).toString('base64')}` });
eq('design signed → F78 made', [signed.status, !!cur('F78'), signed.body.slots.find((s) => s.code === 'F78').state], [200, true, 'complete']);

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
const mcs = await upload('MCS certificate', await signedDoc.save(), { handover_slot: 'CC17', category: 'mcs' });
eq('MCS certificate in the pack, in their portal at once, its number offered', [mcs.document.handover_slot, mcs.document.visible, mcs.document.release, mcs.read?.mcs_cert_no], ['CC17', true, 'now', 'MCS-00998877']);
let portal = await P.portalHandover(pid);
const shownIds = portal.groups.flatMap((g) => g.items.flatMap((i) => i.docs.map((d) => d.id)));
eq('the portal shows it straight away, and nothing that’s held', [shownIds.includes(mcs.document.id), shownIds.length], [true, 1]);
const held = await upload('Guarantee', await simplePdf('Guarantee'), { handover_slot: 'CC16', hold: true });
portal = await P.portalHandover(pid);
eq('"Hold it until the pack is sent": hidden', portal.groups.flatMap((g) => g.items.flatMap((i) => i.docs.map((d) => d.id))).includes(held.document.id), false);
// A Docs-tab upload with a pack item (whatever its category) lands the same way.
const viaDocs = await upload('Building control certificate', await simplePdf('BC'), { handover_slot: 'CC14', category: 'other', visible: true });
eq('from the Docs tab, any category: in the pack and the portal', [viaDocs.document.handover_slot, viaDocs.document.visible], ['CC14', true]);

/* ── 3. Build ──────────────────────────────────────────────────────────────── */
const b1 = await post({ action: 'build' });
const pack1 = cur('PACK');
eq('one PDF, stored as the pack (v1, held until sent)', [b1.status, b1.body.built.version, pack1.storage_path, pack1.release, pack1.visible], [200, 1, `projects/${pid}/handover/pack-v1.pdf`, 'with_pack', false]);
const packRow = db.rows('handover_packs').find((x) => x.project_id === pid);
const sep = Object.fromEntries(packRow.contents.filter((c) => c.separate).map((c) => [c.slot, c.separate]));
eq('the signed certificate and the 30 MB manual left as separate files', sep, { CC17: 'signed', CC5: 'size' });
const packPdf = await PDFDocument.load(db.files.get(`crm-docs/${pack1.storage_path}`));
const coverPages = (await PDFDocument.load(db.files.get(`crm-docs/${cur('F07BI').storage_path}`))).getPageCount();
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const pageText = async (bytes, n) => (await (await (await pdfjs.getDocument({ data: new Uint8Array(bytes), disableFontFace: true }).promise).getPage(n)).getTextContent()).items.map((x) => x.str).join(' ');
eq('the contents page straight after the cover letter', (await pageText(db.files.get(`crm-docs/${pack1.storage_path}`), coverPages + 1)).includes('Your handover pack'), true);
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
eq('the guarantee is in their portal now (released at Send)', portal.groups.flatMap((g) => g.items.flatMap((i) => i.docs.map((d) => d.id))).includes(held.document.id), true);

/* ── 5. After sending, an upload rebuilds the pack ─────────────────────────── */
const v = cur('PACK').version;
await upload('Schematic', await simplePdf('Schematic'), { handover_slot: 'CC10' });
eq('an upload after Send: the pack rebuilt by itself, released at once', [cur('PACK').version, cur('PACK').visible], [v + 1, true]);

/* ── 6. Payments and the receipt ───────────────────────────────────────────── */
const pay = await post({ action: 'record-payment', amount_pence: 900000, paid_on: '2026-11-10', method: 'bank_transfer', reference: 'INV-0042', kind: 'final' });
eq('payment recorded, Final invoice paid ticked', [pay.status, globalThis.__rec.rpc.some(([n, k]) => n === 'crm_checklist_set' && k === 'x_paid')], [200, true]);
const receipt = cur('CC13_RECEIPT');
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
const OWN = ['F78', 'F19I', 'F16E', 'CC4', 'F48I', 'F49', 'F49A', 'F47', 'F76_SHEET', 'CC13_RECEIPT', 'F07BI', 'PACK'];
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
const receiptNow = cur('CC13_RECEIPT');
eq('a copy behind what it’s made from has no print version', await H.handoverDocPrint(db, { ...refOf(receiptNow), hash: 'something else' }), 'changed');
eq('nor a pack behind its documents', await H.packPrint(db, { ...refOf(cur('PACK')), hash: 'something else' }, async () => null), 'changed');

if (process.env.PDF_OUT) fs.writeFileSync(`${process.env.PDF_OUT}/PACK-server.pdf`, db.files.get(`crm-docs/${cur('PACK').storage_path}`));
console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);
