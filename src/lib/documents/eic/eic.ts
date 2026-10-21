import 'server-only';
import type { PDFImage } from 'pdf-lib';
import { IET_GUIDANCE } from '@/lib/site/fixed/iet-guidance';
import {
  DECLARATION,
  DEPARTURES,
  EIC_SECTIONS as S,
  editionWords,
  INSPECTIONS,
  LIABILITY,
  NEXT_INSPECTION,
  SCHEDULE_NOTES,
  SCHEDULES_VALID,
  WIRING_CODES,
} from '@/lib/site/fixed/iet-eic';
import { BONDS, COMMENTS, EARTHING, HOW, INSPECTION_KEY, LIVE, MATERIAL, WORK, type DesignSign } from '@/lib/site/forms/electrician/eic';
import { boardsOf, isGt, readingOf, type Board, type Circuit, type Rec } from '@/lib/site/forms/electrician/eic-model';
import { INK, longDate, newDocument, type Kit, type Mark } from '../pdf-kit';
import { band, cells, choices, schedule, signatureRow, type Col, type ColCell, type Group } from './parts';

/**
 * The Electrical Installation Certificate (SPEC 3.3, REGS 1.2): Heliaxis's own rendition of the
 * BS 7671 model form, without the IET logo (REGS 1.6). Certificate pages in portrait, lettered A–J
 * (A4:2026, REGS 1.4), each part in the form's order with its tick boxes; then for each board the
 * Schedule of Circuit Details (columns 1–16) and the Schedule of Test Results (17–31) in landscape A4,
 * their headings and column numbers repeated on every page they run onto. The guidance for recipients
 * page is added once its wording is verified (fixed/iet-guidance.ts); until then the certificate says
 * it's to follow.
 *
 * A finished certificate can't be made with a must unanswered (MissingAnswer). A draft (the design
 * part not signed yet, or the electrician still working) has the kit's draft banner and says "Not
 * signed yet" where a signature is to come, and is never shown to the customer.
 */

export const EIC_REVISION = 'Rev 1';

export type SigImage = { png: Uint8Array | null; at: string | null };
export type EicInput = {
  route: 'eic' | 'eic_single';
  ref: string | null;
  jobRef: string | null;
  /** YYYY-MM-DD: the electrician's sign-off, else today. */
  issued: string;
  edition: string;
  values: Record<string, unknown>;
  address: string;
  sig: { con?: SigImage; ins?: SigImage; one?: SigImage };
  design: (DesignSign & { png: Uint8Array | null }) | null;
  draft: boolean;
  /** The fixed wording to print with (tests pass a verified single-signature declaration or guidance page). */
  wording?: { single?: ((amended: string) => string) | null; guidance?: { verified: boolean; title: string; paragraphs: string[] } };
};

/** Where the design part's answers will come from, on a draft waiting for the office's signature. */
const TO_FOLLOW = 'To follow: Heliaxis signs the design part';
const labelOf = (list: { key: string; label: string }[], v: unknown) => list.find((o) => o.key === v)?.label ?? null;
const markOf = (v: unknown): Mark => (v === 'yes' || v === 'done' || v === true ? 'tick' : v === 'no' || v === 'problem' ? 'cross' : v === 'na' ? 'na' : null);

/** A reading as printed: "0.45", ">999"; null when there isn't one. */
const reading = (v: unknown, unit?: string) => {
  const r = readingOf(v);
  if (r === null) return null;
  return `${isGt(v) ? `>${r}` : String(v)}${unit ? ` ${unit}` : ''}`;
};

