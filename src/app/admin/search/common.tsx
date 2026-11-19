import type { ReactNode } from 'react';
import type { Filters, PeriodKey } from '@/lib/search/metrics';
import type { Delta } from '@/lib/search/maths';

export type SP = Promise<Record<string, string | string[] | undefined>>;

export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export function filtersFrom(q: Record<string, string | string[] | undefined>): { period: PeriodKey; compare: 'previous' | 'year'; filters: Filters } {
  const period = (['this_week', 'last_week', 'last_4_weeks', 'this_month', 'last_month', 'quarter'].includes(one(q.period)) ? one(q.period) : 'this_week') as PeriodKey;
  const tier = Number(one(q.tier));
  return {
    period,
    compare: one(q.compare) === 'year' ? 'year' : 'previous',
    filters: {
      device: one(q.device) === 'desktop' ? 'desktop' : 'mobile',
      ...(tier >= 1 && tier <= 3 ? { tier } : {}),
      ...(one(q.town) ? { town: one(q.town) } : {}),
      ...(one(q.service) ? { service: one(q.service) } : {}),
      ...(one(q.intent) ? { intent: one(q.intent) } : {}),
    },
  };
}

export const dateLabel = (d: string | null | undefined, withDay = false) =>
  d ? new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { ...(withDay ? { weekday: 'short' } : {}), day: 'numeric', month: 'short', year: withDay ? undefined : 'numeric' }) : '';

export function PageHead({ title, sub, fresh }: { title: string; sub?: ReactNode; fresh?: ReactNode }) {
  return (
    <header className="sx-pagehead">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {fresh && <div className="sx-fresh">{fresh}</div>}
    </header>
  );
}

export const n = (v: number | null | undefined, digits = 0) => (v === null || v === undefined ? '–' : v.toLocaleString('en-GB', { maximumFractionDigits: digits, minimumFractionDigits: 0 }));

export function DeltaLine({ d, unit = '' }: { d: Delta; unit?: string }) {
  if (d.abs === null) return <span className="sx-tile__delta flat">No comparison yet</span>;
  const cls = d.good === null ? 'flat' : d.good ? 'good' : 'bad';
  const arrow = d.abs > 0 ? '▲' : d.abs < 0 ? '▼' : '';
  return (
    <span className={`sx-tile__delta ${cls}`}>
      <span aria-hidden="true">{arrow}</span>
      <span>
        {d.abs > 0 ? '+' : ''}
        {n(d.abs, 1)}
        {unit}
      </span>
      {d.small ? <span className="sx-small">small numbers</span> : d.pct !== null ? <span>({d.pct > 0 ? '+' : ''}{n(d.pct, 1)}%)</span> : null}
      <span className="sr-only">{d.good === null ? 'no change' : d.good ? 'better' : 'worse'}</span>
    </span>
  );
}

export function Pos({ p }: { p: number | null | undefined }) {
  if (p === null || p === undefined) return <span className="sx-pos" title="Not in the top 100">–</span>;
  const b = p <= 3 ? 'b1' : p <= 10 ? 'b2' : p <= 20 ? 'b3' : 'b4';
  return <span className={`sx-pos ${b}`}>{p}</span>;
}

export function Move({ before, now }: { before: number | null | undefined; now: number | null | undefined }) {
  const b = before ?? 101;
  const a = now ?? 101;
  if (before === undefined) return <span className="sx-note">new</span>;
  if (a === b) return <span className="sx-note">–</span>;
  return a < b ? <span className="sx-up">▲ {before === null ? 'new' : b - a}</span> : <span className="sx-down">▼ {now === null ? 'out' : a - b}</span>;
}

export function Phase({ phase, what, children }: { phase: number; what: string; children?: ReactNode }) {
  return (
    <section className="sx-card">
      <h2>Arrives in phase {phase}</h2>
      <p>{what}</p>
      {children}
    </section>
  );
}
