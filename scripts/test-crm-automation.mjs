// What the CRM does by itself with new leads (src/lib/crm/automation.ts): who gets a new lead. The
// rotation (CRM → Settings → New leads) skips anyone who can no longer open the CRM (rejected, set back
// to pending, CRM portal taken away), who stays ticked, keeps their place and takes turns again when
// their access is back; a lead someone already has is left alone. The "Choose who gets new leads" to-do
// (src/lib/setup-checks.ts) counts the same people, and comes back unticked when none of them can take a
// lead any more, whatever was ticked off before; ticked off then, it stays ticked until someone can take
// leads again. An old tick is cleared from the list the card has just read, so a failed read never wipes the
// other ticks, and a failed lookup of the people leaves it. The follow-up sequence: switched on (or given a new
// step), it sends only the steps that fall due from then on; leads already in the CRM skip older ones
// quietly, instead of getting every overdue step a minute apart. Steps go by id, so a step added (even
// one at the same hours and Send by as another), moved or edited never re-sends one a lead has had, a
// step moved earlier still goes to the leads waiting for it, and editing one step doesn't drop another
// that's due but waiting for the quiet hours or a hold. A step added after one was removed still reaches
// the leads that had finished the shorter list; two jobs joined in a merge keep what each had, one from
// before ids too; a page opened before ids and saved after keeps every step's id; and the note on CRM
// settings says the same. Those leads are put back once the Save has answered, in a few writes and past
// PostgREST's 1,000-row pages; a run that fails or is cut off is finished by the next Save or the
// every-minute job, and never leaves a lead from before ids with part of what it had. A run goes by the saved settings
// (if they can't be read, the note stays), writes a lead only while it is as the run read it, clears only the note it
// read, and leaves it after a run that did work; the every-minute job's pass goes by the list saved when it starts.
// Usage: node --experimental-strip-types scripts/test-crm-automation.mjs
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as kit from './site-test-kit.mjs';

const db = kit.setup({
  '@/lib/crm/server': `${kit.STUBS['@/lib/crm/server']}
    export async function ensurePortalToken() { return 'portal-token'; }
    export const portalUrl = (t) => 'https://heliaxis.test/my/' + t;`,
  '@/lib/crm/booking-link': `export async function ensureBookingToken() { return 'booking-token'; } export const bookingUrl = (t) => 'https://heliaxis.test/book/' + t;`,
  '@/lib/crm/move-stage': 'export async function applyStageEvent() { return { ok: true }; }',
  '@/lib/whatsapp/inbox': `export async function sendSystem(enquiryId, msg, via) { globalThis.__rec.whatsapp.push({ enquiryId, text: msg.text, via }); return { ok: true }; }`,
  '@/lib/ms365': `export const msConfigured = () => true; export const mailbox = () => 'office@heliaxis.test'; export async function sendMail(m) { globalThis.__rec.email.push(m); return 'graph-' + globalThis.__rec.email.length; }`,
  // No quiet hours, so the sequence runs whatever the time of the test.
  '@/lib/whatsapp/settings': 'export async function getSettings() { return { quietFromMin: 0, quietToMin: 0, lateRule: false, lateFromMin: 1230, lateSendAtMin: 420 }; }',
});
const { eq } = kit;
const A = await import('../src/lib/crm/automation.ts');
const S = await import('../src/lib/crm/settings-shared.ts');
const settingsRoute = await import('../src/app/api/crm/settings/route.ts');
const M = await import('../src/lib/crm/merge-rules.ts');
const C = await import('../src/lib/setup-checks.ts');

const person = (name, o = {}) => ({ id: randomUUID(), full_name: name, email: `${name.toLowerCase()}@heliaxis.test`, status: 'approved', role: 'member', portals: ['crm'], ...o });
const settings = () => JSON.parse(db.rows('cms_kv').find((r) => r.key === 'crm-settings')?.value ?? '{}');
const setSettings = (s) => {
  db.t.cms_kv = db.rows('cms_kv').filter((r) => r.key !== 'crm-settings');
  db.rows('cms_kv').push({ key: 'crm-settings', value: JSON.stringify(s) });
};
const lead = (o = {}) => {
  const p = { id: randomUUID(), enquiry_id: randomUUID(), title: 'Solar', stage: 'lead', owner_id: null, created_at: new Date().toISOString(), sequence_step: 0, sequence_stopped_at: null, reminders_sent: [], ...o };
  db.rows('crm_projects').push(p);
  db.rows('enquiries').push({ id: p.enquiry_id, name: 'Jane Smith', email: 'jane@example.test' });
  return p;
};
const ownerOf = (p) => db.rows('crm_projects').find((x) => x.id === p.id).owner_id;

/* ── Who gets a new lead ───────────────────────────────────────────────────── */

const esther = person('Esther');
const callum = person('Callum', { role: 'admin', portals: [] });
const leaver = person('Leaver');
db.t.profiles = [esther, callum, leaver];
setSettings({ leadRotation: [esther.id, leaver.id, callum.id], rotationIndex: 0 });

const turns = async (n) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = lead();
    out.push(await A.assignNewLead(p.id, 'Jane Smith', p.enquiry_id));
    if (ownerOf(p) !== out.at(-1)) out.push('owner not set');
  }
  return out;
};
const names = (ids) => ids.map((id) => [esther, callum, leaver].find((p) => p.id === id)?.full_name ?? id);
eq('everyone with CRM access takes a turn (an admin counts)', names(await turns(3)), ['Esther', 'Leaver', 'Callum']);

// The leaver is rejected on the Users page, without being unticked in CRM settings first.
leaver.status = 'rejected';
globalThis.__rec.notify.length = 0;
eq('someone rejected is skipped: new leads go to the others in turn', names(await turns(4)), ['Esther', 'Callum', 'Esther', 'Callum']);
eq('…and only the people who got a lead were told', [...new Set(globalThis.__rec.notify.map((n) => n.userId))].sort(), [esther.id, callum.id].sort());
eq('…they stay ticked in CRM settings', settings().leadRotation, [esther.id, leaver.id, callum.id]);