export async function eicPdf(x: EicInput): Promise<Uint8Array> {
  const v = x.values;
  const s = (k: string) => (typeof v[k] === 'string' && (v[k] as string).trim() ? (v[k] as string).trim() : null);
  const single = x.route === 'eic_single';
  const amended = editionWords(x.edition);
  const draft = x.draft;
  const { boards, circuits } = boardsOf(v);
  const kit = await newDocument({
    code: 'EIC',
    title: single ? 'Electrical Installation Certificate (single signature)' : 'Electrical Installation Certificate',
    revision: EIC_REVISION,
    jobRef: x.jobRef,
    issued: x.issued,
    draft,
  });
  const img = async (b: Uint8Array | null | undefined): Promise<PDFImage | null> => (b ? kit.embed(b) : null);
  const [con, ins, one, des] = await Promise.all([img(x.sig.con?.png), img(x.sig.ins?.png), img(x.sig.one?.png), img(x.design?.png)]);

  kit.header({ meta: [['Certificate no.', x.ref ?? '–'], ['Date', longDate(x.issued)], ['Requirements for electrical installations', `BS 7671:2018 amended to ${amended}`]] });

  /* A, B: the client, the installation, description and extent. */
  band(kit, `${S.client}. Details of the client`);
  cells(kit, [{ label: 'Client', value: s('eic_client'), must: true, w: 1 }, { label: 'Address', value: s('eic_client_addr'), w: 2 }], draft);
  kit.gap(6);
  band(kit, `${S.installation}. Installation details`);
  cells(kit, [{ label: 'Installation address', value: x.address, must: true }], draft);
  cells(kit, [{ label: 'Description of the installation', value: s('eic_desc'), must: true }], draft);
  cells(kit, [{ label: 'Extent of the installation covered by this certificate', value: s('eic_extent'), must: true }], draft);
  choices(kit, 'The work is', WORK.map((w) => ({ label: w.label, on: v.eic_work === w.key })), 3);
  kit.gap(6);

  /* C: the declarations. */
  const exceptions = v.eic_exc === 'yes' ? (s('eic_exc_what') ?? '') : 'N/A';
  const departures = v.eic_dep === 'yes' ? (s('eic_dep_what') ?? '') : 'None';
  const designDepartures = single ? departures : x.design ? (x.design.departures?.trim() || 'None') : draft ? TO_FOLLOW : null;
  const name = s('eic_sig_name');
  band(kit, `${S.declarations}. Declarations`);
  if (single) {
    kit.paragraph('For the DESIGN, CONSTRUCTION, INSPECTION & TESTING of the installation (one person responsible for all three)', { bold: true });
    const wording = x.wording?.single !== undefined ? x.wording.single : DECLARATION.single;
    if (wording) kit.note(wording(amended));
    else for (const part of ['design', 'construction', 'inspection'] as const) kit.note(DECLARATION[part](amended));
    cells(kit, [{ label: DEPARTURES.design, value: departures, must: true }], draft);
    cells(kit, [{ label: `${DEPARTURES.exceptions}. ${DEPARTURES.riskAssessment}`, value: exceptions, w: 3 }, { label: 'Risk assessment attached', mark: v.eic_exc === 'yes' ? 'tick' : 'na' }], draft);
    kit.gap(3);
    kit.note(LIABILITY.one);
    signatureRow(kit, 'Designer, constructor and inspector', one, x.sig.one?.at ?? null, name, draft);
  } else {
    kit.paragraph('For DESIGN', { bold: true });
    kit.note(DECLARATION.design(amended));
    cells(kit, [{ label: DEPARTURES.design, value: designDepartures, must: true }], draft);
    cells(kit, [{ label: `${DEPARTURES.exceptions}. ${DEPARTURES.riskAssessment}`, value: exceptions, w: 3 }, { label: 'Risk assessment attached', mark: v.eic_exc === 'yes' ? 'tick' : 'na' }], draft);
    kit.gap(3);
    kit.note(LIABILITY.design);
    signatureRow(kit, 'Designer No. 1', des, x.design?.signed_at ?? null, x.design?.name ?? null, draft);
    kit.paragraph('For CONSTRUCTION', { bold: true });
    kit.note(DECLARATION.construction(amended));
    cells(kit, [{ label: DEPARTURES.other, value: departures, must: true }], draft);
    kit.gap(3);
    kit.note(LIABILITY.one);
    signatureRow(kit, 'Constructor', con, x.sig.con?.at ?? null, name, draft);
    kit.paragraph('For INSPECTION & TESTING', { bold: true });
    kit.note(DECLARATION.inspection(amended));
    cells(kit, [{ label: DEPARTURES.other, value: departures, must: true }], draft);
    kit.gap(3);
    kit.note(LIABILITY.one);
    signatureRow(kit, 'Inspector', ins, x.sig.ins?.at ?? null, name, draft);
  }

  /* D: next inspection (the designer's recommendation; no default). */
  const nextN = single ? readingOf(v.eic_next) : (x.design?.next_n ?? null);
  const nextUnit = single ? (v.eic_next_unit === 'months' ? 'months' : 'years') : (x.design?.next_unit ?? 'years');
  band(kit, `${S.next}. Next inspection`);
  if (nextN) kit.paragraph(NEXT_INSPECTION(`${nextN} ${nextN === 1 ? nextUnit.replace(/s$/, '') : nextUnit}`));
  else cells(kit, [{ label: 'Next inspection recommended within', value: !single && draft ? TO_FOLLOW : null, must: true }], draft);

  /* E: particulars of signatories. */
  band(kit, `${S.signatories}. Particulars of signatories to the Electrical Installation Certificate`);
  const me = { name, company: s('eic_sig_co'), address: s('eic_sig_addr'), postcode: s('eic_sig_pc'), tel: s('eic_sig_tel') };
  const who = (role: string, p: { name: string | null; company: string | null; address: string | null; postcode: string | null; tel: string | null } | null) =>
    cells(kit, [
      { label: role, value: p?.name ?? null, must: true, w: 1.2 },
      { label: 'Company', value: p?.company ?? null, must: true, w: 1.3 },
      { label: 'Address', value: p?.address ?? null, must: true, w: 2 },
      { label: 'Postcode', value: p?.postcode ?? null, must: true, w: 0.8 },
      { label: 'Tel', value: p?.tel ?? null, must: true, w: 1 },
    ], draft);
  if (single) who('Designer, constructor and inspector', me);
  else {
    if (x.design) who('Designer (No. 1)', { name: x.design.name, company: x.design.company, address: x.design.address, postcode: x.design.postcode, tel: x.design.tel });
    else cells(kit, [{ label: 'Designer (No. 1)', value: draft ? TO_FOLLOW : null, must: true }], draft);
    who('Constructor', me);
    who('Inspector', me);
  }
  kit.gap(6);

  /* F: supply characteristics and earthing. */
  band(kit, `${S.supply}. Supply characteristics and earthing arrangements`);
  choices(kit, 'Earthing arrangements', EARTHING.map((o) => ({ label: o.label, on: v.eic_earthing === o.key })), 6);
  choices(kit, 'Number and type of live conductors', LIVE.map((o) => ({ label: o.label, on: v.eic_live === o.key })), 4);
  const how = (k: string) => labelOf(HOW, v[k])?.toLowerCase() ?? null;
  cells(kit, [
    { label: `Nominal voltage, U / U₀ (1)`, value: v.eic_u ? `${reading(v.eic_u)} / ${reading(v.eic_u0)} V` : reading(v.eic_u0, 'V'), must: true },
    { label: 'Nominal frequency, f (1)', value: reading(v.eic_f, 'Hz'), must: true },
    { label: `Prospective fault current, Ipf (2)`, value: reading(v.eic_ipf, 'kA') && `${reading(v.eic_ipf, 'kA')}${how('eic_ipf_how') ? `, ${how('eic_ipf_how')}` : ''}`, must: true },
    { label: `External earth fault loop impedance, Ze (2)`, value: reading(v.eic_ze, 'Ω') && `${reading(v.eic_ze, 'Ω')}${how('eic_ze_how') ? `, ${how('eic_ze_how')}` : ''}`, must: true },
  ], draft);
  cells(kit, [
    { label: 'Supply protective device: BS (EN)', value: s('eic_sup_bs'), must: true },
    { label: 'Type', value: s('eic_sup_type') },
    { label: 'Rated current', value: reading(v.eic_sup_a, 'A'), must: true },
    { label: 'Confirmation of supply polarity', mark: v.eic_polarity === true ? 'tick' : null },
  ], draft);
  const sources = Array.isArray(v.eic_src) ? (v.eic_src as string[]).filter((t) => typeof t === 'string' && t.trim()) : [];
  cells(kit, [
    { label: 'Other sources of supply (as detailed on attached schedule)', mark: v.eic_other === 'yes' ? 'tick' : v.eic_other === 'no' ? 'na' : null, w: 1 },
    { label: 'Schedule of other sources of supply', value: v.eic_other === 'yes' ? sources.map((t, i) => `${i + 1}. ${t}`).join('\n') : 'None', must: v.eic_other === 'yes', w: 3 },
  ], draft);
  kit.note(`${SCHEDULE_NOTES.supply} ${SCHEDULE_NOTES.ipf}`);

  /* G: particulars of the installation at the origin. */
  band(kit, `${S.particulars}. Particulars of installation referred to in the certificate`);
  choices(kit, 'Means of earthing', [
    { label: 'Distributor’s facility', on: v.eic_means === 'distributor' },
    { label: 'Installation earth electrode', on: v.eic_means === 'electrode' },
  ], 2);
  const electrode = v.eic_means === 'electrode' || v.eic_earthing === 'tt';
  cells(kit, [
    { label: 'Maximum demand (load)', value: reading(v.eic_md, 'A'), must: true },
    { label: 'Earth electrode type', value: electrode ? s('eic_rod_type') : 'N/A', must: electrode },
    { label: 'Electrode location', value: electrode ? s('eic_rod_loc') : 'N/A', must: electrode },
    { label: 'Electrode resistance to earth, RA', value: electrode ? reading(v.eic_ra, 'Ω') : 'N/A', must: electrode },
  ], draft);
  cells(kit, [
    { label: 'Earthing conductor: material', value: labelOf(MATERIAL, v.eic_ec_mat), must: true },
    { label: 'csa', value: reading(v.eic_ec_csa, 'mm²'), must: true },
    { label: 'Connection / continuity verified', mark: v.eic_ec_ok === true ? 'tick' : null },
    { label: 'Main protective bonding: material', value: labelOf(MATERIAL, v.eic_mb_mat), must: true },
    { label: 'csa', value: reading(v.eic_mb_csa, 'mm²'), must: true },
    { label: 'Connection / continuity verified', mark: v.eic_mb_ok === true ? 'tick' : null },
  ], draft);
  cells(kit, BONDS.map((b) => ({ label: `To ${b.label.toLowerCase()}`, mark: markOf(v[b.key]) })), draft);
  if (v.eic_b_other === 'yes') cells(kit, [{ label: 'Bonding to other: specify', value: s('eic_b_other_what'), must: true }], draft);
  cells(kit, [
    { label: 'Main switch / switch-fuse / circuit-breaker / RCD (consumer’s means of isolation): location', value: s('eic_ms_loc'), must: true, w: 2.2 },
    { label: 'BS (EN)', value: s('eic_ms_bs'), must: true },
    { label: 'No. of poles', value: reading(v.eic_ms_poles), must: true, w: 0.7 },
    { label: 'Current rating', value: reading(v.eic_ms_a, 'A'), must: true, w: 0.8 },
    { label: 'Fuse / device rating or setting', value: reading(v.eic_ms_set, 'A') ?? 'N/A', w: 1 },
    { label: 'Voltage rating', value: reading(v.eic_ms_v, 'V'), must: true, w: 0.8 },
  ], draft);
  const rcd = v.eic_ms_rcd === 'yes';
  cells(kit, [
    { label: 'If RCD main switch: RCD type', value: rcd ? s('eic_ms_rcd_type') : 'N/A', must: rcd },
    { label: 'Rated residual operating current, IΔn', value: rcd ? reading(v.eic_ms_idn, 'mA') : 'N/A', must: rcd },
    { label: 'Rated time delay', value: rcd ? (reading(v.eic_ms_delay, 'ms') ?? 'N/A') : 'N/A' },
    { label: 'Measured operating time', value: rcd ? reading(v.eic_ms_time, 'ms') : 'N/A', must: rcd },
  ], draft);
  kit.gap(6);

  /* H: schedule of inspections. */
  band(kit, `${S.inspections}. Schedule of inspections`, '✓ inspected and acceptable · N/A not applicable');
  kit.checklist(INSPECTIONS.map((it, i) => ({ label: `${it.n}  ${it.label}`, mark: markOf(v[INSPECTION_KEY(i)]), must: true })));

  /* I: comments on the existing installation (an addition or alteration, Reg 644.1.2). */
  band(kit, `${S.comments}. Comments on existing installation`, 'In the case of an addition or alteration, see Regulation 644.1.2');
  const picked = Array.isArray(v.eic_cmt) ? (v.eic_cmt as string[]).map((k) => labelOf(COMMENTS, k)).filter((t): t is string => !!t) : [];
  const comments = [...picked, s('eic_cmt_more')].filter(Boolean).join('. ');
  cells(kit, [{ label: 'Comments', value: v.eic_work === 'new' ? 'N/A: new installation' : comments || null, must: v.eic_work !== 'new' }], draft);
  kit.gap(6);

  /* J: schedules. */
  band(kit, `${S.schedules}. Schedules`);
  kit.paragraph(SCHEDULES_VALID(boards.length * 2));
  kit.note(`Attached: ${boards.map((b) => `Schedule of Circuit Details and Schedule of Test Results for ${String(b.ref ?? 'the board')}`).join('; ') || 'none yet'}.`);
  const guidance = x.wording?.guidance ?? IET_GUIDANCE;
  if (!guidance.verified) kit.note('Guidance for recipients to follow.');

  /* The schedules, landscape, one pair per board. */
  for (const b of boards) {
    const mine = circuits.filter((c) => c.board === b.id);
    detailsSchedule(kit, x, b, mine, draft);
    testsSchedule(kit, x, b, mine, draft, single ? one : ins, single ? (x.sig.one?.at ?? null) : (x.sig.ins?.at ?? null), name);
  }

  /* The guidance for recipients, once its wording is verified. */
  if (guidance.verified) {
    kit.newPage();
    kit.section(guidance.title);
    for (const p of guidance.paragraphs) kit.paragraph(p);
  }
  return kit.save();
}

