// The site app's messages: the new ready-made WhatsApp templates pass Meta's rules
// (src/lib/whatsapp/templates-shared.ts checkTemplate), never appear in a customer's chat, and the
// words and timing in src/lib/site/messages.ts (the evening rule, D19).
// Usage: node --experimental-strip-types scripts/test-site-templates.mjs
import { registerHooks } from 'node:module';

// messages.ts imports its neighbours without ".ts", as the bundler expects.
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (e) {
      if (/^(?:\.\.?\/|file:)/.test(specifier) && !/\.\w+$/.test(specifier)) return next(`${specifier}.ts`, context);
      throw e;
    }
  },
});
const T = await import('../src/lib/whatsapp/templates-shared.ts');
const M = await import('../src/lib/site/messages.ts');

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

/* ── The new templates pass Meta's rules ───────────────────────────────────── */

const NEW = ['site_job_pack', 'site_po_raised', 'site_strike_photos', 'site_clear_to_start', 'site_scaffold_hold', 'site_return_to_site', 'site_green_light', 'handover_pack_ready'];
for (const name of NEW) {
  const t = T.readyMade(name);
  eq(`${name} is a ready-made template`, !!t, true);
  if (!t) continue;
  const draft = { name: t.name, category: t.category, body: t.body, examples: t.examples ?? t.fields.map((f) => T.FIELDS[f].example), buttons: t.buttons };
  eq(`${name}: checkTemplate finds nothing`, T.checkTemplate(draft), []);
  eq(`${name}: one field per blank`, t.fields.length, T.blanksIn(t.body).length);
  eq(`${name}: Utility`, t.category, 'UTILITY');
  eq(`${name}: no quick replies until trade replies stay out of the leads (D20)`, t.buttons, []);
}
eq('the new fields are filled by the app, not typed into others', ['work_words', 'site_short', 'job_link', 'po_number', 'portal_link', 'fix_what', 'fix_by'].map((k) => [!!T.FIELDS[k]?.auto, T.INSERTABLE.includes(k)]), [
  [true, false],
  [true, false],
  [true, false],
  [true, false],
  [true, false],
  [true, false],
  [true, false],
]);
eq('the job pack keeps the owner’s ask, reworded', T.readyMade('site_job_pack').body.startsWith('Hi {{1}}, Heliaxis has booked you for the {{2}} at {{3}}.'), true);

/* ── Never in a customer's chat ────────────────────────────────────────────── */

const items = [
  { name: 'quote_ready', status: 'APPROVED', sendable: true },
  { name: 'site_job_pack', status: 'APPROVED', sendable: true },
  { name: 'site_po_raised', status: 'APPROVED', sendable: true },
  { name: 'handover_pack_ready', status: 'APPROVED', sendable: true },
  { name: 'review_request', status: 'PENDING', sendable: true },
];
eq('no site_* template in the customer picker', T.customerSendable(items).map((t) => t.name), ['quote_ready', 'handover_pack_ready']);
eq('isSiteTemplate', [T.isSiteTemplate('site_job_pack'), T.isSiteTemplate('quote_ready')], [true, false]);

/* ── The words ─────────────────────────────────────────────────────────────── */

const about = { firstName: 'Dave', trade: 'roofer', startsOn: '2026-11-03', site: '12 High Street, NP20 4AB', jobRef: 'HX-0042', link: 'https://subcontractor.heliaxis.co.uk/portal/site/j/abc' };
eq('job pack blanks', M.jobPackParams(about), ['Dave', 'roofing work on Tuesday 3 November', '12 High Street, NP20 4AB', 'https://subcontractor.heliaxis.co.uk/portal/site/j/abc']);
eq('job pack email subject', M.jobPackEmail(about).subject, 'Job pack: roofing at 12 High Street, NP20 4AB (HX-0042)');
eq('the email says install the app first', M.jobPackEmail(about).paragraphs.some((p) => p.startsWith('Install the app, then open your job pack before you set off')), true);
eq('the email has the office number', M.jobPackEmail(about).paragraphs.some((p) => p.includes('01633 965205')), true);
eq('WhatsApp from my phone: the template’s words', M.jobPackText(about), T.fillPreview(T.readyMade('site_job_pack').body, M.jobPackParams(about)));
eq('click to chat', M.clickToChat('447700900123', 'Hi Dave'), 'https://wa.me/447700900123?text=Hi%20Dave');
eq('PO blanks', M.poParams(about, 'PO-0123'), ['Dave', 'roofing work', '12 High Street, NP20 4AB', 'PO-0123']);
eq('clear to start: the template’s words', M.clearToStartText(about), T.fillPreview(T.readyMade('site_clear_to_start').body, M.clearToStartParams(about)));
eq('hold: the template’s words', M.scaffoldHoldText(about), T.fillPreview(T.readyMade('site_scaffold_hold').body, M.scaffoldHoldParams(about)));
eq('short site from an address', M.siteShort('12 High Street\nMaindee\nNewport', 'np20 4ab'), '12 High Street, NP20 4AB');
eq('short site with the postcode already in it', M.siteShort('12 High Street, NP20 4AB', 'NP20 4AB'), '12 High Street, NP20 4AB');
eq('work words without a date', M.workWords('scaffolder', null), 'scaffolding');