leaver.status = 'pending';
eq('set back to pending: skipped too', names(await turns(2)).includes('Leaver'), false);
leaver.status = 'approved';
leaver.portals = ['enquiries'];
eq('CRM portal taken away: skipped too', names(await turns(2)).includes('Leaver'), false);

// Their access comes back: they're back in turn without anyone ticking them again.
leaver.portals = ['crm', 'enquiries'];
eq('access back: they take turns again by themselves', names(await turns(3)), ['Esther', 'Leaver', 'Callum']);

// Someone drops out part-way round, then comes back: the turn order holds both times (nobody gets two
// in a row, nobody misses a turn), as the person skipped keeps their place.
setSettings({ leadRotation: [esther.id, leaver.id, callum.id], rotationIndex: 0 });
const order = names(await turns(2));
esther.status = 'rejected';
order.push('|', ...names(await turns(3)));
esther.status = 'approved';
order.push('|', ...names(await turns(3)));
eq('the turn order holds when someone drops out part-way round, and when they come back', order.join(' '), 'Esther Leaver | Callum Leaver Callum | Esther Leaver Callum');

// Nobody on the rotation can open the CRM: the lead stays unassigned and nobody is told.
db.t.profiles = [{ ...esther, status: 'rejected' }, { ...callum, status: 'rejected' }, { ...leaver, status: 'rejected' }];
globalThis.__rec.notify.length = 0;
const orphan = lead();
eq('nobody left on the rotation: the lead is left unassigned, nobody told', [await A.assignNewLead(orphan.id, 'Jane Smith'), ownerOf(orphan), globalThis.__rec.notify.length], [null, null, 0]);
db.t.profiles = [esther, callum, leaver];

// A lead someone already has isn't touched (only unassigned leads are given out).
const taken = lead({ owner_id: leaver.id });
leaver.status = 'rejected';
await A.assignNewLead(taken.id, 'Jane Smith');
eq('a lead already assigned (even to someone who has left) is left alone', ownerOf(taken), leaver.id);

/* ── The "Choose who gets new leads" to-do (From Claude) ───────────────────── */

// It counts only the people the rotation will use, as the settings screen shows them ticked: when everyone
// ticked has lost CRM access, new leads go to nobody, so it comes back.
const rotationTodo = async () => (await C.setupTodos({})).find((t) => t.id === 'crm-rotation')?.detail ?? 'none';
leaver.status = 'approved';
setSettings({ leadRotation: [esther.id, leaver.id, callum.id], rotationIndex: 0 });
eq('someone ticked can open the CRM: no to-do', await rotationTodo(), 'none');
db.t.profiles = [{ ...esther, status: 'rejected' }, { ...callum, status: 'pending' }, { ...leaver, portals: ['enquiries'] }];
eq('nobody ticked can open the CRM any more: the to-do is back, and says why', await rotationTodo(), 'Nobody ticked for new leads can open the CRM any more, so new leads stay unassigned and nobody gets the “New lead for you” notification.');
db.t.profiles = [];
eq('…the same when they’ve been deleted', (await rotationTodo()).startsWith('Nobody ticked'), true);

// Ticked off on From Claude back when people were first ticked: it still comes back as a job to do, not
// greyed at the bottom as "waiting to confirm", as that tick can't have been about access lost since.
const rotationTicked = async () => !!(await C.setupTodos({})).find((t) => t.id === 'crm-rotation')?.ticked;
db.t.profiles = [esther, callum, leaver];
db.rows('cms_kv').push({ key: 'setup-done', value: JSON.stringify(['crm-rotation']) });
eq('ticked off, then someone ticked can open the CRM: the to-do goes and the tick is used up', [await rotationTodo(), (await C.doneManual()).includes('crm-rotation')], ['none', false]);
db.t.profiles = [{ ...esther, status: 'rejected' }];
eq('…so when nobody ticked can open the CRM any more, it’s back unticked', [(await rotationTodo()).startsWith('Nobody ticked'), await rotationTicked()], [true, false]);

// The admin is happy for new leads to stay unassigned and ticks it off now: that tick lasts, as it does
// for the other jobs, until someone ticked can open the CRM again.
await C.markDone('crm-rotation');
eq('ticked off after it came back: still ticked on the next loads', [await rotationTicked(), await rotationTicked()], [true, true]);
db.t.profiles = [esther];
eq('someone ticked can open the CRM again: the to-do goes', await rotationTodo(), 'none');
db.t.profiles = [{ ...esther, status: 'rejected' }];
eq('…and if they lose access again, it’s back unticked', await rotationTicked(), false);
await C.markDone('crm-rotation');
setSettings({ leadRotation: [], rotationIndex: 0 });
eq('nobody ticked: a tick still greys it, as before', await rotationTicked(), true);
db.t.cms_kv = db.rows('cms_kv').filter((r) => r.key !== 'setup-done');
eq('nobody ticked: the to-do, as before', await rotationTodo(), 'New leads are handed out in turn and that person gets a notification.');

// People can't be looked up: it goes by the ticks, rather than nag on a guess, and leaves a tick it can't judge.
setSettings({ leadRotation: [esther.id], rotationIndex: 0 });
db.rows('cms_kv').push({ key: 'setup-done', value: JSON.stringify(['crm-rotation']) });
const down = { select: () => down, eq: () => down, in: () => down, then: (res, rej) => Promise.resolve({ data: null, error: { message: 'down' } }).then(res, rej) };
globalThis.__db = { ...db, from: (t) => (t === 'profiles' ? down : db.from(t)) };
eq('people can’t be looked up: no to-do while someone is ticked', await rotationTodo(), 'none');
globalThis.__db = db;
eq('…and a tick on it stays, so a short outage can’t clear it', (await C.doneManual()).includes('crm-rotation'), true);

