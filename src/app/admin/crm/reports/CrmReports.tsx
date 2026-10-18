'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { money, stageLabel } from '@/lib/crm/stages';
import '../crm.css';

type Row = { key: string; leads: number; surveys: number; won: number; lost: number; value: number };
type Report = {
  days: number;
  totals: { leads: number; won: number; value: number; winRate: number | null; medianResponseMins: number | null; contactedWithin15: number | null };
  bySource: Row[];
  byOwner: Row[];
  funnel: { key: string; n: number }[];
};

const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const mins = (m: number | null) => (m == null ? '—' : m < 60 ? `${Math.round(m)} min` : m < 1440 ? `${(m / 60).toFixed(1)} h` : `${(m / 1440).toFixed(1)} days`);

/** Where the sales come from: £ won by ad / campaign / source, by person, the funnel and reply speed. */
export function CrmReports() {
  const [days, setDays] = useState(90);
  const [r, setR] = useState<Report | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    fetch(`/api/crm/reports?days=${days}`, { cache: 'no-store' })
      .then(async (res) => ({ ok: res.ok, d: await res.json() }))
      .then(({ ok, d }) => {
        if (!live) return;
        if (!ok) setErr(d.error || 'Could not load the report');
        else {
          setErr('');
          setR(d);
        }
      })
      .catch(() => live && setErr('Could not load the report'));
    return () => {
      live = false;
    };
  }, [days]);

  const top = r?.funnel[0]?.n || 0;
  const table = (rows: Row[], label: string) => (
    <div className="crm-tablebox">
      <table className="crm-table">
        <thead>
          <tr>
            <th scope="col">{label}</th>
            <th scope="col">Leads</th>
            <th scope="col">Surveys</th>
            <th scope="col">Won</th>
            <th scope="col">Win rate</th>
            <th scope="col">£ won</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((x) => (
            <tr key={x.key}>
              <th scope="row">{x.key}</th>
              <td>{x.leads}</td>
              <td>{x.surveys}</td>
              <td>{x.won}</td>
              <td>{pct(x.won + x.lost ? x.won / (x.won + x.lost) : null)}</td>
              <td>
                <b>{money(x.value) || '£0'}</b>
              </td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={6} className="crm-muted">
                No opportunities in this period.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="crm crm-reports">
      <Link href="/admin/crm" className="crm-back">
        ← CRM
      </Link>
      <div className="crm-head">
        <div>
          <h1>Reports</h1>
          <p>Opportunities created in the last {days} days.</p>
        </div>
        <div className="crm-viewtoggle" role="group" aria-label="Period" style={{ display: 'inline-flex' }}>
          {[30, 90, 365].map((d) => (
            <button key={d} type="button" className={days === d ? 'on' : ''} onClick={() => setDays(d)}>
              {d === 365 ? '1 year' : `${d} days`}
            </button>
          ))}
        </div>
      </div>
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
      {!r ? (
        <p className="crm-muted">Loading…</p>
      ) : (
        <>
          <div className="crm-kpis">
            <div>
              <b>{r.totals.leads}</b>
              <span>Leads</span>
            </div>
            <div>
              <b>{money(r.totals.value) || '£0'}</b>
              <span>Won ({r.totals.won})</span>
            </div>
            <div>
              <b>{pct(r.totals.winRate)}</b>
              <span>Win rate (won ÷ won + lost)</span>
            </div>
            <div>
              <b>{mins(r.totals.medianResponseMins)}</b>
              <span>Typical first reply · {pct(r.totals.contactedWithin15)} within 15 min</span>
            </div>
          </div>

          <h2 className="crm-h2">By source and ad campaign</h2>
          <p className="crm-muted crm-small">“meta-ad: …” rows are your Meta campaigns and ads (from the ad link tracking). Sorted by £ won.</p>
          {table(r.bySource, 'Source')}

          <h2 className="crm-h2">Pipeline funnel</h2>
          <p className="crm-muted crm-small">How many of this period’s opportunities have reached each stage (lost ones excluded).</p>
          <ol className="crm-funnel">
            {r.funnel.map((f) => (
              <li key={f.key} title={`${stageLabel(f.key)}: ${f.n}`}>
                <span className="crm-funnel-label">{stageLabel(f.key)}</span>
                <span className="crm-funnel-bar">
                  <i style={{ width: `${top ? Math.max(2, (f.n / top) * 100) : 0}%` }} />
                </span>
                <span className="crm-funnel-n">{f.n}</span>
              </li>
            ))}
          </ol>

          <h2 className="crm-h2">By person</h2>
          {table(r.byOwner, 'Owner')}
        </>
      )}
    </div>
  );
}
