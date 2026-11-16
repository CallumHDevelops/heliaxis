'use client';

import { useMemo, useState, useTransition } from 'react';
import '../../crm/crm.css';
import { runAllNow } from './actions';

/** One row of the rankings table, prepared on the server. */
export type RankRow = {
  keywordId: number;
  keyword: string;
  town: string;
  pos: number | null;
  /** Positive = moved up since the previous check; null = no previous check. */
  change: number | null;
  pack: number | null;
  url: string | null;
  leader: string;
  error?: string;
  /** Our position over the past checks, oldest first. */
  trend: (number | null)[];
};

export function RunAll({ label = 'Run everything now' }: { label?: string }) {
  const [busy, start] = useTransition();
  const [started, setStarted] = useState(false);
  return (
    <div className="seo-run">
      <button type="button" className="crm-btn crm-btn--solar" disabled={busy || started} onClick={() => start(async () => { await runAllNow(); setStarted(true); })}>
        {busy ? 'Starting…' : started ? 'Running…' : label}
      </button>
      {started && <small>Site check, Google positions and competitors are running. It takes a few minutes: refresh this page.</small>}
    </div>
  );
}

function Trend({ points }: { points: (number | null)[] }) {
  if (points.filter((p) => p !== null).length < 2) return <span className="seo-muted">–</span>;
  const w = 72;
  const h = 22;
  const y = (p: number | null) => (p === null ? h - 1 : 1 + ((Math.min(p, 21) - 1) / 20) * (h - 2));
  const step = points.length > 1 ? w / (points.length - 1) : w;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(1)},${y(p).toFixed(1)}`).join(' ');
  return (
    <svg className="seo-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Position over the last ${points.length} checks`}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

const posLabel = (p: number | null) => (p === null ? 'Not in top 20' : `#${p}`);

/** Every tracked search: our position, the move since last time, the map pack, who is first. Filter by town or words. */
export function RankingsTable({ rows }: { rows: RankRow[] }) {
  const towns = useMemo(() => [...new Set(rows.map((r) => r.town))].sort(), [rows]);
  const [town, setTown] = useState('');
  const [q, setQ] = useState('');
  const [show, setShow] = useState<'all' | 'ranked' | 'missing'>('all');
  const list = rows.filter(
    (r) => (!town || r.town === town) && (!q || r.keyword.toLowerCase().includes(q.toLowerCase())) && (show === 'all' || (show === 'ranked' ? r.pos !== null : r.pos === null)),
  );
  return (
    <div className="seo-rank">
      <div className="seo-filters">
        <label>
          <span>Town</span>
          <select className="crm-input" value={town} onChange={(e) => setTown(e.target.value)}>
            <option value="">All towns</option>
            {towns.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Search</span>
          <input className="crm-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="battery, heat pump…" />
        </label>
        <label>
          <span>Show</span>
          <select className="crm-input" value={show} onChange={(e) => setShow(e.target.value as typeof show)}>
            <option value="all">All searches</option>
            <option value="ranked">Where we appear</option>
            <option value="missing">Where we don’t</option>
          </select>
        </label>
        <small className="seo-muted">{list.length} of {rows.length}</small>
      </div>
      <div className="seo-table-wrap">
        <table className="seo-table">
          <thead>
            <tr>
              <th scope="col">Search</th>
              <th scope="col">Google</th>
              <th scope="col">Change</th>
              <th scope="col">Map pack</th>
              <th scope="col">Trend</th>
              <th scope="col">First place</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.keywordId}>
                <td>
                  <b>{r.keyword}</b>
                  {r.url && <small>{r.url.replace(/^https?:\/\/(www\.)?heliaxis\.co\.uk/, '') || '/'}</small>}
                  {r.error && <small className="bad">Not checked: {r.error}</small>}
                </td>
                <td>
                  <span className={`seo-pos ${r.pos === null ? 'none' : r.pos <= 3 ? 'top3' : r.pos <= 10 ? 'top10' : 'low'}`}>{posLabel(r.pos)}</span>
                </td>
                <td>{r.change === null || r.change === 0 ? <span className="seo-muted">–</span> : <span className={r.change > 0 ? 'seo-up' : 'seo-down'}>{r.change > 0 ? `▲ ${r.change}` : `▼ ${-r.change}`}</span>}</td>
                <td>{r.pack ? `#${r.pack}` : <span className="seo-muted">–</span>}</td>
                <td>
                  <Trend points={r.trend} />
                </td>
                <td className="seo-leader">{r.leader || '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
