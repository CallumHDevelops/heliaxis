import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { dfsBalance, dfsConfigured } from '@/lib/dataforseo/client';
import { overview, periodFor } from '@/lib/search/metrics';
import { BANDS } from '@/lib/search/maths';
import { openActions } from '@/lib/search/inbox';
import { budget } from '@/lib/search/server';
import { channelName } from '@/lib/search/reports';
import { BandBars, Sparkline, WeekLine } from './Charts';
import { dateLabel, DeltaLine, filtersFrom, n, PageHead, Pos, type SP } from './common';

export const dynamic = 'force-dynamic';

export default async function SearchOverview({ searchParams }: { searchParams: SP }) {
  const q = await searchParams;
  const { period: pk, compare, filters } = filtersFrom(q);
  const db = createAdminClient();
  const period = periodFor(pk, undefined, compare);
  const [o, actions, b, balance, feeds] = await Promise.all([
    overview({ period, filters }, db),
    openActions(5, db),
    budget('dataforseo', db),
    dfsConfigured() ? dfsBalance().catch(() => null) : Promise.resolve(null),
    feedHealth(db),
  ]);
  const fresh = (
    <>
      {o.freshness.gscTo ? (
        <>
          Search Console data to <b>{dateLabel(o.freshness.gscTo, true)}</b>
        </>
      ) : (
        'Search Console not connected'
      )}
      <br />
      {o.freshness.serpRun ? (
        <>
          Rankings run <b>{dateLabel(o.freshness.serpRun, true)}</b>
        </>
      ) : (
        'No rankings run yet'
      )}
    </>
  );
  return (
    <>
      <PageHead title={`Overview, ${period.label.toLowerCase()}`} sub={`${dateLabel(period.start)} to ${dateLabel(period.end)}, compared with ${dateLabel(period.compareStart)} to ${dateLabel(period.compareEnd)}.`} fresh={fresh} />

      <section className="sx-tiles" aria-label="This period against the last">
        {o.tiles.map((t) => (
          <article key={t.key} className="sx-tile" title={t.source}>
            <span className="sx-tile__label">{t.label}</span>
            <span className="sx-tile__value">
              {n(t.delta.now, 1)}
              {t.delta.now !== null && t.unit}
            </span>
            <DeltaLine d={t.delta} unit={t.unit} />
            {t.spark.length > 0 && <Sparkline values={t.spark} lowerIsBetter={t.lowerIsBetter} />}
            <span className="sx-tile__note">{t.note ?? t.source}</span>
          </article>
        ))}
      </section>

      <div className="sx-grid2">
        <section className="sx-card">
          <h2>Clicks and impressions, 26 weeks</h2>
          <WeekLine weeks={o.clicksSeries.map((x) => x.week)} values={o.clicksSeries.map((x) => x.clicks)} label="Clicks" />
          <WeekLine weeks={o.clicksSeries.map((x) => x.week)} values={o.clicksSeries.map((x) => x.impressions)} label="Impressions" color="#6d6650" />
          <p>Google Search Console, daily sums by week (Monday to Sunday).</p>
        </section>
        <section className="sx-card">
          <h2>Position bands by week</h2>
          <BandBars series={o.bandSeries} bands={BANDS} />
          <p>Tracked searches by where we rank, from each week’s last rankings run ({filters.device === 'desktop' ? 'desktop' : 'phone'}).</p>
        </section>
      </div>

      <div className="sx-grid3">
        <section className="sx-card">
          <h2>Winners and losers</h2>
          {!o.winners.length && !o.losers.length ? (
            <p>{o.rankRunDates.before ? 'No movement between the last two runs.' : 'Needs two rankings runs to compare.'}</p>
          ) : (
            <ul className="sx-list">
              {[...o.winners.map((w) => ({ ...w, up: true })), ...o.losers.map((w) => ({ ...w, up: false }))].map((w) => (
                <li key={`${w.keywordId}-${w.up}`}>
                  <Link href={`/admin/search/rankings?k=${w.keywordId}`}>{w.label}</Link>
                  <span>
                    <Pos p={w.before} /> → <Pos p={w.now} /> <span className={w.up ? 'sx-up' : 'sx-down'}>{w.up ? '▲' : '▼'} {Math.abs(w.moved)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {o.rankRunDates.now && (
            <p>
              Run of {dateLabel(o.rankRunDates.now)} against {o.rankRunDates.before ? dateLabel(o.rankRunDates.before) : 'none'}; ranked by places moved × volume.
            </p>
          )}
        </section>
        <section className="sx-card">
          <h2>Needs you</h2>
          {!actions.length ? (
            <p>Nothing waiting.</p>
          ) : (
            <ul className="sx-list">
              {actions.map((a) => (
                <li key={a.id}>
                  <span>
                    {a.fix_href ? <Link href={a.fix_href}>{a.title}</Link> : a.title}
                    {a.why && (
                      <>
                        <br />
                        <small>{a.why}</small>
                      </>
                    )}
                  </span>
                  <small>{a.due ? `Due ${dateLabel(a.due)}` : ''}</small>
                </li>
              ))}
            </ul>
          )}
          <Link className="crm-link" href="/admin/search/needs-you">
            Open Needs you
          </Link>
        </section>
        <section className="sx-card">
          <h2>Leads by channel</h2>
          {!o.leads.length ? (
            <p>No enquiries in either period.</p>
          ) : (
            <table className="sx-table">
              <thead>
                <tr>
                  <th>Channel</th>
                  <th className="num">{period.label}</th>
                  <th className="num">Before</th>
                </tr>
              </thead>
              <tbody>
                {o.leads.map((l) => (
                  <tr key={l.channel}>
                    <td>{channelName(l.channel)}</td>
                    <td className="num">{l.now}</td>
                    <td className="num">{l.before}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p>From the referrer and landing page each enquiry arrived with. Older enquiries have no channel unless they came from a Meta lead form.</p>
        </section>
      </div>

      <div className="sx-grid2">
        <section className="sx-card">
          <h2>Recent pages</h2>
          <p>Pages published from the content studio, with their change at day 14 and day 28. The studio arrives in phase 3.</p>
        </section>
        <section className="sx-card">
          <h2>Data health and spend</h2>
          <table className="sx-table">
            <tbody>
              {feeds.map((f) => (
                <tr key={f.label}>
                  <td>{f.label}</td>
                  <td>{f.at ? dateLabel(f.at, true) : <span className="sx-note">never</span>}</td>
                  <td className="sx-note">{f.note}</td>
                </tr>
              ))}
              <tr>
                <td>DataForSEO this month</td>
                <td>
                  ${b.spent.toFixed(2)} of ${b.cap.toFixed(0)}
                </td>
                <td className="sx-note">{b.cap ? `${Math.round((b.spent / b.cap) * 100)}% of the cap` : 'No cap set'}</td>
              </tr>
              <tr>
                <td>DataForSEO balance</td>
                <td>{balance === null ? '–' : `$${balance.toFixed(2)}`}</td>
                <td className="sx-note">{balance !== null && balance < 10 ? 'Low: top up' : dfsConfigured() ? '' : 'Not set up'}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}

async function feedHealth(db: ReturnType<typeof createAdminClient>) {
  const [run, gsc, labs, audit, report] = await Promise.all([
    db.from('seo_serp_run').select('run_date, status, tasks, tasks_done, tasks_failed').neq('kind', 'live').order('started_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('gsc_daily').select('date').order('date', { ascending: false }).limit(1).maybeSingle(),
    db.from('seo_ranked_keyword').select('date').order('date', { ascending: false }).limit(1).maybeSingle(),
    db.from('cms_kv').select('updated_at').like('key', 'seo-audit:%').order('key', { ascending: false }).limit(1).maybeSingle(),
    db.from('seo_report').select('created_at, status').order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const r = run.data;
  return [
    { label: 'Rankings (DataForSEO)', at: r?.run_date ?? null, note: r ? (r.status === 'done' ? `${r.tasks_done} of ${r.tasks} searches${r.tasks_failed ? `, ${r.tasks_failed} failed` : ''}` : r.status === 'waiting' ? `In progress: ${r.tasks_done} of ${r.tasks} in` : r.status) : '' },
    { label: 'Search Console', at: gsc.data?.date ?? null, note: gsc.data ? '' : 'Not connected' },
    { label: 'Keywords we rank for (Labs)', at: labs.data?.date ?? null, note: 'Estimate' },
    { label: 'Site audit', at: audit.data?.updated_at ?? null, note: '' },
    { label: 'Weekly report', at: report.data?.created_at ?? null, note: report.data?.status ?? '' },
  ];
}