// The tick is used up from the list the card has just read: if reading the ticks fails after that, the other
// ticks are still there.
const ticked = () => JSON.parse(db.rows('cms_kv').find((r) => r.key === 'setup-done')?.value ?? '[]');
db.t.profiles = [esther];
db.rows('cms_kv').find((r) => r.key === 'setup-done').value = JSON.stringify(['crm-rotation', 'q-home-by', 'meta-leadgen']);
let doneReads = 0;
globalThis.__db = {
  ...db,
  from: (t) => {
    const q = db.from(t);
    if (t !== 'cms_kv') return q;
    let key;
    const { eq: where, maybeSingle } = q;
    q.eq = (c, v) => ((key = v), where(c, v));
    q.maybeSingle = () => (key === 'setup-done' && ++doneReads > 1 ? Promise.resolve({ data: null, error: { message: 'timed out' } }) : maybeSingle());
    return q;
  },
};
await rotationTodo();
globalThis.__db = db;
eq('the ticks can’t be read a second time: the tick on it is used up and the others are still there', ticked(), ['q-home-by', 'meta-leadgen']);

// Ticked off, but the card doesn't load while someone ticked can open the CRM: nothing has used the tick up.
db.t.profiles = [{ ...esther, status: 'rejected' }];
db.rows('cms_kv').find((r) => r.key === 'setup-done').value = JSON.stringify(['crm-rotation']);
eq('ticked off, and the card only loads once nobody ticked can open the CRM: it comes back still ticked', await rotationTicked(), true);
db.t.cms_kv = db.rows('cms_kv').filter((r) => r.key !== 'setup-done');
db.t.profiles = [esther, callum, leaver];

/* ── The follow-up sequence ────────────────────────────────────────────────── */

const HOUR = 3_600_000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const D = S.DEFAULT_CRM_SETTINGS;
eq('the default sequence: WhatsApp at 24h, email at 72h, off', [D.sequence.map((x) => [x.id, x.afterHours, x.channel]), D.sequenceEnabled], [[['1', 24, 'whatsapp'], ['2', 72, 'email']], false]);

// Steps by id.
const ids = S.cleanCrmSettings({ sequence: [...D.sequence, { id: '', afterHours: 120, channel: 'email', text: 'Last one' }, { ...D.sequence[0], text: 'A repeat' }] }).sequence.map((x) => x.id);
eq('a step keeps its id; one just added, or a repeat, gets its own', [ids[0], ids[2], new Set(ids).size, /^[0-9a-f]{8}$/.test(ids[1]) && /^[0-9a-f]{8}$/.test(ids[3])], ['1', '2', 4, true]);
eq('steps saved before ids are named by their place in the list', S.storedSteps([{ afterHours: 24, text: 'a' }, { afterHours: 72, text: 'c' }]).map((x) => x.id), ['1', '2']);

// Who a step goes to: leads that came in from its leadsFrom on.
const now = new Date('2026-10-22T10:00:00Z');
const before = (h) => new Date(now.getTime() - h * HOUR).toISOString();
const on = { ...D, sequenceEnabled: true, sequence: D.sequence.map((x) => ({ ...x, leadsFrom: '2026-10-01T09:00:00.000Z' })) };
const froms = (seq) => seq.map((x) => x.leadsFrom);
eq('switched on: every step goes to the leads it falls due for from now', froms(S.sequenceAfterSave(D, { ...D, sequenceEnabled: true }, now)), [before(24), before(72)]);
eq('saved again, nothing new: as it was', froms(S.sequenceAfterSave(on, on, now)), froms(on.sequence));
eq('a step’s words, hours or Send by changed: as it was', froms(S.sequenceAfterSave(on, { ...on, sequence: [{ ...on.sequence[0], text: 'Hello' }, { ...on.sequence[1], afterHours: 48, channel: 'whatsapp' }] }, now)), froms(on.sequence));
eq('a step added: only that one from now', froms(S.sequenceAfterSave(on, { ...on, sequence: [...on.sequence, { id: 'n1', afterHours: 120, channel: 'email', text: 'Last one' }] }, now)), [...froms(on.sequence), before(120)]);
eq('a second step at the same hours and Send by as another: added too', froms(S.sequenceAfterSave(on, { ...on, sequence: [on.sequence[0], { id: 'n2', afterHours: 24, channel: 'whatsapp', text: 'Second nudge' }, on.sequence[1]] }, now)), [on.sequence[0].leadsFrom, before(24), on.sequence[1].leadsFrom]);
eq('a step removed: the others as they were', froms(S.sequenceAfterSave(on, { ...on, sequence: [on.sequence[1]] }, now)), [on.sequence[1].leadsFrom]);
eq('switched off: kept (switching on again starts again)', froms(S.sequenceAfterSave(on, { ...on, sequenceEnabled: false }, now)), froms(on.sequence));
eq('a sequence running from before this (no times): still none', froms(S.sequenceAfterSave({ ...D, sequenceEnabled: true }, { ...D, sequenceEnabled: true, reviewDelayDays: 5 }, now)), [undefined, undefined]);
eq('saved steps keep it; rubbish is dropped', froms(S.cleanCrmSettings({ sequence: [{ ...D.sequence[0], leadsFrom: before(24) }, { ...D.sequence[1], leadsFrom: 'soon' }] }).sequence), [before(24), undefined]);

