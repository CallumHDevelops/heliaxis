// What the CRM does by itself with new leads (src/lib/crm/automation.ts): who gets a new lead. The
// rotation (CRM → Settings → New leads) skips anyone who can no longer open the CRM (rejected, set back
// to pending, CRM portal taken away), who stays ticked and takes turns again when their access is back;
// a lead someone already has is left alone. The follow-up sequence: switched on (or given a new step),
// it sends only the steps that fall due from then on; leads already in the CRM skip older ones quietly,
// instead of getting every overdue step a minute apart.
// Usage: node --experimental-strip-types scripts/test-crm-automation.mjs
import { randomUUID } from 'node:crypto';
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
eq('access back: they take turns again by themselves', names(await turns(3)).sort(), ['Callum', 'Esther', 'Leaver']);

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

/* ── The follow-up sequence ────────────────────────────────────────────────── */

const HOUR = 3_600_000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const D = S.DEFAULT_CRM_SETTINGS;
eq('the default sequence: WhatsApp at 24h, email at 72h, off', [D.sequence.map((x) => [x.afterHours, x.channel]), D.sequenceEnabled, D.sequenceFrom], [[[24, 'whatsapp'], [72, 'email']], false, null]);

// When the sequence starts counting.
const now = new Date('2026-10-22T10:00:00Z');
const on = { ...D, sequenceEnabled: true, sequenceFrom: '2026-10-01T09:00:00.000Z' };
eq('switched on: from now', S.sequenceFromAfter(D, { ...D, sequenceEnabled: true }, now), now.toISOString());
eq('saved again, nothing new: as it was', S.sequenceFromAfter(on, on, now), on.sequenceFrom);
eq('a step’s words changed: as it was', S.sequenceFromAfter(on, { ...on, sequence: on.sequence.map((x) => ({ ...x, text: `${x.text} Thanks!` })) }, now), on.sequenceFrom);
eq('a step added: from now', S.sequenceFromAfter(on, { ...on, sequence: [...on.sequence, { afterHours: 120, channel: 'email', text: 'Last one' }] }, now), now.toISOString());
eq('a step moved to a new time: from now', S.sequenceFromAfter(on, { ...on, sequence: [{ ...on.sequence[0], afterHours: 48 }, on.sequence[1]] }, now), now.toISOString());
eq('a step removed: as it was', S.sequenceFromAfter(on, { ...on, sequence: [on.sequence[0]] }, now), on.sequenceFrom);
eq('switched off: kept (switching on again starts again)', S.sequenceFromAfter(on, { ...on, sequenceEnabled: false }, now), on.sequenceFrom);
eq('saved settings keep it; rubbish is dropped', [S.cleanCrmSettings({ sequenceFrom: on.sequenceFrom }).sequenceFrom, S.cleanCrmSettings({ sequenceFrom: 'soon' }).sequenceFrom, S.cleanCrmSettings({}).sequenceFrom], [on.sequenceFrom, null, null]);

// Which step a lead is on.
const since = '2026-10-22T10:00:00.000Z';
const at = (h) => new Date(Date.parse(since) - h * HOUR).toISOString();
eq('a lead from 10 days before: both steps skipped', S.stepAfterSkipped(D.sequence, at(240), 0, since), 2);
eq('a lead from 2 days before: the 24h step skipped, the 72h one still to come', S.stepAfterSkipped(D.sequence, at(48), 0, since), 1);
eq('a lead from 23h before: nothing skipped (its 24h step falls due after)', S.stepAfterSkipped(D.sequence, at(23), 0, since), 0);
eq('a lead from after it was switched on: nothing skipped', S.stepAfterSkipped(D.sequence, new Date(Date.parse(since) + HOUR).toISOString(), 0, since), 0);
eq('settings from before this (no time): nothing skipped', S.stepAfterSkipped(D.sequence, at(240), 0, null), 0);

// The runner, a minute after the sequence was switched on.
db.t.crm_projects = [];
db.t.enquiries = [];
globalThis.__rec.whatsapp.length = 0;
globalThis.__rec.email.length = 0;
setSettings({ ...D, sequenceEnabled: true, sequenceFrom: ago(60_000), firstResponseMinutes: 0 });
const old = lead({ stage: 'contacted', created_at: ago(10 * 24 * HOUR) });
const twoDays = lead({ created_at: ago(48 * HOUR) });
const justDue = lead({ created_at: ago(24 * HOUR + 30_000) }); // its 24h step fell due 30 s ago, after switch-on
const fresh = lead({ created_at: ago(HOUR) });
const stepOf = (p) => db.rows('crm_projects').find((x) => x.id === p.id).sequence_step;
const run1 = await A.runCrmAutomations();
eq('switched on: only the step that fell due after it is sent', [run1.sequence, globalThis.__rec.whatsapp.map((m) => m.enquiryId), globalThis.__rec.email.length], [1, [justDue.enquiry_id], 0]);
eq('…older overdue steps are skipped (both for a 10-day-old lead, the 24h one for a 2-day-old lead)', [stepOf(old), stepOf(twoDays), stepOf(justDue), stepOf(fresh)], [2, 1, 1, 0]);
eq('…quietly: nothing on their timelines', globalThis.__rec.activity.filter((a) => [old.id, twoDays.id].includes(a.projectId)).length, 0);
const run2 = await A.runCrmAutomations();
eq('a minute later: nothing more (no burst of catch-up messages)', [run2.sequence, globalThis.__rec.whatsapp.length, globalThis.__rec.email.length], [0, 1, 0]);

// A sequence already running before this (no time saved) carries on as it did.
setSettings({ ...D, sequenceEnabled: true, firstResponseMinutes: 0 });
const running = lead({ created_at: ago(30 * HOUR) });
await A.runCrmAutomations();
eq('settings saved before this: a due step is sent as before', [stepOf(running), globalThis.__rec.whatsapp.at(-1)?.enquiryId], [1, running.enquiry_id]);

// Saving CRM settings sets the time on the server.
const put = (body) => kit.call(settingsRoute, '/api/crm/settings', { method: 'PUT', body });
setSettings({ ...D });
const before = Date.now();
const p1 = await put({ ...D, sequenceEnabled: true, sequenceFrom: '2020-01-01T00:00:00.000Z' });
const from1 = Date.parse(settings().sequenceFrom);
eq('switching it on (Save) sets the time to now, whatever the page sent', [p1.status, from1 >= before && from1 <= Date.now()], [200, true]);
await put({ ...settings(), reviewDelayDays: 5 });
eq('saving something else keeps it', settings().sequenceFrom, new Date(from1).toISOString());
await new Promise((r) => setTimeout(r, 5));
await put({ ...settings(), sequence: [...settings().sequence, { afterHours: 120, channel: 'email', text: 'Last one' }] });
eq('adding a step moves it on', Date.parse(settings().sequenceFrom) > from1, true);

kit.done();
