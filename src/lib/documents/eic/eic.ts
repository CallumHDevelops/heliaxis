import 'server-only';
import type { PDFImage } from 'pdf-lib';
import { IET_GUIDANCE } from '@/lib/site/fixed/iet-guidance';
import {
  B_LABELS,
  CERT_NO,
  CIRCUIT_SCHEDULE as CS,
  CONTINUATION_TITLE,
  DECLARATION,
  DEPARTURES,
  E_LABELS,
  EIC_FORM_BASIS,
  EIC_SUBTITLE,
  EIC_TITLE,
  editionWords,
  EXCEPTIONS,
  F_LABELS,
  G_LABELS,
  H_HEAD,
  IET_EIC_NOTES,
  INSPECTIONS,
  J_LINE,
  J_VALID,
  LIABILITY,
  NEXT_INSPECTION_BLANK,
  NEXT_INSPECTION_UNITS,
  PART_HEADINGS,
  PART_LEADS,
  REPORT_NO,
  RISK_ASSESSMENT_ATTACHED,
  ROLES,
  SECTION_TITLES as ST,
  SIGN_LINE,
  TEST_SCHEDULE as TS,
  WIRING_CODE_LINES,
  WIRING_CODES,
  type Part,
  type ScheduleGroup,
} from '@/lib/site/fixed/iet-eic';
import { BONDS, COMMENTS, EARTHING, INSPECTION_KEY, MATERIAL, MS_DEVICE, type DesignSign } from '@/lib/site/forms/electrician/eic';
import { boardsOf, isGt, readingOf, type Board, type Circuit, type Rec } from '@/lib/site/forms/electrician/eic-model';
import { HELIAXIS_COMPANY, HELIAXIS_PARTY } from '@/lib/subcontractors/agreement';
import { AMBER, MissingAnswer, newDocument, type Drawing, type Kit, type Variant } from '../pdf-kit';
import { blank, crossMark, dots, fitName, fitText, formDate, frame, hline, INK, plain, RED, rich, richCentre, richWidth, strike, tickBox, tickMark, value, vline, type Fitted, type Val } from './form';

/**
 * The Electrical Installation Certificate (SPEC 3.3, REGS 1.2): the IET's model form for BS 7671:2018+
 * A4:2026, filled in, without the IET logo (the IET's licence). Page 1 holds Sections A–D and page 2
 * Sections E–J, each a ruled frame in the form's order with its tick boxes and dotted blanks; then the
 * continuation sheets the form calls for (anything written that won't fit its box: the client, the
 * description, the extent, departures, exceptions and the risk assessment, the other sources of supply,
 * the main switch, a board's reference or location, a circuit's description or remarks, a signatory's
 * name or firm too long even for the second line it's given; nothing is cut short);
 * then for each board the Generic Schedule of Circuit Details
 * (columns 1–16) and the Generic Schedule of Test Results (17–31) in landscape, 12 ruled rows a sheet
 * with the form's headings, column numbers, codes and footnotes; then the form's Notes for the person
 * producing the Certificate and its Guidance for recipients. "Certificate No." is at the top of every
 * page, and the footer carries Heliaxis's details, the certificate number and "Page x of y".
 *
 * Branded (the owner: "Are we not branding the EIC?") with the documents' chrome round the form's own
 * body, which stays the IET's: the Heliaxis ® wordmark at the top of every page, the spark before
 * "Certificate No.", and the kit's dark title block at the foot (slimmer than a document's, so the
 * form keeps its size) with the reversed wordmark, the company line and "Certificate No. … · Page x
 * of y". Both of the kit's variants: digital (cream, what's filed and sent) and print (on request).
 *
 * Drawn on the PDF kit (newDocument, block, save), so the kit's page chrome reaches it too. A finished
 * certificate can't be made with a must unanswered (MissingAnswer). A draft (the design part not signed
 * yet, or the electrician still working) says so at the top of every page and "Not signed yet" where a
 * signature is to come, and is never shown to the customer.
 */

export const EIC_REVISION = 'Rev 2';

export type SigImage = { png: Uint8Array | null; at: string | null };
/** Photos the form asks to be attached: the risk assessment (Section C), the main switch's settings (Section G). */
export type Attachment = { slot: 'eic_exc_ra' | 'eic_ms_settings'; bytes: Uint8Array };
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
  attachments?: Attachment[];
  /** The guidance page to print (tests pass their own). */
  wording?: { guidance?: { verified: boolean; heading?: string; title: string; paragraphs: string[] } };
  /** 'digital' (the default: what's filed and sent) or 'print' (the ink saver, on request). */
  variant?: Variant;
};

/** Where the design part's answers will come from, on a draft waiting for the office's signature. */
const TO_FOLLOW = 'To follow: Heliaxis signs the design part';
const NOT_SIGNED = 'Not signed yet';
// The ruled frame runs closer to the edge than a document's, as the model form's does; the foot is the kit's title block (FORM_BANNER_H).
const MARGINS = { l: 28, r: 28, t: 16 };
/** Rows per schedule sheet, as the form has them. */
export const ROWS = 12;

/** The company line in the title block: who issued it and how to reach them, then the company's registration. */
const FOOTER_LINES = [
  `${HELIAXIS_COMPANY.tradingName} · ${HELIAXIS_COMPANY.addressLines.join(', ')} · ${HELIAXIS_COMPANY.phone} · ${HELIAXIS_COMPANY.email} · MCS ${HELIAXIS_COMPANY.mcsNumber}`,
  `Registered in England and Wales No. ${HELIAXIS_PARTY.companyNumber} · VAT ${HELIAXIS_PARTY.vatNumber}`,
];
/** The schedules are landscape: their width, for measuring remarks before those pages exist. */
const LANDSCAPE_W = 841.89 - MARGINS.l - MARGINS.r;

/** A reading as printed: "0.45", ">999"; null when there isn't one. */
const reading = (v: unknown) => {
  const r = readingOf(v);
  if (r === null) return null;
  return isGt(v) ? `>${r}` : String(v);
};
const labelOf = (list: { key: string; label: string }[], v: unknown) => list.find((o) => o.key === v)?.label ?? null;
const str = (o: Rec, k: string) => (typeof o[k] === 'string' && (o[k] as string).trim() ? (o[k] as string).trim() : null);

/* ── What the document is laid out from ───────────────────────────────────────── */

/** A paragraph of a continuation sheet: an answer (bold), or the form's own words (`form`, regular). */
type Para = string | { t: string; form: true };
type Cont = { n: number; section: string; title: string; paras: Para[]; images: Uint8Array[]; caption?: string };
type Numbers = { schedFrom: number; schedTo: number; total: number };
type HeadKind = 'cert1' | 'cert' | 'details' | 'tests' | 'plain';

export async function eicPdf(x: EicInput): Promise<Uint8Array> {
  // Laid out once to find where the schedules fall and how many pages there are (Section J, Note 5), then for real.
  const first = await render(x, null);
  const second = await render(x, first.numbers);
  return second.kit.save();
}