// Which steps a lead has had, and its next one.
eq('the steps a lead has had, by id', S.sequenceHad(['review', 'seq:1', 'seq:a1b2c3d4'], 2), ['1', 'a1b2c3d4']);
eq('a lead from before ids: the first ones, by place', [S.sequenceHad([], 2), S.sequenceHad(null, 0)], [['1', '2'], []]);
const since = '2026-10-22T10:00:00.000Z';
const switched = S.sequenceAfterSave(D, { ...D, sequenceEnabled: true }, new Date(since));
const at = (h) => new Date(Date.parse(since) - h * HOUR).toISOString();
eq('a lead from 10 days before: both steps skipped', S.sequenceNext(switched, [], at(240)), { at: 2, skip: ['1', '2'] });
eq('a lead from 2 days before: the 24h step skipped, the 72h one still to come', S.sequenceNext(switched, [], at(48)), { at: 1, skip: ['1'] });
eq('a lead from 23h before: nothing skipped (its 24h step falls due after)', S.sequenceNext(switched, [], at(23)), { at: 0, skip: [] });
eq('a lead from after it was switched on: nothing skipped', S.sequenceNext(switched, [], at(-1)), { at: 0, skip: [] });
eq('a step it has had is passed over, not skipped', S.sequenceNext(switched, ['1'], at(48)), { at: 1, skip: [] });
eq('settings from before this (no times): nothing skipped', S.sequenceNext(D.sequence, [], at(240)), { at: 0, skip: [] });

// The runner, a minute after the sequence was switched on.
const switchedOn = (h) => ({ ...D, sequenceEnabled: true, firstResponseMinutes: 0, sequence: S.sequenceAfterSave(D, { ...D, sequenceEnabled: true }, new Date(Date.now() - h * HOUR)) });
const reset = (h) => {
  db.t.crm_projects = [];
  db.t.enquiries = [];
  globalThis.__rec.whatsapp.length = 0;
  globalThis.__rec.email.length = 0;
  setSettings(switchedOn(h));
};
reset(1 / 60);
const old = lead({ stage: 'contacted', created_at: ago(10 * 24 * HOUR) });
const twoDays = lead({ created_at: ago(48 * HOUR) });
const justDue = lead({ created_at: ago(24 * HOUR + 30_000) }); // its 24h step fell due 30 s ago, after switch-on
const fresh = lead({ created_at: ago(HOUR) });
const stepOf = (p) => db.rows('crm_projects').find((x) => x.id === p.id).sequence_step;
const hadOf = (p) => db.rows('crm_projects').find((x) => x.id === p.id).reminders_sent.filter((k) => k.startsWith('seq:')).length;
const run1 = await A.runCrmAutomations();
eq('switched on: only the step that fell due after it is sent', [run1.sequence, globalThis.__rec.whatsapp.map((m) => m.enquiryId), globalThis.__rec.email.length], [1, [justDue.enquiry_id], 0]);
eq('…older overdue steps are skipped (both for a 10-day-old lead, the 24h one for a 2-day-old lead)', [stepOf(old), stepOf(twoDays), stepOf(justDue), stepOf(fresh)], [2, 1, 1, 0]);
eq('…quietly: nothing on their timelines', globalThis.__rec.activity.filter((a) => [old.id, twoDays.id].includes(a.projectId)).length, 0);
const run2 = await A.runCrmAutomations();
eq('a minute later: nothing more (no burst of catch-up messages)', [run2.sequence, globalThis.__rec.whatsapp.length, globalThis.__rec.email.length], [0, 1, 0]);

// A sequence already running before this (no ids or times saved) carries on as it did.
setSettings({ ...D, sequenceEnabled: true, firstResponseMinutes: 0, sequence: D.sequence.map((x) => ({ ...x, id: undefined })) });
const running = lead({ created_at: ago(30 * HOUR) });
await A.runCrmAutomations();
eq('settings saved before this: a due step is sent as before', [stepOf(running), globalThis.__rec.whatsapp.at(-1)?.enquiryId], [1, running.enquiry_id]);

// Saving CRM settings sets the times on the server. What Next runs once the answer has gone (after()) runs too.
const save = (body) => kit.call(settingsRoute, '/api/crm/settings', { method: 'PUT', body });
const put = async (body) => {
  const r = await save(body);
  await kit.afterReply();
  return r;
};
const page = async () => (await kit.call(settingsRoute, '/api/crm/settings', { method: 'GET' })).body.settings;
const counting = () => settings().sequence.map((x) => Date.parse(x.leadsFrom) + x.afterHours * HOUR);
setSettings({ ...D });
const t0 = Date.now();
const p1 = await put({ ...(await page()), sequenceEnabled: true, sequence: D.sequence.map((x) => ({ ...x, leadsFrom: '2020-01-01T00:00:00.000Z' })) });
const from1 = counting();
eq('switching it on (Save) starts every step counting now, whatever the page sent', [p1.status, from1.every((t) => t >= t0 && t <= Date.now())], [200, true]);
await put({ ...(await page()), reviewDelayDays: 5 });
eq('saving something else keeps them', counting(), from1);

// Steps changed while it's running (switched on 10 days ago).
reset(240);
const finished = lead({ created_at: ago(120 * HOUR), sequence_step: 2, reminders_sent: ['seq:1', 'seq:2'] });
const halfway = lead({ created_at: ago(30 * HOUR), sequence_step: 1, reminders_sent: ['seq:1'] });
const finishedBefore = lead({ created_at: ago(120 * HOUR), sequence_step: 2 }); // from before ids: only its sequence_step
const halfwayBefore = lead({ created_at: ago(30 * HOUR), sequence_step: 1 });
let cur = await page();
await put({ ...cur, sequence: [...cur.sequence, { id: '', afterHours: 24, channel: 'whatsapp', text: 'Hi {first_name}, a second nudge' }] });
await A.runCrmAutomations();
eq('a second 24h WhatsApp added: nothing is sent again, and the new one isn’t sent late', [globalThis.__rec.whatsapp.length, globalThis.__rec.email.length], [0, 0]);
eq('…leads that had them all, or the first, are where they were (from before ids too)', [finished, halfway, finishedBefore, halfwayBefore].map(stepOf), [3, 2, 3, 2]);
eq('…what the leads from before ids had is written down by id', [hadOf(finishedBefore), hadOf(halfwayBefore)], [3, 2]);
cur = await page();
await put({ ...cur, sequence: [{ id: '', afterHours: 12, channel: 'whatsapp', text: 'Hi {first_name}, an early one' }, ...cur.sequence] });
await A.runCrmAutomations();
eq('a step added in front of the others: still nothing sent again', [globalThis.__rec.whatsapp.length, globalThis.__rec.email.length], [0, 0]);

