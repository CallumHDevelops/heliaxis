import type { EstimatorSettings, Package } from './calc';
import { homePrice } from './pricing';

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
export function packageCards(packages: Package[], settings?: EstimatorSettings): PackageCard[] {
  const active = packages.filter((p) => p.active && p.name.trim());
  const priced = (p: Package) => (p.pricing === 'bands' ? p.bands.length > 0 : !!settings?.homeUsesCostModel);
  if (!active.some(priced)) return [];
  return active.map((p) => {
    if (p.pricing !== 'bands' && settings?.homeUsesCostModel) {
      // From the cost build-up: the low end of the range for the smallest usual home system (6 panels), rounded to £50.
      const from = homePrice(settings, 6, { batteryKwh: p.kind === 'solar_battery' ? p.batteryKwh || settings.batteryKwh : 0 }).low;
      return { id: p.id, name: p.name.trim(), summary: p.summary.trim(), includes: p.includes.map((l) => l.trim()).filter(Boolean), fromPrice: `From ${gbp(Math.round(from / 50) * 50)} fitted`, sizeLine: null };
    }
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
