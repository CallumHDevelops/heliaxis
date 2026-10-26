// What the site app's tests share (scripts/test-site-po-holds.mjs, test-site-hardening.mjs…): the
// stand-ins for everything outside the site code that would reach Supabase, Next, Resend, Meta or
// Microsoft (each records what it was asked to do in globalThis.__rec), an in-memory database for
// the PostgREST calls the site code makes, and eq(). Not a test itself (no "test-" in the name).
// Usage, before importing anything under src/:  const kit = await import('./site-test-kit.mjs'); kit.setup();
import { randomUUID } from 'node:crypto';
import { registerHooks } from 'node:module';

const SRC = new URL('../src/', import.meta.url).href;
const mod = (code) => `data:text/javascript,${encodeURIComponent(code)}`;

export const STUBS = {
  'server-only': 'export {}',
  'next/server': `
    export class NextResponse extends Response {
      static json(body, init = {}) { return new NextResponse(JSON.stringify(body), { status: init.status ?? 200, headers: { 'content-type': 'application/json', ...(init.headers ?? {}) } }); }
    }
    export function after(fn) { globalThis.__after.push(fn); }`,
  'next/cache': 'export function revalidatePath() {} export function revalidateTag() {}',
  '@/lib/supabase/admin': 'export const createAdminClient = () => globalThis.__db;',
  '@/lib/crm/server': `
    export const DOCS_BUCKET = 'crm-docs'; export const CRM_BUCKET = 'crm-photos'; export const NO_STORE = {};
    export const thumbPath = (p) => p.replace(/\\.[a-z0-9]+$/i, '') + '.thumb.jpg';
    export const isUuid = (s) => /^[0-9a-f-]{36}$/i.test(s);
    export async function ensureDocsBucket() {} export async function fingerprintDocument() { return null; }
    export async function ensureCrmBucket() {} export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
    export async function logActivity(a) { globalThis.__rec.activity.push(a); }
    export const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    export async function crmSession() { return { user: { id: 'staff-1', email: 'office@heliaxis.co.uk' }, profile: { full_name: 'Office', role: 'admin' } }; }`,
  '@/lib/auth': `export async function requirePortal() { return { user: { id: 'staff-1', email: 'office@heliaxis.co.uk' }, profile: { full_name: 'Office', role: 'admin' } }; }`,
  '@/lib/notify': 'export async function notify(n) { globalThis.__rec.notify.push(n); }',
  // The photos route's after-photo work isn't what's tested here.
  '@/lib/site/hooks': 'export async function lateKeysFor() { return []; } export async function afterAnswers(db, a) { return a.flags; } export async function afterPhoto() {}',
  '@/lib/schema-ready': 'export async function schemaReady() { return { site: true, purchaseOrders: true }; }',
  '@/lib/surveys/server': `
    export async function addSourceTask(db, t) { if (globalThis.__rec.tasks.some((x) => x.key === t.key)) return false; globalThis.__rec.tasks.push(t); return true; }
    export async function closeSourceTask() {}`,
  '@/lib/purchase-orders/server': 'export async function logOrder(db, o, event, body) { globalThis.__rec.orders.push({ event, body }); }',
  '@/lib/whatsapp/settings': 'export async function getSettings() { return { quietFromMin: 1260, quietToMin: 525, lateRule: false, lateFromMin: 1230, lateSendAtMin: 420 }; }',
  '@/lib/whatsapp/api': `
    export const whatsappConfigured = () => true; export const leadAdsConfigured = () => false; export const defaultTemplate = () => ({ lang: 'en_GB' });
    export async function graph() { return { ok: false, error: 'offline in the test' }; }
    export async function sendText() { return { ok: false, error: 'offline in the test' }; }
    export async function sendDocument() { return { ok: false, error: 'offline in the test' }; }
    export async function markRead() {}
    export async function sendTemplate(to, name, lang, params) {
      if (globalThis.__fail?.whatsapp) return { ok: false, error: 'Meta said no' };
      globalThis.__rec.whatsapp.push({ to, name, params }); return { ok: true, data: { messages: [{ id: 'wamid.' + globalThis.__rec.whatsapp.length }] } };
    }`,
  // The approved templates: globalThis.__templates (all of the site's by default).
  '@/lib/whatsapp/templates': `export async function fetchTemplates() { return { ok: true, items: (globalThis.__templates ?? ['site_job_pack', 'site_po_raised', 'site_strike_photos', 'site_clear_to_start', 'site_scaffold_hold', 'site_return_to_site', 'site_green_light']).map((name) => ({ name, status: 'APPROVED' })) }; }`,
  '@/lib/subcontractors/server': `
    import { createHash, randomBytes } from 'node:crypto';
    export const sha256 = (s) => createHash('sha256').update(s).digest('hex');
    export function newToken() { const token = randomBytes(32).toString('base64url'); return { token, hash: sha256(token) }; }
    export const portalBaseUrl = (o) => (o || 'http://localhost:3000').replace(/\\/$/, '');
    export const clientIp = () => '203.0.113.7';
    export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    export const emailShell = (title, body) => '<h1>' + title + '</h1>' + body;
    export function validSignature(sig) { return typeof sig === 'string' && /^data:image\\/png;base64,[A-Za-z0-9+/=]+$/.test(sig) && sig.length < 300000; }
    export async function logEvent() {}
    export async function sendEmail(m) {
      if (globalThis.__fail?.email) return { ok: false, error: 'Resend said no' };
      globalThis.__rec.email.push(m); return { ok: true, id: 'resend-' + globalThis.__rec.email.length };
    }`,
};

