// The handover pack and what the customer may see (round-1 review, security and data-money): a
// document hidden from the portal by hand is left out of the combined PDF, and once the pack has gone
// hiding it rebuilds the pack without it (showing it again puts it back); a document held to go with
// the pack is still in it; and removing a final payment typed by mistake unticks "Final invoice paid"
// unless another final payment is left (a stage payment changes nothing).
// Usage: node --experimental-strip-types scripts/test-handover-hidden.mjs
import { randomUUID } from 'node:crypto';
import * as kit from './site-test-kit.mjs';

const SRC = new URL('../src/', import.meta.url).href;
const db = kit.setup({
  '@/lib/crm/server': `
    export const DOCS_BUCKET = 'crm-docs'; export const CRM_BUCKET = 'crm-photos'; export const MAX_DOC_BYTES = 25 * 1024 * 1024;
    export const DOC_MIME = ['application/pdf', 'image/jpeg', 'image/png'];
    export const isUuid = (s) => /^[0-9a-f-]{36}$/i.test(s);
    export const thumbPath = (p) => p.replace(/\\.[a-z0-9]+$/i, '') + '.thumb.jpg';
    export const safeName = (n) => (n || 'document').replace(/[^\\w.\\- ]+/g, '').replace(/\\s+/g, '-').slice(0, 80) || 'document';
    export async function ensureDocsBucket() {} export async function fingerprintDocument() { return null; }
    export async function docCategoryOf(v, fallback = 'other') { return typeof v === 'string' && v ? v : fallback; }
    export async function logActivity(a) { globalThis.__rec.activity.push(a.body); }
    export async function ensurePortalToken() { return 'portal-token-0123456789'; }
    export const portalUrl = (t) => 'https://heliaxis.test/my/' + t;
    export async function signedDoc(p) { return 'https://storage.test/' + p; }
    export const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    export async function crmSession() { return { user: { id: 'staff-1' }, profile: { full_name: 'Sarah Office', role: 'admin' } }; }`,
  '@/lib/crm/portal': `export const SIGNABLE_CATEGORIES = ['quote', 'contract'];`,
  '@/lib/crm/move-stage': `export async function moveStage() { return { moved: false }; }`,
  '@/lib/projects/server': `
    export const projectRow = (raw) => ({ ...raw, products: raw.products ?? [], checklist: raw.checklist ?? {}, paperwork: raw.paperwork ?? {}, system: raw.system ?? {}, reminders_sent: [] });
    import { addWorkingDays, ukDay } from '${SRC}lib/bank-holidays.ts';
    export async function calendarNow() { return { today: '2026-11-03', hols: new Set(), addWorkingDays, ukDay }; }
    export async function syncEnquiryStatus() {}`,
  '@/lib/schema-ready': 'export async function schemaReady() { return { site: true, handover: true, purchaseOrders: true }; }',
  '@/lib/whatsapp/inbox': `export async function sendSystem() { return { ok: true }; }`,
  '@/lib/ms365': `export const msConfigured = () => false; export async function sendMail() {}`,
  '@/lib/subcontractors/pdf-engine': `export async function buildPdf(files) { return { bytes: files[0].bytes, keptOriginal: true }; }`,
  '@/lib/handover/read': `export async function readMcsNumber() { return null; }`,
});
const { eq } = kit;
const H = await import('../src/lib/handover/server.ts');
const S = await import('../src/lib/handover/slots.ts');
const D = await import('../src/lib/handover/settings-shared.ts');
const K = await import('../src/lib/documents/pdf-kit.ts');
const route = await import('../src/app/api/crm/projects/[id]/handover/route.ts');
const docRoute = await import('../src/app/api/crm/documents/[id]/route.ts');

/* ── A solar job with two documents uploaded into the pack ─────────────────── */

const pid = randomUUID();
const enq = randomUUID();
db.rows('crm_projects').push({
  id: pid, enquiry_id: enq, owner_id: 'owner-1', title: 'Solar', stage: 'installing', project_ref: 'HX-0042', address: '12 High Street, Maindee, Newport', postcode: 'NP20 4AB', products: ['solar'],
  install_at: '2026-11-02T08:00:00Z', install_days: 1, commissioned_at: '2026-11-03T16:00:00Z', handover_at: null, value: 6500, deposit_amount: 500, deposit_paid_at: '2026-10-05T10:00:00Z',
  dno_status: 'not_started', portal_token: 'portal-token-0123456789', checklist: {}, paperwork: { dno_route: 'g98' },
  system: { kwp: 4.4, panel_count: 10, panel_model: 'JA Solar JAM54S30 440', inverter_model: 'GivEnergy Gen 3 5 kW', inverter_kw: 5, mpan: '1012345678901', est_kwh_year: 3900, shade_factor: 1, roof_faces: 'Rear roof' },
});
db.rows('enquiries').push({ id: enq, name: 'Jane Smith', email: 'jane@example.test', phone: '07700 900123', postcode: 'NP20 4AB' });
db.rows('profiles').push({ id: 'staff-1', full_name: 'Sarah Office', email: 'sarah@heliaxis.co.uk' });
db.t.cms_kv = [{ key: 'handover-settings', value: JSON.stringify({ approved: Object.fromEntries(Object.entries(D.DRAFTS).map(([k, d]) => [k, { version: d.version, at: '2026-10-01T09:00:00Z', by: 'Callum' }])), warrantyYears: 10, warrantyStart: 'commissioning', warrantyText: 'FIXTURE WORDING.', nextInspectionYears: 10 }) }];