async function render(x: EicInput, numbers: Numbers | null): Promise<{ kit: Kit; numbers: Numbers }> {
  const v = x.values;
  const draft = x.draft;
  const single = x.route === 'eic_single';
  const amended = editionWords(x.edition);
  const certNo = x.ref ?? '–';
  const { boards, circuits } = boardsOf(v);
  let kind: HeadKind = 'cert1';

  const kit = await newDocument({
    code: 'EIC',
    title: 'Electrical Installation Certificate',
    revision: EIC_REVISION,
    jobRef: x.jobRef,
    issued: x.issued,
    draft,
    margins: MARGINS,
    pageHead: (d) => pageHead(d, kind, certNo, draft),
    // The title block: the company line, "Certificate No. … · Page x of y", and the form it's printed on under it.
    footer: { lines: FOOTER_LINES, ref: `Certificate No. ${certNo}`, label: '', sub: EIC_FORM_BASIS.replace(' (', '\n(') },
    variant: x.variant,
  });
  const img = async (b: Uint8Array | null | undefined): Promise<PDFImage | null> => (b ? kit.embed(b) : null);
  const [con, ins, one, des] = await Promise.all([img(x.sig.con?.png), img(x.sig.ins?.png), img(x.sig.one?.png), img(x.design?.png)]);

  /* Values: given, or a must ("Not answered" on a draft; a finished certificate stops). */
  const s = (k: string) => str(v, k);
  const given = (t: string | null | undefined): Val => (t === null || t === undefined || String(t).trim() === '' ? null : { s: String(t) });
  const must = (label: string, t: string | null | undefined): Val => {
    const g = given(t);
    if (g) return g;
    if (!draft) throw new MissingAnswer(label);
    return { s: 'Not answered', missing: true };
  };
  const NA: Val = { s: 'N/A' };
  const r = (k: string) => reading(v[k]);

  /* ── The continuation sheets, numbered before anything is drawn ─────────────── */
  const conts: Cont[] = [];
  const addCont = (section: string, title: string, paras: Para[], images: Uint8Array[] = [], caption?: string) => {
    const c = { n: conts.length + 1, section, title, paras, images, caption };
    conts.push(c);
    return c.n;
  };
  const measure = kit; // lines() measures in the document's own fonts
  const W = kit.width;
  const form = (t: string): Para => ({ t, form: true });

  // Section A: the client's name and address on the form's dotted line, a second line when it's long.
  const client = [s('eic_client'), s('eic_client_addr')].filter(Boolean).join(', ');
  const clientLines = client ? measure.lines(client, 8, W - 17, true) : [];
  const clientCont = clientLines.length > 2 ? addCont('A', `${ST.A} (continued)`, [client]) : null;
  // Section B: the description, two lines in its box.
  const descText = s('eic_desc');
  const descLines = descText ? wrapFirst(measure, descText, 7.8, W * 0.805 - 12 - kit.widthOf(B_LABELS.description, 7.8) - 6, W * 0.805 - 12) : [];
  const descCont = descLines.length > 2 ? addCont('B', `${ST.B}: ${plain(B_LABELS.description).replace(/:$/, '')} (continued)`, [form(B_LABELS.description), descText!]) : null;
  // Section B: the extent, about five lines in its box.
  const extent = s('eic_extent');
  const extentFirst = W * 0.805 - 12 - kit.widthOf(B_LABELS.extent, 7.8) - 6;
  const extentLines = extent ? wrapFirst(measure, extent, 7.8, extentFirst, W * 0.805 - 12) : [];
  const extentCont = extentLines.length > 5 ? addCont('B', `${ST.B}: ${plain(B_LABELS.extent).replace(/:$/, '')} (continued)`, [form(B_LABELS.extent), extent!]) : null;
  // Section C: departures longer than their two lines (the same words can serve more than one part).
  const depText = (part: Part): string | null => {
    if (part === 'design' && !single) return x.design?.departures?.trim() || null;
    return v.eic_dep === 'yes' ? s('eic_dep_what') : null;
  };
  const depFirst = W - 14 - kit.widthOf(DEPARTURES, 7.8) - 6;
  const depCont = new Map<string, number>();
  for (const part of ['design', 'construction', 'inspection'] as const) {
    const t = depText(part);
    if (t && !depCont.has(t) && wrapFirst(measure, t, 7.8, depFirst, W - 14).length > 2) depCont.set(t, addCont('C', `${ST.C}: ${DEPARTURES}`, [t]));
  }
  // Section C: the permitted exceptions beyond their three lines, and the risk assessment attached.
  const ra = (x.attachments ?? []).filter((a) => a.slot === 'eic_exc_ra').map((a) => a.bytes);
  const excText = v.eic_exc === 'yes' ? s('eic_exc_what') : null;
  const excLines = excText ? measure.lines(excText, 7.8, W - 120, true) : [];
  const excCont =
    v.eic_exc === 'yes' && (ra.length || excLines.length > 3)
      ? addCont('C', `${ST.C}: Details of permitted exceptions${ra.length ? `; ${RISK_ASSESSMENT_ATTACHED.toLowerCase()}` : ''}`, [form(EXCEPTIONS), excText ?? ''], ra, ra.length ? `${RISK_ASSESSMENT_ATTACHED}:` : undefined)
      : null;
  // What the exceptions box shows: up to three lines; the rest, and where the risk assessment is, on its sheet.
  const excShown = (() => {
    if (!excText) return [];
    if (!excCont) return excLines;
    const room = ra.length ? 2 : 3;
    const head = excLines.length > room ? [...excLines.slice(0, room - 1), `(continued on continuation sheet No. ${excCont})`] : excLines;
    return ra.length ? [...head, `Risk assessment: see continuation sheet No. ${excCont}`] : head;
  })();
  // Section C: each signatory's name in block capitals on their line, on two lines when it's long (the
  // second under the dotted line); one too long even for that is written in full on a continuation sheet.
  const name = s('eic_sig_name');
  const me: Person = { name, company: s('eic_sig_co'), address: s('eic_sig_addr'), postcode: s('eic_sig_pc'), tel: s('eic_sig_tel') };
  const signNames: [string, string | null][] = [[ROLES.designer1, single ? name : (x.design?.name ?? null)], [ROLES.constructor, name], [ROLES.inspector, name]];
  const signOver = signNames.filter(([role, n]) => n && !signFit(kit, W, role, n));
  const signCont = signOver.length ? addCont('C', `${ST.C}: ${SIGN_LINE.name}`, signOver.flatMap(([role, n]): Para[] => [form(`${role}:`), n!.toUpperCase()])) : null;
  // Section E: a long firm over two lines (its second beside the address); a name or firm too long for
  // its blank even so, in full on a continuation sheet.
  const designer: Person | 'tofollow' | null = single ? me : x.design ? { name: x.design.name, company: x.design.company, address: x.design.address, postcode: x.design.postcode, tel: x.design.tel } : draft ? 'tofollow' : null;
  const fits = new Map<Person, PersonFit>();
  const fitOf = (p: Person) => fits.get(p) ?? fits.set(p, personFit(kit, W, p)).get(p)!;
  const eOver = ([[E_LABELS.designer1, designer], [E_LABELS.constructor, me], [E_LABELS.inspector, me]] as const).flatMap(([label, p]): Para[] => {
    if (!p || p === 'tofollow') return [];
    const f = fitOf(p);
    return [...(p.name && !f.name ? [form(`${label}: ${E_LABELS.name}`), p.name] : []), ...(p.company && !f.firm ? [form(`${label}: ${E_LABELS.onBehalf}`), p.company] : [])];
  });
  const eCont = eOver.length ? addCont('E', `${ST.E} (continued)`, eOver) : null;
  // Section F: the other sources of supply.
  const sources = Array.isArray(v.eic_src) ? (v.eic_src as unknown[]).filter((t): t is string => typeof t === 'string' && !!t.trim()) : [];
  const srcCont = v.eic_other === 'yes' ? addCont('F', `${ST.F}: ${F_LABELS.otherSources}`, sources.length ? sources.map((t, i) => `${i + 1}. ${t}`) : ['Not answered']) : null;
  // Section G: the main switch: an "other" device type too long for its blank, and the protective device settings.
  const settings = (x.attachments ?? []).filter((a) => a.slot === 'eic_ms_settings').map((a) => a.bytes);
  const devOther = v.eic_ms_ocpd === 'yes' && v.eic_ms_dev === 'other' ? s('eic_ms_dev_other') : null;
  const devRoom = W * 0.327 - 13 - richWidth(kit, G_LABELS.deviceType, 7.1) - 3.5;
  const devLong = !!devOther && kit.widthOf(devOther, 6.4, true) > devRoom;
  const setCont =
    v.eic_ms_ocpd === 'yes' && (settings.length || devLong)
      ? addCont('G', `${ST.G}: Main switch`, [...(devLong ? [form(`${G_LABELS.ifOcpd}: ${G_LABELS.deviceType}:`), devOther!] : [])], settings, settings.length ? G_LABELS.attachSettings : undefined)
      : null;
  // Section I: two lines on the form.
  const picked = Array.isArray(v.eic_cmt) ? (v.eic_cmt as string[]).map((k) => labelOf(COMMENTS, k)).filter((t): t is string => !!t) : [];
  const comments = v.eic_work === 'new' ? 'N/A: new installation' : [...picked, s('eic_cmt_more')].filter(Boolean).join('. ') || null;
  const commentLines = comments ? measure.lines(comments, 7.8, W - 14, true) : [];
  const cmtCont = commentLines.length > 2 ? addCont('I', `${ST.I}`, [comments!]) : null;
  // Column 31: their remarks, where max Zs came from (footnote §), what a T3 SPD protects (footnote †), and what wiring "O" is.
  const remarksOf = (c: Circuit) =>
    [str(c, 'remarks'), str(c, 'zs_src'), str(c, 'spd_t3') ? `T3 SPD: ${str(c, 'spd_t3')}` : null, c.wiring === 'O' && str(c, 'wiring_other') ? `Type of wiring O: ${str(c, 'wiring_other')}` : null]
      .filter((t): t is string => !!t)
      .join('; ') || null;
  // The schedules' written entries that won't fit their boxes (a board's location, a circuit's description
  // beyond two lines, remarks beyond two lines) go over to one continuation sheet, word for word.
  const sched = scheduleLayout(measure, boards, circuits, remarksOf);
  const schedCont = sched.over.length
    ? addCont(
        'Schedules',
        `${CS.title} AND ${TS.title.replace('GENERIC ', '')}: entries continued`,
        sched.over.map((o) => `${o.where}, ${o.what}: ${o.text}`)
      )
    : null;

  /* ── Page 1: Sections A–D ─────────────────────────────────────────────────── */
  const departuresOf = (part: Part): Val => {
    if (part === 'design' && !single) return x.design ? { s: x.design.departures?.trim() || 'None' } : draft ? { s: TO_FOLLOW, missing: true } : must(DEPARTURES, null);
    return v.eic_dep === 'yes' ? must('Details of departures', s('eic_dep_what')) : v.eic_dep === 'no' ? { s: 'None' } : must('Any departures from BS 7671?', null);
  };
  const PARTS = ['design', 'construction', 'inspection'] as const;
  const declOf = (part: Part) => kit.lines(DECLARATION[part](amended), 7.8, W - 14);
  const depLinesOf = (dep: Val) => (dep && !dep.missing ? wrapFirst(kit, dep.s, 7.8, W - 14 - kit.widthOf(DEPARTURES, 7.8) - 6, W - 14) : ['']);
  // A–D stay on page 1, as on the form: when long departures make it run over, the roomiest boxes give way first.
  const twoClient = clientLines.length > 1;
  const sq = { a: twoClient ? 37 : 28, b: 51, h2: 70, eh: 58, lib: 33, sig: 22, d: 44 };
  {
    const natural =
      sq.a + sq.b + 37 + sq.h2 + 18 + sq.d + sq.eh +
      PARTS.reduce((t, part) => t + (16 + declOf(part).length * 9.8 + 5) + (17 + (Math.min(depLinesOf(departuresOf(part)).length, 2) - 1) * 9) + (sq.lib + (part === 'design' ? 2 : 1) * sq.sig + 3), 0);
    let over = natural - kit.room();
    const give = (k: keyof typeof sq, min: number, per = 1) => {
      if (over <= 0) return;
      const step = Math.min(sq[k] - min, Math.ceil(over / per));
      sq[k] -= step;
      over -= step * per;
    };
    give('eh', 46);
    give('d', 38);
    give('sig', 19, 4);
    give('lib', 30, 3);
    give('h2', 62);
    give('b', 47);
    give('a', twoClient ? 35 : 26);
  }

  // A: one dotted line, as on the form; a second when the name and address are long.
  kit.block(sq.a, (d) => {
    frame(d, d.x, d.top, d.width, sq.a);
    d.text(ST.A, d.x + 6, d.top - 11, 8.8, { bold: true });
    const cv = must('Details of the client', s('eic_client') ? client : null);
    const shown = cv?.missing ? [] : clientCont ? [clientLines[0], `(continued on continuation sheet No. ${clientCont})`] : clientLines;
    if (!twoClient) blank(d, { x: d.x + 6, y: d.top - sq.a + 5.5, end: d.x + d.width - 8, label: '', v: cv?.missing ? cv : given(shown[0]) });
    else shown.forEach((l, i) => blank(d, { x: d.x + 6, y: d.top - sq.a + 14.5 - i * 9, end: d.x + d.width - 8, label: '', v: given(l) }));
  });
  // B: the installation address
  kit.block(sq.b, (d) => {
    frame(d, d.x, d.top, d.width, sq.b);
    d.text(ST.B, d.x + 6, d.top - 11, 8.8, { bold: true });
    d.text(B_LABELS.address, d.x + 6, d.top - 21.5, 8.8, { bold: true });
    const addr = must('Installation address', x.address);
    const lines = addr && !addr.missing ? d.lines(addr.s, 8, d.width - 16, true) : [];
    const two = lines.length > 2 ? [lines[0], lines.slice(1).join(' ')] : lines;
    blank(d, { x: d.x + 6, y: d.top - sq.b + 18, end: d.x + d.width - 8, label: '', v: addr?.missing ? addr : given(two[0]) });
    blank(d, { x: d.x + 6, y: d.top - sq.b + 7, end: d.x + d.width - 8, label: '', v: given(two[1]) });
  });
  // B: description and extent, and what the work is
  {
    const h1 = 37;
    const h2 = sq.h2;
    kit.block(h1 + h2, (d) => {
      const L = d.width * 0.805;
      const X = d.x;
      frame(d, X, d.top, d.width, h1 + h2);
      vline(d, X + L, d.top, d.top - h1 - h2);
      hline(d, X, X + L, d.top - h1);
      d.text(B_LABELS.descExtent, X + 6, d.top - 10.5, 8.8, { bold: true });
      const desc = must('Description of installation', descText);
      const lw = d.widthOf(B_LABELS.description, 7.8);
      d.text(B_LABELS.description, X + 6, d.top - 21, 7.8);
      const dl = descCont ? [descLines[0], `(continued on continuation sheet No. ${descCont})`] : descLines;
      if (desc?.missing) value(d, desc, X + 6 + lw + 4, X + L - 6, d.top - 21);
      else {
        value(d, given(dl[0]), X + 6 + lw + 4, X + L - 6, d.top - 21, 7.8);
        if (dl[1]) value(d, given(dl[1]), X + 6, X + L - 6, d.top - 30.5, 7.8);
      }
      // Extent
      const t2 = d.top - h1;
      d.text(B_LABELS.extent, X + 6, t2 - 11, 7.8);
      const ew = d.widthOf(B_LABELS.extent, 7.8);
      if (!extent) value(d, must('Extent of installation covered by this Certificate', null), X + 6 + ew + 4, X + L - 6, t2 - 11);
      else {
        const shown = extentCont ? extentLines.slice(0, 4).concat(['(continued on continuation sheet No. ' + extentCont + ')']) : extentLines;
        shown.forEach((l, i) => value(d, given(l), i === 0 ? X + 6 + ew + 4 : X + 6, X + L - 6, t2 - 11 - i * 9.3, 7.8));
      }
      d.text(B_LABELS.useContinuation, X + 6, t2 - h2 + 6, 7.8);
      const sc = d.widthOf(B_LABELS.seeContinuation, 7.8);
      const scx = X + L - 150;
      d.text(B_LABELS.seeContinuation, scx, t2 - h2 + 6, 7.8);
      dots(d, scx + sc + 2, X + L - 8, t2 - h2 + 6);
      const bConts = [descCont, extentCont].filter((n): n is number => !!n);
      value(d, bConts.length ? { s: bConts.join(', ') } : NA, scx + sc + 5, X + L - 8, t2 - h2 + 6.6, 8);
      // New / adding / alteration
      const R = X + L;
      const RW = d.width - L;
      const rows: [string, string, number][] = [
        ['new', B_LABELS.work.new, h1],
        ['addition', B_LABELS.work.addition, h2 / 2],
        ['alteration', B_LABELS.work.alteration, h2 / 2],
      ];
      if (!draft && !['new', 'addition', 'alteration'].includes(String(v.eic_work))) throw new MissingAnswer('New installation / Adding to / Alteration');
      let top = d.top;
      rows.forEach(([k, label, h], i) => {
        if (i) hline(d, R, R + RW, top);
        const ls = d.lines(label, 7.8, RW - 30);
        const mid = top - h / 2;
        ls.forEach((l, j) => d.text(l, R + 6, mid + (ls.length - 1) * 4.6 - j * 9.2 - 2.6, 7.8));
        tickBox(d, R + RW - 18, mid - 4.25, v.eic_work === k);
        top -= h;
      });
    });
  }

  // C: certification signatories
  kit.block(18, (d) => {
    frame(d, d.x, d.top, d.width, 18);
    d.text(ST.C, d.x + 6, d.top - 12, 8.8, { bold: true });
  });
  type Signer = { img: PDFImage | null; at: string | null; name: string | null };
  const signerOf = (part: Part): Signer =>
    single
      ? { img: one, at: x.sig.one?.at ?? null, name }
      : part === 'design'
        ? { img: des, at: x.design?.signed_at ?? null, name: x.design?.name ?? null }
        : part === 'construction'
          ? { img: con, at: x.sig.con?.at ?? null, name }
          : { img: ins, at: x.sig.ins?.at ?? null, name };
  for (const part of PARTS) {
    // The declaration
    const decl = declOf(part);
    const hd = 16 + decl.length * 9.8 + 5;
    kit.block(hd, (d) => {
      frame(d, d.x, d.top, d.width, hd);
      d.text(PART_HEADINGS[part], d.x + 7, d.top - 12.5, 8.8, { bold: true });
      decl.forEach((l, i) => d.text(l, d.x + 7, d.top - 22.5 - i * 9.8, 7.8));
    });
    // Departures
    const dep = departuresOf(part);
    const lw = kit.widthOf(DEPARTURES, 7.8);
    const depLines = depLinesOf(dep);
    const dl = Math.min(depLines.length, 2);
    const hp = 17 + (dl - 1) * 9;
    kit.block(hp, (d) => {
      frame(d, d.x, d.top, d.width, hp);
      d.text(DEPARTURES, d.x + 7, d.top - 11.5, 7.8);
      if (dep?.missing) value(d, dep, d.x + 7 + lw + 4, d.x + d.width - 6, d.top - 11.5);
      else {
        const more = dep ? depCont.get(dep.s) : undefined;
        const shown = more ? [depLines[0], `(continued on continuation sheet No. ${more})`] : depLines.slice(0, 2);
        shown.forEach((l, i) => value(d, given(l), i === 0 ? d.x + 7 + lw + 4 : d.x + 7, d.x + d.width - 6, d.top - 11.5 - i * 9, 7.8));
      }
    });
    // Permitted exceptions (the design part only)
    if (part === 'design') {
      const exc = v.eic_exc === 'yes' ? must('Details of permitted exceptions', s('eic_exc_what')) : v.eic_exc === 'no' ? NA : must('Any permitted exceptions?', null);
      const EH = sq.eh;
      kit.block(EH, (d) => {
        frame(d, d.x, d.top, d.width, EH);
        d.text(EXCEPTIONS, d.x + 7, d.top - 12, 7.8);
        if (exc?.missing) value(d, exc, d.x + 7, d.x + d.width - 8, d.top - 23);
        else if (exc) {
          const shown = v.eic_exc === 'yes' ? excShown : [exc.s];
          shown.forEach((l, i) => value(d, given(l), d.x + 7, d.x + d.width - 110, d.top - 23 - i * 9.4, 7.8));
        }
        const rw = d.widthOf(RISK_ASSESSMENT_ATTACHED, 7.8);
        d.text(RISK_ASSESSMENT_ATTACHED, d.x + d.width - 24 - rw, d.top - EH + 9, 7.8);
        tickBox(d, d.x + d.width - 18, d.top - EH + 7.2, v.eic_exc === 'yes');
      });
    }
    // Liability, the lead-in and the signature line(s)
    const sigs: [Signer | null, string][] = part === 'design' ? [[signerOf('design'), ROLES.designer1], [null, ROLES.designer2]] : [[signerOf(part), part === 'construction' ? ROLES.constructor : ROLES.inspector]];
    const hl = sq.lib + sigs.length * sq.sig + 3;
    kit.block(hl, (d) => {
      frame(d, d.x, d.top, d.width, hl);
      d.text(LIABILITY, d.x + 7, d.top - sq.lib + 19.5, 7.8);
      d.text(PART_LEADS[part], d.x + 7, d.top - sq.lib + 5.5, 7.8);
      sigs.forEach(([who, role], i) => signLine(d, d.top - sq.lib - sq.sig + 8 - i * sq.sig, who, role, part));
    });
  }
  /** "Signature: …… Date: …… Name (IN BLOCK CAPITALS): …… Designer No 1", drawn in the order it reads. */
  function signLine(d: Drawing, y: number, who: Signer | null, role: string, part: Part) {
    const g = signGeom(d, d.width, role);
    const X = d.x + g.X;
    const end = d.x + g.end;
    const sx = d.x + g.sx;
    const dateX = d.x + g.dateX;
    const dx = d.x + g.dx;
    const nameX = d.x + g.nameX;
    const nx = d.x + g.nx;
    if (who && !draft && (!who.img || !who.name)) throw new MissingAnswer(`${role}: signature`);
    d.text(SIGN_LINE.signature, X, y, 7.8);
    dots(d, sx, dateX - 4, y);
    if (who?.img) d.image(who.img, sx + 2, y - 2.5, dateX - sx - 10, 17);
    else if (who) value(d, { s: part === 'design' && !single ? TO_FOLLOW : NOT_SIGNED, missing: true }, sx + 2, dateX - 6, y + 0.6, 7.4);
    d.text(SIGN_LINE.date, dateX, y, 7.8);
    dots(d, dx, nameX - 4, y);
    if (who) value(d, given(formDate(who.at)), dx + 2, nameX - 5, y + 0.6, 8);
    d.text(SIGN_LINE.name, nameX, y, 7.8);
    dots(d, nx, d.x + g.nameEnd + 1, y);
    // Designer No 2: Heliaxis's design has one designer. A long name: its second line under the dotted
    // line; one too long for that: where it's written in full.
    const fit = who?.name ? signFit(d, d.width, role, who.name) : null;
    if (!who) value(d, NA, d.x + g.nameFrom, d.x + g.nameEnd, y + 0.6, 8);
    else if (!who.name) value(d, null, d.x + g.nameFrom, d.x + g.nameEnd, y + 0.6, 8);
    else if (!fit) value(d, { s: CONT_NOTE(signCont).slice(1, -1) }, d.x + g.nameFrom, d.x + g.nameEnd, y + 0.6, 8);
    else fit.lines.forEach((l, k) => value(d, { s: l }, d.x + g.nameFrom, d.x + g.nameEnd, y + 0.6 - k * (fit.size + 1.2), fit.size));
    d.text(role, end - g.roleW, y, 7.8);
  }
  // D
  {
    const nextN = single ? readingOf(v.eic_next) : (x.design?.next_n ?? null);
    const unitGiven = single ? v.eic_next_unit : x.design?.next_unit;
    const unit: 'years' | 'months' | null = unitGiven === 'months' || unitGiven === 'years' ? unitGiven : null;
    if (!draft && !unit) throw new MissingAnswer('Next inspection: years or months');
    const nv: Val = nextN ? { s: String(nextN) } : !single && draft ? { s: 'To follow', missing: true } : must('Next inspection', null);
    kit.block(sq.d, (d) => {
      frame(d, d.x, d.top, d.width, sq.d);
      const t = d.top + (44 - sq.d) / 2;
      d.text(ST.D, d.x + 7, t - 13, 8.8, { bold: true });
      const lw = d.widthOf(NEXT_INSPECTION_BLANK, 7.8);
      d.text(NEXT_INSPECTION_BLANK, d.x + 7, t - 25.5, 7.8);
      dots(d, d.x + 7 + lw + 3, d.x + d.width - 8, t - 25.5);
      value(d, nv, d.x + 7 + lw + 6, d.x + d.width - 8, t - 24.9, 8.2);
      // "years/months." as the form prints it, the one that doesn't apply struck out.
      const y = t - 36;
      d.text(NEXT_INSPECTION_UNITS, d.x + 7, y, 7.8);
      if (unit === 'years') strike(d, d.x + 7 + d.widthOf('years/', 7.8), y, d.widthOf('months', 7.8), 7.8);
      else if (unit === 'months') strike(d, d.x + 7, y, d.widthOf('years', 7.8), 7.8);
    });
  }

  /* ── Page 2: Sections E–J (a section that won't fit goes over whole) ──────── */
  kind = 'cert';
  kit.newPage();
  const section = (blocks: [number, (d: Drawing) => void][]) => {
    const h = blocks.reduce((a, [bh]) => a + bh, 0);
    if (h > kit.room()) kit.newPage();
    for (const [bh, draw] of blocks) kit.block(bh, draw);
  };

  // E
  if (!designer) throw new MissingAnswer(`${E_LABELS.designer1}: particulars`);
  const PH = 33;
  section([
    [17, (d) => {
      frame(d, d.x, d.top, d.width, 17);
      d.text(ST.E, d.x + 7, d.top - 11.5, 8.8, { bold: true });
    }],
    [PH, (d) => person(d, E_LABELS.designer1, null, designer === 'tofollow' ? null : designer, designer === 'tofollow')],
    [PH, (d) => person(d, E_LABELS.designer2, E_LABELS.ifApplicable, 'na', false)],
    [PH, (d) => person(d, E_LABELS.constructor, null, me, false)],
    [PH, (d) => person(d, E_LABELS.inspector, null, me, false)],
  ]);
  function person(d: Drawing, label: string, sub: string | null, p: Person | 'na' | null, toFollow: boolean) {
    frame(d, d.x, d.top, d.width, PH);
    d.text(label, d.x + 7, d.top - 11, 8, { bold: true });
    if (sub) d.text(sub, d.x + 7, d.top - 20, 8);
    const X = d.x + PX.x;
    const end = d.x + d.width - PX.r;
    const f = (k: keyof Person, lab: string): Val => (p === 'na' ? (k === 'name' ? NA : null) : toFollow ? (k === 'name' ? { s: TO_FOLLOW, missing: true } : null) : must(`${label}: ${lab}`, p ? p[k] : null));
    // As it fits (personFit): the name on its line, the firm on one line or two, else where they're in full.
    const fit = p && p !== 'na' && !toFollow ? fitOf(p) : null;
    const shown = (v: Val, ft: Fitted | null | undefined, line = 0): { v: Val; vsize?: number } =>
      !v || v.missing || !fit ? { v } : ft ? { v: ft.lines[line] ? { s: ft.lines[line] } : null, vsize: ft.size } : line ? { v: null } : { v: { s: CONT_NOTE(eCont).slice(1, -1) } };
    const nv = f('name', 'name');
    const cv = f('company', 'for/on behalf of');
    blank(d, { x: X, y: d.top - 11, end: X + PX.nameEnd, label: E_LABELS.name, size: 8, ...shown(nv, fit?.name) });
    blank(d, { x: X + PX.firm, y: d.top - 11, end, label: E_LABELS.onBehalf, size: 8, ...shown(cv, fit?.firm) });
    const firm2 = fit?.firm && fit.firm.lines.length === 2 ? fit.firm : null;
    // A firm's second line beside the address, on its own dotted line under the first.
    if (firm2) blank(d, { x: X + PX.firm + d.widthOf(E_LABELS.onBehalf, 8) + 2, y: d.top - 20.5, end, label: '', size: 8, ...shown(cv, firm2, 1) });
    const addr = f('address', 'address');
    const al = addr && !addr.missing ? (fit?.addr ?? addressLines(d, d.width, addr.s, false)) : [];
    blank(d, { x: X, y: d.top - 20.5, end: firm2 ? X + PX.nameEnd : end, label: E_LABELS.address, v: addr?.missing ? addr : given(al[0]), size: 8 });
    blank(d, { x: X, y: d.top - 30, end: X + 228, label: '', v: given(al.slice(1).join(' ')), size: 8 });
    blank(d, { x: X + 232, y: d.top - 30, end: X + 340, label: E_LABELS.postcode, v: f('postcode', 'postcode'), size: 8 });
    blank(d, { x: X + 346, y: d.top - 30, end, label: E_LABELS.tel, v: f('tel', 'tel no'), size: 8 });
  }

  // F
  const live = String(v.eic_live ?? '');
  const three = ['ac_3p3w', 'ac_3p4w', 'ac_2p3w'].includes(live);
  const F = { e: 0.137, ac: 0.18, dc: 0.13, p: 0.328 };
  section([
    [14, (d) => {
      frame(d, d.x, d.top, d.width, 14);
      d.text(ST.F, d.x + 7, d.top - 10.2, 8.8, { bold: true });
    }],
    [94, (d) => {
      const X = d.x;
      const Wd = d.width;
      const xs = [X, X + Wd * F.e, X + Wd * (F.e + F.ac), X + Wd * (F.e + F.ac + F.dc), X + Wd * (F.e + F.ac + F.dc + F.p), X + Wd];
      const H = 94;
      const headH = 21;
      frame(d, X, d.top, Wd, H);
      hline(d, X, X + Wd, d.top - headH);
      for (const i of [1, 3, 4]) vline(d, xs[i], d.top, d.top - H);
      vline(d, xs[2], d.top - headH, d.top - H + 15);
      // Column heads
      richCentre(d, 'Earthing', xs[0], xs[1] - xs[0], d.top - 9, 7.8);
      richCentre(d, 'arrangements', xs[0], xs[1] - xs[0], d.top - 17.5, 7.8);
      richCentre(d, F_LABELS.live, xs[1], xs[3] - xs[1], d.top - 13.5, 7.8, { bold: true });
      richCentre(d, F_LABELS.params, xs[3], xs[4] - xs[3], d.top - 13.5, 7.8, { bold: true });
      richCentre(d, F_LABELS.device, xs[4], xs[5] - xs[4], d.top - 13.5, 7.8, { bold: true });
      if (!draft && !EARTHING.some((o) => o.key === v.eic_earthing)) throw new MissingAnswer(F_LABELS.earthing);
      // Earthing arrangements
      EARTHING.forEach((o, i) => {
        const y = d.top - headH - 11 - i * 10.4;
        d.text(o.label, X + 4, y, 7.6);
        tickBox(d, xs[1] - 13, y - 1.2, v.eic_earthing === o.key, 7.8);
      });
      // Live conductors: AC and DC
      if (!draft && !live) throw new MissingAnswer(F_LABELS.live);
      const acOn = live.startsWith('ac_');
      const dcOn = live.startsWith('dc_') || live === 'other';
      const acKeys = ['ac_1p2w', 'ac_2p3w', 'ac_3p3w', 'ac_3p4w'];
      const dcKeys = ['dc_2w', 'dc_3w', 'other'];
      const top = d.top - headH;
      d.text(F_LABELS.ac, (xs[1] + xs[2]) / 2 - 10, top - 10, 7.6);
      tickBox(d, (xs[1] + xs[2]) / 2 + 2, top - 11.2, acOn, 7.8);
      d.text(F_LABELS.dc, (xs[2] + xs[3]) / 2 - 10, top - 10, 7.6);
      tickBox(d, (xs[2] + xs[3]) / 2 + 2, top - 11.2, dcOn, 7.8);
      F_LABELS.acOptions.forEach((l, i) => {
        const y = top - 21 - i * 10.4;
        d.text(l, xs[1] + 5, y, 7.6);
        tickBox(d, xs[2] - 14, y - 1.2, live === acKeys[i], 7.8);
      });
      F_LABELS.dcOptions.forEach((l, i) => {
        const y = top - 21 - i * 10.4;
        d.text(l, xs[2] + 6, y, 7.6);
        tickBox(d, xs[3] - 14, y - 1.2, live === dcKeys[i], 7.8);
      });
      hline(d, xs[1], xs[3], d.top - H + 15);
      d.text(F_LABELS.polarity, xs[1] + 5, d.top - H + 4.8, 7.6);
      tickBox(d, xs[3] - 14, d.top - H + 3.6, v.eic_polarity === true, 7.8);
      if (!draft && v.eic_polarity !== true) throw new MissingAnswer(F_LABELS.polarity);
      // Nature of supply parameters
      const P = xs[3] + 5;
      const PE = xs[4] - 5;
      const u0 = r('eic_u0');
      const uv = three ? (r('eic_u') && u0 ? `${r('eic_u')}/${u0}` : null) : u0;
      blank(d, { x: P, y: top - 10, end: PE, label: F_LABELS.u, v: must('Nominal voltage, U/U0', uv), unit: 'V', size: 7.6 });
      blank(d, { x: P, y: top - 21, end: PE, label: F_LABELS.f, v: must('Nominal frequency, f', r('eic_f')), unit: 'Hz', size: 7.6 });
      blank(d, { x: P, y: top - 32, end: PE, label: F_LABELS.ipf, v: must('Prospective fault current, Ipf', r('eic_ipf')), unit: 'kA', size: 7.6 });
      d.text(F_LABELS.ze1, P, top - 42, 7.6);
      blank(d, { x: P, y: top - 51, end: PE, label: F_LABELS.ze2, v: must('External earth fault loop impedance, Ze', r('eic_ze')), unit: 'Ω', size: 7.6 });
      d.text(F_LABELS.note, P, top - 62, 5.9, { italic: true });
      // Supply protective device
      const Q = xs[4] + 5;
      const QE = xs[5] - 5;
      blank(d, { x: Q, y: top - 10, end: QE, label: F_LABELS.bs, v: must('Supply protective device: BS (EN)', s('eic_sup_bs')), size: 7.6 });
      blank(d, { x: Q, y: top - 21, end: QE, label: F_LABELS.type, v: given(s('eic_sup_type')) ?? NA, size: 7.6 });
      blank(d, { x: Q, y: top - 32, end: QE, label: F_LABELS.rated, v: must('Supply protective device: rated current', r('eic_sup_a')), unit: 'A', size: 7.6 });
      blank(d, { x: Q, y: top - 43, end: QE, label: F_LABELS.breaking, v: must('Supply protective device: breaking capacity', r('eic_sup_ka')), unit: 'kA', size: 7.6 });
    }],
    [14, (d) => {
      frame(d, d.x, d.top, d.width, 14);
      d.text(F_LABELS.otherSources, d.x + 6, d.top - 10, 7.8);
      const w = d.widthOf(F_LABELS.otherSources, 7.8);
      tickBox(d, d.x + 6 + w + 6, d.top - 11.2, v.eic_other === 'yes', 7.8);
      if (srcCont) value(d, { s: `Continuation sheet No. ${srcCont}` }, d.x + w + 30, d.x + d.width - 8, d.top - 10, 7.6);
      else if (v.eic_other === 'no') value(d, NA, d.x + w + 30, d.x + d.width - 8, d.top - 10, 7.6);
    }],
  ]);

  // G
  const electrode = v.eic_means === 'electrode' || v.eic_earthing === 'tt';
  const msOcpd = v.eic_ms_ocpd === 'yes';
  const msRcd = v.eic_ms_rcd === 'yes';
  section([
    [14, (d) => {
      frame(d, d.x, d.top, d.width, 14);
      d.text(ST.G, d.x + 7, d.top - 10.2, 8.8, { bold: true });
    }],
    [70, (d) => {
      const X = d.x;
      const L = d.width * 0.247;
      frame(d, X, d.top, d.width, 70);
      vline(d, X + L, d.top, d.top - 70);
      hline(d, X + L, X + d.width, d.top - 22);
      richCentre(d, G_LABELS.means, X, L, d.top - 11, 7.8, { bold: true });
      if (!draft && !['distributor', 'electrode'].includes(String(v.eic_means))) throw new MissingAnswer(G_LABELS.means);
      d.text(G_LABELS.distributor, X + 5, d.top - 25, 7.6);
      tickBox(d, X + L - 18, d.top - 26.2, v.eic_means === 'distributor', 7.8);
      d.text(G_LABELS.electrode, X + 5, d.top - 37, 7.6);
      tickBox(d, X + L - 18, d.top - 38.2, v.eic_means === 'electrode', 7.8);
      const R = X + L + 6;
      const RE = X + d.width - 7;
      richCentre(d, G_LABELS.demandHead, X + L, d.width - L, d.top - 9, 7.8, { bold: true });
      // Maximum demand (load) ......kVA / A (Delete as appropriate)
      const unitText = G_LABELS.demandUnit;
      const uw = d.widthOf(unitText, 7.6);
      blank(d, { x: R, y: d.top - 18.5, end: RE - uw - 3, label: G_LABELS.demand, v: must('Maximum demand (load)', r('eic_md')), size: 7.6 });
      const ux = RE - uw;
      d.text(unitText, ux, d.top - 18.5, 7.6);
      if (v.eic_md_unit === 'A') strike(d, ux, d.top - 18.5, d.widthOf('kVA', 7.6), 7.6);
      else if (v.eic_md_unit === 'kVA') strike(d, ux + d.widthOf('kVA / ', 7.6), d.top - 18.5, d.widthOf('A', 7.6), 7.6);
      else if (!draft) throw new MissingAnswer('Maximum demand: kVA or A');
      // Details of Installation Earth Electrode (where applicable)
      const hw = d.widthOf(`${G_LABELS.electrodeHead} `, 7.8, true) + d.widthOf(G_LABELS.electrodeWhere, 7.8);
      const hx = X + L + (d.width - L - hw) / 2;
      d.text(`${G_LABELS.electrodeHead} `, hx, d.top - 31, 7.8, { bold: true });
      d.text(G_LABELS.electrodeWhere, hx + d.widthOf(`${G_LABELS.electrodeHead} `, 7.8, true), d.top - 31, 7.8);
      blank(d, { x: R, y: d.top - 41, end: RE, label: G_LABELS.electrodeType, v: electrode ? must('Earth electrode: type', s('eic_rod_type')) : NA, size: 7.6 });
      blank(d, { x: R, y: d.top - 51, end: RE, label: G_LABELS.electrodeLoc, v: electrode ? must('Earth electrode: location', s('eic_rod_loc')) : NA, size: 7.6 });
      const lab = `${G_LABELS.electrodeR}`;
      const lw = rich(d, lab, R, d.top - 61, 7.6);
      if (electrode) {
        // Strike out RA or Ze, whichever wasn't measured.
        const ra = richWidth(d, 'R_{A}', 7.6);
        const before = richWidth(d, 'Electrode resistance/impedance, ', 7.6);
        if (v.eic_ra_kind === 'RA') strike(d, R + before + ra + d.widthOf('/', 7.6), d.top - 61, richWidth(d, 'Z_{e}', 7.6), 7.6);
        else if (v.eic_ra_kind === 'Ze') strike(d, R + before, d.top - 61, ra, 7.6);
        else if (!draft) throw new MissingAnswer('Electrode resistance/impedance: RA or Ze');
      }
      const nx = R + lw + 2;
      d.text(G_LABELS.electrodeRNote, nx, d.top - 61, 5.9);
      blank(d, { x: nx + d.widthOf(G_LABELS.electrodeRNote, 5.9), y: d.top - 61, end: RE, label: '', v: electrode ? must('Electrode resistance/impedance', r('eic_ra')) : NA, unit: 'Ω', size: 7.6 });
    }],
    [16, (d) => {
      frame(d, d.x, d.top, d.width, 16);
      d.text(G_LABELS.conductorsHead, d.x + 7, d.top - 11.5, 8.6, { bold: true });
    }],
    [17, (d) => conductorRow(d, 17, [G_LABELS.earthingConductor], 'eic_ec')],
    [23, (d) => conductorRow(d, 23, ['Main protective', 'bonding conductors'], 'eic_mb')],
    [28, (d) => {
      frame(d, d.x, d.top, d.width, 28);
      const X = d.x + 6;
      const avail = d.width - 12;
      let fs = 7.6;
      const itemW = (l: string, i: number, f: number) => d.widthOf(l, f) + 3 + 7.8 + (v[BONDS[i].key] === 'na' ? 2 + d.widthOf('N/A', 6, true) : 0);
      while (fs > 6.4 && G_LABELS.bonds.reduce((a, l, i) => a + itemW(l, i, fs), 0) + 4 * 8 > avail) fs -= 0.1;
      const gap = (avail - G_LABELS.bonds.reduce((a, l, i) => a + itemW(l, i, fs), 0)) / 4;
      let bx = X;
      G_LABELS.bonds.forEach((l, i) => {
        const mark = v[BONDS[i].key];
        if (!draft && !['yes', 'no', 'na'].includes(String(mark))) throw new MissingAnswer(l);
        d.text(l, bx, d.top - 11, fs);
        const lw = d.widthOf(l, fs);
        tickBox(d, bx + lw + 3, d.top - 12.2, mark === 'yes', 7.8);
        if (mark === 'na') d.text('N/A', bx + lw + 13, d.top - 11, 6, { bold: true });
        bx += itemW(l, i, fs) + gap;
      });
      d.text(G_LABELS.toOther, X, d.top - 23.5, 7.6);
      const tw = d.widthOf(G_LABELS.toOther, 7.6);
      const other = v.eic_b_other;
      tickBox(d, X + tw + 3, d.top - 24.7, other === 'yes', 7.8);
      blank(d, { x: X + tw + 18, y: d.top - 23.5, end: d.x + d.width - 7, label: G_LABELS.specify, v: other === 'yes' ? must('To other: specify', s('eic_b_other_what')) : NA, size: 7.6 });
    }],
    [14, (d) => {
      frame(d, d.x, d.top, d.width, 14);
      d.text(G_LABELS.mainSwitch, d.x + 7, d.top - 10.2, 8.6, { bold: true });
    }],
    [74, (d) => {
      const X = d.x;
      const c1 = d.width * 0.34;
      const c2 = d.width * 0.327;
      frame(d, X, d.top, d.width, 74);
      vline(d, X + c1, d.top, d.top - 74);
      vline(d, X + c1 + c2, d.top, d.top - 74);
      const A = X + 6;
      const AE = X + c1 - 7;
      const loc = must('Main switch: location', s('eic_ms_loc'));
      const ll = loc && !loc.missing ? wrapFirst(d, loc.s, 7.8, AE - A - d.widthOf(G_LABELS.location, 7.6) - 6, AE - A) : [];
      blank(d, { x: A, y: d.top - 11, end: AE, label: G_LABELS.location, v: loc?.missing ? loc : given(ll[0]), size: 7.6 });
      blank(d, { x: A, y: d.top - 21, end: AE, label: '', v: given(ll.slice(1).join(' ')), size: 7.6 });
      blank(d, { x: A, y: d.top - 31, end: AE, label: G_LABELS.bs, v: must('Main switch: BS (EN)', s('eic_ms_bs')), size: 7.6 });
      blank(d, { x: A, y: d.top - 41, end: AE, label: G_LABELS.poles, v: must('Main switch: no of poles', r('eic_ms_poles')), size: 7.6 });
      blank(d, { x: A, y: d.top - 51, end: AE, label: G_LABELS.current, v: must('Main switch: current rating', r('eic_ms_a')), unit: 'A', size: 7.6 });
      blank(d, { x: A, y: d.top - 61, end: AE, label: G_LABELS.voltage, v: must('Main switch: voltage rating', r('eic_ms_v')), unit: 'V', size: 7.6 });
      // If overcurrent protective device
      const B = X + c1 + 6;
      const BE = X + c1 + c2 - 7;
      d.text(G_LABELS.ifOcpd, B, d.top - 11, 7.8, { bold: true });
      // An "other" type too long for the form's short blank is stated on the continuation sheet, named below.
      const dev = msOcpd ? (v.eic_ms_dev === 'other' ? (devLong ? null : must('Device type: other', devOther)) : must('Device type', labelOf(MS_DEVICE, v.eic_ms_dev))) : NA;
      blank(d, { x: B, y: d.top - 21, end: BE, label: G_LABELS.deviceType, v: dev, size: 7.1, vsize: 7.6, gap: 1 });
      blank(d, { x: B, y: d.top - 31, end: BE, label: G_LABELS.deviceSetting, v: msOcpd ? must('Device rating/setting', r('eic_ms_set')) : NA, unit: 'A', size: 7.6 });
      blank(d, { x: B, y: d.top - 41, end: BE, label: G_LABELS.breaking, v: msOcpd ? must('Breaking capacity', r('eic_ms_ka')) : NA, unit: 'kA', size: 7.6 });
      d.lines(G_LABELS.attachSettings, 7.6, BE - B).forEach((l, i) => d.text(l, B, d.top - 55 - i * 9, 7.6));
      const what = devLong ? (settings.length ? 'Device type and settings: see' : 'Device type: see') : 'See';
      if (setCont) value(d, { s: `${what} continuation sheet No. ${setCont}` }, B, BE, d.top - 71.5 + 0.6, 6.6);
      // If RCD main switch
      const C = X + c1 + c2 + 6;
      const CE = X + d.width - 7;
      d.text(G_LABELS.ifRcd, C, d.top - 11, 7.8, { bold: true });
      blank(d, { x: C, y: d.top - 21, end: CE, label: G_LABELS.rcdType, v: msRcd ? must('RCD type', s('eic_ms_rcd_type')) : NA, size: 7.6 });
      blank(d, { x: C, y: d.top - 31, end: CE, label: G_LABELS.idn, v: msRcd ? must('Rated residual operating current (IΔn)', r('eic_ms_idn')) : NA, unit: 'mA', size: 7.6 });
      blank(d, { x: C, y: d.top - 41, end: CE, label: G_LABELS.delay, v: msRcd ? (given(r('eic_ms_delay')) ?? NA) : NA, unit: 'ms', size: 7.6 });
      blank(d, { x: C, y: d.top - 51, end: CE, label: G_LABELS.opTime, v: msRcd ? must('Measured operating time', r('eic_ms_time')) : NA, unit: 'ms', size: 7.6 });
      blank(d, { x: C, y: d.top - 61, end: CE, label: G_LABELS.breaking, v: msRcd ? must('RCD breaking capacity', r('eic_ms_rcd_ka')) : NA, unit: 'kA', size: 7.6 });
    }],
  ]);
  function conductorRow(d: Drawing, h: number, label: string[], k: 'eic_ec' | 'eic_mb') {
    const X = d.x;
    frame(d, X, d.top, d.width, h);
    const R = X + d.width * 0.73;
    vline(d, R, d.top, d.top - h);
    const y = d.top - h / 2 - 2.6 + (label.length - 1) * 4.5;
    label.forEach((l, i) => d.text(l, X + 7, y - i * 9, 7.6));
    const yy = d.top - h / 2 - 2.6;
    const what = k === 'eic_ec' ? 'Earthing conductor' : 'Main protective bonding conductors';
    // "Other": the material they stated.
    const mat = v[`${k}_mat`] === 'other' ? must(`${what}: other material`, s(`${k}_mat_other`)) : must(`${what}: material`, labelOf(MATERIAL, v[`${k}_mat`]));
    blank(d, { x: X + 106, y: yy, end: X + 250, label: G_LABELS.material, v: mat, size: 7.6 });
    blank(d, { x: X + 258, y: yy, end: R - 8, label: G_LABELS.csa, v: must(`${what}: csa`, r(`${k}_csa`)), unit: 'mm²', size: 7.6 });
    d.text(G_LABELS.verified, R + 6, yy, 7.6);
    tickBox(d, X + d.width - 16, yy - 1.2, v[`${k}_ok`] === true, 7.8);
    if (!draft && v[`${k}_ok`] !== true) throw new MissingAnswer(`${what}: connection / continuity verified`);
  }

  // H
  {
    const left = INSPECTIONS.slice(0, 7);
    const right = INSPECTIONS.slice(7);
    const rowH = (n: number) => 3 + n * 9.2;
    const lines = (it: (typeof INSPECTIONS)[number]) => (it.lines ? 2 : 1);
    const leftH = left.reduce((a, it) => a + rowH(lines(it)), 0);
    const rightH = right.reduce((a, it) => a + rowH(lines(it)), 0);
    const bodyH = Math.max(leftH, rightH);
    const headH = 21;
    section([
      [16, (d) => {
        frame(d, d.x, d.top, d.width, 16);
        d.text(ST.H, d.x + 7, d.top - 11.2, 8.8, { bold: true });
      }],
      [headH + bodyH, (d) => {
        const half = d.width / 2;
        frame(d, d.x, d.top, d.width, headH + bodyH);
        for (const [i, list, h] of [[0, left, leftH], [1, right, rightH]] as const) {
          const X = d.x + i * half;
          const cols = [X, X + 36, X + half - 52, X + half];
          vline(d, X, d.top, d.top - headH - bodyH, 0.9);
          vline(d, cols[1], d.top, d.top - headH - bodyH);
          vline(d, cols[2], d.top, d.top - headH - bodyH);
          hline(d, X, X + half, d.top - headH);
          richCentre(d, H_HEAD.item, cols[0], cols[1] - cols[0], d.top - 13, 7.6);
          if (i === 1) richCentre(d, H_HEAD.description, cols[1], cols[2] - cols[1], d.top - 13, 7.6);
          richCentre(d, H_HEAD.outcome, cols[2], cols[3] - cols[2], d.top - 9, 7.6);
          const ow = d.widthOf(H_HEAD.outcomeMarks, 7.6) + 9;
          const ox = cols[2] + (cols[3] - cols[2] - ow) / 2;
          tickMark(d, ox, d.top - 18.5, 7.2);
          d.text(H_HEAD.outcomeMarks, ox + 9, d.top - 18, 7.6);
          // Rows, stretched so both halves end together.
          const stretch = (bodyH - h) / list.length;
          let y = d.top - headH;
          list.forEach((it, j) => {
            const n = lines(it);
            const rh = rowH(n) + stretch;
            const idx = INSPECTIONS.indexOf(it);
            const mark = v[INSPECTION_KEY(idx)];
            if (!draft && !['done', 'na', 'yes'].includes(String(mark))) throw new MissingAnswer(`${it.n} ${it.label}`);
            if (j) hline(d, X, X + half, y, 0.5);
            richCentre(d, it.n, cols[0], cols[1] - cols[0], y - 9.6, 7.6);
            (it.lines ?? [it.label]).forEach((l, k2) => d.text(l, cols[1] + 5, y - 9.6 - k2 * 9.2, 7.6));
            const cx = (cols[2] + cols[3]) / 2;
            if (mark === 'done' || mark === 'yes') tickMark(d, cx - 4.5, y - rh / 2 - 4, 9);
            else if (mark === 'na') richCentre(d, 'N/A', cols[2], cols[3] - cols[2], y - rh / 2 - 3, 7.8, { bold: true });
            else if (mark === 'problem') crossMark(d, cx - 4.5, y - rh / 2 - 4, 9);
            else d.text('Not answered', cols[2] + 3, y - rh / 2 - 3, 6, { color: RED, italic: true });
            y -= rh;
          });
        }
      }],
    ]);
  }

  // I
  section([
    [36, (d) => {
      frame(d, d.x, d.top, d.width, 36);
      d.text(ST.I, d.x + 7, d.top - 11, 8.8, { bold: true });
      d.text(` ${ST.I_NOTE}`, d.x + 7 + d.widthOf(ST.I, 8.8, true), d.top - 11, 7.8);
      const c = v.eic_work === 'new' ? { s: comments! } : must(ST.I, comments);
      const ls = c && !c.missing ? (cmtCont ? [commentLines[0], `(continued on continuation sheet No. ${cmtCont})`] : commentLines) : [];
      blank(d, { x: d.x + 7, y: d.top - 22, end: d.x + d.width - 7, label: '', v: c?.missing ? c : given(ls[0]) });
      blank(d, { x: d.x + 7, y: d.top - 31.5, end: d.x + d.width - 7, label: '', v: given(ls[1]) });
    }],
  ]);

  // J
  {
    const schedSheets = boards.reduce((a, b) => a + 2 * Math.max(1, Math.ceil(circuits.filter((c) => c.board === b.id).length / ROWS)), 0);
    const sections = [...new Set(conts.map((c) => c.section))].join(', ');
    const pages = numbers ? (numbers.schedFrom === numbers.schedTo ? `page ${numbers.schedFrom}` : `pages ${numbers.schedFrom}–${numbers.schedTo}`) : 'pages –';
    // The form's line with its four blanks filled, the fills in bold. Section H is this certificate's
    // Schedule of Inspection (Note 2), so it counts as one; there is never a separate one.
    const SEP = '\u0001';
    const fill = (t: string) => `${SEP}${t}${SEP}`;
    const parts = J_LINE(fill(String(conts.length)), fill(sections || 'N/A'), fill('1'), fill(String(schedSheets)))
      .split(SEP)
      .map((t, i): [string, boolean] => [t, i % 2 === 1]);
    // One line, as on the form: a long list of sections makes the words smaller, never a second line over the next.
    const jw = W - 14;
    const width = (sz: number) => parts.reduce((a, [t, b]) => a + kit.widthOf(t, sz, b), 0);
    let js = 7.6;
    while (js > 6.2 && width(js) > jw) js -= 0.2;
    const jLines = flowLines(kit, parts, jw, js);
    const jh = 52 + (jLines - 1) * 9.2;
    section([
      [jh, (d) => {
        frame(d, d.x, d.top, d.width, jh);
        d.text(ST.J, d.x + 7, d.top - 11.2, 8.8, { bold: true });
        flow(d, parts, d.x + 7, d.top - 22, d.width - 14, js, 9.2);
        const below = d.top - 37 - (jLines - 1) * 9.2;
        d.text(J_VALID, d.x + 7, below, 7.6);
        const tail = `Schedules of Circuit Details and Test Results: ${pages}. Total number of pages: ${numbers ? numbers.total : '–'}.`;
        d.text(fitText(d, tail, 6.6, d.width - 14, true), d.x + 7, below - 10, 6.6, { bold: true });
      }],
    ]);
  }

  /* ── Continuation sheets ──────────────────────────────────────────────────── */
  for (const c of conts) {
    kind = 'cert';
    kit.newPage();
    const tl = kit.lines(c.title, 7.8, W - 14);
    const th = 21 + tl.length * 9.5;
    kit.block(th, (d) => {
      frame(d, d.x, d.top, d.width, th);
      d.text(`${EIC_TITLE}: ${CONTINUATION_TITLE(c.n)}`, d.x + 7, d.top - 12, 8.8, { bold: true });
      tl.forEach((l, i) => d.text(l, d.x + 7, d.top - 23 - i * 9.5, 7.8));
    });
    kit.gap(8);
    // The form's own words in its regular type, what was written in bold.
    for (const p of c.paras) {
      const t = typeof p === 'string' ? p : p.t;
      const bold = typeof p === 'string';
      if (!t) continue;
      const ls = kit.lines(t, 8.4, W - 14, bold);
      for (const l of ls) kit.block(11, (d) => d.text(l, d.x + 7, d.top - 9, 8.4, { bold }));
      kit.gap(4);
    }
    if (c.images.length && c.caption) {
      const ls = kit.lines(c.caption, 8.4, W - 14);
      for (const l of ls) kit.block(11, (d) => d.text(l, d.x + 7, d.top - 9, 8.4));
      kit.gap(4);
    }
    for (const bytes of c.images) {
      const im = await kit.embed(bytes);
      if (!im) continue;
      const h = Math.min(kit.room() - 4, (im.height / im.width) * (W - 14), 600);
      kit.block(h + 6, (d) => d.image(im, d.x + 7, d.top - h, d.width - 14, h));
    }
  }

  /* ── The schedules: for each board, 12 circuits a sheet ──────────────────── */
  let schedFrom = 0;
  for (const b of boards) {
    const mine = circuits.filter((c) => c.board === b.id);
    const sheets = Math.max(1, Math.ceil(mine.length / ROWS));
    for (let i = 0; i < sheets; i++) {
      const rows = mine.slice(i * ROWS, (i + 1) * ROWS);
      kind = 'details';
      kit.newPage({ landscape: true });
      if (!schedFrom) schedFrom = kit.pageNumber;
      detailsSheet(kit, b, rows, { must, given, NA, draft, sched, schedCont });
      kind = 'tests';
      kit.newPage({ landscape: true });
      testsSheet(kit, x, b, rows, { must, given, NA, draft, sched, schedCont, three, remarksOf, sig: single ? { img: one, at: x.sig.one?.at ?? null } : { img: ins, at: x.sig.ins?.at ?? null }, name });
    }
  }
  const schedTo = schedFrom ? kit.pageNumber : 0;

  /* ── The form's notes, then the guidance for recipients ───────────────────── */
  kind = 'plain';
  kit.newPage();
  notesPage(kit);
  const guidance = x.wording?.guidance ?? IET_GUIDANCE;
  if (guidance.verified) {
    kit.newPage();
    textPage(kit, guidance.heading ?? EIC_TITLE, guidance.title, guidance.paragraphs.map((p) => ({ n: null, p })));
  }
  return { kit, numbers: { schedFrom, schedTo, total: kit.pageNumber } };
}

