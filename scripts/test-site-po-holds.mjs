// What holds a trade's labour PO, and what lets it go (round-1 review, data-money): the VAT worked
// out from their registration as it is now, not as saved when they were put on the job; a per-panel
// count the design doesn't back up holds the PO naming both numbers (the office can issue past it);
// a trade with no email whose WhatsApp can't go is held, not "issued" with nothing sent; fixing the
// person's details works their held PO out again; a cancelled or deleted PO can be raised again from
// the Site tab; per panel is for the roofer only; and Issue says so when nothing could be sent.
// Usage: node --experimental-strip-types scripts/test-site-po-holds.mjs
import { randomUUID } from 'node:crypto';
import * as kit from './site-test-kit.mjs';

const db = kit.setup();
const { eq } = kit;
const PS = await import('../src/lib/site/po-shared.ts');
const A = await import('../src/lib/site/assign.ts');
const M = await import('../src/lib/site/money.ts');
const SV = await import('../src/lib/site/server.ts');
const signRoute = await import('../src/app/api/site/jobs/[id]/signoff/route.ts');
const issueRoute = await import('../src/app/api/crm/site-assignments/[id]/issue-po/route.ts');
const contactsRoute = await import('../src/app/api/crm/site-contacts/route.ts');
const { ROOFER } = await import('../src/lib/site/forms/roofer.ts');

/* ── The pure rules ────────────────────────────────────────────────────────── */

eq('VAT now: not registered is no VAT, whatever was saved', [A.vatNow(false, 'standard'), A.vatNow(false, 'reverse_charge'), A.vatNow(false, null)], ['none', 'none', 'none']);
eq('VAT now: registered keeps what was chosen', [A.vatNow(true, 'standard'), A.vatNow(true, 'reverse_charge'), A.vatNow(true, 'zero')], ['standard', 'reverse_charge', 'zero']);
eq('VAT now: registered but saved as "no VAT" (or nothing) is not chosen yet', [A.vatNow(true, 'none'), A.vatNow(true, null)], [null, null]);
eq('panels: the count matches the design', PS.panelsHold(16, 16, 16), null);
eq('panels: more than the design, both numbers named', PS.panelsHold(61, 16, 16), 'The roofer signed for 61 panels but the design has 16 panels: check the count before issuing');
eq('panels: fewer than the design', PS.panelsHold(12, 16, 12), 'The roofer signed for 12 panels but the design has 16 panels: check the count before issuing');
eq('panels: no count in the design, against their strings', PS.panelsHold(20, null, 16), 'The roofer signed for 20 panels but their strings add up to 16 panels: check the count before issuing');
eq('panels: not a whole number, or past the form’s 200', [PS.panelsHold(12.5, null, null), PS.panelsHold(5000, null, null), PS.panelsHold(14, null, null)], ['The roofer signed for 12.5 panels: check the count before issuing', 'The roofer signed for 5,000 panels: check the count before issuing', null]);
eq('the panels hold is one the office can issue past', [PS.OVERRIDABLE.includes('panels'), PS.OVERRIDABLE.includes('contact'), PS.OVERRIDABLE.includes('vat')], [true, false, false]);
eq('hold words: a PO’s own words first, else the usual', PS.heldWords({ held: ['panels', 'rate'], held_notes: { panels: 'The roofer signed for 61 panels but the design has 16 panels: check the count before issuing' } }), ['The roofer signed for 61 panels but the design has 16 panels: check the count before issuing', PS.HELD_WORDS.rate]);
eq('per panel is offered to the roofer only', [M.basesFor('roofer'), M.basesFor('electrician'), M.basesFor('scaffolder')], [['fixed', 'per_panel', 'per_day', 'per_hour'], ['fixed', 'per_day', 'per_hour'], ['fixed', 'per_day', 'per_hour']]);
const newSparky = A.cleanAssignment({ trade: 'electrician', rate_pence: 3000, rate_basis: 'per_panel' }, false);
eq('…an electrician on per panel is refused', [newSparky.ok, newSparky.error], [false, 'Per panel is for the roofer (it pays the panels they sign for). Choose fixed, per day or per hour.']);
eq('…a roofer on per panel is fine', A.cleanAssignment({ trade: 'roofer', rate_pence: 3000, rate_basis: 'per_panel' }, false).ok, true);
eq('…changing a scaffolder to per panel is refused', A.cleanAssignment({ rate_basis: 'per_panel' }, true, { trade: 'scaffolder', rate_basis: 'fixed', rate_pence: 45000, rate_qty: null }).ok, false);
eq('…an older per-panel electrician can still change their scope', A.cleanAssignment({ scope: 'Inverter swap' }, true, { trade: 'electrician', rate_basis: 'per_panel', rate_pence: 3000, rate_qty: null }).ok, true);
const firm = { id: 'f1', ref: 'SUB-1', company_name: 'Sparks Ltd', contact_name: 'Sam', email: 's@example.test', phone: null, trade: 'Electrician', status: 'active', rate_option: 'bespoke', bespoke_rates: [{ trade: 'Electrician', rate: '£30.00 per panel', basis: '' }], details: null };
eq('an agreed per-panel rate isn’t offered for an electrician', SV.agreedRate(firm, 'electrician'), null);

