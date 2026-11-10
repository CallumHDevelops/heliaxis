/**
 * Split testing (spec 6.1): homes in a campaign are assigned to templates by a
 * stable hash of campaign + UPRN, so re-running generation never moves a home.
 */
import type { TemplateKey } from './types';

export type TemplateSplit = { templateKey: TemplateKey; splitPct: number };

/** FNV-1a 32-bit. Runs the same in Node, edge and browser. */
export function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function validateSplits(splits: TemplateSplit[]): string | null {
  if (splits.length === 0) return 'Choose at least one template.';
  const keys = new Set(splits.map((s) => s.templateKey));
  if (keys.size !== splits.length) return 'Each template can only appear once.';
  if (splits.some((s) => !(s.splitPct > 0))) return 'Every split must be more than 0%.';
  const total = splits.reduce((sum, s) => sum + s.splitPct, 0);
  if (Math.abs(total - 100) > 0.01) return `Splits must add up to 100% (currently ${total}%).`;
  return null;
}

export function assignTemplate(campaignId: string, uprn: string | number, splits: TemplateSplit[]): TemplateKey {
  const err = validateSplits(splits);
  if (err) throw new Error(err);
  const sorted = [...splits].sort((a, b) => a.templateKey - b.templateKey);
  const bucket = (fnv1a(`${campaignId}:${uprn}`) % 10000) / 100; // 0.00–99.99
  let cumulative = 0;
  for (const s of sorted) {
    cumulative += s.splitPct;
    if (bucket < cumulative) return s.templateKey;
  }
  return sorted[sorted.length - 1]!.templateKey;
}
