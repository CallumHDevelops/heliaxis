// Projects (src/lib/projects/*): HX-ref search, the stage's main button, the checklist, paperwork
// deadlines, and the CRM home's feeds (what each timeline row is, UK-day groups both sides of the
// clocks going back on Sunday 25 October 2026).
// Usage: node --experimental-strip-types scripts/test-projects.mjs
import { looksLikeRef, refMatches, refOnly, refPatterns, shownRef } from '../src/lib/projects/refs.ts';
import { nextDeliveryStage, primaryActionFor } from '../src/lib/projects/primary-action.ts';
import { CHECKLIST, STAGE_ORDER, checkGroupFor, checklistItem, checklistView, stageProgress } from '../src/lib/projects/checklist.ts';
import { addMonths, busExpiry, daysBetween, deadlinesFor, shortDay } from '../src/lib/projects/deadlines.ts';
import { classifyActivity, dbFilterFor, dbKindsFor, dueGroup, FEED_CHIPS, inFeed, plusDays, ukDayStart } from '../src/lib/projects/feed.ts';
import { STAGE_KEYS, stageLabel } from '../src/lib/crm/stages.ts';
import { addWorkingDays, ukDay } from '../src/lib/bank-holidays.ts';

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

/* ── Refs ─────────────────────────────────────────────────────────────────── */

eq('HX-0042 looks like a ref', looksLikeRef('HX-0042'), true);
eq('hx42 looks like a ref', looksLikeRef('hx42'), true);
eq('0042 looks like a ref', looksLikeRef('0042'), true);
eq('42 does not', looksLikeRef('42'), false);
eq('a name does not', looksLikeRef('Hexham'), false);
eq('a phone number does not', looksLikeRef('07700 900123'), false);
eq('HX-0042 finds HX-0042', refMatches('HX-0042', 'HX-0042'), true);
eq('HX-0042 finds HX-0042-2', refMatches('HX-0042', 'HX-0042-2'), true);
eq('hx42 finds HX-0042', refMatches('hx42', 'HX-0042'), true);
eq('hx42 finds HX-0042-2', refMatches('hx42', 'HX-0042-2'), true);
eq('0042 finds HX-0042', refMatches('0042', 'HX-0042'), true);
eq('0042 finds HX-0042-2', refMatches('0042', 'HX-0042-2'), true);
eq('hx-0042-2 finds HX-0042-2', refMatches('hx-0042-2', 'HX-0042-2'), true);
eq('hx-0042-2 does not find HX-0042', refMatches('hx-0042-2', 'HX-0042'), false);
eq('hx-0042-2 does not find HX-0042-3', refMatches('hx-0042-2', 'HX-0042-3'), false);
eq('HX-004 (still typing) finds HX-0042', refMatches('HX-004', 'HX-0042'), true);
eq('42 is not a ref search', refMatches('42', 'HX-0042'), false);
eq('hx43 does not find HX-0042', refMatches('hx43', 'HX-0042'), false);
eq('no ref yet', refMatches('HX-0042', null), false);
eq('hx… is only a ref; 0042 could be a phone too', [refOnly('hx42'), refOnly('0042')], [true, false]);
eq('patterns for HX-0042', refPatterns('HX-0042'), ['HX-0042%']);
eq('patterns for hx42', refPatterns('hx42'), ['HX-42%', 'HX-0042', 'HX-0042-%']);
eq('patterns for hx-0042-2', refPatterns('hx-0042-2'), ['HX-0042-2%']);
eq('patterns for 0042', refPatterns('0042'), ['HX-0042%']);
eq('patterns for hx 42-2', refPatterns('hx 42-2'), ['HX-42-2%', 'HX-0042-2']);
eq('patterns for HX-12345', refPatterns('HX-12345'), ['HX-12345%']);
eq('no patterns for a name', refPatterns('Jane'), []);
// Every pattern is something refMatches agrees with (turn the ilike into a regex and check both refs).
const like = (pat) => new RegExp(`^${pat.replace(/%/g, '.*')}$`, 'i');
for (const q of ['HX-0042', 'hx42', '0042', 'hx-0042-2', 'hx 42-2', 'HX-004']) {
  for (const ref of ['HX-0042', 'HX-0042-2', 'HX-0042-3', 'HX-0043']) {
    eq(`${q} → ${ref}: database and screen agree`, refPatterns(q).some((p) => like(p).test(ref)), refMatches(q, ref));
  }
}
eq('shown: job ref first', shownRef({ project_ref: 'HX-0042-2', customer_ref: 'HX-0042', postcode: 'NP20 4AB' }), 'HX-0042-2');
eq('shown: customer ref next', shownRef({ project_ref: null, customer_ref: 'HX-0042', postcode: 'NP20 4AB' }), 'HX-0042');
eq('shown: postcode before the SQL', shownRef({ postcode: 'NP20 4AB' }), 'NP20 4AB');