reset(240);
const waiting = lead({ created_at: ago(60 * HOUR), sequence_step: 1, reminders_sent: ['seq:1'] });
cur = await page();
await put({ ...cur, sequence: [cur.sequence[0], { ...cur.sequence[1], afterHours: 48 }] });
await A.runCrmAutomations();
eq('the email moved from 72h to 48h: a lead 60h in, waiting for it, gets it now', [globalThis.__rec.email.length, stepOf(waiting)], [1, 2]);

reset(10);
const early = lead({ created_at: ago(70 * HOUR), sequence_step: 1, reminders_sent: ['seq:1'] });
cur = await page();
await put({ ...cur, sequence: [cur.sequence[0], { ...cur.sequence[1], afterHours: 48 }] });
await A.runCrmAutomations();
eq('…even with the sequence switched on since its new time (the lead was waiting for it then)', [globalThis.__rec.email.length, stepOf(early)], [1, 2]);

reset(240);
const overnight = lead({ created_at: ago(30 * HOUR) }); // its 24h WhatsApp fell due 6h ago, in the quiet hours
cur = await page();
await put({ ...cur, sequence: [...cur.sequence, { id: '', afterHours: 120, channel: 'email', text: 'Hi {first_name}, a last one' }] });
await A.runCrmAutomations();
eq('a step added while a due WhatsApp waits for the quiet hours to end: it still goes', [globalThis.__rec.whatsapp.map((m) => m.enquiryId), stepOf(overnight)], [[overnight.enquiry_id], 1]);

reset(240);
const held = lead({ created_at: ago(30 * HOUR), on_hold: true });
await A.runCrmAutomations();
eq('a job on hold: its due follow-up waits', globalThis.__rec.whatsapp.length, 0);
cur = await page();
await put({ ...cur, sequence: [cur.sequence[0], { ...cur.sequence[1], channel: 'whatsapp' }] });
db.rows('crm_projects').find((x) => x.id === held.id).on_hold = false;
await A.runCrmAutomations();
eq('…another step’s Send by changed meanwhile: it goes when the hold lifts', [globalThis.__rec.whatsapp.map((m) => m.enquiryId), stepOf(held)], [[held.enquiry_id], 1]);

// A step added after one was removed: leads that had finished the shorter list are found again (their
// sequence_step was the list's length, so the runner's query had stopped looking at them).
const hoursPass = (h) => {
  for (const p of db.rows('crm_projects')) p.created_at = new Date(Date.parse(p.created_at) - h * HOUR).toISOString();
  setSettings({ ...settings(), sequence: settings().sequence.map((x) => ({ ...x, leadsFrom: x.leadsFrom && new Date(Date.parse(x.leadsFrom) - h * HOUR).toISOString() })) });
};
const sentTo = () => globalThis.__rec.activity.filter((a) => /^Follow-up \d sent/.test(a.body)).map((a) => a.projectId);
const replaced = async (twoSaves) => {
  reset(240);
  globalThis.__rec.activity.length = 0;
  const had = lead({ created_at: ago(80 * HOUR), sequence_step: 2, reminders_sent: ['seq:1', 'seq:2'] });
  const hadBefore = lead({ created_at: ago(80 * HOUR), sequence_step: 2 }); // from before ids
  const past = lead({ created_at: ago(100 * HOUR), sequence_step: 2, reminders_sent: ['seq:1', 'seq:2'] });
  const later = { id: '', afterHours: 96, channel: 'email', text: 'Hi {first_name}, one more' };
  cur = await page();
  if (twoSaves) {
    await put({ ...cur, sequence: [cur.sequence[0]] });
    await A.runCrmAutomations();
    cur = await page();
  }
  await put({ ...cur, sequence: [cur.sequence[0], later] });
  await A.runCrmAutomations();
  const early = sentTo().length;
  hoursPass(17);
  await A.runCrmAutomations();
  const quiet = globalThis.__rec.activity.filter((a) => a.projectId === past.id).length;
  return { got: [early, sentTo().sort()], want: [0, [had.id, hadBefore.id].sort()], past: [stepOf(past), hadOf(past), quiet] };
};
const swapped = await replaced(false);
eq('the 72h email swapped for a 96h one: leads 80h in that had both get it when it falls due (from before ids too)', swapped.got, swapped.want);
eq('…a lead already past 96h skips it quietly', swapped.past, [2, 3, 0]);
const twice = await replaced(true);
eq('…the same with the email removed in one save and the 96h one added in another', twice.got, twice.want);

reset(240);
globalThis.__rec.activity.length = 0;
const undone = lead({ created_at: ago(30 * HOUR), sequence_step: 1, reminders_sent: ['seq:1'] });
cur = await page();
await put({ ...cur, sequence: [{ id: '', afterHours: 12, channel: 'whatsapp', text: 'Hi {first_name}, an early one' }, ...cur.sequence] });
await A.runCrmAutomations();
cur = await page();
await put({ ...cur, sequence: cur.sequence.filter((x) => x.afterHours !== 12) });
hoursPass(43);
await A.runCrmAutomations();
eq('a 12h step added, then removed again: a lead waiting for the 72h email still gets it', [sentTo(), stepOf(undone)], [[undone.id], 2]);

