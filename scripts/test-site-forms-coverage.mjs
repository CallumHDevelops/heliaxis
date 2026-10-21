// Every item of the electrician's paperwork, listed and proved present (Unit 2): each key in FORMS.md
// (1.1–1.5 the forms, 4.2 photos, 4.3 serials, 4.4 the final sign-off, 5.3 the flags) and each line
// of the owner's Word forms (F43, F44, F74, F75, F78). An item is present when it is a field of the
// electrician's pack with that key (or an option of one), a merge field or fixed wording printed on
// the generated PDF, a flag the rules raise, or, for F78 (printed by Unit 4) and the EIC (Unit 3),
// the source the pack provides for it. The Word forms' typos are printed corrected (FORMS 0.7).
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
const { designOf, DESIGN_KEYS } = await import('../src/lib/site/design.ts');
const CERT = await import('../src/lib/site/forms/electrician/cert.ts');
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const X = await import('./site-electrician-fixtures.mjs');
const { ctxOf, formFor, fillAll, input } = X.makeFixtures({ R, F, designOf });
const D = {
  f43: await import('../src/lib/documents/site/f43.ts'),
  f44: await import('../src/lib/documents/site/f44.ts'),
  f74: await import('../src/lib/documents/site/f74.ts'),
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
const flagCodes = new Set(electrician.flags.map((f) => f.code));
const field = (k) => fields.get(k);

// The PDFs, from a careful solar + battery job.
const sb = formFor(['solar', 'battery']);
const full = fillAll(sb, ['solar', 'battery']);
const c = ctxOf(['solar', 'battery'], full.values, full.photos);
const norm = (s) => s.replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
const pdf = {};
for (const [k, make] of [
  ['F43', D.f43.makeF43],
  ['F44', D.f44.makeF44],
  ['F44A', D.f44.makeF44A],
  ['F74', D.f74.makeF74],
  ['F75', D.f74.makeF75],
])
  pdf[k] = norm(X.flat(await X.textOf(pdfjs, await make(input(c)))));
// Case aside: the header box prints its labels in capitals, and our headings use sentence case.
const printed = (doc, text) => pdf[doc].toLowerCase().includes(norm(text).toLowerCase());
const MERGE = ['HX-0042', '12 High Street, Maindee, Newport, NP20 4AB', 'Sam Sparks', '3 November 2026'];

/* ── FORMS.md, key by key ────────────────────────────────────────────────────── */
const isField = (k, type) => !!field(k) && (!type || field(k).type === type || (type === 'PER' && field(k).perString));
const keys = (list, type) => list.forEach((k) => prove(`FORMS key ${k}`, isField(k, type), field(k) ? `type ${field(k).type}` : 'no field'));
const merged = (doc, list) => list.forEach((k) => prove(`FORMS merge ${k} on ${doc}`, MERGE.every((m) => printed(doc, m))));
const signed = (doc, k) => prove(`FORMS ${k}: the electrician's signature on ${doc}`, printed(doc, 'Signed on the Heliaxis app'));

// 1.1 F43
keys(['f43_kind'], 'SEL');
prove('f43_kind: Initial / Periodic verification', JSON.stringify(field('f43_kind').options.map((o) => o.label)) === JSON.stringify(['Initial verification', 'Periodic verification']));
merged('F43', ['f43_ref', 'f43_date', 'f43_addr', 'f43_inspector']);
keys(['f43_desc', 'f43_instruments'], 'TEXT');
keys(
  ['f43_module', 'f43_qty', 'f43_spec_voc', 'f43_spec_isc', 'f43_ocpd_type', 'f43_ocpd_a', 'f43_ocpd_v', 'f43_ocpd_ka', 'f43_wire_type', 'f43_wire_phase', 'f43_wire_earth', 'f43_test_voc', 'f43_test_isc', 'f43_irr', 'f43_polarity', 'f43_ir_v', 'f43_ir_pos', 'f43_ir_neg', 'f43_earth_cont', 'f43_iso_a', 'f43_iso_v', 'f43_iso_loc', 'f43_iso_func', 'f43_inv_model', 'f43_inv_serial', 'f43_inv_func'],
  'PER'
);
keys(['f43_comments'], 'LONG');
signed('F43', 'f43_sig');
prove('F43 Rec.: the calibration date', isField('f43_cal'));
prove('F43: "Same as string 1" where FORMS says', ['f43_wire_type', 'f43_irr', 'f43_ir_v', 'f43_iso_a', 'f43_iso_v', 'f43_iso_loc', 'f43_inv_model'].every((k) => field(k).same));
prove('F43: never for a measurement', ['f43_test_voc', 'f43_test_isc', 'f43_ir_pos', 'f43_ir_neg', 'f43_polarity', 'f43_earth_cont', 'f43_iso_func', 'f43_inv_func'].every((k) => !field(k).same && !field(k).suggest));

// 1.2 F44
merged('F44', ['f44_ref', 'f44_addr', 'f44_by', 'f44_date']);
keys(Array.from({ length: 38 }, (_, i) => `f44_${String(i + 1).padStart(2, '0')}`), 'TICK');
keys(['f44_20_kind'], 'SEL');
for (const x of ['a', 'b', 'c', 'd']) prove(`FORMS key f44_t2${x}: an option of Table 2`, field('f44_t2').options.some((o) => o.key === x));
keys(['f44_comments'], 'LONG');
signed('F44', 'f44_sig');
prove('F44 items 36–38 tick themselves (and can be un-ticked)', ['f44_36', 'f44_37', 'f44_38'].every((k) => typeof field(k).auto === 'function'));

// 1.3 F74
merged('F74', ['f74_ref', 'f74_addr', 'f74_by', 'f74_date']);
keys(['eess_backup'], 'YN');
keys(Array.from({ length: 31 }, (_, i) => `f74_1_${String(i + 1).padStart(2, '0')}`), 'TICK');
keys(['f74_1_notes', 'f74_2_notes', 'f74_4_notes'], 'LONG');
keys(['f74_2_tests'], 'YNN');
keys(['f74_2_refs', 'f74_mfr_ref'], 'TEXT');
prove('F74 Rec.: a photo of the maker’s commissioning report', isField('f74_mfr_p', 'PHOTOS'));
signed('F74', 'f74 signature (Rec.)');

// 1.4 F75 (and F74 Parts 3–4): answered once
keys([...Array.from({ length: 9 }, (_, i) => `eess_t_0${i + 1}`), ...Array.from({ length: 6 }, (_, i) => `eess_a_0${i + 1}`)], 'PFN');
keys(['eess_a_06_ra'], 'NUM');
merged('F75', ['f75_ref', 'f75_addr', 'f75_by', 'f75_date', 'f75_sig_date']);
signed('F75', 'f75_sig');

// 1.5 F78 (Unit 4 prints it): where each field comes from.
const src = (rel) => readFileSync(new URL(`../src/${rel}`, import.meta.url), 'utf8');
const F78 = {
  f78_kind: isField('f78_kind', 'SEL') && typeof field('f78_kind').auto === 'function',
  f78_addr: true, // the job's address (merge, Unit 4)
  f78_client: true, // the customer's name (merge, Unit 4)
  f78_test_date: true, // the commissioning date: crm_projects.commissioned_at from the sign-off
  f78_e_desc: isField('SN_BAT') && DESIGN_KEYS.length > 0,
  f78_e_class: DESIGN_KEYS.includes('eess_class'),
  f78_e_island: isField('eess_backup'),
  f78_e_kw: isField('f78_e_kw') && DESIGN_KEYS.includes('battery_kw'),
  f78_e_kwh: src('lib/site/electrician.ts').includes('battery_kwh: num(sys.battery_kwh)'),
  f78_e_p1: Array.from({ length: 31 }, (_, i) => `f74_1_${String(i + 1).padStart(2, '0')}`).every((k) => isField(k)),
  f78_e_p2: isField('f74_2_tests') && isField('f74_2_refs'),
  f78_e_p3: isField('eess_t_01') && isField('eess_t_09'),
  f78_e_p4: isField('eess_a_01') && isField('eess_a_06'),
  f78_p_desc: isField('SN_INV') && roofer.steps.some((s) => s.fields.some((f) => f.key === 'RF13')),
  f78_p_kw: flagCodes.has('F78_KWP'),
  f78_p_loc: DESIGN_KEYS.includes('roof_faces'),
  f78_p_est: DESIGN_KEYS.includes('est_kwh_year'),
  f78_p_circuits: isField('f78_p_circuits', 'TEXT'),
  f78_p_iec_insp: typeof CERT.certRef === 'function',
  f78_p_iec_test: typeof CERT.certRef === 'function',
  f78_p_f44a: printed('F44A', 'Solar PV Commissioning Checklist'),
  f78_p_f43: printed('F43', 'PV Array Test Report'),
  f78_sig: field('EF_SIG')?.type === 'SIG',
  f78_next: true, // the EIC's next inspection (Unit 3), else the owner's default in settings (Unit 4)
  f78_comments: true, // the office's (Unit 4)
};
for (const [k, ok] of Object.entries(F78)) prove(`FORMS F78 ${k}: its source`, ok);
prove('F78: empty office fields are flagged for the office, never guessed', flagCodes.has('F78_OFFICE'));

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
prove('REGS 3.4: the four OZEV grant photos', ['EPG1', 'EPG2', 'EPG3', 'EPG4'].every((k) => isField(k, 'PHOTOS')));

// 4.3 Serials: each capture, with the label photo it's read from.
const SERIALS = { SN_OPT: null, SN_INV: 'EP21', SN_BAT: 'EP31', SN_BINV: 'EP32', SN_EV: 'EP41', SN_HP: 'EP53', SN_HP2: 'EP54', SN_GENMETER: 'EP26' };
for (const [k, photo] of Object.entries(SERIALS)) prove(`FORMS serial ${k}`, isField(k, 'SCAN') && (!photo || field(k).photo === photo));
// The owner (21 Oct): "We don't need them to scan panel serial numbers": the roofer has no SCAN.
prove('no panel serial scanning for the roofer (owner, 21 Oct)', !roofer.steps.some((s) => s.fields.some((f) => f.type === 'SCAN')));
prove('FORMS serial SN_METER: shown for confirmation, a photo if it changed', isField('SN_METER', 'YN') && isField('SN_METERp', 'PHOTOS'));

// 4.4 The final sign-off.
prove('FORMS EF0: everything provided (the list)', field('EF0')?.panel === 'missing');
keys(['EF1', 'EF3'], 'CONFIRM');
prove('FORMS EF2: Yes / Not possible, and why', JSON.stringify(field('EF2').options.map((o) => o.label)) === JSON.stringify(['Yes', 'Not possible']) && field('EF2n')?.level === 'must');
// The owner's declaration (21 Oct, OWNER-DECISIONS 5), with the electrical work's words.
prove(
  'FORMS EF_SIG: the owner’s declaration',
  field('EF_SIG').declaration(c) ===
    [
      'I confirm that:',
      '• the electrical work at 12 High Street, Maindee, Newport, NP20 4AB is complete and was carried out to the design, the manufacturer’s instructions and the standards required by my Subcontractor Agreement with Heliaxis Limited;',
      '• the answers, photos and readings I have given are true and accurate; and',
      '• I have told Heliaxis about any defect, damage or problem I found or caused.',
      'I understand Heliaxis will rely on this declaration to raise my purchase order and complete the customer’s certification and handover, and will review my photos and results. If anything needs putting right, I will return to site to fix it under my Subcontractor Agreement.',
    ].join('\n')
);

// 5.3 The electrician's flags.
const FLAGS = {
  'F43 polarity Fail (Stop until explained)': 'F43_POL',
  'F43 insulation below the minimum': 'F43_IR',
  'F43 Voc off expected': 'F43_VOC',
  'F43 identical strings apart': 'F43_EVEN',
  'F43 isolator Fail': 'F43_ISO',
  'F43 inverter Fail': 'F43_INV',
  'F43 strings ≠ roofer': 'F43_STR',
  'F44 ✗': 'F44_14',
  'F44 N/A on a row that isn’t N/A ok': 'F44_1_NA',
  'F44 item 24 rating': 'F44_24',
  'F44 Table 2 rules': 'F44_T2',
  'F74 Part 1 ✗': 'F74_1',
  'F74 Part 2 not carried out': 'F74_2_TESTS',
  'F74 Part 2 no reference': 'F74_2_REFS',
  'F74/F75 Part 3/4 Fail': 'EESS_t_01',
  'F74/F75 internet not Pass': 'EESS_NET',
  'F74/F75 back-up answers': 'EESS_BACKUP',
  'F78 office fields empty': 'F78_OFFICE',
  'F78 rated power': 'F78_KWP',
  'Serials duplicate': 'SN_DUP',
  'Serials count': 'SN_OPT_COUNT',
  'Serials model (Urgent for inverter and battery)': 'SN_INV_MODEL',
  'Serials not read': 'SN_BAT_UNREAD',
  'EV demand over the fuse': 'EV_FUSE',
  'Finish EF2 not possible': 'EF2',
};
for (const [what, code] of Object.entries(FLAGS)) prove(`FORMS 5.3 ${what}`, flagCodes.has(code), code);
prove('FORMS 5.3 photos below the minimum, EF1/EF3, EP26r, EV EP43/EP44: the gate (musts)', ['EF1', 'EF3', 'EP26r', 'EP43', 'EP44', 'EP07'].every((k) => field(k).level === 'must'));

/* ── The Word forms, line by line, on our PDFs ───────────────────────────────── */
// The source's typos, printed corrected (FORMS 0.7).
const SIC = {
  'place out of reach': 'placed out of reach',
  'DC switch disconnect or fitted': 'DC switch disconnector fitted',
  'electronically conducting': 'electrically conducting',
  'The following mounting structure do not': 'The following mounting structures do not',
  'Array mounting structure that are comprised': 'Array mounting structures that are comprised',
  'Conductors suitable selected': 'Conductors suitably selected',
  'any eternal influences': 'any external influences',
  'prove the correction function': 'prove the correct function',
  'in the correct manger': 'in the correct manner',
  'systems providing back up functionality': 'systems providing back-up functionality',
  'mm2': 'mm²',
};
const fix = (s) => Object.entries(SIC).reduce((t, [a, b]) => t.split(a).join(b), s);
const DOCX = {
  F43: [
    'PV Array Test Report',
    'PV System Verification Certificate',
    'Initial verification',
    'Reference',
    'Date',
    'Installation Address',
    'Description of work under test',
    'Test Instruments',
    'Inspector',
    'String Reference',
    ...['Array', 'Module', 'Quantity', 'Array Parameters (as specified)', 'Voc (STC)', 'Isc (STC)'],
    ...['String over-current protective device', 'Type', 'Rating (A)', 'DC Rating (V)', 'Capacity (kA)'],
    ...['String Wiring', 'Phase CSA (mm2)', 'Earth CSA (mm2)', 'String Test', 'Irradiance', 'Polarity Check'],
    ...['Array Insulation resistance', 'Test Voltage (V)', 'Pos - Earth (MΩ)', 'Neg - Earth (MΩ)', 'Earth Continuity (where fitted)'],
    ...['Array Isolator', 'Rating (V)', 'Location', 'Functional Check', 'Inverter', 'Make and model', 'Serial number', 'Functional check', 'Comments'],
  ],
  F44: [
    'Solar PV Installation Checklist',
    'Heliaxis Ltd',
    '9 Turner Street',
    'Newport',
    'Gwent',
    'NP19 7AZ',
    '01633 965205',
    'hello@heliaxis.co.uk',
    'Project reference',
    'Installation Address',
    'Inspection by',
    'Equipment compliant with standards, correctly selected and not damaged:',
    'Equipment accessible for operation, inspection and maintenance:',
    'Equipment and accessories correctly connected:',
    'Particular protective measures for special location:',
    'Equipment and protective measures appropriate to external influences:',
    'System installed to prevent mutual detrimental influence:',
    'Conductors connected and identified:',
    'Conductors selected for current carrying capacity and voltage drop:',
    'Conductors routed in a safe zone or protected against mechanical damage:',
    'Presence of fire barriers, seals and protection against thermal effects:',
    'Ventilation provided behind array to prevent overheating /fire risk:',
    'Array frame and material corrosion proof:',
    'Array frame correctly fixed and stable; roof fittings weatherproof:',
    'Cable entry weatherproof:',
    'Live parts insulated, protected by barrier / enclosure, place out of reach or Class II:',
    'Array frame equipotential bonding present (Only relevant if required - see table 2):',
    'Surge protection devices present (only relevant if required):',
    'RCD provided (only relevant if required):',
    'Frame correctly integrated with existing LPS installation:',
    'Installation of the modules has not affected the fire performance of the roof: (select appropriate)',
    'Pitched Roof',
    'In-roof',
    'Physical separation of AC and DC cables:',
    'DC switch disconnect or fitted (to IEC60364-712.536.2.2):',
    'DC cables – protective and reinforced insulation (only relevant if required):',
    'All DC components rated for operation at max DC system voltage (Voc stc x 1.25):',
    'PV strings fused or blocking diodes fitted (only relevant if required):',
    'AC Isolator lockable in off position only:',
    'Generation Meter readable without torch or ladder and sealed:',
    'Inverter protection settings to local regulations:',
    'General labelling of circuits, protective devices switches and terminals (to IEC60364-6-61):',
    'PV system schematic displayed on site:',
    'Protection settings and installer details displayed on site:',
    'Emergency shutdown procedure displayed on site:',
    'AC Isolator clearly labeled:',
    'DC isolator / junction boxes suitably labeled:',
    'Signs and labels suitably affixed and durable:',
    'DNO information collected:',
    'PV Array Report completed:',
    'Notification to Building Control/ electrical certificates completed:',
    'Table 2: Array Frame Earthing',
    'a) Is the array frame an extraneous-conductive-part as defined in BS 7671?',
    'Array frame equipotential bonding',
    'Connect to protective earthing system as main protective bonding',
    '(Section 544 of BS 7671)',
    'b) Is the array frame an exposed-conductive-part as defined in BS 7671?',
    'Connect to protective earthing via a protective earthing conductor or circuit protective conductor (Section 543 of BS 7671)',
    'c) Is lightning protection required, or is the array adjacent to a lightning protection system?',
    'Array frame earthing for lightning protection',
    'Connect to Earth according to BS EN 62305',
    'd) Neither a), b), nor c) apply',
    'Array frame functional earthing',
    "Connect to Earth where required, for example, according to panel, inverter or DC power optimizer manufacturer's instructions, or as specified by the system designer (Chapter 54 and section 444 of BS 7671)",
    'Tick to confirm if a, b, c, or d apply and complete relevant earthing. Apply the most onerous requirements if more than one condition in this table applies',
    'Notes on Table 2:',
    'NOTE 1: BS EN 62305 Protection against lightning',
    'NOTE 2: when considering a) and b) array frames cannot be both an extraneous-conductive-part and an exposed-conductive-part, because extraneous-conductive-parts are by definition not part of the electrical installation whereas exposed-conductive-parts are.',
    'The requirements described in this diagram apply only to PV arrays constructed using electronically conducting and interconnected metallic frames. The following mounting structure do not require array frame earthing:',
    'Array mounting structure that are comprised wholly of non-conducting materials (for example, plastic, wood etc.) and',
    'Array mounting assemblies that use discrete metallic elements (for example, brackets, bolts etc.) in such a manner that there is no electrical path from the frame of one module to another.',
  ],
  F74: [
    'Battery Storage Inspection and Commissioning Checklist',
    'Project reference',
    'Installation Address',
    'Completed by',
    "The inspection of an EESS installation needs to follow the requirements of BS 7671 and the manufacturer's instructions for the components forming the EESS. The below checklist describes general items to be inspected and should be applied to the whole installation (both AC and DC sides).",
    'PART 1: SYSTEM INSPECTION',
    'System Design/Equipment selection and connection',
    'Complete',
    'General check to confirm equipment complies with relevant standards',
    'System installed in accordance with design?',
    "Equipment correctly selected and erected – according to standards and manufacturer's instructions?",
    'Equipment undamaged?',
    'Conductors correctly connected, identified and routed?',
    'Conductors suitable selected for voltage and current requirements?',
    'Switchgear and ancillary devices suitable for voltage and current requirements?',
    'Switchgear and ancillary devices correctly installed and connected?',
    'Components selected and erected to suit the locations and any eternal influences?',
    'Protection against electric shock',
    'i. Basic protection (prevention of contact with live parts)',
    'Protection by insulation of live parts (e.g. conductors) - correctly applied and suitable',
    'Protection by the use of barriers or enclosures – suitable and with an appropriate IP rating',
    'ii. Additional protection (additional protection measures)',
    'Protection by the use of an RCD not exceeding 30mA',
    'Supplementary bonding',
    'iii. Other methods of protection',
    'SELV',
    'PELV',
    'Double or reinforced insulation (Class II or equivalent equipment and circuits)',
    'iv. Automatic disconnection of supply',
    'Suitable main earth provided',
    'Earth connections suitably installed',
    'Main protective bonding suitably installed',
    'RCDs provided for fault protection (where necessary)',
    'General',
    'Equipment and circuits deployed to prevent mutual detrimental influence?',
    'Equipment location to allow suitable access arrangements?',
    'Labels and signs displayed and durable?',
    'Systems that provide back-up or island mode power supply',
    'Isolation of grid supply current-carrying conductors? (see section 9.4 of Code of Practice)',
    "Provision of consumer's earth electrode? (see section 9.4.10 of Code of Practice)",
    'Additional protection by RCDs to supplement overcurrent protective devices to ensure adequate disconnection times are met? (see section 9.4.11 of Code of Practice)',
    'Provision of surge protection devices? (see section 9.7 Code of Practice)',
    'Staggered start and/or load-shedding on change-over (see sections 9.8 and 9.9 of Code of Practice)',
    'EESS location',
    'Location/room has ventilation arrangements suitable for EESS and ancillary equipment?',
    'Location selected suitable for IP rating of EESS components?',
    'Fire prevention and detection measures implemented as necessary to meet EESS technology?',
    'Site safety signs displayed and durable as necessary to meet EESS technology?',
    'EESS Equipment',
    "Equipment installed to manufacturer's requirements?",
    "Clearance from adjacent objects meets manufacturer's specifications?",
    "Ventilation of equipment meets manufacturer's requirements and remains unobstructed?",
    'Clearance from any external heat sources acceptable (as relevant)?',
    'EESS equipment suitably accessible for maintenance and operation?',
    "EESS labelling displayed and durable (e.g. 'multiple supplies' warning notices, 'battery in installation' instruction notices)?",
    'Part 1: Notes and Observations',
    'PART 2: TESTS ACCORDING TO BS 7671',
    'Tests carried out',
    'Y/N/NA',
    'Part 2 BS 7671 certificate and schedule references',
    'Part 2: Notes and observations',
    'PART 3: EQUIPMENT AND SYSTEM TESTS',
    'PART 4: APPLICATION TESTS',
    "Manufacturer's commissioning test report/schedule reference(s) (where appropriate)",
    'Part 4: Notes and observations',
  ],
  F75: ['Battery Storage Commissioning Checklist', 'Project reference', 'Installation Address', 'Completed by', 'Equipment and systems test', 'Application tests', 'Signed'],
};
// The 15 tests, on F74 (Parts 3–4) and F75 alike: title, test, guidance.
const TESTS = [
  ['Data acquisition and control', 'Test to ensure that EESS data acquisition and control systems are performing correctly'],
  ['Internet connectivity', 'Test to ensure that the EESS is correctly configured and communicating'],
  ['Displays/alarms', 'Check to ensure correct function of any user displays or alarm mechanisms'],
  ['Charge-discharge', 'Check that the EESS can correctly operate charge and discharge functions. Functional checks of batteries are recommended by the manufacturer or relevant standards (e.g. BS EN 61427-1 recommends battery capacity tests during commissioning). Capacity tests are not routinely required for domestic EESS installations'],
  ['Thermal management', 'Check to ensure correct function of any thermal management systems'],
  ['Ventilation', 'Check to ensure correct function of any ventilation systems and controls'],
  ['Fire systems', 'Check to ensure correct function of any fire detection or management systems'],
  ['Wet chemical checks', 'Test to validate correct status of any liquids contained within the EESS (e.g. using hydrometer to check a lead-acid battery)'],
  ['Ancillary equipment', 'Check to ensure correct function of any ancillary equipment forming part of the EESS (e.g. pumps, control valves, etc.)'],
  ['G98/G99', "Test for EESS that can operate in parallel to the grid ('grid connected')", "At the most basic these tests may simply be a 'loss of mains test' to ensure that the system operates correctly when the mains supply is lost. For larger systems, a longer test sequence, such as G99 'injection testing', may be required."],
  ['Export limitation (G100)', 'Where the EESS is part of a system that has been specified to control site export to a specific limit (export from the on-site generation or the battery), a suite of tests will be required to prove the correction function of these systems.', 'The commissioning tests expected by a DNO during the commissioning of an export limitation system are described in Engineering Recommendation G100.'],
  ['Ancillary services', 'Where a system is providing services to support the grid, specific commissioning tests will be required to prove that the system meets the requirements of that service.', 'These tests typically involve simulating specific grid conditions and then monitoring the EESS to ensure it responds in the correct manger. An example of these tests would be where a test set is used to inject a specific grid frequency change – and then the EESS is monitored to ensure that it has a suitable charge/discharge ramp response'],
  ['Revenue metering/monitoring', 'Where an EESS derives income from providing a service, metering and data acquisition systems are deployed to monitor the EESS and allow revenue to be collected. The correct operation and accuracy of these systems may need to be tested during commissioning.', 'These tests may also be required for other meters in the system, such as those utilised to determine EESS usage as part of any warranty conditions'],
  ['Back-up or island mode – power quality', 'Where an EESS provides a back-up or an island mode power supply, the quality of that supply may need to be verified during commissioning.', 'These tests may vary from simple checks of voltage and frequency to a more detailed examination of wave-shape and harmonic content.'],
  ['Back-up or island mode – changeover', 'Where an EESS provides a back-up power supply, the transition between on-grid and island mode operation may require functional testing.', 'Information on the requirements for systems providing back up functionality is provided in sections 8.3 and 9.4 of the IET Code of Practice. Commissioning tests need to determine the correct function of the measures adopted and may include:', '1. Correct function of changeover switches/relays;', '2. Correct function of neutral-earth switching;', '3. Correct separation of essential and non-essential supplies;', "4. Measurement of earth electrode resistance for the consumer's earth electrode"],
];
for (const doc of ['F74', 'F75']) for (const row of TESTS) DOCX[doc].push(...row);
for (const [doc, lines] of Object.entries(DOCX)) for (const line of lines) prove(`${doc} Word form: "${line.slice(0, 70)}"`, printed(doc, fix(line)), 'not on our PDF');
prove('the source’s typos aren’t printed', Object.keys(SIC).filter((k) => k !== 'mm2').every((typo) => Object.values(pdf).every((t) => !t.includes(norm(typo)))));

// F78's lines: printed by Unit 4 from these sources (the electrician's pack carries what's theirs).
const F78_DOCX = {
  'EESS & PV Handover Certificate': F78.f78_kind,
  'Initial verification / Periodic verification': F78.f78_kind,
  'Installation Address': F78.f78_addr,
  'Client Name: [customer_name]': F78.f78_client,
  'Test Date: <Commissioning Date>': F78.f78_test_date,
  "Contractor's details: Heliaxis Ltd, 9 Turner Street, Newport, Gwent, NP19 7AZ, 01633 965205, hello@heliaxis.co.uk": src('lib/subcontractors/agreement.ts').includes("addressLines: ['9 Turner Street', 'Newport', 'Gwent', 'NP19 7AZ']"),
  'MCS Contact: Telephone: 0333 103 8130 Email: hello@mcscertified.com': true, // fixed wording, Unit 4's F78
  'EESS: Description of installation (key components installed)': F78.f78_e_desc,
  'System Class See MIS 3012 Section 2.2 1 / 2 / 3 / 4': F78.f78_e_class,
  'Island Mode capable? Yes/No': F78.f78_e_island,
  'Max Power Output kW': F78.f78_e_kw,
  'Usable Capacity kWh': F78.f78_e_kwh,
  'Commissioning certificate part 1 (F74)': F78.f78_e_p1,
  'Commissioning certificate part 2 (F74)': F78.f78_e_p2,
  'Commissioning certificate part 3 (F75)': F78.f78_e_p3,
  'Commissioning certificate part 4 (F75)': F78.f78_e_p4,
  'PV: Description of installation (key components installed)': F78.f78_p_desc,
  'Rated power (kW DC)': F78.f78_p_kw,
  'Location': F78.f78_p_loc,
  'Estimated system performance (kWh)': F78.f78_p_est,
  'Circuits tested': F78.f78_p_circuits,
  'IEC 60364-6 inspection report reference:': F78.f78_p_iec_insp,
  'IEC 60364-6 test report reference:': F78.f78_p_iec_test,
  'PV array inspection report reference: (F44A)': F78.f78_p_f44a,
  'PV array test report reference: (F43)': F78.f78_p_f43,
  'DESIGN, CONSTRUCTION, INSPECTION AND TESTING (the declaration)': true, // fixed wording, Unit 4's F78
  'Signature(s): Name(s): <Commissioning Engineer> Date: <Commissioning Date>': F78.f78_sig,
  'Next inspection recommended after not more than: Years': F78.f78_next,
  'Comments:': F78.f78_comments,
};
for (const [line, ok] of Object.entries(F78_DOCX)) prove(`F78 Word form: "${line.slice(0, 70)}"`, ok);

console.log(`${proved} items proved present${failed ? `, ${failed} missing` : ''}`);
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