// Two items the office uploads into (whatever the catalogue calls them).
const [slotA, slotB, slotC] = S.UPLOAD_PICKS.filter((s) => s.maker === 'office').map((s) => s.code);
const pdf = async (title) => {
  const k = await K.newDocument({ code: 'X', title, jobRef: 'HX-0042', issued: '2026-11-03' });
  k.header();
  return k.save();
};
const addDoc = async (slot, name, extra = {}) => {
  const id = randomUUID();
  const path = `projects/${pid}/${id}.pdf`;
  db.files.set(`crm-docs/${path}`, await pdf(name));
  db.rows('crm_documents').push({ id, project_id: pid, category: 'other', name: `${name}.pdf`, storage_path: path, mime: 'application/pdf', size: 1, visible: true, created_at: new Date().toISOString(), handover_slot: slot, release: 'now', source: 'upload', generated_key: null, version: 1, inputs_hash: null, archived_at: null, ...extra });
  return id;
};
const right = await addDoc(slotA, 'The right certificate');
const wrong = await addDoc(slotB, 'Another customer’s invoice');
const heldDoc = await addDoc(slotC, 'Held for the pack', { visible: false, release: 'with_pack' });
const post = async (body) => {
  const r = await route.POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id: pid }) });
  return { status: r.status, body: await r.json() };
};
const packRow = () => db.rows('handover_packs').find((x) => x.project_id === pid);
const inPdf = () => (packRow()?.contents ?? []).map((c) => c.document_id);
const packDoc = () => db.rows('crm_documents').find((d) => d.project_id === pid && d.generated_key === 'PACK' && !d.archived_at);

/* ── Hidden by hand before the pack goes ───────────────────────────────────── */

await post({ action: 'visible', doc: wrong, visible: false });
const b1 = await post({ action: 'build' });
eq('built: the hidden document isn’t in the combined PDF; the shown one and the held one are', [b1.status, inPdf().includes(wrong), inPdf().includes(right), inPdf().includes(heldDoc)], [200, false, true, true]);

/* ── Hidden after the pack has gone ────────────────────────────────────────── */

await post({ action: 'visible', doc: wrong, visible: true });
eq('shown again before it goes: the pack is behind, so it’s rebuilt at Send (not yet)', [packDoc().version, (await H.handoverView(db, pid)).pack.behind], [1, true]);
await post({ action: 'build' });
eq('built again: it’s in', inPdf().includes(wrong), true);
packRow().sent_at = new Date().toISOString();
Object.assign(packDoc(), { visible: true, release: 'now' });
const v = packDoc().version;
const hid = await post({ action: 'visible', doc: wrong, visible: false });
eq('the pack had gone: hiding it rebuilds the pack without it, at once', [hid.status, packDoc().version, inPdf().includes(wrong), inPdf().includes(right)], [200, v + 1, false, true]);
eq('…the new pack is in their portal, the old one archived', [packDoc().visible, db.rows('crm_documents').filter((d) => d.project_id === pid && d.generated_key === 'PACK' && d.archived_at).length >= 1], [true, true]);
await post({ action: 'refresh' });
eq('a later refresh leaves it out (no rebuild with it back in)', [packDoc().version, inPdf().includes(wrong)], [v + 1, false]);
// From the Docs tab too.
const viaDocs = await docRoute.PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify({ visible: true }) }), { params: Promise.resolve({ id: wrong }) });
eq('shown again from the Docs tab: the pack follows', [viaDocs.status, packDoc().version, inPdf().includes(wrong)], [200, v + 2, true]);

/* ── A final payment removed ───────────────────────────────────────────────── */

const job = () => db.rows('crm_projects').find((p) => p.id === pid);
const pay = (kind, amount_pence) => post({ action: 'record-payment', amount_pence, paid_on: '2026-11-10', method: 'bank_transfer', reference: 'INV-0042', kind });
await pay('final', 600000);
const p1 = db.rows('crm_payments').find((p) => p.project_id === pid);
eq('a final payment ticks "Final invoice paid", saying which payment', [!!job().checklist.x_paid?.done_at, job().checklist.x_paid?.payment], [true, p1.id]);
const del = await post({ action: 'delete-payment', payment: p1.id });
eq('removing it (typed by mistake) unticks it', [del.status, job().checklist.x_paid ?? null, db.rows('crm_payments').some((p) => p.id === p1.id)], [200, null, false]);
eq('…and the timeline says so', globalThis.__rec.activity.includes('A recorded final payment was removed, so “Final invoice paid” is unticked'), true);
await pay('final', 300000);
await pay('final', 300000);
const [f1] = db.rows('crm_payments').filter((p) => p.project_id === pid && p.kind === 'final');
await post({ action: 'delete-payment', payment: f1.id });
eq('two final payments, one removed: still ticked', !!job().checklist.x_paid, true);
await pay('stage', 100000);
await post({ action: 'delete-payment', payment: db.rows('crm_payments').find((p) => p.project_id === pid && p.kind === 'stage').id });
eq('a stage payment removed: still ticked', !!job().checklist.x_paid, true);
const f2 = db.rows('crm_payments').find((p) => p.project_id === pid && p.kind === 'final');
job().checklist = { ...job().checklist, x_paid: { done_at: '2026-11-01T10:00:00Z', by_id: 'staff-1', by: 'Office', na: true } };
await post({ action: 'delete-payment', payment: f2.id });
eq('"Not needed" ticked by hand is left alone', job().checklist.x_paid?.na, true);

kit.done();
