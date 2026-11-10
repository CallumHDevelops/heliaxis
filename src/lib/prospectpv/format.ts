/** UK English, GBP formatting helpers. */

const gbp0 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const dec1 = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dec2 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });

/** 9000 → "9,000" (callers add the £). */
export const money = (n: number) => gbp0.format(Math.round(n));
export const whole = (n: number) => gbp0.format(Math.round(n));
export const oneDp = (n: number) => dec1.format(n);
/** 5.4 → "5.4", 5.40 → "5.4", 5.445 → "5.45" */
export const kwp = (n: number) => dec2.format(n);
/** Rounds annual kWh to the nearest 10 for print ("4,800"), so we don't imply false precision. */
export const annualKwh = (n: number) => gbp0.format(Math.round(n / 10) * 10);
/** 4800 → "4.8k" for tight tiles. */
export const compactKwh = (n: number) => (n >= 1000 ? `${oneDp(n / 1000).replace(/\.0$/, '')}k` : whole(n));

/** "9 November 2026" in UK time. */
export function letterDate(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' }).format(d);
}

/** "12 Transton Road, Newport NP19 7AB" */
export function oneLineAddress(a: { line1: string; line2?: string; town: string; postcode: string }): string {
  return [a.line1, a.line2, `${a.town} ${a.postcode}`].filter(Boolean).join(', ');
}

/** pence string for assumptions: 0.15 → "15", 0.155 → "15.5" */
export const pence = (gbp: number) => oneDp(gbp * 100).replace(/\.0$/, '');

/** ["a"] → "a"; ["a","b"] → "a or b"; ["a","b","c"] → "a, b or c" */
export const anyOf = (items: string[]) => (items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`);
