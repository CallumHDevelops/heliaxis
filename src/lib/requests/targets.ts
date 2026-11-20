import { SUMMARY_FIELDS, SWITCH_FIELDS } from '../handover/inputs';
import { templateByCode, templatesForProducts } from '../templates/registry';
import type { DocTemplate } from '../templates/types';

/**
 * What the office can ask an installer for, or fill in themselves, one question at a time (the
 * "Request installer information" and "Complete it myself" buttons on a pack item):
 * - a form template (HX-HP-02 heat pump commissioning…): answered, then signed, then printed into the pack;
 * - a handover item's details the office would otherwise type (HX-HO-09 where the switches are, HX-HO-15
 *   the G98 isolation switch, HX-HO-02 the summary's details): answered, and the item's own page is made from them.
 * Both are shown as a DocTemplate, so one step-by-step screen asks them all. Pure.
 */
export type TargetKind = 'form' | 'values';
export type Target = { code: string; kind: TargetKind; title: string; template: DocTemplate; /** The handover item it fills. */ slot: string | null };

const VALUES: Record<string, { title: string; intro: string; fields: (products: string[]) => DocTemplate['sections'][number] }> = {
  'HX-HO-09': {
    title: 'Where the switches are',
    intro: 'For the customer’s “How to switch your system off and on” page. Say where each switch is and how it’s labelled, so someone who has never seen it can find it.',
    fields: (products) => ({
      type: 'fields',
      title: 'The switches',
      fields: SWITCH_FIELDS.filter((x) => !x.for || products.includes(x.for)).map((x) => ({ key: x.key, label: x.label, kind: 'text' as const, hint: x.hint, required: true })),
    }),
  },
  'HX-HO-15': {
    title: 'The G98 isolation switch',
    intro: 'Where the lockable isolation switch is, as the DNO’s G98 form asks.',
    fields: () => ({ type: 'fields', title: 'Isolation switch', fields: [{ key: 'isolator', label: 'Lockable isolation switch: where it is', kind: 'text', hint: 'e.g. Next to the meter, in the hall cupboard', required: true }] }),
  },
  'HX-HO-02': {
    title: 'System summary details',
    intro: 'Only what the job doesn’t already say. Anything left empty uses the job’s own details.',
    fields: () => ({
      type: 'fields',
      title: 'Summary details',
      fields: SUMMARY_FIELDS.map((x) =>
        x.options
          ? { key: x.key, label: x.label, kind: 'choice' as const, hint: x.hint, options: x.options.map((o) => o.label) }
          : { key: x.key, label: x.label, kind: (x.key === 'comments' ? 'long' : 'text') as 'long' | 'text', hint: x.hint }
      ),
    }),
  },
};

/** A summary choice's stored key from the label the step-by-step screen answered with ("New installation" → "initial"). */
export function valueKeyOf(code: string, key: string, answer: string): string {
  if (code !== 'HX-HO-02') return answer;
  const f = SUMMARY_FIELDS.find((x) => x.key === key);
  return f?.options?.find((o) => o.label === answer)?.key ?? answer;
}
/** And back: a stored summary key as the label the screen shows. */
export function valueLabelOf(code: string, key: string, stored: string): string {
  if (code !== 'HX-HO-02') return stored;
  const f = SUMMARY_FIELDS.find((x) => x.key === key);
  return f?.options?.find((o) => o.key === stored)?.label ?? stored;
}

export function targetOf(code: string, products: string[]): Target | null {
  const v = VALUES[code];
  if (v) return { code, kind: 'values', title: v.title, slot: code, template: { schema: 1, code, title: v.title, intro: v.intro, tech: [], sections: [v.fields(products)] } };
  const t = templateByCode(code);
  // The form templates whose codes are handover items (HX-HP-02 commissioning, -03 cylinder, -04 handover) are printed into them.
  return t ? { code, kind: 'form', title: t.title, template: t, slot: /^HX-HP-0[234]$/.test(code) ? code : null } : null;
}

/** Everything that can be requested on a job with these technologies. */
export function targetsFor(products: string[]): Target[] {
  const values = Object.keys(VALUES)
    .filter((c) => c !== 'HX-HO-02' || products.some((p) => p === 'solar' || p === 'battery'))
    .filter((c) => c !== 'HX-HO-15' || products.some((p) => p === 'solar' || p === 'battery'));
  return [...values.map((c) => targetOf(c, products)!), ...templatesForProducts(products).map((t) => targetOf(t.code, products)!)];
}

/** The pack item's code → the request target that fills it (the same code here). */
export const isRequestable = (code: string, products: string[]) => targetsFor(products).some((t) => t.code === code);

/** The electrician's own records, made by their step-by-step site app: asking for them means putting the electrician on the job (the Site tab). */
export const SITE_ITEMS = ['HX-PV-01', 'HX-PV-02', 'HX-PV-03', 'HX-BAT-01', 'HX-BAT-02', 'HX-HO-04'];
