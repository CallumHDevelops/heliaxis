'use client';

import Link from 'next/link';
import { Fragment, useEffect, useState } from 'react';
import { money, stageLabel } from '@/lib/crm/stages';
import { adMoney, costPer, currencyUnit, dayIn, isMetaSource, returnOn, type AdSpendReport } from '@/lib/ad-spend';
import '../crm.css';
import './reports.css';

type Row = { key: string; leads: number; surveys: number; won: number; lost: number; value: number };
type Report = {
  days: number;
  totals: { leads: number; won: number; value: number; winRate: number | null; medianResponseMins: number | null; contactedWithin15: number | null };
  bySource: Row[];
  byOwner: Row[];
  funnel: { key: string; n: number }[];
  /** Missing from a server that's older than the page (during a deploy). */
  adSpend?: AdSpendReport;
  canExport?: boolean;
};
type Spend = Extract<AdSpendReport, { state: 'ok' }>;

const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const mins = (m: number | null) => (m == null ? '—' : m < 60 ? `${Math.round(m)} min` : m < 1440 ? `${(m / 60).toFixed(1)} h` : `${(m / 1440).toFixed(1)} days`);
const date = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });

/** A row of the source table: a source, or a Meta campaign or ad with its spend. */
type Line = { label: string; note?: string; leads: number; surveys: number; won: number; lost: number; value: number; spend?: number | null; metaLeads?: number | null };

/** `currency` only on Meta rows: other sources leave the spend columns empty. */
function SourceLine({ r, kind, currency }: { r: Line; kind: 'section' | 'group' | 'item'; currency?: string }) {
  const cost = (n: number) => adMoney(costPer(r.spend, n), currency);
  return (
    <tr className={`rp-${kind}`}>
      <th scope="row" title={r.note ? `${r.label}: ${r.note}` : r.label}>
        {r.label}
        {r.note && <small>{r.note}</small>}
      </th>
      <td title={r.metaLeads != null ? `Meta counted ${r.metaLeads}` : undefined}>{r.leads}</td>
      <td>{r.surveys}</td>
      <td>{r.won}</td>
      <td>{pct(r.won + r.lost ? r.won / (r.won + r.lost) : null)}</td>
      <td>
        <b>{money(r.value) || '£0'}</b>
      </td>
      {currency ? (
        <>
          <td>{adMoney(r.spend, currency)}</td>
          <td>{cost(r.leads)}</td>
          <td>{cost(r.surveys)}</td>
          <td>{cost(r.won)}</td>
          <td className="rp-return">{returnOn(r.value, r.spend, currency)}</td>
        </>
      ) : (
        <td colSpan={5} />
      )}
    </tr>
  );
}

