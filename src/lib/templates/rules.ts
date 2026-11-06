/**
 * What can be said about a template without drawing it: the merge fields, whether a template is valid to
 * save, which fields show for a set of answers, and how an answer reads in words. Pure.
 */
import type { Answers, DocTemplate, ShowWhen, TemplateField } from './types';

/** The job and company facts a template can merge in, by the name used between double braces. */
export const MERGE_FIELDS: { key: string; label: string }[] = [
  { key: 'project_ref', label: 'Project reference' },
  { key: 'customer', label: 'Customer name' },
  { key: 'address', label: 'Site address' },
  { key: 'postcode', label: 'Site postcode' },
  { key: 'date', label: 'Date the document is made' },
  { key: 'company', label: 'Heliaxis, the installer' },
  { key: 'company_address', label: 'Heliaxis address' },
  { key: 'company_phone', label: 'Heliaxis phone' },
  { key: 'company_email', label: 'Heliaxis email' },
  { key: 'mcs_number', label: 'Heliaxis MCS certification number' },
  { key: 'mcs_contact', label: 'MCS contact details' },
];
const MERGE_KEYS = new Set(MERGE_FIELDS.map((m) => m.key));

const MERGE = /\{\{\s*([a-z_]+)\s*\}\}/g;

/** The merge fields a piece of text uses (known or not). */
export const mergeKeysIn = (s: string | undefined): string[] => [...(s ?? '').matchAll(MERGE)].map((m) => m[1]);

/** Fill the merge fields from the values; one with no value is left empty. */
export const fillMerge = (s: string, values: Record<string, string | null | undefined>): string => s.replace(MERGE, (_, k: string) => values[k] ?? '');

export const CODE_PATTERN = /^HX-[A-Z]{2,4}-\d{2}$/;
const KEY_PATTERN = /^[a-z][A-Za-z0-9_]{0,39}$/;

/** The answers a "show when" matches: one, or any of several. */
export const whenValues = (w: ShowWhen): string[] => (Array.isArray(w.is) ? w.is : [w.is]);

/** Every field in a template, in order. */
export const allFields = (t: DocTemplate): TemplateField[] => t.sections.flatMap((s) => (s.type === 'fields' ? s.fields : []));

/**
 * Why a template can't be saved yet, in plain words (empty when it can). Keys are unique and never
 * reused; a "show when" points at an earlier field and a value that field can have; merge fields are
 * ones that exist.
 */
