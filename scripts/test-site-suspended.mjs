// Suspended and terminated subcontractor firms get no new jobs (createAssignments and searchPeople in
// src/lib/site/server.ts, the picker in src/app/admin/crm/[id]/SitePeople.tsx): picked as the firm or as
// one of its people (its main site contact or an operative), the Site tab and New project are refused with
// a clear message; the picker leaves out a terminated firm's people and marks a suspended firm's as
// "Suspended: can't be given new jobs". Active firms, and firms still onboarding, are unchanged. A trade
// put on a job before its firm was suspended or terminated, that the job hasn't reached yet, can't be sent
// (Send the job pack, Copy link, a new link) nor sent again (Send again on a message that didn't go), with
// the same message, and one already waiting for the morning (deliver in src/lib/site/send.ts) doesn't go;
// once the job has reached them (a message with their link went, the office copied or WhatsApped the link
// itself, or they opened it) it carries on. "Don't use the scaffold yet" still goes to any trade that's
// been sent, but it has no link, so it doesn't count as reaching them (nor can it be asked for as a link).
// The messages that do count are the ones with their link: the job pack, "clear to start", strike photos
// and a return to site.
// Usage: node --experimental-strip-types scripts/test-site-suspended.mjs
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as kit from './site-test-kit.mjs';

const db = kit.setup();
const { eq } = kit;
const SV = await import('../src/lib/site/server.ts');
const { firmBlockedWords } = await import('../src/lib/site/types.ts');
const sendRoute = await import('../src/app/api/crm/site-assignments/[id]/send/route.ts');
const resendRoute = await import('../src/app/api/crm/site-assignments/[id]/resend/route.ts');
db.t.cms_kv = [{ key: 'site-settings', value: '{}' }];

const project = kit.addJob(db);
const firm = (company, status) => {
  const f = { id: randomUUID(), ref: null, company_name: company, contact_name: `${company.split(' ')[0]} Boss`, email: `${company.split(' ')[0].toLowerCase()}@example.test`, phone: '07700 900111', trade: 'Roofing', status, rate_option: 'standard', bespoke_rates: [], details: {} };
  db.rows('subcontractors').push(f);
  return f;
};
const active = firm('Active Roofing', 'active');
const onboarding = firm('Newco Roofing', 'awaiting_countersign');
const suspended = firm('Lapsed Roofing', 'suspended');
const terminated = firm('Gone Roofing', 'terminated');
// Each firm has been on a job before, so its main contact (and one operative) is a site contact.
const mainOf = new Map([active, onboarding, suspended, terminated].map((f) => [f.id, kit.addContact(db, { subcontractor_id: f.id, name: f.contact_name, company: f.company_name })]));
const operative = kit.addContact(db, { subcontractor_id: suspended.id, operative_id: randomUUID(), name: 'Sam Lapsed', company: suspended.company_name });
const quick = kit.addContact(db, { name: 'Quinn Quick', company: 'Quick Scaffolds', trades: ['scaffolder'] });

const assign = (who) => SV.createAssignments(db, project.id, [{ ...who, trade: 'roofer', rate_pence: 3000, rate_basis: 'per_panel', starts_on: '2026-11-03', days: 1 }], 'staff-1');
const before = () => db.rows('site_assignments').length;

for (const [f, label] of [[suspended, 'suspended'], [terminated, 'terminated']]) {
  const n = before();
  const asFirm = await assign({ firm_id: f.id });
  const asContact = await assign({ contact_id: mainOf.get(f.id).id });
  eq(`a ${label} firm can’t be given a job, picked as the firm`, [asFirm.ok, asFirm.status, asFirm.error], [false, 422, `${f.company_name} is ${label}, so they can’t be given new jobs.`]);
  eq(`…nor picked as its main site contact (the usual way once they’ve done a job)`, [asContact.ok, asContact.status, asContact.error], [false, 422, `${f.company_name} is ${label}, so they can’t be given new jobs.`]);
  eq('…and nothing was added', before(), n);
}
const op = await assign({ contact_id: operative.id });
eq('nor one of a suspended firm’s operatives', [op.ok, op.error], [false, 'Lapsed Roofing is suspended, so they can’t be given new jobs.']);
const two = await SV.createAssignments(db, project.id, [{ contact_id: quick.id, trade: 'scaffolder', rate_pence: 50000, rate_basis: 'fixed' }, { contact_id: mainOf.get(suspended.id).id, trade: 'roofer', rate_pence: 3000, rate_basis: 'per_panel' }], 'staff-1');
eq('two trades at once, one of them suspended: says which, and adds neither', [two.ok, two.error, before()], [false, 'Trade 2: Lapsed Roofing is suspended, so they can’t be given new jobs.', 0]);