/** Meta's campaigns with their ads beneath (and what they cost), then the other sources. */
function SpendTable({ rows, ad }: { rows: Row[]; ad: Spend }) {
  const others = rows.filter((x) => !isMetaSource(x.key));
  const sum = others.reduce(
    (t, x) => ({ ...t, leads: t.leads + x.leads, surveys: t.surveys + x.surveys, won: t.won + x.won, lost: t.lost + x.lost, value: t.value + x.value }),
    { label: 'Other sources', leads: 0, surveys: 0, won: 0, lost: 0, value: 0 }
  );
  return (
    <div className="crm-tablebox">
      <table className="crm-table rp-table">
        <thead>
          <tr>
            <th scope="col">Source</th>
            <th scope="col">Leads</th>
            <th scope="col">Surveys</th>
            <th scope="col">Won</th>
            <th scope="col">Win rate</th>
            <th scope="col">£ won</th>
            <th scope="col">Spend</th>
            <th scope="col">Cost per lead</th>
            <th scope="col">Cost per survey</th>
            <th scope="col">Cost per sale</th>
            <th scope="col">Return</th>
          </tr>
        </thead>
        <tbody>
          <SourceLine r={ad.total} kind="section" currency={ad.currency} />
          {ad.groups.map((g) => (
            <Fragment key={g.key}>
              <SourceLine r={g.total} kind="group" currency={ad.currency} />
              {g.rows.map((x) => (
                <SourceLine key={x.key} r={x} kind="item" currency={ad.currency} />
              ))}
            </Fragment>
          ))}
          {!ad.groups.length && (
            <tr>
              <td colSpan={11} className="crm-muted">
                No Meta leads or ad spend in this period.
              </td>
            </tr>
          )}
          {!!others.length && <SourceLine r={sum} kind="section" />}
          {others.map((x) => (
            <SourceLine key={x.key} r={{ ...x, label: x.key }} kind="group" />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** When Meta's figures are from, and Meta's lead count beside the CRM's. */
function SpendNote({ ad }: { ad: Spend }) {
  const when = dayIn(ad.fetchedAt, 'Europe/London') === ad.until ? `at ${time(ad.fetchedAt)}` : `on ${date(dayIn(ad.fetchedAt, 'Europe/London'))} at ${time(ad.fetchedAt)}`;
  return (
    <div className="crm-muted crm-small rp-note">
      <p>
        Spend is Meta’s, for {date(ad.since)} to {date(ad.until)}, fetched {when} (today’s figures every 15 minutes, earlier days every hour).
        Recent leads may still turn into sales, so cost per sale comes down as they do.
      </p>
      {ad.total.metaLeads != null && (
        <p>
          Meta counted <b>{ad.total.metaLeads}</b> {ad.total.metaLeads === 1 ? 'lead' : 'leads'} from your ads; the CRM has <b>{ad.total.leads}</b> from
          Meta in this period. Meta counts leads its own way and on its own dates, so a small gap is normal. A big one can mean leads aren’t
          reaching the CRM.
        </p>
      )}
    </div>
  );
}

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
  const ad = r?.adSpend?.state === 'ok' ? r.adSpend : null;
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
            {ad && (
              <>
                <div>
                  <b>{adMoney(ad.total.spend ?? 0, ad.currency)}</b>
                  <span>Ad spend on Meta</span>
                </div>
                <div>
                  <b>{adMoney(costPer(ad.total.spend ?? 0, ad.total.leads), ad.currency)}</b>
                  <span>Cost per lead · Meta leads only ({ad.total.leads})</span>
                </div>
              </>
            )}
          </div>

          <h2 className="crm-h2">By source and ad campaign</h2>
          {ad ? (
            <>
              <p className="crm-muted crm-small">
                Meta campaigns with their ads beneath, then your other sources. Sorted by £ won. Return is £ won for each {currencyUnit(ad.currency)} spent.
              </p>
              {ad.warning && (
                <p className="crm-banner">{r.canExport ? ad.warning : 'Meta didn’t send new figures just now, so these are the last ones it gave.'}</p>
              )}
              <SpendTable rows={r.bySource} ad={ad} />
              <SpendNote ad={ad} />
            </>
          ) : (
            <>
              <p className="crm-muted crm-small">“meta-ad: …” rows are your Meta campaigns and ads (from the ad link tracking). Sorted by £ won.</p>
              {r.adSpend?.state === 'off' && r.canExport && (
                <p className="crm-muted crm-small rp-setup">
                  To see what each Meta campaign and ad costs per lead, survey and sale here, connect your ad account: see{' '}
                  <Link href="/admin/tasks">“Show ad spend in your reports”</Link> under From Claude on Tasks.
                </p>
              )}
              {r.adSpend?.state === 'error' && (
                <p className="crm-banner crm-banner--err">
                  Ad spend: {r.canExport ? r.adSpend.error : 'Meta’s figures aren’t available just now.'}
                </p>
              )}
              {table(r.bySource, 'Source')}
            </>
          )}

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

          {r.canExport && (
            <>
              <h2 className="crm-h2">Export</h2>
              <p className="crm-muted crm-small">
                Spreadsheets of everything in the CRM (not just this period) that open in Excel. Customers has one row per customer; jobs has one
                row per opportunity or project.
              </p>
              <div className="crm-actions">
                <a className="crm-btn crm-btn--ghost" href="/api/crm/export?what=customers" download>
                  Export customers (CSV)
                </a>
                <a className="crm-btn crm-btn--ghost" href="/api/crm/export?what=projects" download>
                  Export jobs (CSV)
                </a>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