/** Register the stand-ins (with any of the test's own) and the "no .ts" resolution, and the globals they record into. */
export function setup(extra = {}) {
  const stubs = { ...STUBS, ...extra };
  // A stood-in module is stood in however it's imported ("@/lib/crm/server", or "./server" next to it).
  const byUrl = new Map(Object.keys(stubs).filter((k) => k.startsWith('@/')).map((k) => [`${SRC}${k.slice(2)}.ts`, stubs[k]]));
  const stubbed = (r) => (byUrl.has(r.url) ? { url: mod(byUrl.get(r.url)), shortCircuit: true } : r);
  registerHooks({
    resolve(specifier, context, next) {
      if (stubs[specifier]) return { url: mod(stubs[specifier]), shortCircuit: true };
      const spec = specifier.startsWith('@/') ? SRC + specifier.slice(2) : specifier;
      try {
        return stubbed(next(spec, context));
      } catch (e) {
        if (!/^(?:\.\.?\/|file:)/.test(spec) || /\.\w+$/.test(spec)) throw e;
        // Without ".ts", as the bundler expects; a folder is its index.ts.
        try {
          return stubbed(next(`${spec}.ts`, context));
        } catch {
          return next(`${spec}/index.ts`, context);
        }
      }
    },
  });
  // No network: gov.uk's bank holidays fall back to none.
  globalThis.fetch = async () => {
    throw new Error('offline in the test');
  };
  globalThis.__after = [];
  globalThis.__fail = {};
  globalThis.__rec = { email: [], whatsapp: [], notify: [], tasks: [], orders: [], activity: [] };
  process.env.SITE_LINK_SECRET = 'a-test-key-for-site-links-0123456789abcdef';
  const db = (globalThis.__db = fakeDb());
  return db;
}