/* ── Stages: the local copies match stages.ts ─────────────────────────────── */

eq('checklist stage order matches stages.ts', [...STAGE_ORDER], STAGE_KEYS);
eq(
  'delivery names match stages.ts',
  ['won', 'design', 'ready', 'install_booked', 'installing', 'commissioning', 'handover'].map((k) => nextDeliveryStage(STAGE_KEYS[STAGE_KEYS.indexOf(k) - 1] ?? '')?.label ?? stageLabel(k)),
  ['won', 'design', 'ready', 'install_booked', 'installing', 'commissioning', 'handover'].map((k) => stageLabel(k))
);
eq('handover → Complete', nextDeliveryStage('handover'), { key: 'complete', label: 'Complete' });
eq('nothing after Complete', nextDeliveryStage('complete'), null);

/* ── The main button ──────────────────────────────────────────────────────── */

eq('Lead', [primaryActionFor('lead').action, primaryActionFor('lead').tile?.action], ['mark_contacted', 'booking_link']);
eq('Contacted', primaryActionFor('contacted').label, 'Send booking link');
eq('Survey booked, not today', primaryActionFor('survey_booked', { surveyDay: '2026-11-03', today: '2026-10-30' }).action, 'find_time');
eq('Survey booked, on the day', primaryActionFor('survey_booked', { surveyDay: '2026-11-03', today: '2026-11-03' }).action, 'start_survey');
eq('Surveyed', primaryActionFor('surveyed').label, 'Send quote for signing');
eq('Quote sent', [primaryActionFor('quote_sent').label, primaryActionFor('quote_sent').menu.map((m) => m.label)], ['Chase quote', ['Mark Won']]);
eq('Won, all key items done', primaryActionFor('won'), {
  action: 'move_next',
  to: 'design',
  label: 'Move to Design & approvals →',
  menu: [],
  tile: { action: 'install_dates', label: 'Add install dates' },
});
const anyway = primaryActionFor('design', { keyMissing: 2 });
eq('Design, 2 key items missing', [anyway.label, anyway.confirm], [
  'Move to Ready to book anyway · 2 key items not done',
  '2 key items aren’t done yet. Move to Ready to book anyway?',
]);
eq('one key item missing', primaryActionFor('ready', { keyMissing: 1 }).confirm, '1 key item isn’t done yet. Move to Install booked anyway?');
eq('Commissioning tile', primaryActionFor('commissioning').tile?.label, 'Upload certificate');
eq('Install booked has no tile', primaryActionFor('install_booked').tile, null);
eq('Handover moves to Complete', primaryActionFor('handover').to, 'complete');
eq('Complete', [primaryActionFor('complete').label, primaryActionFor('complete').tile?.label], ['Ask for a review', 'Upload certificate']);
eq('Lost', [primaryActionFor('lost').label, primaryActionFor('lost').tile], ['Reopen', null]);

/* ── Checklist ────────────────────────────────────────────────────────────── */

