/**
 * Text normalisation for the keyword layer (docs/social-monitoring/03-classifier.md §2).
 * Four variants of every comment are matched, so spacing tricks, repeated letters and
 * leetspeak cannot hide a safety word. Diacritics are never stripped (Welsh "tân" is not "tan").
 */

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's', '!': 'i' };
const ZERO_WIDTH = /[​‌‍⁠﻿]/g;

/** NFKC, lower case, straight quotes, no zero-width characters, single spaces. */
export function basic(t: string): string {
  return t
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(ZERO_WIDTH, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Runs of the same letter become one ("fiiiire" → "fire"). */
export function squeeze(t: string): string {
  return t.replace(/(\p{L})\1+/gu, '$1');
}

/** Leetspeak, only inside tokens that contain a letter (so "999" is untouched), then squeezed. */
export function deleet(t: string): string {
  return squeeze(
    t.replace(/\S+/gu, (w) => (/\p{L}/u.test(w) ? [...w].map((c) => LEET[c] ?? c).join('') : w))
  );
}

/** "f i r e", "f.i.r.e", "f-i-r-e", "f*i*r*e" → "fire". */
export function despace(t: string): string {
  return t.replace(
    /(?<![\p{L}\p{N}])(?:[\p{L}\p{N}][ .\-*]){2,}[\p{L}\p{N}](?![\p{L}\p{N}])/gu,
    (m) => m.replace(/[ .\-*]/g, '')
  );
}

export type Variants = { basic: string; squeezed: string; deleet: string; despaced: string };
export const VARIANT_NAMES = ['basic', 'squeezed', 'deleet', 'despaced'] as const;
export type VariantName = (typeof VARIANT_NAMES)[number];

export function variants(text: string): Variants {
  const b = basic(text);
  return { basic: b, squeezed: squeeze(b), deleet: deleet(b), despaced: despace(b) };
}
