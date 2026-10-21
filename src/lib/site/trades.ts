import type { Trade } from './types';

/**
 * The trades New project suggests for a job's products. On its own, with no form imports, so New
 * project (on CRM home and the Projects board) doesn't load every trade's form with it; forms/index
 * re-exports it.
 */

const has = (products: string[], ...keys: string[]) => products.some((p) => keys.includes(p));

/** The trades New project suggests (SPEC 1D): solar → scaffolder, roofer, electrician; battery, EV or heat pump → electrician. */
export function suggestedTrades(products: string[]): Trade[] {
  const out: Trade[] = [];
  if (has(products, 'solar')) out.push('scaffolder', 'roofer');
  if (has(products, 'solar', 'battery', 'ev', 'heatpump')) out.push('electrician');
  return out;
}
