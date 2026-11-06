import 'server-only';
import type { JobHead } from '@/lib/handover/inputs';
import { HELIAXIS_COMPANY } from '@/lib/subcontractors/agreement';
import { answerWords, fillMerge, missingRequired, shownFields } from '@/lib/templates/rules';
import type { Answers, DocTemplate, FieldsSection, SignAnswers, SignSection, TemplateField, TextSection } from '@/lib/templates/types';
import { issueOf } from '../issue';
import { MCS_CONTACT } from '../handover/common';
import { INK, longDate, MissingAnswer, MUTED, MUTED_DARK, newDocument, type Drawing, type Kit } from '../pdf-kit';

/**
 * Draws a document template (src/lib/templates) in the document kit: the Heliaxis header and site box,
 * then each section, in the digital or print variant. The same drawing serves a blank form to print and
 * fill in by hand, a form with the job's details already on it (merge fields, pre-filled answers), and a
 * completed one (answers given): an answered field prints its answer on the line, a ticked box shows a tick.
 * Nothing is drawn from outside the template and the job: no claims of its own.
 */

export type RenderInput = {
  template: DocTemplate;
  job: JobHead;
  /** None: a blank form. Given: a field prints its answer, and a required one left empty stops a finished document. */
  answers?: Answers;
  signed?: SignAnswers;
  /** A banner saying it isn't signed off yet (a preview of an unapproved template). */
  draft?: boolean;
  /** "Issue 2": the template's own issue; the issue map's by default. */
  revision?: string | null;
};

/** The job and company facts a template merges in (rules.ts MERGE_FIELDS). */
export function mergeValues(job: JobHead): Record<string, string> {
  const c = HELIAXIS_COMPANY;
  return {
    project_ref: job.ref ?? '',
    customer: job.customer,
    address: job.address.join(', '),
    postcode: job.postcode ?? '',
    date: longDate(job.issued),
    company: c.tradingName,
    company_address: c.addressLines.join(', '),
    company_phone: c.phone,
    company_email: c.email,
    mcs_number: c.mcsNumber,
    mcs_contact: MCS_CONTACT,
  };
}

const LABEL_SZ = 8.6;
const LABEL_LH = 10.4;
const HINT_SZ = 7.3;
const HINT_LH = 9;
const BOX = 9;
const GAP = 14;
const ROW_LH = 15;
const OPT_SZ = 8.4;
/** A section shorter than this (points) is kept on one page. */
const SHORT_SECTION = 230;

/** `rowH` is the height of the row it is in: an answer line or tick boxes sit at the bottom of the row, so a row lines up. */
type Cell = { h: number; draw: (d: Drawing, x: number, top: number, w: number, rowH: number) => void };

