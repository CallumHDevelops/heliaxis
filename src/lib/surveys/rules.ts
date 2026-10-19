/**
 * What a solar survey still needs, and what its answers mean: Needed / Not filled lists, the photo
 * run, drawings to do, warnings, red flags, the structural suggestion, the DNO route and planning.
 *
 * Pure, with type-only imports: the schema is passed in, so the phone form (offline), the APIs and
 * scripts/test-survey-rules.mjs all run exactly the same rules. Nothing here ever blocks except
 * Must items and option blocks; DNO route, planning and structural are extras.
 */
import type { Answers, Ctx, Field, Level, RoofAnswers, Section, SectionKey } from './solar-schema';

export type Miss = { screen: number; section: SectionKey; roofId?: string; field: string; label: string };
export type PhotoInfo = { slot: string; hasMarkup: boolean; failed?: boolean };
export type Verdict = 'desktop_ok' | 'engineer' | 'not_suitable';
export type RunStep = { slot: string; label: string; hint?: string; level: Level; done: boolean; screen: number };
export type SurveySummary = {
  dnoRoute: 'g98' | 'g99' | 'unknown';
  dnoNote: string;
  planning: 'permitted' | 'check' | 'consent';
  planningNote: string;
  structural: Verdict | 'unknown';
};
export type Evaluation = {
  /** Must + Should done ÷ Must + Should shown, 0–100. */
  percent: number;
  counts: { must: number; mustDone: number; should: number; shouldDone: number };
  /** Must items not done: these block finishing. A drawing alone is never "missing". */
  missing: Miss[];
  /** Should items not done: listed, never block. */
  notFilled: Miss[];
  /** R13 / C1 / C2 with a photo but no drawing yet ("do them now, or later in the van"). */
  drawingsToDo: Miss[];
  /** "Take the photos" order. */
  photoRun: RunStep[];
  blocks: { field: string; message: string }[];
  warnings: { field: string; message: string }[];
  /** Red flags, for the Finish screen, the lists and the report. */
  flags: string[];
  /** Per roof area id. */
  suggestions: Record<string, { verdict: Verdict; reasons: string[] }>;
  summary: SurveySummary;
};

/** The red flag saved on a survey that still has drawings to do ("Finished, drawings to do"). */
export const DRAWINGS_FLAG = 'Drawings to do';

const ROOF_ID = /^r[1-6]$/;
const LEVEL_RANK: Record<Level, number> = { must: 0, should: 1, optional: 2 };
const VERDICT_RANK: Record<Verdict, number> = { desktop_ok: 0, engineer: 1, not_suitable: 2 };
const VERDICTS = Object.keys(VERDICT_RANK) as Verdict[];
const BLOCKED_BATTERY_SPOTS = ['loft', 'escape_route', 'bedroom', 'cellar_no_exit'];

/** The roof areas in the answers (at least one: "Roof area 1"). */
export function roofsOf(a: Answers): RoofAnswers[] {
  const list = Array.isArray(a.roofs) ? a.roofs.filter((r) => r && typeof r === 'object' && ROOF_ID.test(String(r.id))) : [];
  const seen = new Set<string>();
  const out = list.filter((r) => !seen.has(r.id) && !!seen.add(r.id));
  return out.length ? out : [{ id: 'r1' }];
}

/** "Rear main", or "Roof area 2". */
export function roofName(roof: RoofAnswers, index: number): string {
  const n = typeof roof.R1 === 'string' ? roof.R1.trim() : '';
  return n || `Roof area ${index + 1}`;
}

export const slotFor = (fieldId: string, roofId?: string): string => (roofId ? `${fieldId}:${roofId}` : fieldId);
export const levelOf = (f: Field, c: Ctx): Level => (typeof f.level === 'function' ? f.level(c) : f.level);
export const isShown = (f: Field, c: Ctx): boolean => !f.show || f.show(c);
const isPhoto = (f: Field) => f.type === 'photo' || f.type === 'photos';
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const finite = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
const listOf = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

