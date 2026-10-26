import type { Point } from '@/lib/social/insights/calc';

/** A plain line chart in SVG: no library, readable in light and dark, with a text summary for screen readers. */
export function LineChart({ points, label }: { points: Point[]; label: string }) {
  if (points.length < 2) return <p className="in-empty">Collecting data. A line appears after two days of figures.</p>;
  const W = 640;
  const H = 150;
  const pad = { l: 8, r: 8, t: 10, b: 20 };
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const x = (i: number) => pad.l + (i / (points.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - min) / span) * (H - pad.t - pad.b);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  return (
    <figure className="in-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: ${points[0].value} on ${points[0].date}, ${last.value} on ${last.date}`} preserveAspectRatio="none">
        <path d={`${d} L${x(points.length - 1)},${H - pad.b} L${x(0)},${H - pad.b} Z`} className="in-area" />
        <path d={d} className="in-line" />
        {points.map((p, i) => (
          <circle key={p.date} cx={x(i)} cy={y(p.value)} r={points.length > 40 ? 0 : 3} className="in-dot">
            <title>{`${p.date}: ${p.value.toLocaleString('en-GB')}`}</title>
          </circle>
        ))}
      </svg>
      <figcaption>
        <span>{points[0].date}</span>
        <span>{label}</span>
        <span>{last.date}</span>
      </figcaption>
    </figure>
  );
}

/** Horizontal bars for a short list of named counts. */
export function Bars({ rows, unit = '' }: { rows: { label: string; value: number }[]; unit?: string }) {
  if (!rows.length) return <p className="in-empty">Nothing to show yet.</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="in-bars">
      {rows.map((r) => (
        <li key={r.label}>
          <span>{r.label}</span>
          <i style={{ width: `${(r.value / max) * 100}%` }} />
          <b>
            {r.value.toLocaleString('en-GB')}
            {unit}
          </b>
        </li>
      ))}
    </ul>
  );
}