/* ── An in-memory database: the PostgREST calls the site code makes ────────── */
/** Primary keys other than id: an upsert with no onConflict updates the row with the same key, as PostgREST does. */
const PKEY = { cms_kv: 'key' };
const UNIQUE = { site_signoffs: [['assignment_id', 'stage']], purchase_orders: [['signoff_id']], site_messages: [['dedupe_key']], site_ops: [['assignment_id', 'op_id']], site_returns: [['assignment_id', 'n']], crm_photos: [['storage_path']], site_reads: [['photo_id']] };
export function fakeDb() {
  const t = {};
  const rows = (name) => (t[name] ??= []);
  const files = new Map();
  /** The content type each file was stored with (as the PUT said). */
  const types = new Map();
  /** Every signed upload URL handed out: { bucket, path, upsert }. */
  const uploads = [];
  let poNo = 0;
  const now = () => new Date().toISOString();
  const defaults = (table, r) => {
    const base = { id: r.id ?? randomUUID(), created_at: now(), updated_at: now() };
    if (table === 'purchase_orders') return { ...base, po_number: `PO-${String(++poNo).padStart(4, '0')}`, status: 'draft', changed_since_sent: false, sent_at: null, sent_to: null, paid_on: null, cancelled_at: null, ...r };
    if (table === 'site_signoffs') return { ...base, received_at: now(), po_done_at: null, docs_done_at: null, notified_at: null, flags: [], extra: {}, review_status: 'waiting', reviewed_at: null, reviewed_by: null, ...r };
    if (table === 'site_returns') return { ...base, status: 'open', photo_ids: [], notice: null, notice_sent_at: null, fixed_at: null, fixed_note: null, fixed_name: null, fixed_signature_path: null, fixed_declaration: null, reviewed_at: null, reviewed_by: null, ...r };
    if (table === 'site_messages') return { ...base, status: 'queued', sent_at: null, provider_id: null, error: null, ...r };
    if (table === 'crm_documents') return { ...base, visible: false, archived_at: null, archived_by: null, handover_slot: null, release: 'now', source: null, generated_key: null, version: 1, inputs_hash: null, uploaded_by: null, ...r };
    if (table === 'handover_slots') return { na: false, na_reason: null, note: null, data: {}, updated_by: null, updated_at: now(), ...r };
    if (table === 'handover_packs') return { version: 0, document_id: null, contents: null, built_at: null, built_by: null, sent_at: null, sent_by: null, sent_via: [], invoice_prompted_at: null, queued: null, ...r };
    if (table === 'site_devices') return { ...base, revoked_at: null, last_seen_at: now(), ...r };
    if (table === 'site_events') return { ...base, at: now(), ...r };
    return { ...base, ...r };
  };
  const clash = (table, r) => (UNIQUE[table] ?? []).some((cols) => cols.every((c) => r[c] != null) && rows(table).some((x) => x !== r && cols.every((c) => x[c] === r[c])));
  const from = (table) => {
    const where = [];
    let mode = 'select';
    let payload = null;
    let upsertOpts = null;
    let order = [];
    let lim = null;
    let returning = false;
    let counting = null;
    const like = (v, p) => new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`).test(String(v ?? ''));
    const exec = () => {
      if (mode === 'insert') {
        const list = (Array.isArray(payload) ? payload : [payload]).map((r) => defaults(table, structuredClone(r)));
        const kept = [];
        for (const r of list) {
          // An upsert onto its conflict columns updates the row that's there.
          const on = upsertOpts?.onConflict && !upsertOpts.ignoreDuplicates ? upsertOpts.onConflict.split(',').map((c) => c.trim()) : null;
          const hit = on ? rows(table).find((x) => on.every((c) => x[c] === r[c])) : null;
          if (hit) {
            const given = Array.isArray(payload) ? payload[list.indexOf(r)] : payload;
            Object.assign(hit, structuredClone(given));
            kept.push(hit);
            continue;
          }
          if (clash(table, r)) {
            if (upsertOpts?.ignoreDuplicates) continue;
            return { data: null, error: { code: '23505', message: 'duplicate key' } };
          }
          rows(table).push(r);
          kept.push(r);
        }
        return { data: Array.isArray(payload) ? kept : kept[0] ?? null, error: null, many: Array.isArray(payload) };
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
        if (table === 'site_signoffs') for (const po of rows('purchase_orders')) if (list.some((s) => s.id === po.signoff_id)) po.signoff_id = null;
        return { data: list, error: null, many: true };
      }
      for (const o of [...order].reverse()) list = [...list].sort((a, b) => (a[o.col] < b[o.col] ? -1 : a[o.col] > b[o.col] ? 1 : 0) * (o.asc ? 1 : -1));
      if (lim != null) list = list.slice(0, lim);
      return { data: list.map((r) => structuredClone(r)), error: null, many: true };
    };
    const out = (r, one) => {
      if (r.error) return { data: null, error: r.error };
      if (counting && mode === 'select') return { data: counting.head ? null : r.data, count: r.data.length, error: null };
      if (!one) return { data: mode === 'select' || returning || r.many === false ? r.data : null, error: null };
      const list = Array.isArray(r.data) ? r.data : r.data == null ? [] : [r.data];
      if (one === 'single' && list.length !== 1) return { data: null, error: { code: 'PGRST116', message: 'not one row' } };
      return { data: list[0] ? structuredClone(list[0]) : null, error: null };
    };
    const b = {
      select: (_cols, o) => ((returning = mode !== 'select'), (counting = o?.count ? o : null), b),
      insert: (r) => ((mode = 'insert'), (payload = r), b),
      upsert: (r, o) => ((mode = 'insert'), (payload = r), (upsertOpts = o ?? (PKEY[table] ? { onConflict: PKEY[table] } : null)), b),
      update: (p) => ((mode = 'update'), (payload = p), b),
      delete: () => ((mode = 'delete'), b),
      // A jsonb column compared with a JSON string, as PostgREST casts it.
      eq: (c, v) => (where.push((r) => (r[c] && typeof r[c] === 'object' && typeof v === 'string' ? JSON.stringify(r[c]) === JSON.stringify(JSON.parse(v)) : r[c] === v)), b),
      // An array column as Postgres compares it (@> and <@): every wanted element is there, or every element is wanted.
      contains: (c, v) => (where.push((r) => (Array.isArray(r[c]) && Array.isArray(v) ? v.every((x) => r[c].includes(x)) : JSON.stringify(r[c]) === JSON.stringify(v))), b),
      containedBy: (c, v) => (where.push((r) => (Array.isArray(r[c]) && Array.isArray(v) ? r[c].every((x) => v.includes(x)) : JSON.stringify(r[c]) === JSON.stringify(v))), b),
      neq: (c, v) => (where.push((r) => r[c] !== v), b),
      in: (c, v) => (where.push((r) => v.includes(r[c])), b),
      is: (c, v) => (where.push((r) => (r[c] ?? null) === v), b),
      not: (c, op, v) => (where.push((r) => !(op === 'is' && v === null ? (r[c] ?? null) === null : r[c] === v)), b),
      lt: (c, v) => (where.push((r) => r[c] < v), b),
      lte: (c, v) => (where.push((r) => r[c] <= v), b),
      gt: (c, v) => (where.push((r) => r[c] > v), b),
      gte: (c, v) => (where.push((r) => r[c] >= v), b),
      like: (c, p) => (where.push((r) => like(r[c], p)), b),
      or: (s) => {
        const parts = s.split(',').map((x) => x.split('.'));
        where.push((r) => parts.some(([c, op, v]) => (op === 'is' && v === 'null' ? (r[c] ?? null) === null : op === 'eq' ? String(r[c]) === v : false)));
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
        if (files.has(k) && !o?.upsert) return { error: { message: 'The resource already exists', statusCode: '409' } };
        files.set(k, new Uint8Array(bytes));
        if (o?.contentType) types.set(k, o.contentType);
        return { error: null };
      },
      download: async (path) => ({ data: files.has(`${bucket}/${path}`) ? new Blob([files.get(`${bucket}/${path}`)]) : null }),
      remove: async (paths) => (paths.forEach((p) => files.delete(`${bucket}/${p}`)), { error: null }),
      copy: async (a, b2) => (files.has(`${bucket}/${a}`) ? (files.set(`${bucket}/${b2}`, files.get(`${bucket}/${a}`)), { error: null }) : { error: { message: 'not found' } }),
      exists: async (path) => ({ data: files.has(`${bucket}/${path}`), error: null }),
      info: async (path) => (files.has(`${bucket}/${path}`) ? { data: { size: files.get(`${bucket}/${path}`).length, contentType: types.get(`${bucket}/${path}`) ?? 'application/pdf' }, error: null } : { data: null, error: { message: 'Object not found' } }),
      list: async (prefix) => {
        const names = new Map();
        const pre = prefix ? `${bucket}/${prefix.replace(/\/$/, '')}/` : `${bucket}/`;
        for (const k of files.keys()) if (k.startsWith(pre)) names.set(k.slice(pre.length).split('/')[0], k.slice(pre.length).includes('/'));
        return { data: [...names].map(([name, isFolder]) => (isFolder ? { name, id: null } : { name, id: name })), error: null };
      },
      createSignedUrl: async (path) => ({ data: { signedUrl: `https://storage.test/${bucket}/${path}` } }),
      createSignedUploadUrl: async (path, o) => {
        uploads.push({ bucket, path, upsert: !!o?.upsert });
        if (files.has(`${bucket}/${path}`) && !o?.upsert) return { data: null, error: { message: 'The resource already exists' } };
        return { data: { signedUrl: `https://storage.test/upload/${bucket}/${path}`, path, token: 't' }, error: null };
      },
    }),
    getBucket: async () => ({ data: {} }),
    createBucket: async () => ({}),
  };
  // The database functions the code calls (crm-v3.sql's checklist tick); anything else isn't there.
  const rpc = async (name, args) => {
    if (name === 'crm_checklist_set') {
      const p = rows('crm_projects').find((x) => x.id === args.p_project);
      if (!p) return { data: null, error: null };
      const c = { ...(p.checklist ?? {}) };
      if (args.p_value == null) delete c[args.p_key];
      else c[args.p_key] = args.p_value;
      p.checklist = c;
      return { data: c, error: null };
    }
    if (name === 'site_answers_patch') {
      // As site-commissioning.sql: the keys set and unset, the rev on, only while it's open (or late keys once signed).
      const a = rows('site_assignments').find((x) => x.id === args.p_assignment && (['sent', 'opened', 'started'].includes(x.status) || (args.p_late && x.status === 'signed')));
      if (!a) return { data: null, error: null };
      const answers = { ...(a.answers ?? {}) };
      for (const k of args.p_unset ?? []) delete answers[k];
      Object.assign(a, { answers: { ...answers, ...structuredClone(args.p_set ?? {}) }, rev: Number(a.rev ?? 0) + 1, status: ['sent', 'opened'].includes(a.status) ? 'started' : a.status });
      return { data: a.rev, error: null };
    }
    return { data: null, error: { message: 'no rpc' } };
  };
  return { t, rows, files, types, uploads, from, storage, rpc };
}

