'use client';

import { useState } from 'react';

/**
 * Small SVG charts for Search, no chart library. One axis per chart (clicks and impressions are two charts, not one with
 * two scales), thin 2px lines, recessive grid, and a hover readout on every chart.
 */

const fmtWeek = (w: string) => new Date(`${w}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export function Sparkline({ values, lowerIsBetter }: { values: (number | null)[]; lowerIsBetter?: boolean }) {
  const pts = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);
  if (pts.length < 2) return <svg className="sx-spark" viewBox="0 0 100 28" aria-hidden="true" />;
  const min = Math.min(...pts.map((p) => p.v));
  const max = Math.max(...pts.map((p) => p.v));
  const x = (i: number) => (i / Math.max(1, values.length - 1)) * 98 + 1;
  const y = (v: number) => {
    const t = max === min ? 0.5 : (v - min) / (max - min);
    return 25 - (lowerIsBetter ? 1 - t : t) * 22;
  };
  const d = pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg className="sx-spark" viewBox="0 0 100 28" preserveAspectRatio="none" role="img" aria-label={`Last ${values.length} weeks`}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <circle cx={x(last.i)} cy={y(last.v)} r="2.2" fill="currentColor" />
    </svg>
  );
}

/** One measure by week, with a crosshair readout. */
export function WeekLine({ weeks, values, label, color = '#c77f04' }: { weeks: string[]; values: number[]; label: string; color?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560;
  const H = 170;
  const pad = { l: 40, r: 10, t: 10, b: 24 };
  const max = Math.max(1, ...values);
  const x = (i: number) => pad.l + (i / Math.max(1, weeks.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => H - pad.b - (v / max) * (H - pad.t - pad.b);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const ticks = [0, Math.round(max / 2), max];
  const empty = values.every((v) => !v);
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${label} by week`} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="currentColor" strokeOpacity=".1" />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="currentColor" fillOpacity=".6">
              {t.toLocaleString('en-GB')}
            </text>
          </g>
        ))}
        {[0, Math.floor((weeks.length - 1) / 2), weeks.length - 1].map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity=".6">
            {weeks[i] ? fmtWeek(weeks[i]) : ''}
          </text>
        ))}
        {!empty && <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />}
        {hover !== null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="currentColor" strokeOpacity=".3" />
            <circle cx={x(hover)} cy={y(values[hover])} r="4" fill={color} stroke="var(--surface)" strokeWidth="2" />
          </>
        )}
        {weeks.map((w, i) => (
          <rect key={w} x={x(i) - (W - pad.l - pad.r) / weeks.length / 2} y={pad.t} width={(W - pad.l - pad.r) / weeks.length} height={H - pad.t - pad.b} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
        {empty && (
          <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="12" fill="currentColor" fillOpacity=".6">
            No data yet
          </text>
        )}
      </svg>
      {hover !== null && !empty && (
        <div className="sx-chip" style={{ position: 'absolute', top: 0, right: 0 }}>
          Week of {fmtWeek(weeks[hover])}: {values[hover].toLocaleString('en-GB')} {label.toLowerCase()}
        </div>
      )}
    </div>
  );
}

/** Position bands are ordered (better to worse), so one hue light to dark, with "not found" in neutral grey. */
export const BAND_COLOURS: Record<string, string> = {
  '1-3': '#1b5e20',
  '4-10': '#388e3c',
  '11-20': '#66bb6a',
  '21-50': '#a5d6a7',
  '51-100': '#d7ecc9',
  'not found': '#cfc8b8',
};

export function BandBars({ series, bands }: { series: { week: string; counts: Record<string, number> }[]; bands: string[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560;
  const H = 180;
  const pad = { l: 30, r: 6, t: 8, b: 24 };
  const totals = series.map((s) => bands.reduce((a, b) => a + (s.counts[b] ?? 0), 0));
  const max = Math.max(1, ...totals);
  const bw = (W - pad.l - pad.r) / series.length;
  const h = (n: number) => (n / max) * (H - pad.t - pad.b);
  const empty = totals.every((t) => !t);
  return (
    <div style={{ position: 'relative' }}>
      <div className="sx-legend" aria-hidden="true">
        {bands.map((b) => (
          <span key={b}>
            <i style={{ background: BAND_COLOURS[b] }} />
            {b === 'not found' ? 'Not in top 100' : b}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Tracked searches by position band, by week" onMouseLeave={() => setHover(null)}>
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="currentColor" strokeOpacity=".2" />
        <text x={pad.l - 6} y={pad.t + 8} textAnchor="end" fontSize="10" fill="currentColor" fillOpacity=".6">
          {max}
        </text>
        {series.map((s, i) => {
          let yTop = H - pad.b;
          return (
            <g key={s.week} onMouseEnter={() => setHover(i)}>
              <rect x={pad.l + i * bw} y={pad.t} width={bw} height={H - pad.t - pad.b} fill="transparent" />
              {bands.map((b) => {
                const n = s.counts[b] ?? 0;
                if (!n) return null;
                const hh = h(n);
                yTop -= hh;
                return <rect key={b} x={pad.l + i * bw + 1.5} y={yTop + 1} width={Math.max(1, bw - 3)} height={Math.max(0, hh - 2)} fill={BAND_COLOURS[b]} rx="1.5" />;
              })}
            </g>
          );
        })}
        {[0, Math.floor((series.length - 1) / 2), series.length - 1].map((i) => (
          <text key={i} x={pad.l + i * bw + bw / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity=".6">
            {series[i] ? fmtWeek(series[i].week) : ''}
          </text>
        ))}
        {empty && (
          <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="12" fill="currentColor" fillOpacity=".6">
            No rankings run yet
          </text>
        )}
      </svg>
      {hover !== null && !empty && totals[hover] > 0 && (
        <div className="sx-card" style={{ position: 'absolute', top: 24, right: 0, padding: '8px 10px', gap: 2, fontSize: '0.78rem', boxShadow: '0 6px 16px rgb(0 0 0 / .12)' }}>
          <b>Week of {fmtWeek(series[hover].week)}</b>
          {bands.map((b) => (
            <span key={b}>
              {b === 'not found' ? 'Not in top 100' : `Positions ${b}`}: {series[hover].counts[b] ?? 0}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** A 26-week history of one search's position (lower is better, so the axis runs 1 at the top). */
export function PositionHistory({ points }: { points: { date: string; pos: number | null }[] }) {
  const W = 560;
  const H = 120;
  const pad = { l: 30, r: 8, t: 8, b: 20 };
  const x = (i: number) => pad.l + (i / Math.max(1, points.length - 1)) * (W - pad.l - pad.r);
  const y = (p: number) => pad.t + ((p - 1) / 100) * (H - pad.t - pad.b);
  const segs: string[] = [];
  let cur = '';
  points.forEach((p, i) => {
    if (p.pos === null) {
      if (cur) segs.push(cur);
      cur = '';
      return;
    }
    cur += `${cur ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.pos).toFixed(1)}`;
  });
  if (cur) segs.push(cur);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Our position by run">
      {[1, 10, 50, 100].map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="currentColor" strokeOpacity=".1" />
          <text x={pad.l - 5} y={y(t) + 3} textAnchor="end" fontSize="9" fill="currentColor" fillOpacity=".6">
            {t}
          </text>
        </g>
      ))}
      {segs.map((d) => (
        <path key={d} d={d} fill="none" stroke="#c77f04" strokeWidth="2" />
      ))}
      {points.map((p, i) =>
        p.pos !== null ? (
          <circle key={p.date} cx={x(i)} cy={y(p.pos)} r="4" fill="#c77f04" stroke="var(--surface)" strokeWidth="2">
            <title>{`${p.date}: position ${p.pos}`}</title>
          </circle>
        ) : (
          <text key={p.date} x={x(i)} y={H - pad.b - 2} textAnchor="middle" fontSize="9" fill="currentColor" fillOpacity=".5">
            <title>{`${p.date}: not in the top 100`}</title>–
          </text>
        ),
      )}
    </svg>
  );
}