/* ── The evening rule (D19) ────────────────────────────────────────────────── */

// Today's WhatsApp settings: quiet 21:00 → 08:45. After wf-send-later: the late-night rule 20:30 → 07:00.
const quiet = { quietFromMin: 21 * 60, quietToMin: 8 * 60 + 45 };
const late = { ...quiet, lateRule: true, lateFromMin: 20 * 60 + 30, lateSendAtMin: 7 * 60 };
const at = (iso) => new Date(iso);
// Wednesday 21 October 2026 is BST (UTC+1): 22:10 UK = 21:10 UTC.
eq('22:10 today: held to 08:45 under quiet hours', M.sendAfter(at('2026-10-21T21:10:00Z'), quiet).toISOString(), '2026-10-22T07:45:00.000Z');
eq('22:10 with the late-night rule: held to 07:00', M.sendAfter(at('2026-10-21T21:10:00Z'), late).toISOString(), '2026-10-22T06:00:00.000Z');
eq('20:45 with the late-night rule: held to 07:00', M.sendAfter(at('2026-10-21T19:45:00Z'), late).toISOString(), '2026-10-22T06:00:00.000Z');
eq('20:29 with the late-night rule: goes now', M.sendAfter(at('2026-10-21T19:29:00Z'), late).toISOString(), '2026-10-21T19:29:00.000Z');
eq('02:00: waits for 07:00 that morning', M.sendAfter(at('2026-10-22T01:00:00Z'), late).toISOString(), '2026-10-22T06:00:00.000Z');
eq('the late-night rule turned off: goes now', M.sendAfter(at('2026-10-21T21:10:00Z'), { ...late, lateRule: false }).toISOString(), '2026-10-21T21:10:00.000Z');
eq('midday: goes now', M.sendAfter(at('2026-10-21T11:00:00Z'), late).toISOString(), '2026-10-21T11:00:00.000Z');
// After the clocks go back (Sunday 25 October), 07:00 UK is 07:00 UTC.
eq('22:10 on Monday 26 October: 07:00 GMT', M.sendAfter(at('2026-10-26T22:10:00Z'), late).toISOString(), '2026-10-27T07:00:00.000Z');
eq('"Waiting to send at 07:00"', M.sendTimeWords('2026-10-22T06:00:00.000Z'), '07:00');

/* ── The office's review (owner, 21 Oct) ──────────────────────────────────── */

eq('the PO WhatsApp says the work will be reviewed', T.readyMade('site_po_raised').body.includes('We’ll review your photos and results and let you know: green light, or return to site if anything needs putting right.'), true);
const ret = { ...about, trade: 'roofer', what: 'Two tiles left lifted.\nDress them back flat.', fixBy: '2026-11-12', safety: false, poNumber: 'PO-0123' };
eq('return to site blanks: what on one line, the day in words', M.returnParams(ret), ['Dave', 'roofing work', '12 High Street, NP20 4AB', 'Two tiles left lifted. Dress them back flat', 'Thursday 12 November', 'https://subcontractor.heliaxis.co.uk/portal/site/j/abc']);
eq('…a long one is cut short with "…"', M.whatLine('x'.repeat(400)).length, 300);
eq('the notice’s subject', M.returnEmail(ret).subject, 'Return to site required: roofing at 12 High Street, NP20 4AB (HX-0042)');
eq('the notice says own cost, the hold and that it is the written notice', [
  M.returnEmail(ret).paragraphs.includes('Please return to site and put it right by Thursday 12 November, at your own cost (clause 12.3).'),
  M.returnEmail(ret).paragraphs.includes('We may hold payment on purchase order PO-0123 until it’s put right (clauses 4.7 and 12.4).'),
  M.returnEmail(ret).paragraphs.includes('This email is our written notice under clause 12.3 of your Subcontractor Agreement with Heliaxis Limited.'),
], [true, true, true]);
eq('…safety in its words', M.returnEmail({ ...ret, safety: true }).paragraphs[3], 'This affects safety or the home, so please return to site and put it right by Thursday 12 November, at your own cost (clause 12.3).');
eq('…no PO, no hold line', M.returnEmail({ ...ret, poNumber: null }).paragraphs.some((p) => p.includes('hold payment')), false);
eq('green light blanks', M.greenParams(about), ['Dave', 'roofing work', '12 High Street, NP20 4AB']);
eq('the green light email, short', [M.greenEmail({ ...about, putRight: false }).subject, M.greenEmail({ ...about, putRight: true }).paragraphs[1]], [
  'Green light: roofing at 12 High Street, NP20 4AB (HX-0042)',
  'Good news: we’ve reviewed the photos of your put right for the roofing work at 12 High Street, NP20 4AB and given it the green light. Nothing needs putting right.',
]);
eq('the WhatsApp templates’ kinds', [M.KIND_TEMPLATE.return_to_site, M.KIND_TEMPLATE.green_light], ['site_return_to_site', 'site_green_light']);
eq('POs and return-to-site notices go at any hour; the rest wait for the morning', [...M.ANY_TIME], ['po', 'return_to_site']);

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
