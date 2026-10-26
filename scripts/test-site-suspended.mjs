// Suspended and terminated subcontractor firms get no new jobs (createAssignments and searchPeople in
// src/lib/site/server.ts, the picker in src/app/admin/crm/[id]/SitePeople.tsx): picked as the firm or as
// one of its people (its main site contact or an operative), the Site tab and New project are refused with
// a clear message; the picker leaves out a terminated firm's people and marks a suspended firm's as
// "Suspended: can't be given new jobs". Active firms, and firms still onboarding, are unchanged. A trade
// put on a job before its firm was suspended or terminated, that nothing has reached yet, can't be sent
// (Send the job pack, Copy link, a new link) nor sent again (Send again on a message that didn't go), with
// the same message; once something has reached them (a message went, or they opened it) it carries on.
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

kit.done();