/** Whether a (non-photo) answer counts as filled in. */
export function valueDone(f: Field, v: unknown): boolean {
  if (v == null) return false;
  switch (f.type) {
    case 'text':
    case 'longtext':
    case 'choice':
    case 'band':
      return str(v) !== '';
    case 'number':
    case 'pitch':
    case 'compass':
      return finite(v) != null;
    case 'dims':
      if (typeof v === 'string') return v.trim() !== '';
      if (typeof v === 'object') {
        const o = v as { w?: unknown; d?: unknown };
        return (finite(o.w) ?? 0) > 0 && (finite(o.d) ?? 0) > 0;
      }
      return false;
    case 'multi':
      return Array.isArray(v) && v.length > 0;
    case 'yesno':
      return typeof v === 'boolean';
    case 'address': {
      const o = (typeof v === 'object' ? v : {}) as { address?: unknown; postcode?: unknown };
      return str(o.address) !== '' && str(o.postcode) !== '';
    }
    case 'system':
      return typeof v === 'object' && Object.values(v as Record<string, unknown>).some((x) => finite(x) != null);
    case 'signature':
      return typeof v === 'string' ? v.trim() !== '' : typeof v === 'object' && str((v as { name?: unknown }).name) !== '';
    default:
      return false;
  }
}

type Walked = {
  field: Field;
  section: Section;
  roof?: RoofAnswers;
  roofIndex: number;
  ctx: Ctx;
  slot: string;
  level: Level;
  done: boolean;
  label: string;
  order: number;
};

const SECTION_NAMES: Partial<Record<SectionKey, string>> = { D: 'Loft', E: 'Electrics', F: 'Kit spots', H: 'Scaffold and access' };