const keys = CHECKLIST.map((i) => i.key);
eq('checklist keys are unique', new Set(keys).size, keys.length);
eq(
  'the key items',
  CHECKLIST.filter((i) => i.key_item).map((i) => i.key),
  ['w_contract', 'w_deposit', 'd_dno_route', 'd_g99_applied', 'd_bus_applied', 'r_g99_ok', 'r_bus_ok', 'r_scaffold', 'i_dates', 'c_commissioned', 'h_mcs', 'h_bus_redeemed']
);
eq('unknown item', checklistItem('nope'), undefined);
eq('groups', [checkGroupFor('lead'), checkGroupFor('quote_sent'), checkGroupFor('won'), checkGroupFor('complete'), checkGroupFor('lost')], [
  'sales',
  'sales',
  'won',
  'complete',
  null,
]);

const job = (over = {}) => ({
  id: 'p1',
  stage: 'won',
  products: ['solar', 'battery'],
  checklist: {},
  paperwork: {},
  system: {},
  reminders_sent: [],
  ...over,
});
const ctx = (p, over = {}) => ({ p, docs: [], photoCounts: {}, surveys: [], subcontracts: [], site: [], handoverSent: false, outlook: false, today: '2026-10-23', ...over });
const items = (c, stage) => checklistView(c).find((g) => g.stage === stage)?.items ?? [];
const item = (c, stage, key) => items(c, stage).find((i) => i.key === key);

