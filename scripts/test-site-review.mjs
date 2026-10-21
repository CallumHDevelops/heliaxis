// The office's review after the PO (owner, 21 Oct; src/lib/site/returns.ts, review-shared.ts,
// declaration.ts, po-shared.ts PO_TERMS) against an in-memory stand-in for the database, at a time the
// evening rule would hold messages: the PO's terms and the declarations word for word; the roofer
// signs, the PO goes at once with the terms on its PDF, its email and the phone's copy, the sign-off
// waits for review with a task for the job owner due the next working day; Return to site sends the
// written notice at once by email and WhatsApp, puts the PO on hold and opens the put right's photo
// slot; the trade's Put right needs a photo, keeps the declaration as signed, comes back for review
// with its own task, and a retry changes nothing; Return to site again; Green light lifts the hold
// and tells the trade (through the evening rule); the trade's report carries it all; a reopen
// withdraws a live return; and the pure states, words and timing.
// Usage: node --experimental-strip-types scripts/test-site-review.mjs   (PDF_OUT=/dir keeps the PDFs)
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
    export async function ensureCrmBucket() {} export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
    export async function logActivity(a) { globalThis.__rec.activity.push(a); }
    export const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    export async function crmSession() { return { user: { id: 'staff-1', email: 'office@heliaxis.co.uk' }, profile: { full_name: 'Office' } }; }
    export async function signedDoc(path) { return 'https://storage.test/' + path; } export async function docCategoryOf(v, f = 'other') { return v || f; }
    export async function ensurePortalToken() { return 't'; } export const portalUrl = (t) => 'https://heliaxis.test/my/' + t; export const safeName = (n) => n;`,
  // The documents route's and the handover's own imports, not what's tested here.
  '@/lib/crm/portal': "export const SIGNABLE_CATEGORIES = ['quote', 'contract'];",
  '@/lib/whatsapp/inbox': 'export async function sendSystem() { return { ok: true }; }',
  '@/lib/ms365': 'export const msConfigured = () => false; export async function sendMail() {} export const mailbox = () => null;',
  '@/lib/crm/move-stage': 'export async function moveStage() { return { moved: false }; }',
  '@/lib/projects/server': `export const projectRow = (raw) => ({ ...raw, products: raw.products ?? [], checklist: raw.checklist ?? {}, paperwork: raw.paperwork ?? {}, system: raw.system ?? {}, reminders_sent: [] });
    export async function calendarNow() { return { today: new Date().toISOString().slice(0, 10), hols: new Set() }; } export async function ensureDeadlineTasks() { return 0; }`,
  '@/lib/notify': 'export async function notify(n) { globalThis.__rec.notify.push(n); }',
  // The photos route's after-photo work (flags, Claude's label reads) isn't what's tested here.
  '@/lib/site/hooks': 'export async function lateKeysFor() { return []; } export async function afterAnswers(db, a) { return a.flags; } export async function afterPhoto() {}',
  '@/lib/schema-ready': 'export async function schemaReady() { return { site: true, purchaseOrders: true }; }',
  '@/lib/surveys/server': `
    export async function addSourceTask(db, t) { if (globalThis.__rec.tasks.some((x) => x.key === t.key)) return false; globalThis.__rec.tasks.push(t); return true; }
    export async function closeSourceTask() {}`,
  '@/lib/purchase-orders/server': 'export async function logOrder(db, o, event, body) { globalThis.__rec.orders.push({ event, body }); }',
  // Quiet hours around this very minute, so "the evening" is now: POs and return-to-site notices go anyway.
  '@/lib/whatsapp/settings': `export async function getSettings() { return globalThis.__wa; }`,
  '@/lib/whatsapp/api': `
    export const whatsappConfigured = () => true; export const defaultTemplate = () => ({ lang: 'en_GB' });
    export async function sendTemplate(to, name, lang, params) { globalThis.__rec.whatsapp.push({ to, name, params }); return { ok: true, data: { messages: [{ id: 'wamid.' + globalThis.__rec.whatsapp.length }] } }; }`,
  '@/lib/whatsapp/templates': `export async function fetchTemplates() { return { ok: true, items: ['site_job_pack', 'site_po_raised', 'site_strike_photos', 'site_clear_to_start', 'site_scaffold_hold', 'site_return_to_site', 'site_green_light'].map((name) => ({ name, status: 'APPROVED' })) }; }`,
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
const UNIQUE = { site_signoffs: [['assignment_id', 'stage']], purchase_orders: [['signoff_id']], site_messages: [['dedupe_key']], site_ops: [['assignment_id', 'op_id']], site_returns: [['assignment_id', 'n']], crm_photos: [['storage_path']] };
function fakeDb() {
  const t = {};
  const rows = (name) => (t[name] ??= []);
  const files = new Map();
  let poNo = 0;
  const now = () => new Date().toISOString();
  const defaults = (table, r) => {
    const base = { id: r.id ?? randomUUID(), created_at: now(), updated_at: now() };
    if (table === 'purchase_orders') return { ...base, po_number: `PO-${String(++poNo).padStart(4, '0')}`, status: 'draft', changed_since_sent: false, sent_at: null, sent_to: null, paid_on: null, cancelled_at: null, ...r };
    if (table === 'site_signoffs') return { ...base, received_at: now(), po_done_at: null, docs_done_at: null, notified_at: null, flags: [], extra: {}, review_status: 'waiting', reviewed_at: null, reviewed_by: null, ...r };
    if (table === 'site_returns') return { ...base, status: 'open', photo_ids: [], notice: null, notice_sent_at: null, fixed_at: null, fixed_note: null, fixed_name: null, fixed_signature_path: null, fixed_declaration: null, reviewed_at: null, reviewed_by: null, ...r };
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
      createSignedUploadUrl: async (path) => ({ data: { signedUrl: `https://storage.test/upload/${bucket}/${path}`, path, token: 't' }, error: null }),
    }),
    getBucket: async () => ({ data: {} }),
    createBucket: async () => ({}),
  };
  return { t, rows, files, from, storage, rpc: async () => ({ data: null, error: { message: 'no rpc' } }) };
}

