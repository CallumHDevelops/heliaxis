// Suspended and terminated subcontractor firms get no new jobs (createAssignments and searchPeople in
// src/lib/site/server.ts, the picker in src/app/admin/crm/[id]/SitePeople.tsx): picked as the firm or as
// one of its people (its main site contact or an operative), the Site tab and New project are refused with
// a clear message; the picker leaves out a terminated firm's people and marks a suspended firm's as
// "Suspended: can't be given new jobs". Active firms, and firms still onboarding, are unchanged.
// Usage: node --experimental-strip-types scripts/test-site-suspended.mjs
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as kit from './site-test-kit.mjs';

const db = kit.setup();
const { eq } = kit;
const SV = await import('../src/lib/site/server.ts');
const { firmBlockedWords } = await import('../src/lib/site/types.ts');
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

kit.done();
