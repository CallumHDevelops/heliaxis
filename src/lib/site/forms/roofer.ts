/**
 * The roofer's form (FORMS 2): the owner's questions in his order and the recommended extras RX1–RX9,
 * laid out by time on site (FORMS 2.3), and the flags they raise (FORMS 5.1). No panel serials: the
 * owner doesn't need the roofer to scan them (21 Oct); the data badge photo, model and Voc stay.
 * Solar jobs only. Keys never change once used. Type-only imports, and the declaration's words.
 */
import { tradeDeclaration } from '../declaration';
import type { Field, FlagRule, FormCtx, LabelReadResult, SiteForm } from './types';

const is = (c: FormCtx, k: string, v: unknown) => c.values[k] === v;
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const text = (c: FormCtx, k: string) => (typeof c.values[k] === 'string' ? (c.values[k] as string).trim() : '');
const sum = (v: unknown) => (Array.isArray(v) ? v.reduce((a: number, x) => a + (num(x) ?? 0), 0) : 0);
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** The latest good read of a photo slot (the badge, the optimiser plan). */
const readOf = (c: FormCtx, key: string): LabelReadResult | null => {
  const r = [...c.reads].reverse().find((x) => x.key === key && x.status === 'read');
  return r?.result ?? null;
};
const unreadable = (c: FormCtx, key: string) => {
  const last = [...c.reads].reverse().find((x) => x.key === key);
  return last?.status === 'unreadable';
};
/** Models compared loosely: case, spaces and dashes don't count, and one may contain the other. */
const sameModel = (a: string | null | undefined, b: string | null | undefined) => {
  const n = (s: string) => s.toLowerCase().replace(/[\s\-_/]+/g, '');
  if (!a || !b) return true;
  return n(a).includes(n(b)) || n(b).includes(n(a));
};
/** Panels fitted: the roofer's count, else the design's. */
const panelsFitted = (c: FormCtx) => num(c.values.RX5) ?? c.system.panel_count;
const stringsNow = (c: FormCtx) => num(c.values.RF10) ?? c.design.strings_design?.length ?? 1;

const FIX = 'Please put this right before you come down.';
const yn = (key: string, label: string, extra: Partial<Field> = {}): Field => ({ key, type: 'YN', label, level: 'must', ...extra });