{
  const c = ctx(job());
  eq('Won with no deposit asked: no deposit item', item(c, 'won', 'w_deposit'), undefined);
  eq('Won, nothing done', stageProgress(c, 'won'), { done: 0, total: 3, keyMissing: 1 });
  const paid = ctx(job({ deposit_amount: 500, deposit_paid_at: '2026-10-20T10:00:00Z', accepted_at: '2026-10-19T10:00:00Z' }));
  eq('signed and paid tick themselves', [item(paid, 'won', 'w_contract')?.auto, item(paid, 'won', 'w_deposit')?.done], [true, true]);
  eq('Won, signed and paid', stageProgress(paid, 'won'), { done: 2, total: 4, keyMissing: 0 });
  const outside = ctx(job(), { docs: [{ category: 'quote', visible: true, needs_signature: false, signed_outside_at: '2026-10-03T09:00:00Z' }] });
  eq('a quote marked Signed in Docs ticks the contract', item(outside, 'won', 'w_contract')?.done, true);
  const invoice = ctx(job(), { docs: [{ category: 'invoice', visible: true, needs_signature: false, signed_outside_at: '2026-10-03T09:00:00Z' }] });
  eq('a signed invoice does not', item(invoice, 'won', 'w_contract')?.done, false);
}
{
  const manual = ctx(job({ checklist: { w_deposit_cover: { done_at: '2026-10-22T09:00:00Z', by: 'Esther', by_id: 'u1' }, w_survey: { na: true, by: 'Callum' } } }));
  eq('a manual tick keeps who and when', item(manual, 'won', 'w_deposit_cover'), {
    key: 'w_deposit_cover',
    label: 'Deposit insurance cover issued',
    done: true,
    auto: false,
    na: false,
    by: 'Esther',
    at: '2026-10-22T09:00:00Z',
    key_item: false,
  });
  eq('Not needed counts as done', [item(manual, 'won', 'w_survey')?.na, item(manual, 'won', 'w_survey')?.done], [true, true]);
  eq('Won with two ticks', stageProgress(manual, 'won'), { done: 2, total: 3, keyMissing: 1 });
}
{
  const solar = ctx(job(), { surveys: [{ type: 'solar', status: 'complete', simpliheat_url: null, hasDoc: false }] });
  eq('solar job: a finished solar survey', item(solar, 'won', 'w_survey')?.done, true);
  const both = ctx(job({ products: ['solar', 'heatpump'] }), { surveys: [{ type: 'solar', status: 'complete', simpliheat_url: null, hasDoc: false }] });
  eq('solar and heat pump: the heat pump survey is still needed', item(both, 'won', 'w_survey')?.done, false);
  const heat = ctx(job({ products: ['heatpump'] }), { surveys: [{ type: 'ashp', status: 'booked', simpliheat_url: 'https://simpliheat.example/1', hasDoc: false }] });
  eq('heat pump: a SimpliHeat link', item(heat, 'won', 'w_survey')?.done, true);
  eq('heat pump jobs have no ENA item', item(heat, 'design', 'd_ena'), undefined);
  eq('battery jobs have no BUS item', item(ctx(job()), 'design', 'd_bus_applied'), undefined);
}
{
  const g98 = ctx(job({ stage: 'design', paperwork: { dno_route: 'g98' } }));
  eq('G98: route ticked, no G99 items', [item(g98, 'design', 'd_dno_route')?.done, item(g98, 'design', 'd_g99_applied'), item(g98, 'ready', 'r_g99_ok')], [
    true,
    undefined,
    undefined,
  ]);
  const g99 = ctx(job({ stage: 'design', paperwork: { dno_route: 'g99' }, dno_status: 'submitted' }));
  eq('G99 applied ticks itself', [item(g99, 'design', 'd_g99_applied')?.done, item(g99, 'ready', 'r_g99_ok')?.done], [true, false]);
}
{
  const live = ctx(job({ stage: 'ready', rams_project_id: 'R1' }), { subcontracts: [{ status: 'crew_confirmed' }, { status: 'cancelled' }] });
  eq('trades: every live booking confirmed', item(live, 'ready', 'r_trades')?.done, true);
  const waiting = ctx(job({ stage: 'ready', rams_project_id: 'R1' }), { subcontracts: [{ status: 'crew_confirmed' }, { status: 'awaiting_crew' }] });
  eq('trades: one still waiting', item(waiting, 'ready', 'r_trades')?.done, false);
  const none = ctx(job({ stage: 'ready', rams_project_id: 'R1' }));
  eq('trades: nobody booked yet', item(none, 'ready', 'r_trades')?.done, false);
  // The site app (SPEC 1K): every live trade sent their job pack also counts.
  const sent = ctx(job({ stage: 'ready' }), { site: [{ trade: 'roofer', status: 'opened', photos: 0 }, { trade: 'scaffolder', status: 'sent', photos: 0 }, { trade: 'electrician', status: 'cancelled', photos: 0 }] });
  eq('trades: every live site trade sent', item(sent, 'ready', 'r_trades')?.done, true);
  const draft = ctx(job({ stage: 'ready' }), { site: [{ trade: 'roofer', status: 'sent', photos: 0 }, { trade: 'electrician', status: 'draft', photos: 0 }] });
  eq('trades: one site trade not sent yet', item(draft, 'ready', 'r_trades')?.done, false);
  eq('trades: an empty site list (or before the SQL) changes nothing', [item(ctx(job({ stage: 'ready' }), { site: [] }), 'ready', 'r_trades')?.done, item(ctx(job({ stage: 'ready' }), { site: undefined }), 'ready', 'r_trades')?.done], [false, false]);
}
{
  const synced = ctx(job({ stage: 'installing' }), { site: [{ trade: 'roofer', status: 'started', photos: 3 }] });
  eq('progress photos: a trade photo synced', item(synced, 'installing', 'n_progress')?.done, true);
  eq('progress photos: trades with none', item(ctx(job({ stage: 'installing' }), { site: [{ trade: 'roofer', status: 'started', photos: 0 }] }), 'installing', 'n_progress')?.done, false);
  const sparks = (status) => item(ctx(job({ stage: 'commissioning' }), { site: [{ trade: 'electrician', status, photos: 12 }] }), 'commissioning', 'c_photos')?.done;
  eq('completion photos: the electrician signed (signed, done), not before', [sparks('signed'), sparks('done'), sparks('started')], [true, true, false]);
  eq('completion photos: a roofer signing is not enough', item(ctx(job({ stage: 'commissioning' }), { site: [{ trade: 'roofer', status: 'done', photos: 9 }] }), 'commissioning', 'c_photos')?.done, false);
  const pack = (over) => item(ctx(job({ stage: 'handover' }), over), 'handover', 'h_pack')?.done;
  eq('handover pack: sent (Unit 4), or a visible handover document', [pack({ handoverSent: true }), pack({ docs: [{ category: 'handover', visible: true, needs_signature: false, signed_outside_at: null }] }), pack({})], [true, true, false]);
}
{
  const bus = (exp) => item(ctx(job({ products: ['heatpump'], paperwork: { bus_issued_on: '2026-08-01', bus_expires_on: exp } })), 'ready', 'r_bus_ok')?.done;
  eq('BUS voucher in date / out of date', [bus('2026-11-01'), bus('2026-10-22')], [true, false]);
  const outlook = ctx(job({ stage: 'install_booked', install_event_ids: ['e1'] }), { outlook: true });
  eq('In Outlook only once Microsoft 365 is connected', [item(outlook, 'install_booked', 'i_outlook')?.done, item(ctx(job()), 'install_booked', 'i_outlook')], [true, undefined]);
  const photos = ctx(job({ stage: 'installing' }), { photoCounts: { progress: 2 } });
  eq('progress photos', item(photos, 'installing', 'n_progress')?.done, true);
  const down = (d) => item(ctx(job({ stage: 'complete', scaffold_down_on: d })), 'complete', 'x_scaffold_down')?.done;
  eq('scaffold removed: today yes, tomorrow no', [down('2026-10-23'), down('2026-10-24')], [true, false]);
  const review = ctx(job({ stage: 'complete', reminders_sent: ['install-3:2026-10-01', 'review'] }));
  eq('review request sent', item(review, 'complete', 'x_review')?.done, true);
}
{
  const lead = ctx(job({ stage: 'contacted', products: [], first_contact_at: null }));
  eq('sales list at Contacted', stageProgress(lead, 'contacted'), { done: 1, total: 6, keyMissing: 0 });
  const lost = ctx(job({ stage: 'lost', products: [] }));
  eq('a Lost job has not "reached" Contacted', item(lost, 'sales', 's_contacted')?.done, false);
  eq('Lost has no progress', stageProgress(lost, 'lost'), { done: 0, total: 0, keyMissing: 0 });
}

