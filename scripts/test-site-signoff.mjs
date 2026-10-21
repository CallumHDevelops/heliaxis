// Signing off (src/lib/site/signoff.ts, POST /api/site/jobs/<id>/signoff) against an in-memory stand-in
// for the database: the same sign-off sent three times makes one site_signoffs row, one PO, one email
// and one WhatsApp; the server's gate turns down what hasn't reached it; a PO with no rate is held,
// then issued once the rate is in; the scaffold PO waits for the strike when the owner says so (and
// no second PO); a reopen keeps the PO, and a re-sign that changes the money marks it changed since
// sent with what went left as it went; the old op after a reopen is not a new sign-off; and the
// Orders summary keeps labour out of "Kit ordered".
// Usage: node --experimental-strip-types scripts/test-site-signoff.mjs
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
  '@/lib/schema-ready': 'export async function schemaReady() { return { site: true, purchaseOrders: true }; }',
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
globalThis.__rec = { email: [], whatsapp: [], notify: [], tasks: [], orders: [], activity: [] };
const db = (globalThis.__db = fakeDb());

const route = await import('../src/app/api/site/jobs/[id]/signoff/route.ts');
const S = await import('../src/lib/site/signoff.ts');
const L = await import('../src/lib/site/labour-po.ts');
const { summariseOrders } = await import('../src/lib/purchase-orders/shared.ts');

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

/* ── A job, a roofer and the phone ─────────────────────────────────────────── */
const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const TOKEN = 'phone-token-for-the-roofer-0123456789';
const project = { id: randomUUID(), enquiry_id: randomUUID(), owner_id: 'owner-1', project_ref: 'HX-0042', address: '12 High Street\nMaindee, Newport', postcode: 'NP20 4AB', products: ['solar'], system: { kwp: 7.2, panel_count: 16, panel_model: 'Aiko Neostar 2P 450W', strings_design: [8, 8] }, scaffold_up_on: null, scaffold_down_on: null };
db.rows('crm_projects').push(project);
db.rows('enquiries').push({ id: project.enquiry_id, name: 'Jane Smith', postcode: 'NP20 4AB', customer_ref: null });
db.rows('crm_surveys').push({ id: randomUUID(), project_id: project.id, type: 'solar', status: 'complete', updated_at: '2026-10-01', answers: { S1: ['front', 'rear'] } });
const contact = { id: randomUUID(), subcontractor_id: null, name: 'Dave Price', company: 'Price Roofing', email: 'dave@example.test', mobile: '07700 900123', wa_id: '447700900123', whatsapp_ok: true, vat_number: null, cis_rate: 'net', cis_verified_on: '2026-01-10', archived_at: null };
db.rows('site_contacts').push(contact);
db.rows('site_devices').push({ id: randomUUID(), contact_id: contact.id, token_hash: createHash('sha256').update(TOKEN).digest('hex'), last_seen_at: new Date().toISOString(), expires_at: '2099-01-01T00:00:00Z', revoked_at: null });
const settings = (s) => {
  db.t.cms_kv = [{ key: 'site-settings', value: JSON.stringify(s) }];
};

const wrap = (vals) => Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, { v, src: 'typed', at: '2026-11-03T10:00:00Z' }]));
const roofDone = { RF5: 'no', RF13: 'Aiko Neostar 2P 450W', RF14: 49.6, RX1: 'yes', RF10: 2, RF11: [8, 8], RX5: 16, RF6: 'yes', RF7: 'no', RF8: 'yes', RF9: true, RX4: 'yes', RF4: 'no', RX2: 'yes', RX3: 'no', RX6: 'no', RX8: 'yes', RX9: 'no' };
const roofPhotos = { RF1: 2, RF12: 1, RF2: 2, RX4p: 1, RF3: 3 };
const scaffUp = { SC1: 'no', SC2: 'yes', SC3: 'yes', SC4: 'yes', SCX2: 'no', SCX3: 'no', SCX4: 'yes' };
const scaffUpPhotos = { 'SCX1:front': 1, 'SCX1:rear': 1, SC3p: 1 };