// Putting those leads back happens once the Save has answered, in a few writes. A run that fails or is cut off is
// finished by the next Save or the every-minute job, and never leaves a lead from before ids with part of what it had.
const noted = () => db.rows('cms_kv').some((r) => r.key === 'crm-sequence-check');
const quietly = async (fn) => {
  const was = console.error;
  const logged = [];
  console.error = (...a) => logged.push(a.join(' '));
  try {
    await fn();
  } finally {
    console.error = was;
  }
  return logged;
};
reset(240);
globalThis.__rec.activity.length = 0;
const swappedBefore = lead({ created_at: ago(80 * HOUR), sequence_step: 2 }); // from before ids: had both
cur = await page();
globalThis.__db = {
  ...db,
  from: (t) => {
    if (t === 'crm_projects') throw new Error('function timed out');
    return db.from(t);
  },
};
const answer = await save({ ...cur, sequence: [cur.sequence[0], { id: '', afterHours: 96, channel: 'email', text: 'Hi {first_name}, one more' }] }).catch((e) => ({ status: e.message }));
const logged = await quietly(() => kit.afterReply());
globalThis.__db = db;
eq('the 72h email swapped while the leads can’t be put back: the Save still answers that it saved', [answer.status, answer.body?.settings?.sequence.map((x) => x.afterHours), settings().sequence.map((x) => x.afterHours), logged.length], [200, [24, 96], [24, 96], 1]);
await A.runCrmAutomations();
hoursPass(17);
await A.runCrmAutomations();
eq('…the every-minute job puts them back: the lead gets the 96h email once, and nothing is left to do', [sentTo(), stepOf(swappedBefore), noted()], [[swappedBefore.id], 2, false]);

// Three steps saved before ids, and leads from before ids that had all three. The Save swaps the WhatsApp for a 200h
// email, and the run after it is cut off (the time limit) after its second write.
reset(240);
globalThis.__rec.activity.length = 0;
setSettings({ ...D, sequenceEnabled: true, firstResponseMinutes: 0, sequence: [
  { afterHours: 24, channel: 'whatsapp', text: 'Hi {first_name}, a nudge' },
  { afterHours: 72, channel: 'email', text: 'Hi {first_name}, the 72h email' },
  { afterHours: 120, channel: 'email', text: 'Hi {first_name}, the 120h email' },
] });
const hadThree = [1, 2, 3].map(() => lead({ created_at: ago(130 * HOUR), sequence_step: 3 }));
cur = await page();
let writes = 0;
const write = () => {
  if (++writes > 2) throw new Error('function timed out');
};
globalThis.__db = {
  ...db,
  rpc: (...a) => (write(), db.rpc(...a)),
  from: (t) => {
    const q = db.from(t);
    const update = q.update;
    if (t === 'crm_projects') q.update = (v) => (write(), update(v));
    return q;
  },
};
await quietly(() => put({ ...cur, sequence: [cur.sequence[1], cur.sequence[2], { id: '', afterHours: 200, channel: 'email', text: 'Hi {first_name}, the 200h email' }] }).catch(() => null));
globalThis.__db = db;
const rowOf = (p) => db.rows('crm_projects').find((x) => x.id === p.id);
eq('cut off part-way: each lead from before ids is as it was, or has all three written down by id (never part)', hadThree.map((p) => (rowOf(p).reminders_sent.length ? `${rowOf(p).reminders_sent.join(' ')} at ${rowOf(p).sequence_step}` : `as it was at ${rowOf(p).sequence_step}`)).sort(), ['as it was at 3', 'seq:1 seq:2 seq:3 at 2', 'seq:1 seq:2 seq:3 at 2']);
await put({ ...(await page()), reviewDelayDays: 5 });
eq('…the next Save finishes it, whatever it changes', hadThree.map(stepOf), [2, 2, 2]);
cur = await page();
await put({ ...cur, sequence: [...cur.sequence, { id: '', afterHours: 300, channel: 'email', text: 'Hi {first_name}, the 300h email' }] });
await A.runCrmAutomations();
hoursPass(75);
await A.runCrmAutomations();
eq('…and after another step is added, nothing they had is sent again: each gets the 200h email once', [globalThis.__rec.email.map((m) => m.text), globalThis.__rec.whatsapp.length], [Array(3).fill('Hi Jane, the 200h email'), 0]);

// 1,150 leads that had finished the list, 50 of them from before ids: every one is put back, past the 1,000 rows
// PostgREST hands back at once, in one write for each lead from before ids and one for each 100 others.
reset(240);
const finishedMany = [
  ...Array.from({ length: 1100 }, () => lead({ created_at: ago(80 * HOUR), sequence_step: 2, reminders_sent: ['seq:1', 'seq:2'] })),
  ...Array.from({ length: 50 }, () => lead({ created_at: ago(80 * HOUR), sequence_step: 2 })),
];
let requests = 0;
globalThis.__db = {
  ...db,
  rpc: (...a) => (requests++, db.rpc(...a)),
  from: (t) => {
    const q = db.from(t);
    if (t !== 'crm_projects') return q;
    requests++;
    const then = q.then;
    q.then = (res, rej) => then((r) => res(r.data?.length > 1000 ? { ...r, data: r.data.slice(0, 1000) } : r), rej);
    return q;
  },
};
cur = await page();
await put({ ...cur, sequence: [cur.sequence[0], { id: '', afterHours: 96, channel: 'email', text: 'Hi {first_name}, one more' }] });
globalThis.__db = db;
eq('1,150 leads that had finished the list: all put back, in 3 reads, a write for each of the 50 from before ids and one for each 100 others', [finishedMany.filter((p) => stepOf(p) === 1).length, requests], [1150, 3 + 50 + 11]);

