import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { dfsConfigured } from '@/lib/dataforseo/client';
import { budget, getSetting, searchSession } from '@/lib/search/server';
import { can } from '@/lib/search/settings';
import { addDays, ukClock } from '@/lib/search/schedule';
import { gridPlanNow } from '@/lib/search/local/grid-run';
import { gbpConfigured, gbpMissing } from '@/lib/search/local/gbp';
import { WAITING } from '@/lib/search/local/grid';
import { categoryGaps, profileRows, reviewPaceTarget, type BusinessRow, type SnapshotRow } from '@/lib/search/local/profile';
import { keywordMoves, lastFullMonths, monthTotals, type DailyRow, type KeywordRow } from '@/lib/search/local/gbp-parse';
import { dateLabel, n, PageHead } from '../common';
import { GridMap, type GridScanView } from './GridMap';
import { Citations, ImportGbpButton, RunGridButton, type CitationView } from './LocalClient';
import './local.css';

export const dynamic = 'force-dynamic';

type Scan = { id: number; keyword_id: number | null; phrase: string; centre: string; centre_lat: number; centre_lng: number; date: string; status: string; avg_rank: number | null; top3_share: number | null; cost_usd: number };
type Point = { scan_id: number; lat: number; lng: number; task_id: string | null; our_rank: number | null; top3: unknown };

const monthLabel = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
const pct = (v: number | null | undefined) => (v === null || v === undefined ? '–' : `${Math.round(v * 100)}%`);

function Change({ now, before }: { now: number; before: number | undefined }) {
  if (before === undefined) return <span className="sx-note">no month before</span>;
  const d = now - before;
  if (!d) return <span className="sx-note">same</span>;
  return <span className={d > 0 ? 'sx-up' : 'sx-down'}>{d > 0 ? `▲ ${d}` : `▼ ${-d}`}</span>;
}

