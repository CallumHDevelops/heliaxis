// What the CRM does by itself with new leads (src/lib/crm/automation.ts): who gets a new lead. The
// rotation (CRM → Settings → New leads) skips anyone who can no longer open the CRM (rejected, set back
// to pending, CRM portal taken away), who stays ticked, keeps their place and takes turns again when
// their access is back; a lead someone already has is left alone. The "Choose who gets new leads" to-do
// (src/lib/setup-checks.ts) counts the same people, and comes back unticked when none of them can take a
// lead any more, whatever was ticked off before. The follow-up sequence: switched on (or given a new
// step), it sends only the steps that fall due from then on; leads already in the CRM skip older ones
// quietly, instead of getting every overdue step a minute apart. Steps go by id, so a step added (even
// one at the same hours and Send by as another), moved or edited never re-sends one a lead has had, a
// step moved earlier still goes to the leads waiting for it, and editing one step doesn't drop another
// that's due but waiting for the quiet hours or a hold. A step added after one was removed still reaches
// the leads that had finished the shorter list; two jobs joined in a merge keep what each had, one from
// before ids too; a page opened before ids and saved after keeps every step's id; and the note on CRM
// settings says the same.
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
db.rows('cms_kv').push({ key: 'setup-done', value: JSON.stringify(['crm-rotation']) });
eq('ticked off before, back now that nobody ticked can open the CRM: not ticked', [(await rotationTodo()).startsWith('Nobody ticked'), await rotationTicked()], [true, false]);
setSettings({ leadRotation: [], rotationIndex: 0 });
eq('nobody ticked: a tick still greys it, as before', await rotationTicked(), true);
db.t.cms_kv = db.rows('cms_kv').filter((r) => r.key !== 'setup-done');
eq('nobody ticked: the to-do, as before', await rotationTodo(), 'New leads are handed out in turn and that person gets a notification.');

// People can't be looked up: it goes by the ticks, rather than nag on a guess.
setSettings({ leadRotation: [esther.id], rotationIndex: 0 });
const down = { select: () => down, eq: () => down, in: () => down, then: (res, rej) => Promise.resolve({ data: null, error: { message: 'down' } }).then(res, rej) };
globalThis.__db = { ...db, from: (t) => (t === 'profiles' ? down : db.from(t)) };
eq('people can’t be looked up: no to-do while someone is ticked', await rotationTodo(), 'none');
globalThis.__db = db;
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

// Saving CRM settings sets the times on the server.
const put = (body) => kit.call(settingsRoute, '/api/crm/settings', { method: 'PUT', body });
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

// The note under the switch on CRM settings.
const view = readFileSync(new URL('../src/app/admin/crm/settings/CrmSettingsView.tsx', import.meta.url), 'utf8');
const note = view.slice(view.indexOf('<p', view.indexOf("set('sequenceEnabled'")), view.indexOf('</p>', view.indexOf("set('sequenceEnabled'"))).replace(/\s+/g, ' ');
eq('CRM settings says switching on skips earlier steps, an added step goes only to leads it falls due for after the save, and the others carry on', [
  note.includes('When you switch it on, leads already in the CRM only get the steps that fall due from then on. Earlier ones are skipped, not sent late.'),
  note.includes('A step you add only goes to leads it falls due for after you save; the other steps carry on as they were.'),
  /switch it on or add a step/.test(note),
], [true, true, false]);

kit.done();
