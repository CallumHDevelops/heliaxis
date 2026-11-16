'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import '../../crm/crm.css';
import { getProgress, runNow, runRankingsNow } from './actions';

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

type Progress = Awaited<ReturnType<typeof getProgress>>;
type StepState = 'waiting' | 'running' | 'done' | 'failed' | 'off';

/** Ten minutes without news means the job was stopped (the server allows five). */
const stale = (iso?: string) => !iso || Date.now() - Date.parse(iso) > 10 * 60_000;

function stepsOf(p: Progress | null, startedHere: number | null) {
  // Only a record from this run (or one still going) is progress: an old "done" is not.
  const fresh = (iso?: string) => !!iso && (startedHere ? Date.parse(iso) >= startedHere - 60_000 : !stale(iso));
  const a = p?.audit && fresh(p.audit.startedAt) ? p.audit : null;
  const r = p?.run && fresh(p.run.startedAt) ? p.run : null;
  const audit: StepState = !a ? 'waiting' : a.step === 'running' ? (stale(a.updatedAt) ? 'failed' : 'running') : a.step === 'done' ? 'done' : 'failed';
  let rank: StepState = p && !p.serp ? 'off' : 'waiting';
  let comp: StepState = rank === 'off' ? 'off' : 'waiting';
  if (r) {
    const dead = stale(r.updatedAt) && (r.step === 'rankings' || r.step === 'competitors');
    if (r.step === 'rankings') rank = dead ? 'failed' : 'running';
    else if (r.step === 'failed') rank = r.total && (r.done ?? 0) >= r.total ? 'done' : 'failed';
    else rank = 'done';
    if (r.step === 'competitors') comp = dead ? 'failed' : 'running';
    else if (r.step === 'done') comp = 'done';
    else if (r.step === 'failed') comp = rank === 'done' ? 'failed' : 'waiting';
  }
  return { audit, rank, comp, run: r, auditRec: a };
}

/** The run button and, while it works, what is happening step by step (checked every few seconds). */
export function RunCentre({ admin, initial }: { admin: boolean; initial: Progress }) {
  const router = useRouter();
  const [p, setP] = useState<Progress>(initial);
  const [startedHere, setStartedHere] = useState<number | null>(null);
  const [busy, start] = useTransition();
  const [err, setErr] = useState('');
  // Whether the dashboard has been redrawn since this run finished (a ref: it changes nothing on screen).
  const refreshed = useRef(false);
  const st = stepsOf(p, startedHere);
  const states = [st.audit, st.rank, st.comp];
  const active = states.includes('running') || (startedHere !== null && states.includes('waiting'));
  const finished = startedHere !== null && !active;

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      getProgress().then(setP, () => null);
    }, 3000);
    return () => clearInterval(t);
  }, [active]);

  // When everything has finished, redraw the dashboard once with the new figures.
  useEffect(() => {
    if (finished && !refreshed.current) {
      refreshed.current = true;
      router.refresh();
    }
  }, [finished, router]);

  function go() {
    setErr('');
    start(async () => {
      setStartedHere(Date.now());
      refreshed.current = false;
      const [, r] = await Promise.all([runNow(), runRankingsNow()]);
      if (!r.ok && r.error) setErr(r.error);
      setP(await getProgress());
    });
  }

  const show = active || finished;
  const count = st.run?.total ? `${st.run.done ?? 0} of ${st.run.total} searches` : 'Starting';
  const pct = st.run?.total ? Math.round(((st.run.done ?? 0) / st.run.total) * 100) : 0;
  const detail = {
    audit: { running: 'Reading every page the way Google does', done: 'Done', failed: st.auditRec?.message || 'Stopped before it finished', waiting: 'Waiting', off: '–' },
    rank: { running: `${count}, each from its own town`, done: `Done${st.run?.total ? `: ${st.run.total} searches` : ''}`, failed: st.run?.message || 'Stopped before it finished', waiting: 'Waiting', off: 'DataForSEO isn’t set up' },
    comp: { running: 'Reading the leaders’ pages and comparing them with ours', done: 'Done', failed: st.run?.message || 'Stopped before it finished', waiting: 'Waiting for the positions', off: '–' },
  };
  const rows: { key: 'audit' | 'rank' | 'comp'; label: string; state: StepState }[] = [
    { key: 'audit', label: 'Site check', state: st.audit },
    { key: 'rank', label: 'Google positions', state: st.rank },
    { key: 'comp', label: 'Competitor analysis', state: st.comp },
  ];
  const doneCount = states.filter((x) => x === 'done' || x === 'off').length;

  return (
    <div className="seo-runc">
      {admin && (
        <button type="button" className="crm-btn crm-btn--solar" disabled={busy || active} onClick={go}>
          {busy ? 'Starting…' : active ? 'Running…' : 'Run everything now'}
        </button>
      )}
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
      {show && (
        <div className={`seo-prog${finished ? ' is-done' : ''}`} role="status" aria-live="polite">
          <svg className="seo-prog__spark" viewBox="0 0 24 24" aria-hidden="true">
            {[0, 90, 180, 270].map((a, i) => (
              <g key={a} transform={`rotate(${a} 12 12)`} className={finished || i < doneCount ? 'is-done' : i === doneCount ? 'is-now' : ''}>
                <path d="M11 9.6 L13 9.6 L13 0.8 L11 3 Z" />
              </g>
            ))}
          </svg>
          <div className="seo-prog__body">
            <b>{finished ? 'Finished: the dashboard below is up to date.' : 'Working on it. You can leave this page: it carries on.'}</b>
            <ol className="seo-prog__steps">
              {rows.map((r) => (
                <li key={r.key} className={`st-${r.state}`}>
                  <span className="seo-prog__dot" aria-hidden="true" />
                  <div>
                    <b>{r.label}</b>
                    <span>{detail[r.key][r.state]}</span>
                    {r.key === 'rank' && r.state === 'running' && (
                      <span className="seo-prog__bar" aria-hidden="true">
                        <span style={{ width: `${pct}%` }} />
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
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