// "The evening" is now: quiet hours from an hour ago to an hour from now (UK clock).
const ukMin = (() => {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  return Number(p.find((x) => x.type === 'hour').value) * 60 + Number(p.find((x) => x.type === 'minute').value);
})();
globalThis.__wa = { quietFromMin: (ukMin + 1380) % 1440, quietToMin: (ukMin + 60) % 1440 };
// No network: gov.uk's bank holidays fall back to none.
globalThis.fetch = async () => {
  throw new Error('offline in the test');
};
globalThis.__after = [];
globalThis.__rec = { email: [], whatsapp: [], notify: [], tasks: [], orders: [], activity: [] };
const db = (globalThis.__db = fakeDb());

const signRoute = await import('../src/app/api/site/jobs/[id]/signoff/route.ts');
const putRoute = await import('../src/app/api/site/jobs/[id]/put-right/route.ts');
const photoRoute = await import('../src/app/api/site/jobs/[id]/photos/route.ts');
const S = await import('../src/lib/site/signoff.ts');
const RT = await import('../src/lib/site/returns.ts');
const RV = await import('../src/lib/site/review.ts');
const RS = await import('../src/lib/site/review-shared.ts');
const D = await import('../src/lib/site/declaration.ts');
const PS = await import('../src/lib/site/po-shared.ts');
const M = await import('../src/lib/site/messages.ts');
const { assignmentRow } = await import('../src/lib/site/server.ts');
const { addWorkingDays, ukDay } = await import('../src/lib/bank-holidays.ts');
const { ROOFER } = await import('../src/lib/site/forms/roofer.ts');
const { SCAFFOLD_UP, SCAFFOLD_DOWN } = await import('../src/lib/site/forms/scaffold.ts');
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
const squash = (s) => s.replace(/\s+/g, '');

/* ── The owner's words, exactly (OWNER-DECISIONS 5) ─────────────────────────── */

const TERMS = [
  '1. This purchase order was raised automatically after you declared that the work at 12 High Street, Maindee, Newport, NP20 4AB is complete and correct and that your answers, photos and readings are true.',
  '2. Heliaxis will review your photos and results. If anything needs putting right, we will tell you in writing and you will need to return to site to fix it at your own cost (clause 12.3). We may hold or dispute payment on this purchase order until it is put right (clauses 4.7 and 12.4).',
  '3. It is issued under your Subcontractor Agreement with Heliaxis Limited and does not change or override any of its terms. If anything here differs from the Agreement, the Agreement applies.',
  '4. Please quote PO-0001 on your invoice and include the supporting documents the Agreement asks for (clause 4.2).',
  '5. Heliaxis may dispute or reject all or part of an invoice by telling you in writing within 7 working days of receiving it (clause 4.7). Undisputed invoices are paid within 14 days of the accepted invoice date (clause 4.3).',
  '6. CIS is deducted from the labour element only, at the rate shown (clause 5).',
];
eq('the PO terms: one constant, six terms', PS.PO_TERMS.length, 6);
eq('the PO terms, filled and numbered, word for word', PS.poTerms('12 High Street, Maindee, Newport, NP20 4AB', 'PO-0001'), TERMS);
eq('the terms’ heading', PS.PO_TERMS_TITLE, 'Terms');