/* ── Deadlines ────────────────────────────────────────────────────────────── */

const cal = (today, hols = new Set()) => ({ today, hols, addWorkingDays, ukDay });
eq('31 Jan + 1 month', addMonths('2026-01-31', 1), '2026-02-28');
eq('15 Aug + 3 months', addMonths('2026-08-15', 3), '2026-11-15');
eq('30 Nov + 3 months', addMonths('2026-11-30', 3), '2027-02-28');
eq('days between, over the clock change', daysBetween('2026-10-24', '2026-10-26'), 2);
eq('short day', shortDay('2026-11-06'), 'Fri 6 Nov');
eq('BUS expiry from the issue date', busExpiry({ bus_issued_on: '2026-08-15' }), '2026-11-15');
eq('BUS expiry as saved', busExpiry({ bus_issued_on: '2026-08-15', bus_expires_on: '2026-11-20' }), '2026-11-20');
{
  // Commissioned on Fri 23 Oct at 23:30 BST: that's Friday in the UK (22:30 UTC).
  const p = job({ stage: 'commissioning', commissioned_at: '2026-10-23T22:30:00Z', paperwork: { dno_route: 'g98' } });
  const d = deadlinesFor(p, cal('2026-10-26'));
  eq('deadlines after commissioning', d.map((x) => [x.key, x.due, x.done]), [
    ['mcs', '2026-11-06', false],
    ['g98', '2026-11-20', false],
    ['regs', '2026-11-22', false],
  ]);
  eq('MCS label and counter', [d[0].label, d[0].daysLeft, d[0].remind], ['Register the MCS certificate', 11, '2026-11-04']);
  const hol = deadlinesFor(p, cal('2026-10-26', new Set(['2026-11-02'])));
  eq('a bank holiday pushes MCS back a day', hol[0].due, '2026-11-09');
  const done = deadlinesFor(
    job({ ...p, checklist: { c_dno_notified: { done_at: '2026-10-30T10:00:00Z' } }, paperwork: { dno_route: 'g98', mcs_cert_no: 'MCS123', building_regs_ref: 'N1' } }),
    cal('2026-10-26')
  );
  eq('done when the paperwork is in', done.map((x) => x.done), [true, true, true]);
  const late = deadlinesFor(p, cal('2026-12-01'));
  eq('passed: the task is due today', [late[0].daysLeft, late[0].remind], [-25, '2026-12-01']);
  eq('EV-only jobs need no MCS', deadlinesFor(job({ products: ['ev'], commissioned_at: '2026-10-23T10:00:00Z' }), cal('2026-10-26')).map((x) => x.key), ['regs']);
  eq('nothing before commissioning', deadlinesFor(job(), cal('2026-10-26')), []);
}
{
  const bus = deadlinesFor(job({ products: ['heatpump'], paperwork: { bus_issued_on: '2026-08-15' } }), cal('2026-10-26'));
  eq('BUS voucher deadline', bus.map((x) => [x.key, x.label, x.due, x.remind]), [['bus', 'BUS voucher expires Sun 15 Nov', '2026-11-15', '2026-11-01']]);
  const g99 = deadlinesFor(job({ paperwork: { dno_route: 'g99' }, dno_submitted_at: '2026-09-01T09:00:00Z', dno_status: 'submitted' }), cal('2026-10-26'));
  eq('G99 chase after 45 working days', g99.map((x) => [x.key, x.due]), [['g99', addWorkingDays('2026-09-01', 45, new Set())]]);
  eq('45 working days from Tue 1 Sep', g99[0].due, '2026-11-03');
  const ibg = deadlinesFor(job({ commissioned_at: '2026-10-23T10:00:00Z', paperwork: { mcs_cert_no: 'MCS-1', mcs_registered_on: '2026-10-28' } }), cal('2026-10-29'));
  eq('the guarantee within 7 days of the MCS certificate (handover CC16)', ibg.filter((x) => x.key === 'cc16').map((x) => [x.label, x.due, x.done]), [['Buy the insurance-backed guarantee', '2026-11-04', false]]);
  eq('done once its reference is saved', deadlinesFor(job({ paperwork: { mcs_registered_on: '2026-10-28', ibg_ref: 'HIES-1' } }), cal('2026-10-29')).find((x) => x.key === 'cc16')?.done, true);
}