function assignment(trade, answers, photos, extra = {}) {
  const a = {
    id: randomUUID(), project_id: project.id, contact_id: contact.id, trade, trade_label: null, scope: null, forms: [], cert_route: 'eic', starts_on: '2026-11-03', days: 1,
    rate_pence: 3000, rate_basis: 'per_panel', rate_qty: null, raise_po: true, vat_treatment: 'none', vat_note: null, cis_override: null, share_customer_phone: false, note_to_trade: null,
    status: 'started', link_hash: null, link_generation: 1, link_created_at: null, sent_at: null, opened_at: null, started_at: null, signed_at: null, done_at: null, cancelled_at: null,
    answers: wrap(answers), rev: 7, answers_saved_at: null, flags: [], schema_version: 1, created_by: null, ...extra,
  };
  db.rows('site_assignments').push(a);
  for (const [slot, n] of Object.entries(photos)) for (let i = 0; i < n; i++) db.rows('crm_photos').push({ id: randomUUID(), assignment_id: a.id, slot, storage_path: `site/${a.id}/${slot}-${i}.jpg`, taken_at: null });
  return a;
}
const sign = async (a, body) => {
  const req = new Request(`http://localhost/api/site/jobs/${a.id}/signoff`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Dave Price', signature: SIG, declaration: 'I confirm…', signed_at: new Date().toISOString(), rev: 7, ...body }) });
  const res = await route.POST(req, { params: Promise.resolve({ id: a.id }) });
  return { status: res.status, body: await res.json() };
};
// The work after the reply (Next runs it once the response has gone).
const afterReply = async () => {
  const list = globalThis.__after.splice(0);
  for (const fn of list) await fn();
};
const rowsFor = (table, a) => db.rows(table).filter((r) => r.assignment_id === a.id);
const poOf = (a) => db.rows('purchase_orders').find((p) => p.assignment_id === a.id && p.status !== 'cancelled');

/* ── The roofer signs, and the phone sends it three times ──────────────────── */
settings({});
const roof = assignment('roofer', roofDone, roofPhotos);
const op = randomUUID();
const r1 = await sign(roof, { op_id: op, stage: 'main' });
eq('signed: 200 with the PO number and "on its way"', [r1.status, r1.body.po?.po_number, r1.body.po_next, r1.body.again], [200, 'PO-0001', 'sending', false]);
eq('roofer goes to done', db.rows('site_assignments').find((x) => x.id === roof.id).status, 'done');
// The work after the reply fails part-way (no key for the trade's link yet): the PO is issued but
// nothing has gone, and the step isn't stamped, so the cron finishes it.
delete process.env.SITE_LINK_SECRET;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const quiet = console.error;
console.error = () => {};
await afterReply();
console.error = quiet;
const so0 = rowsFor('site_signoffs', roof)[0];
eq('a step that failed is left for the cron', [!!so0.po_done_at, !!so0.docs_done_at, !!so0.notified_at, rowsFor('site_messages', roof).length], [false, true, true, 0]);
process.env.SITE_LINK_SECRET = 'a-test-key-for-site-links-0123456789abcdef';
await S.finishSignoff(db, so0.id);
const r2 = await sign(roof, { op_id: op, stage: 'main' });
await afterReply();
const r3 = await sign(roof, { op_id: randomUUID(), stage: 'main' });
await afterReply();
eq('a retry gets the first result', [r2.status, r2.body.signoff.id === r1.body.signoff.id, r2.body.again, r3.body.signoff.id === r1.body.signoff.id], [200, true, true, true]);
eq('one site_signoffs row', rowsFor('site_signoffs', roof).length, 1);
eq('one PO', db.rows('purchase_orders').filter((p) => p.assignment_id === roof.id).length, 1);
const msgs = rowsFor('site_messages', roof);
eq('one email and one WhatsApp queued, both sent once', [msgs.filter((m) => m.channel === 'email').length, msgs.filter((m) => m.channel === 'whatsapp').length, globalThis.__rec.email.length, globalThis.__rec.whatsapp.length], [1, 1, 1, 1]);
const po = poOf(roof);
eq('PO money: £30.00 × 16, no VAT, CIS net 20%', [po.net_pence, po.vat_pence, po.cis_pence, po.payable_pence], [48000, 0, 9600, 38400]);
eq('the PO says where the quantity came from', po.labour.rate_words, '£30.00 per panel × 16 panels (as signed by the roofer)');
eq('issued (version 1) and marked sent once it reached them', [po.status, po.labour.version, !!po.sent_at, po.sent_to], ['sent', 1, true, 'dave@example.test']);
eq('the email has the PDF attached and the PO number in the subject', [globalThis.__rec.email[0].attachments?.[0]?.filename, /PO-0001/.test(globalThis.__rec.email[0].subject), globalThis.__rec.email[0].idempotencyKey], ['PO-0001.pdf', true, `site-po:${po.id}:v1:email`]);
eq('the WhatsApp is the PO template', globalThis.__rec.whatsapp[0].name, 'site_po_raised');
const docs = db.rows('crm_documents').filter((d) => d.project_id === project.id);
eq('the PO PDF is stored as a document (category po, not visible) and the roofer report too', docs.map((d) => [d.generated_key, d.category, d.visible]).sort(), [['PO-0001', 'po', false], ['RF_REPORT', 'commissioning', false]]);
const so = rowsFor('site_signoffs', roof)[0];
eq('every step after the reply stamped (the cron finished the PO)', [!!so.po_done_at, !!so.docs_done_at, !!so.notified_at], [true, true, true]);
eq('signature stored at signatures/<project>/site-<id>.png', [so.signature_path, db.files.has(`crm-docs/${so.signature_path}`)], [`signatures/${project.id}/site-${so.id}.png`, true]);
eq('the answers hash covers the answers and the photos', [so.answers_hash.length, so.extra.photos.length], [64, 9]);
eq('the job owner is told once, with the PO and what it pays', globalThis.__rec.notify.map((n) => n.title), ['Roofer signed off at 12 High Street, NP20 4AB · PO-0001 · £384.00 to pay']);
eq('the op is remembered', db.rows('site_ops').some((x) => x.op_id === op && x.kind === 'signoff'), true);

/* ── The server's gate: what hasn't reached it can't be signed ─────────────── */
const short = assignment('roofer', roofDone, { ...roofPhotos, RF3: 1 });
const g = await sign(short, { op_id: randomUUID(), stage: 'main' });
eq('a photo still on the phone: 422 with what is missing, nothing signed', [g.status, g.body.error, g.body.missing.map((m) => m.key), rowsFor('site_signoffs', short).length], [422, 'gate', ['RF3'], 0]);
eq('…and no PO', poOf(short), undefined);

/* ── No rate: held, then issued once the rate is in ────────────────────────── */
const norate = assignment('roofer', roofDone, roofPhotos, { rate_pence: null, rate_basis: null });
const h = await sign(norate, { op_id: randomUUID(), stage: 'main' });
await afterReply();
eq('held: the phone hears "once the office has checked one thing"', [h.body.po_next, poOf(norate).status, poOf(norate).labour.held], ['held', 'draft', ['rate']]);
const emails = globalThis.__rec.email.length;
eq('a held PO sends nothing', emails, 1);
Object.assign(db.rows('site_assignments').find((x) => x.id === norate.id), { rate_pence: 2800, rate_basis: 'per_panel' });
const fresh = await L.refreshDraftPo(db, (await import('../src/lib/site/server.ts')).assignmentRow(db.rows('site_assignments').find((x) => x.id === norate.id)));
eq('the rate in: worked out again, nothing held', [fresh.labour.held, fresh.payable_pence], [[], 35840]);
const issued = await L.issueLabourPo(db, fresh.id, { by: 'staff-1' });
eq('Issue sends it', [issued.ok, globalThis.__rec.email.length, poOf(norate).status], [true, 2, 'sent']);

/* ── The scaffold: PO held until the strike (owner's setting), no second PO ── */
settings({ holdScaffoldPoUntilStrike: true });
const scaff = assignment('scaffolder', scaffUp, scaffUpPhotos, { rate_pence: 45000, rate_basis: 'fixed' });
const up = await sign(scaff, { op_id: randomUUID(), stage: 'erection' });
await afterReply();
eq('erection: signed (up), PO held for the strike', [up.body.status, up.body.po_next, poOf(scaff).labour.held], ['signed', 'held', ['scaffold']]);
eq('the scaffold-up date goes on the job', /^\d{4}-\d{2}-\d{2}$/.test(db.rows('crm_projects')[0].scaffold_up_on ?? ''), true);
const sa = db.rows('site_assignments').find((x) => x.id === scaff.id);
Object.assign(sa.answers, wrap({ SS1: 'yes', SS3: 'no', SS4: 'yes' }));
for (const side of ['front', 'rear']) db.rows('crm_photos').push({ id: randomUUID(), assignment_id: scaff.id, slot: `SS2:${side}`, storage_path: `site/${scaff.id}/SS2-${side}.jpg`, taken_at: null });
const down = await sign(scaff, { op_id: randomUUID(), stage: 'strike' });
await afterReply();
eq('strike: done, the PO goes now', [down.status, down.body.status, down.body.po_next, poOf(scaff).status], [200, 'done', 'sending', 'sent']);
eq('no second PO for the strike', db.rows('purchase_orders').filter((p) => p.assignment_id === scaff.id).length, 1);
eq('the scaffold-down date goes on the job (only where empty)', !!db.rows('crm_projects')[0].scaffold_down_on, true);

/* ── Reopen and sign again ─────────────────────────────────────────────────── */
settings({});
const { assignmentRow } = await import('../src/lib/site/server.ts');
const reopened = await S.reopenSignoff(db, assignmentRow(db.rows('site_assignments').find((x) => x.id === roof.id)), 'staff-1', 'Office');
eq('reopen: the sign-off goes, the status is started again, the PO stays', [reopened.ok, rowsFor('site_signoffs', roof).length, db.rows('site_assignments').find((x) => x.id === roof.id).status, poOf(roof).status], [true, 0, 'started', 'sent']);
const old = await sign(roof, { op_id: op, stage: 'main' });
eq('the first op again after a reopen is not a new sign-off', [old.status, old.body.error, rowsFor('site_signoffs', roof).length], [409, 'reopened', 0]);
db.rows('site_assignments').find((x) => x.id === roof.id).answers.RX5 = { v: 18, src: 'typed' };
const again = await sign(roof, { op_id: randomUUID(), stage: 'main' });
await afterReply();
const after = poOf(roof);
eq('re-signed with 18 panels: the same PO, marked changed since sent', [again.status, after.po_number, after.changed_since_sent, db.rows('purchase_orders').filter((p) => p.assignment_id === roof.id).length], [200, 'PO-0001', true, 1]);
eq('what went stays as it went until Issue again', [after.labour.qty, after.payable_pence, globalThis.__rec.email.filter((m) => /PO-0001/.test(m.subject)).length], [16, 38400, 1]);
eq('the phone hears it waits for the office', again.body.po_next, 'held');
const v2 = await L.issueLabourPo(db, after.id, { by: 'staff-1', override: true });
eq('Issue again: version 2, 18 panels, replaces the first', [v2.ok, poOf(roof).labour.version, poOf(roof).labour.qty, poOf(roof).labour.replaces !== null, poOf(roof).changed_since_sent], [true, 2, 18, true, false]);

/* ── Orders: labour isn't "Kit ordered" ────────────────────────────────────── */
const sum = summariseOrders([
  { status: 'sent', net_pence: 120000, required_by: '2026-11-03', kind: 'supply' },
  { status: 'sent', net_pence: 48000, required_by: null, kind: 'labour', payable_pence: 38400 },
  { status: 'draft', net_pence: 0, required_by: null, kind: 'labour', payable_pence: null },
  { status: 'cancelled', net_pence: 9000, required_by: null, kind: 'labour', payable_pence: 9000 },
]);
eq('Kit ordered leaves labour out; Labour counts what it pays', [sum.count, sum.orderedNet, sum.open, sum.labour], [1, 120000, 1, { count: 2, held: 1, payable: 38400 }]);
eq('rows from before the labour columns are all kit', summariseOrders([{ status: 'sent', net_pence: 100, required_by: null }]).labour, { count: 0, held: 0, payable: 0 });

// The trade reports' and labour POs' print versions (documents/print.ts): the same words as the stored copies.
{
  const RP = await import('../src/lib/site/reports.ts');
  const LP = await import('../src/lib/site/labour-po.ts');
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const ref = (d) => ({ projectId: d.project_id, key: d.generated_key, hash: d.inputs_hash, madeAt: d.created_at });
  const flatText = async (b) => {
    const doc = await pdfjs.getDocument({ data: new Uint8Array(b), useSystemFonts: false, disableFontFace: true }).promise;
    const out = [];
    for (let i = 1; i <= doc.numPages; i++) out.push((await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str).join(' '));
    return out;
  };
  const stored = db.rows('crm_documents').filter((d) => !d.archived_at && /^(RF_REPORT|SC_REPORT|PO-\d+)$/.test(d.generated_key ?? ''));
  const same = [];
  for (const d of stored) {
    const b = d.generated_key.startsWith('PO-') ? await LP.labourPoPrint(db, ref(d)) : await RP.tradeReportPrint(db, ref(d));
    if (!(b instanceof Uint8Array)) continue;
    if (JSON.stringify(await flatText(b)) === JSON.stringify(await flatText(db.files.get(`crm-docs/${d.storage_path}`)))) same.push(`${d.generated_key}:${d.project_id}`);
    if (process.env.PDF_OUT) (await import('node:fs')).writeFileSync(`${process.env.PDF_OUT}/${d.storage_path.split('/').pop().replace(/\.pdf$/, '')} (print).pdf`, b);
  }
  eq('the reports and POs: print versions with the same words as the stored copies', [stored.length > 1, same.sort()], [true, stored.map((d) => `${d.generated_key}:${d.project_id}`).sort()]);
}

// PDF_OUT=/some/dir keeps the PDFs made (the POs and the trade reports) to look at.
if (process.env.PDF_OUT) {
  const fs = await import('node:fs');
  for (const [k, v] of db.files) if (k.endsWith('.pdf')) fs.writeFileSync(`${process.env.PDF_OUT}/${k.split('/').pop()}`, v);
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
