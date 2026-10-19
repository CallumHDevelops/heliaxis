import type * as Days from '../bank-holidays';
import type { ProjectRow } from './checklist';

/**
 * Paperwork deadlines after an install (spec 4.7): MCS, the DNO, Building Regs, the BUS voucher and
 * chasing a G99 application. Each one also becomes a task (ensureDeadlineTasks in server.ts).
 *
 * Pure apart from types, so scripts/test-projects.mjs loads it straight into node. The working-day
 * maths comes in through `cal` (src/lib/bank-holidays.ts on the server), with that year's bank holidays.
 */

export type Deadline = {
  key: 'mcs' | 'g98' | 'regs' | 'bus' | 'g99';
  label: string;
  /** YYYY-MM-DD, UK. */
  due: string;
  done: boolean;
  /** Calendar days from today to the due date: negative once it's passed. */
  daysLeft: number;
  /** When its task falls due: 2 working days before (the BUS voucher: 14 days before it runs out), never before today. */
  remind: string;
};

export type DeadlineCal = Pick<typeof Days, 'addWorkingDays' | 'ukDay'> & { today: string; hols: ReadonlySet<string> };

const YMD = /^(\d{4})-(\d{2})-(\d{2})/;
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parts(ymd: string): [number, number, number] | null {
  const m = YMD.exec(ymd);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
const noon = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 12));
const ymdOf = (d: Date) => d.toISOString().slice(0, 10);

/** n calendar days after a date. */
export function addDays(ymd: string, n: number): string {
  const p = parts(ymd)!;
  const d = noon(p[0], p[1], p[2]);
  d.setUTCDate(d.getUTCDate() + n);
  return ymdOf(d);
}

/** n months after a date, kept inside the month (31 Jan + 1 month = 28 or 29 Feb). */
export function addMonths(ymd: string, n: number): string {
  const p = parts(ymd)!;
  const first = noon(p[0], p[1] + n, 1);
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0, 12)).getUTCDate();
  return ymdOf(noon(first.getUTCFullYear(), first.getUTCMonth() + 1, Math.min(p[2], last)));
}

/** Calendar days from a to b (b later = positive). */
export function daysBetween(a: string, b: string): number {
  const pa = parts(a)!;
  const pb = parts(b)!;
  return Math.round((noon(pb[0], pb[1], pb[2]).getTime() - noon(pa[0], pa[1], pa[2]).getTime()) / 86_400_000);
}

/** "Fri 6 Nov". */
export function shortDay(ymd: string): string {
  const p = parts(ymd);
  if (!p) return ymd;
  const d = noon(p[0], p[1], p[2]);
  return `${WEEKDAY[d.getUTCDay()]} ${p[2]} ${MONTH[p[1] - 1]}`;
}

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const isYmd = (s: string) => !!parts(s) && s.length === 10;

/** The BUS voucher's expiry: the date saved with it, or 3 months after it was issued. */
export function busExpiry(paperwork: Record<string, string> | null | undefined): string | null {
  const saved = text(paperwork?.bus_expires_on);
  if (isYmd(saved)) return saved;
  const issued = text(paperwork?.bus_issued_on);
  return isYmd(issued) ? addMonths(issued, 3) : null;
}

/** Every deadline that applies to the job now (none until it's been commissioned, or a G99 or BUS date is set). */
export function deadlinesFor(p: ProjectRow, cal: DeadlineCal): Deadline[] {
  const out: Deadline[] = [];
  const route = text(p.paperwork?.dno_route);
  const products = p.products ?? [];
  const commissioned = text(p.commissioned_at) ? cal.ukDay(text(p.commissioned_at)) : null;
  const mark = p.checklist?.c_dno_notified;
  const add = (key: Deadline['key'], label: string, due: string, done: boolean, remindAt?: string) => {
    const remind = remindAt ?? cal.addWorkingDays(due, -2, cal.hols);
    out.push({ key, label, due, done, daysLeft: daysBetween(cal.today, due), remind: remind < cal.today ? cal.today : remind });
  };

  if (commissioned) {
    if (products.some((x) => x === 'solar' || x === 'battery' || x === 'heatpump')) {
      add('mcs', 'Register the MCS certificate', cal.addWorkingDays(commissioned, 10, cal.hols), !!text(p.paperwork?.mcs_cert_no));
    }
    if (route === 'g98') {
      add('g98', 'Tell the DNO (G98) about the new system', addDays(commissioned, 28), !!(mark?.done_at || mark?.na));
    }
    add('regs', 'Notify Building Regs (NICEIC / NAPIT)', addDays(commissioned, 30), !!text(p.paperwork?.building_regs_ref));
  }

  const expiry = products.includes('heatpump') ? busExpiry(p.paperwork) : null;
  if (expiry) {
    add('bus', `BUS voucher expires ${shortDay(expiry)}`, expiry, !!text(p.paperwork?.bus_redeemed_on), addDays(expiry, -14));
  }

  const submitted = text(p.dno_submitted_at);
  if (route === 'g99' && submitted) {
    add('g99', 'Chase the DNO about the G99 application', cal.addWorkingDays(cal.ukDay(submitted), 45, cal.hols), text(p.dno_status) === 'approved');
  }
  return out;
}
