// Every item of the paperwork the electrician's records replaced, proved present in Heliaxis's own
// form (Unit 2, WORDING-SPEC): scripts/site-forms-coverage.json lists each item of the five source
// forms in our words (never the source's), with the record that covers it now (HX-PV-01 to 03,
// HX-BAT-01 and 02, the system summary HX-HO-02), how (asked, worked out, merged, printed, kept with
// its citation number dropped, kept as a fact, heading replaced, layout only, page furniture dropped)
// and what proves it: a field of the electrician's pack with that key (an option of it, its help or
// its ⓘ, a worked-out answer, its section heading or note), the office's summary details or a setting,
// a flag the rules raise, or words printed on the record as rendered for a careful solar + battery job,
// its footer ("HX-PV-02 · Issue 1 · Page x of y") on every page, the step's introduction, the record's
// statement and the summary's declarations. Then the in-house items of FORMS.md (photos, serials, the
// final sign-off and the flags), which no source form had.
// Usage: node --experimental-strip-types scripts/test-site-forms-coverage.mjs
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

const SRC = new URL('../src/', import.meta.url).href;
const mod = (code) => `data:text/javascript,${encodeURIComponent(code)}`;
const STUBS = {
  'server-only': 'export {}',
  '@/lib/crm/server': "export const DOCS_BUCKET = 'crm-docs'; export const CRM_BUCKET = 'crm-photos';",
};
registerHooks({
  resolve(specifier, context, next) {
    if (STUBS[specifier]) return { url: mod(STUBS[specifier]), shortCircuit: true };
    const spec = specifier.startsWith('@/') ? SRC + specifier.slice(2) : specifier;
    try {
      return next(spec, context);
    } catch (e) {
      if (!/^(?:\.\.?\/|file:)/.test(spec) || /\.\w+$/.test(spec)) throw e;
      try {
        return next(`${spec}.ts`, context);
      } catch {
        return next(`${spec}/index.ts`, context);
      }
    }
  },
});

const F = await import('../src/lib/site/forms/index.ts');
const R = await import('../src/lib/site/rules.ts');
const DECL = await import('../src/lib/site/declaration.ts');
const { designOf } = await import('../src/lib/site/design.ts');
const I = await import('../src/lib/handover/inputs.ts');
const H = await import('../src/lib/handover/settings-shared.ts');
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const X = await import('./site-electrician-fixtures.mjs');
const { summaryFacts } = await import('./site-summary-fixture.mjs');
const { ctxOf, formFor, fillAll, input } = X.makeFixtures({ R, F, designOf });
const D = {
  inspect: await import('../src/lib/documents/site/pv-inspect.ts'),
  tests: await import('../src/lib/documents/site/pv-tests.ts'),
  on: await import('../src/lib/documents/site/pv-switch-on.ts'),
  bat: await import('../src/lib/documents/site/battery.ts'),
  summary: await import('../src/lib/documents/handover/summary.ts'),
};

let failed = 0;
let proved = 0;
function prove(name, ok, why = '') {
  if (ok) proved++;
  else {
    failed++;
    console.log(`FAIL ${name}${why ? ` (${why})` : ''}`);
  }
}

/* ── What there is to prove against ─────────────────────────────────────────── */
const all = F.allForms();
const electrician = all.find((f) => f.id === 'electrician');
const roofer = all.find((f) => f.id === 'roofer');
const fields = new Map([...electrician.steps.flatMap((s) => s.fields), electrician.sig].map((f) => [f.key, f]));
const field = (k) => fields.get(k);
const flagCodes = new Set(electrician.flags.map((f) => f.code));
// Each field's section heading and its note: the group of the field that opens its section.
const sectionOf = new Map();
for (const s of electrician.steps) {
  let head = null;
  for (const f of s.fields) {
    if (f.group) head = { group: f.group, note: f.groupNote ?? null };
    sectionOf.set(f.key, { step: s.key, ...(head ?? {}) });
  }
}
const step = (key) => electrician.steps.find((s) => s.key === key);