let failed = 0;
export function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}
export function done() {
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
}

/** The work Next runs once the response has gone (after()). */
export async function afterReply() {
  for (const fn of globalThis.__after.splice(0)) await fn();
}

export const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
/** Answers as the phone saves them. */
export const wrap = (vals) => Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, { v, src: 'typed', at: '2026-11-03T10:00:00Z' }]));
/** The roofer's form, every must answered, for a 16-panel design strung 8 + 8; and its photos. */
export const ROOF_DONE = { RF5: 'no', RF13: 'Aiko Neostar 2P 450W', RF14: 49.6, RX1: 'yes', RF10: 2, RF11: [8, 8], RX5: 16, RF6: 'yes', RF7: 'no', RF8: 'yes', RF9: true, RX4: 'yes', RF4: 'no', RX2: 'yes', RX3: 'no', RX6: 'no', RX8: 'yes', RX9: 'no', RX10: 'on_roof', RX11: 'yes', RX12: 'yes', RX13: 'yes', RX14: 'yes' };
export const ROOF_PHOTOS = { RF1: 2, RF12: 1, RF2: 2, RX4p: 1, RF3: 3 };

/** A job (16 panels in the design, strung 8 + 8) with its customer. */
export function addJob(db, extra = {}) {
  const project = { id: randomUUID(), enquiry_id: randomUUID(), owner_id: 'owner-1', project_ref: 'HX-0042', address: '12 High Street\nMaindee, Newport', postcode: 'NP20 4AB', products: ['solar'], system: { kwp: 7.2, panel_count: 16, panel_model: 'Aiko Neostar 2P 450W', strings_design: [8, 8] }, scaffold_up_on: null, scaffold_down_on: null, ...extra };
  db.rows('crm_projects').push(project);
  db.rows('enquiries').push({ id: project.enquiry_id, name: 'Jane Smith', postcode: 'NP20 4AB', customer_ref: null });
  return project;
}