/** One field's cell: its label and hint, then the way it is answered. Laid out first, so a row can be sized before it is drawn. */
function cell(kit: Kit, f: TemplateField, w: number, answer: string, shown: string): Cell {
  const labelLines = kit.lines(f.label, LABEL_SZ, w);
  const hintLines = f.hint ? kit.lines(f.hint, HINT_SZ, w) : [];
  const head = labelLines.length * LABEL_LH + hintLines.length * HINT_LH;
  const drawHead = (d: Drawing, x: number, top: number) => {
    labelLines.forEach((l, i) => d.text(l, x, top - 9.2 - i * LABEL_LH, LABEL_SZ, { color: INK }));
    hintLines.forEach((l, i) => d.text(l, x, top - 9.2 - labelLines.length * LABEL_LH - i * HINT_LH + 1.5, HINT_SZ, { color: MUTED }));
  };

  if (f.kind === 'yesno') {
    const h = head + 22;
    return {
      h,
      draw(d, x, top, _w, rowH) {
        drawHead(d, x, top);
        const by = top - rowH + 5;
        const at = [0, 56, 108];
        [
          ['yes', 'Yes'],
          ['no', 'No'],
          ['na', 'N/A'],
        ].forEach(([v, name], i) => {
          d.mark(x + at[i], by, answer === v ? 'tick' : 'empty', BOX);
          d.text(name, x + at[i] + BOX + 4, by + 1.8, OPT_SZ, { color: INK });
        });
      },
    };
  }

  if (f.kind === 'choice') {
    const opts = f.options ?? [];
    const pos: { x: number; row: number }[] = [];
    let cx = 0;
    let row = 0;
    for (const o of opts) {
      const ow = BOX + 4 + kit.widthOf(o, OPT_SZ) + 14;
      if (cx > 0 && cx + ow - 14 > w) {
        cx = 0;
        row += 1;
      }
      pos.push({ x: cx, row });
      cx += ow;
    }
    const rows = row + 1;
    const h = head + rows * ROW_LH + 8;
    return {
      h,
      draw(d, x, top) {
        drawHead(d, x, top);
        opts.forEach((o, i) => {
          const by = top - head - 4 - pos[i].row * ROW_LH - 12;
          d.mark(x + pos[i].x, by, answer === o ? 'tick' : 'empty', BOX);
          d.text(o, x + pos[i].x + BOX + 4, by + 1.8, OPT_SZ, { color: INK });
        });
      },
    };
  }

  if (f.kind === 'long') {
    const text = shown ? kit.lines(shown, 9, w - 4, true) : [];
    const n = Math.max(3, text.length);
    const h = head + n * ROW_LH + 6;
    return {
      h,
      draw(d, x, top, cw) {
        drawHead(d, x, top);
        for (let i = 0; i < n; i++) {
          const y = top - head - 4 - (i + 1) * ROW_LH + 3;
          d.line(x, y, x + cw, y, { color: MUTED_DARK, t: 0.6 });
          if (text[i]) d.text(text[i], x + 2, y + 3.5, 9, { bold: true });
        }
      },
    };
  }

  // text, number, date: an entry line, with a number's unit at its end.
  const unit = f.kind === 'number' && f.unit ? f.unit : '';
  const unitW = unit ? kit.widthOf(unit, OPT_SZ) + 5 : 0;
  const h = head + 24;
  return {
    h,
    draw(d, x, top, cw, rowH) {
      drawHead(d, x, top);
      const y = top - rowH + 5;
      d.line(x, y, x + cw - unitW, y, { color: MUTED_DARK, t: 0.6 });
      if (shown) d.text(shown, x + 2, y + 3.5, 9, { bold: true });
      if (unit) d.text(unit, x + cw - unitW + 3, y + 1.8, OPT_SZ, { color: MUTED });
    },
  };
}

/** The value a field starts with: its answer, or its pre-fill from the job. */
function valueOf(f: TemplateField, answers: Answers | undefined, merge: Record<string, string>): { answer: string; shown: string } {
  const given = answers?.[f.key];
  const answer = given === null || given === undefined ? '' : String(given);
  // A number's unit is printed after the line, so its answer is just the figure; a yes/no prints as words.
  if (answer.trim()) return { answer, shown: f.kind === 'yesno' ? answerWords(f, answer) : answer };
  const pre = f.prefill ? fillMerge(f.prefill, merge).trim() : '';
  return { answer: '', shown: pre };
}

function fieldsSection(kit: Kit, s: FieldsSection, answers: Answers | undefined, merge: Record<string, string>) {
  const fields = shownFields(s, answers);
  if (!fields.length) return;
  const n = s.columns ?? 1;
  const w = (kit.width - (n - 1) * GAP) / n;
  const rows: { h: number; draw: (d: Drawing) => void }[] = [];
  for (let i = 0; i < fields.length; i += n) {
    const cells = fields.slice(i, i + n).map((f) => {
      const v = valueOf(f, answers, merge);
      return cell(kit, f, w, v.answer, v.shown);
    });
    const tall = Math.max(...cells.map((c) => c.h));
    rows.push({
      h: tall + 6,
      draw: (d) => cells.forEach((c, j) => c.draw(d, d.x + j * (w + GAP), d.top, w, tall)),
    });
  }
  // A short section stays on one page; a long one keeps its heading with its first row.
  const total = rows.reduce((a, r) => a + r.h, 0);
  kit.section(s.title, { intro: s.intro ? fillMerge(s.intro, merge) : null, keep: total <= SHORT_SECTION ? total : rows[0].h + 6 });
  for (const r of rows) kit.block(r.h, r.draw);
  kit.gap(4);
}