for (const [who, label] of [[{ firm_id: active.id }, 'an active firm'], [{ contact_id: mainOf.get(active.id).id }, 'an active firm’s contact'], [{ contact_id: mainOf.get(onboarding.id).id }, 'a firm still onboarding (warned, not refused)'], [{ contact_id: quick.id }, 'a quick contact']]) {
  const r = await assign(who);
  eq(`${label} can still be given a job`, r.ok, true);
}

// The picker.
const people = await SV.searchPeople(db, '', 'roofer');
const row = (name) => people.find((p) => p.name === name);
eq('a terminated firm’s people aren’t in the picker (not even as plain quick contacts)', people.some((p) => p.company === terminated.company_name || p.name === terminated.contact_name), false);
eq('a suspended firm’s people are, marked suspended', [row(suspended.contact_name)?.firm_status, row('Sam Lapsed')?.firm_status], ['suspended', 'suspended']);
eq('…active and onboarding firms as before', [row(active.contact_name)?.firm_status, row(onboarding.contact_name)?.firm_status, row('Quinn Quick')?.firm_status], ['active', 'awaiting_countersign', null]);
eq('the words the picker shows', [firmBlockedWords('suspended'), firmBlockedWords('terminated'), firmBlockedWords('active'), firmBlockedWords('awaiting_countersign'), firmBlockedWords(null)], ['Suspended: can’t be given new jobs', 'Terminated: can’t be given new jobs', null, null, null]);
const picker = readFileSync(new URL('../src/app/admin/crm/[id]/SitePeople.tsx', import.meta.url), 'utf8');
eq('the picker can’t pick a suspended firm’s people, and says why', [/disabled=\{!!firmBlockedWords\(r\.firm_status\)\}/.test(picker), (picker.match(/firmBlockedWords\(r\.firm_status\)/g) ?? []).length >= 3], [true, true]);

/* ── A trade put on the job while the firm was in good standing ────────────── */

// Added while active (Not sent: the table's default), so the firm hasn't heard of the job yet.
const addedWhileActive = async (company) => {
  const f = firm(company, 'active');
  const c = kit.addContact(db, { subcontractor_id: f.id, name: f.contact_name, company: f.company_name });
  const r = await assign({ contact_id: c.id });
  const a = db.rows('site_assignments').find((x) => x.id === r.ids[0]);
  a.status = 'draft';
  return { f, a };
};
const sendTo = (a, body) => kit.call(sendRoute, `/api/crm/site-assignments/${a.id}/send`, { params: { id: a.id }, body });
const resendTo = (a, id) => kit.call(resendRoute, `/api/crm/site-assignments/${a.id}/resend`, { params: { id: a.id }, body: { message_id: id } });
const msgsOf = (a) => db.rows('site_messages').filter((m) => m.assignment_id === a.id);
const went = () => globalThis.__rec.email.length + globalThis.__rec.whatsapp.length;

for (const [company, label] of [['Paused Roofing', 'suspended'], ['Ended Roofing', 'terminated']]) {
  const { f, a } = await addedWhileActive(company);
  f.status = label;
  const was = went();
  const pack = await sendTo(a, { via: 'both' });
  const link = await sendTo(a, { via: 'link' });
  const hold = await sendTo(a, { via: 'both', kind: 'scaffold_hold' });
  const said = `${f.company_name} is ${label}, so they can’t be given new jobs.`;
  eq(`a Not sent trade whose firm is now ${label}: Send the job pack is refused, as when adding them`, [pack.status, pack.body.error], [422, said]);
  eq('…and so are Copy link and any other message (each would give them the job)', [link.status, link.body.error, hold.status], [422, said, 422]);
  eq('…nothing went, and the trade is still Not sent with no link', [went() - was, msgsOf(a).length, a.status, a.link_hash ?? null], [0, 0, 'draft', null]);
  if (label !== 'suspended') continue;
  f.status = 'active';
  const back = await sendTo(a, { via: 'both' });
  eq('…reinstated, it sends as before', [back.status, a.status, back.body.messages.map((m) => m.status)], [200, 'sent', ['sent', 'sent']]);
}