/* ── Schedules ──────────────────────────────────────────────────────────────── */

const DETAIL_COLS: Col[] = [
  { n: 1, head: 'Circuit number', share: 3.2 },
  { n: 2, head: 'Circuit description', share: 15 },
  { n: 3, head: 'Type of wiring (see code)', share: 4 },
  { n: 4, head: 'Reference method', share: 4.4 },
  { n: 5, head: 'Number of points served', share: 4.4 },
  { n: 6, head: 'Live (mm²)', share: 4 },
  { n: 7, head: 'cpc (mm²)', share: 4 },
  { n: 8, head: 'BS (EN)', share: 6.4 },
  { n: 9, head: 'Type', share: 3.4 },
  { n: 10, head: 'Rating (A)', share: 3.8 },
  { n: 11, head: 'Breaking capacity (kA)', share: 4.6 },
  { n: 12, head: 'Maximum permitted Zs (Ω)', share: 5 },
  { n: 13, head: 'BS (EN)', share: 6.4 },
  { n: 14, head: 'Type', share: 3.4 },
  { n: 15, head: 'IΔn (mA)', share: 3.8 },
  { n: 16, head: 'Rating (A)', share: 3.8 },
];
const DETAIL_GROUPS: Group[] = [
  { from: 6, to: 7, label: 'Conductor csa' },
  { from: 8, to: 11, label: 'Overcurrent protective devices' },
  { from: 13, to: 16, label: 'RCD' },
];
const TEST_COLS: Col[] = [
  { n: 17, head: 'Circuit number', share: 3.2 },
  { n: 18, head: 'r1 (line)', share: 3.8 },
  { n: 19, head: 'rn (neutral)', share: 3.8 },
  { n: 20, head: 'r2 (cpc)', share: 3.8 },
  { n: 21, head: '(R1 + R2)', share: 4 },
  { n: 22, head: 'R2', share: 3.6 },
  { n: 23, head: 'Test voltage (V)', share: 4 },
  { n: 24, head: 'Live – Live (MΩ)', share: 4.2 },
  { n: 25, head: 'Live – Earth (MΩ)', share: 4.2 },
  { n: 26, head: 'Polarity', share: 3.6 },
  { n: 27, head: 'Maximum measured Zs (Ω)', share: 5 },
  { n: 28, head: 'Disconnection time (ms)', share: 4.8 },
  { n: 29, head: 'Test button operation', share: 4.4 },
  { n: 30, head: 'Manual test button operation', share: 4.8 },
  { n: 31, head: 'Remarks (continue on a separate sheet if necessary)', share: 14 },
];
const TEST_GROUPS: Group[] = [
  { from: 18, to: 20, label: 'Ring final circuit continuity (Ω)' },
  { from: 21, to: 22, label: 'Continuity (Ω)' },
  { from: 23, to: 25, label: 'Insulation resistance' },
  { from: 28, to: 29, label: 'RCD' },
  { from: 30, to: 30, label: 'AFDD' },
];