/* ── The page head: "Certificate No.:" on every page; the title on page 1; the ® wordmark ── */

/** The wordmark's letters (with the ®) at the top of a page, in points across. */
const MARK_W = { first: 72, page: 60 };

function pageHead(d: Drawing, kind: HeadKind, certNo: string, draft: boolean): number {
  const X = d.x;
  const R = d.x + d.width;
  /** "Certificate No.: HX-0042-EIC" ending at xr, the spark before it. */
  const no = (label: string, xr: number, y: number, size: number) => {
    // The label first, so the page's text reads "Certificate No.: HX-0042-EIC".
    const w = d.widthOf(certNo, size + 0.4, true);
    const lx = xr - w - 4 - d.widthOf(label, size);
    d.text(label, lx, y, size);
    d.text(certNo, xr - w, y, size + 0.4, { bold: true });
    d.spark(lx - 7.5, y + size * 0.34, size * 0.92);
  };
  let h = 18;
  if (kind === 'cert1') {
    // The form's title on the left; the wordmark at the top right, the certificate number under it.
    d.text(EIC_TITLE, X + 2, d.top - 11, 11.6, { bold: true });
    d.text(EIC_SUBTITLE, X + 2, d.top - 22, 8.6);
    d.logo(R - MARK_W.first, d.top - 5.5, MARK_W.first);
    no(CERT_NO, R, d.top - 24, 8.8);
    h = 30;
  } else if (kind === 'details' || kind === 'tests') {
    // The schedule's title on the left; on the right its number, a gold rule, the wordmark.
    d.text(kind === 'details' ? CS.title : TS.title, X + 2, d.top - 13, 12, { bold: true });
    d.logo(R - MARK_W.first, d.top - 8.6, MARK_W.first);
    const rx = R - MARK_W.first - 11;
    d.line(rx, d.top - 2.5, rx, d.top - 15, { color: AMBER, t: 0.8 });
    no(REPORT_NO, rx - 11, d.top - 13, 9.4);
    h = 24;
  } else {
    // The wordmark on the left, the certificate number on the right.
    d.logo(X, d.top - 6.6, MARK_W.page);
    no(CERT_NO, R, d.top - 10, 8.8);
  }
  if (draft) {
    const t = 'Draft: not signed yet';
    const w = d.widthOf(t, 8.4, true) + 16;
    const cx = X + (d.width - w) / 2 + (kind === 'cert1' ? 40 : 0);
    d.rect(cx, d.top - 15, w, 14, { border: AMBER, line: 1.2 });
    d.text(t, cx + 8, d.top - 11, 8.4, { bold: true, color: AMBER });
  }
  return h;
}

