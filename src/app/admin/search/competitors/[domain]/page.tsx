import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { cleanDomain, isInstaller, isOurs } from '@/lib/seo/rankings';
import { latestRunDate } from '@/lib/search/teardown/server';
import { dateLabel, n, PageHead, Pos } from '../../common';
import '../competitors.css';

export const dynamic = 'force-dynamic';

type Item = { keyword_id: number; pos: number; url: string | null; title: string | null };
type Kw = { id: number; phrase: string; town: string | null; priority: number };
type Facts = { url: string; fetched_at: string; page_type: string | null; words: number | null; h1: string | null; schema: string[] | null; mentions_mcs: boolean | null; prices_shown: boolean | null; reviews_on_page: boolean | null; town_links: number | null; lighthouse_perf: number | null; error: string | null };
type Biz = { id: number; name: string; cid: string | null; place_id: string | null; primary_category: string | null; categories: string[] | null; website: string | null; address: string | null; phone: string | null; competitor_id: string | null };
type Snap = { business_id: number; date: string; rating: number | null; reviews: number | null; reviews_90d: number | null; photos: number | null; responded_pct: number | null };

const path = (u: string | null) => {
  if (!u) return '';
  try {
    return new URL(u).pathname || '/';
  } catch {
    return u;
  }
};
const yes = (v: boolean | null | undefined) => (v === null || v === undefined ? '–' : v ? 'yes' : 'no');