const txt = (o: Rec, k: string) => (typeof o[k] === 'string' && (o[k] as string).trim() ? (o[k] as string).trim() : null);
const val = (o: Rec, k: string) => reading(o[k]) ?? txt(o, k);
const NA = 'N/A';

function scheduleTitle(kit: Kit, title: string, x: EicInput, b: Board) {
  kit.newPage({ landscape: true });
  kit.block(26, (d) => {
    d.text(title.toUpperCase(), d.x, d.top - 12, 11, { bold: true });
    d.right(`Certificate no. ${x.ref ?? '–'} · ${String(b.ref ?? 'Board')}`, d.x + d.width, d.top - 12, 8.5, { bold: true });
    d.line(d.x, d.top - 18, d.x + d.width, d.top - 18, { color: INK, t: 0.6 });
  });
}

function detailsSchedule(kit: Kit, x: EicInput, b: Board, list: Circuit[], draft: boolean) {
  scheduleTitle(kit, 'Schedule of circuit details', x, b);
  const spd = Array.isArray(b.spd) ? (b.spd as string[]) : [];
  cells(kit, [
    { label: 'DB reference', value: txt(b, 'ref'), must: true },
    { label: 'Location', value: txt(b, 'loc'), must: true, w: 1.6 },
    { label: 'Supplied from', value: txt(b, 'from'), must: true, w: 1.2 },
    { label: 'Distribution circuit OCPD: BS (EN)', value: txt(b, 'ocpd_bs') ?? NA, w: 1.2 },
    { label: 'Type', value: txt(b, 'ocpd_type') ?? NA, w: 0.6 },
    { label: 'Rating', value: reading(b.ocpd_a, 'A') ?? NA, w: 0.6 },
    { label: 'SPD type T1', mark: spd.includes('T1') ? 'tick' : null, w: 0.6 },
    { label: 'T2', mark: spd.includes('T2') ? 'tick' : null, w: 0.5 },
    { label: 'T3', mark: spd.includes('T3') ? 'tick' : null, w: 0.5 },
    { label: 'N/A', mark: spd.includes('na') ? 'tick' : null, w: 0.5 },
  ], draft);
  kit.gap(4);
  const rows: ColCell[][] = list.map((c) => {
    const r = c.rcd === 'yes';
    const wiring = txt(c, 'wiring');
    return [
      txt(c, 'n'),
      txt(c, 'desc'),
      wiring === 'O' ? `O: ${txt(c, 'wiring_other') ?? ''}` : wiring,
      txt(c, 'ref'),
      val(c, 'points'),
      val(c, 'csa_live'),
      val(c, 'csa_cpc'),
      txt(c, 'ocpd_bs'),
      txt(c, 'ocpd_type'),
      val(c, 'ocpd_a'),
      val(c, 'ocpd_ka'),
      val(c, 'zs_max'),
      r ? txt(c, 'rcd_bs') : NA,
      r ? txt(c, 'rcd_type') : NA,
      r ? val(c, 'rcd_idn') : NA,
      r ? val(c, 'rcd_a') : NA,
    ];
  });
  schedule(kit, DETAIL_COLS, DETAIL_GROUPS, rows);
  kit.note(`Codes for types of wiring: ${WIRING_CODES.map((w) => `${w.code} ${w.label}`).join(' · ')}`);
  kit.note(`${SCHEDULE_NOTES.spd} ${SCHEDULE_NOTES.zs}`);
}