/* ── Schedules ──────────────────────────────────────────────────────────────── */

// Column widths from the IET's sheets (points at its scale), shared out over the page's width.
const DETAIL_W = [33.4, 219.7, 33.0, 34.7, 33.9, 41.5, 42.3, 60.1, 34.7, 33.0, 33.9, 34.3, 59.7, 34.3, 34.3, 34.7];
const TEST_W = [33.0, 32.1, 32.6, 33.5, 33.9, 34.7, 36.4, 33.8, 34.7, 32.2, 33.9, 33.9, 33.8, 33.9, 320.0];
function colWidths(ws: number[], W: number) {
  const sum = ws.reduce((a, b) => a + b, 0);
  return ws.map((w) => (w / sum) * W);
}

type Helpers = {
  must: (label: string, t: string | null | undefined) => Val;
  given: (t: string | null | undefined) => Val;
  NA: Val;
  draft: boolean;
  /** How the written entries fit, and the continuation sheet for those that don't. */
  sched: SchedLayout;
  schedCont: number | null;
};
/** A cell: words (centred, or from the left), a mark, or words already in lines (a description, remarks). */
type Cell = string | null | { mark: 'tick' | 'cross' | 'na' | null } | { lines: string[]; size: number };

// The heading block tall enough for each heading to run up its column on one line, as on the form.
const HEAD_H = 134;
const G1 = 16;
const G2 = 16;
const HEAD_SIZE = 7.2;
const ROW_H = 14.8;
const BOX_H = 80;