const ADDR = '12 High Street, Maindee, Newport, NP20 4AB';
const declarationOf = (work) =>
  [
    'I confirm that:',
    `• ${work} at ${ADDR} is complete and was carried out to the design, the manufacturer’s instructions and the standards required by my Subcontractor Agreement with Heliaxis Limited;`,
    '• the answers, photos and readings I have given are true and accurate; and',
    '• I have told Heliaxis about any defect, damage or problem I found or caused.',
    'I understand Heliaxis will rely on this declaration to raise my purchase order and complete the customer’s certification and handover, and will review my photos and results. If anything needs putting right, I will return to site to fix it under my Subcontractor Agreement.',
  ].join('\n');
const ctx = { address: ADDR };
eq('the roofer’s declaration', ROOFER.sig.declaration(ctx), declarationOf('the roofing work'));
eq('the scaffolder’s, up and down', [SCAFFOLD_UP.sig.declaration(ctx), SCAFFOLD_DOWN.sig.declaration(ctx)], [declarationOf('the scaffolding work'), declarationOf('the scaffolding work')]);
eq('the electrician’s', D.tradeDeclaration('electrician', ADDR), declarationOf('the electrical work'));
eq('a put right’s: "the work to put right {what} at {address}", what the office wrote in quotes', D.putRightDeclaration('Two tiles left lifted.\nDress them back flat.', ADDR), declarationOf('the work to put right “Two tiles left lifted. Dress them back flat.”'));
eq('…nothing written: "what Heliaxis asked for"', D.whatWords('  '), 'what Heliaxis asked for');
eq('no address: "this address"', D.tradeDeclaration('roofer', '').includes('the roofing work at this address is complete'), true);

/* ── States (review-shared.ts) ─────────────────────────────────────────────── */

eq('a sign-off waits for review', RS.reviewState('waiting', null), 'waiting');
eq('return to site, with them', RS.reviewState('return', { status: 'open' }), 'open');
eq('return to site, put right and back for review', RS.reviewState('return', { status: 'fixed' }), 'fixed');
eq('green light', RS.reviewState('green', null), 'green');
eq('the PO: on hold while any return is live', [RS.poReviewOf(['green', 'open']), RS.poReviewOf(['fixed']), RS.poReviewOf(['waiting', 'green']), RS.poReviewOf(['green', 'green']), RS.poReviewOf([])], ['hold', 'hold', 'waiting', 'green', null]);
eq('the PO lists’ words', [RS.PO_REVIEW_LABEL.waiting, RS.PO_REVIEW_LABEL.hold, RS.PO_REVIEW_LABEL.green], ['Waiting for review', 'On hold: return to site required', 'Green light']);
eq('the states in words', Object.values(RS.REVIEW_STATE_LABEL), ['Waiting for review', 'Return to site required', 'Put right: waiting for review', 'Green light']);
eq('the newest live return for a stage', RS.liveReturnFor([{ stage: 'main', n: 1, status: 'again' }, { stage: 'main', n: 2, status: 'open' }, { stage: 'strike', n: 3, status: 'open' }], 'main')?.n, 2);
eq('stage states from the phone’s copy', RS.stageStates([{ stage: 'erection', review: 'green' }, { stage: 'strike', review: 'return' }, { stage: 'main' }], [{ stage: 'strike', n: 1, status: 'fixed' }]).map((x) => x.state), ['green', 'fixed', 'waiting']);
eq('the review task', RS.reviewTaskTitle('Dave Price', 'roofer', 'main', 'HX-0042'), 'Review Dave Price’s roofing photos, HX-0042');
eq('…the scaffold coming down', RS.reviewTaskTitle('Sam Scaff', 'scaffolder', 'strike', 'HX-0042'), 'Review Sam Scaff’s scaffold-down photos, HX-0042');
eq('…a put right', RS.putRightTaskTitle('Dave Price', 'roofer', 'HX-0042'), 'Review Dave Price’s put right photos, HX-0042');
eq('put right photo slots', [RS.putRightSlot(2), RS.isPutRightSlot('PR:2'), RS.isPutRightSlot('RF1'), RS.isPutRightSlot('PR:x')], ['PR:2', true, false, false]);

