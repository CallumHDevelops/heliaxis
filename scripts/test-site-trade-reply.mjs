// SPEC D20: a trade answering a site message on WhatsApp isn't a new lead (src/lib/site/trade-reply.ts,
// called first thing by src/lib/whatsapp/inbox.ts). Against an in-memory stand-in for the database: a
// reply from a trade's number goes on their open job's Site history and to the job's owner, with no
// customer, opportunity or "New WhatsApp lead"; a Meta retry changes nothing; STOP turns job messages on
// WhatsApp off; a reply after the job lands on the latest one; a trade with no job reaches the inbox
// team; a number that is also a customer's, or anyone else's, goes through the inbox as before; a message
// typed to a trade in the WhatsApp app stays on their job.
// Usage: node --experimental-strip-types scripts/test-site-trade-reply.mjs
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { registerHooks } from 'node:module';

const SRC = new URL('../src/', import.meta.url).href;
const mod = (code) => `data:text/javascript,${encodeURIComponent(code)}`;
const STUBS = {
  'server-only': 'export {}',
  '@/lib/supabase/admin': 'export const createAdminClient = () => globalThis.__db;',
  '@/lib/notify': 'export async function notify(n) { globalThis.__notes.push(n); }',
};
registerHooks({
  resolve(specifier, context, next) {
    if (STUBS[specifier]) return { url: mod(STUBS[specifier]), shortCircuit: true };
    const spec = specifier.startsWith('@/') ? SRC + specifier.slice(2) : specifier;
    try {
      return next(spec, context);
    } catch (e) {
      if (!/^(?:\.\.?\/|file:)/.test(spec) || /\.\w+$/.test(spec)) throw e;
      return next(`${spec}.ts`, context);
    }
  },
});

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

/* ── An in-memory database: the PostgREST calls trade-reply.ts makes ───────── */
function fakeDb(seed) {
  const t = structuredClone(seed);
  const rows = (name) => (t[name] ??= []);
  const contains = (have, want) => Object.entries(want).every(([k, v]) => have && have[k] === v);
  const from = (table) => {
    const where = [];
    let mode = 'select';
    let payload = null;
    let order = null;
    let lim = null;
    const run = () => {
      if (mode === 'insert') {
        const list = (Array.isArray(payload) ? payload : [payload]).map((r) => ({ id: randomUUID(), at: new Date().toISOString(), ...structuredClone(r) }));
        rows(table).push(...list);
        return { data: null, error: null };
      }
      let list = rows(table).filter((r) => where.every((w) => w(r)));
      if (mode === 'update') {
        for (const r of list) Object.assign(r, structuredClone(payload));
        return { data: null, error: null };
      }
      if (order) list = [...list].sort((a, b) => (a[order.col] < b[order.col] ? -1 : a[order.col] > b[order.col] ? 1 : 0) * (order.asc ? 1 : -1));
      if (lim != null) list = list.slice(0, lim);
      return { data: structuredClone(list), error: null };
    };
    const q = {
      select: () => q,
      insert: (p) => ((mode = 'insert'), (payload = p), q),
      update: (p) => ((mode = 'update'), (payload = p), q),
      eq: (c, v) => (where.push((r) => r[c] === v), q),
      neq: (c, v) => (where.push((r) => r[c] !== v), q),
      is: (c, v) => (where.push((r) => (r[c] ?? null) === v), q),
      in: (c, vs) => (where.push((r) => vs.includes(r[c])), q),
      contains: (c, v) => (where.push((r) => contains(r[c], v)), q),
      order: (col, o = {}) => ((order = { col, asc: o.ascending !== false }), q),
      limit: (n) => ((lim = n), q),
      maybeSingle: async () => {
        const r = run();
        return { data: r.data?.[0] ?? null, error: r.error };
      },
      then: (ok, bad) => Promise.resolve(run()).then(ok, bad),
    };
    return q;
  };
  return { from, t };
}

