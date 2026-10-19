// Solar survey rules (src/lib/surveys/rules.ts), the answers merge (merge.ts), drawings (markup.ts)
// and the phone-sensor maths (device.ts).
// Usage: node --experimental-strip-types scripts/test-survey-rules.mjs
import { SCREENS, SOLAR_SCHEMA, SLOT_RE, fieldIndex } from '../src/lib/surveys/solar-schema.ts';
import { DRAWINGS_FLAG, evaluate } from '../src/lib/surveys/rules.ts';
import { mergeAnswers, mergeSurvey, same } from '../src/lib/surveys/merge.ts';
import { cleanMarkup, markupPathFor, markupShapes } from '../src/lib/surveys/markup.ts';
import { compassLabel, headingFrom, nearestCompass, pitchFrom, roofFacingFromLooking } from '../src/lib/surveys/device.ts';

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}
const yes = (name, cond, detail) => eq(name + (cond || detail === undefined ? '' : ` (${JSON.stringify(detail)})`), !!cond, true);

const products = ['solar'];
const run = (a, photos = []) => evaluate(SOLAR_SCHEMA, a, photos, products);
const P = (slot, hasMarkup = false, failed = false) => ({ slot, hasMarkup, failed });
const fields = (list) => list.map((m) => (m.roofId ? `${m.field}:${m.roofId}` : m.field));

// ── The schema hangs together ──
const ids = [...fieldIndex().keys()];
eq('field ids are unique', ids.length, new Set(SOLAR_SCHEMA.flatMap((s) => [...(s.once ?? []), ...s.fields]).map((f) => f.id)).size);
yes('every photo field id makes a valid slot (with and without a roof)', SOLAR_SCHEMA.flatMap((s) => [...(s.once ?? []), ...s.fields]).filter((f) => f.type === 'photo' || f.type === 'photos').every((f) => SLOT_RE.test(f.id) && SLOT_RE.test(`${f.id}:r6`)));
yes('each section sits on the screen that lists it', SOLAR_SCHEMA.every((s) => SCREENS[s.screen]?.sections.includes(s.key)));
eq('8 screens', SCREENS.length, 8);

// ── A full one-roof solar + battery job, everything answered ──
const full = {
  A3: { address: '12 High St, Newport', postcode: 'NP20 4AB' },
  A4: 'solar_battery',
  X6: 'Not on the front.\n[11:42] Customer said: would like the battery in the garage',
  A5: 'detached',
  A7: true,
  A8a: 'no',
  A8b: 'no',
  A8c: 'no',
  X1: 'no',
  S1: ['rear'],
  S7: 'driveway',
  S3: ['paved'],
  S4: false,
  S5: false,
  S6: 'side_gate',
  S6w: 1,
  roofs: [
    {
      id: 'r1',
      R1: 'Rear main',
      R2: 'gable',
      R3: 'concrete_interlocking',
      R7: 180,
      R6: 'good',
      R12: ['none'],
      R16: 'no',
      R10a: 5,
      L1: 'hatch_ladder',
      L2: 'trussed',
      R8: 35,
      L6: '47x100',
      L7: 600,
      L12: 'breathable',
      L12c: 'good',
      L13: ['none'],
      L14: ['none'],
      L17: 'desktop_ok',
    },
  ],
  E2: '100',
  E3: 'no',
  E4: 'single',
  E5: 'tncs',
  E7: 'smets2',
  E11a: 'plastic',
  E11b: true,
  E11c: true,
  E12: 'Under the stairs',
  E13: ['none'],
  E14: 3400,
  E15: 'half_day',
  F1: 'garage',
  F5: 'detached_garage',
  F2a: true,
  F2b: true,
  F3: 'strong',
  F4a: '5_10',
  F4b: 'lt5',
  F7: 'masonry',
  F8: false,
  F9a: true,
  F9b: true,
  F9c: false,
  F10: 10,
  C1m: 'roof_entry',
  C5: true,
  Z1: { panels: 12, kwp: 5.1, faces: ['r1'], inverter: 'Solis 5kW', inverterKw: 5, batteryKwh: 10 },
  Z8: { name: 'Jane Smith', at: '2026-10-19T11:50:00Z' },
};
const fullPhotos = [
  P('B1'), P('B2'), P('B3'), P('S2'), P('R13', true), P('R4:r1'),
  P('L3:r1'), P('L4:r1'), P('L5:r1'),
  P('E1'), P('E6'), P('E10'),
  P('F1p'), P('F6'),
  P('C1', true), P('C2', true),
];
const ev = run(full, fullPhotos);
eq('full sample: 100%', ev.percent, 100);
eq('full sample: nothing missing', fields(ev.missing), []);
eq('full sample: nothing "not filled"', fields(ev.notFilled), []);
eq('full sample: no drawings to do', ev.drawingsToDo.length, 0);
eq('full sample: no blocks', ev.blocks, []);
eq('full sample: no red flags', ev.flags, []);
eq('full sample: G99 (5 kW single phase)', ev.summary.dnoRoute, 'g99');
eq('full sample: permitted development', ev.summary.planning, 'permitted');
eq('full sample: desktop check', ev.summary.structural, 'desktop_ok');
eq('full sample: suggestion for r1', ev.suggestions.r1?.verdict, 'desktop_ok');
eq('full sample: battery adds F5 to the 24 must items', ev.counts.must, 25);