// The rules the put-back keeps while something else is writing. `interrupt` runs `fn` just before the first `method` on
// `table` is answered: a Save, or another write, landing in the middle of a run.
const interrupt = (table, method, fn) => {
  let hit = false;
  return {
    ...db,
    from: (t) => {
      const q = db.from(t);
      if (t !== table) return q;
      const call = q[method];
      q[method] = (...a) => {
        const b = call(...a);
        const then = b.then;
        b.then = (res, rej) => (hit ? then(res, rej) : ((hit = true), Promise.resolve(fn()).then(() => then(res, rej), rej)));
        return b;
      };
      return q;
    },
  };
};
// The saved settings can't be read, from the nth read on.
const settingsDown = (n = 1) => {
  let reads = 0;
  return {
    ...db,
    from: (t) => {
      const q = db.from(t);
      if (t !== 'cms_kv') return q;
      let key;
      const eqKey = q.eq;
      const maybeSingle = q.maybeSingle;
      q.eq = (c, v) => ((key = v), eqKey(c, v));
      q.maybeSingle = async () => (key === 'crm-settings' && ++reads >= n ? { data: null, error: { message: 'read failed' } } : maybeSingle());
      return q;
    },
  };
};
const noteValue = () => db.rows('cms_kv').find((r) => r.key === 'crm-sequence-check')?.value;
const oneMore = { id: '', afterHours: 96, channel: 'email', text: 'Hi {first_name}, one more' };

// A lead is written to only while it is as the run read it. A key added or taken away, or a place moved, in the middle
// of the run is kept, and the lead is left for the next run (or, moved, for the every-minute job).
reset(240);
const keyAdded = lead({ created_at: ago(80 * HOUR), sequence_step: 2 }); // from before ids
const keyTaken = lead({ created_at: ago(80 * HOUR), sequence_step: 2, reminders_sent: ['review'] });
const placeMoved = lead({ created_at: ago(80 * HOUR), sequence_step: 2 });
const idsMoved = lead({ created_at: ago(80 * HOUR), sequence_step: 2, reminders_sent: ['seq:1', 'seq:2'] });
cur = await page();
await save({ ...cur, sequence: [cur.sequence[0], oneMore] });
globalThis.__db = interrupt('crm_projects', 'update', () => {
  rowOf(keyAdded).reminders_sent = ['review'];
  rowOf(keyTaken).reminders_sent = [];
  rowOf(placeMoved).sequence_step = 3;
  rowOf(idsMoved).sequence_step = 0;
});
await kit.afterReply();
globalThis.__db = db;
eq('leads changed by something else in the middle of the run: a key added is kept, and none of them is written over', [rowOf(keyAdded).reminders_sent, rowOf(keyAdded).sequence_step], [['review'], 2]);
eq('…a key taken away is kept too', [rowOf(keyTaken).reminders_sent, rowOf(keyTaken).sequence_step], [[], 2]);
eq('…a place moved, from before ids or not: as it was moved', [[rowOf(placeMoved).reminders_sent, rowOf(placeMoved).sequence_step], [rowOf(idsMoved).reminders_sent, rowOf(idsMoved).sequence_step]], [[[], 3], [['seq:1', 'seq:2'], 0]]);
await A.finishSequenceChange();
eq('…the next run puts back the ones still past the end, with what was added meanwhile', [rowOf(keyAdded), rowOf(keyTaken)].map((p) => [p.reminders_sent, p.sequence_step]), [[['review', 'seq:1', 'seq:2'], 1], [['seq:1', 'seq:2'], 1]]);

// A run that put leads back leaves the note, in case a Save landed meanwhile; the next run, finding none, clears it.
reset(240);
const putBack = lead({ created_at: ago(80 * HOUR), sequence_step: 2, reminders_sent: ['seq:1', 'seq:2'] });
cur = await page();
await put({ ...cur, sequence: [cur.sequence[0], oneMore] });
eq('a run that put a lead back leaves the note', [stepOf(putBack), noted()], [1, true]);
eq('…and the next run, finding none left, clears it', [await A.finishSequenceChange(), noted()], [0, false]);

// A second Save landing while a run finds nothing left: the run clears only the note it read, so the new one stays and
// its own run puts the lead back.
reset(240);
const forSecond = lead({ created_at: ago(80 * HOUR), sequence_step: 2, reminders_sent: ['seq:1', 'seq:2'] });
cur = await page();
await save({ ...cur, sequence: [...cur.sequence, { id: '', afterHours: 120, channel: 'email', text: 'Hi {first_name}, a last one' }] });
const firstNote = noteValue();
globalThis.__db = interrupt('cms_kv', 'delete', async () => {
  await new Promise((r) => setTimeout(r, 5)); // so its note has a later time than the first
  const now = await page();
  await save({ ...now, sequence: [now.sequence[0], oneMore] });
});
await kit.afterReply();
globalThis.__db = db;
eq('a second Save landing in the middle of a run that finds nothing: its note is still there', [noted(), noteValue() !== firstNote, stepOf(forSecond)], [true, true, 2]);
await kit.afterReply();
eq('…and its run puts the lead back', [stepOf(forSecond), noted()], [1, true]);

// The saved settings can't be read (or aren't there): the run must not take the defaults for them, find nothing owed
// and clear the note.
reset(240);
const owedWith = lead({ created_at: ago(80 * HOUR), sequence_step: 2, reminders_sent: ['seq:1', 'seq:2'] });
const owedBefore = lead({ created_at: ago(80 * HOUR), sequence_step: 2 }); // from before ids
cur = await page();
await save({ ...cur, sequence: [cur.sequence[0], oneMore] });
const swappedSettings = settings();
globalThis.__db = settingsDown();
const unread = await quietly(() => kit.afterReply());
globalThis.__db = db;
eq('the settings can’t be read in the run after a Save: it says so, leaves the leads, and the note stays', [unread.length, /read failed/.test(unread[0]), [owedWith, owedBefore].map(stepOf), noted()], [1, true, [2, 2], true]);
db.t.cms_kv = db.rows('cms_kv').filter((r) => r.key !== 'crm-settings');
const unsaved = await A.finishSequenceChange().then(() => 'finished', (e) => e.message);
eq('…and no saved settings is the same: it throws, and the note stays', [unsaved, [owedWith, owedBefore].map(stepOf), noted()], ['CRM settings are not saved', [2, 2], true]);
setSettings(swappedSettings);
eq('…once they can be read, the next run puts both back', [await A.finishSequenceChange(), [owedWith, owedBefore].map(stepOf)], [2, [1, 1]]);