/* ── When messages go: POs and return-to-site notices at any hour ──────────── */

const late = { quietFromMin: 1260, quietToMin: 525, lateRule: true, lateFromMin: 1230, lateSendAtMin: 420 };
const night = new Date('2026-10-21T21:40:00Z');
eq('a PO at 22:40: goes now', M.sendAfterFor('po', night, late).toISOString(), night.toISOString());
eq('a return-to-site notice at 22:40: goes now', M.sendAfterFor('return_to_site', night, late).toISOString(), night.toISOString());
eq('a job pack at 22:40: 07:00', M.sendAfterFor('job_pack', night, late).toISOString(), '2026-10-22T06:00:00.000Z');
eq('a green light at 22:40: 07:00 (it isn’t urgent)', M.sendAfterFor('green_light', night, late).toISOString(), '2026-10-22T06:00:00.000Z');

/* ── A job, a roofer and their phone ───────────────────────────────────────── */

const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const TOKEN = 'phone-token-for-the-roofer-0123456789';
const project = { id: randomUUID(), enquiry_id: randomUUID(), owner_id: 'owner-1', project_ref: 'HX-0042', address: '12 High Street\nMaindee, Newport', postcode: 'NP20 4AB', products: ['solar'], system: { kwp: 7.2, panel_count: 16, panel_model: 'Aiko Neostar 2P 450W', strings_design: [8, 8] }, scaffold_up_on: null, scaffold_down_on: null };
db.rows('crm_projects').push(project);
db.rows('enquiries').push({ id: project.enquiry_id, name: 'Jane Smith', postcode: 'NP20 4AB', customer_ref: null });
const contact = { id: randomUUID(), subcontractor_id: null, name: 'Dave Price', company: 'Price Roofing', email: 'dave@example.test', mobile: '07700 900123', wa_id: '447700900123', whatsapp_ok: true, vat_number: null, cis_rate: 'net', cis_verified_on: '2026-01-10', archived_at: null };
db.rows('site_contacts').push(contact);
const device = { id: randomUUID(), contact_id: contact.id, token_hash: createHash('sha256').update(TOKEN).digest('hex'), last_seen_at: new Date().toISOString(), expires_at: '2099-01-01T00:00:00Z', revoked_at: null };
db.rows('site_devices').push(device);
process.env.SITE_LINK_SECRET = 'a-test-key-for-site-links-0123456789abcdef';

const wrap = (vals) => Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, { v, src: 'typed', at: '2026-11-03T10:00:00Z' }]));
const roofDone = { RF5: 'no', RF13: 'Aiko Neostar 2P 450W', RF14: 49.6, RX1: 'yes', RF10: 2, RF11: [8, 8], RX5: 16, RF6: 'yes', RF7: 'no', RF8: 'yes', RF9: true, RX4: 'yes', RF4: 'no', RX2: 'yes', RX3: 'no', RX6: 'no', RX8: 'yes', RX9: 'no' };
const roofPhotos = { RF1: 2, RF12: 1, RF2: 2, RX4p: 1, RF3: 3 };
const roof = {
  id: randomUUID(), project_id: project.id, contact_id: contact.id, trade: 'roofer', trade_label: null, scope: null, forms: [], cert_route: 'eic', starts_on: '2026-11-03', days: 1,
  rate_pence: 3000, rate_basis: 'per_panel', rate_qty: null, raise_po: true, vat_treatment: 'none', vat_note: null, cis_override: null, share_customer_phone: false, note_to_trade: null,
  status: 'started', link_hash: null, link_generation: 1, link_created_at: null, sent_at: null, opened_at: null, started_at: null, signed_at: null, done_at: null, cancelled_at: null,
  answers: wrap(roofDone), rev: 7, answers_saved_at: null, flags: [], schema_version: 2, created_by: null,
};
db.rows('site_assignments').push(roof);
for (const [slot, n] of Object.entries(roofPhotos)) for (let i = 0; i < n; i++) db.rows('crm_photos').push({ id: randomUUID(), project_id: project.id, assignment_id: roof.id, slot, storage_path: `${project.id}/site/${roof.id}/${slot}-${i}.jpg`, taken_at: null });