// ── Photos ──
{
  const e = run(full, fullPhotos.filter((p) => p.slot !== 'B1'));
  eq('no front photo: B1 is missing', fields(e.missing), ['B1']);
  const step = e.photoRun.find((s) => s.slot === 'B1');
  yes('no front photo: B1 is in the photo run, not done', step && step.done === false && step.level === 'must', step);
  yes('no front photo: under 100%', e.percent < 100, e.percent);
}
{
  const e = run(full, fullPhotos.map((p) => (p.slot === 'B1' ? P('B1', false, true) : p)));
  eq('a photo that failed to upload does not count', fields(e.missing), ['B1']);
}
{
  const e = run(full, fullPhotos.filter((p) => p.slot !== 'R4:r1'));
  eq('a missing Should photo is "not filled", not missing', [fields(e.missing), fields(e.notFilled)], [[], ['R4:r1']]);
}
{
  const { E15, ...rest } = full;
  const e = run(rest, fullPhotos);
  eq('a missing Should answer is "not filled", not missing', [fields(e.missing), fields(e.notFilled)], [[], ['E15']]);
  void E15;
}
{
  const e = run(full, fullPhotos.map((p) => (p.slot === 'R13' ? P('R13', false) : p)));
  eq('cut-out photo without a drawing: drawings to do, not missing', [fields(e.drawingsToDo), fields(e.missing)], [['R13'], []]);
  yes('cut-out photo without a drawing: red flag "Drawings to do"', e.flags.includes(DRAWINGS_FLAG), e.flags);
  eq('cut-out photo without a drawing: still 100%', e.percent, 100);
}
{
  const e = run(full, fullPhotos);
  const order = e.photoRun.map((s) => s.slot);
  yes('photo run: front before rear before the cut-out before the loft', order.indexOf('B1') < order.indexOf('B3') && order.indexOf('B3') < order.indexOf('R13') && order.indexOf('R13') < order.indexOf('L3:r1'), order);
  const firstOptional = e.photoRun.findIndex((s) => s.level === 'optional');
  yes('photo run: optional photos come last', firstOptional > 0 && e.photoRun.slice(firstOptional).every((s) => s.level === 'optional'), order);
  const outside = e.photoRun.filter((s) => s.screen === 1 && s.level !== 'optional').map((s) => s.level);
  eq('photo run: must before should within a screen', outside, ['must', 'must', 'must', 'should']);
}

