// Merging duplicates (src/lib/crm/merge-rules.ts, supabase/merge.sql, src/lib/crm/report-counts.ts): which
// customer stays, each detail's default, which jobs join and what a joined job ends up with, WhatsApp's
// number and permission, the old values that keep finding the record, Reports counting each lead once,
// every table that points at a customer or a job having its line in MERGE_TABLES, and the owner's Robert
// Evans case end to end against an in-memory stand-in for the database (it does what crm_merge() does,
// step by step; the SQL itself needs a database, so it's checked with a dry run on the real one first).
// Usage: node --experimental-strip-types scripts/test-merge.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

// The rules import './stages' etc. without the .ts on the end (as the app's bundler expects); Node needs it.
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (e) {
      if (/^\.\.?\//.test(specifier) && !/\.\w+$/.test(specifier)) return next(`${specifier}.ts`, context);
      throw e;
    }
  },
});
const R = await import('../src/lib/crm/merge-rules.ts');
const { reportCounts } = await import('../src/lib/crm/report-counts.ts');
const { isMetaSource } = await import('../src/lib/ad-spend.ts');

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const customer = (o = {}) => ({
  id: uuid(), name: 'Robert Evans', email: 'rob@example.com', phone: '07791 120089', postcode: 'NP15 1DG', interest: null, property_type: null,
  source: 'quote-form', created_at: '2026-09-12T18:40:00.000Z', customer_ref: 'HX-0080', wa_id: null, wa_last_inbound_at: null,
  whatsapp_opt_in: false, whatsapp_opt_in_at: null, whatsapp_opt_in_source: null, meta_lead_id: null, meta_ad_id: null, ...o,
});
const job = (c, o = {}) => ({
  id: uuid(), enquiry_id: c.id, title: `${c.name} · ${c.postcode}`, stage: 'lead', products: ['solar'], created_at: c.created_at, updated_at: c.created_at,
  project_ref: c.customer_ref, owner_id: null, address: null, postcode: c.postcode, first_contact_at: null, next_step: null, next_step_at: null,
  next_step_notified_at: null, notes: null, value: null, survey_at: null, survey_booking_id: null, survey_event_id: null, survey_event_mailbox: null,
  install_at: null, install_event_ids: [], reminders_sent: [], capi_sent: [], sequence_step: 0, sequence_stopped_at: null, portal_token: null,
  booking_token: null, system: {}, paperwork: {}, checklist: {}, rams_project_id: null, dno_status: 'not_started', dno_ref: null, simpliheat_url: null,
  opensolar_url: null, site_lat: null, site_lng: null, ...o,
});
const facts = (j, o = {}) => ({ job: j, signed: false, paid: false, ordersSent: 0, surveys: [], booking: null, waitingQuote: false, own: null, ...o });
const side = (c, jobs, o = {}) => ({ customer: c, jobs, messages: 0, inbound: 0, outbox: { automatic: 0, scheduled: [] }, ...o });

/* ── Which customer stays ─────────────────────────────────────────────────── */

const st = (stage, o = {}) => facts({ stage, created_at: '2026-09-01T00:00:00Z' }, o);
eq('a later stage ranks higher', R.jobRank(st('surveyed')) > R.jobRank(st('lead')), true);
eq('Lost ranks lowest (it’s last in the stage list)', [R.jobRank(st('lost')) < R.jobRank(st('lead')), R.jobRank(st('lost'))], [true, -1]);
eq('a signed quote beats any stage', R.jobRank(st('quote_sent', { signed: true })) > R.jobRank(st('complete')), true);
eq('a paid deposit or kit ordered too', [R.jobRank(st('lead', { paid: true })) > R.jobRank(st('handover')), R.jobRank(st('lead', { ordersSent: 1 })) > R.jobRank(st('handover'))], [true, true]);

const web = customer();
const meta = customer({ phone: '+441291672595', source: 'meta: Video 4', created_at: '2026-09-03T09:12:00.000Z', customer_ref: 'HX-0069' });
const robWeb = side(web, [facts(job(web, { stage: 'surveyed' }))]);
const robMeta = side(meta, [facts(job(meta))]);
eq('Rob: keep HX-0080, its job is further on', R.suggestKeep(robMeta, robWeb), { keep: 'b', why: 'its job is further on: Surveyed' });
eq('a tie: the one that came in first', R.suggestKeep(side(web, [facts(job(web))]), side(meta, [facts(job(meta))])), { keep: 'b', why: 'it came in first, on 3 Sept' });
eq('no jobs at all: the one that came in first', R.suggestKeep(side(web, []), side(meta, [])).keep, 'b');
eq('the signed one, saying so', R.suggestKeep(side(web, [facts(job(web, { stage: 'won' }), { signed: true })]), robMeta), { keep: 'a', why: 'it has the signed quote' });

/* ── Their details ────────────────────────────────────────────────────────── */

const pick = (rows, key) => rows.find((r) => r.key === key);
const rows = R.fieldRows(web, meta);
eq('Rob: same name and postcode, one line each', [pick(rows, 'name').same, pick(rows, 'postcode').same], [true, true]);
eq('Rob: the mobile is kept (WhatsApp needs one)', [pick(rows, 'phone').pick, pick(rows, 'phone').why], ['keep', 'WhatsApp needs a mobile']);
eq('a landline kept, a mobile on the other: the mobile', pick(R.fieldRows(meta, web), 'phone').pick, 'merge');
eq('“Meta lead” isn’t a name', pick(R.fieldRows(customer({ name: 'Meta lead' }), web), 'name').pick, 'merge');
eq('nor is a bare number', pick(R.fieldRows(customer({ name: '+447791120089' }), web), 'name').pick, 'merge');
eq('two real names: the kept one', pick(R.fieldRows(customer({ name: 'Rob Evans' }), web), 'name').pick, 'keep');
eq('a WhatsApp lead’s empty email: the other’s', pick(R.fieldRows(customer({ email: '' }), web), 'email'), {
  key: 'email', label: 'Email', kept: '', other: 'rob@example.com', same: false, pick: 'merge', why: 'Only HX-0080 has one',
});
eq('a lead form’s 88888: the real postcode', pick(R.fieldRows(customer({ postcode: '88888' }), web), 'postcode').pick, 'merge');
eq('postcodes written differently are the same', pick(R.fieldRows(customer({ postcode: 'np151dg' }), web), 'postcode').same, true);
eq('07… and +44 7… are the same number', pick(R.fieldRows(customer({ phone: '+44 7791 120089' }), web), 'phone').same, true);
eq('nothing on either side: no line', pick(R.fieldRows(web, meta), 'interest'), undefined);

/* ── WhatsApp: the number and the permission ──────────────────────────────── */

