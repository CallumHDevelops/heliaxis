/**
 * Package matching (spec section 5).
 * 1. Max panel count on suitable segments.
 * 2. Largest active package with min_panels <= count.
 * 3. Below the smallest package → too_small.
 */
import type { PackageRow } from './types';

export type MatchResult =
  | { status: 'matched'; package: PackageRow }
  | { status: 'too_small'; package: null; smallestMinPanels: number | null };

export function matchPackage(panelCount: number, packages: PackageRow[]): MatchResult {
  const active = packages.filter((p) => p.active).sort((a, b) => b.min_panels - a.min_panels);
  const match = active.find((p) => p.min_panels <= panelCount);
  if (match) return { status: 'matched', package: match };
  const smallest = active.length ? active[active.length - 1]!.min_panels : null;
  return { status: 'too_small', package: null, smallestMinPanels: smallest };
}

/** kWp for the letter: panels × watts, to 2 dp. */
export function arrayKwp(panelCount: number, panelWatts: number): number {
  return Math.round((panelCount * panelWatts) / 10) / 100;
}