function testsSchedule(kit: Kit, x: EicInput, b: Board, list: Circuit[], draft: boolean, sig: PDFImage | null, at: string | null, name: string | null) {
  scheduleTitle(kit, 'Schedule of test results', x, b);
  const spdNa = !Array.isArray(b.spd) || (b.spd as string[]).every((s) => s === 'na');
  const three = x.values.eic_live === 'ac_3p3w' || x.values.eic_live === 'ac_3p4w' || x.values.eic_live === 'ac_2p3w';
  cells(kit, [
    { label: 'DB reference', value: txt(b, 'ref'), must: true },
    { label: 'Zdb', value: reading(b.zdb, 'Ω'), must: true },
    { label: 'Ipf at DB', value: reading(b.ipf, 'kA'), must: true },
    { label: 'Confirmed: correct polarity', mark: b.pol === true ? 'tick' : null },
    { label: 'Phase sequence', mark: three ? (b.phase === true ? 'tick' : null) : 'na' },
    { label: 'SPD operational status confirmed', mark: spdNa ? 'na' : b.spd_ok === 'yes' ? 'tick' : b.spd_ok === 'na' ? 'na' : null },
  ], draft);
  const inst = (x.values.eic_inst ?? {}) as Record<string, string>;
  const t = (k: string) => (typeof inst[k] === 'string' && inst[k].trim() ? inst[k].trim() : 'N/A');
  cells(kit, [
    { label: 'Test instruments (serial or asset numbers): multi-functional', value: t('mft'), w: 1.4 },
    { label: 'Continuity', value: t('cont') },
    { label: 'Insulation resistance', value: t('ir') },
    { label: 'Earth fault loop impedance', value: t('efli') },
    { label: 'RCD', value: t('rcd') },
    { label: 'Earth electrode resistance', value: t('earth') },
  ], draft);
  kit.gap(4);
  const tick = (on: boolean): ColCell => ({ mark: on ? 'tick' : null });
  const rows: ColCell[][] = list.map((c) => {
    const ring = c.ring === 'yes';
    const r = c.rcd === 'yes';
    const remarks = [txt(c, 'remarks'), txt(c, 'zs_src') ? `Max Zs from: ${txt(c, 'zs_src')}` : null].filter(Boolean).join('. ') || null;
    return [
      txt(c, 'n'),
      ring ? val(c, 'r1') : NA,
      ring ? val(c, 'rn') : NA,
      ring ? val(c, 'r2') : NA,
      val(c, 'r12') ?? NA,
      val(c, 'r2only') ?? NA,
      val(c, 'ir_v'),
      val(c, 'ir_ll'),
      val(c, 'ir_le'),
      tick(c.pol === true),
      val(c, 'zs'),
      r ? val(c, 'rcd_ms') : NA,
      r ? { mark: c.rcd_btn === 'pass' ? 'tick' : c.rcd_btn === 'fail' ? 'cross' : null } : NA,
      c.afdd === 'yes' ? { mark: c.afdd_btn === 'pass' ? 'tick' : c.afdd_btn === 'fail' ? 'cross' : c.afdd_btn === 'na' ? 'na' : null } : NA,
      remarks,
    ];
  });
  schedule(kit, TEST_COLS, TEST_GROUPS, rows);
  kit.note(`${SCHEDULE_NOTES.spdStatus} ${SCHEDULE_NOTES.rcd}`);
  signatureRow(kit, 'Tested by', sig, at, name, draft);
}