// inbound: when they last messaged (wa_last_inbound_at); fromThem: how many of the messages are theirs.
const wa = (c, messages, inbound = null, fromThem = inbound ? 1 : 0) => side({ ...c, wa_id: R.aliasValue('phone', c.phone), wa_last_inbound_at: inbound }, [], { messages, inbound: fromThem });
eq('only one has a chat: its number', R.chooseWhatsApp(wa(web, 0), wa(meta, 3, '2026-09-20T08:00:00Z'), '07791 120089'), { waId: '441291672595', from: 'merge' });
eq('…an imported one too (no last-message time)', R.chooseWhatsApp(wa(web, 0), wa(meta, 3, null, 2), '07791 120089').waId, '441291672595');
eq('only our messages to a landline (the intro failed): the mobile', R.chooseWhatsApp(wa(web, 0), wa(meta, 1), '07791 120089'), { waId: '447791120089', from: 'keep' });
eq('both: the one they last messaged from', R.chooseWhatsApp(wa(web, 2, '2026-09-25T08:00:00Z'), wa(meta, 3, '2026-09-20T08:00:00Z'), null), { waId: '447791120089', from: 'keep' });
eq('…the other way round', R.chooseWhatsApp(wa(web, 2, '2026-09-20T08:00:00Z'), wa(meta, 3, '2026-09-25T08:00:00Z'), null).from, 'merge');
eq('neither: the main mobile (and its 24-hour window is the other record’s)', R.chooseWhatsApp(wa(meta, 0), wa(web, 0), '07791 120089'), { waId: '447791120089', from: 'merge' });
eq('neither, main phone a landline: any mobile they have', R.chooseWhatsApp(wa(meta, 0), wa(web, 0), '01291 672595').waId, '447791120089');

const perm = (whatsapp_opt_in, whatsapp_opt_in_source, whatsapp_opt_in_at = null) => customer({ whatsapp_opt_in, whatsapp_opt_in_source, whatsapp_opt_in_at, customer_ref: 'HX-0069' });
const kept = (whatsapp_opt_in, whatsapp_opt_in_source, whatsapp_opt_in_at = null) => customer({ whatsapp_opt_in, whatsapp_opt_in_source, whatsapp_opt_in_at });
const P = (k, o) => R.mergePermission(k, o).from;
eq('their STOP beats an agreement', P(kept(true, 'website-form', '2026-09-12T00:00:00Z'), perm(false, 'stop-reply', '2026-09-04T00:00:00Z')), 'merge');
eq('…and says so', R.mergePermission(kept(true, 'inbound'), perm(false, 'stop-reply', '2026-09-04T12:00:00Z')).why, 'Automatic WhatsApps stay off: replied STOP on 4 Sept (HX-0069)');
eq('staff switching it off beats an agreement', P(kept(true, 'inbound'), perm(false, 'staff-stop:Esther')), 'merge');
eq('a STOP reply beats staff switching it off', [P(kept(false, 'staff-stop:Esther'), perm(false, 'stop-reply')), P(kept(false, 'stop-reply'), perm(false, 'staff-stop:Esther'))], ['merge', 'keep']);
eq('both STOPped: the kept one', P(kept(false, 'stop-reply'), perm(false, 'stop-reply')), 'keep');
eq('agreed beats nothing', [P(kept(false, null), perm(true, 'meta-lead-form', '2026-09-03T09:12:00Z')), P(kept(true, 'inbound', '2026-09-12T00:00:00Z'), perm(false, null))], ['merge', 'keep']);
eq('both agreed: the earliest record', [P(kept(true, 'website-form', '2026-09-12T00:00:00Z'), perm(true, 'meta-lead-form', '2026-09-03T00:00:00Z')), P(kept(true, 'website-form', '2026-09-01T00:00:00Z'), perm(true, 'meta-lead-form', '2026-09-03T00:00:00Z'))], ['merge', 'keep']);
eq('a recorded agreement beats an old one with no record', P(kept(true, null), perm(true, 'meta-lead-form', '2026-09-03T00:00:00Z')), 'merge');
eq('an old agreement with no record still beats none', P(kept(false, null), perm(true, null)), 'merge');
eq('agreed beats a "Not asked" mark', P(kept(false, 'not-asked:Esther'), perm(true, 'inbound')), 'merge');
eq('a "Not asked" mark beats nothing', P(kept(false, null), perm(false, 'not-asked:Esther')), 'merge');
eq('nothing either side: nothing', R.mergePermission(kept(false, null), perm(false, null)), { from: 'keep', why: 'WhatsApp permission after merging: not agreed yet' });
eq('Rob: the Meta form’s agreement, in words', R.mergePermission(kept(false, null), perm(true, 'meta-lead-form', '2026-09-03T09:12:00Z')).why, 'WhatsApp permission after merging: agreed on 3 Sept via the Meta lead form (HX-0069)');

/* ── Old values that keep finding the record ──────────────────────────────── */

eq('numbers as WhatsApp digits', [R.aliasValue('phone', '01291 672595'), R.aliasValue('phone', '+44 (0)7791 120089'), R.aliasValue('phone', 'n/a')], ['441291672595', '447791120089', null]);
eq('emails in lower case, only real ones', [R.aliasValue('email', ' Rob@Example.COM '), R.aliasValue('email', 'not an email')], ['rob@example.com', null]);
eq('references in capitals', [R.aliasValue('customer_ref', 'hx-0069'), R.aliasValue('job_ref', 'hx-0069-2')], ['HX-0069', 'HX-0069-2']);
eq('nothing is nothing', [R.aliasValue('meta_lead', ''), R.aliasValue('customer', null)], [null, null]);

/* ── Which jobs join ──────────────────────────────────────────────────────── */