const { tradeReply, tradeEcho } = await import('../src/lib/site/trade-reply.ts');

const DAVE = '447700900321';
const seed = {
  site_contacts: [
    { id: 'c-dave', name: 'Dave Price', subcontractor_id: 'sub-1', wa_id: DAVE, whatsapp_ok: true, archived_at: null },
    { id: 'c-old', name: 'Old Trade', subcontractor_id: null, wa_id: '447700900999', whatsapp_ok: true, archived_at: '2026-01-01T00:00:00Z' },
    { id: 'c-new', name: 'Nia Jones', subcontractor_id: null, wa_id: '447700900555', whatsapp_ok: true, archived_at: null },
  ],
  site_assignments: [
    { id: 'a-open', project_id: 'p-1', contact_id: 'c-dave', status: 'sent', trade: 'roofer', updated_at: '2026-10-20T09:00:00Z' },
    { id: 'a-done', project_id: 'p-2', contact_id: 'c-dave', status: 'done', trade: 'roofer', updated_at: '2026-10-01T09:00:00Z' },
    { id: 'a-gone', project_id: 'p-3', contact_id: 'c-dave', status: 'cancelled', trade: 'roofer', updated_at: '2026-10-21T09:00:00Z' },
  ],
  crm_projects: [
    { id: 'p-1', owner_id: 'owner-1' },
    { id: 'p-2', owner_id: 'owner-2' },
  ],
  enquiries: [{ id: 'e-1', wa_id: '447700900123', name: 'Jane Customer' }],
  site_events: [],
};
const text = (from, body, id = `wamid.${randomUUID()}`) => ({ id, from, timestamp: '1792569600', type: 'text', text: { body } });
const fresh = () => {
  const db = fakeDb(seed);
  globalThis.__db = db;
  globalThis.__notes = [];
  const team = [];
  return { db, team, notifyTeam: async (title, body, href) => void team.push({ title, body, href }) };
};