/* ── Feeds ────────────────────────────────────────────────────────────────── */

const cls = (kind, body, meta = null) => classifyActivity({ kind, body, meta });
eq('a note', cls('note', 'Wants a 10 kWh battery'), { kind: 'note', milestone: false, hidden: false });
eq('a site visit', cls('visit', 'Looked at the loft'), { kind: 'visit', milestone: false, hidden: false });
eq('a survey finished is a milestone', cls('visit', 'Solar survey completed by Esther: 32 photos', { survey_id: 's1' }), { kind: 'survey', milestone: true, hidden: false });
eq('a survey started is not', cls('visit', 'Solar survey started'), { kind: 'survey', milestone: false, hidden: false });
eq('moved to Won', cls('stage', 'Quote sent → Won', { from: 'quote_sent', to: 'won' }), { kind: 'stage', milestone: true, hidden: false });
eq('moved to Contacted', cls('stage', 'Lead → Contacted', { from: 'lead', to: 'contacted' }), { kind: 'stage', milestone: false, hidden: false });
eq('signed online', cls('stage', '✍️ Quote “Q1.pdf” accepted and signed online by Jane'), { kind: 'doc', milestone: true, hidden: false });
eq('marked as signed in Docs', cls('system', 'Quote “Q1.pdf” marked as signed by Esther'), { kind: 'doc', milestone: true, hidden: false });
eq('a document', cls('system', 'Document added: Quote.pdf (in their portal)'), { kind: 'doc', milestone: false, hidden: false });
eq('an import', cls('system', 'Imported 120 WhatsApp messages (1 Jan – 3 Mar) from the WhatsApp Business app').hidden, true);
eq('an automatic WhatsApp', cls('system', 'WhatsApp: survey booking confirmation sent').hidden, true);
eq('a reminder not sent', cls('system', 'survey reminder (2 days) not sent: no permission').hidden, true);
eq('a task added', cls('system', 'Task added: Chase G99'), { kind: 'update', milestone: false, hidden: false });
const all = [...FEED_CHIPS];
eq('updates only with Show stage changes', [inFeed(cls('system', 'Task added: x'), all, false), inFeed(cls('system', 'Task added: x'), all, true)], [false, true]);
eq('milestones always (all kinds)', inFeed(cls('stage', 'x', { to: 'complete' }), all, false), true);
eq('but not under one chip', inFeed(cls('stage', 'x', { to: 'complete' }), ['call'], false), false);
eq('documents under Docs', inFeed(cls('system', 'Document added: x'), ['doc'], false), true);
eq('database kinds for Calls', dbKindsFor(['call'], false), ['call']);
eq('database kinds for everything', dbKindsFor(all, false).sort(), ['call', 'email', 'note', 'stage', 'system', 'visit']);
eq('database kinds with stage changes', dbKindsFor(all, true).sort(), ['call', 'email', 'note', 'photo', 'stage', 'system', 'visit']);