// ── Blocks, warnings and red flags ──
{
  const e = run({ ...full, F5: 'loft' }, fullPhotos);
  eq('battery in the loft: blocks', e.blocks.map((b) => b.field), ['F5']);
  yes('battery in the loft: red flag', e.flags.includes('Battery spot not allowed'), e.flags);
  const solarOnly = run({ ...full, A4: 'solar', F5: 'loft' }, fullPhotos);
  eq('no battery in scope: the loft answer is ignored', solarOnly.blocks, []);
}
{
  const e = run({ ...full, E3: 'yes' }, fullPhotos);
  yes('looped supply: red flag', e.flags.includes('Looped supply'), e.flags);
  yes('looped supply: DNO note', e.summary.dnoNote.includes('Looped supply'), e.summary.dnoNote);
}
{
  const e = run({ ...full, E2: '60', E5: 'tt', F3: 'none', S4: true, S5: true }, fullPhotos);
  for (const f of ['60A main fuse', 'TT earthing', 'No WiFi at the inverter', 'Scaffold licence needed', 'Neighbour’s consent needed']) yes(`red flag: ${f}`, e.flags.includes(f), e.flags);
  yes('warning: scaffold licence', e.warnings.some((w) => w.field === 'S4'), e.warnings);
  yes('warning: 60A fuse', e.warnings.some((w) => w.field === 'E2'), e.warnings);
}
{
  const roof = { ...full.roofs[0], R3: 'asbestos_cement' };
  delete roof.R16;
  const e = run({ ...full, roofs: [roof] }, fullPhotos);
  yes('asbestos cement roof: suspected asbestos flag', e.flags.includes('Asbestos suspected'), e.flags);
  yes('asbestos cement roof: don’t-drill warning', e.warnings.some((w) => w.field === 'R3:r1' && /HSG264/.test(w.message)), e.warnings);
}
{
  const e = run({ ...full, F10: 50, F5: 'indoor_room' }, fullPhotos);
  yes('50 kWh indoors: over the PAS 63100 limit', e.warnings.some((w) => w.field === 'F10'), e.warnings);
  const g = run({ ...full, F10: 50, F5: 'detached_garage' }, fullPhotos);
  yes('50 kWh in a garage: fine', !g.warnings.some((w) => w.field === 'F10'), g.warnings);
}

// ── Structural ──
{
  const roof = { ...full.roofs[0], R2: 'hipped', L2: 'cut', L8: 3.2, L9a: true };
  delete roof.L17;
  const e = run({ ...full, roofs: [roof] }, [...fullPhotos, P('L10:r1')]);
  eq('hipped + cut: engineer suggested', e.suggestions.r1?.verdict, 'engineer');
  yes('hipped + cut: the reason says why', /MIS 3002/.test(e.suggestions.r1?.reasons.join(' ') || ''), e.suggestions.r1);
  eq('hipped + cut: structural is engineer', e.summary.structural, 'engineer');
  yes('hipped + cut: red flag', e.flags.includes('Structural engineer needed'), e.flags);
  eq('cut roof adds 3 must items (L8, L9a, L10)', e.counts.must, 28);
}
{
  const roof = { ...full.roofs[0], L13: ['sagging'], L17: 'desktop_ok' };
  const e = run({ ...full, roofs: [roof] }, fullPhotos);
  eq('the surveyor’s own verdict wins over the suggestion', [e.suggestions.r1?.verdict, e.summary.structural], ['engineer', 'desktop_ok']);
}

// ── DNO route ──
const dno = (kw, extra = {}) => run({ ...full, ...extra, Z1: { inverterKw: kw } }, fullPhotos).summary.dnoRoute;
eq('DNO: 3.6 kW single phase → G98', dno(3.6), 'g98');
eq('DNO: 5 kW single phase → G99', dno(5), 'g99');
eq('DNO: 10 kW three phase → G98', dno(10, { E4: 'three' }), 'g98');
eq('DNO: 3 kW plus 3 kW existing solar → G99', dno(3, { E13: ['pv'], E13kw: 3 }), 'g99');
eq('DNO: no inverter size → unknown', run({ ...full, Z1: undefined }, fullPhotos).summary.dnoRoute, 'unknown');

// ── Planning ──
eq('listed building → consent', run({ ...full, A8a: 'yes' }, fullPhotos).summary.planning, 'consent');
eq('conservation area → check', run({ ...full, A8b: 'yes' }, fullPhotos).summary.planning, 'check');
eq('a flat → check', run({ ...full, A5: 'flat' }, fullPhotos).summary.planning, 'check');

// ── Couldn't check this section ──
{
  const e = run({ ...full, skip: { 'D:r1': 'Loft full of stored furniture' } }, fullPhotos.filter((p) => !p.slot.startsWith('L')));
  yes('loft skipped: no L items missing or not filled', ![...e.missing, ...e.notFilled].some((m) => m.field.startsWith('L') || m.field === 'R8'), [...e.missing, ...e.notFilled]);
  yes('loft skipped: red flag with the roof name and reason', e.flags.includes('Loft (Rear main) not checked: Loft full of stored furniture'), e.flags);
  eq('loft skipped: still 100%', e.percent, 100);
  eq('loft skipped: structural unknown', e.summary.structural, 'unknown');
}
{
  const e = run({ ...full, skip: { E: 'Meter cupboard locked' } }, fullPhotos.filter((p) => !['E1', 'E6', 'E10'].includes(p.slot)));
  eq('electrics skipped: nothing missing', fields(e.missing), []);
  yes('electrics skipped: flagged', e.flags.includes('Electrics not checked: Meter cupboard locked'), e.flags);
}