// The every-minute job goes by the list as saved when its sequence pass starts: a Save landing after it read the settings
// has had its leads put back, and the pass must not undo that with the old list.
reset(240);
globalThis.__rec.activity.length = 0;
const midRun = lead({ created_at: ago(80 * HOUR), sequence_step: 2, reminders_sent: ['seq:1', 'seq:2'] });
cur = await page();
globalThis.__db = interrupt('crm_projects', 'select', () => put({ ...cur, sequence: [cur.sequence[0], oneMore] }));
await A.runCrmAutomations();
globalThis.__db = db;
eq('a Save landing in the middle of the every-minute job: the lead is put back and the job doesn’t undo it', [stepOf(midRun), noted()], [1, false]);
hoursPass(17);
await A.runCrmAutomations();
eq('…so it gets the new 96h email when it falls due', [sentTo(), stepOf(midRun)], [[midRun.id], 2]);

// …and if the saved settings can't be read then, it carries on with the list it read at the start, not the defaults.
reset(240);
setSettings({ ...settings(), sequence: [{ id: 'x1', afterHours: 24, channel: 'whatsapp', text: 'Hi {first_name}, the custom nudge' }] });
const custom = lead({ created_at: ago(30 * HOUR) });
globalThis.__db = settingsDown(2);
await A.runCrmAutomations();
globalThis.__db = db;
eq('the settings can’t be read again when the every-minute job reaches the sequence: it uses the list it already had', [globalThis.__rec.whatsapp.map((m) => m.text), stepOf(custom)], [['Hi Jane, the custom nudge'], 1]);

// Two jobs joined in a merge (src/lib/crm/merge-rules.ts), the kept one from before ids: what each had is kept.
reset(240);
setSettings({ ...D, sequenceEnabled: true, firstResponseMinutes: 0, sequence: [...D.sequence, { id: '3', afterHours: 120, channel: 'email', text: 'Hi {first_name}, a last one' }] });
const kept = lead({ created_at: ago(100 * HOUR), sequence_step: 2 }); // from before ids: had the WhatsApp and the 72h email
const joined = M.combineJobs(kept, { ...kept, id: randomUUID(), sequence_step: 1, reminders_sent: ['seq:1'] }, new Date().toISOString());
Object.assign(db.rows('crm_projects').find((x) => x.id === kept.id), Object.fromEntries(Object.entries(joined.set).map(([c, v]) => [c, v.to])));
await A.runCrmAutomations();
eq('two jobs joined, one from before ids: neither’s follow-ups are sent again', [globalThis.__rec.email.length, globalThis.__rec.whatsapp.length, hadOf(kept)], [0, 0, 2]);

// CRM settings open in a tab from before steps had ids, saved after.
reset(240);
const waitingWa = lead({ created_at: ago(30 * HOUR) }); // its 24h WhatsApp is due, waiting for the quiet hours
const kept0 = settings().sequence.map((x) => [x.id, x.leadsFrom]);
const oldTab = await page();
oldTab.sequence = oldTab.sequence.map((x) => ({ ...x, id: undefined, leadsFrom: undefined })); // as that page has them: neither
const saved = await put({ ...oldTab, reviewDelayDays: 5 });
eq('a page opened before steps had ids saves something else: each step keeps its id and who gets it', [saved.status, settings().sequence.map((x) => [x.id, x.leadsFrom])], [200, kept0]);
await A.runCrmAutomations();
eq('…the lead waiting for its WhatsApp still gets it', globalThis.__rec.whatsapp.map((m) => m.enquiryId), [waitingWa.enquiry_id]);
const changed = await put({ ...oldTab, sequence: [{ ...oldTab.sequence[0], text: 'Hi {first_name}, changed in the old tab' }, oldTab.sequence[1]] });
eq('…a step changed on that page can’t be told from a new one: refused, nothing changed', [changed.status, changed.body.error, settings().sequence.map((x) => [x.id, x.leadsFrom])], [409, 'The app has been updated since this page was opened. Reload the page, make your changes again and save.', kept0]);

// Help says when the old tick on the "Choose who gets new leads" to-do is cleared, as the card does.
const help = readFileSync(new URL('../src/content/help/admin/new-leads.md', import.meta.url), 'utf8').replace(/\s+/g, ' ');
eq('Help says the job usually comes back unticked, as the card clears an old tick only when it loads while someone ticked can open the CRM', [
  help.includes('It usually comes back unticked, even if you ticked the job off before: the app clears an old tick each time the card loads while someone ticked can open the CRM. If the card didn’t load in that time, the job comes back still ticked.'),
  help.includes('It comes back unticked'),
], [true, false]);

// The note under the switch on CRM settings.
const view = readFileSync(new URL('../src/app/admin/crm/settings/CrmSettingsView.tsx', import.meta.url), 'utf8');
const note = view.slice(view.indexOf('<p', view.indexOf("set('sequenceEnabled'")), view.indexOf('</p>', view.indexOf("set('sequenceEnabled'"))).replace(/\s+/g, ' ');
eq('CRM settings says switching on skips earlier steps, an added step goes only to leads it falls due for after the save, and the others carry on', [
  note.includes('When you switch it on, leads already in the CRM only get the steps that fall due from then on. Earlier ones are skipped, not sent late.'),
  note.includes('A step you add only goes to leads it falls due for after you save; the other steps carry on as they were.'),
  /switch it on or add a step/.test(note),
], [true, true, false]);

kit.done();
