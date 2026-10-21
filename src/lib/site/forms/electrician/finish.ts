/**
 * Finish: the completion gate (owner [2], FORMS 4.4, SPEC 2.12, screen P14). "Everything provided"
 * lists whatever is still missing on every other step (each line opens it); then the owner's three
 * conditions in his order (the inverter commissioned, on the customer's internet where possible,
 * the customer told the team will call tomorrow) and the sign-off. Nothing here is answered for them.
 * Type-only imports.
 */
import { electricianDeclaration, signDay } from '../../declaration';
import type { Field, FlagRule, FormCtx, Step } from '../types';
import { appWords, el, has, is, text } from './shared';

/** EF1 in words for the job: the inverter, the battery inverter, the charger, or the heat pump's supply. */
export function commissionedWords(c: FormCtx): string {
  if (has(c, 'solar')) return 'Is the inverter commissioned?';
  if (has(c, 'battery')) return 'Is the battery inverter commissioned?';
  if (has(c, 'ev')) return 'Is the charger commissioned?';
  if (has(c, 'heatpump')) return 'Is the supply energised and handed to the heat pump’s commissioning engineer?';
  return 'Is everything you installed working?';
}

export const toldWords = (c: FormCtx) =>
  `Have you told ${el(c).customer_first || 'the customer'} that one of the team will be in touch tomorrow to go through the handover pack and ${appWords(c)}?`;

export const FINISH_FIELDS: Field[] = [
  { key: 'EF0', type: 'AUTO', label: 'Everything provided', level: 'must', panel: 'missing' },
  { key: 'EF1', type: 'CONFIRM', label: 'Is the inverter commissioned?', say: commissionedWords, level: 'must' },
  {
    key: 'EF2',
    type: 'SEL',
    label: 'Is it connected to the customer’s internet?',
    level: 'must',
    options: [
      { key: 'yes', label: 'Yes' },
      { key: 'not_possible', label: 'Not possible' },
    ],
  },
  { key: 'EF2n', type: 'TEXT', label: 'Why not?', hint: 'The office will set the monitoring up remotely.', level: 'must', parent: 'EF2', show: (c) => is(c, 'EF2', 'not_possible') },
  {
    key: 'EF3',
    type: 'CONFIRM',
    label: 'Have you told the customer that one of the team will be in touch tomorrow to go through the handover pack and the solar app?',
    say: toldWords,
    level: 'must',
  },
];

/**
 * The sign-off, with the trade's declaration and a line for each record made from these sections
 * (WORDING-SPEC 0.7): what each record says, kept with the signature and printed from it.
 */
export const finishSig = (sections: readonly string[]): Field => ({
  key: 'EF_SIG',
  type: 'SIG',
  label: 'Sign off: everything is done',
  level: 'must',
  declaration: (c, at) => electricianDeclaration(c.address, sections, c.products, signDay(at)),
});
export const EF_SIG: Field = finishSig([]);

export const FINISH_FLAGS: FlagRule[] = [
  {
    code: 'EF2',
    key: 'EF2',
    severity: 'review',
    when: (c) => is(c, 'EF2', 'not_possible'),
    text: (c) => `Not on the customer’s internet${text(c, 'EF2n') ? `: ${text(c, 'EF2n')}` : ''}. Set up the monitoring remotely`,
  },
];

export const FINISH_STEP: Step = {
  key: 'finish',
  title: 'Finish',
  intro: 'When everything’s provided and these are ticked, sign off and your PO number comes straight back.',
  fields: FINISH_FIELDS,
};