const jc = (a, b) => R.joinChoices(a, b).map((x) => [x.with !== null, x.why]);
eq('Rob: the two open solar jobs at one address join', jc(robWeb, robMeta), [[true, 'Same work at the same address, both still open']]);
const ev = facts(job(meta, { products: ['ev'] }));
eq('different things: kept apart', jc(robWeb, side(meta, [ev])), [[false, 'They’re for different things']]);
eq('no products yet counts as the same', jc(robWeb, side(meta, [facts(job(meta, { products: [] }))]))[0][0], true);
eq('different addresses: kept apart', jc(robWeb, side(meta, [facts(job(meta, { postcode: 'CF10 1AA' }))])), [[false, 'They’re at different addresses']]);
eq('two open jobs on one side: the person picks', jc(robWeb, side(meta, [facts(job(meta)), ev]))[0], [false, 'They have more than one open job: pick one to join it with if it’s the same work']);
eq('a Lost job isn’t joined by default', jc(robWeb, side(meta, [facts(job(meta, { stage: 'lost' }))])), [[false, 'It’s Lost']]);
const signedJ = (c, stage) => facts(job(c, { stage }), { signed: true });
eq('both signed: blocked', R.pairBlockers(signedJ(web, 'won'), facts(job(meta, { stage: 'quote_sent' }), { paid: true })), ['Both jobs have a signed quote or a paid deposit.', 'Both jobs are already projects (Won or later).'].slice(0, 1));
const paidMeta = facts(job(meta, { stage: 'quote_sent' }), { paid: true });
eq('kit ordered doesn’t take a paid deposit’s place', R.pairBlockers(facts(job(web, { stage: 'won' }), { ordersSent: 1 }), paidMeta), ['The signed quote or paid deposit is on the job that would go (the other is further on, with kit ordered).']);
eq('…nor is that join offered', jc(side(web, [facts(job(web, { stage: 'won' }), { ordersSent: 1 })]), side(meta, [paidMeta]))[0][0], false);
eq('the paid one further on: fine', R.pairBlockers(facts(job(web, { stage: 'contacted' })), paidMeta), []);
eq('both projects: blocked', R.pairBlockers(facts(job(web, { stage: 'won' })), facts(job(meta, { stage: 'design' }))), ['Both jobs are already projects (Won or later).']);
eq('both surveys answered: blocked', R.pairBlockers(facts(job(web), { surveys: [{ id: 's1', type: 'solar', answered: true }] }), facts(job(meta), { surveys: [{ id: 's2', type: 'solar', answered: true }] })), [
  'Both jobs have a survey with answers in it: finish or cancel one first.',
]);
eq('different RAMS projects: blocked', R.pairBlockers(facts(job(web, { rams_project_id: 'r1' })), facts(job(meta, { rams_project_id: 'r2' }))), ['They’re linked to different RAMS projects.']);
eq('one survey answered, the other empty: fine', R.pairBlockers(facts(job(web), { surveys: [{ id: 's1', type: 'solar', answered: true }] }), facts(job(meta), { surveys: [{ id: 's2', type: 'solar', answered: false }] })), []);
const older = facts(job(web, { created_at: '2026-01-01T00:00:00Z' }));
eq('in a pair, the job further on stays', R.orderPair(robMeta.jobs[0], robWeb.jobs[0]).into === robWeb.jobs[0], true);
eq('a tie: the older stays', R.orderPair(facts(job(meta)), older).into === older, true);

/* ── A joined job ─────────────────────────────────────────────────────────── */

const NOW = '2026-10-21T09:00:00.000Z';
const K = job(web, { stage: 'surveyed', products: ['solar', 'battery'], owner_id: 'u-callum', first_contact_at: '2026-09-12T18:52:00.000Z', next_step: 'Send the quote', reminders_sent: ['a'], capi_sent: ['Lead'], checklist: { x: 1 }, sequence_step: 1 });
const F = job(meta, {
  project_ref: 'HX-0069', products: ['solar', 'ev'], value: 9000, next_step: 'Call back', next_step_at: '2026-09-05T10:00:00.000Z', notes: 'Bird mesh',
  reminders_sent: ['b'], capi_sent: ['Lead', 'Schedule'], checklist: { x: 2, y: 3 }, sequence_step: 3, sequence_stopped_at: '2026-09-10T00:00:00.000Z',
  booking_token: 'tok-f', simpliheat_url: 'https://s/1',
});
const J = R.combineJobs(K, F, NOW);
const to = (c) => J.set[c]?.to;
eq('products joined', to('products'), ['solar', 'battery', 'ev']);
eq('K’s own unless blank: the value and links come from F', [to('value'), to('simpliheat_url'), J.set.owner_id], [9000, 'https://s/1', undefined]);
eq('lists joined: nothing reminded or sent twice', [to('reminders_sent'), to('capi_sent')], [['a', 'b'], ['Lead', 'Schedule']]);
eq('checklist: K’s ticks win', to('checklist'), { x: 1, y: 3 });
eq('follow-ups never restart', [to('sequence_step'), to('sequence_stopped_at')], [3, '2026-09-10T00:00:00.000Z']);
eq('both next steps: F’s is a task on K', [J.set.next_step, J.tasks], [undefined, [{ title: 'From HX-0069: Call back', notes: null, due_date: '2026-09-05', assignee_id: 'u-callum' }]]);
eq('F’s notes added, marked', to('notes'), 'From HX-0069: Bird mesh');
eq('F’s booking link moves over (K had none), off F first', [to('booking_token'), J.setFrom.booking_token], ['tok-f', { from: 'tok-f', to: null }]);
eq('each change carries what was read', J.set.value, { from: null, to: 9000 });
eq('K’s first contact stays', J.set.first_contact_at, undefined);
const early = R.combineJobs(job(web, { created_at: '2026-09-12T18:40:00.000Z' }), job(meta, { first_contact_at: '2026-09-04T10:00:00.000Z' }), NOW);
eq('first contact never before the job was made (no negative response times)', early.set.first_contact_at.to, '2026-09-12T18:40:00.000Z');
const late = R.combineJobs(job(web, { created_at: '2026-09-12T18:40:00.000Z' }), job(meta, { first_contact_at: '2026-09-13T10:00:00.000Z' }), NOW);
eq('…else F’s', late.set.first_contact_at.to, '2026-09-13T10:00:00.000Z');
const Fs = job(meta, { survey_at: '2026-11-05T10:00:00.000Z', survey_booking_id: 'b1', survey_event_id: 'EV1', survey_event_mailbox: 'callum@heliaxis.co.uk' });
const Js = R.combineJobs(job(web, { stage: 'contacted' }), Fs, NOW);
eq('K has no survey: F’s comes whole, with its Outlook copy', [to.call(null, 'x'), Js.set.survey_at.to, Js.set.survey_event_id.to, Js.surveyFrom, Js.cancelBooking], [undefined, '2026-11-05T10:00:00.000Z', 'EV1', 'from', 'into']);
eq('…and off F, so deleting F leaves the Outlook event alone', [Js.setFrom.survey_event_id.to, Js.setFrom.survey_booking_id.to], [null, null]);
const Jk = R.combineJobs(job(web, { survey_at: '2026-10-30T10:00:00.000Z' }), Fs, NOW);
eq('K has a survey: K’s stays, F’s booking is the one cancelled', [Jk.set.survey_at, Jk.surveyFrom, Jk.cancelBooking], [undefined, 'into', 'from']);
const Jt = R.combineJobs(job(web, { survey_event_id: 'OLD', survey_event_mailbox: 'callum@heliaxis.co.uk' }), Fs, NOW);
eq('an old Outlook copy K was waiting to delete is deleted', Jt.tombstones, [{ mailbox: 'callum@heliaxis.co.uk', event_id: 'OLD' }]);
eq('the site comes whole too', R.combineJobs(job(web, { postcode: null, address: null }), job(meta, { address: '1 Mill Lane', postcode: 'NP15 1DG', site_lat: 51.7, site_lng: -2.9 }), NOW).set.site_lat.to, 51.7);
eq('K’s stage and ref never change', ['stage', 'project_ref', 'created_at', 'title'].map((c) => J.set[c]), [undefined, undefined, undefined, undefined]);
eq('K is always marked changed (its page reads it all again)', J.set.updated_at, { from: K.updated_at, to: NOW });
const noRams = { ...K };
delete noRams.rams_project_id;
eq('a column the database hasn’t got yet is left out', 'rams_project_id' in R.combineJobs(noRams, { ...F, rams_project_id: 'r' }, NOW).set, false);