/* ── What fits where on the schedules (worked out before the certificate is drawn) ─ */

type Measure = { lines: (s: string, sz: number, max: number, bold?: boolean) => string[]; widthOf: (s: string, sz: number, bold?: boolean) => number };
type Over = { where: string; what: string; text: string };
type BoardRow = { xs: number[]; ws: number[]; fits: boolean[] };
/** `testRef`: the boards whose reference is too long to read in the test results sheet's blank (it's on the continuation sheet). */
type SchedLayout = { over: Over[]; boards: Map<string, BoardRow>; cut: Set<string>; testRef: Set<string> };

const DETAIL_WS = colWidths(DETAIL_W, LANDSCAPE_W);
const TEST_WS = colWidths(TEST_W, LANDSCAPE_W);
/** The written words a value can shrink to on the schedules before it goes on the continuation sheet. */
const READABLE = 6.4;
const CONT_NOTE = (n: number | null) => `(see continuation sheet No. ${n ?? '–'})`;
/** The test results sheet's "DB/CU reference:" blank, from its left. */
const TEST_REF_W = 168;

/**
 * "DB/CU reference: … Location: … Supplied from: …": the form's three blanks in a row. Where they
 * are now unless one won't fit; then each gets what it needs (the reference as little as it can) and
 * the rest is shared out. `fits` says whether each value can be written at a readable size.
 */