export default async function Local() {
  const db = createAdminClient();
  const session = await searchSession();
  const today = ukClock().date;

  const [{ plan, estimate }, spend, business, scansRes, bizRes, snapRes, packDateRes, citRes, gbpRes, kwRes, askRes] = await Promise.all([
    gridPlanNow(db),
    budget('dataforseo', db),
    getSetting('business', db),
    db.from('seo_grid_scan').select('id, keyword_id, phrase, centre, centre_lat, centre_lng, date, status, avg_rank, top3_share, cost_usd').order('date', { ascending: false }).order('id', { ascending: false }).limit(400),
    db.from('seo_business').select('id, name, domain, primary_category, categories, is_ours'),
    db.from('seo_business_snapshot').select('business_id, date, rating, reviews, reviews_90d, photos, responded_pct').gte('date', addDays(today, -120)).limit(5000),
    db.from('seo_serp_result').select('date').eq('device', 'mobile').order('date', { ascending: false }).limit(1),
    db.from('seo_citation').select('id, directory, url, status, name_shown, address_shown, phone_shown, checked_at, notes').order('id'),
    db.from('gbp_daily').select('date, metric, value').gte('date', `${lastFullMonths(today, 13)[12]}-01`).limit(20000),
    db.from('gbp_keyword_monthly').select('month, keyword, impressions').gte('month', `${lastFullMonths(today, 2)[1]}-01`).limit(5000),
    db.from('review_requests').select('id', { count: 'exact', head: true }).gte('sent_at', `${addDays(today, -90)}T00:00:00Z`),
  ]);

  /* ── Grid ── */
  const allScans = (scansRes.data ?? []) as Scan[];
  const latest = new Map<string, Scan>();
  for (const s of allScans) {
    const key = `${s.keyword_id ?? s.phrase}|${s.centre}`;
    if (!latest.has(key)) latest.set(key, s);
  }
  const shown = [...latest.values()];
  const { data: pts } = shown.length ? await db.from('seo_grid_point').select('scan_id, lat, lng, task_id, our_rank, top3').in('scan_id', shown.map((s) => s.id)).limit(10000) : { data: [] };
  const byScan = new Map<number, Point[]>();
  for (const p of (pts ?? []) as Point[]) byScan.set(p.scan_id, [...(byScan.get(p.scan_id) ?? []), p]);
  const views: GridScanView[] = shown.map((s) => ({
    id: s.id,
    phrase: s.phrase,
    centre: s.centre,
    date: s.date,
    status: s.status,
    avgRank: s.avg_rank === null ? null : Number(s.avg_rank),
    top3Share: s.top3_share === null ? null : Number(s.top3_share),
    centreLat: Number(s.centre_lat),
    centreLng: Number(s.centre_lng),
    points: (byScan.get(s.id) ?? []).map((p) => ({
      lat: Number(p.lat),
      lng: Number(p.lng),
      rank: p.our_rank && p.our_rank > 0 ? p.our_rank : null,
      checked: !!p.task_id && p.our_rank !== WAITING,
      top3: Array.isArray(p.top3) ? (p.top3 as GridScanView['points'][number]['top3']).filter((t) => t && typeof t === 'object' && 'pos' in t) : [],
    })),
  }));
  const lastScanDate = shown[0]?.date ?? null;
  const waitingScans = shown.filter((s) => s.status === 'waiting').length;
  // Per centre, across its searches: mean of the scans' averages, and the share of every checked point in the top 3.
  const centreSummary = [...new Set(views.map((v) => v.centre))].map((c) => {
    const vs = views.filter((v) => v.centre === c && v.status === 'done');
    const avgs = vs.map((v) => v.avgRank).filter((x): x is number => x !== null);
    const checked = vs.flatMap((v) => v.points.filter((p) => p.checked));
    return {
      centre: c,
      searches: vs.length,
      avg: avgs.length ? Math.round((avgs.reduce((a, b) => a + b, 0) / avgs.length) * 10) / 10 : null,
      top3: checked.length ? checked.filter((p) => p.rank !== null && p.rank <= 3).length / checked.length : null,
      points: checked.length,
    };
  });
  const overCap = spend.spent + estimate.usd > spend.cap;

  /* ── Profiles ── */
  const packDate = (packDateRes.data?.[0]?.date as string | undefined) ?? null;
  const { data: packItems } = packDate ? await db.from('seo_serp_item').select('title').eq('device', 'mobile').eq('date', packDate).eq('type', 'local_pack').limit(5000) : { data: [] };
  const rows = profileRows((bizRes.data ?? []) as BusinessRow[], (snapRes.data ?? []) as SnapshotRow[], (packItems ?? []).map((p) => String(p.title ?? '')));
  const ours = rows.find((r) => r.is_ours) ?? null;
  const target = reviewPaceTarget(rows);
  const gaps = categoryGaps(rows);
  const askedCount = askRes.error ? null : (askRes.count ?? 0);

  /* ── Business Profile performance ── */
  const months = monthTotals((gbpRes.data ?? []) as DailyRow[]);
  const fullMonths = lastFullMonths(today, 12);
  const monthRows = fullMonths.map((m) => months.find((x) => x.month === m)).filter((x): x is NonNullable<typeof x> => !!x);
  const [lastM, prevM] = lastFullMonths(today, 2);
  const kwRows = (kwRes.data ?? []) as { month: string; keyword: string; impressions: number | null }[];
  const kwOf = (m: string): KeywordRow[] => kwRows.filter((r) => String(r.month).slice(0, 7) === m).map((r) => ({ keyword: r.keyword, impressions: r.impressions }));
  const kwLatestMonth = kwOf(lastM).length ? lastM : kwOf(prevM).length ? prevM : null;
  const kwMoves = kwLatestMonth ? keywordMoves(kwOf(kwLatestMonth), kwOf(lastFullMonths(`${kwLatestMonth}-15`, 1)[0])) : [];
  const connected = gbpConfigured();

  const canSpend = session ? can.spend(session.role) : false;
  const canEdit = session ? can.draft(session.role) : false;
  const facts = { name: business.name, address: business.address, phone: business.phone };

  return (
    <>
      <PageHead
        title="Local"
        sub="Where we show in the Google map pack across our area, and how our Business Profile compares with the ones that beat us."
        fresh={lastScanDate ? <>Grid of <b>{dateLabel(lastScanDate, true)}</b>{waitingScans ? <><br />{waitingScans} still arriving</> : null}</> : 'No grid yet'}
      />

      {/* 1. Grid heat map */}
      <section className="sx-card">
        <div className="sx-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <h2>Map grid</h2>
          {dfsConfigured() ? (
            <RunGridButton usd={estimate.usd} tasks={estimate.tasks} overCap={overCap} canSpend={canSpend} canOverride={session ? can.overrideCap(session.role) : false} />
          ) : (
            <span className="sx-note">DataForSEO is not set up (Settings › Connections).</span>
          )}
        </div>
        <p>
          A 5×5 grid, 10 km across, round each Tier 1 area within reach of Newport, for its 10 most important searches (local commercial first, then priority). Runs on the 2nd of each month. This month’s full run: {estimate.scans} grids, {n(estimate.tasks)} Maps searches, about ${estimate.usd.toFixed(2)} (${spend.spent.toFixed(2)} of the ${spend.cap.toFixed(0)} cap spent this month).
        </p>
        {views.length ? (
          <>
            <GridMap scans={views} />
            <div className="sx-tablewrap">
              <table className="sx-table">
                <thead>
                  <tr>
                    <th>Centre</th>
                    <th className="num">Searches</th>
                    <th className="num">Average rank</th>
                    <th className="num">Points in the top 3</th>
                  </tr>
                </thead>
                <tbody>
                  {centreSummary.map((c) => (
                    <tr key={c.centre}>
                      <td>{c.centre}</td>
                      <td className="num">{c.searches}</td>
                      <td className="num">{c.avg ?? '–'}</td>
                      <td className="num">
                        {pct(c.top3)} <span className="sx-note">of {c.points}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="sx-note">Average rank counts only the points where we are listed in the top 20; the top-3 share is out of every point that came back.</p>
          </>
        ) : (
          <p className="sx-note">No grid has run yet. The first runs on the 2nd of the month, or press Run the grid now.</p>
        )}
        <details>
          <summary className="sx-note">Which areas get a grid</summary>
          <div className="sx-tablewrap">
            <table className="sx-table lcl-reach">
              <thead>
                <tr>
                  <th>Tier 1 area</th>
                  <th>Grid</th>
                  <th>Centre</th>
                  <th className="num">From Newport</th>
                  <th className="num">Searches</th>
                </tr>
              </thead>
              <tbody>
                {plan.map((p) => (
                  <tr key={p.area}>
                    <td>{p.area}</td>
                    <td>{p.reach.grid ? <span className="sx-state done">Map grid</span> : <span className="sx-state manual" title={p.reach.why}>{p.reach.label === 'organic only' ? 'Organic only' : p.reach.why}</span>}</td>
                    <td>{p.reach.centreName ?? '–'}</td>
                    <td className="num">{p.reach.km !== undefined ? `${p.reach.km} km` : '–'}</td>
                    <td className="num">{p.reach.grid ? (p.keywords.length ? p.keywords.length : <span className="sx-note">none tracked</span>) : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="sx-note">Distance to the business is one of the strongest map-pack factors, so areas far from Newport are won with town pages, hub pages and reviews that name the town, not the map pack (spec §9). Change grid centres in <Link href="/admin/search/settings/areas" className="crm-link">Settings › Target areas</Link>.</p>
        </details>
      </section>

      {/* 2. Profile against rivals */}
      <section className="sx-card">
        <h2>Our profile against rivals</h2>
        {rows.length ? (
          <>
            <div className="sx-tablewrap">
              <table className="sx-table">
                <thead>
                  <tr>
                    <th>Business</th>
                    <th>Primary category</th>
                    <th className="num">Categories</th>
                    <th className="num">Rating</th>
                    <th className="num">Reviews</th>
                    <th className="num">Last 90 days</th>
                    <th className="num">Photos</th>
                    <th className="num">Replies to reviews</th>
                    <th>In a map pack</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className={r.is_ours ? 'ours' : ''}>
                      <td>
                        {r.name}
                        {r.domain ? <div className="sx-note">{r.domain}</div> : null}
                      </td>
                      <td>{r.primary_category ?? '–'}</td>
                      <td className="num">{r.categories?.length ?? 0}</td>
                      <td className="num">{r.snap?.rating ?? '–'}</td>
                      <td className="num">{n(r.snap?.reviews)}</td>
                      <td className="num">{n(r.snap?.reviews_90d)}</td>
                      <td className="num">{n(r.snap?.photos)}</td>
                      <td className="num">{r.snap?.responded_pct === null || r.snap?.responded_pct === undefined ? '–' : `${Math.round(Number(r.snap.responded_pct))}%`}</td>
                      <td>{r.inPack ? 'Yes' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="sx-note">
              From Google Business Profiles via DataForSEO, pulled on Mondays at 07:30
              {rows.some((r) => r.snap) ? `; latest snapshot ${dateLabel(rows.map((r) => r.snap?.date ?? '').sort().pop())}` : '; no snapshot yet'}. “In a map pack” means the name showed in a map pack in the {packDate ? `${dateLabel(packDate)} ` : ''}rankings run.
              {ours ? '' : ' Our own profile is not matched yet: it is found by name in the same pull.'}
            </p>
            {gaps.length ? (
              <p>
                Categories most map-pack rivals list that we don’t:{' '}
                {gaps.map((g) => (
                  <span key={g.category} className="sx-chip gold" title={`${g.rivals} rivals`}>
                    {g.category}
                  </span>
                ))}{' '}
                <span className="sx-note">Add one only if it is true of the work we do (strategy §5).</span>
              </p>
            ) : null}
          </>
        ) : (
          <p className="sx-note">No Business Profiles pulled yet. The rival profiles and ours are pulled every Monday at 07:30 (Competitors), once DataForSEO is connected and a rankings run has found the map packs.</p>
        )}
      </section>

      {/* 3. Our profile performance */}
      <section className="sx-card">
        <div className="sx-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <h2>Our Business Profile performance</h2>
          {connected && canSpend ? <ImportGbpButton /> : null}
        </div>
        {!connected ? (
          <p className="sx-note">
            Not connected. HAP reads calls, website clicks, direction requests and search keywords from the Business Profile Performance API, signed in as the profile’s owner. It needs Business Profile API access from Google (new projects start at a quota of 0), then these settings in Vercel: {gbpMissing().join(', ')}. It then imports daily at 05:30.
          </p>
        ) : monthRows.length ? (
          <>
            <div className="sx-tiles">
              {(['calls', 'website', 'directions', 'impressions'] as const).map((k) => {
                const [a, b] = monthRows;
                const label = { calls: 'Calls', website: 'Website clicks', directions: 'Direction requests', impressions: 'Profile views' }[k];
                return (
                  <div key={k} className="sx-tile">
                    <span className="sx-tile__label">{label}</span>
                    <span className="sx-tile__value">{n(a[k])}</span>
                    <span className="sx-tile__note">
                      {monthLabel(a.month)} · <Change now={a[k]} before={b && b.month === lastFullMonths(`${a.month}-15`, 1)[0] ? b[k] : undefined} />
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="sx-tablewrap">
              <table className="sx-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th className="num">Calls</th>
                    <th className="num">Website clicks</th>
                    <th className="num">Direction requests</th>
                    <th className="num">Profile views</th>
                  </tr>
                </thead>
                <tbody>
                  {monthRows.map((m) => (
                    <tr key={m.month}>
                      <td>
                        {monthLabel(m.month)}
                        {m.days < 28 ? <span className="sx-small"> {m.days} days</span> : null}
                      </td>
                      <td className="num">{n(m.calls)}</td>
                      <td className="num">{n(m.website)}</td>
                      <td className="num">{n(m.directions)}</td>
                      <td className="num">{n(m.impressions)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="sx-note">Google Business Profile Performance API, full calendar months. Profile views add up search and Maps views on phone and computer.</p>
          </>
        ) : (
          <p className="sx-note">Connected, but nothing imported yet. The import runs daily at 05:30.</p>
        )}
        {connected ? (
          kwMoves.length ? (
            <>
              <h3 className="lcl-h3">Searches that showed our profile, {monthLabel(kwLatestMonth!)}</h3>
              <div className="sx-tablewrap">
                <table className="sx-table">
                  <thead>
                    <tr>
                      <th>Search</th>
                      <th className="num">Views</th>
                      <th className="num">Month before</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kwMoves.map((k) => (
                      <tr key={k.keyword}>
                        <td>{k.keyword}</td>
                        <td className="num">{k.now === null ? 'fewer than 15' : n(k.now)}</td>
                        <td className="num">{k.isNew ? <span className="sx-note">new</span> : k.before === null ? 'fewer than 15' : n(k.before)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="sx-note">Search keywords arrive monthly, from the 3rd.</p>
          )
        ) : null}
      </section>

      {/* 4. Reviews target */}
      <section className="sx-card">
        <h2>Reviews: the pace to match</h2>
        {target ? (
          <>
            <p className="lcl-target">
              {target.ahead
                ? `We are at or above the median: ${target.ourPace} new reviews in 90 days against ${target.medianPace}.`
                : `To match the median ${target.basis === 'map_pack' ? 'map-pack rival' : 'rival'}, we need ${target.need} new Google reviews in the next 90 days: about ${target.perWeek} a week, ${target.perMonth} a month.`}
            </p>
            <p className="sx-note">
              Median of {target.rivals} {target.basis === 'map_pack' ? 'rivals that showed in a map pack' : 'rivals on file (none matched a map pack yet)'}: {target.medianPace} reviews in their last 90 days. Ours: {target.ourPace ?? 'not on file yet'}.
              {askedCount !== null ? ` Review requests sent in the last 90 days: ${askedCount}.` : ''}
            </p>
          </>
        ) : (
          <p className="sx-note">No review pace on file yet. It comes from the Monday Business Profile pull (reviews in the last 90 days, per business).</p>
        )}
        <p>
          The way to get there is to ask every customer, a few days after handover, for an honest Google review: the same neutral request to everyone, happy or not, with no reward and no mention of one (strategy §6, Ask A). Never offer a gift card, discount or anything else for a Google or Trustpilot review: it breaks both platforms’ rules and UK law. Reply to every review within two working days.
        </p>
        <div className="sx-row">
          <Link href="/admin/reviews" className="crm-btn crm-btn--ghost crm-btn--small">
            Review requests
          </Link>
          <Link href="/admin/crm/settings" className="crm-btn crm-btn--ghost crm-btn--small">
            When requests go (CRM settings)
          </Link>
        </div>
      </section>

      {/* 5. Citations */}
      <section className="sx-card">
        <h2>Citations checklist</h2>
        <p>
          The directories we genuinely belong to, with what each shows. A name, address or phone that doesn’t match{' '}
          <Link href="/admin/search/settings/business" className="crm-link">
            Settings › Business facts
          </Link>{' '}
          is flagged. Keep them identical everywhere.
          {!business.address ? ' The business address is not filled in yet, so addresses can’t be checked.' : ''}
        </p>
        {(citRes.data ?? []).length ? (
          <Citations rows={(citRes.data ?? []) as CitationView[]} facts={facts} canEdit={canEdit} />
        ) : (
          <p className="sx-note">The checklist is empty: the directory rows come from supabase/search-portal-2.sql.</p>
        )}
      </section>
    </>
  );
}
