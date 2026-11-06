import 'server-only';
import type { JobHead } from '@/lib/handover/inputs';
import { HELIAXIS_COMPANY } from '@/lib/subcontractors/agreement';
import { answerWords, fillMerge, missingRequired, visibility } from '@/lib/templates/rules';
import type { Answers, DocTemplate, FieldsSection, SignAnswers, SignSection, TemplateField, TextSection } from '@/lib/templates/types';
import { issueOf } from '../issue';
import { MCS_CONTACT } from '../handover/common';
import { INK, LINE, longDate, MissingAnswer, MUTED, newDocument, RED, type Drawing, type Kit } from '../pdf-kit';

/**
 * Draws a document template (src/lib/templates) in the document kit: the Heliaxis header and site box,
 * then each section, in the digital or print variant. The answers are entered in HAP, so a field prints
 * as the house documents do: the question, with its answer beneath it in bold. One left empty says "Not
 * answered" (in red on a draft). A pre-filled field (merge fields from the job) prints its value as an
 * answer. With no answers at all it draws every question empty: a preview of the template.
 * Nothing is drawn from outside the template and the job: no claims of its own.
 */

export type RenderInput = {
  template: DocTemplate;
  job: JobHead;
  /** Given: each field prints its answer, and a required one left empty stops a finished document (unless a draft). */
  answers?: Answers;
  /** Who has signed the signature lines, and when. */
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

/**
 * What a field prints as its answer: yes/no as words, a number with its unit, a date as "6 November
 * 2026", a choice as the option; the pre-fill from the job when there is no answer. Empty when there is none.
 */
export function valueText(f: TemplateField, answers: Answers | undefined, merge: Record<string, string>): string {
  const given = answers?.[f.key];
  const answer = given === null || given === undefined ? '' : String(given).trim();
  if (answer) return f.kind === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(answer) ? longDate(answer) : answerWords(f, answer);
  return f.prefill ? fillMerge(f.prefill, merge).trim() : '';
}

const LABEL_SZ = 8.6;
const LABEL_LH = 10.4;
const HINT_SZ = 7.3;
const HINT_LH = 9;
const VALUE_SZ = 9.4;
const VALUE_LH = 11.8;
const GAP = 14;
/** A section shorter than this (points) is kept on one page. */
const SHORT_SECTION = 230;

type Cell = { h: number; draw: (d: Drawing, x: number, top: number) => void };

/** One field: its question (and hint), with the answer beneath. Laid out first, so a row can be sized before it is drawn. */
function cell(kit: Kit, f: TemplateField, w: number, value: string, draft: boolean): Cell {
  const labelLines = kit.lines(f.label, LABEL_SZ, w);
  const hintLines = f.hint ? kit.lines(f.hint, HINT_SZ, w) : [];
  const head = labelLines.length * LABEL_LH + hintLines.length * HINT_LH;
  const set = value !== '';
  const body = set ? kit.lines(value, VALUE_SZ, w, true) : ['Not answered'];
  return {
    h: head + body.length * VALUE_LH + 9,
    draw(d, x, top) {
      labelLines.forEach((l, i) => d.text(l, x, top - 9.2 - i * LABEL_LH, LABEL_SZ, { color: INK }));
      hintLines.forEach((l, i) => d.text(l, x, top - 9.2 - labelLines.length * LABEL_LH - i * HINT_LH + 1.5, HINT_SZ, { color: MUTED }));
      body.forEach((l, i) => d.text(l, x, top - head - 10.5 - i * VALUE_LH, VALUE_SZ, set ? { bold: true } : { italic: true, color: draft ? RED : MUTED }));
    },
  };
}

function fieldsSection(kit: Kit, s: FieldsSection, shown: Set<string>, answers: Answers | undefined, merge: Record<string, string>, draft: boolean) {
  const fields = s.fields.filter((f) => shown.has(f.key));
  if (!fields.length) return;
  const n = s.columns ?? 1;
  const w = (kit.width - (n - 1) * GAP) / n;
  const rows: { h: number; draw: (d: Drawing) => void }[] = [];
  for (let i = 0; i < fields.length; i += n) {
    const cells = fields.slice(i, i + n).map((f) => cell(kit, f, w, valueText(f, answers, merge), draft));
    const h = Math.max(...cells.map((c) => c.h)) + 2;
    rows.push({
      h,
      draw: (d) => {
        cells.forEach((c, j) => c.draw(d, d.x + j * (w + GAP), d.top));
        d.line(d.x, d.top - h + 1, d.x + d.width, d.top - h + 1, { color: LINE, t: 0.4 });
      },
    });
  }
  // A short section stays on one page; a long one keeps its heading with its first row.
  const total = rows.reduce((a, r) => a + r.h, 0);
  kit.section(s.title, { intro: s.intro ? fillMerge(s.intro, merge) : null, keep: total <= SHORT_SECTION ? total : rows[0].h + 6 });
  for (const r of rows) kit.block(r.h, r.draw);
  kit.gap(6);
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

/** The kit's own signature blocks: the drawn signature (or typed name) on a baseline, "Signed on the Heliaxis app, 6 Nov 2026 17:41". */
async function signSection(kit: Kit, s: SignSection, signed: SignAnswers | undefined) {
  kit.section(s.title ?? 'Signatures', { keep: 100 });
  await kit.signatures(
    s.signers.map((g) => {
      const done = signed?.[g.key];
      return { title: g.label, png: done?.png ?? null, name: done?.name ?? '', at: done?.at ?? null };
    })
  );
}

/** The template as a PDF for this job: its questions with their answers, or empty as a preview. */
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
  const vis = visibility(t, answers);
  for (const [n, s] of t.sections.entries()) {
    if (!vis.sections[n]) continue;
    if (s.type === 'fields') fieldsSection(kit, s, vis.fields, answers, merge, !!i.draft);
    else if (s.type === 'text') textSection(kit, s, merge);
    else await signSection(kit, s, i.signed);
  }
  return kit.save();
}