const phone = (route, path, body) =>
  route.POST(new Request(`http://localhost/api/site/jobs/${roof.id}/${path}`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }), { params: Promise.resolve({ id: roof.id }) }).then(async (r) => ({ status: r.status, body: await r.json() }));
const afterReply = async () => {
  for (const fn of globalThis.__after.splice(0)) await fn();
};
const read = () => assignmentRow(db.rows('site_assignments').find((x) => x.id === roof.id));
const po = () => db.rows('purchase_orders').find((p) => p.assignment_id === roof.id && p.status !== 'cancelled');
const signoff = () => db.rows('site_signoffs').find((s) => s.assignment_id === roof.id);
const msgs = (kind) => db.rows('site_messages').filter((m) => m.assignment_id === roof.id && m.kind === kind);
const task = (key) => globalThis.__rec.tasks.find((t) => t.key === key);
const doc = (key) => db.rows('crm_documents').filter((d) => d.generated_key === key && !d.archived_at).sort((a, b) => (b.version ?? 1) - (a.version ?? 1))[0];
const fileOf = (d) => db.files.get(`crm-docs/${d.storage_path}`);
const office = { id: 'staff-1', name: 'Callum Office' };
const nextWorkingDay = addWorkingDays(ukDay(new Date()), 1, new Set());

/* ── The roofer signs: the PO goes at once, with the terms ─────────────────── */

const signed = await phone(signRoute, 'signoff', { op_id: randomUUID(), stage: 'main', name: 'Dave Price', signature: SIG, declaration: ROOFER.sig.declaration({ address: ADDR }), signed_at: new Date().toISOString(), rev: 7 });
await afterReply();
eq('signed: the PO is on its way (no evening hold)', [signed.status, signed.body.po_next, 'goes_at' in signed.body], [200, 'sending', false]);
eq('the PO went at once, by email and WhatsApp, though it’s "the evening"', msgs('po').map((m) => [m.channel, m.status]).sort(), [['email', 'sent'], ['whatsapp', 'sent']]);
eq('the declaration is kept with the signature, as signed', signoff().declaration, declarationOf('the roofing work'));
eq('the sign-off waits for review; so does the PO', [signoff().review_status, po().review_status], ['waiting', 'waiting']);
eq('the PO’s terms are frozen in it', po().labour.terms, TERMS);
const poEmail = globalThis.__rec.email.find((e) => /PO-0001/.test(e.subject));
eq('the PO email: the review line and the terms', [poEmail.html.includes('We’ll review your photos and results and let you know: green light, or return to site if anything needs putting right.'), TERMS.every((t) => poEmail.html.includes(t.replace(/’/g, '’')))], [true, true]);
const poPdf = await textOf(fileOf(doc('PO-0001')));
eq('the PO PDF prints the terms', [poPdf.includes('Terms'), TERMS.every((t) => squash(poPdf).includes(squash(t)))], [true, true]);
eq('the WhatsApp says it will be reviewed', globalThis.__rec.whatsapp.find((w) => w.name === 'site_po_raised')?.name, 'site_po_raised');
const t1 = task(`site-check:${signoff().id}`);
eq('the review task: for the job owner, due the next working day', [t1?.title, t1?.assigneeId, t1?.dueDate], ['Review Dave Price’s roofing photos, HX-0042', 'owner-1', nextWorkingDay]);
eq('…no separate flags task any more', globalThis.__rec.tasks.filter((t) => t.key.startsWith('site-review:')).length, 0);
const report1 = await textOf(fileOf(doc('RF_REPORT')));
eq('the roofer report prints the declaration as signed and "Waiting for review"', [squash(report1).includes(squash('I understand Heliaxis will rely on this declaration to raise my purchase order')), report1.includes('Waiting for review')], [true, true]);

/* ── Return to site required ───────────────────────────────────────────────── */

