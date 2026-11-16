import type { Package } from './calc';

/** What the website shows for one package: everything comes from the admin (Sales › Solar estimator › Packages and prices). */
export type PackageCard = {
  id: string;
  name: string;
  summary: string;
  includes: string[];
  /** "From £6,450 fitted", or null when the package has no prices yet. */
  fromPrice: string | null;
  /** "8 to 16 panels" (or "10 panels"), derived from the price bands; null without bands. */
  sizeLine: string | null;
};

const gbp = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;

/**
 * The active packages as cards, in the order they were entered. Returns [] when no active package has a price,
 * so the band can hide itself: a page must look right before any packages are set up.
 */
export function packageCards(packages: Package[]): PackageCard[] {
  const active = packages.filter((p) => p.active && p.name.trim());
  if (!active.some((p) => p.bands.length)) return [];
  return active.map((p) => {
    const prices = p.bands.map((b) => b.price).filter((n) => Number.isFinite(n) && n > 0);
    const panels = p.bands.map((b) => b.panels).filter((n) => Number.isFinite(n) && n > 0);
    const lo = panels.length ? Math.min(...panels) : 0;
    const hi = panels.length ? Math.max(...panels) : 0;
    return {
      id: p.id,
      name: p.name.trim(),
      summary: p.summary.trim(),
      includes: p.includes.map((l) => l.trim()).filter(Boolean),
      fromPrice: prices.length ? `From ${gbp(Math.min(...prices))} fitted` : null,
      sizeLine: !lo ? null : lo === hi ? `${lo} panels` : `${lo} to ${hi} panels`,
    };
  });
}
