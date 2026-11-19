import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { clickShare, isInstaller, isOurs } from '@/lib/seo/rankings';
import { getSetting, searchSession } from '@/lib/search/server';
import { can, tierOf } from '@/lib/search/settings';
import { addDays, ukClock } from '@/lib/search/schedule';
import { PositionHistory } from '../Charts';
import { dateLabel, filtersFrom, Move, n, one, PageHead, Pos, type SP } from '../common';
import { CheckNow, RowLink, TrackButton } from './RankingsClient';

export const dynamic = 'force-dynamic';

type Kw = { id: number; phrase: string; town: string | null; service: string | null; intent: string; priority: number; volume: number | null; target_page: string | null };
type Res = { keyword_id: number; date: string; our_pos: number | null; our_url: string | null; our_pack_pos: number | null; also_ours: string[] | null; aio_present: boolean; aio_cited: boolean; features: string[]; error: string | null };
type Item = { keyword_id: number; pos: number; type: string; domain: string | null; url: string | null; title: string | null; resolved_by: string | null };

const path = (u: string | null) => {
  if (!u) return '';
  try {
    return new URL(u).pathname || '/';
  } catch {
    return u;
  }
};

export default async function Rankings({ searchParams }: { searchParams: SP }) {
  const q = await searchParams;
  const { filters } = filtersFrom(q);
  const device = filters.device ?? 'mobile';
  const db = createAdminClient();
  const session = await searchSession();
  const areas = await getSetting('areas', db);

  const { data: dates } = await db.from('seo_serp_result').select('date').eq('device', device).order('date', { ascending: false }).limit(2000);
  const runDates = [...new Set((dates ?? []).map((d) => d.date as string))];
  const latest = runDates[0] ?? null;
  const previous = runDates[1] ?? null;

  const [kwRes, nowRes, prevRes, itemsRes, gscRes, rankedRes, trackedRes] = await Promise.all([
    db.from('seo_keyword').select('id, phrase, town, service, intent, priority, volume, target_page').eq('active', true).order('priority').order('id'),
    latest ? db.from('seo_serp_result').select('*').eq('device', device).eq('date', latest) : Promise.resolve({ data: [] }),
    previous ? db.from('seo_serp_result').select('keyword_id, our_pos').eq('device', device).eq('date', previous) : Promise.resolve({ data: [] }),
    latest ? db.from('seo_serp_item').select('keyword_id, pos, type, domain, url, title, resolved_by').eq('device', device).eq('date', latest).eq('type', 'organic').lte('pos', 10).limit(5000) : Promise.resolve({ data: [] }),
    db.from('gsc_daily').select('query, impressions, position').gte('date', addDays(ukClock().date, -30)).limit(100000),
    db.from('seo_ranked_keyword').select('date, keyword, pos, url, volume').order('date', { ascending: false }).limit(1000),
    db.from('seo_keyword').select('phrase'),
  ]);

  const kws = ((kwRes.data ?? []) as Kw[]).filter(
    (k) => (!filters.town || k.town === filters.town) && (!filters.service || k.service === filters.service) && (!filters.intent || k.intent === filters.intent) && (!filters.tier || tierOf(k.town, areas.list) === filters.tier),
  );
  const now = new Map(((nowRes.data ?? []) as Res[]).map((r) => [r.keyword_id, r]));
  const prev = new Map(((prevRes.data ?? []) as { keyword_id: number; our_pos: number | null }[]).map((r) => [r.keyword_id, r.our_pos]));
  const top10 = new Map<number, Item[]>();
  for (const it of (itemsRes.data ?? []) as Item[]) top10.set(it.keyword_id, [...(top10.get(it.keyword_id) ?? []), it]);

  // Search Console's average position for the same query, last 30 days (weighted by impressions).
  const gscPos = new Map<string, { w: number; s: number }>();
  for (const r of (gscRes.data ?? []) as { query: string; impressions: number; position: number }[]) {
    const e = gscPos.get(r.query.toLowerCase()) ?? { w: 0, s: 0 };
    e.w += r.impressions;
    e.s += r.impressions * r.position;
    gscPos.set(r.query.toLowerCase(), e);
  }
  const gscFor = (phrase: string) => {
    const e = gscPos.get(phrase.toLowerCase());
    return e && e.w ? Math.round((e.s / e.w) * 10) / 10 : null;
  };

  const rows = kws.map((k) => {
    const r = now.get(k.id);
    const items = (top10.get(k.id) ?? []).sort((a, b) => a.pos - b.pos);
    const rival = items.find((i) => i.domain && !isOurs(i.domain) && isInstaller(i.domain));
    const vol = k.volume ?? null;
    const opportunity = Math.round((vol ?? 10) * (clickShare(1) - clickShare(r?.our_pos ?? null)) * 10) / 10;
    const gsc = gscFor(k.phrase);
    return { k, r, before: prev.has(k.id) ? (prev.get(k.id) ?? null) : undefined, rival, opportunity, gsc, cannibal: (r?.also_ours?.length ?? 0) > 0 };
  });
  rows.sort((a, b) => a.k.priority - b.k.priority || (a.r?.our_pos ?? 999) - (b.r?.our_pos ?? 999));

  const ranked = (rankedRes.data ?? []) as { date: string; keyword: string; pos: number | null; url: string | null; volume: number | null }[];
  const rankedDate = ranked[0]?.date ?? null;
  const tracked = new Set(((trackedRes.data ?? []) as { phrase: string }[]).map((t) => t.phrase.toLowerCase()));
  const untracked = ranked.filter((r) => r.date === rankedDate && !tracked.has(r.keyword.toLowerCase())).sort((a, b) => (a.pos ?? 999) - (b.pos ?? 999)).slice(0, 50);

  const open = Number(one(q.k)) || null;
  const canSpend = session ? can.spend(session.role) : false;

  return (
    <>
      <PageHead
        title="Rankings"
        sub={`Our organic position from 1 to 100, our map-pack place and the AI Overview for every tracked search, as seen on a ${device === 'desktop' ? 'desktop' : 'phone'} in each search’s town.`}
        fresh={latest ? <>Run of <b>{dateLabel(latest, true)}</b>{previous ? <><br />compared with {dateLabel(previous)}</> : null}</> : 'No run yet'}
      />
      <section className="sx-card">
        <div className="sx-row" style={{ justifyContent: 'space-between' }}>
          <h2>Tracked searches ({rows.length})</h2>
          <span className="sx-note">
            In the top 10: {rows.filter((r) => (r.r?.our_pos ?? 999) <= 10).length} · in the top 100: {rows.filter((r) => r.r?.our_pos != null).length} · in the map pack: {rows.filter((r) => r.r?.our_pack_pos != null).length}
          </span>
        </div>
        <div className="sx-tablewrap">
          <table className="sx-table">
            <thead>
              <tr>
                <th>Search</th>
                <th>Town</th>
                <th className="num">Position</th>
                <th className="num">Change</th>
                <th>Ranking page</th>
                <th className="num">Map pack</th>
                <th>AI Overview</th>
                <th>Top rival</th>
                <th className="num">Volume</th>
                <th className="num">Opportunity</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ k, r, before, rival, opportunity, gsc, cannibal }) => (
                <RowLink key={k.id} href={`?${new URLSearchParams({ ...Object.fromEntries(Object.entries(q).map(([a, b]) => [a, one(b)])), k: String(k.id) }).toString()}`}>
                  <td>
                    {k.phrase}
                    {k.priority === 1 && <span className="sx-chip gold">P1</span>}
                    {cannibal && <span className="sx-chip" title={`Also ranking: ${r?.also_ours?.join(', ')}`}>two pages</span>}
                    {gsc !== null && r?.our_pos != null && Math.abs(gsc - r.our_pos) > 10 && <span className="sx-chip" title={`Search Console says ${gsc}`}>differs from Search Console</span>}
                  </td>
                  <td>{k.town}</td>
                  <td className="num">{r?.error ? <span className="sx-note" title={r.error}>failed</span> : <Pos p={r?.our_pos} />}</td>
                  <td className="num">{r && !r.error ? <Move before={before} now={r.our_pos} /> : ''}</td>
                  <td>{r?.our_url ? <span title={r.our_url}>{path(r.our_url)}</span> : <span className="sx-note">{k.target_page ? `Target: ${k.target_page}` : ''}</span>}</td>
                  <td className="num">{r?.our_pack_pos ?? <span className="sx-note">–</span>}</td>
                  <td>{r ? (r.aio_cited ? <span className="sx-chip gold">cites us</span> : r.aio_present ? <span className="sx-chip">shown</span> : <span className="sx-note">–</span>) : ''}</td>
                  <td>{rival ? `${rival.domain} (${rival.pos})` : ''}</td>
                  <td className="num">{n(k.volume)}</td>
                  <td className="num">{r ? n(opportunity, 1) : ''}</td>
                </RowLink>
              ))}
            </tbody>
          </table>
        </div>
        <p>Position is Google’s organic rank (rank_group); “–” means not in the top 100. Opportunity is the monthly volume times the share of clicks we would gain at position 1 (volume counts as 10 until it is known). A search is flagged when two of our pages rank for it, or when Search Console’s average position (last 30 days) differs by more than 10.</p>
      </section>

      <section className="sx-card">
        <h2>Untracked wins</h2>
        <p>
          Keywords Google already ranks us for that are not tracked yet (DataForSEO Labs, an estimate that can lag by weeks{rankedDate ? `; data of ${dateLabel(rankedDate)}` : ''}).
        </p>
        {!untracked.length ? (
          <p className="sx-note">{rankedDate ? 'Every keyword we rank for is already tracked.' : 'Not pulled yet: the first pull runs on Monday at 06:30.'}</p>
        ) : (
          <table className="sx-table">
            <thead>
              <tr>
                <th>Keyword</th>
                <th className="num">Position</th>
                <th>Page</th>
                <th className="num">Volume</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {untracked.map((u) => (
                <tr key={u.keyword}>
                  <td>{u.keyword}</td>
                  <td className="num">
                    <Pos p={u.pos} />
                  </td>
                  <td>{path(u.url)}</td>
                  <td className="num">{n(u.volume)}</td>
                  <td>{canSpend && <TrackButton phrase={u.keyword} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {open && <Drawer keywordId={open} device={device} canSpend={canSpend} closeHref={`?${new URLSearchParams(Object.fromEntries(Object.entries(q).filter(([a]) => a !== 'k').map(([a, b]) => [a, one(b)]))).toString()}`} />}
    </>
  );
}

async function Drawer({ keywordId, device, canSpend, closeHref }: { keywordId: number; device: 'mobile' | 'desktop'; canSpend: boolean; closeHref: string }) {
  const db = createAdminClient();
  const [{ data: k }, { data: hist }] = await Promise.all([
    db.from('seo_keyword').select('*').eq('id', keywordId).maybeSingle(),
    db.from('seo_serp_result').select('date, our_pos, our_pack_pos, features, aio_present, aio_cited, error, organic_count, resolved_count').eq('keyword_id', keywordId).eq('device', device).order('date', { ascending: false }).limit(26),
  ]);
  if (!k) return null;
  const last = hist?.[0];
  const { data: items } = last ? await db.from('seo_serp_item').select('pos, type, domain, url, title, resolved_by').eq('keyword_id', keywordId).eq('device', device).eq('date', last.date).order('type').order('pos') : { data: [] };
  const organic = (items ?? []).filter((i) => i.type === 'organic');
  const pack = (items ?? []).filter((i) => i.type === 'local_pack');
  return (
    <div className="sx-drawer" role="dialog" aria-label={k.phrase}>
      <div className="sx-drawer__head">
        <div>
          <h2>{k.phrase}</h2>
          <span className="sx-fresh">
            {k.town} · {k.location_name ?? 'location not looked up yet'} · priority {k.priority}
          </span>
        </div>
        <div className="sx-row">
          {canSpend && <CheckNow keywordId={keywordId} />}
          <Link className="crm-btn crm-btn--ghost crm-btn--small" href={closeHref} style={{ color: '#fffdf8', borderColor: 'rgba(247,242,231,.4)' }}>
            Close
          </Link>
        </div>
      </div>
      <div className="sx-drawer__body">
        {!last ? (
          <p className="sx-note">Not checked yet.</p>
        ) : (
          <>
            <section className="sx-card">
              <h2>Our position, last {hist!.length} runs</h2>
              <PositionHistory points={[...hist!].reverse().map((h) => ({ date: h.date, pos: h.error ? null : h.our_pos }))} />
              <div>
                {(last.features ?? []).map((f: string) => (
                  <span key={f} className="sx-chip">
                    {f.replace(/_/g, ' ')}
                  </span>
                ))}
                {last.aio_present && <span className="sx-chip gold">{last.aio_cited ? 'AI Overview cites us' : 'AI Overview shown, not citing us'}</span>}
              </div>
              <p>
                Run of {dateLabel(last.date)}: {last.resolved_count} of {last.organic_count} results identified.
              </p>
            </section>
            {pack.length > 0 && (
              <section className="sx-card">
                <h2>Map pack</h2>
                <ol>
                  {pack.map((p) => (
                    <li key={p.pos} style={/heliaxis/i.test(p.title ?? '') ? { fontWeight: 800 } : undefined}>
                      {p.title}
                    </li>
                  ))}
                </ol>
              </section>
            )}
            <section className="sx-card">
              <h2>Top 100</h2>
              <table className="sx-table">
                <thead>
                  <tr>
                    <th className="num">#</th>
                    <th>Site</th>
                    <th>Page</th>
                  </tr>
                </thead>
                <tbody>
                  {organic.map((i) => (
                    <tr key={i.pos} className={i.domain && isOurs(i.domain) ? 'ours' : undefined}>
                      <td className="num">{i.pos}</td>
                      <td>
                        {i.domain || <span className="sx-note">unidentified</span>}
                        {i.resolved_by && i.resolved_by !== 'url' && (
                          <span className="sx-chip" title="How the address was found">
                            {i.resolved_by.replace('_', ' ')}
                          </span>
                        )}
                      </td>
                      <td>
                        {i.title}
                        <br />
                        <small className="sx-note">{path(i.url)}</small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