/** A bulleted line: a small square in the margin, the text wrapped beside it. The kit's list() is for numbered items. */
function bullet(kit: Kit, item: string) {
  const ls = kit.lines(item, 9, kit.width - 14);
  kit.block(ls.length * 11.6 + 4, (d) => {
    d.rect(d.x + 1, d.top - 9, 2.8, 2.8, { fill: INK });
    ls.forEach((l, i) => d.text(l, d.x + 13, d.top - 9.5 - i * 11.6, 9));
  });
}

function textSection(kit: Kit, s: TextSection, merge: Record<string, string>) {
  if (s.title) kit.section(s.title, { keep: 40 });
  const lines = fillMerge(s.body, merge).split('\n');
  let list: string[] = [];
  const flush = () => {
    for (const item of list) bullet(kit, item);
    list = [];
  };
  for (const raw of lines) {
    const l = raw.trim();
    if (l.startsWith('- ')) list.push(l.slice(2).trim());
    else {
      flush();
      if (l) kit.paragraph(l);
      else kit.gap(4);
    }
  }
  flush();
}

function signSection(kit: Kit, s: SignSection, signed: SignAnswers | undefined) {
  kit.section(s.title ?? 'Signatures', { keep: 70 });
  for (const g of s.signers) {
    const done = signed?.[g.key];
    kit.block(66, (d) => {
      const top = d.top;
      d.text(g.label, d.x, top - 9.2, LABEL_SZ, { color: INK });
      const sigW = d.width * 0.62;
      const y = top - 48;
      d.line(d.x, y, d.x + sigW, y, { color: INK, t: 0.7 });
      if (done?.name) d.text(done.name, d.x + 2, y + 3.5, 9, { bold: true });
      const dx = d.x + sigW + 18;
      d.line(dx, y, d.x + d.width, y, { color: INK, t: 0.7 });
      d.text('Date', dx, y - 9, 6.6, { color: MUTED });
      if (done?.date) d.text(done.date, dx + 2, y + 3.5, 9, { bold: true });
    });
  }
}

/** The template as a PDF for this job: blank, pre-filled from the job, or completed. */
export async function renderTemplate(i: RenderInput): Promise<Uint8Array> {
  const { template: t, job, answers } = i;
  if (answers && !i.draft) {
    const missing = missingRequired(t, answers);
    if (missing.length) throw new MissingAnswer(missing[0].label);
  }
  const merge = mergeValues(job);
  const kit = await newDocument({ code: t.code, label: t.code, title: t.title, revision: i.revision ?? issueOf(t.code), jobRef: job.ref, issued: job.issued, variant: job.variant, draft: i.draft });
  kit.header({ meta: [['Project', job.ref ?? '–'], ['Date', longDate(job.issued)]] });
  kit.idGrid([
    ['Address', job.address.join(', ')],
    ['Customer', job.customer],
    ['Installer', HELIAXIS_COMPANY.tradingName],
    ['MCS certification number', HELIAXIS_COMPANY.mcsNumber],
  ]);
  if (t.intro) kit.note(fillMerge(t.intro, merge));
  for (const s of t.sections) {
    if (s.type === 'fields') fieldsSection(kit, s, answers, merge);
    else if (s.type === 'text') textSection(kit, s, merge);
    else signSection(kit, s, i.signed);
  }
  return kit.save();
}