eq('database filter for everything', dbFilterFor(all, false), 'kind.in.(note,call,visit,email,stage),and(kind.eq.system,or(body.ilike.*document*,body.ilike.*signed*,body.ilike.*signing*))');
eq('database filter with stage changes', dbFilterFor(all, true), 'kind.in.(note,call,visit,email,stage,photo),kind.eq.system');
eq('database filter for Notes', dbFilterFor(['note'], true), 'kind.in.(note)');

// UK days on Fri 23 Oct (BST) and Mon 26 Oct (GMT).
eq('late Friday evening is still Friday', ukDay('2026-10-23T22:30:00Z'), '2026-10-23');
eq('23:30 UTC on Friday is Saturday in the UK', ukDay('2026-10-23T23:30:00Z'), '2026-10-24');
eq('23:30 UTC on Monday is still Monday (GMT)', ukDay('2026-10-26T23:30:00Z'), '2026-10-26');
eq('Friday starts at 23:00 UTC on Thursday', ukDayStart('2026-10-23'), '2026-10-22T23:00:00.000Z');
eq('Sunday 25 Oct starts in BST', ukDayStart('2026-10-25'), '2026-10-24T23:00:00.000Z');
eq('Monday starts at midnight UTC', ukDayStart('2026-10-26'), '2026-10-26T00:00:00.000Z');
eq('Sunday 29 Mar starts in GMT', ukDayStart('2026-03-29'), '2026-03-29T00:00:00.000Z');
eq('days on over the clock change', plusDays('2026-10-24', 2), '2026-10-26');
const fri = '2026-10-23';
eq(
  'groups on Friday',
  ['2026-10-22', fri, '2026-10-24', '2026-10-26', '2026-10-29', '2026-10-30', null].map((d) => dueGroup(d, fri)),
  ['overdue', 'today', 'tomorrow', 'week', 'week', 'later', 'nodate']
);
const mon = '2026-10-26';
eq('groups on Monday', ['2026-10-23', '2026-10-25', mon, '2026-10-27', '2026-11-01', '2026-11-02'].map((d) => dueGroup(d, mon)), [
  'overdue',
  'overdue',
  'today',
  'tomorrow',
  'week',
  'later',
]);
eq('a next step at 00:30 BST on Saturday is due Saturday', dueGroup(ukDay('2026-10-23T23:30:00Z'), fri), 'tomorrow');

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