// The records, from a careful solar + battery job, signed; the system summary from the handover's facts.
const sb = formFor(['solar', 'battery']);
const full = fillAll(sb, ['solar', 'battery']);
const c = ctxOf(['solar', 'battery'], full.values, full.photos);
const decl = sb.sig.declaration(c);
const norm = (s) => s.replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
const pages = {};
const signedInput = { ...input(c), declaration: decl };
for (const [code, make] of [
  ['HX-PV-01', D.inspect.makePvInspect],
  ['HX-PV-02', D.tests.makePvTests],
  ['HX-PV-03', D.on.makePvSwitchOn],
  ['HX-BAT-01', D.bat.makeBatteryInspection],
  ['HX-BAT-02', D.bat.makeBatteryTests],
])
  pages[code] = (await X.textOf(pdfjs, await make(signedInput))).map(norm);
const sum = I.summaryInput(summaryFacts({ H, designOf }));
prove('the system summary is ready from the fixture', sum.ok, sum.why);
pages['HX-HO-02'] = (await X.textOf(pdfjs, await D.summary.makeSummary(sum.input, async () => X.PNG))).map(norm);
// Case aside: the header boxes print their labels in capitals.
const printed = (code, text) => pages[code].join(' ').toLowerCase().includes(norm(text).toLowerCase());

/* ── The source forms, item by item ──────────────────────────────────────────── */
const COV = JSON.parse(readFileSync(new URL('./site-forms-coverage.json', import.meta.url), 'utf8'));
const HOW = ['asked', 'worked out', 'merged', 'printed', 'kept, citation number dropped', 'kept as a fact', 'heading replaced', 'layout only', "dropped (the source's page furniture)"];
prove('262 items: 39 string tests, 66 PV inspection, 95 battery, 24 battery tests (second print), 38 handover', JSON.stringify(COV.sections) === JSON.stringify({ 'PV-02': 39, 'PV-01': 66, 'BAT-01+02': 95, 'BAT-02b': 24, 'HO-02': 38 }) && COV.rows.length === 262);
prove('every item has its own id', new Set(COV.rows.map((r) => r.id)).size === COV.rows.length);
prove('every item is covered one of the known ways', COV.rows.every((r) => HOW.includes(r.how)), [...new Set(COV.rows.map((r) => r.how))].filter((h) => !HOW.includes(h)).join(', '));
prove('none dropped: every item has something that proves it', COV.rows.every((r) => r.proofs.length), COV.rows.filter((r) => !r.proofs.length).map((r) => r.id).join(', '));
prove('nothing named after the source (no other company, no form codes)', !/easy\s*mcs|\bF\d\d[A-Z]?\b|\bCC\d+\b/i.test(JSON.stringify(COV)));