/* ── Names, warnings, credit ──────────────────────────────────────────────── */

eq('Rob and Robert Evans are the same name', [R.sameName('Rob Evans', 'Robert Evans'), R.sameName('Bob Evans', 'Robert Evans'), R.sameName('robert  evans', 'Robert Evans'), R.sameName('Robert', 'Robert Evans')], [true, true, true, true]);
eq('Robert and Sian Evans aren’t', [R.sameName('Sian Evans', 'Robert Evans'), R.sameName('Robert Jones', 'Robert Evans')], [false, false]);

const plan = (a, b, choices = {}, o = {}) => R.planMerge({ a, b, choices: { keep: 'a', ...choices }, by: { id: 'u-callum', name: 'Callum' }, now: NOW, ...o });
const sian = side(customer({ name: 'Sian Evans', customer_ref: 'HX-0070', created_at: '2026-09-02T00:00:00Z' }), []);
eq('different names: ticked to confirm', plan(robWeb, sian).warnings[0], { text: 'The names are different: Robert Evans and Sian Evans.', tick: 'Yes, it’s the same person (not a partner sharing a phone or email)' });
const outboxMeta = side(meta, robMeta.jobs, { outbox: { automatic: 1, scheduled: [{ at: '2026-10-22T06:00:00Z', by: 'Esther' }] } });
const ws = plan(robWeb, outboxMeta).warnings.map((w) => w.text);
eq('says what will still go (staff’s Send later messages move and stay)', ws.includes('A message Esther scheduled for Thu 07:00 will go to 07791 120089.'), true);
eq('what’s cancelled, in words (from the dry run)', [R.cancelledWords({ whatsapp_outbox: 1, tasks: 2 }), R.cancelledWords({ survey_bookings: 1, crm_surveys: 0 }), R.cancelledWords({})], [
  '1 automatic WhatsApp waiting to go, 2 automatic tasks already on the job',
  '1 survey booking',
  '',
]);
const signedBySian = side(web, [facts(job(web, { stage: 'won', accepted_name: 'Sian Evans' }), { signed: true })]);
eq('a quote signed under another name is called out', plan(signedBySian, robMeta).warnings.map((w) => w.text).filter((t) => /signed as/.test(t)), ['HX-0080’s quote was signed as “Sian Evans”, not Robert Evans.']);
eq('…not when it’s their name, give or take', plan(side(web, [facts(job(web, { stage: 'won', accepted_name: 'Rob Evans' }), { signed: true })]), robMeta).warnings.some((w) => /signed as/.test(w.text)), false);
eq('two postcodes: two properties?', plan(robWeb, side(customer({ postcode: 'CF10 1AA', customer_ref: 'HX-0071' }), [])).warnings.some((w) => w.text.startsWith('Two postcodes')), true);

const credit = plan(robWeb, robMeta);
eq('the sale counts for the job that stays, by default', [credit.joins[0].credit, credit.joins[0].creditWords], ['into', { into: 'Website', from: 'Meta ad · Video 4' }]);
eq('the Meta lead is kept for Reports, with its ad', [credit.plan.joins[0].credit, credit.plan.joins[0].origin_from.source], ['into', 'meta: Video 4']);
const swapped = plan(robWeb, robMeta, { credit: { [robMeta.jobs[0].job.id]: 'from' } });
eq('one tap counts it for Meta instead', swapped.plan.joins[0].credit, 'from');
const twoJobs = side(meta, [facts(job(meta)), facts(job(meta, { project_ref: 'HX-0069-2', created_at: '2026-09-04T09:00:00.000Z' }))]);
const both = plan(robWeb, twoJobs, { joins: { [twoJobs.jobs[0].job.id]: robWeb.jobs[0].job.id, [twoJobs.jobs[1].job.id]: robWeb.jobs[0].job.id } });
eq('two of their jobs picked for one kept job: only the first joins, the sheet says why', [both.plan.joins.length, both.joins.map((j) => [j.with !== null, j.why.startsWith('Another of their jobs is joining that one')])], [1, [[true, false], [false, true]]]);

const phoneSurvey = side(web, [facts(job(web, { stage: 'surveyed', survey_at: '2026-10-30T10:00:00.000Z' }))]);
const booked = side(meta, [facts(job(meta, { stage: 'survey_booked', survey_at: '2026-11-07T10:00:00.000Z', survey_booking_id: 'b-7' }), { booking: { id: 'b-7', status: 'confirmed', start: '2026-11-07T10:00:00.000Z' } })]);
const sv = plan(phoneSurvey, booked).warnings.find((w) => w.text.startsWith('Both jobs have a survey booked'));
eq('a survey date set by phone and their own booking: said, and ticked', sv, { text: 'Both jobs have a survey booked: the HX-0069 one (7 Nov) is cancelled and taken out of Outlook.', tick: 'I’ll tell Robert if they booked both' });
eq('…not when only one has a survey', plan(side(web, [facts(job(web, { stage: 'surveyed' }))]), booked).warnings.some((w) => w.text.startsWith('Both jobs have a survey')), false);

const video2 = customer({ source: 'meta: Video 2', meta_lead_id: 'L-2', created_at: '2026-06-01T09:00:00.000Z', customer_ref: 'HX-0010' });
const video4 = customer({ source: 'meta: Video 4', meta_lead_id: 'L-4', meta_ad_id: 'AD-4', meta_adset_id: 'AS-4', meta_campaign_id: 'C-4', customer_ref: 'HX-0069' });
const twoAds = plan(side(video2, [facts(job(video2))]), side(video4, [facts(job(video4))]));
eq('two Meta leads: the other’s ad isn’t put on the kept one (Reports would count both for it)', ['meta_ad_id', 'meta_adset_id', 'meta_campaign_id'].map((c) => c in twoAds.plan.customer.set), [false, false, false]);
eq('…its lead keeps its ad for Reports', [twoAds.plan.joins[0].origin_from.meta_ad_id, twoAds.plan.joins[0].origin_into.meta_ad_id], ['AD-4', null]);
eq('a website customer still gets the Meta lead’s ad', 'meta_ad_id' in plan(robWeb, side(video4, [facts(job(video4))])).plan.customer.set, true);

const twice = R.planMerge({ a: side(web, [robWeb.jobs[0], facts(job(web, { project_ref: 'HX-0080-2' }))]), b: null, choices: { keep: 'a' }, by: { id: null, name: 'Callum' }, now: NOW, jobPair: [null, null] });
eq('no pair picked: nothing to join', twice.plan.joins.length, 0);

/* ── Every table that points at a customer or a job has its line ──────────── */

