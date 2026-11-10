/**
 * Template registry. Keys match pv_letter_templates.template_key.
 * Template 5 (Brand Hero) is the default. O5 in /design-reference is a
 * superseded draft of 5 and is not built.
 */
import type { ComponentType } from 'react';
import type { LetterData, TemplateKey } from '@/lib/prospectpv/types';
import { type CopyBlocks, makeCopy } from './copy';
import type { TemplateProps } from './parts';
import { T1Back, T1Front } from './templates/T1Classic';
import { T2Back, T2Front } from './templates/T2BoldDark';
import { T3Back, T3Front } from './templates/T3PersonalLetter';
import { T4Back, T4Front } from './templates/T4RoofReport';
import { T5Back, T5Front } from './templates/T5BrandHero';

export type TemplateDef = {
  key: TemplateKey;
  name: string;
  style: string;
  Front: ComponentType<TemplateProps>;
  Back: ComponentType<TemplateProps>;
};

export const TEMPLATES: Record<TemplateKey, TemplateDef> = {
  1: { key: 1, name: 'Classic', style: 'Dark header band, roof plan beside estimate table, gold finance strip', Front: T1Front, Back: T1Back },
  2: { key: 2, name: 'Bold Dark', style: 'Huge gold panel count on a dark band', Front: T2Front, Back: T2Back },
  3: { key: 3, name: 'Personal Letter', style: 'Letter from the director with photo and signature', Front: T3Front, Back: T3Back },
  4: { key: 4, name: 'Roof Report', style: 'Survey-style report with roof assessment and spec sheet', Front: T4Front, Back: T4Back },
  5: { key: 5, name: 'Brand Hero', style: 'Gold hero with cross-hatch, dark QR band, dark finance band', Front: T5Front, Back: T5Back },
};

export const DEFAULT_TEMPLATE: TemplateKey = 5;

export type LetterPagesProps = {
  data: LetterData;
  templateKey: TemplateKey;
  /** pv_letter_templates.copy_blocks for the version being rendered. */
  copyBlocks?: CopyBlocks;
  preview?: boolean;
  /** Which sides to render (the picker shows one at a time). */
  sides?: ('front' | 'back')[];
};

/** Front then back, ready for double-sided printing. */
export function LetterPages({ data, templateKey, copyBlocks, preview, sides = ['front', 'back'] }: LetterPagesProps) {
  const t = TEMPLATES[templateKey];
  const copy = makeCopy(templateKey, data, copyBlocks);
  return (
    <>
      {sides.includes('front') ? <t.Front data={data} copy={copy} preview={preview} /> : null}
      {sides.includes('back') ? <t.Back data={data} copy={copy} preview={preview} /> : null}
    </>
  );
}