function boardRow(m: Measure, vals: (string | null)[]): BoardRow {
  const first = spans(m, vals);
  if (first.fits.every(Boolean)) return first;
  // Laid out again with the note in place of what goes over, so the note has room too.
  const again = spans(m, vals.map((t, i) => (first.fits[i] ? t : CONT_NOTE(99).slice(1, -1))));
  return { ...again, fits: first.fits };
}
function spans(m: Measure, vals: (string | null)[]): BoardRow {
  const total = LANDSCAPE_W * 0.625 - 22;
  const gap = 8;
  const lab = [CS.dbRef, CS.location, CS.suppliedFrom].map((l) => m.widthOf(l, 8.2) + 4.5);
  const need = vals.map((t, i) => lab[i] + (t ? m.widthOf(t, 8.4, true) : 0) + 4);
  let ws = [168, 146, total - 168 - 146 - 2 * gap];
  if (need.some((n, i) => n > ws[i])) {
    const min = [96, 100, 100];
    const room = total - 2 * gap;
    const want = need.map((n, i) => Math.max(n, min[i]));
    const sum = want.reduce((a, b) => a + b, 0);
    if (sum <= room) ws = want.map((x) => x + (room - sum) / 3);
    else {
      const flex = want.map((x, i) => x - min[i]);
      const fsum = flex.reduce((a, b) => a + b, 0);
      ws = want.map((x, i) => x - (flex[i] / fsum) * (sum - room));
    }
  }
  const xs = [0, ws[0] + gap, ws[0] + ws[1] + 2 * gap];
  const fits = vals.map((t, i) => !t || m.widthOf(t, READABLE, true) <= ws[i] - lab[i] - 1);
  return { xs, ws, fits };
}

/** A circuit's description or remarks in its cell: one line, else two smaller, else two with where the rest is. */
function wrapCell(m: Measure, t: string, w: number, one: number, cont: number | null): { lines: string[]; size: number; cut: boolean } {
  if (m.widthOf(t, one, true) <= w - 6) return { lines: [t], size: one, cut: false };
  const ls = m.lines(t, 6.2, w - 6, true);
  if (ls.length <= 2) return { lines: ls, size: 6.2, cut: false };
  const note = CONT_NOTE(cont);
  const room = w - 6 - m.widthOf(` ${note}`, 6.2, true);
  return { lines: [ls[0], `${fitText(m, ls.slice(1).join(' '), 6.2, room, true)} ${note}`], size: 6.2, cut: true };
}

function scheduleLayout(m: Measure, boards: Board[], circuits: Circuit[], remarksOf: (c: Circuit) => string | null): SchedLayout {
  const over: Over[] = [];
  const rows = new Map<string, BoardRow>();
  const cut = new Set<string>();
  const testRef = new Set<string>();
  for (const [i, b] of boards.entries()) {
    const ref = String(b.ref ?? 'Board');
    const vals = [str(b, 'ref'), str(b, 'loc'), str(b, 'from')];
    const row = boardRow(m, vals);
    rows.set(b.id, row);
    // The reference: on both sheets when it can be read there; on the continuation sheet, in full, when it can't on either.
    const testFits = !vals[0] || m.widthOf(vals[0], READABLE, true) <= TEST_REF_W - m.widthOf(TS.dbRef, 8.2) - 4.5;
    if (!testFits) testRef.add(b.id);
    if (!row.fits[0] || !testFits) over.push({ where: boards.length > 1 ? `Distribution board ${i + 1} of ${boards.length}` : 'Distribution board', what: plain(CS.dbRef).replace(/:$/, ''), text: vals[0]! });
    if (!row.fits[1]) over.push({ where: ref, what: plain(CS.location).replace(/:$/, ''), text: vals[1]! });
    if (!row.fits[2]) over.push({ where: ref, what: plain(CS.suppliedFrom).replace(/:$/, ''), text: vals[2]! });
    for (const c of circuits.filter((x) => x.board === b.id)) {
      const where = `${ref} circuit ${String(c.n ?? '?')}`;
      const desc = str(c, 'desc');
      if (desc && wrapCell(m, desc, DETAIL_WS[1], 7.2, null).cut) {
        cut.add(`${c.id}:desc`);
        over.push({ where, what: `${CS.heads[2]} (column 2)`, text: desc });
      }
      const rem = remarksOf(c);
      if (rem && wrapCell(m, rem, TEST_WS[14], 6.2, null).cut) {
        cut.add(`${c.id}:remarks`);
        over.push({ where, what: `${TS.heads[31]} (column 31)`, text: rem });
      }
    }
  }
  return { over, boards: rows, cut, testRef };
}

