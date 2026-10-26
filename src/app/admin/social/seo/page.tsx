import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requirePortal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { schemaReady } from '@/lib/schema-ready';
import { AdminShell } from '@/components/admin/AdminShell';
import { competitorTablesReady, ensureSeed, type Competitor } from '@/lib/social/competitors/data';
import { visibilityShares, type RankRow } from '@/lib/social/competitors/visibility';
import { recordRanks } from './actions';
import '../social.css';
import '../competitors/competitors.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Search and AI answers · Heliaxis', robots: { index: false, follow: false } };

/** The ten searches checked by hand each month (docs/social-monitoring/09 §6). */
const KEY_SEARCHES = ['solar panel installers Cardiff', 'solar panel installers Swansea', 'solar panel installers Newport', 'solar panel installers Bridgend', 'battery storage Cardiff', 'battery storage Swansea', 'heat pump installer Cardiff', 'heat pump installer Newport', 'EV charger installer Cardiff', 'MCS solar installer Newport'];

const daysAgoIso = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

export default async function SeoPage({ searchParams }: { searchParams: Promise<{ kw?: string }> }) {
  const s = await requirePortal('social_monitoring');
  if (!s) redirect('/admin');
  const ready = await schemaReady();
  if (!ready.social) redirect('/admin/social');
  const isAdmin = s.profile.role === 'admin';
  if (!(await competitorTablesReady())) {
    return (
      <AdminShell active="social">
        <div className="sm-page">
          <p className="sm-back"><Link href="/admin/social/competitors">← Competitors</Link></p>
          <h1>Search and AI answers</h1>
          <p className="sm-empty">Run <code>social-insights.sql</code> from the dashboard to-dos first (safe to run twice).</p>
        </div>
      </AdminShell>
    );
  }
  await ensureSeed(s.user.id);
  const db = createAdminClient();
  const sp = await searchParams;
  const since = daysAgoIso(100);
  const [{ data: kws }, { data: comps }, { data: ranks }] = await Promise.all([
    db.from('social_seo_keyword').select('id, keyword, town').eq('active', true).order('keyword'),
    db.from('social_competitor').select('*').eq('tracked', true).order('is_self', { ascending: false }).order('name'),
    db.from('social_seo_rank').select('date, keyword_id, competitor_id, organic_rank, local_pack_rank').gte('date', since).order('date', { ascending: false }),
  ]);
  const competitors = (comps ?? []) as Competitor[];
  const keywords = kws ?? [];
  const keyIds = keywords.filter((k) => KEY_SEARCHES.includes(k.keyword)).map((k) => k.id as number);
  const picked = keywords.find((k) => String(k.id) === sp.kw) ?? keywords.find((k) => keyIds.includes(k.id as number)) ?? keywords[0];

  // Newest check per search and business.
  const latest = new Map<string, RankRow & { date: string }>();
  for (const r of ranks ?? []) {
    const key = `${r.keyword_id}:${r.competitor_id}`;
    if (!latest.has(key)) latest.set(key, r as RankRow & { date: string });
  }
  const checked = [...latest.values()];
  const vis = visibilityShares(checked);
  const today = new Date().toISOString().slice(0, 10);
  const self = competitors.find((c) => c.is_self);
  const nameOf = new Map(competitors.map((c) => [c.id, c.name]));
  const rankFor = (kwId: number, compId: string) => latest.get(`${kwId}:${compId}`);

  return (
    <AdminShell active="social">
      <div className="sm-page cp">
        <p className="sm-back"><Link href="/admin/social/competitors">← Competitors</Link></p>
        <h1>Search and AI answers</h1>
        <p className="sm-sub">Where Heliaxis and the other installers appear on Google for the searches that matter. Checked by hand once a month, because paid rank trackers are not used. Heliaxis’s own real positions will come from Google Search Console once it is connected.</p>

        <section className="sm-card">
          <h2>Share of local search visibility</h2>
          {vis.searches === 0 ? (
            <p className="sm-sub">No checks recorded yet. Do the monthly check below to start.</p>
          ) : (
            <>
              <p className="sm-sub">From {vis.searches} searches checked by hand. A business scores 10 points for first place down to 1 for tenth, in the main results and in the map results separately. The share is its points out of all the points. Method: manual, from the newest check of each search.</p>
              <ul className="cp-share">
                {competitors
                  .filter((c) => vis.shares[c.id] != null)
                  .sort((a, b) => (vis.shares[b.id] ?? 0) - (vis.shares[a.id] ?? 0))
                  .map((c) => (
                    <li key={c.id} className={c.is_self ? 'is-self' : ''}>
                      <span>{c.name}</span>
                      <i style={{ width: `${vis.shares[c.id] ?? 0}%` }} />
                      <b>{vis.shares[c.id]}%</b>
                    </li>
                  ))}
              </ul>
            </>
          )}
        </section>

        <section className="sm-card">
          <h2>Heliaxis’s positions</h2>
          <ul className="cp-list">
            {keywords.filter((k) => keyIds.includes(k.id as number)).map((k) => {
              const r = self ? rankFor(k.id as number, self.id) : undefined;
              return (
                <li key={k.id}>
                  <div>
                    <b>{k.keyword}</b>
                    <small>{r ? `Checked ${r.date}` : 'Not checked yet'}</small>
                  </div>
                  <span>{r ? `Main results: ${r.organic_rank ?? 'not in top 10'} · Map results: ${r.local_pack_rank ?? 'not shown'}` : 'Unavailable'}</span>
                </li>
              );
            })}
          </ul>
        </section>

        {isAdmin && picked && (
          <section className="sm-card">
            <h2>Monthly check</h2>
            <p className="sm-sub">In a private browser window, search Google with your location set to the town, then type where each business appeared (leave blank if it was not in the top ten). Pick the search:</p>
            <nav className="sm-tabs" aria-label="Search to check">
              {keywords.filter((k) => keyIds.includes(k.id as number)).map((k) => (
                <Link key={k.id} href={`/admin/social/seo?kw=${k.id}`} className={picked.id === k.id ? 'sm-tab on' : 'sm-tab'}>{k.keyword}</Link>
              ))}
            </nav>
            <form action={recordRanks} className="cp-form">
              <input type="hidden" name="keyword_id" value={picked.id as number} />
              <label>Date checked<input className="sm-input" type="date" name="date" defaultValue={today} /></label>
              <label>Device<select className="sm-input" name="device"><option value="mobile">Phone</option><option value="desktop">Computer</option></select></label>
              {competitors.map((c) => (
                <fieldset key={c.id} style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend style={{ fontWeight: 700, fontSize: '0.85rem' }}>{c.name}</legend>
                  <div className="sm-inline">
                    <input className="sm-input" style={{ minWidth: 0, width: '7rem' }} name={`o:${c.id}`} inputMode="numeric" placeholder="main #" aria-label={`${c.name} main results position`} />
                    <input className="sm-input" style={{ minWidth: 0, width: '7rem' }} name={`l:${c.id}`} inputMode="numeric" placeholder="map #" aria-label={`${c.name} map results position`} />
                  </div>
                </fieldset>
              ))}
              <button className="sm-btn is-primary">Save this check</button>
            </form>
            <p className="sm-sub">Search: <b>{picked.keyword}</b>. {[...nameOf.values()].length} businesses listed.</p>
          </section>
        )}
      </div>
    </AdminShell>
  );
}