// Sent while active, but nothing reached them (both channels failed), then suspended.
const missed = await addedWhileActive('Missed Roofing');
globalThis.__fail.email = globalThis.__fail.whatsapp = true;
const first = await sendTo(missed.a, { via: 'both' });
globalThis.__fail.email = globalThis.__fail.whatsapp = false;
eq('sent while active, but neither the email nor the WhatsApp went', [first.status, missed.a.status, msgsOf(missed.a).map((m) => m.status)], [200, 'sent', ['failed', 'failed']]);
missed.f.status = 'suspended';
const was = went();
const again = await resendTo(missed.a, msgsOf(missed.a).find((m) => m.channel === 'email').id);
const packAgain = await sendTo(missed.a, { via: 'both' });
const newLink = await sendTo(missed.a, { via: 'link', rotate: true });
eq('…Send again is refused once the firm is suspended: the job would still be new to them', [again.status, again.body.error], [422, 'Missed Roofing is suspended, so they can’t be given new jobs.']);
eq('…and so are Send the job pack again and a new link', [packAgain.status, packAgain.body.error, newLink.status, newLink.body.error], [422, 'Missed Roofing is suspended, so they can’t be given new jobs.', 422, 'Missed Roofing is suspended, so they can’t be given new jobs.']);
eq('…nothing went, and the messages are still the failed ones', [went() - was, msgsOf(missed.a).map((m) => m.status), missed.a.link_generation], [0, ['failed', 'failed'], 1]);
// "Don't use the scaffold yet" is a safety notice: it still goes to a trade that's been sent the job.
globalThis.__fail.email = globalThis.__fail.whatsapp = true;
const missedHold = await sendTo(missed.a, { via: 'both', kind: 'scaffold_hold' });
globalThis.__fail.email = globalThis.__fail.whatsapp = false;
const holdAgain = await resendTo(missed.a, msgsOf(missed.a).find((m) => m.kind === 'scaffold_hold' && m.channel === 'email')?.id);
eq('…but “don’t use the scaffold yet” still goes to them (Sent, so they were sent the job)', [missedHold.status, missedHold.body.messages?.map((m) => `${m.kind} ${m.status}`)], [200, ['scaffold_hold failed', 'scaffold_hold failed']]);
eq('…and Send again on one that didn’t go sends it', [holdAgain.status, holdAgain.body.message?.kind, holdAgain.body.message?.status], [200, 'scaffold_hold', 'sent']);
// It has no link, so the job still hasn't reached them: the next day's "clear to start" (which has the
// link) is refused like the rest.
const wasHold = went();
const packAfterHold = await sendTo(missed.a, { via: 'both' });
const clearAfterHold = await sendTo(missed.a, { via: 'both', kind: 'clear_to_start' });
const linkAfterHold = await sendTo(missed.a, { via: 'link', rotate: true });
const againAfterHold = await resendTo(missed.a, msgsOf(missed.a).find((m) => m.kind === 'job_pack' && m.channel === 'email').id);
eq(
  '…which doesn’t count as reaching them: the job pack, “clear to start”, a new link and Send again on the job pack are still refused',
  [packAfterHold.status, clearAfterHold.status, clearAfterHold.body.error, linkAfterHold.status, againAfterHold.status],
  [422, 422, 'Missed Roofing is suspended, so they can’t be given new jobs.', 422, 422]
);
eq('…and nothing more went', [went() - wasHold, msgsOf(missed.a).filter((m) => m.status === 'sent').map((m) => m.kind), missed.a.link_generation], [0, ['scaffold_hold'], 1]);
// Nor does asking for the hold as a link (an API call: the Site tab sends it by email and WhatsApp). It
// has none to hand over, and handing one over would count as reaching them.
const eventsOf = (a, type) => db.rows('site_events').filter((e) => e.assignment_id === a.id && e.type === type).length;
const holdAsLink = await sendTo(missed.a, { via: 'link', kind: 'scaffold_hold' });
const holdAsNewLink = await sendTo(missed.a, { via: 'link', kind: 'scaffold_hold', rotate: true });
eq(
  '…the hold can’t be asked for as a link: refused, with no link handed over or logged and the link left as it was',
  [holdAsLink.status, holdAsLink.body.link ?? null, holdAsNewLink.status, holdAsNewLink.body.link ?? null, eventsOf(missed.a, 'link_copied'), missed.a.link_generation],
  [400, null, 400, null, 0, 1]
);
const clearAfterLink = await sendTo(missed.a, { via: 'both', kind: 'clear_to_start' });
const againAfterLink = await resendTo(missed.a, msgsOf(missed.a).find((m) => m.kind === 'job_pack' && m.channel === 'email').id);
eq('…so “clear to start” and Send again on the job pack are still refused', [clearAfterLink.status, againAfterLink.status, went() - wasHold], [422, 422, 0]);