// Dave (roofer, job pack sent) replies "Cheers, see you Tuesday".
{
  const { db, team, notifyTeam } = fresh();
  const m = text(DAVE, 'Cheers, see you Tuesday');
  eq('a trade’s reply is dealt with (the inbox stops: no customer, opportunity or lead push)', await tradeReply(db, m, notifyTeam), true);
  eq('… on their open job’s Site history', db.t.site_events.map((e) => [e.assignment_id, e.actor, e.type, e.detail.body]), [['a-open', 'trade', 'trade_reply', 'Cheers, see you Tuesday']]);
  eq('… the job owner hears, with a link to the Site tab', globalThis.__notes.map((n) => [n.userId, n.title, n.body, n.href]), [['owner-1', 'WhatsApp from Dave Price (roofer)', 'Cheers, see you Tuesday', '/admin/projects/p-1?tab=site']]);
  eq('… not the inbox team', team, []);
  eq('… no enquiry made', db.t.enquiries.length, 1);
  eq('Meta sends it again: nothing more', [await tradeReply(db, m, notifyTeam), db.t.site_events.length, globalThis.__notes.length], [true, 1, 1]);
}
// A 👍 reaction to the job pack is a reply too.
{
  const { db, notifyTeam } = fresh();
  eq('a reaction from a trade: on the job, not a lead', [await tradeReply(db, { id: 'wamid.r', from: DAVE, type: 'reaction', reaction: { emoji: '👍' } }, notifyTeam), db.t.site_events.length], [true, 1]);
}
// STOP.
{
  const { db, notifyTeam } = fresh();
  await tradeReply(db, text(DAVE, 'STOP'), notifyTeam);
  eq('STOP: job messages to them on WhatsApp off', db.t.site_contacts.find((c) => c.id === 'c-dave').whatsapp_ok, false);
  eq('… kept on the history and told to the owner', [db.t.site_events[0].detail.word, globalThis.__notes[0].body.includes('go by email only')], ['stop', true]);
}
// After the job (only a done one left): the latest job.
{
  const db0 = fakeDb({ ...seed, site_assignments: seed.site_assignments.filter((a) => a.id !== 'a-open') });
  globalThis.__db = db0;
  globalThis.__notes = [];
  await tradeReply(db0, text(DAVE, 'Thanks for the payment'), async () => {});
  eq('a reply after the job: on their latest job, to its owner', [db0.t.site_events.map((e) => e.assignment_id), globalThis.__notes.map((n) => n.userId)], [['a-done'], ['owner-2']]);
}
// A trade on no job yet.
{
  const { db, team, notifyTeam } = fresh();
  eq('a trade with no job: dealt with', await tradeReply(db, text('447700900555', 'Who is this?'), notifyTeam), true);
  eq('… kept (no job), and the inbox team hears', [db.t.site_events.map((e) => e.assignment_id), team.map((x) => x.title)], [[null], ['WhatsApp from Nia Jones (trade)']]);
}
// Not a trade's.
{
  const { db, notifyTeam } = fresh();
  eq('a customer’s number: the inbox as before', await tradeReply(db, text('447700900123', 'Hi'), notifyTeam), false);
  eq('an unknown number: the inbox as before (a new lead)', await tradeReply(db, text('447700900777', 'Quote please'), notifyTeam), false);
  eq('an archived trade: the inbox as before', await tradeReply(db, text('447700900999', 'Hello'), notifyTeam), false);
  db.t.enquiries.push({ id: 'e-2', wa_id: DAVE, name: 'Dave Price' });
  eq('a trade who is also a customer: stays in their chat', await tradeReply(db, text(DAVE, 'About my own roof'), notifyTeam), false);
  eq('… nothing on the site history for those', db.t.site_events.length, 0);
}
// Before site-commissioning.sql is run (no site_contacts table): the inbox as before.
{
  const db = { from: () => ({ select: () => ({ eq: () => ({ is: async () => ({ data: null, error: { code: '42P01', message: 'relation does not exist' } }) }) }) }) };
  eq('no site tables yet: the inbox as before', await tradeReply(db, text(DAVE, 'Hi'), async () => {}), false);
}
// Typed to Dave in the WhatsApp Business app.
{
  const { db } = fresh();
  const echo = { ...text(DAVE, 'Running 20 mins late, sorry'), from: '441633965205', to: DAVE };
  eq('typed to a trade in the app: on their job, no new customer', [await tradeEcho(db, echo), db.t.site_events.map((e) => [e.assignment_id, e.actor, e.type, e.detail.body]), db.t.enquiries.length], [true, [['a-open', 'office', 'office_whatsapp', 'Running 20 mins late, sorry']], 1]);
  eq('typed to a customer: the chat as before', await tradeEcho(db, { ...echo, to: '447700900123' }), false);
}

/* ── The inbox asks first ──────────────────────────────────────────────────── */
const inbox = readFileSync(new URL('../src/lib/whatsapp/inbox.ts', import.meta.url), 'utf8');
const body = (name) => inbox.slice(inbox.indexOf(`export async function ${name}(`), inbox.indexOf('\n}\n', inbox.indexOf(`export async function ${name}(`)));
const inbound = body('handleInboundMessage');
const echo = body('handleEcho');
eq('handleInboundMessage: the trade check comes before any enquiry, opportunity or lead push', inbound.indexOf('tradeReply(') > 0 && inbound.indexOf('tradeReply(') < inbound.indexOf('enquiryForNumber(') && inbound.indexOf('tradeReply(') < inbound.indexOf('ensureOpportunity('), true);
eq('… after the duplicate check (a retry of a customer message is still a duplicate)', inbound.indexOf("if (dup) return") < inbound.indexOf('tradeReply('), true);
eq('handleEcho: the trade check comes before any enquiry', echo.indexOf('tradeEcho(') > 0 && echo.indexOf('tradeEcho(') < echo.indexOf('enquiryForNumber('), true);

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