const sqlDir = new URL('../supabase/', import.meta.url);
const fks = new Set();
for (const f of readdirSync(sqlDir).filter((x) => x.endsWith('.sql'))) {
  const sql = readFileSync(new URL(f, sqlDir), 'utf8').replace(/--[^\n]*/g, '');
  for (const m of sql.matchAll(/create table if not exists public\.(\w+)\s*\(([\s\S]*?)\n\);/g)) {
    for (const c of m[2].matchAll(/^\s*(\w+)\s+uuid[^\n]*references public\.(enquiries|crm_projects)\(id\)/gm)) fks.add(`${m[1]}.${c[1]}`);
  }
  for (const m of sql.matchAll(/alter table public\.(\w+) add column if not exists (\w+)\s+uuid[^;\n]*references public\.(enquiries|crm_projects)\(id\)/g)) fks.add(`${m[1]}.${m[2]}`);
  for (const m of sql.matchAll(/alter table public\.(\w+) add constraint \w+\s+foreign key \((\w+)\) references public\.(enquiries|crm_projects)\(id\)/g)) fks.add(`${m[1]}.${m[2]}`);
}
const missing = [...fks].filter((k) => !(k in R.MERGE_TABLES)).sort();
eq('found the ones we know about', ['whatsapp_messages.enquiry_id', 'tasks.crm_project_id', 'purchase_orders.project_id', 'survey_bookings.duplicate_of', 'crm_aliases.project_id'].every((k) => fks.has(k)), true);
eq('every foreign key to a customer or a job is in MERGE_TABLES (add a line there for a new table)', missing, []);
eq('…and nothing in MERGE_TABLES that isn’t one', Object.keys(R.MERGE_TABLES).filter((k) => !fks.has(k)), []);
eq('each points the right way', Object.entries(R.MERGE_TABLES).filter(([k, t]) => {
  const sql = readdirSync(sqlDir).map((f) => readFileSync(new URL(f, sqlDir), 'utf8')).join('\n');
  const col = k.split('.')[1];
  const re = new RegExp(`\\b${col}\\s+uuid[^\\n]*references public\\.${t.to === 'job' ? 'crm_projects' : 'enquiries'}\\(id\\)`);
  return !re.test(sql);
}).map(([k]) => k), []);

/* ── Reports: each lead once, the sale once ───────────────────────────────── */

const RJ = (id, enquiry_id, stage, created_at, o = {}) => ({ id, enquiry_id, stage, value: null, owner_id: null, created_at, first_contact_at: null, survey_at: null, ...o });
const base = { names: new Map([['u-callum', 'Callum']]), from: '2026-09-01T00:00:00Z' };
const before = reportCounts({
  ...base,
  jobs: [RJ('jw', 'ew', 'won', '2026-09-12T18:40:00Z', { value: 9800, first_contact_at: '2026-09-12T18:52:00Z' }), RJ('jm', 'em', 'lead', '2026-09-03T09:12:00Z')],
  customers: [{ id: 'ew', source: 'quote-form', created_at: '2026-09-12T18:40:00Z' }, { id: 'em', source: 'meta: Video 4', created_at: '2026-09-03T09:12:00Z', meta_ad_id: 'AD-4' }],
  origins: [],
});
const after = reportCounts({
  ...base,
  jobs: [RJ('jw', 'ew', 'won', '2026-09-12T18:40:00Z', { value: 9800, first_contact_at: '2026-09-12T18:52:00Z' })],
  customers: [{ id: 'ew', source: 'quote-form', created_at: '2026-09-12T18:40:00Z', meta_ad_id: 'AD-4' }],
  origins: [{ project_id: 'jw', role: 'also', source: 'meta: Video 4', came_in_at: '2026-09-03T09:12:00Z', job_created_at: '2026-09-03T09:12:00Z', first_contact_at: null, owner_id: null, meta_ad_id: 'AD-4' }],
});
const sum = (r) => [r.totals.leads, r.totals.won, r.totals.value, r.totals.winRate, r.bySource.map((x) => `${x.key} ${x.leads}/${x.won}/${x.value}${x.joined ? ` (incl. ${x.joined} that came in twice)` : ''}`)];
eq('before the merge: two leads, one sale', sum(before), [2, 1, 9800, 1, ['quote-form 1/1/9800', 'meta: Video 4 1/0/0']]);
eq('after joining: still two leads, the sale once, for Website', sum(after), [2, 1, 9800, 1, ['quote-form 1/1/9800', 'meta: Video 4 1/0/0 (incl. 1 that came in twice)']]);
eq('the ad spend still has the Meta lead and its ad, once', after.outcomes.filter((o) => isMetaSource(o.source)).map((o) => [o.metaAdId, o.won]), [['AD-4', false]]);
eq('the funnel and response times come from jobs', [after.funnel.find((f) => f.key === 'won').n, after.totals.medianResponseMins], [1, 12]);
const own = reportCounts({
  ...base,
  jobs: [RJ('j2', 'ew', 'lead', '2026-09-03T09:12:00Z')],
  customers: [{ id: 'ew', source: 'quote-form', created_at: '2026-09-12T18:40:00Z' }],
  origins: [{ project_id: 'j2', role: 'own', source: 'meta: Video 4', came_in_at: '2026-09-03T09:12:00Z', job_created_at: '2026-09-03T09:12:00Z', first_contact_at: null, owner_id: null, meta_ad_id: 'AD-4' }],
});
eq('a job that moved customer keeps its own lead', [own.bySource.map((x) => x.key), own.outcomes[0].metaAdId, own.outcomes[0].at], [['meta: Video 4'], 'AD-4', '2026-09-03T09:12:00Z']);
eq('an "also" lead from before the period isn’t counted', reportCounts({ ...base, from: '2026-09-10T00:00:00Z', jobs: [], customers: [], origins: [{ project_id: 'x', role: 'also', source: 'meta', came_in_at: null, job_created_at: '2026-09-03T00:00:00Z', first_contact_at: null, owner_id: null, meta_ad_id: null }] }).totals.leads, 0);

/* ── The engine, against an in-memory stand-in for the database ───────────── */

/**
 * What crm_merge() does (supabase/merge.sql), on tables in memory: the same steps in the same order. The
 * foreign keys come from MERGE_TABLES (the coverage check above proves it lists every one), and the unique
 * rules a move can clash with are the ones the SQL files define.
 */
const UNIQUE = {
  tasks: [{ cols: ['source_key'], where: (r) => r.source_key != null }],
  crm_surveys: [{ cols: ['type'], where: (r) => ['booked', 'draft'].includes(r.status) }],
  survey_bookings: [{ cols: [], where: (r) => ['requested', 'confirmed'].includes(r.status) }],
  crm_lead_origins: [{ cols: [], where: (r) => r.role === 'own' }],
};
const FKS = Object.entries(R.MERGE_TABLES).map(([k, t]) => ({ table: k.split('.')[0], col: k.split('.')[1], to: t.to }));
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const fail = (code, detail = null) => Object.assign(new Error(code), { detail });