const putPhoto = (n) => phone(photoRoute, 'photos', { action: 'prepare', client_id: randomUUID(), slot: `PR:${n}`, mime: 'image/jpeg', size: 1000 });
eq('before any return to site, a put right photo is refused', (await putPhoto(1)).status, 409);
const pointTo = db.rows('crm_photos').find((p) => p.assignment_id === roof.id && p.slot === 'RF3').id;
const fixBy = addWorkingDays(ukDay(new Date()), 7, new Set());
eq('the fix-by date starts 7 working days on', await RT.fixByDefault(), fixBy);
const bad = await RT.returnToSite(db, read(), signoff().id, { what: '  ', fix_by: fixBy }, office);
eq('Return to site needs what to put right', [bad.ok, bad.error], [false, 'Say what needs putting right.']);
const past = await RT.returnToSite(db, read(), signoff().id, { what: 'Tiles', fix_by: '2020-01-01' }, office);
eq('…and a date that hasn’t passed', past.ok, false);
const emailsBefore = globalThis.__rec.email.length;
const ret1 = await RT.returnToSite(db, read(), signoff().id, { what: 'Two tiles left lifted above the left of the array.\nDress them back flat.', photo_ids: [pointTo, randomUUID()], fix_by: fixBy, safety: true }, office, 'http://localhost');
eq('return to site: saved, number 1, only their own photo pointed to', [ret1.ok, ret1.ret?.n, ret1.ret?.photo_ids, ret1.ret?.safety, ret1.ret?.status], [true, 1, [pointTo], true, 'open']);
eq('the written notice went at once by email and WhatsApp, "the evening" or not', msgs('return_to_site').map((m) => [m.channel, m.status]).sort(), [['email', 'sent'], ['whatsapp', 'sent']]);
const notice = globalThis.__rec.email.slice(emailsBefore).find((e) => /Return to site required/.test(e.subject));
eq('the notice: subject, what, by when, own cost, the PO on hold, clause 12.3', [
  notice?.subject,
  notice?.html.includes('Two tiles left lifted above the left of the array.'),
  notice?.html.includes(`put it right by ${M.dayWords(fixBy)}, at your own cost (clause 12.3)`),
  notice?.html.includes('This affects safety or the home'),
  notice?.html.includes('We may hold payment on purchase order PO-0001 until it’s put right (clauses 4.7 and 12.4).'),
  notice?.html.includes('This email is our written notice under clause 12.3 of your Subcontractor Agreement with Heliaxis Limited.'),
], ['Return to site required: roofing at 12 High Street, NP20 4AB (HX-0042)', true, true, true, true, true]);
const wa = globalThis.__rec.whatsapp.find((w) => w.name === 'site_return_to_site');
eq('the WhatsApp: what (on one line), by when, the link', [wa?.params.slice(0, 5), /\/portal\/site\/j\//.test(wa?.params[5] ?? '')], [['Dave', 'roofing work', '12 High Street, NP20 4AB', 'Two tiles left lifted above the left of the array. Dress them back flat', M.dayWords(fixBy)], true]);
const r1row = db.rows('site_returns').find((r) => r.n === 1);
eq('the notice is kept with the return, with when it reached them', [r1row.notice?.subject, !!r1row.notice_sent_at, r1row.created_by_name], ['Return to site required: roofing at 12 High Street, NP20 4AB (HX-0042)', true, 'Callum Office']);
eq('the sign-off: return; the PO: on hold', [signoff().review_status, po().review_status], ['return', 'hold']);
eq('a second return while one is open is refused', (await RT.returnToSite(db, read(), signoff().id, { what: 'More', fix_by: fixBy }, office)).ok, false);
const pack = await (await import('../src/lib/site/pack.ts')).buildPack(db, read());
eq('the phone’s pack: the return and the sign-off’s review', [pack.returns.map((r) => [r.n, r.status, r.fix_by]), pack.assignment.signoffs.map((s) => s.review), pack.po.review_status], [[[1, 'open', fixBy]], ['return'], 'hold']);
eq('the put right’s photo slot is open now (and only its own)', [(await putPhoto(1)).status, (await putPhoto(2)).status], [200, 409]);
const review1 = await RV.reviewOf(db, roof.id);
eq('the office’s review shows it, open, with the notice', [review1.review.submissions.map((s) => s.state), review1.review.returns.map((r) => [r.n, r.status, !!r.notice, r.messages.length])], [['open'], [[1, 'open', true, 2]]]);

/* ── The trade puts it right on their phone ────────────────────────────────── */

const putDecl = D.putRightDeclaration(r1row.what, ADDR);
const noPhoto = await phone(putRoute, 'put-right', { op_id: randomUUID(), n: 1, note: 'Dressed both tiles back flat.', name: 'Dave Price', signature: SIG, declaration: putDecl, signed_at: new Date().toISOString() });
eq('a put right with no photo of the fix: 422, nothing changed', [noPhoto.status, noPhoto.body.error, db.rows('site_returns').find((r) => r.n === 1).status], [422, 'gate', 'open']);
db.rows('crm_photos').push({ id: randomUUID(), project_id: project.id, assignment_id: roof.id, slot: 'PR:1', storage_path: `${project.id}/site/${roof.id}/PR_1/fix.jpg`, taken_at: new Date().toISOString() });
const noNote = await phone(putRoute, 'put-right', { op_id: randomUUID(), n: 1, note: ' ', name: 'Dave Price', signature: SIG, declaration: putDecl });
eq('…and with nothing said about what they did: 400', noNote.status, 400);
const putOp = randomUUID();
const put = await phone(putRoute, 'put-right', { op_id: putOp, n: 1, note: 'Dressed both tiles back flat.', name: 'Dave Price', signature: SIG, declaration: putDecl, signed_at: new Date().toISOString() });
await afterReply();
const r1now = () => db.rows('site_returns').find((r) => r.n === 1);
eq('put right: 200, waiting for review, the declaration kept as signed', [put.status, put.body.return.status, r1now().fixed_declaration === putDecl, r1now().fixed_signature_path, db.files.has(`crm-docs/${r1now().fixed_signature_path}`)], [200, 'fixed', true, `signatures/${project.id}/site-putright-${r1now().id}.png`, true]);
eq('its hash covers the note and the photo', r1now().fixed_hash?.length, 64);
const t2 = task(`site-check:${r1now().id}`);
eq('the put right’s review task, due the next working day', [t2?.title, t2?.dueDate, t2?.assigneeId], ['Review Dave Price’s put right photos, HX-0042', nextWorkingDay, 'owner-1']);
eq('the job owner is told', globalThis.__rec.notify.some((n) => n.title === 'Dave Price sent the put right at 12 High Street, NP20 4AB'), true);
eq('still on hold until the green light', po().review_status, 'hold');
const again = await phone(putRoute, 'put-right', { op_id: putOp, n: 1, note: 'Changed', name: 'Dave Price', signature: SIG, declaration: putDecl });
eq('the same put right again: the first reply, nothing changed', [again.status, again.body.return.status, r1now().fixed_note], [200, 'fixed', 'Dressed both tiles back flat.']);
eq('no more photos for that put right once it’s signed', (await putPhoto(1)).status, 409);

/* ── Not right yet: return to site again ───────────────────────────────────── */

const ret2 = await RT.returnToSite(db, read(), signoff().id, { what: 'One tile is still lifted at the top left.', fix_by: fixBy }, office, 'http://localhost');
eq('return to site again: number 2; the first closed as returned again', [ret2.ok, ret2.ret?.n, r1now().status, !!r1now().reviewed_at], [true, 2, 'again', true]);
eq('…a notice of its own', msgs('return_to_site').length, 4);
db.rows('crm_photos').push({ id: randomUUID(), project_id: project.id, assignment_id: roof.id, slot: 'PR:2', storage_path: `${project.id}/site/${roof.id}/PR_2/fix.jpg`, taken_at: new Date().toISOString() });
const put2 = await phone(putRoute, 'put-right', { op_id: randomUUID(), n: 2, note: 'Re-dressed the top left tile.', name: 'Dave Price', signature: SIG, declaration: D.putRightDeclaration('One tile is still lifted at the top left.', ADDR) });
await afterReply();
eq('the second put right is in', [put2.status, db.rows('site_returns').find((r) => r.n === 2).status], [200, 'fixed']);

/* ── Green light ───────────────────────────────────────────────────────────── */

const waBefore = globalThis.__rec.whatsapp.length;
const green = await RT.greenLight(db, read(), signoff().id, office, 'http://localhost');
eq('green light: the sign-off and the put right, and the PO’s hold lifts', [green.ok, signoff().review_status, signoff().reviewed_by, db.rows('site_returns').find((r) => r.n === 2).status, po().review_status], [true, 'green', 'Callum Office', 'green', 'green']);
eq('the trade is told, but through the evening rule (queued for the morning)', msgs('green_light').map((m) => [m.channel, m.status]).sort(), [['email', 'queued'], ['whatsapp', 'queued']]);
eq('…so nothing has gone yet', globalThis.__rec.whatsapp.length, waBefore);
eq('green light twice: nothing more', [(await RT.greenLight(db, read(), signoff().id, office)).ok, msgs('green_light').length], [true, 2]);
const history = db.rows('site_events').filter((e) => e.assignment_id === roof.id).map((e) => e.type).filter((t) => /^review_|^put_right/.test(t));
eq('the history keeps every step', history, ['review_return', 'put_right_signed', 'review_return', 'put_right_signed', 'review_green']);
const finalReport = await textOf(fileOf(doc('RF_REPORT')));
eq('the roofer report: both returns, the put rights’ declarations, the green light', [
  finalReport.includes('Return to site 1'),
  finalReport.includes('Return to site 2'),
  finalReport.includes('Returned to site again'),
  squash(finalReport).includes(squash('the work to put right “One tile is still lifted at the top left.” at')),
  finalReport.includes('Green light'),
], [true, true, true, true, true]);
// The print versions (documents/print.ts) through the job's Docs link (?variant=print): the same words, made now, nothing stored.
{
  const docRoute = await import('../src/app/api/crm/documents/[id]/route.ts');
  const before = [db.files.size, db.rows('crm_documents').length];
  const printOf = async (d) => {
    const r = await docRoute.GET(new Request(`http://localhost/api/crm/documents/${d.id}?variant=print`), { params: Promise.resolve({ id: d.id }) });
    return { status: r.status, type: r.headers.get('content-type'), name: r.headers.get('content-disposition'), text: r.status === 200 ? await textOf(new Uint8Array(await r.arrayBuffer())) : await r.text() };
  };
  const report = await printOf(doc('RF_REPORT'));
  const poPrint = await printOf(doc('PO-0001'));
  eq('the roofer report’s print version: the same words as the stored copy', [report.status, report.type, report.text === finalReport, /print version/.test(report.name)], [200, 'application/pdf', true, true]);
  eq('the PO’s print version: the same words as the PO that went (the terms too)', [poPrint.status, poPrint.text === (await textOf(fileOf(doc('PO-0001')))), poPrint.text.includes('Terms')], [200, true, true]);
  eq('nothing stored for them', [db.files.size, db.rows('crm_documents').length], before);
  const stale = { ...doc('RF_REPORT'), inputs_hash: 'something else' };
  db.rows('crm_documents').push(stale);
  stale.id = randomUUID();
  const behind = await printOf(stale);
  db.rows('crm_documents').splice(db.rows('crm_documents').indexOf(stale), 1);
  eq('a stored copy behind its answers: no print version, and why', [behind.status, behind.text.startsWith('This document has changed since this copy was made')], [409, true]);
}
const review2 = await RV.reviewOf(db, roof.id);
eq('the office’s review: green, with both returns in the history', [review2.review.submissions.map((s) => s.state), review2.review.returns.map((r) => r.status), review2.photos.filter((p) => p.slot.startsWith('PR:')).map((p) => p.label)], [['green'], ['again', 'green'], ['Put right 1: photos of the fix', 'Put right 2: photos of the fix']]);

/* ── A reopen withdraws a live return to site ──────────────────────────────── */

await RT.returnToSite(db, read(), signoff().id, { what: 'The cable entry needs sealing again.', fix_by: fixBy }, office);
eq('after the green light the office can still ask (in the dispute window)', [signoff().review_status, po().review_status], ['return', 'hold']);
const reopened = await S.reopenSignoff(db, read(), 'staff-1', 'Callum Office');
eq('reopened: the live return is withdrawn and nothing holds the PO', [reopened.ok, db.rows('site_returns').find((r) => r.n === 3).status, po().review_status], [true, 'withdrawn', null]);
const resigned = await phone(signRoute, 'signoff', { op_id: randomUUID(), stage: 'main', name: 'Dave Price', signature: SIG, declaration: ROOFER.sig.declaration({ address: ADDR }), signed_at: new Date().toISOString(), rev: 7 });
await afterReply();
eq('signed again: waiting for review once more, a new task', [resigned.status, signoff().review_status, po().review_status, !!task(`site-check:${signoff().id}`)], [200, 'waiting', 'waiting', true]);

if (process.env.PDF_OUT) {
  const fs = await import('node:fs');
  for (const [k, v] of db.files) if (k.endsWith('.pdf')) fs.writeFileSync(`${process.env.PDF_OUT}/${k.split('/').pop()}`, v);
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