// Already with them: the WhatsApp went and only the email failed, or they opened it. The job carries on.
const half = await addedWhileActive('Half Roofing');
globalThis.__fail.email = true;
await sendTo(half.a, { via: 'both' });
globalThis.__fail.email = false;
half.f.status = 'suspended';
const halfAgain = await resendTo(half.a, msgsOf(half.a).find((m) => m.channel === 'email').id);
eq('a suspended firm whose WhatsApp went: the failed email can still be sent again (they’re on the job)', [halfAgain.status, halfAgain.body.message?.status], [200, 'sent']);
const opened = await addedWhileActive('Opened Roofing');
await sendTo(opened.a, { via: 'link' });
opened.a.status = 'opened';
opened.f.status = 'suspended';
const openedAgain = await sendTo(opened.a, { via: 'both' });
eq('…and one that opened their link can still be sent the job pack', [openedAgain.status, openedAgain.body.messages?.map((m) => m.status)], [200, ['sent', 'sent']]);

// Handed the link by the office while active (Copy link, or WhatsApp from my phone: both are the 'link'
// send), with no message gone and not opened yet: that reached them, so the job carries on.
const handed = await addedWhileActive('Valley Roofing');
await sendTo(handed.a, { via: 'link' });
handed.f.status = 'suspended';
const reshare = await sendTo(handed.a, { via: 'link' });
const rotated = await sendTo(handed.a, { via: 'link', rotate: true });
eq('a suspended firm whose trade you handed the link yourself: it can be shared again, or a new link made', [reshare.status, rotated.status, handed.a.link_generation], [200, 200, 2]);
const clear = await sendTo(handed.a, { via: 'both', kind: 'clear_to_start' });
const hold = await sendTo(handed.a, { via: 'both', kind: 'scaffold_hold' });
eq('…and “clear to start” and “don’t use the scaffold yet” go', [clear.status, clear.body.messages?.map((m) => m.status), hold.status, hold.body.messages?.map((m) => m.status)], [200, ['sent', 'sent'], 200, ['sent', 'sent']]);

/* ── Waiting for the morning when the firm was suspended or terminated ─────── */

const SD = await import('../src/lib/site/send.ts');
// Sent late in the evening, so it waits on the queue (here: until tomorrow).
const queued = async (company, kinds) => {
  const t = await addedWhileActive(company);
  const a = await SV.readAssignment(db, t.a.id);
  const c = db.rows('site_contacts').find((x) => x.id === a.contact_id);
  for (const kind of kinds) await SD.sendToTrade(db, a, c, { kind, via: 'both', actor: 'office@heliaxis.co.uk', byId: 'staff-1', now: new Date(Date.now() + 86_400_000) });
  return t;
};
// Its time comes, and the every-minute job sends what's due.
const morning = async (a) => {
  for (const m of msgsOf(a)) m.send_after = new Date(Date.now() - 60_000).toISOString();
  return SD.sendDue(db);
};
const stateOf = (a) => msgsOf(a).map((m) => `${m.kind} ${m.channel} ${m.status}${m.error ? `: ${m.error}` : ''}`);