function crmMerge(db, p) {
  const T = (t) => (db[t] ??= []);
  const row = (t, id) => T(t).find((r) => r.id === id);
  const setRow = (t, id, changes) => {
    const r = row(t, id);
    if (!changes || !Object.keys(changes).length) return;
    if (!r || Object.entries(changes).some(([c, v]) => !same(r[c], v.from))) throw fail('merge:changed', `${t} ${id}`);
    for (const [c, v] of Object.entries(changes)) r[c] = v.to;
  };
  const add = (into, k, v) => v && (into[k] = (into[k] ?? 0) + v);
  const k = row('enquiries', p.keep);
  if (!k) throw fail('merge:kept-gone');
  const d = p.merge ? row('enquiries', p.merge) : null;
  if (p.merge && !d) {
    const prev = T('crm_merges').find((m) => m.gone_enquiry_id === p.merge);
    if (prev?.kept_enquiry_id === p.keep) return { ok: true, already: true, kept: { id: k.id, ref: k.customer_ref } };
    throw fail(prev ? 'merge:merged-elsewhere' : 'merge:gone');
  }
  for (const x of p.expect) {
    const r = row(x.table, x.id);
    if (!r || Object.entries(x.values).some(([c, v]) => !same(r[c], v))) throw fail('merge:changed', `${x.table} ${x.id}`);
  }
  const contract = (jid) => !!(row('crm_projects', jid)?.accepted_at || row('crm_projects', jid)?.deposit_paid_at);
  for (const j of p.joins) {
    if (contract(j.from) && contract(j.into)) throw fail('merge:both-signed');
  }
  const merge = { id: uuid(), kept_enquiry_id: p.keep, gone_enquiry_id: p.merge, gone_ref: d?.customer_ref ?? null, snapshot: { customer: d && { ...d } } };
  T('crm_merges').push(merge);
  const counted = p.merge ? T('crm_projects').filter((r) => r.enquiry_id === p.merge).map((r) => r.id) : p.joins.map((j) => j.from);
  const summary = {};
  const internal = new Set(['crm_aliases', 'crm_lead_origins', 'crm_merges', 'crm_distinct_pairs']);
  for (const t of new Set(FKS.map((f) => f.table))) {
    if (internal.has(t)) continue;
    const cols = FKS.filter((f) => f.table === t);
    add(summary, t, T(t).filter((r) => cols.some((f) => (f.to === 'customer' ? r[f.col] === p.merge && p.merge : counted.includes(r[f.col])))).length);
  }
  const moved = {};
  const cancelled = {};
  const move = (to, from, into) => {
    for (const f of FKS.filter((x) => x.to === to && x.table !== 'crm_distinct_pairs')) {
      for (const u of UNIQUE[f.table] ?? []) {
        const theirs = T(f.table).filter((r) => r[f.col] === into && u.where(r));
        const clash = T(f.table).filter((r) => r[f.col] === from && u.where(r) && theirs.some((o) => u.cols.every((c) => o[c] != null && o[c] === r[c])));
        if (!clash.length) continue;
        if (p.policies[f.table] !== 'drop-ours') throw fail('merge:clash', f.table);
        db[f.table] = T(f.table).filter((r) => !clash.includes(r));
        add(cancelled, f.table, clash.length);
      }
      for (const r of T(f.table)) {
        if (r[f.col] !== from) continue;
        r[f.col] = into;
        add(moved, `${f.table}.${f.col}`, 1);
      }
    }
  };
  const left = (to, id) => FKS.find((f) => f.to === to && T(f.table).some((r) => r[f.col] === id));
  const origin = (o, project, role) => T('crm_lead_origins').push({ id: uuid(), ...o, project_id: project, role, merge_id: merge.id });
  for (const j of p.joins) {
    const own = (pid) => T('crm_lead_origins').find((o) => o.project_id === pid && o.role === 'own');
    if (!j.origin_from) {
      if (own(j.from)) own(j.from).role = 'also';
    } else if (j.credit === 'from') {
      if (own(j.into)) own(j.into).role = 'also';
      else origin(j.origin_into, j.into, 'also');
      if (!own(j.from)) origin(j.origin_from, j.into, 'own');
    } else if (own(j.from)) own(j.from).role = 'also';
    else origin(j.origin_from, j.into, 'also');
    for (const s of T('crm_surveys').filter((x) => x.project_id === j.from && ['booked', 'draft'].includes(x.status))) {
      const o = T('crm_surveys').find((x) => x.project_id === j.into && x.type === s.type && ['booked', 'draft'].includes(x.status));
      if (!o) continue;
      const answered = (x) => Object.keys(x.answers ?? {}).length > 0;
      if (answered(s) && answered(o)) throw fail('merge:surveys');
      (answered(s) ? o : s).status = 'cancelled';
      add(cancelled, 'crm_surveys', 1);
    }
    setRow('crm_projects', j.from, j.set_from);
    setRow('crm_projects', j.into, j.set);
    for (const t of j.tasks) T('tasks').push({ id: uuid(), status: 'todo', source_key: null, ...t, crm_project_id: j.into });
    move('job', j.from, j.into);
    if (left('job', j.from)) throw fail('merge:left', left('job', j.from).table);
    db.crm_projects = T('crm_projects').filter((r) => r.id !== j.from);
  }
  if (d) {
    for (const o of T('whatsapp_outbox')) {
      if (o.enquiry_id !== d.id || o.status !== 'pending' || !p.outbox_cancel_kinds.includes(o.kind)) continue;
      o.status = 'cancelled';
      o.last_error = p.cancel_reason;
      add(cancelled, 'whatsapp_outbox', 1);
    }
    for (const o of p.own_origins) if (row('crm_projects', o.project_id)?.enquiry_id === d.id && !T('crm_lead_origins').some((x) => x.project_id === o.project_id && x.role === 'own')) origin(o, o.project_id, 'own');
    setRow('enquiries', d.id, p.customer.clear);
    setRow('enquiries', k.id, p.customer.set);
    k.wa_unread = (k.wa_unread ?? 0) + (d.wa_unread ?? 0);
    for (const id of p.stop_sequences) row('crm_projects', id).sequence_stopped_at ??= NOW;
    move('customer', d.id, k.id);
  }
  for (const a of p.aliases) if (!T('crm_aliases').some((x) => x.kind === a.kind && x.value === a.value)) T('crm_aliases').push({ ...a, enquiry_id: k.id, merge_id: merge.id });
  for (const pair of [...(d ? [[d.id, k.id]] : []), ...p.joins.map((j) => [j.from, j.into])]) {
    for (const x of T('notifications')) {
      if (x.href?.includes(pair[0])) x.href = x.href.replace(pair[0], pair[1]);
      if (d && x.ref?.endsWith(`:${d.id}`)) x.ref = x.ref.replace(d.id, k.id);
    }
  }
  if (d) {
    if (left('customer', d.id)) throw fail('merge:left', left('customer', d.id).table);
    db.enquiries = T('enquiries').filter((r) => r.id !== d.id);
  }
  T('crm_activities').push({ id: uuid(), enquiry_id: k.id, project_id: p.timeline_job, kind: 'system', body: p.timeline.replace('{moved}', R.summaryWords(summary) || 'nothing else'), meta: { merge_id: merge.id } });
  return { ok: true, merge_id: merge.id, kept: { id: k.id, ref: k.customer_ref }, summary, moved, cancelled, files: p.files };
}