const office = new Set(I.SUMMARY_FIELDS.map((f) => f.key));
const footerOn = (code) => pages[code].every((p, i) => p.includes(`${code} · Issue 1 · Page ${i + 1} of ${pages[code].length}`));
const DECLS = { design: DECL.SUMMARY_DECLARATIONS.design(DECL.summaryStandards(['solar', 'battery'])), install: DECL.SUMMARY_DECLARATIONS.install(DECL.summaryStandards(['solar', 'battery'])), note: DECL.SUMMARY_DECLARATIONS.note };
function check(p) {
  if (p.key && p.option) return [field(p.key)?.options?.some((o) => o.key === p.option && (!p.label || o.label === p.label)), `${p.key} = ${p.option}${p.label ? ` "${p.label}"` : ''}`];
  if (p.key) return [!!field(p.key), p.key];
  if (p.auto) return [typeof field(p.auto)?.auto === 'function', `${p.auto} works itself out`];
  if (p.hint) return [!!field(p.hint)?.hint, `${p.hint} has help`];
  if (p.info) return [!!field(p.info)?.info, `${p.info} has ⓘ`];
  if (p.groupNote) return [!!sectionOf.get(p.groupNote)?.note, `${p.groupNote}'s section note`];
  if (p.section) {
    const g = sectionOf.get(p.section)?.group;
    return [!!g && printed(p.on, g), `${p.section}'s section "${g}" on ${p.on}`];
  }
  if (p.flag) return [flagCodes.has(p.flag), `flag ${p.flag}`];
  if (p.office) return [office.has(p.office), `the office's ${p.office}`];
  if (p.setting) return [p.setting in H.DEFAULT_HANDOVER_SETTINGS, `setting ${p.setting}`];
  if (p.printed) return [printed(p.on, p.printed), `"${p.printed}" on ${p.on}`];
  if (p.footer) return [footerOn(p.footer), `${p.footer}'s footer on every page`];
  if (p.intro) return [!!step(p.intro)?.intro, `${p.intro}'s introduction`];
  if (p.statement) return [printed(p.statement, DECL.signedStatement(decl, p.statement) ?? '∅'), `${p.statement}'s statement, as signed`];
  if (p.perString) return [[...fields.values()].some((f) => f.key.startsWith(p.perString) && f.perString), 'a row per string'];
  if (p.declaration) return [printed('HX-HO-02', DECLS[p.declaration]), `declaration ${p.declaration} on HX-HO-02`];
  return [false, `unknown proof ${JSON.stringify(p)}`];
}
for (const r of COV.rows)
  for (const p of r.proofs) {
    const [ok, what] = check(p);
    prove(`${r.id} (${r.what}): ${what}`, !!ok);
  }
// What is asked is never offered for a measurement, and is on the record it belongs to.
prove('measured values are never offered', ['pvt_voc', 'pvt_isc', 'pvt_ir_pos', 'pvt_ir_neg', 'pvt_polarity', 'pvt_frame_earth', 'pvt_iso_ok', 'pvt_inv_ok'].every((k) => !field(k).same && !field(k).suggest));
prove('"Same as string 1" where the string tests offer it', ['pvt_cable', 'pvt_irr', 'pvt_ir_v', 'pvt_iso_a', 'pvt_iso_v', 'pvt_iso_where', 'pvt_inv'].every((k) => field(k).same));
prove('each asked key sits in the step of its record', COV.rows.filter((r) => r.how === 'asked' && /^HX-(PV|BAT)-0[12]$/.test(r.record)).every((r) => r.proofs.filter((p) => p.key && !p.option && !/^(pvc_|eess_backup)/.test(p.key)).every((p) => (sectionOf.get(p.key)?.step ?? '').startsWith({ 'HX-PV-01': 'pv-inspect', 'HX-PV-02': 'pv-tests', 'HX-BAT-01': 'battery', 'HX-BAT-02': 'battery' }[r.record]))));

