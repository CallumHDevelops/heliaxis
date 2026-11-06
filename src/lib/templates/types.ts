/**
 * The shape of a document template: the data a person builds in the template tool and the PDF renderer
 * (documents/templates/render.ts) draws in the Heliaxis document kit. Plain data only (no functions), so a
 * template can be stored, edited, versioned and compared. The site app's forms (site/forms) are code with
 * rules in them; these are for records whose answers are entered in HAP and printed as a document:
 * commissioning checklists, certificates, site forms.
 *
 * A template is a title and a list of sections. A section is a group of questions (fields), a passage of
 * text, or the signature lines. Text and pre-filled answers can use merge fields ({{customer}},
 * {{address}}…) that are filled from the job when the document is made.
 *
 * Pure: no I/O, no imports from the rest of the app.
 */

/** What kind of answer a field takes: how it is asked on screen and written in words in the document. */
export type FieldKind = 'text' | 'number' | 'yesno' | 'choice' | 'date' | 'long';
export const FIELD_KINDS: { kind: FieldKind; label: string; hint: string }[] = [
  { kind: 'text', label: 'Short text', hint: 'A name, a make and model, a word or two.' },
  { kind: 'number', label: 'Number', hint: 'A reading, with its unit (°C, bar, kW).' },
  { kind: 'yesno', label: 'Yes, no or not applicable', hint: 'Answered Yes, No or N/A.' },
  { kind: 'choice', label: 'One of a list', hint: 'One option picked from a list.' },
  { kind: 'date', label: 'Date', hint: 'A day, month and year.' },
  { kind: 'long', label: 'Long text', hint: 'Comments, over as many lines as needed.' },
];

/** What a yes/no/not applicable field is answered with. */
export type YesNo = 'yes' | 'no' | 'na';
export const YESNO: { value: YesNo; label: string }[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'na', label: 'N/A' },
];

/**
 * Only shown when an earlier field has this answer ("yes", "no", "na", or one of its options), or any of several.
 * An empty string among them means "not answered yet", so a question can show until its controlling answer says otherwise.
 */
export type ShowWhen = { key: string; is: string | string[] };

export type TemplateField = {
  /** Never changes once a document has been made from it (answers are kept by key): letters, digits and _, starting with a lowercase letter (hpType, v_l1n). */
  key: string;
  /** The question or field name as printed. */
  label: string;
  kind: FieldKind;
  /** A number's unit, printed with the figure: "°C", "bar", "kW". */
  unit?: string;
  /** A choice's options, in order. */
  options?: string[];
  /** A short line under the label, in small type. */
  hint?: string;
  /** Printed in the answer already, from the job: "{{customer}}". */
  prefill?: string;
  /** A yes/no field answered only Yes or No, with no N/A (the SimpliHeat checklist has none). */
  noNa?: boolean;
  /** Left empty, the document can't be finished on screen. */
  required?: boolean;
  /** Only asked when an earlier field has this answer. */
  showWhen?: ShowWhen;
};

export type FieldsSection = {
  type: 'fields';
  title: string;
  /** A line under the heading. */
  intro?: string;
  /** Fields side by side: 1, 2 or 3 across. */
  columns?: 1 | 2 | 3;
  /** The whole section is left out unless an earlier field has this answer. */
  showWhen?: ShowWhen;
  fields: TemplateField[];
};
/** A passage: blank lines part paragraphs; lines starting "- " make a list. Can use merge fields. */
export type TextSection = { type: 'text'; title?: string; body: string; showWhen?: ShowWhen };
/** Signature lines, each with a date. */
export type SignSection = { type: 'sign'; title?: string; signers: { key: string; label: string }[]; showWhen?: ShowWhen };
export type TemplateSection = FieldsSection | TextSection | SignSection;

/** The technologies a template is for (the job's products): empty means every job. */
export type TemplateTech = 'solar' | 'battery' | 'ev' | 'heatpump';

export type DocTemplate = {
  /** Which version of this format it is written in. */
  schema: 1;
  /** Heliaxis's own code, HX-HP-02: printed in the eyebrow and the footer. */
  code: string;
  title: string;
  /** What it is for, for the person choosing a template. Not printed. */
  purpose?: string;
  /** A note under the site box, before the first section. */
  intro?: string;
  tech: TemplateTech[];
  sections: TemplateSection[];
};

/** What a person has answered: by field key. Yes/no fields hold 'yes' | 'no' | 'na'; numbers and dates are text. */
export type Answers = Record<string, string | number | null | undefined>;

/** What a signature line holds once signed: the drawn signature (a PNG) if there is one, the name, and when (an ISO time). */
export type SignAnswers = Record<string, { png?: Uint8Array | string | null; name?: string; at?: string | null } | undefined>;