/* ── A job, and the roofer's phone ─────────────────────────────────────────── */

const project = kit.addJob(db);
const sign = (a, token) => kit.call(signRoute, `/api/site/jobs/${a.id}/signoff`, { token, params: { id: a.id }, body: { op_id: randomUUID(), stage: 'main', name: 'Dave Price', signature: kit.SIG, declaration: ROOFER.sig.declaration({ address: '12 High Street, Maindee, Newport, NP20 4AB' }), signed_at: new Date().toISOString(), rev: 7 } });
const poOf = (a) => db.rows('purchase_orders').find((p) => p.assignment_id === a.id && p.status !== 'cancelled');
const msgs = (a) => db.rows('site_messages').filter((m) => m.assignment_id === a.id && m.kind === 'po');
const issue = (a, override = false) => kit.call(issueRoute, `/api/crm/site-assignments/${a.id}/issue-po`, { params: { id: a.id }, body: { override } });

/* ── No email, and WhatsApp can't go ───────────────────────────────────────── */

// First, before anything has asked Meta which templates are approved (send.ts keeps that for 5
// minutes, so from here on POs in this test go by email only).
globalThis.__templates = ['site_job_pack']; // site_po_raised isn't approved yet
const waC = kit.addContact(db, { name: 'Wyn Whatsapp', email: null, wa_id: '447700900999', mobile: '07700 900999', whatsapp_ok: true });
const waA = kit.addAssignment(db, project, waC);
const waPhone = await kit.addPhone(db, waC);
const s3 = await sign(waA, waPhone.token);
await kit.afterReply();
const waWords = 'No email for them, and WhatsApp can’t go (The site_po_raised WhatsApp template isn’t approved yet (WhatsApp templates)): add an email to send the PO';
eq('WhatsApp only, the PO template not approved: held for the contact (not issued with nothing sent)', [s3.body.po_next, poOf(waA).status, poOf(waA).labour.version, poOf(waA).labour.held, poOf(waA).labour.held_notes?.contact, msgs(waA).length], ['held', 'draft', 0, ['contact'], waWords, 0]);
// The office adds an email: the held PO is worked out again at once, so Issue shows.
const patched = await kit.call(contactsRoute, '/api/crm/site-contacts', { method: 'PATCH', body: { id: waC.id, email: 'wyn@example.test' } });
eq('the email added: the held PO’s reasons are current (nothing holds it now)', [patched.status, poOf(waA).status, poOf(waA).labour.held, poOf(waA).labour.sub.email], [200, 'draft', [], 'wyn@example.test']);
const ok3 = await issue(waA);
eq('…and it issues, by email (WhatsApp still can’t go)', [ok3.status, poOf(waA).status, msgs(waA).map((m) => m.channel)], [200, 'sent', ['email']]);

/* ── VAT from their registration now ───────────────────────────────────────── */

// Put on the job as a quick contact with no VAT number ("no VAT"), then they give the office their VAT number.
const vatC = kit.addContact(db, { name: 'Vera Tiles', email: 'vera@example.test' });
const vatA = kit.addAssignment(db, project, vatC, { vat_treatment: 'none' });
const vatPhone = await kit.addPhone(db, vatC);
db.rows('site_contacts').find((c) => c.id === vatC.id).vat_number = 'GB123456789';
const s1 = await sign(vatA, vatPhone.token);
await kit.afterReply();
eq('now VAT registered, saved as "no VAT": the PO is held for the VAT, nothing sent', [s1.status, s1.body.po_next, poOf(vatA).status, poOf(vatA).labour.held, poOf(vatA).labour.vat_treatment, poOf(vatA).labour.vat_words, msgs(vatA).length], [200, 'held', 'draft', ['vat'], null, 'VAT not chosen yet', 0]);
const tab1 = (await SV.siteTabData(db, project.id)).assignments.find((x) => x.id === vatA.id);
eq('…the Site tab says the same (not the stale "no VAT")', [tab1.vat_treatment, tab1.money.vat, tab1.vat_locked, tab1.po.held_words], [null, 'VAT not chosen yet', false, [PS.HELD_WORDS.vat]]);
const blocked = await issue(vatA, true);
eq('…and Issue (even past the office’s own holds) is refused until the VAT is chosen', [blocked.status, blocked.body.error], [409, PS.HELD_WORDS.vat]);
db.rows('site_assignments').find((x) => x.id === vatA.id).vat_treatment = 'standard';
const ok1 = await issue(vatA);
eq('VAT 20% chosen: issued with the VAT on', [ok1.status, poOf(vatA).labour.vat_treatment, poOf(vatA).vat_pence, poOf(vatA).payable_pence], [200, 'standard', 9600, 48000 + 9600 - 9600]);

