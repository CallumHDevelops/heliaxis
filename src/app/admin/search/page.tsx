import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { dfsBalance, dfsConfigured } from '@/lib/dataforseo/client';
import { overview, periodFor } from '@/lib/search/metrics';
import { BANDS } from '@/lib/search/maths';
import { openActions } from '@/lib/search/inbox';
import { budget } from '@/lib/search/server';
import { isInstaller, isOurs } from '@/lib/seo/rankings';
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
      {o.rankRunDates.now ? (
        <>
          Rankings of <b>{dateLabel(o.rankRunDates.now, true)}</b>
          {feeds[0].note.startsWith('In progress') ? ` (${feeds[0].note.toLowerCase()})` : ''}
        </>
      ) : (
        'No rankings run yet'
      )}
    </>
  );
  const win = o.rankRunDates.now ? await winners(db, o.rankRunDates.now, filters.device ?? 'mobile') : null;
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

      {win && (
        <div className="sx-grid2">
          <section className="sx-card">
            <h2>Who ranks instead of us</h2>
            <p>
              Installers in Google’s top 10 across {win.searches} tracked searches ({dateLabel(o.rankRunDates.now)}). Directories, councils and news sites are left out.
              {win.oursBest ? ` Our best: position ${win.oursBest.pos} for “${win.oursBest.phrase}”.` : ' We are not in the top 100 for any of them yet.'}
            </p>
            <table className="sx-table">
              <thead>
                <tr>
                  <th>Site</th>
                  <th className="num">Searches in top 10</th>
                  <th className="num">In top 3</th>
                  <th className="num">Best</th>
                </tr>
              </thead>
              <tbody>
                {win.sites.map((s) => (
                  <tr key={s.domain}>
                    <td>{s.domain}</td>
                    <td className="num">{s.top10}</td>
                    <td className="num">{s.top3}</td>
                    <td className="num">
                      <Pos p={s.best} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Link className="crm-link" href="/admin/search/rankings">
              Every search, with its full top 100
            </Link>
          </section>
          <section className="sx-card">
            <h2>Who is in the map pack</h2>
            <p>The three businesses Google shows under the map, by how many tracked searches they appear in. The map pack weighs distance to the searcher heavily, so it is strongest around each firm’s address.</p>
            <table className="sx-table">
              <thead>
                <tr>
                  <th>Business</th>
                  <th className="num">Searches</th>
                  <th className="num">First</th>
                </tr>
              </thead>
              <tbody>
                {win.pack.map((p) => (
                  <tr key={p.name} className={/heliaxis/i.test(p.name) ? 'ours' : undefined}>
                    <td>{p.name}</td>
                    <td className="num">{p.n}</td>
                    <td className="num">{p.first}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!win.pack.some((p) => /heliaxis/i.test(p.name)) && <p>Heliaxis is not in the map pack for any tracked search yet.</p>}
          </section>
        </div>
      )}

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

/** From one run: the installers that hold the top 10, the map-pack businesses, and our best place. */
async function winners(db: ReturnType<typeof createAdminClient>, date: string, device: 'mobile' | 'desktop') {
  const [{ data: items }, { data: ours }, { count }] = await Promise.all([
    db.from('seo_serp_item').select('keyword_id, pos, type, domain, title').eq('date', date).eq('device', device).or('and(type.eq.organic,pos.lte.10),type.eq.local_pack').limit(10000),
    db.from('seo_serp_result').select('our_pos, seo_keyword(phrase)').eq('date', date).eq('device', device).not('our_pos', 'is', null).order('our_pos').limit(1),
    db.from('seo_serp_result').select('keyword_id', { count: 'exact', head: true }).eq('date', date).eq('device', device).is('error', null),
  ]);
  const sites = new Map<string, { top10: number; top3: number; best: number }>();
  const pack = new Map<string, { n: number; first: number }>();
  for (const i of items ?? []) {
    if (i.type === 'organic' && i.domain && isInstaller(i.domain) && !isOurs(i.domain)) {
      const s = sites.get(i.domain) ?? { top10: 0, top3: 0, best: 99 };
      s.top10++;
      if (i.pos <= 3) s.top3++;
      s.best = Math.min(s.best, i.pos);
      sites.set(i.domain, s);
    } else if (i.type === 'local_pack' && i.title) {
      const p = pack.get(i.title) ?? { n: 0, first: 0 };
      p.n++;
      if (i.pos === 1) p.first++;
      pack.set(i.title, p);
    }
  }
  const o = ours?.[0] as { our_pos: number; seo_keyword: { phrase: string } | { phrase: string }[] | null } | undefined;
  const phrase = o ? (Array.isArray(o.seo_keyword) ? o.seo_keyword[0]?.phrase : o.seo_keyword?.phrase) : null;
  return {
    searches: count ?? 0,
    sites: [...sites.entries()].map(([domain, s]) => ({ domain, ...s })).sort((a, b) => b.top10 - a.top10 || b.top3 - a.top3).slice(0, 10),
    pack: [...pack.entries()].map(([name, p]) => ({ name, ...p })).sort((a, b) => b.n - a.n || b.first - a.first).slice(0, 10),
    oursBest: o && phrase ? { pos: o.our_pos, phrase } : null,
  };
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