const fields = {
  before: [
    { key: 'RF1', type: 'PHOTOS', label: 'Before you start', hint: 'The whole roof face, then close-ups of anything already damaged.', level: 'must', need: 2 },
    yn('RF5', 'Any broken tiles before works commenced?'),
    { key: 'RF5p', type: 'PHOTOS', label: 'Photos of the broken tiles', hint: 'Take as many as you need.', level: 'must', need: 1, parent: 'RF5', show: (c) => is(c, 'RF5', 'yes') },
    { key: 'RF5n', type: 'TEXT', label: 'How many, and where?', level: 'should', parent: 'RF5', show: (c) => is(c, 'RF5', 'yes') },
    {
      key: 'RF12',
      type: 'PHOTOS',
      label: 'Photo of the label on the back of a panel',
      hint: 'Straight on, close enough that every number can be read. Easiest before the panel goes up.',
      level: 'must',
      need: 1,
      label_photo: true,
      read: true,
    },
    {
      key: 'RF13',
      type: 'TEXT',
      label: 'Panel model',
      level: 'must',
      suggest: (c) => {
        const read = readOf(c, 'RF12')?.model;
        if (read) return { v: read, src: 'photo', text: read };
        return c.system.panel_model ? { v: c.system.panel_model, src: 'design', text: c.system.panel_model } : null;
      },
    },
    {
      key: 'RF14',
      type: 'NUM',
      label: 'Voc, open-circuit voltage',
      hint: 'Printed on the label as Voc.',
      level: 'must',
      unit: 'V',
      dp: 1,
      min: 10,
      max: 100,
      suggest: (c) => {
        const v = readOf(c, 'RF12')?.panel?.voc_v;
        return typeof v === 'number' ? { v, src: 'photo', text: `${v} V` } : null;
      },
    },
  ],
  fixings: [
    {
      key: 'RF2',
      type: 'PHOTOS',
      label: 'After the roof hooks or brackets and rails are on, before the panels go on',
      hint: 'Show the hooks sitting in the rafters.',
      level: 'must',
      need: 2,
      note: (c) => (c.design.mounting === 'in_roof' ? 'In-roof kit: after the trays and flashings are fitted.' : null),
    },
    yn('RX1', 'Are all the roof hooks fixed into rafters (not battens) at the spacing the design or kit instructions give?'),
    { key: 'RX1n', type: 'TEXT', label: 'What’s different, and why?', level: 'must', parent: 'RX1', show: (c) => is(c, 'RX1', 'no') },
    { key: 'RX1p', type: 'PHOTOS', label: 'A photo of it', level: 'should', need: 1, parent: 'RX1', show: (c) => is(c, 'RX1', 'no') },
  ],
  panels: [
    {
      key: 'RF10',
      type: 'NUM',
      label: 'How many strings?',
      level: 'must',
      chips: [1, 2, 3, 4],
      min: 1,
      max: 12,
      suggest: (c) => (c.design.strings_design?.length ? { v: c.design.strings_design.length, src: 'design', text: String(c.design.strings_design.length) } : null),
    },
    {
      key: 'RF11',
      type: 'PER_STRING',
      label: 'Panels on string',
      level: 'must',
      min: 1,
      max: 40,
      strings: stringsNow,
      suggest: (c) => {
        const d = c.design.strings_design;
        return d?.length && d.length === stringsNow(c) ? { v: d, src: 'design', text: d.join(' + ') } : null;
      },
      note: (c) => {
        const total = sum(c.values.RF11);
        if (!total) return null;
        const fitted = num(c.values.RX5);
        const design = c.system.panel_count;
        return `Total ${total}${fitted !== null ? ` · ${plural(fitted, 'panel')} fitted` : ''}${design ? ` · the design has ${design}` : ''}`;
      },
    },
    {
      key: 'RX5',
      type: 'NUM',
      label: 'How many panels did you fit?',
      level: 'must',
      min: 1,
      max: 200,
      suggest: (c) => (c.system.panel_count ? { v: c.system.panel_count, src: 'design', text: String(c.system.panel_count) } : null),
    },
    yn('RF6', 'Are the panels strung as the design shows?', {
      note: (c) => (c.design.strings_design?.length ? `The design: ${c.design.strings_design.join(' + ')}` : null),
    }),
    { key: 'RF6n', type: 'TEXT', label: 'What’s different?', level: 'must', parent: 'RF6', show: (c) => is(c, 'RF6', 'no') },
    { key: 'RF6p', type: 'PHOTOS', label: 'A photo, if it helps', level: 'should', need: 0, parent: 'RF6', show: (c) => is(c, 'RF6', 'no') },
    yn('RF7', 'Have optimisers been fitted?', {
      hint: 'No: nothing else is needed.',
      note: (c) => (c.design.optimisers === true ? 'The design has optimisers.' : c.design.optimisers === false ? 'The design has none.' : null),
    }),
    // FORMS 0.7: "Have you create a optimiser layout plan" [sic].
    yn('RF7a', 'Have you created an optimiser layout plan and recovered all the stickers from the optimisers?', { parent: 'RF7', show: (c) => is(c, 'RF7', 'yes') }),
    {
      key: 'RF7b',
      type: 'PHOTOS',
      label: 'Photo of the optimiser layout plan',
      hint: 'Please ensure images are clear and readable.',
      level: 'must',
      need: 1,
      parent: 'RF7a',
      show: (c) => is(c, 'RF7a', 'yes'),
      label_photo: true,
      read: true,
      note: (c) => {
        const read = readOf(c, 'RF7b');
        if (!read) return null;
        const expected = panelsFitted(c);
        return `We read ${plural(read.serials.length, 'optimiser serial')}.${expected ? ` ${expected} expected.` : ''}`;
      },
    },
    yn('RF8', 'Have all DC cables been sufficiently clipped to the panels with the appropriate method?', { fix: { when: 'no', text: FIX } }),
    { key: 'RF8n', type: 'TEXT', label: 'If it still can’t be done: why not?', level: 'must', parent: 'RF8', show: (c) => is(c, 'RF8', 'no') },
    { key: 'RF9', type: 'CONFIRM', label: 'Confirm there are no DC connectors touching the roof.', level: 'must', cant: 'I can’t confirm this', fix: { when: 'cant', text: FIX } },
    { key: 'RF9n', type: 'TEXT', label: 'If it still can’t be done: why not?', level: 'must', parent: 'RF9', show: (c) => is(c, 'RF9', 'cant') },
    yn('RX4', 'Is the cable entry through the roof weather-sealed?'),
    { key: 'RX4p', type: 'PHOTOS', label: 'Photo of the cable entry', level: 'must', need: 1 },
    yn('RX7', 'Is the bird mesh fitted all the way round?', { show: (c) => c.design.bird_mesh === true }),
    { key: 'RX7p', type: 'PHOTOS', label: 'Photo of the bird mesh', level: 'should', need: 1, show: (c) => c.design.bird_mesh === true },
  ],
  finished: [
    { key: 'RF3', type: 'PHOTOS', label: 'When you’ve finished', hint: 'The whole array, the edges, and where the cable goes into the roof.', level: 'must', need: 3 },
    yn('RF4', 'Any issues detected while on the roof?'),
    { key: 'RF4n', type: 'TEXT', label: 'What did you find?', level: 'must', parent: 'RF4', show: (c) => is(c, 'RF4', 'yes') },
    { key: 'RF4p', type: 'PHOTOS', label: 'Photos of it', level: 'must', need: 1, parent: 'RF4', show: (c) => is(c, 'RF4', 'yes') },
    yn('RX2', 'Have the tiles been dressed back flat over every hook, with no lifted tiles?'),
    { key: 'RX2n', type: 'TEXT', label: 'Where?', level: 'must', parent: 'RX2', show: (c) => is(c, 'RX2', 'no') },
    { key: 'RX2p', type: 'PHOTOS', label: 'A photo of it', level: 'must', need: 1, parent: 'RX2', show: (c) => is(c, 'RX2', 'no') },
    yn('RX3', 'Did any tiles break during the works?', { level: 'should' }),
    { key: 'RX3c', type: 'NUM', label: 'How many?', level: 'must', min: 1, max: 200, parent: 'RX3', show: (c) => is(c, 'RX3', 'yes') },
    yn('RX3r', 'Replaced with matching tiles?', { parent: 'RX3', show: (c) => is(c, 'RX3', 'yes') }),
    { key: 'RX3p', type: 'PHOTOS', label: 'Photos of them', level: 'must', need: 1, parent: 'RX3', show: (c) => is(c, 'RX3', 'yes') },
    yn('RX6', 'Anything different from the design (layout, which roof, panel positions)?', { level: 'should' }),
    { key: 'RX6n', type: 'TEXT', label: 'What’s different?', level: 'must', parent: 'RX6', show: (c) => is(c, 'RX6', 'yes') },
    { key: 'RX6p', type: 'PHOTOS', label: 'A photo of it', level: 'should', need: 1, parent: 'RX6', show: (c) => is(c, 'RX6', 'yes') },
    yn('RX8', 'Is the site tidy: gutters clear, no tile offcuts, packaging taken away?', { level: 'should' }),
    { key: 'RX8n', type: 'TEXT', label: 'What’s left?', level: 'must', parent: 'RX8', show: (c) => is(c, 'RX8', 'no') },
    yn('RX9', 'Any accidents, injuries or near misses today?'),
    { key: 'RX9n', type: 'LONG', label: 'What happened?', level: 'must', parent: 'RX9', show: (c) => is(c, 'RX9', 'yes') },
  ],
} satisfies Record<string, Field[]>;

