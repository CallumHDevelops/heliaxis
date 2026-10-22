/**
 * Answers as plain values (what the rules, the documents and the job pack read), any saved under a
 * key from before version 4 read under its new one (forms/legacy.ts). Kept out of types.ts, which the
 * staff pages load for a trade's label, so the old keys' map stays out of their browser code
 * (scripts/test-site-bundle.mjs). Pure.
 */
import { withLegacy } from './forms/legacy';
import type { Answers } from './types';

export function valuesOf(a: Answers | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(a ?? {})) if (x && typeof x === 'object' && 'v' in x) out[k] = x.v;
  return withLegacy(out);
}