/* ── FORMS.md's own items (no source form had them) ──────────────────────────── */
// 4.2 Photos: every slot, its instruction, its minimum and level.
const PHOTOS = {
  EP01: ['Before you touch anything', 1, 'must'],
  EP02: ['Cover off after your work', 1, 'must'],
  EP03: ['Cover back on, new circuit labelled', 1, 'must'],
  EP04: ['Main earthing terminal and earthing conductor', 1, 'must'],
  EP05: ['Gas and water bonding clamps', 1, 'should'],
  EP06: ['The meter, cut-out and the dual-supply label', 1, 'must'],
  EP07: ['Every run you installed', 3, 'must'],
  EP08: ['Each label close enough to read', 2, 'must'],
  EP09: ['The SPD and its status window', 1, 'should'],
  EP10: ['Wide shots of everything you installed', 2, 'must'],
  EP11: ['Readings on the tester screen', 0, 'optional'],
  EP20: ['Wide shot showing the mounting', 1, 'must'],
  EP21: ['Straight on, serial readable', 1, 'must'],
  EP22: ['Each DC isolator with its label', 1, 'must'],
  EP23: ['The AC isolator by the inverter', 1, 'must'],
  EP24: ['Where the DC cables come into the building', 2, 'must'],
  EP25: ['The earth connection on the array frame', 1, 'must'],
  EP26: ['Meter with the reading and serial readable', 1, 'must'],
  EP27: ['Inverter screen or app showing it running', 1, 'must'],
  EP28: ['the CT clamp on the meter tails', 1, 'should'],
  EP30: ['Wide shot: clearances, ventilation', 1, 'must'],
  EP31: ['Each battery module’s label', 1, 'must'],
  EP32: ['Straight on, serial readable', 1, 'must'],
  EP33: ['The battery isolator or DC breaker', 1, 'must'],
  EP34: ['‘Battery in installation’ and ‘multiple supplies’ notices', 1, 'must'],
  EP35: ['The detector near the battery', 1, 'should'],
  EP36: ['The back-up (EPS) circuit and changeover switch', 1, 'must'],
  EP37: ['The earth rod and its test reading', 1, 'must'],
  EP38: ['App or screen showing the battery charging', 1, 'must'],
  EP40: ['Wide shot showing the parking space', 1, 'must'],
  EP41: ['Serial readable', 1, 'must'],
  EP42: ['From the consumer unit to the charger', 2, 'must'],
  EP43: ['RCBO/RCD with its type marking readable', 1, 'must'],
  EP44: ['The charger’s earthing arrangement', 1, 'must'],
  EP45: ['Labels at the consumer unit and the charger', 1, 'must'],
  EP46: ['Charger online in its app', 1, 'should'],
  EP47: ['the CT clamp and its lead', 1, 'should'],
  EP50: ['Rotary isolator next to the outdoor unit', 1, 'must'],
  EP51: ['Supply cable route and where it’s glanded', 1, 'must'],
  EP52: ['The dedicated circuit at the consumer unit', 1, 'must'],
  EP53: ['Serial readable', 1, 'must'],
  EP54: ['Serial readable', 1, 'should'],
  EP55: ['Earth and any bonding at the unit', 1, 'should'],
};
for (const [k, [words, n, level]] of Object.entries(PHOTOS)) {
  const f = field(k);
  prove(`FORMS photo ${k}`, !!f && f.type === 'PHOTOS' && (f.hint ?? '').includes(words) && (f.need ?? 1) === n && f.level === level, f ? `${f.hint} · ${f.need} · ${f.level}` : 'no field');
}
prove('FORMS 4.2: EP26 has its reading box EP26r (must)', field('EP26r')?.type === 'NUM' && field('EP26r').level === 'must');
prove('REGS 3.4: the four OZEV grant photos', ['EPG1', 'EPG2', 'EPG3', 'EPG4'].every((k) => field(k)?.type === 'PHOTOS'));

// 4.3 Serials: each capture, with the label photo it's read from.
const SERIALS = { SN_OPT: null, SN_INV: 'EP21', SN_BAT: 'EP31', SN_BINV: 'EP32', SN_EV: 'EP41', SN_HP: 'EP53', SN_HP2: 'EP54', SN_GENMETER: 'EP26' };
for (const [k, photo] of Object.entries(SERIALS)) prove(`FORMS serial ${k}`, field(k)?.type === 'SCAN' && (!photo || field(k).photo === photo));
// The owner (21 Oct): "We don't need them to scan panel serial numbers": the roofer has no SCAN.
prove('no panel serial scanning for the roofer (owner, 21 Oct)', !roofer.steps.some((s) => s.fields.some((f) => f.type === 'SCAN')));
prove('FORMS serial SN_METER: shown for confirmation, a photo if it changed', field('SN_METER')?.type === 'YN' && field('SN_METERp')?.type === 'PHOTOS');