/** A person who goes to site. */
export function addContact(db, extra = {}) {
  const c = { id: randomUUID(), subcontractor_id: null, operative_id: null, name: 'Dave Price', company: 'Price Roofing', email: 'dave@example.test', mobile: '07700 900123', wa_id: '447700900123', whatsapp_ok: true, vat_number: null, cis_rate: 'net', cis_verified_on: '2026-01-10', archived_at: null, trades: ['roofer'], ...extra };
  db.rows('site_contacts').push(c);
  return c;
}

/** A trade on the job, with its photos already up. */
export function addAssignment(db, project, contact, { trade = 'roofer', answers = ROOF_DONE, photos = ROOF_PHOTOS, ...extra } = {}) {
  const a = {
    id: randomUUID(), project_id: project.id, contact_id: contact.id, trade, trade_label: null, scope: null, forms: [], cert_route: 'eic', starts_on: '2026-11-03', days: 1,
    rate_pence: 3000, rate_basis: 'per_panel', rate_qty: null, raise_po: true, vat_treatment: 'none', vat_note: null, cis_override: null, share_customer_phone: false, note_to_trade: null,
    status: 'started', link_hash: null, link_generation: 1, link_created_at: null, sent_at: null, opened_at: null, started_at: null, signed_at: null, done_at: null, cancelled_at: null,
    answers: wrap(answers), rev: 7, answers_saved_at: null, flags: [], schema_version: 2, created_by: null, ...extra,
  };
  db.rows('site_assignments').push(a);
  for (const [slot, n] of Object.entries(photos)) for (let i = 0; i < n; i++) db.rows('crm_photos').push({ id: randomUUID(), project_id: project.id, assignment_id: a.id, slot, storage_path: `${project.id}/site/${a.id}/${slot}-${i}.jpg`, taken_at: null });
  return a;
}

/** A phone signed in as that person (its bearer token). */
export async function addPhone(db, contact) {
  const { createHash, randomBytes } = await import('node:crypto');
  const token = randomBytes(24).toString('base64url');
  const device = { id: randomUUID(), contact_id: contact.id, token_hash: createHash('sha256').update(token).digest('hex'), last_seen_at: new Date().toISOString(), expires_at: '2099-01-01T00:00:00Z', revoked_at: null };
  db.rows('site_devices').push(device);
  return { token, device };
}

/** POST (or another method) to a route module from that phone. */
export async function call(route, url, { token, body, method = 'POST', params = {} } = {}) {
  const headers = { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) };
  const r = await route[method](new Request(`http://localhost${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), { params: Promise.resolve(params) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