for (const label of ['suspended', 'terminated']) {
  const { f, a } = await queued(`Overnight ${label}`, ['job_pack', 'clear_to_start']);
  eq(`a job pack and “clear to start” waiting for the morning (${label} overnight)`, stateOf(a), ['job_pack email queued', 'job_pack whatsapp queued', 'clear_to_start email queued', 'clear_to_start whatsapp queued']);
  f.status = label;
  const was = went();
  const n = await morning(a);
  const said = `${f.company_name} is ${label}, so they can’t be given new jobs.`;
  eq('…don’t go when their time comes: the card says they didn’t, and why', [n, went() - was, stateOf(a)], [0, 0, [`job_pack email failed: ${said}`, `job_pack whatsapp failed: ${said}`, `clear_to_start email failed: ${said}`, `clear_to_start whatsapp failed: ${said}`]]);
  if (label !== 'suspended') continue;
  // The scaffold isn't tagged that morning, so the office sends "don't use it yet". It goes, but has no link.
  const hold = await sendTo(a, { via: 'both', kind: 'scaffold_hold' });
  eq('…“don’t use the scaffold yet” still goes that morning', [hold.status, hold.body.messages?.map((m) => m.status)], [200, ['sent', 'sent']]);
  const refused = await resendTo(a, msgsOf(a)[0].id);
  f.status = 'active';
  const back = await resendTo(a, msgsOf(a)[0].id);
  eq('…Send again is refused while suspended, and sends once reinstated', [refused.status, refused.body.error, back.status, back.body.message?.status], [422, said, 200, 'sent']);
}
const holdLater = await queued('Overnight Hold', ['scaffold_hold']);
holdLater.f.status = 'suspended';
await morning(holdLater.a);
eq('a waiting “don’t use the scaffold yet” still goes (a safety notice)', stateOf(holdLater.a), ['scaffold_hold email sent', 'scaffold_hold whatsapp sent']);
// Both waiting for the same morning: the hold goes and the job pack doesn't, whichever is sent first.
for (const first of ['scaffold_hold', 'job_pack']) {
  const { f, a } = await queued(first === 'job_pack' ? 'Pack First Roofing' : 'Hold First Roofing', ['job_pack', 'scaffold_hold']);
  f.status = 'suspended';
  const due = Date.now() - 60_000;
  for (const m of msgsOf(a)) m.send_after = new Date(m.kind === first ? due - 1000 : due).toISOString();
  await SD.sendDue(db);
  const said = `${f.company_name} is suspended, so they can’t be given new jobs.`;
  eq(`a job pack and “don’t use the scaffold yet” waiting for the same morning (${first === 'job_pack' ? 'job pack' : 'hold'} sent first): only the hold goes`, stateOf(a), [
    `job_pack email failed: ${said}`,
    `job_pack whatsapp failed: ${said}`,
    'scaffold_hold email sent',
    'scaffold_hold whatsapp sent',
  ]);
}
const reinstated = await queued('Overnight Back', ['job_pack']);
reinstated.f.status = 'suspended';
reinstated.f.status = 'active';
await morning(reinstated.a);
eq('a firm suspended and reinstated before the morning: the waiting job pack goes as planned', stateOf(reinstated.a), ['job_pack email sent', 'job_pack whatsapp sent']);

/* ── The messages that count as reaching them ──────────────────────────────── */

// "Clear to start" carries their link too. A trade who was Not sent is sent it while the firm is active
// (the email fails, the WhatsApp goes), then the firm is suspended: it reached them, so the job carries on.
const cleared = await addedWhileActive('Cleared Roofing');
globalThis.__fail.email = true;
const clearedFirst = await sendTo(cleared.a, { via: 'both', kind: 'clear_to_start' });
globalThis.__fail.email = false;
eq('a Not sent trade sent “clear to start” while the firm is active: Sent, with the WhatsApp gone and the email not', [clearedFirst.status, cleared.a.status, msgsOf(cleared.a).map((m) => `${m.kind} ${m.channel} ${m.status}`)], [200, 'sent', ['clear_to_start email failed', 'clear_to_start whatsapp sent']]);
cleared.f.status = 'suspended';
const clearedAgain = await resendTo(cleared.a, msgsOf(cleared.a).find((m) => m.channel === 'email').id);
const clearedPack = await sendTo(cleared.a, { via: 'both' });
eq('…then the firm is suspended: it reached them, so Send again and the job pack both go', [clearedAgain.status, clearedAgain.body.message?.status, clearedPack.status, clearedPack.body.messages?.map((m) => m.status)], [200, 'sent', 200, ['sent', 'sent']]);

// So do strike photos and a return to site. They go to trades past Sent, which are never blocked, so this
// checks the list itself: the job pack failed on both channels, one of these went, then the firm was suspended.
for (const [label, company, reach] of [
  ['a strike photos request', 'Striking Roofing', (a, c) => SD.sendStrikeRequest(db, a, c, 1)],
  ['a return to site notice', 'Returning Roofing', (a, c) => SD.queueMessage(db, { assignmentId: a.id, channel: 'email', kind: 'return_to_site', dedupeKey: `return:${randomUUID()}:email`, to: c.email, params: { subject: 'Return to site', html: '<p>Please put it right.</p>' }, sendAfter: new Date() }, 'office@heliaxis.co.uk')],
]) {
  const t = await addedWhileActive(company);
  globalThis.__fail.email = globalThis.__fail.whatsapp = true;
  await sendTo(t.a, { via: 'both' });
  globalThis.__fail.email = globalThis.__fail.whatsapp = false;
  const a = await SV.readAssignment(db, t.a.id);
  await reach(a, db.rows('site_contacts').find((x) => x.id === a.contact_id));
  t.f.status = 'suspended';
  const again = await resendTo(t.a, msgsOf(t.a).find((m) => m.kind === 'job_pack' && m.channel === 'email').id);
  const pack = await sendTo(t.a, { via: 'both' });
  eq(`${label} that went before the firm was suspended counts as reaching them: Send again on the job pack and the job pack both go`, [again.status, again.body.message?.status, pack.status], [200, 'sent', 200]);
}

kit.done();