/** The heading block of a schedule: group rows, each column's heading (turned up the page) and its number in the corner. */
function headings(d: Drawing, top: number, first: number, ws: number[], heads: Record<number, string>, groups: ScheduleGroup[], horizontal: number[]) {
  const X = d.x;
  const xs = ws.map((_, i) => X + ws.slice(0, i).reduce((a, b) => a + b, 0));
  const bottom = top - HEAD_H;
  frame(d, X, top, d.width, HEAD_H, 0.8);
  const level = (n: number) => Math.max(0, ...groups.filter((g) => n >= g.from && n <= g.to).map((g) => g.row));
  for (const g of groups) {
    const a = g.from - first;
    const b = g.to - first;
    const gx = xs[a];
    const gw = xs[b] + ws[b] - xs[a];
    const gt = g.row === 1 ? top : top - G1;
    const gh = g.row === 1 ? G1 : G2;
    d.rect(gx, gt - gh, gw, gh, { border: INK, line: 0.6 });
    if (g.label) richCentre(d, g.label, gx, gw, gt - gh + 5, 8);
  }
  ws.forEach((w, i) => {
    const n = first + i;
    const lv = level(n);
    const ct = lv === 0 ? top : lv === 1 ? top - G1 : top - G1 - G2;
    vline(d, xs[i], ct, bottom);
    d.text(String(n), xs[i] + 1.5, bottom + 2.2, 6.2);
    const label = heads[n];
    if (!label) return;
    if (horizontal.includes(n)) {
      if (n === 31) {
        richCentre(d, label, xs[i], w, ct - 24, 8, { bold: true });
        TS.remarksNote.forEach((l, j) => richCentre(d, l, xs[i], w, ct - 42 - j * 9.5 - (j === 2 ? 6 : 0), 7.6));
      } else richCentre(d, label, xs[i], w, bottom + 13, 8);
      return;
    }
    // Turned up the page from just above the column number, on one line as on the form (two only if it can't be).
    const room = ct - bottom - 13;
    const lines = richLines(d, label, HEAD_SIZE, room);
    const lh = 8.2;
    const cx = xs[i] + w / 2 + (lines.length * lh) / 2 - 2.1;
    lines.forEach((l, j) => rich(d, l, cx - (lines.length - 1 - j) * lh, bottom + 10.5, HEAD_SIZE, { rotate: 90 }));
  });
  vline(d, X + d.width, top, bottom, 0.8);
}

/** Marked-up words in lines no longer than max. */
function richLines(d: { widthOf: (s: string, sz: number, bold?: boolean) => number }, s: string, size: number, max: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of s.split(' ')) {
    const t = line ? `${line} ${w}` : w;
    if (richWidth(d, t, size) <= max || !line) line = t;
    else {
      out.push(line);
      line = w;
    }
  }
  if (line) out.push(line);
  return out;
}

/** 12 ruled rows, the circuits in the first ones (centred; the description and remarks from the left). */
function rowsBlock(d: Drawing, top: number, ws: number[], rows: Cell[][], left: number[]) {
  const X = d.x;
  const xs = ws.map((_, i) => X + ws.slice(0, i).reduce((a, b) => a + b, 0));
  const H = ROWS * ROW_H;
  frame(d, X, top, d.width, H, 0.8);
  xs.forEach((x0, i) => i && vline(d, x0, top, top - H, 0.5));
  for (let j = 1; j < ROWS; j++) hline(d, X, X + d.width, top - j * ROW_H, 0.5);
  rows.forEach((row, j) => {
    const y = top - j * ROW_H;
    row.forEach((c, i) => {
      const w = ws[i];
      if (c && typeof c === 'object' && 'lines' in c) {
        c.lines.forEach((l, k) => d.text(l, xs[i] + 3, y - (c.lines.length === 1 ? 10.2 : 6.6 + k * 6.6), c.size, { bold: true }));
        return;
      }
      if (c && typeof c === 'object') {
        if (c.mark === 'tick') tickMark(d, xs[i] + (w - 8) / 2, y - ROW_H / 2 - 4, 8);
        else if (c.mark === 'cross') crossMark(d, xs[i] + (w - 8) / 2, y - ROW_H / 2 - 4, 8);
        else if (c.mark === 'na') richCentre(d, 'N/A', xs[i], w, y - 10.2, 6.8, { bold: true });
        return;
      }
      if (!c) return;
      let sz = 7.2;
      while (sz > 5 && d.widthOf(c, sz, true) > w - 4) sz -= 0.2;
      const t = fitText(d, c, sz, w - 4, true);
      if (left.includes(i)) d.text(t, xs[i] + 3, y - 10.2, sz, { bold: true });
      else d.text(t, xs[i] + (w - d.widthOf(t, sz, true)) / 2, y - 10.2, sz, { bold: true });
    });
  });
}

function band(d: Drawing, top: number, title: string) {
  frame(d, d.x, top, d.width, 18, 0.8);
  richCentre(d, title, d.x, d.width, top - 13.5, 12.5, { bold: true });
}

/** The form's footnotes, word for word: a long one wraps rather than being cut. */
function footnoteLines(d: { widthOf: (s: string, sz: number, bold?: boolean) => number }, notes: string[], size: number, w: number): string[] {
  return notes.flatMap((n) => richLines(d, n, size, w));
}
function footnotes(d: Drawing, top: number, lines: string[], size: number, lh: number) {
  lines.forEach((n, i) => rich(d, n, d.x, top - size - i * lh, size));
}

function detailsSheet(kit: Kit, b: Board, list: Circuit[], h: Helpers) {
  const { must, given, NA } = h;
  const ws = colWidths(DETAIL_W, kit.width);
  const spd = Array.isArray(b.spd) ? (b.spd as string[]) : [];
  const rcd = b.rcd === 'yes';
  const row1 = h.sched.boards.get(b.id) ?? boardRow(kit, [str(b, 'ref'), str(b, 'loc'), str(b, 'from')]);
  kit.block(BOX_H, (d) => {
    const X = d.x;
    const L = d.width * 0.625;
    frame(d, X, d.top, d.width, BOX_H, 0.8);
    vline(d, X + L, d.top, d.top - BOX_H, 0.8);
    const A = X + 12;
    const E = X + L - 10;
    d.text(CS.boardBox, A, d.top - 13, 8.4, { bold: true });
    // Reference, location, supplied from: a value too long to read in its blank is on the continuation sheet.
    const r1 = (i: number, label: string, k: string, what: string) => {
      const t = str(b, k);
      const v = t && !row1.fits[i] ? { s: CONT_NOTE(h.schedCont).slice(1, -1) } : must(what, t);
      blank(d, { x: A + row1.xs[i], y: d.top - 28, end: A + row1.xs[i] + row1.ws[i], label, v, size: 8.2 });
    };
    r1(0, CS.dbRef, 'ref', 'DB/CU reference');
    r1(1, CS.location, 'loc', 'Location');
    r1(2, CS.suppliedFrom, 'from', 'Supplied from');
    blank(d, { x: A, y: d.top - 43, end: A + 255, label: CS.ocpd, v: given(str(b, 'ocpd_bs')) ?? NA, size: 8.2 });
    blank(d, { x: A + 262, y: d.top - 43, end: A + 322, label: CS.ocpdType, v: given(str(b, 'ocpd_type')) ?? NA, size: 8.2 });
    blank(d, { x: A + 330, y: d.top - 43, end: E, label: CS.ocpdRating, v: given(reading(b.ocpd_a)) ?? NA, unit: 'A', size: 8.2 });
    d.text(CS.spd, A, d.top - 58, 8.2);
    if (!h.draft && !spd.length) throw new MissingAnswer('SPD Details: Type(s)');
    const keys = ['T1', 'T2', 'T3', 'na'];
    CS.spdBoxes.forEach((l, i) => {
      const bx = A + 106 + i * 36;
      const lw = rich(d, l, bx, d.top - 58, 8.2);
      tickBox(d, bx + lw + 4, d.top - 60.5, spd.includes(keys[i]), 9);
    });
    d.text(CS.rcd, A, d.top - 73, 8.2);
    const rv = (k: string, label: string, num = false): Val => (rcd ? must(`Board RCD: ${label}`, num ? reading(b[k]) : str(b, k)) : NA);
    if (!h.draft && b.rcd !== 'yes' && b.rcd !== 'no') throw new MissingAnswer('RCD for the whole board?');
    blank(d, { x: A + 34, y: d.top - 73, end: A + 118, label: CS.rcdBs, v: rv('rcd_bs', 'BS (EN)'), size: 8.2 });
    blank(d, { x: A + 124, y: d.top - 73, end: A + 178, label: CS.rcdType, v: rv('rcd_type', 'type'), size: 8.2 });
    blank(d, { x: A + 184, y: d.top - 73, end: A + 250, label: CS.rcdRating, v: rv('rcd_a', 'rating', true), unit: 'A', size: 8.2 });
    blank(d, { x: A + 262, y: d.top - 73, end: E, label: CS.rcdIdn, v: rv('rcd_idn', 'IΔn', true), unit: 'mA', size: 8.2 });
  });
  kit.block(18, (d) => band(d, d.top, CS.band));
  kit.block(HEAD_H, (d) => headings(d, d.top, 1, ws, CS.heads, CS.groups, [2]));
  const rows: Cell[][] = list.map((c) => {
    const r = c.rcd === 'yes';
    const v = (k: string) => reading(c[k]) ?? str(c, k);
    const desc = str(c, 'desc');
    return [str(c, 'n'), desc ? wrapCell(kit, desc, ws[1], 7.2, h.schedCont) : null, str(c, 'wiring'), str(c, 'ref'), v('points'), v('csa_live'), v('csa_cpc'), str(c, 'ocpd_bs'), str(c, 'ocpd_type'), v('ocpd_a'), v('ocpd_ka'), v('zs_max'), r ? str(c, 'rcd_bs') : 'N/A', r ? str(c, 'rcd_type') : 'N/A', r ? v('rcd_idn') : 'N/A', r ? v('rcd_a') : 'N/A'];
  });
  kit.block(ROWS * ROW_H, (d) => rowsBlock(d, d.top, ws, rows, [1]));
  kit.gap(5);
  // Codes for types of wiring; what "O" stands for on this board, on its dotted line.
  const others = [...new Set(list.filter((c) => c.wiring === 'O').map((c) => str(c, 'wiring_other')).filter((t): t is string => !!t))].join('; ');
  kit.block(58, (d) => {
    const X = d.x;
    frame(d, X, d.top, d.width, 58, 0.8);
    richCentre(d, CS.codesTitle, X, d.width, d.top - 13.5, 11.5, { bold: true });
    hline(d, X, X + d.width, d.top - 18, 0.6);
    hline(d, X, X + d.width, d.top - 31, 0.6);
    const cw = d.width / WIRING_CODES.length;
    WIRING_CODES.forEach((w, i) => {
      const cx = X + i * cw;
      if (i) vline(d, cx, d.top - 18, d.top - 58, 0.6);
      richCentre(d, w.code, cx, cw, d.top - 28, 9.6);
      const ls = WIRING_CODE_LINES[w.code].filter(Boolean) as string[];
      if (w.code === 'O') {
        richCentre(d, ls[0], cx, cw, d.top - 39.5, 6.8);
        dots(d, cx + 4, cx + cw - 4, d.top - 53);
        // What "O" is on this board, on its dotted line; when it won't fit, it's in each circuit's Remarks.
        if (others) value(d, { s: d.widthOf(others, 6, true) <= cw - 10 ? others : 'See Remarks, column 31' }, cx + 5, cx + cw - 5, d.top - 52.4, 6.6);
        return;
      }
      ls.forEach((l, j) => richCentre(d, l, cx, cw, d.top - 42 - (ls.length === 1 ? 4 : 0) - j * 8.4, 6.8));
    });
  });
  kit.gap(3);
  // The form's footnotes in its small type: § on one line, as it is there.
  const fl = footnoteLines(kit, CS.footnotes, 5.3, kit.width);
  kit.block(fl.length * 6.4 + 2, (d) => footnotes(d, d.top, fl, 5.3, 6.4));
}

