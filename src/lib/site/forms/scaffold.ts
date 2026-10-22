/**
 * The scaffolder's two forms on the same link (FORMS 3): putting it up (signed off, and the PO), and
 * taking it down (photos once it's all down, no second PO), with the flags they raise (FORMS 5.2).
 * After the erection sign-off the tag (SC3, SC3p) stays open: "Tagged now? Add the tag photo."
 * Keys never change once used. Type-only imports, and the declaration's words.
 */
import { tradeDeclaration } from '../declaration';
import type { Field, FlagRule, FormCtx, SiteForm } from './types';

const is = (c: FormCtx, k: string, v: unknown) => c.values[k] === v;
const text = (c: FormCtx, k: string) => (typeof c.values[k] === 'string' ? (c.values[k] as string).trim() : '');
const yn = (key: string, label: string, extra: Partial<Field> = {}): Field => ({ key, type: 'YN', label, level: 'must', ...extra });
const SIDE: Record<string, string> = { front: 'Front', rear: 'Rear', left: 'Left side', right: 'Right side' };

const up: Field[] = [
  yn('SC1', 'Any marks on the property prior to erection of scaffolding?'),
  { key: 'SC1p', type: 'PHOTOS', label: 'Photos of the marks', hint: 'Take as many as you need.', level: 'must', need: 1, parent: 'SC1', show: (c) => is(c, 'SC1', 'yes') },
  { key: 'SC1n', type: 'TEXT', label: 'Where are they?', level: 'should', parent: 'SC1', show: (c) => is(c, 'SC1', 'yes') },
  yn('SC2', 'Has the scaffolding been erected to suit the solar design?', {
    note: (c) => (c.sides.length ? `The survey has it on the ${c.sides.map((s) => SIDE[s]?.toLowerCase() ?? s).join(', ')}. The roof layout is in the job's drawings.` : 'The roof layout is in the job’s drawings.'),
  }),
  { key: 'SC2n', type: 'TEXT', label: 'What’s different?', level: 'must', parent: 'SC2', show: (c) => is(c, 'SC2', 'no') },
  { key: 'SCX1', type: 'PHOTOS', label: 'Photo of the finished scaffold from each side it’s on', level: 'must', need: 1, perSide: true },
  yn('SC3', 'Has the scaffolding been tagged?', {
    hint: 'Yes: a photo of the tag. No: it needs tagging.',
    fix: { when: 'no', text: 'Needs tagging. The office is told now: nobody uses the scaffold until it’s tagged.' },
    late: true,
  }),
  { key: 'SC3p', type: 'PHOTOS', label: 'Photo of the tag', level: 'must', need: 1, parent: 'SC3', show: (c) => is(c, 'SC3', 'yes'), late: true },
  yn('SC4', 'Has a ladder been left on site to gain access to the scaffold?'),
  yn('SCX2', 'Did anything get marked or damaged while putting it up?', { level: 'should' }),
  { key: 'SCX2p', type: 'PHOTOS', label: 'Photos of it', level: 'must', need: 1, parent: 'SCX2', show: (c) => is(c, 'SCX2', 'yes') },
  { key: 'SCX2n', type: 'TEXT', label: 'What happened?', level: 'must', parent: 'SCX2', show: (c) => is(c, 'SCX2', 'yes') },
  yn('SCX3', 'Is any of the scaffold on the pavement or road?', { level: 'should' }),
  yn('SCX3a', 'Licence displayed and lights fitted?', { parent: 'SCX3', show: (c) => is(c, 'SCX3', 'yes') }),
  yn('SCX4', 'Ladder guard fitted for out of hours?', { level: 'should' }),
  { key: 'SC5', type: 'LONG', label: 'Any other notes', level: 'optional' },
];