// Saved as 20% VAT for a firm that then loses its VAT number.
const firmRow = { id: randomUUID(), ref: 'SUB-0007', company_name: 'Roof Co', contact_name: 'Rob', email: 'rob@example.test', phone: null, trade: 'Roofer', status: 'active', rate_option: 'default', bespoke_rates: null, details: { vatNumber: '' }, cis_verified_on: '2026-01-10', cis_rate: 'net' };
db.rows('subcontractors').push(firmRow);
const lostC = kit.addContact(db, { name: 'Rob Roof', email: 'rob@example.test', subcontractor_id: firmRow.id });
const lostA = kit.addAssignment(db, project, lostC, { vat_treatment: 'standard' });
const lostPhone = await kit.addPhone(db, lostC);
await sign(lostA, lostPhone.token);
await kit.afterReply();
eq('the firm has no VAT number now: no VAT added, and it goes', [poOf(lostA).status, poOf(lostA).labour.vat_treatment, poOf(lostA).vat_pence, poOf(lostA).payable_pence, msgs(lostA).map((m) => m.channel)], ['sent', 'none', 0, 38400, ['email']]);

/* ── The panel count against the design ────────────────────────────────────── */

const panC = kit.addContact(db, { name: 'Pete Panels', email: 'pete@example.test' });
const panA = kit.addAssignment(db, project, panC, { answers: { ...kit.ROOF_DONE, RX5: 61 } });
const panPhone = await kit.addPhone(db, panC);
const s2 = await sign(panA, panPhone.token);
await kit.afterReply();
const words61 = 'The roofer signed for 61 panels but the design has 16 panels: check the count before issuing';
eq('61 signed on a 16-panel design: held, both numbers named, nothing sent', [s2.body.po_next, poOf(panA).status, poOf(panA).labour.held, poOf(panA).labour.held_notes?.panels, msgs(panA).length], ['held', 'draft', ['panels'], words61, 0]);
eq('…the job owner’s push says why', globalThis.__rec.notify.at(-1).title.endsWith(`held: ${words61}`), true);
const tab2 = (await SV.siteTabData(db, project.id)).assignments.find((x) => x.id === panA.id);
eq('…the Site tab shows the words with both numbers', tab2.po.held_words, [words61]);
const noOverride = await issue(panA, false);
eq('…Issue without looking is refused with the same words', [noOverride.status, noOverride.body.error], [409, words61]);
const anyway = await issue(panA, true);
eq('…"Issue anyway" once the office has checked: it goes as signed', [anyway.status, poOf(panA).status, poOf(panA).labour.qty, poOf(panA).labour.held, poOf(panA).labour.held_notes ?? null, msgs(panA).map((m) => m.channel)], [200, 'sent', 61, [], null, ['email']]);

/* ── Cancelled, or deleted, then raised again ──────────────────────────────── */

const cnC = kit.addContact(db, { name: 'Cal Cancel', email: 'cal@example.test' });
const cnA = kit.addAssignment(db, project, cnC);
const cnPhone = await kit.addPhone(db, cnC);
await sign(cnA, cnPhone.token);
await kit.afterReply();
const first = poOf(cnA);
Object.assign(db.rows('purchase_orders').find((p) => p.id === first.id), { status: 'cancelled', cancelled_at: new Date().toISOString() });
const tab3 = (await SV.siteTabData(db, project.id)).assignments.find((x) => x.id === cnA.id);
eq('cancelled in Orders: no live PO on the Site tab (so "Raise the PO again" shows)', [tab3.po, tab3.status, tab3.raise_po], [null, 'done', true]);
db.rows('site_assignments').find((x) => x.id === cnA.id).rate_pence = 2800;
const again = await issue(cnA);
const second = poOf(cnA);
eq('raised again: a new PO for the same sign-off, at the corrected rate, and it goes', [again.status, second.id !== first.id, second.signoff_id === first.signoff_id || first.signoff_id === null, second.status, second.net_pence], [200, true, true, 'sent', 2800 * 16]);
eq('…the cancelled one let go of the sign-off and stays cancelled', [db.rows('purchase_orders').find((p) => p.id === first.id).signoff_id, db.rows('purchase_orders').find((p) => p.id === first.id).status], [null, 'cancelled']);
db.t.purchase_orders = db.rows('purchase_orders').filter((p) => p.id !== second.id);
const third = await issue(cnA);
eq('deleted: raised again from the Site tab', [third.status, !!poOf(cnA), poOf(cnA)?.status], [200, true, 'sent']);

/* ── Nothing could be sent ─────────────────────────────────────────────────── */

const nsC = kit.addContact(db, { name: 'Nia Nosend', email: 'nia@example.test', wa_id: null, mobile: null, whatsapp_ok: false });
const nsA = kit.addAssignment(db, project, nsC, { rate_pence: null, rate_basis: null });
const nsPhone = await kit.addPhone(db, nsC);
await sign(nsA, nsPhone.token);
await kit.afterReply();
Object.assign(db.rows('site_assignments').find((x) => x.id === nsA.id), { rate_pence: 3000, rate_basis: 'per_panel' });
globalThis.__fail.email = true;
const ns = await issue(nsA);
globalThis.__fail.email = false;
eq('Issue when the email fails: the office is told nothing went', [ns.status, ns.body.notes], [200, ['Nothing could be sent to Nia Nosend: download the PDF from Orders and send it yourself, or add an email and issue it again.']]);

kit.done();