export function evaluate(schema: Section[], a: Answers, photos: PhotoInfo[], products: string[]): Evaluation {
  const roofs = roofsOf(a);
  const many = roofs.length > 1;
  const skip = (a.skip && typeof a.skip === 'object' ? a.skip : {}) as Record<string, unknown>;
  const send = (a.send && typeof a.send === 'object' ? a.send : {}) as Record<string, unknown>;
  const base: Ctx = { a: { ...a, roofs }, products };

  const live = photos.filter((p) => !p.failed);
  const photoCount = (slot: string) => live.filter((p) => p.slot === slot).length;
  const slotHasMarkup = (slot: string) => live.some((p) => p.slot === slot && p.hasMarkup);

  // Which sections (and roof areas of per-roof sections) are shown, and which were "couldn't check".
  const shownSection = new Map<SectionKey, boolean>();
  const skipped = new Map<string, string>(); // skip key -> reason
  for (const s of schema) {
    const shown = !s.show || s.show(base);
    shownSection.set(s.key, shown);
    if (!shown || !s.skippable) continue;
    for (const key of s.perRoof ? roofs.map((r) => `${s.key}:${r.id}`) : [s.key]) {
      const reason = str(skip[key]);
      if (reason) skipped.set(key, reason);
    }
  }
  const active = (key: SectionKey, roofId?: string) =>
    shownSection.get(key) === true && !skipped.has(roofId && schema.find((s) => s.key === key)?.perRoof ? `${key}:${roofId}` : key);

  // Walk every shown field once (per roof area for C and D).
  const walked: Walked[] = [];
  let order = 0;
  const visit = (section: Section, field: Field, roof: RoofAnswers | undefined, roofIndex: number) => {
    order++;
    if (field.type === 'auto') return;
    const ctx: Ctx = { ...base, roof };
    if (!isShown(field, ctx)) return;
    const slot = slotFor(field.id, roof?.id);
    let done: boolean;
    if (isPhoto(field)) done = photoCount(slot) >= (field.minPhotos ?? 1);
    else {
      const v = roof ? roof[field.id] : a[field.id];
      done =
        valueDone(field, v) ||
        (!!field.canSend && send[slot] === true) ||
        (!!field.orPhoto && photoCount(slotFor(field.orPhoto, roof?.id)) > 0);
    }
    const label = roof && many ? `${field.label} (${roofName(roof, roofIndex)})` : field.label;
    walked.push({ field, section, roof, roofIndex, ctx, slot, level: levelOf(field, ctx), done, label, order });
  };
  for (const section of schema) {
    if (!shownSection.get(section.key)) continue;
    if (section.perRoof) {
      if (!skipped.has(section.key)) for (const f of section.once ?? []) visit(section, f, undefined, 0);
      roofs.forEach((roof, i) => {
        if (skipped.has(`${section.key}:${roof.id}`)) return;
        for (const f of section.fields) visit(section, f, roof, i);
      });
    } else if (!skipped.has(section.key)) {
      for (const f of section.fields) visit(section, f, undefined, 0);
    }
  }

  const miss = (w: Walked): Miss => ({
    screen: w.section.screen,
    section: w.section.key,
    ...(w.roof ? { roofId: w.roof.id } : {}),
    field: w.field.id,
    label: w.label,
  });

  const counts = { must: 0, mustDone: 0, should: 0, shouldDone: 0 };
  const missing: Miss[] = [];
  const notFilled: Miss[] = [];
  const drawingsToDo: Miss[] = [];
  const blocks: { field: string; message: string }[] = [];
  const warnings: { field: string; message: string }[] = [];
  for (const w of walked) {
    if (w.level === 'must') {
      counts.must++;
      if (w.done) counts.mustDone++;
      else missing.push(miss(w));
    } else if (w.level === 'should') {
      counts.should++;
      if (w.done) counts.shouldDone++;
      else notFilled.push(miss(w));
    }
    if (isPhoto(w.field) && w.field.drawing === 'needed' && photoCount(w.slot) > 0 && !slotHasMarkup(w.slot)) drawingsToDo.push(miss(w));
    // Warnings and blocks attached to the picked option(s).
    if (w.field.options) {
      const v = w.roof ? w.roof[w.field.id] : a[w.field.id];
      const picked = Array.isArray(v) ? v.map(String) : v == null ? [] : [String(v)];
      for (const o of w.field.options) {
        if (!picked.includes(o.key)) continue;
        if (o.warn) warnings.push({ field: w.slot, message: o.warn });
        if (o.block) blocks.push({ field: w.slot, message: o.block });
      }
    }
  }
  const total = counts.must + counts.should;
  const percent = total ? Math.round((100 * (counts.mustDone + counts.shouldDone)) / total) : 100;

  // "Take the photos": Must and Should in screen order (Must first within a screen), then the optional ones.
  const runOf = walked.filter((w) => isPhoto(w.field));
  const sortKey = (w: Walked) => [w.level === 'optional' ? 1 : 0, w.section.screen, w.level === 'optional' ? 0 : LEVEL_RANK[w.level], w.order];
  runOf.sort((x, y) => {
    const kx = sortKey(x);
    const ky = sortKey(y);
    for (let i = 0; i < kx.length; i++) if (kx[i] !== ky[i]) return kx[i] - ky[i];
    return 0;
  });
  const photoRun: RunStep[] = runOf.map((w) => ({
    slot: w.slot,
    label: w.label,
    ...(w.field.hint ? { hint: w.field.hint } : {}),
    level: w.level,
    done: w.done,
    screen: w.section.screen,
  }));

  /* ── Values the extras and red flags read ── */
  const E = active('E');
  const F = active('F');
  const H = active('H');
  const battery = a.A4 === 'solar_battery' || a.A4 === 'battery_only' || a.A4 === 'solar_battery_ev';
  const named = (roof: RoofAnswers, i: number) => (many ? ` (${roofName(roof, i)})` : '');

  // Explicit warnings (yes/no and number answers).
  if (H && a.S4 === true) warnings.push({ field: 'S4', message: 'Scaffold on the pavement or road needs a council licence: allow 2 to 3 weeks.' });
  if (H && a.S5 === true) warnings.push({ field: 'S5', message: 'Scaffold over a neighbour’s land needs their written consent.' });
  roofs.forEach((roof, i) => {
    if (active('D', roof.id) && roof.L16 === true && roof.L1 !== 'none')
      warnings.push({ field: slotFor('L16', roof.id), message: `Birds or bats nesting${named(roof, i)}: work may have to wait, and bats are protected.` });
  });
  const kwh = finite(a.F10);
  if (F && battery && kwh != null) {
    const indoors = a.F5 === 'indoor_room' || BLOCKED_BATTERY_SPOTS.includes(String(a.F5));
    const limit = indoors ? 40 : 80;
    if (kwh > limit)
      warnings.push({
        field: 'F10',
        message: `${kwh} kWh is over the PAS 63100 limit of ${limit} kWh ${indoors ? 'indoors' : 'in a garage, outbuilding or outdoors'}.`,
      });
  }

  // Structural suggestion per roof area, from its own roof type and its loft (roof area 1's for "Same loft").
  const suggestions: Evaluation['suggestions'] = {};
  const verdictOf = new Map<string, Verdict | null>();
  if (shownSection.get('D')) {
    roofs.forEach((roof, i) => {
      const reason = skipped.get(`D:${roof.id}`);
      if (reason) {
        suggestions[roof.id] = { verdict: 'engineer', reasons: [`The loft wasn’t checked (${reason})`] };
        verdictOf.set(roof.id, null);
        return;
      }
      const loft = i > 0 && roof.L0 === true ? roofs[0] : roof;
      const reasons: string[] = [];
      const r2 = String(roof.R2 ?? '');
      if (loft.L2 === 'cut' && (r2 === 'hipped' || r2 === 'hip_valley')) reasons.push('Hipped cut roof (MIS 3002 says an engineer must check)');
      if (r2 === 'asymmetric') reasons.push('Asymmetric roof (the loads are uneven)');
      if (r2 === 'flat') reasons.push('Flat roof (needs a ballast or fixing design)');
      const problems = listOf(loft.L13).filter((k) => k !== 'none');
      if (problems.length) reasons.push(`Signs of structural problems: ${problems.map(problemWord).join(', ')}`);
      const altered = listOf(loft.L14).filter((k) => k === 'heavier_covering' || k === 'timbers_removed' || k === 'loft_conversion');
      if (altered.length) reasons.push(`Past alterations: ${altered.map(alterationWord).join(', ')}`);
      if (loft.L1 === 'none') reasons.push('No loft access, so the structure couldn’t be checked');
      const known = loft.L1 != null && loft.L1 !== '';
      if (reasons.length || known) {
        suggestions[roof.id] = reasons.length
          ? { verdict: 'engineer', reasons }
          : { verdict: 'desktop_ok', reasons: ['Nothing in the answers needs an engineer'] };
      }
      // "Your structural verdict" wins; a "Same loft" area has no verdict of its own, so it keeps the suggestion.
      const picked = loft === roof && VERDICTS.includes(roof.L17 as Verdict) ? (roof.L17 as Verdict) : null;
      verdictOf.set(roof.id, picked ?? suggestions[roof.id]?.verdict ?? null);
    });
  }
  const verdicts = [...verdictOf.values()];
  const worst = verdicts.reduce<Verdict | null>((w, v) => (v && (!w || VERDICT_RANK[v] > VERDICT_RANK[w]) ? v : w), null);
  const structural: SurveySummary['structural'] =
    !verdicts.length || !worst ? 'unknown' : verdicts.some((v) => v == null) && worst === 'desktop_ok' ? 'unknown' : worst;

  // DNO route.
  const z1 = (a.Z1 && typeof a.Z1 === 'object' ? a.Z1 : {}) as Record<string, unknown>;
  const inverterKw = finite(z1.inverterKw);
  let dnoRoute: SurveySummary['dnoRoute'] = 'unknown';
  let dnoNote = 'Fill in the suggested inverter size to see the DNO route.';
  if (inverterKw != null && inverterKw > 0) {
    const existing = listOf(a.E13).includes('pv') ? finite(a.E13kw) ?? 0 : 0;
    const kw = inverterKw + existing;
    const perPhase = kw / (a.E4 === 'three' ? 3 : 1);
    if (perPhase <= 3.68) {
      dnoRoute = 'g98';
      dnoNote = 'G98: tell the DNO within 28 days of switch-on.';
    } else {
      dnoRoute = 'g99';
      dnoNote = 'G99: apply to NGED and wait for approval before installing (about 45 working days), or export-limit the system.';
    }
  }
  if (a.E3 === 'yes' || a.E3 === 'not_sure') dnoNote += ' Looped supply: NGED may need to un-loop it first.';

  // Planning.
  let planning: SurveySummary['planning'] = 'permitted';
  let planningNote = 'Permitted development: no planning application needed, as long as the panels sit no more than 200 mm proud of the roof.';
  const checks: string[] = [];
  if (a.A5 === 'flat' || a.A5 === 'commercial') checks.push(a.A5 === 'flat' ? 'flats aren’t covered by permitted development' : 'commercial buildings have different rules');
  if (a.A8b === 'yes') checks.push('it’s in a conservation area, where panels facing the road may need permission');
  if (a.A8c === 'yes') checks.push('it’s in a National Park or AONB');
  if (a.A8a === 'yes') {
    planning = 'consent';
    planningNote = 'Listed building: you need listed building consent from the council before installing.';
  } else if (checks.length) {
    planning = 'check';
    planningNote = `Check with the council before installing: ${checks.join('; ')}.`;
  }

  // Red flags.
  const flags: string[] = [];
  const flag = (f: string) => !flags.includes(f) && flags.push(f);
  if (shownSection.get('C')) {
    roofs.forEach((roof, i) => {
      const r16 = roof.R16 ?? (roof.R3 === 'asbestos_cement' ? 'suspected' : undefined);
      if (r16 === 'suspected') flag(`Asbestos suspected${named(roof, i)}`);
      if (r16 === 'confirmed') flag(`Asbestos confirmed${named(roof, i)}`);
    });
  }
  if (E && a.E3 === 'yes') flag('Looped supply');
  if (E && a.E3 === 'not_sure') flag('Looped supply? (not sure)');
  if (E && a.E2 === '60') flag('60A main fuse');
  if (E && a.E2 === 'unknown') flag('Main fuse rating unknown');
  if (shownSection.get('D')) {
    roofs.forEach((roof, i) => {
      if (!active('D', roof.id)) return;
      const loft = i > 0 && roof.L0 === true ? roofs[0] : roof;
      if (loft === roof && roof.L1 === 'none') flag(`No loft access${named(roof, i)}`);
      const v = verdictOf.get(roof.id);
      if (v === 'engineer') flag(`Structural engineer needed${named(roof, i)}`);
      if (v === 'not_suitable') flag(`Roof not suitable${named(roof, i)}`);
    });
  }
  if (F && battery && BLOCKED_BATTERY_SPOTS.includes(String(a.F5))) flag('Battery spot not allowed');
  if (H && a.S4 === true) flag('Scaffold licence needed');
  if (H && a.S5 === true) flag('Neighbour’s consent needed');
  if (shownSection.get('C')) roofs.forEach((roof, i) => roof.R6 === 'poor' && flag(`Roof covering in poor condition${named(roof, i)}`));
  if (E && a.E5 === 'tt') flag('TT earthing');
  if (F && a.F3 === 'none') flag('No WiFi at the inverter');
  for (const [key, reason] of skipped) {
    const [sec, roofId] = key.split(':') as [SectionKey, string | undefined];
    const i = roofId ? roofs.findIndex((r) => r.id === roofId) : -1;
    const where = roofId && i >= 0 ? `${SECTION_NAMES[sec] ?? sec} (${roofName(roofs[i], i)})` : SECTION_NAMES[sec] ?? sec;
    flag(`${where} not checked: ${reason}`);
  }
  if (drawingsToDo.length) flag(DRAWINGS_FLAG);

  return {
    percent,
    counts,
    missing,
    notFilled,
    drawingsToDo,
    photoRun,
    blocks,
    warnings,
    flags,
    suggestions,
    summary: { dnoRoute, dnoNote, planning, planningNote, structural },
  };
}