// ── Battery only ──
{
  const a = { A3: full.A3, A4: 'battery_only', X6: 'None', S1: ['none'], S7: 'driveway', E2: '100', E3: 'no', F1: 'garage', F5: 'outdoors' };
  const e = run(a, [P('B1'), P('B2'), P('B3'), P('E1'), P('E6'), P('E10'), P('C2', true)]);
  eq('battery only: nothing missing', fields(e.missing), []);
  yes('battery only: no roof, loft or DC route items at all', ![...e.missing, ...e.notFilled, ...e.photoRun].some((m) => /^(R|L|C1)/.test(m.field ?? m.slot)), [...e.notFilled.map((m) => m.field), ...e.photoRun.map((s) => s.slot)]);
}

// ── Customer will send ──
{
  const { E14, ...rest } = full;
  void E14;
  const e = run({ ...rest, send: { E14: true } }, fullPhotos);
  yes('E14 "Customer will send" counts as done', !e.notFilled.some((m) => m.field === 'E14'), e.notFilled);
  const p = run(rest, [...fullPhotos, P('E14p')]);
  yes('E14 a photo of a bill counts as done', !p.notFilled.some((m) => m.field === 'E14'), p.notFilled);
}

// ── Must count for a one-roof trussed solar job ──
{
  const a = { A3: full.A3, A4: 'solar', roofs: [{ id: 'r1', R1: 'Roof area 1' }] };
  const e = run(a, []);
  eq('one roof, solar: 24 must items', e.counts.must, 24);
  eq('one roof, solar: 22 still to do (A3 and A4 pre-filled)', e.missing.length, 22);
  eq('…12 of them photos', e.missing.filter((m) => e.photoRun.some((s) => s.slot === (m.roofId ? `${m.field}:${m.roofId}` : m.field))).length, 12);
  const t = run({ ...a, roofs: [{ id: 'r1', L1: 'hatch_ladder', L2: 'trussed' }] }, []);
  eq('one roof, trussed: still 24 must items', t.counts.must, 24);
}

// ── Two roof areas, "Same loft as roof area 1" ──
{
  const r2 = { id: 'r2', R1: 'Garage', R2: 'gable', R3: 'concrete_interlocking', L0: true, R8: 30 };
  const e = run({ ...full, roofs: [full.roofs[0], r2] }, fullPhotos);
  yes('same loft: no loft photos asked for the second area', !e.missing.some((m) => m.roofId === 'r2'), e.missing);
  yes('two roofs: labels carry the roof name', e.notFilled.some((m) => m.label.endsWith('(Garage)')), e.notFilled);
}