/** How merge.ts reads one customer (readSide), from the tables in memory. */
function sideOf(db, id) {
  const c = db.enquiries.find((e) => e.id === id);
  if (!c) return null;
  const jobs = db.crm_projects.filter((j) => j.enquiry_id === id).map((j) =>
    facts(j, {
      signed: !!j.accepted_at,
      paid: !!j.deposit_paid_at,
      surveys: (db.crm_surveys ?? []).filter((s) => s.project_id === j.id && ['booked', 'draft'].includes(s.status)).map((s) => ({ id: s.id, type: s.type, answered: Object.keys(s.answers).length > 0 })),
      own: (db.crm_lead_origins ?? []).find((o) => o.project_id === j.id && o.role === 'own') ?? null,
    })
  );
  const outbox = (db.whatsapp_outbox ?? []).filter((o) => o.enquiry_id === id && o.status === 'pending');
  const messages = (db.whatsapp_messages ?? []).filter((m) => m.enquiry_id === id);
  return side(c, jobs, { messages: messages.length, inbound: messages.filter((m) => m.direction === 'in').length, outbox: { automatic: outbox.filter((o) => o.kind !== 'scheduled').length, scheduled: [] } });
}

/** The lookups that use what a merge leaves (src/lib/crm/aliases.ts, the inbound WhatsApp in src/lib/whatsapp/inbox.ts). */
const mergedInto = (db, kind, raw) => db.crm_aliases.find((a) => a.kind === kind && a.value === R.aliasValue(kind, raw)) ?? null;
function enquiryForNumber(db, waId) {
  const byWa = db.enquiries.find((e) => e.wa_id === waId);
  if (byWa) return { id: byWa.id, how: 'their number' };
  const typed = db.enquiries.find((e) => !e.wa_id && R.aliasValue('phone', e.phone) === waId);
  if (typed) return { id: typed.id, how: 'their phone' };
  const hit = mergedInto(db, 'phone', waId);
  return hit ? { id: hit.enquiry_id, how: 'an other number' } : { id: null, how: 'a new customer' };
}

// The owner's two Robert Evans: a website customer with a Surveyed job, a Meta lead with a Lead job.
const W = customer({ wa_id: '447791120089', wa_last_inbound_at: '2026-09-25T08:00:00.000Z', wa_unread: 1 });
const M = customer({
  phone: '+441291672595', wa_id: '441291672595', source: 'meta: Video 4', created_at: '2026-09-03T09:12:00.000Z', customer_ref: 'HX-0069', email: 'rob.evans@btinternet.com',
  meta_lead_id: 'L-555', meta_ad_id: 'AD-4', whatsapp_opt_in: true, whatsapp_opt_in_at: '2026-09-03T09:12:00.000Z', whatsapp_opt_in_source: 'meta-lead-form', wa_unread: 0,
});
const JW = job(W, { stage: 'surveyed', products: ['solar', 'battery'], owner_id: 'u-callum', first_contact_at: '2026-09-12T18:52:00.000Z', next_step: 'Send the quote', booking_token: 'tok-w' });
const JM = job(M, { project_ref: 'HX-0069', next_step: 'Call back about panels', next_step_at: '2026-09-05T10:00:00.000Z', booking_token: 'tok-m', notes: 'Bird mesh' });
const db = {
  enquiries: [W, M],
  crm_projects: [JW, JM],
  whatsapp_messages: [
    { id: uuid(), enquiry_id: W.id, direction: 'in', body: 'Is Thursday OK?' },
    { id: uuid(), enquiry_id: W.id, direction: 'out', body: 'Yes' },
    { id: uuid(), enquiry_id: M.id, direction: 'out', body: 'Hi Robert, thanks for your enquiry', status: 'failed' },
  ],
  whatsapp_outbox: [{ id: uuid(), enquiry_id: M.id, kind: 'chase', status: 'pending' }],
  crm_activities: [
    { id: uuid(), enquiry_id: W.id, project_id: JW.id, kind: 'note', body: 'Wants a battery too' },
    { id: uuid(), enquiry_id: M.id, project_id: JM.id, kind: 'note', body: 'Called, no answer' },
  ],
  tasks: [
    { id: uuid(), crm_project_id: JM.id, title: 'Call Rob about bird mesh', source_key: null, status: 'todo' },
    { id: uuid(), crm_project_id: JM.id, title: 'Survey follow-up', source_key: 'survey-send:x', status: 'todo' },
    { id: uuid(), crm_project_id: JW.id, title: 'Survey follow-up', source_key: 'survey-send:x', status: 'todo' },
  ],
  crm_photos: [{ id: uuid(), project_id: JM.id, storage_path: `${JM.id}/site/roof.jpg` }],
  crm_surveys: [{ id: uuid(), project_id: JM.id, enquiry_id: M.id, type: 'solar', status: 'booked', answers: {} }],
  notifications: [{ id: uuid(), href: `/admin/crm/${JM.id}`, ref: `lead:${M.id}` }],
  crm_aliases: [],
  crm_lead_origins: [],
  crm_merges: [],
};

const a = sideOf(db, W.id);
const b = sideOf(db, M.id);
const keep = R.suggestKeep(a, b);
const preview = R.planMerge({ a, b, choices: { keep: keep.keep }, by: { id: 'u-callum', name: 'Callum' }, now: NOW });
eq('Rob: HX-0080 suggested, HX-0069’s job joined into it', [keep.keep, preview.joins.map((j) => [j.job.ref, j.stays === JW.id])], ['a', [['HX-0069', true]]]);
eq('Rob: replies to his mobile, the landline an other number', [preview.whatsapp.waId, preview.whatsapp.otherNumbers], ['447791120089', ['+441291672595']]);
eq('Rob: the Reports line', `The sale counts for ${preview.joins[0].creditWords.into}. Count it for ${preview.joins[0].creditWords.from} instead`, 'The sale counts for Website. Count it for Meta ad · Video 4 instead');
eq('Rob: his old folders move', preview.plan.files.map((f) => `${f.bucket} ${f.from.replace(JM.id, 'HX-0069-job').replace(M.id, 'HX-0069')} → ${f.to.replace(JW.id, 'HX-0080-job').replace(W.id, 'HX-0080')}`), [
  'whatsapp-media HX-0069/ → HX-0080/',
  'crm-photos HX-0069-job/ → HX-0080-job/',
  'crm-docs projects/HX-0069-job/ → projects/HX-0080-job/',
  'crm-docs signatures/HX-0069-job/ → signatures/HX-0080-job/',
]);