export function validateTemplate(t: DocTemplate): string[] {
  const out: string[] = [];
  if (!CODE_PATTERN.test(t.code)) out.push('The code looks like HX-HP-02: HX, a dash, two to four letters, a dash, two digits.');
  if (!t.title.trim()) out.push('Give the template a title.');
  else if (t.title.length > 120) out.push('The title is too long (120 characters at most).');
  if (!t.sections.length) out.push('Add at least one section.');
  for (const m of [...mergeKeysIn(t.intro)]) if (!MERGE_KEYS.has(m)) out.push(`The introduction uses {{${m}}}, which isn’t a merge field.`);

  const seen = new Map<string, TemplateField>();
  const signKeys = new Set<string>();
  /** A "show when" must point at an earlier field, and at an answer that field can have. */
  const checkWhen = (name: string, w: ShowWhen) => {
    const dep = seen.get(w.key);
    if (!dep) {
      out.push(`${name} is shown when “${w.key}” is answered, which isn’t an earlier field.`);
      return;
    }
    for (const v of whenValues(w)) {
      if (v === '') continue; // "not answered yet"
      if (dep.kind === 'yesno' ? !['yes', 'no', 'na'].includes(v) : dep.kind === 'choice' ? !(dep.options ?? []).includes(v) : !v.trim())
        out.push(`${name} is shown when “${dep.label}” is “${v}”, which that field can’t be.`);
    }
  };
  t.sections.forEach((s, i) => {
    const where = `Section ${i + 1}${'title' in s && s.title ? ` (${s.title})` : ''}`;
    if (s.showWhen) checkWhen(where, s.showWhen);
    if (s.type === 'fields') {
      if (!s.title.trim()) out.push(`${where} needs a heading.`);
      if (!s.fields.length) out.push(`${where} has no fields.`);
      if (s.columns !== undefined && ![1, 2, 3].includes(s.columns)) out.push(`${where}: columns must be 1, 2 or 3.`);
      for (const f of s.fields) {
        const name = f.label.trim() ? `“${f.label.trim()}”` : `A field in ${where}`;
        if (!KEY_PATTERN.test(f.key)) out.push(`${name} has a key that isn’t allowed (letters, digits and _, starting with a lowercase letter).`);
        else if (seen.has(f.key)) out.push(`${name} reuses the key “${f.key}”.`);
        if (!f.label.trim()) out.push(`A field in ${where} has no label.`);
        else if (f.label.length > 200) out.push(`${name} has a label that is too long (200 characters at most).`);
        if (f.kind === 'choice') {
          const opts = (f.options ?? []).map((o) => o.trim());
          if (opts.length < 2) out.push(`${name} needs at least two options.`);
          else if (opts.some((o) => !o)) out.push(`${name} has an empty option.`);
          else if (new Set(opts).size !== opts.length) out.push(`${name} has the same option twice.`);
        }
        if (f.unit !== undefined && f.unit.length > 12) out.push(`${name}: the unit is too long (12 characters at most).`);
        for (const m of mergeKeysIn(f.prefill)) if (!MERGE_KEYS.has(m)) out.push(`${name} pre-fills {{${m}}}, which isn’t a merge field.`);
        if (f.showWhen) checkWhen(name, f.showWhen);
        if (KEY_PATTERN.test(f.key) && !seen.has(f.key)) seen.set(f.key, f);
      }
    } else if (s.type === 'text') {
      if (!s.body.trim()) out.push(`${where} is empty.`);
      for (const m of mergeKeysIn(s.body)) if (!MERGE_KEYS.has(m)) out.push(`${where} uses {{${m}}}, which isn’t a merge field.`);
    } else {
      if (!s.signers.length) out.push(`${where} has no signature lines.`);
      for (const g of s.signers) {
        if (!g.label.trim()) out.push(`${where} has a signature line with no label.`);
        if (!KEY_PATTERN.test(g.key)) out.push(`${where}: the signature key “${g.key}” isn’t allowed.`);
        else if (signKeys.has(g.key) || seen.has(g.key)) out.push(`${where} reuses the key “${g.key}”.`);
        signKeys.add(g.key);
      }
    }
  });
  return out;
}

/**
 * What is asked, given the answers: which sections show and which fields. A section or field with a "show
 * when" shows only if the field it points at is itself shown and has that answer, so a question that depends on
 * a hidden question is hidden too. With no answers at all (a preview of the template) everything shows.
 */
export function visibility(t: DocTemplate, answers: Answers | undefined): { sections: boolean[]; fields: Set<string> } {
  const fields = new Set<string>();
  const sections: boolean[] = [];
  const ok = (w: ShowWhen | undefined) => !w || !answers || (fields.has(w.key) && whenValues(w).includes(String(answers[w.key] ?? '')));
  for (const s of t.sections) {
    const shown = ok(s.showWhen);
    sections.push(shown);
    if (s.type === 'fields' && shown) for (const f of s.fields) if (ok(f.showWhen)) fields.add(f.key);
  }
  return { sections, fields };
}

/** An answer as printed: yes/no as words, a number with its unit, otherwise what was typed. Empty when unanswered. */
export function answerWords(f: TemplateField, v: string | number | null | undefined): string {
  if (v === null || v === undefined || String(v).trim() === '') return '';
  if (f.kind === 'yesno') return v === 'yes' ? 'Yes' : v === 'no' ? 'No' : v === 'na' ? 'N/A' : String(v);
  if (f.kind === 'number' && f.unit) return `${v} ${f.unit}`;
  return String(v);
}

/** The required fields still unanswered (the ones that are asked). Empty for a preview. */
export function missingRequired(t: DocTemplate, answers: Answers): TemplateField[] {
  const { fields } = visibility(t, answers);
  return allFields(t).filter((f) => fields.has(f.key) && f.required && String(answers[f.key] ?? '').trim() === '');
}