// ── Merge ──
{
  const base = { X6: 'None', E2: '100', roofs: [{ id: 'r1', R2: 'gable' }] };
  const local = { ...base, E2: '80', roofs: [{ id: 'r1', R2: 'gable', R3: 'pantile' }, { id: 'r2', R1: 'Garage' }] };
  const server = { ...base, E3: 'no', roofs: [{ id: 'r1', R2: 'hipped' }, { id: 'r3', R1: 'Porch' }] };
  const m = mergeAnswers(base, local, server);
  eq('merge: different fields on each copy both survive', [m.E2, m.E3], ['80', 'no']);
  eq('merge: per roof, per field', m.roofs.find((r) => r.id === 'r1'), { id: 'r1', R2: 'hipped', R3: 'pantile' });
  eq('merge: roofs added on each side are both kept', m.roofs.map((r) => r.id).sort(), ['r1', 'r2', 'r3']);
}
{
  const base = { E2: '100' };
  const m = mergeAnswers(base, { E2: '80' }, { E2: '60' });
  eq('merge: the same field keeps the local value', m.E2, '80');
  const n = mergeAnswers(base, { E2: '100' }, { E2: '60' });
  eq('merge: unchanged locally → the server’s value', n.E2, '60');
  const d = mergeAnswers({ E2: '100', E3: 'no' }, { E2: '100' }, { E2: '100', E3: 'no' });
  eq('merge: cleared locally stays cleared', 'E3' in d, false);
}
{
  const base = { roofs: [{ id: 'r1' }] };
  const r = mergeSurvey(base, { roofs: [{ id: 'r1' }, { id: 'r2', R1: 'Garage' }] }, { roofs: [{ id: 'r1' }, { id: 'r2', R1: 'Porch' }] });
  eq('merge: both phones added "r2": both kept, ours moved', r.answers.roofs.map((x) => `${x.id}:${x.R1}`), ['r1:undefined', 'r2:Porch', 'r3:Garage']);
  eq('merge: …and the move is reported', r.renamedRoofs, { r2: 'r3' });
}
{
  // A booked survey ({} on the server) opened on two phones: both start from the same pre-fill.
  const pre = { A3: { address: '12 High St', postcode: 'NP20 4AB' }, A4: 'solar', roofs: [{ id: 'r1', R1: 'Roof area 1' }] };
  const a = { ...pre, roofs: [{ id: 'r1', R1: 'Roof area 1', R2: 'gable', R3: 'tile' }] };
  const b = { ...pre, roofs: [{ id: 'r1', R1: 'Roof area 1', L1: 'yes', L2: 'trussed' }] };
  const r = mergeSurvey(pre, b, a);
  eq('merge: two phones from the pre-fill share roof area 1', r.answers.roofs, [{ id: 'r1', R1: 'Roof area 1', R2: 'gable', R3: 'tile', L1: 'yes', L2: 'trussed' }]);
  eq('merge: …and nothing is renumbered', r.renamedRoofs, {});
}
{
  const m = mergeAnswers({ skip: { E: 'Locked' } }, { skip: { E: 'Locked', F: 'No time' } }, { skip: { H: 'Rain' } });
  yes('merge: skip reasons merge per key (and a server removal sticks)', same(m.skip, { F: 'No time', H: 'Rain' }), m.skip);
}
yes('same(): key order and null don’t matter', same({ a: 1, b: { c: [1, 2] }, d: null }, { b: { c: [1, 2] }, a: 1 }));

// ── Drawings ──
{
  const m = cleanMarkup({ v: 1, items: [{ t: 'path', c: '#f8bc1e', w: 0.006, pts: [0.1, 0.1, 0.5, 2] }, { t: 'arrow', c: 'blue', a: [0, 0], b: [1, 1] }, { t: 'text', c: '#E02424', a: [0.2, 0.3], s: '  Battery   here ' }, { t: 'path', pts: [0.4] }] });
  eq('markup: cleaned (colours, clamped points, trimmed text, empty paths dropped)', m, {
    v: 1,
    items: [
      { t: 'path', c: '#F8BC1E', w: 0.006, pts: [0.1, 0.1, 0.5, 1] },
      { t: 'arrow', c: '#F8BC1E', w: 0.006, a: [0, 0], b: [1, 1] },
      { t: 'text', c: '#E02424', a: [0.2, 0.3], s: 'Battery here', size: 0.04 },
    ],
  });
  eq('markup: nothing usable → null', cleanMarkup({ items: [] }), null);
  eq('markup: flattened path', markupPathFor('p1/survey/abc.jpg'), 'p1/survey/abc.markup.jpg');
  const shapes = markupShapes(m, 1000, 500);
  eq('markup: shapes in pixels', shapes[0], { kind: 'line', d: 'M100 50 L500 500', stroke: '#F8BC1E', width: 6 });
}

// ── Compass and pitch ──
eq('compass: 200° → S', [nearestCompass(200), compassLabel(200)], [180, 'S']);
eq('compass: 350° → N', nearestCompass(350), 0);
eq('compass: iOS heading', headingFrom({ webkitCompassHeading: 225 }), 225);
eq('compass: Android absolute alpha 90 → 270 (W)', headingFrom({ alpha: 90, absolute: true }), 270);
eq('compass: landscape adds the screen angle', headingFrom({ alpha: 90 }, 90, true), 0);
eq('compass: not absolute → no heading', headingFrom({ alpha: 90, absolute: false }), null);
eq('pointing at the roof from the garden: it faces back towards you', roofFacingFromLooking(10), 190);
eq('pitch: 35° face up', pitchFrom(0, 9.81 * Math.sin((35 * Math.PI) / 180), 9.81 * Math.cos((35 * Math.PI) / 180)), 35);
eq('pitch: 35° face down', pitchFrom(0, -9.81 * Math.sin((35 * Math.PI) / 180), -9.81 * Math.cos((35 * Math.PI) / 180)), 35);
eq('pitch: rounded to 0.5°', pitchFrom(0, 9.81 * Math.sin((22.3 * Math.PI) / 180), 9.81 * Math.cos((22.3 * Math.PI) / 180)), 22.5);

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