const flags: FlagRule[] = [
  { code: 'RF4', key: 'RF4', severity: 'review', when: (c) => is(c, 'RF4', 'yes'), text: (c) => `Issues found on the roof${text(c, 'RF4n') ? `: ${text(c, 'RF4n')}` : ''}` },
  { code: 'RF5', key: 'RF5', severity: 'review', when: (c) => is(c, 'RF5', 'yes'), text: (c) => `Broken tiles before work started${text(c, 'RF5n') ? `: ${text(c, 'RF5n')}` : ''}` },
  { code: 'RF6', key: 'RF6', severity: 'urgent', when: (c) => is(c, 'RF6', 'no'), text: (c) => `Not strung as the design shows${text(c, 'RF6n') ? `: ${text(c, 'RF6n')}` : ''}` },
  {
    code: 'RF7',
    key: 'RF7',
    severity: 'urgent',
    when: (c) => c.design.optimisers !== null && (is(c, 'RF7', 'yes') || is(c, 'RF7', 'no')) && is(c, 'RF7', 'yes') !== c.design.optimisers,
    text: (c) => (is(c, 'RF7', 'yes') ? 'Optimisers fitted, but the design has none' : 'The design has optimisers, but none were fitted'),
  },
  { code: 'RF7a', key: 'RF7a', severity: 'urgent', when: (c) => is(c, 'RF7a', 'no'), text: () => 'No optimiser layout plan, or the stickers weren’t recovered' },
  {
    code: 'RF7b',
    key: 'RF7b',
    severity: 'review',
    when: (c) => {
      if (unreadable(c, 'RF7b')) return true;
      const read = readOf(c, 'RF7b');
      const expected = panelsFitted(c);
      return !!read && !!expected && read.serials.length !== expected;
    },
    text: (c) => {
      const read = readOf(c, 'RF7b');
      return read ? `Optimiser plan: ${plural(read.serials.length, 'serial')} read, ${panelsFitted(c)} expected` : 'The optimiser plan photo couldn’t be read';
    },
  },
  {
    code: 'RF8',
    key: 'RF8',
    severity: (c) => (text(c, 'RF8n') ? 'urgent' : 'stop'),
    when: (c) => is(c, 'RF8', 'no'),
    text: (c) => (text(c, 'RF8n') ? `DC cables not clipped: ${text(c, 'RF8n')}` : 'DC cables not clipped: put it right, or say why it can’t be done'),
  },
  {
    code: 'RF9',
    key: 'RF9',
    severity: (c) => (text(c, 'RF9n') ? 'urgent' : 'stop'),
    when: (c) => is(c, 'RF9', 'cant'),
    text: (c) => (text(c, 'RF9n') ? `DC connectors may be touching the roof: ${text(c, 'RF9n')}` : 'DC connectors touching the roof: put it right, or say why it can’t be done'),
  },
  {
    code: 'RF11',
    key: 'RF11',
    severity: 'review',
    when: (c) => {
      const total = sum(c.values.RF11);
      const fitted = num(c.values.RX5);
      const design = c.system.panel_count;
      return total > 0 && ((fitted !== null && total !== fitted) || (!!design && total !== design));
    },
    text: (c) => {
      const total = sum(c.values.RF11);
      const fitted = num(c.values.RX5);
      const design = c.system.panel_count;
      return `Panels per string add up to ${total}${fitted !== null && total !== fitted ? `, but ${fitted} fitted` : ''}${design && total !== design ? `; the design has ${design}` : ''}`;
    },
  },
  {
    code: 'RF13',
    key: 'RF13',
    severity: 'review',
    when: (c) => !!text(c, 'RF13') && (!sameModel(text(c, 'RF13'), c.system.panel_model) || !sameModel(text(c, 'RF13'), readOf(c, 'RF12')?.model)),
    text: (c) => `Panel model ${text(c, 'RF13')} isn’t the ${!sameModel(text(c, 'RF13'), c.system.panel_model) ? `design’s (${c.system.panel_model})` : `one on the label (${readOf(c, 'RF12')?.model})`}`,
  },
  {
    code: 'RF14',
    key: 'RF14',
    severity: 'review',
    when: (c) => {
      const typed = num(c.values.RF14);
      const read = readOf(c, 'RF12')?.panel?.voc_v;
      return typed !== null && typeof read === 'number' && Math.abs(typed - read) > 0.05;
    },
    text: (c) => `Voc ${c.values.RF14} V isn’t the ${readOf(c, 'RF12')?.panel?.voc_v} V on the label`,
  },
  { code: 'RX1', key: 'RX1', severity: 'urgent', when: (c) => is(c, 'RX1', 'no'), text: (c) => `Roof hooks not all into rafters at the right spacing${text(c, 'RX1n') ? `: ${text(c, 'RX1n')}` : ''}` },
  { code: 'RX2', key: 'RX2', severity: 'urgent', when: (c) => is(c, 'RX2', 'no'), text: (c) => `Tiles not dressed flat${text(c, 'RX2n') ? `: ${text(c, 'RX2n')}` : ''}` },
  { code: 'RX3', key: 'RX3', severity: 'review', when: (c) => is(c, 'RX3', 'yes') && is(c, 'RX3r', 'no'), text: (c) => `${num(c.values.RX3c) ?? 'Some'} tiles broken during the works and not replaced` },
  { code: 'RX4', key: 'RX4', severity: 'urgent', when: (c) => is(c, 'RX4', 'no'), text: () => 'Cable entry through the roof not weather-sealed' },
  { code: 'RX6', key: 'RX6', severity: 'urgent', when: (c) => is(c, 'RX6', 'yes'), text: (c) => `Different from the design${text(c, 'RX6n') ? `: ${text(c, 'RX6n')}` : ''}` },
  { code: 'RX7', key: 'RX7', severity: 'review', when: (c) => is(c, 'RX7', 'no'), text: () => 'Bird mesh not fitted all the way round' },
  { code: 'RX8', key: 'RX8', severity: 'review', when: (c) => is(c, 'RX8', 'no'), text: (c) => `Site not left tidy${text(c, 'RX8n') ? `: ${text(c, 'RX8n')}` : ''}` },
  { code: 'RX9', key: 'RX9', severity: 'urgent', when: (c) => is(c, 'RX9', 'yes'), text: (c) => `Accident, injury or near miss${text(c, 'RX9n') ? `: ${text(c, 'RX9n')}` : ''}` },
];

export const ROOFER: SiteForm = {
  id: 'roofer',
  stage: 'main',
  title: 'Roof checks',
  minutes: 10,
  steps: [
    { key: 'before', title: 'Before you start', fields: fields.before },
    { key: 'fixings', title: 'Fixings on', fields: fields.fixings },
    { key: 'panels', title: 'Panels and cables', fields: fields.panels },
    { key: 'finished', title: 'Finished', fields: fields.finished },
  ],
  sig: {
    key: 'RF_SIG',
    type: 'SIG',
    label: 'Sign off the roofing work',
    level: 'must',
    declaration: (c) => tradeDeclaration('roofer', c.address),
  },
  flags,
};