function problemWord(k: string): string {
  const w: Record<string, string> = {
    sagging: 'sagging',
    spread: 'roof spread',
    cracked: 'cracked timbers',
    altered_trusses: 'altered trusses',
    woodworm: 'woodworm',
    rot_damp: 'rot or damp',
    staining: 'water staining',
    daylight: 'daylight through the roof',
  };
  return w[k] ?? k;
}

function alterationWord(k: string): string {
  const w: Record<string, string> = { heavier_covering: 'heavier covering', timbers_removed: 'timbers removed', loft_conversion: 'loft conversion' };
  return w[k] ?? k;
}

/** "Get the electricity bill" etc.: what the customer said they'd send (answers.send). */
export function toSend(a: Answers): string[] {
  const send = (a.send && typeof a.send === 'object' ? a.send : {}) as Record<string, unknown>;
  return Object.keys(send).filter((k) => send[k] === true);
}

/** Missing items as one short line: "Front of the house, Main fuse rating and 2 more". */
export function missingWords(list: { label: string }[], max = 2): string {
  if (!list.length) return '';
  const head = list.slice(0, max).map((m) => m.label);
  const more = list.length - head.length;
  return more > 0 ? `${head.join(', ')} and ${more} more` : head.length > 1 ? `${head.slice(0, -1).join(', ')} and ${head[head.length - 1]}` : head[0];
}