const done = crmMerge(db, preview.plan);
eq('merged: one Robert Evans, one job, HX-0080, still Surveyed', [done.kept.ref, db.enquiries.map((e) => e.customer_ref), db.crm_projects.map((j) => `${j.project_ref} ${j.stage}`)], ['HX-0080', ['HX-0080'], ['HX-0080 surveyed']]);
eq('what moved, in words', R.summaryWords(done.summary), '1 WhatsApp message, 1 timeline note, 2 tasks, 1 photo, 1 survey');
eq('his chats on both numbers, notes, tasks and photo are on HX-0080', [
  db.whatsapp_messages.filter((m) => m.enquiry_id === W.id).length,
  db.crm_activities.filter((x) => x.enquiry_id === W.id && x.kind === 'note').length,
  db.tasks.map((t) => t.title).sort(),
  db.crm_photos[0].project_id === JW.id,
], [3, 2, ['Call Rob about bird mesh', 'From HX-0069: Call back about panels', 'Survey follow-up'], true]);
eq('the automatic chaser for the landline is cancelled', db.whatsapp_outbox.map((o) => `${o.status} ${o.last_error}`), ['cancelled Merged into HX-0080']);
eq('Meta’s lead id moved onto him (the Conversions API hears about the sale), and the ad', [W.meta_lead_id, W.meta_ad_id], ['L-555', 'AD-4']);
eq('permission: agreed on the Meta form, as recorded', [W.whatsapp_opt_in, W.whatsapp_opt_in_source, W.whatsapp_opt_in_at], [true, 'meta-lead-form', '2026-09-03T09:12:00.000Z']);
eq('the old notification opens the kept job', db.notifications[0], { id: db.notifications[0].id, href: `/admin/crm/${JW.id}`, ref: `lead:${W.id}` });
eq('his timeline says so', db.crm_activities.at(-1).body, 'Merged Robert Evans HX-0069 (Meta ad · Video 4, came in 3 Sept) into this record: 1 WhatsApp message, 1 timeline note, 2 tasks, 1 photo, 1 survey. Job HX-0069 joined HX-0080. By Callum.');

eq('HX-0069 still finds him (customer and job)', [mergedInto(db, 'customer_ref', 'hx-0069')?.enquiry_id === W.id, mergedInto(db, 'job_ref', 'HX-0069')?.project_id === JW.id], [true, true]);
eq('an old link or notification still opens him', [mergedInto(db, 'customer', M.id)?.enquiry_id === W.id, mergedInto(db, 'job', JM.id)?.project_id === JW.id], [true, true]);
eq('his old booking link still opens his job', mergedInto(db, 'booking_token', 'tok-m')?.project_id === JW.id, true);
eq('a WhatsApp from the landline lands in his chat', enquiryForNumber(db, '441291672595'), { id: W.id, how: 'an other number' });
eq('one from his mobile as before', enquiryForNumber(db, '447791120089'), { id: W.id, how: 'their number' });
eq('re-importing the Meta lead finds him (not a new HX-0069)', [W.meta_lead_id === 'L-555', mergedInto(db, 'meta_lead', 'L-555')], [true, null]);

const rep = reportCounts({
  names: new Map(),
  from: '2026-09-01T00:00:00Z',
  jobs: db.crm_projects.map((j) => ({ ...j, stage: 'won', value: 9800 })),
  customers: db.enquiries,
  origins: db.crm_lead_origins,
});
eq('Reports: both leads, the sale once, for Website', [rep.totals.leads, rep.totals.won, rep.totals.value, rep.bySource.map((r) => `${r.key} ${r.leads}/${r.won}`)], [2, 1, 9800, ['quote-form 1/1', 'meta: Video 4 1/0']]);

const snapshot = JSON.stringify(db);
const again = crmMerge(db, preview.plan);
eq('the merge a second time: done already, nothing more changes', [again.already, JSON.stringify(db) === snapshot], [true, true]);
const fresh = sideOf(db, W.id);
eq('and HX-0069 can’t be read to merge again', [sideOf(db, M.id), fresh.jobs.length], [null, 1]);

// Something changed between the preview and Merge: refused, nothing changed.
const db2 = JSON.parse(snapshot.replace(/"Wants a battery too"/, '"x"'));
const plan2 = R.planMerge({ a: sideOf(db2, W.id), b: side({ ...M, id: uuid(), customer_ref: 'HX-0090' }, []), choices: { keep: 'a' }, by: { id: null, name: 'Callum' }, now: NOW }).plan;
db2.enquiries.push({ ...M, id: plan2.merge, customer_ref: 'HX-0090', phone: '07700 900999' });
let refused = null;
try {
  crmMerge(db2, plan2);
} catch (e) {
  refused = e.message;
}
eq('a record that changed meanwhile is refused', [refused, db2.enquiries.length], ['merge:changed', 2]);

// Rob as he really is: the website record has no chat yet, and the Meta intro went to the landline (and failed).
function twoRobs(w, m, messages) {
  const d = { enquiries: [w, m], crm_projects: [job(w, { stage: 'surveyed' }), job(m, { project_ref: m.customer_ref })], whatsapp_messages: messages, crm_aliases: [], crm_lead_origins: [], crm_merges: [] };
  const p = R.planMerge({ a: sideOf(d, w.id), b: sideOf(d, m.id), choices: { keep: 'a' }, by: { id: null, name: 'Callum' }, now: NOW });
  crmMerge(d, p.plan);
  return { d, p };
}
const W2 = customer();
const M2 = customer({ phone: '+441291672595', wa_id: '441291672595', source: 'meta: Video 4', created_at: '2026-09-03T09:12:00.000Z', customer_ref: 'HX-0069' });
const real = twoRobs(W2, M2, [{ id: uuid(), enquiry_id: M2.id, direction: 'out', body: 'Hi Robert, thanks for your enquiry', status: 'failed' }]);
eq('Rob, no chat on HX-0080: replies still go to his mobile, the landline another number', [real.p.whatsapp.waId, real.p.whatsapp.otherNumbers, W2.wa_id], ['447791120089', ['+441291672595'], '447791120089']);
eq('…and a WhatsApp from either number finds him', [enquiryForNumber(real.d, '447791120089').id === W2.id, enquiryForNumber(real.d, '441291672595')], [true, { id: W2.id, how: 'an other number' }]);

// Two mobiles, only the other record's has a chat: replies go to that one, and his main phone stays findable.
const W3 = customer();
const M3 = customer({ phone: '07700 900123', wa_id: '447700900123', customer_ref: 'HX-0069' });
const mob = twoRobs(W3, M3, [{ id: uuid(), enquiry_id: M3.id, direction: 'in', body: 'Hi, is Thursday OK?' }]);
eq('two mobiles: replies to the one he messaged from, his main phone another number', [mob.p.whatsapp.waId, mob.p.plan.aliases.filter((x) => x.kind === 'phone').map((x) => [x.value, x.shown]), W3.phone], [
  '447700900123', [['447791120089', '07791 120089']], '07791 120089',
]);
eq('…so a WhatsApp from his main phone lands in his chat, not a new customer', enquiryForNumber(mob.d, '447791120089'), { id: W3.id, how: 'an other number' });

console.log(failed ? `\n${failed} FAILED` : '\nAll passed.');
process.exit(failed ? 1 : 0);