// 4.4 The final sign-off: the owner's declaration (21 Oct, OWNER-DECISIONS 5), then each record's statement.
prove('FORMS EF0: everything provided (the list)', field('EF0')?.panel === 'missing');
prove('FORMS EF1 and EF3: confirmations', ['EF1', 'EF3'].every((k) => field(k)?.type === 'CONFIRM'));
prove('FORMS EF2: Yes / Not possible, and why', JSON.stringify(field('EF2').options.map((o) => o.label)) === JSON.stringify(['Yes', 'Not possible']) && field('EF2n')?.level === 'must');
prove(
  'FORMS EF_SIG: the owner’s declaration, word for word',
  decl.startsWith(
    [
      'I confirm that:',
      '• the electrical work at 12 High Street, Maindee, Newport, NP20 4AB is complete and was carried out to the design, the manufacturer’s instructions and the standards required by my Subcontractor Agreement with Heliaxis Limited;',
      '• the answers, photos and readings I have given are true and accurate; and',
      '• I have told Heliaxis about any defect, damage or problem I found or caused.',
      'I understand Heliaxis will rely on this declaration to raise my purchase order and complete the customer’s certification and handover, and will review my photos and results. If anything needs putting right, I will return to site to fix it under my Subcontractor Agreement.',
    ].join('\n')
  )
);
prove('…then each record it makes, with its statement (WORDING-SPEC 0.7)', decl.includes(DECL.RECORDS_HEAD) && DECL.recordsFor(['pvinspect', 'pvtests', 'pvswitchon', 'battery', 'summary'], ['solar', 'battery']).every((code) => !!DECL.signedStatement(decl, code)));

// 5.3 The electrician's flags, by Heliaxis's own codes.
const FLAGS = {
  'string polarity Fail (Stop until explained)': 'PVT_POL',
  'insulation below the minimum': 'PVT_IR',
  'Voc off what’s expected': 'PVT_VOC',
  'identical strings apart': 'PVT_EVEN',
  'DC isolator Fail': 'PVT_ISO',
  'inverter Fail': 'PVT_INV',
  'strings not the roofer’s': 'PVT_STR',
  'a PV inspection ✗': 'PVI_ENTRY',
  'N/A on a row that doesn’t allow it': 'PVI_ROUTES_NA',
  'DC rating below the highest string Voc × 1.25': 'PVI_DC_RATING',
  'a switch-on ✗': 'PVC_GENERATING',
  'a battery inspection ✗': 'BAT_CONDITIONS',
  'BS 7671 tests not done': 'BAT_TESTS',
  'no certificate reference for them': 'BAT_TESTS_REF',
  'a battery test Fail': 'BAT_FAIL_TEMP',
  'battery not online': 'BAT_ONLINE',
  'back-up answers that don’t agree': 'BAT_BACKUP',
  'summary details for the office': 'HOS_OFFICE',
  'panel power not the design’s': 'HOS_KWP',
  'Serials duplicate': 'SN_DUP',
  'Serials count': 'SN_OPT_COUNT',
  'Serials model (Urgent for inverter and battery)': 'SN_INV_MODEL',
  'Serials not read': 'SN_BAT_UNREAD',
  'EV demand over the fuse': 'EV_FUSE',
  'Finish EF2 not possible': 'EF2',
};
for (const [what, code] of Object.entries(FLAGS)) prove(`FORMS 5.3 ${what}`, flagCodes.has(code), code);
prove('FORMS 5.3 photos below the minimum, EF1/EF3, EP26r, EV EP43/EP44: the gate (musts)', ['EF1', 'EF3', 'EP26r', 'EP43', 'EP44', 'EP07'].every((k) => field(k).level === 'must'));
prove('no flag is named after a form number', [...flagCodes].filter((c) => !c.startsWith('EIC_')).every((c) => !/^F\d|^EESS|_\d+(_NA)?$/.test(c)));

console.log(`${proved} items proved present${failed ? `, ${failed} missing` : ''}`);
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