function testsSheet(
  kit: Kit,
  x: EicInput,
  b: Board,
  list: Circuit[],
  h: Helpers & { three: boolean; remarksOf: (c: Circuit) => string | null; sig: { img: PDFImage | null; at: string | null }; name: string | null }
) {
  const { must, given, NA } = h;
  const ws = colWidths(TEST_W, kit.width);
  const spdNa = !Array.isArray(b.spd) || (b.spd as string[]).every((s) => s === 'na');
  kit.block(BOX_H, (d) => {
    const X = d.x;
    const L = d.width * 0.62;
    frame(d, X, d.top, d.width, BOX_H, 0.8);
    vline(d, X + L, d.top, d.top - BOX_H, 0.8);
    const A = X + 12;
    const E = X + L - 10;
    d.text(TS.boardBox, A, d.top - 13, 8.4, { bold: true });
    // The reference, as on the circuit details sheet: too long to read in its blank, it's on the continuation sheet.
    const ref = str(b, 'ref');
    blank(d, { x: A, y: d.top - 31, end: A + TEST_REF_W, label: TS.dbRef, v: ref && h.sched.testRef.has(b.id) ? { s: CONT_NOTE(h.schedCont).slice(1, -1) } : must('DB/CU reference', ref), size: 8.2 });
    blank(d, { x: A + 180, y: d.top - 31, end: A + 296, label: TS.zdb, v: must('Zdb', reading(b.zdb)), unit: 'Ω', size: 8.2 });
    blank(d, { x: A + 306, y: d.top - 31, end: E, label: TS.ipf, v: must('Ipf', reading(b.ipf)), unit: 'kA', size: 8.2 });
    d.text(TS.confirmed, A, d.top - 50, 8.2);
    const pw = d.widthOf(TS.polarity, 8.2);
    d.text(TS.polarity, A + 112, d.top - 50, 8.2);
    tickBox(d, A + 112 + pw + 5, d.top - 52.5, b.pol === true, 9);
    if (!h.draft && b.pol !== true) throw new MissingAnswer('Confirmed: correct polarity');
    const qw = d.widthOf(TS.phase, 8.2);
    d.text(TS.phase, A + 222, d.top - 50, 8.2);
    tickBox(d, A + 222 + qw + 5, d.top - 52.5, h.three && b.phase === true, 9);
    if (!h.three) d.text('N/A', A + 222 + qw + 18, d.top - 50, 7.4, { bold: true });
    d.text(TS.spd, A, d.top - 69, 8.2);
    const sw = rich(d, TS.spdOk, A + 112, d.top - 69, 8.2);
    tickBox(d, A + 112 + sw + 5, d.top - 71.5, !spdNa && b.spd_ok === 'yes', 9);
    d.text(TS.na, A + 268, d.top - 69, 8.2);
    tickBox(d, A + 268 + d.widthOf(TS.na, 8.2) + 5, d.top - 71.5, spdNa || b.spd_ok === 'na', 9);
    if (!h.draft && !spdNa && b.spd_ok !== 'yes' && b.spd_ok !== 'na') throw new MissingAnswer('SPD: operational status confirmed');
    // Details of test instruments used
    const I = X + L + 8;
    const IE = X + d.width - 8;
    d.text(fitText(d, TS.instrumentsHead, 8, IE - I, true), I, d.top - 13, 8, { bold: true });
    const inst = (x.values.eic_inst ?? {}) as Record<string, unknown>;
    TS.instruments.forEach((t, i) => {
      const val = typeof inst[t.k] === 'string' && (inst[t.k] as string).trim() ? (inst[t.k] as string).trim() : null;
      blank(d, { x: I, y: d.top - 25.5 - i * 9.9, end: IE, label: t.label, v: given(val) ?? NA, size: 7.8 });
    });
  });
  kit.block(18, (d) => band(d, d.top, TS.band));
  kit.block(HEAD_H, (d) => headings(d, d.top, 17, ws, TS.heads, [...TS.groups, { from: 31, to: 31, label: '', row: 1 }], [31]));
  const NAc = 'N/A';
  const rows: Cell[][] = list.map((c) => {
    const ring = c.ring === 'yes';
    const r = c.rcd === 'yes';
    const v = (k: string) => reading(c[k]) ?? str(c, k);
    const req = (k: string, label: string) => {
      const t = v(k);
      if (t) return t;
      if (!h.draft) throw new MissingAnswer(`${String(b.ref ?? 'Board')} circuit ${String(c.n ?? '?')}: ${label}`);
      return null;
    };
    const rem = h.remarksOf(c);
    const pf = (p: unknown): Cell => ({ mark: p === 'pass' ? 'tick' : p === 'fail' ? 'cross' : p === 'na' ? 'na' : null });
    return [
      str(c, 'n'),
      ring ? req('r1', 'r1') : NAc,
      ring ? req('rn', 'rn') : NAc,
      ring ? req('r2', 'r2') : NAc,
      v('r12') ?? NAc,
      v('r2only') ?? NAc,
      req('ir_v', 'Test voltage'),
      req('ir_ll', 'Live - Live'),
      req('ir_le', 'Live - Earth'),
      { mark: c.pol === true ? 'tick' : null },
      req('zs', 'Maximum measured Zs'),
      r ? req('rcd_ms', 'Disconnection time') : NAc,
      r ? pf(c.rcd_btn) : NAc,
      c.afdd === 'yes' ? pf(c.afdd_btn) : NAc,
      rem ? wrapCell(kit, rem, ws[14], 6.2, h.schedCont) : null,
    ];
  });
  kit.block(ROWS * ROW_H, (d) => rowsBlock(d, d.top, ws, rows, []));
  kit.gap(5);
  // Tested by
  kit.block(46, (d) => {
    const X = d.x;
    const w = d.width * 0.594;
    frame(d, X, d.top, w, 46, 0.8);
    const name = h.name ? { s: h.name.toUpperCase() } : must(TS.testedBy, null);
    blank(d, { x: X + 10, y: d.top - 15, end: X + w - 12, label: TS.testedBy, v: name, size: 8.2 });
    d.text(TS.signature, X + 10, d.top - 36, 8.2);
    const sx = X + 10 + d.widthOf(TS.signature, 8.2) + 2;
    const dateX = X + w - 120;
    dots(d, sx, dateX - 4, d.top - 36);
    if (h.sig.img) d.image(h.sig.img, sx + 4, d.top - 39, dateX - sx - 16, 17);
    else if (h.draft) value(d, { s: NOT_SIGNED, missing: true }, sx + 4, dateX - 6, d.top - 35.4, 7.6);
    else throw new MissingAnswer('Tested by: signature');
    d.text(TS.date, dateX, d.top - 36, 8.2);
    const dx = dateX + d.widthOf(TS.date, 8.2) + 2;
    dots(d, dx, X + w - 12, d.top - 36);
    value(d, given(formDate(h.sig.at)), dx + 3, X + w - 12, d.top - 35.4, 8.2);
  });
  kit.gap(3);
  const fl = footnoteLines(kit, TS.footnotes, 5.6, kit.width);
  kit.block(fl.length * 6.6 + 2, (d) => footnotes(d, d.top, fl, 5.6, 6.6));
}

/* ── Text pages ─────────────────────────────────────────────────────────────── */

function notesPage(kit: Kit) {
  const paras: { n: string | null; p: string; bullet?: boolean }[] = [];
  for (const note of IET_EIC_NOTES.notes) {
    note.paras.forEach((p, i) => {
      if (typeof p === 'string') paras.push({ n: i === 0 ? note.n : '', p });
      else for (const b of p.bullets) paras.push({ n: '', p: b, bullet: true });
    });
  }
  textPage(kit, IET_EIC_NOTES.title, IET_EIC_NOTES.heading, paras);
}

/** A page of the form's own words: its title, a heading, then numbered (or plain) paragraphs. */
function textPage(kit: Kit, title: string, heading: string, paras: { n: string | null; p: string; bullet?: boolean }[]) {
  const IN = 70;
  kit.block(52, (d) => {
    d.text(title, d.x + IN - 20, d.top - 34, 14, { bold: true });
  });
  kit.block(30, (d) => d.text(heading, d.x + IN - 20, d.top - 14, 11.2, { bold: true }));
  for (const para of paras) {
    const indent = para.n === null ? 0 : para.bullet ? 22 : 22;
    const textX = IN - 20 + indent + (para.bullet ? 18 : 0);
    const ls = kit.lines(para.p, 9.4, kit.width - textX - 40);
    kit.block(ls.length * 12.4 + 5, (d) => {
      if (para.n) d.text(para.n, d.x + IN - 20, d.top - 10, 9.4);
      if (para.bullet) d.text('•', d.x + IN - 20 + indent + 2, d.top - 10, 9.4);
      ls.forEach((l, i) => d.text(l, d.x + textX, d.top - 10 - i * 12.4, 9.4));
    });
  }
}

/* ── Section C's names and Section E's particulars (worked out before anything is drawn) ── */

/** Section C's signature line, from the frame's left: where each part of "Signature … Date … Name (IN BLOCK CAPITALS) … role" goes. */
function signGeom(m: Measure, W: number, role: string) {
  const X = 7;
  const end = W - 6;
  const roleW = m.widthOf(role, 7.8);
  const sx = X + m.widthOf(SIGN_LINE.signature, 7.8) + 2;
  const dateX = X + 192;
  const dx = dateX + m.widthOf(SIGN_LINE.date, 7.8) + 2;
  const nameX = dateX + 70;
  const nx = nameX + m.widthOf(SIGN_LINE.name, 7.8) + 2;
  return { X, end, roleW, sx, dateX, dx, nameX, nx, nameFrom: nx + 2, nameEnd: end - roleW - 4 };
}

/**
 * A signatory's name in block capitals on their line: on one line (made a little smaller), else over
 * two with the second under the dotted line (the room down to the next line), else null: too long for
 * that, it's written in full on a continuation sheet. Never cut.
 */
function signFit(m: Measure, W: number, role: string, name: string): Fitted | null {
  const g = signGeom(m, W, role);
  return fitName(m, name.toUpperCase(), g.nameEnd - g.nameFrom - 0.01, { size: 8, oneMin: 6.8, two: true, twoMax: 7.2 });
}

type Person = { name: string | null; company: string | null; address: string | null; postcode: string | null; tel: string | null };
/** Section E's blanks, from the frame's left: where the values start, where the name's blank ends, where the firm's starts; the margin at the right. */
const PX = { x: 80, nameEnd: 205, firm: 210, r: 7 };
/** How a person's particulars fit Section E: the name, the firm (one line or two), the address's lines. A null name or firm is on the continuation sheet. */
type PersonFit = { name: Fitted | null; firm: Fitted | null; addr: string[] };

/** The address's lines: the first after its label (only as far as the name's blank when a firm's second line is beside it), the rest on the line under. */
function addressLines(m: Measure, W: number, s: string, narrow: boolean): string[] {
  const end = narrow ? PX.x + PX.nameEnd : W - PX.r;
  return wrapFirst(m, s, 8.2, end - PX.x - m.widthOf(E_LABELS.address, 8) - 6, 228);
}

/**
 * A person's particulars as they fit Section E, never cut: the name on its line (made smaller if it
 * must); the firm on its line, else over two with the second on the address's line beside the address
 * (when the address still fits beside the name's blank and on the line under); else null, written in
 * full on a continuation sheet.
 */
function personFit(m: Measure, W: number, p: Person): PersonFit {
  // A value's room in "Label: ……": from after the label to the end of its blank, as blank() and value() measure it.
  const room = (from: number, to: number, label: string) => to - 1 - (from + m.widthOf(label, 8) + 3.5) - 0.01;
  const name = p.name ? fitName(m, p.name, room(PX.x, PX.x + PX.nameEnd, E_LABELS.name), { size: 8.2 }) : null;
  const narrow = p.address ? addressLines(m, W, p.address, true) : [];
  const roomy = narrow.length <= 1 || m.widthOf(narrow.slice(1).join(' '), 5.6, true) <= 228 - 2.5 - 0.01;
  const firm = p.company ? fitName(m, p.company, room(PX.x + PX.firm, W - PX.r, E_LABELS.onBehalf), { size: 8.2, oneMin: 6.6, two: roomy }) : null;
  return { name, firm, addr: p.address ? (firm?.lines.length === 2 ? narrow : addressLines(m, W, p.address, false)) : [] };
}

/* ── Small layout helpers ───────────────────────────────────────────────────── */

/** Words wrapped with a shorter first line (a value after its label), the rest full width. */
function wrapFirst(d: { lines: (s: string, sz: number, max: number, bold?: boolean) => string[]; widthOf: (s: string, sz: number, bold?: boolean) => number }, s: string, size: number, first: number, rest: number): string[] {
  const words = s.split(/\s+/).filter(Boolean);
  let line = '';
  let i = 0;
  // The first line takes what fits after the label (it may be empty: then the words start on the next line).
  while (i < words.length) {
    const t = line ? `${line} ${words[i]}` : words[i];
    if (d.widthOf(t, size, true) > first) break;
    line = t;
    i++;
  }
  const tail = words.slice(i).join(' ');
  return tail ? [line, ...d.lines(tail, size, rest, true)] : [line];
}

/** How many lines flow() will take. */
function flowLines(d: { widthOf: (s: string, sz: number, bold?: boolean) => number }, parts: [string, boolean][], w: number, size: number): number {
  let cx = 0;
  let n = 1;
  for (const [t, bold] of parts)
    for (const word of t.split(/(?<= )/)) {
      const ww = d.widthOf(word, size, bold);
      if (cx + ww > w && cx > 0) {
        cx = 0;
        n++;
      }
      cx += ww;
    }
  return n;
}

/** Runs of text (bold where given) flowing over lines. */
function flow(d: Drawing, parts: [string, boolean][], x: number, y: number, w: number, size: number, lh: number) {
  let cx = x;
  let cy = y;
  for (const [t, bold] of parts) {
    for (const word of t.split(/(?<= )/)) {
      const ww = d.widthOf(word, size, bold);
      if (cx + ww > x + w && cx > x) {
        cx = x;
        cy -= lh;
      }
      d.text(word, cx, cy, size, { bold });
      cx += ww;
    }
  }
}