export default async function Rival({ params }: { params: Promise<{ domain: string }> }) {
  const { domain: raw } = await params;
  const domain = cleanDomain(decodeURIComponent(raw));
  const db = createAdminClient();
  const date = await latestRunDate(db);

  const [itemsRes, kwRes, bizRes, compRes] = await Promise.all([
    date ? db.from('seo_serp_item').select('keyword_id, pos, url, title').eq('date', date).eq('device', 'mobile').eq('type', 'organic').eq('domain', domain).order('pos').limit(2000) : Promise.resolve({ data: [] }),
    db.from('seo_keyword').select('id, phrase, town, priority').eq('active', true),
    db.from('seo_business').select('id, name, cid, place_id, primary_category, categories, website, address, phone, competitor_id').eq('domain', domain),
    db.from('social_competitor').select('id, name, website, google_place_id'),
  ]);
  const kw = new Map(((kwRes.data ?? []) as Kw[]).map((k) => [k.id, k]));
  // A site's best result per search.
  const best = new Map<number, Item>();
  for (const it of (itemsRes.data ?? []) as Item[]) if (kw.has(it.keyword_id) && !best.has(it.keyword_id)) best.set(it.keyword_id, it);
  const rows = [...best.values()].sort((a, b) => a.pos - b.pos);
  const wins = rows.filter((r) => r.pos <= 10);
  const towns = [...new Set(wins.map((r) => kw.get(r.keyword_id)?.town).filter((t): t is string => !!t))].sort();

  // Its best pages: the URLs that rank most often, with what we read on them.
  const pages = new Map<string, { searches: number; best: number }>();
  for (const r of (itemsRes.data ?? []) as Item[]) {
    if (!r.url) continue;
    const e = pages.get(r.url) ?? { searches: 0, best: 999 };
    e.searches++;
    e.best = Math.min(e.best, r.pos);
    pages.set(r.url, e);
  }
  const topPages = [...pages.entries()].map(([url, e]) => ({ url, ...e })).sort((a, b) => a.best - b.best || b.searches - a.searches).slice(0, 12);
  const { data: factsData } = topPages.length ? await db.from('seo_page_facts').select('url, fetched_at, page_type, words, h1, schema, mentions_mcs, prices_shown, reviews_on_page, town_links, lighthouse_perf, error').in('url', topPages.map((p) => p.url)) : { data: [] };
  const facts = new Map(((factsData ?? []) as Facts[]).map((f) => [f.url, f]));

  // Its Business Profile (by domain), and its review pace from the weekly snapshots.
  const biz = (bizRes.data ?? []) as Biz[];
  const { data: snapData } = biz.length ? await db.from('seo_business_snapshot').select('business_id, date, rating, reviews, reviews_90d, photos, responded_pct').in('business_id', biz.map((b) => b.id)).order('date', { ascending: false }).limit(200) : { data: [] };
  const snaps = (snapData ?? []) as Snap[];
  const comps = (compRes.data ?? []) as { id: string; name: string; website: string | null; google_place_id: string | null }[];
  const comp = comps.find((c) => biz.some((b) => b.competitor_id === c.id)) ?? comps.find((c) => {
    try {
      return !!c.website && cleanDomain(new URL(c.website).hostname) === domain;
    } catch {
      return false;
    }
  });

  return (
    <>
      <PageHead
        title={domain}
        sub={
          <>
            {isOurs(domain) ? 'Our own site, as the teardowns see it.' : isInstaller(domain) ? 'A rival installer: where it wins, its best pages, its Business Profile and how fast it gathers reviews.' : 'Not counted as a rival (a directory, advice site or network).'}{' '}
            {comp ? <>Tracked in Social as {comp.name}.</> : null}
          </>
        }
        fresh={date ? <>Run of <b>{dateLabel(date, true)}</b> (phone)</> : 'No run yet'}
      />
      <p>
        <Link className="crm-link" href="/admin/search/competitors">
          Back to Competitors
        </Link>
      </p>

      <section className="sx-tiles" aria-label="At a glance">
        <article className="sx-tile" title="seo_serp_item, latest phone run">
          <span className="sx-tile__label">Searches in the top 10</span>
          <span className="sx-tile__value">{wins.length}</span>
          <span className="sx-tile__note">of {kw.size} tracked; in the top 100 for {rows.length}</span>
        </article>
        <article className="sx-tile" title="seo_serp_item, latest phone run">
          <span className="sx-tile__label">In the top 3</span>
          <span className="sx-tile__value">{rows.filter((r) => r.pos <= 3).length}</span>
          <span className="sx-tile__note">searches</span>
        </article>
        <article className="sx-tile" title="Towns of the searches where it is in the top 10">
          <span className="sx-tile__label">Towns won</span>
          <span className="sx-tile__value">{towns.length}</span>
          <span className="sx-tile__note">{towns.slice(0, 6).join(', ') || 'none'}</span>
        </article>
        <article className="sx-tile" title="seo_business_snapshot, latest">
          <span className="sx-tile__label">Google reviews</span>
          <span className="sx-tile__value">{snaps[0]?.reviews ?? '–'}</span>
          <span className="sx-tile__note">{snaps[0] ? `${snaps[0].rating ?? '–'} stars · ${snaps[0].reviews_90d ?? '–'} in 90 days · ${dateLabel(snaps[0].date)}` : 'Profile not looked up'}</span>
        </article>
      </section>

      <section className="sx-card">
        <h2>Searches it ranks for ({rows.length})</h2>
        {!rows.length ? (
          <p className="sx-note">{date ? 'Not in the top 100 of any tracked search in the latest run.' : 'No rankings run yet: the weekly run posts on Sunday at 23:00.'}</p>
        ) : (
          <div className="sx-tablewrap">
            <table className="sx-table">
              <thead>
                <tr>
                  <th>Search</th>
                  <th>Town</th>
                  <th className="num">Position</th>
                  <th>Page</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const k = kw.get(r.keyword_id)!;
                  return (
                    <tr key={r.keyword_id}>
                      <td>
                        {k.priority === 1 ? <Link href={`/admin/search/competitors#k${k.id}`}>{k.phrase}</Link> : k.phrase}
                        {k.priority === 1 && <span className="sx-chip gold">P1</span>}
                      </td>
                      <td>{k.town}</td>
                      <td className="num">
                        <Pos p={r.pos} />
                      </td>
                      <td title={r.url ?? ''}>{path(r.url)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="sx-card">
        <h2>Its best pages</h2>
        {!topPages.length ? (
          <p className="sx-note">No ranking pages in the latest run.</p>
        ) : (
          <div className="sx-tablewrap">
            <table className="sx-table">
              <thead>
                <tr>
                  <th>Page</th>
                  <th className="num">Searches</th>
                  <th className="num">Best</th>
                  <th>Type</th>
                  <th className="num">Words</th>
                  <th>MCS in a heading</th>
                  <th>Prices</th>
                  <th>Reviews</th>
                  <th className="num">Town links</th>
                  <th>Markup</th>
                </tr>
              </thead>
              <tbody>
                {topPages.map((p) => {
                  const f = facts.get(p.url);
                  const ok = f && !f.error;
                  return (
                    <tr key={p.url}>
                      <td title={p.url}>
                        {path(p.url)}
                        {f?.h1 && (
                          <>
                            <br />
                            <small className="sx-note">{f.h1}</small>
                          </>
                        )}
                      </td>
                      <td className="num">{p.searches}</td>
                      <td className="num">{p.best}</td>
                      <td>{f ? (f.error ? <span className="sx-note" title={f.error}>not read</span> : f.page_type) : <span className="sx-note">not read yet</span>}</td>
                      <td className="num">{ok ? n(f.words) : ''}</td>
                      <td>{ok ? yes(f.mentions_mcs) : ''}</td>
                      <td>{ok ? yes(f.prices_shown) : ''}</td>
                      <td>{ok ? yes(f.reviews_on_page) : ''}</td>
                      <td className="num">{ok ? n(f.town_links) : ''}</td>
                      <td>{ok ? (f.schema ?? []).slice(0, 4).join(', ') : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="sx-note">Page facts from DataForSEO On-Page (seo_page_facts), refreshed every 30 days; pages whose robots.txt asks crawlers to stay out are not read.</p>
      </section>

      <section className="sx-card">
        <h2>Business Profile</h2>
        {!biz.length ? (
          <p className="sx-note">No Business Profile linked to {domain} yet. Profiles are looked up for every business in a map pack on Monday at 07:30.</p>
        ) : (
          biz.map((b) => {
            const mine = snaps.filter((s) => s.business_id === b.id);
            const pace = [...mine].reverse();
            const maxR = Math.max(1, ...pace.map((s) => s.reviews_90d ?? 0));
            return (
              <div key={b.id} className="tdn-biz">
                <h3>{b.name}</h3>
                <p>
                  {b.primary_category ?? 'No category'}
                  {(b.categories ?? []).length > 1 ? ` (also ${(b.categories ?? []).filter((c) => c !== b.primary_category).join(', ')})` : ''}
                  <br />
                  <span className="sx-note">
                    {b.address ?? 'No address'} · {b.phone ?? 'no phone'} · {b.website ? 'website linked' : 'no website linked'}
                  </span>
                </p>
                {!mine.length ? (
                  <p className="sx-note">No snapshot yet.</p>
                ) : (
                  <>
                    <h4>Review pace</h4>
                    <div className="tdn-pace" aria-label="Reviews in the last 90 days, by week">
                      {pace.map((s) => (
                        <span key={s.date} title={`${dateLabel(s.date)}: ${s.reviews_90d ?? 'not counted'} reviews in 90 days`} style={{ height: `${Math.max(4, ((s.reviews_90d ?? 0) / maxR) * 100)}%` }} />
                      ))}
                    </div>
                    <div className="sx-tablewrap">
                      <table className="sx-table">
                        <thead>
                          <tr>
                            <th>Week of</th>
                            <th className="num">Rating</th>
                            <th className="num">Reviews</th>
                            <th className="num">Change</th>
                            <th className="num">Last 90 days</th>
                            <th className="num">Answered</th>
                            <th className="num">Photos</th>
                          </tr>
                        </thead>
                        <tbody>
                          {mine.map((s, i) => {
                            const prev = mine[i + 1];
                            const change = prev && s.reviews !== null && prev.reviews !== null ? s.reviews - prev.reviews : null;
                            return (
                              <tr key={s.date}>
                                <td>{dateLabel(s.date)}</td>
                                <td className="num">{s.rating ?? '–'}</td>
                                <td className="num">{n(s.reviews)}</td>
                                <td className="num">{change === null ? '' : change > 0 ? `+${change}` : change}</td>
                                <td className="num">{s.reviews_90d === null ? '–' : s.reviews_90d >= 50 ? '50 or more' : s.reviews_90d}</td>
                                <td className="num">{s.responded_pct === null ? '–' : `${n(Number(s.responded_pct), 1)}%`}</td>
                                <td className="num">{n(s.photos)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
        <p className="sx-note">From DataForSEO Business Data (seo_business, seo_business_snapshot): the profile weekly, and the newest 50 reviews to count the last 90 days.</p>
      </section>
    </>
  );
}