const down: Field[] = [
  yn('SS1', 'Is the scaffold all down and taken away?'),
  { key: 'SS1n', type: 'TEXT', label: 'What’s left?', level: 'must', parent: 'SS1', show: (c) => is(c, 'SS1', 'no') },
  { key: 'SS2', type: 'PHOTOS', label: 'Photos once it is all down, each side it was on', hint: 'Same spots as your photos when it went up.', level: 'must', need: 1, perSide: true },
  yn('SS3', 'Any marks or damage on the property now it’s down?', { note: (c) => ((c.photos.SC1p ?? 0) > 0 ? 'Compare with the marks photographed before it went up.' : null) }),
  { key: 'SS3p', type: 'PHOTOS', label: 'Photos of the marks', level: 'must', need: 1, parent: 'SS3', show: (c) => is(c, 'SS3', 'yes') },
  { key: 'SS3n', type: 'TEXT', label: 'Where are they?', level: 'must', parent: 'SS3', show: (c) => is(c, 'SS3', 'yes') },
  yn('SS4', 'Ground, paths and gutters left clear of fittings, clips and boards?', { level: 'should' }),
  { key: 'SS4n', type: 'TEXT', label: 'What’s left?', level: 'must', parent: 'SS4', show: (c) => is(c, 'SS4', 'no') },
  { key: 'SS5', type: 'LONG', label: 'Notes', level: 'optional' },
];

const upFlags: FlagRule[] = [
  { code: 'SC1', key: 'SC1', severity: 'review', when: (c) => is(c, 'SC1', 'yes'), text: (c) => `Marks on the property before the scaffold went up${text(c, 'SC1n') ? `: ${text(c, 'SC1n')}` : ''}` },
  { code: 'SC2', key: 'SC2', severity: 'urgent', when: (c) => is(c, 'SC2', 'no'), text: (c) => `Scaffold not put up to suit the design${text(c, 'SC2n') ? `: ${text(c, 'SC2n')}` : ''}` },
  { code: 'SC3', key: 'SC3', severity: 'urgent', when: (c) => is(c, 'SC3', 'no'), text: () => 'Needs tagging: the scaffold isn’t to be used until it’s tagged' },
  { code: 'SC4', key: 'SC4', severity: 'urgent', when: (c) => is(c, 'SC4', 'no'), text: () => 'No ladder left on site: the trades can’t get up' },
  { code: 'SCX2', key: 'SCX2', severity: 'review', when: (c) => is(c, 'SCX2', 'yes'), text: (c) => `Marked or damaged while putting it up${text(c, 'SCX2n') ? `: ${text(c, 'SCX2n')}` : ''}` },
  { code: 'SCX3', key: 'SCX3a', severity: 'urgent', when: (c) => is(c, 'SCX3', 'yes') && is(c, 'SCX3a', 'no'), text: () => 'On the pavement or road without a licence or lights' },
];

const downFlags: FlagRule[] = [
  { code: 'SS1', key: 'SS1', severity: 'review', when: (c) => is(c, 'SS1', 'no'), text: (c) => `Scaffold not all taken away${text(c, 'SS1n') ? `: ${text(c, 'SS1n')}` : ''}` },
  {
    code: 'SS3',
    key: 'SS3',
    // New damage is urgent; marks already photographed before it went up are for the office to compare.
    severity: (c) => (is(c, 'SC1', 'yes') ? 'review' : 'urgent'),
    when: (c) => is(c, 'SS3', 'yes'),
    text: (c) => `Marks or damage after the scaffold came down${text(c, 'SS3n') ? `: ${text(c, 'SS3n')}` : ''}${is(c, 'SC1', 'yes') ? ' (compare with the marks before it went up)' : ''}`,
  },
  { code: 'SS4', key: 'SS4', severity: 'review', when: (c) => is(c, 'SS4', 'no'), text: (c) => `Fittings, clips or boards left behind${text(c, 'SS4n') ? `: ${text(c, 'SS4n')}` : ''}` },
];

export const SCAFFOLD_UP: SiteForm = {
  id: 'scaffold-erection',
  stage: 'erection',
  title: 'Scaffold up',
  minutes: 5,
  steps: [{ key: 'up', title: 'Putting it up', fields: up }],
  sig: {
    key: 'SC_SIG',
    type: 'SIG',
    label: 'Signed off as complete',
    level: 'must',
    declaration: (c) => tradeDeclaration('scaffolder', c.address),
  },
  flags: upFlags,
};

export const SCAFFOLD_DOWN: SiteForm = {
  id: 'scaffold-strike',
  stage: 'strike',
  title: 'Scaffold down',
  minutes: 5,
  after: 'erection',
  steps: [{ key: 'down', title: 'Taking it down', fields: down }],
  sig: {
    key: 'SS_SIG',
    type: 'SIG',
    label: 'Signed off as down',
    level: 'must',
    declaration: (c) => tradeDeclaration('scaffolder', c.address),
  },
  flags: downFlags,
};
