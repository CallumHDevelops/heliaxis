import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requirePortal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { schemaReady } from '@/lib/schema-ready';
import { AdminShell } from '@/components/admin/AdminShell';
import { competitorTablesReady, ensureSeed, getLegalSignOff, type Competitor } from '@/lib/social/competitors/data';
import { ageDays, growth, latestCell, METRICS, shareOf, sortBy, type Cell, type SnapshotRow } from '@/lib/social/competitors/league';
import '../social.css';
import './competitors.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Competitors · Social monitoring · Heliaxis', robots: { index: false, follow: false } };

const fmt = (v: number, unit: string) => `${v.toLocaleString('en-GB', { maximumFractionDigits: 1 })}${unit}`;

/**
 * Operations › Social › Competitors: how Heliaxis compares with the other installers it competes with locally.
 * Public information only. Every figure shows the day it was recorded and how it was found, or says it is
 * unavailable: nothing is estimated.
 */
export default async function CompetitorsPage({ searchParams }: { searchParams: Promise<{ sort?: string; tab?: string }> }) {
  const session = await requirePortal('social_monitoring');
  if (!session) redirect('/admin');
  const ready = await schemaReady();
  if (!ready.social) redirect('/admin/social');
  const isAdmin = session.profile.role === 'admin';
  const sp = await searchParams;

  if (!(await competitorTablesReady())) {
    return (
      <AdminShell active="social">
        <div className="sm-page">
          <p className="sm-back"><Link href="/admin/social">← Inbox</Link></p>
          <h1>Competitors</h1>
          <p className="sm-empty">The competitor tables are not in the database yet. Run <code>social-insights.sql</code> from the dashboard to-dos (it is safe to run twice), then come back.</p>
        </div>
      </AdminShell>
    );
  }
  await ensureSeed(session.user.id);
  const db = createAdminClient();
  const [{ data: comps }, { data: snaps }, legal] = await Promise.all([
    db.from('social_competitor').select('*').eq('tracked', true).order('is_self', { ascending: false }).order('name'),
    db.from('social_competitor_snapshot').select('competitor_id, date, metric, value, method, source, unavailable_reason'),
    getLegalSignOff(),
  ]);
  const competitors = (comps ?? []) as Competitor[];
  const rows = (snaps ?? []) as SnapshotRow[];

  // Heliaxis's own social numbers come from our own daily snapshots, so we never have to type them.
  const self = competitors.find((c) => c.is_self);
  const own: SnapshotRow[] = [];
  if (self) {
    const { data: mine } = await db.from('social_metric_snapshot').select('date, platform, metric, value, source_api').eq('scope', 'account').eq('metric', 'followers').order('date', { ascending: false }).limit(200);
    for (const m of mine ?? []) own.push({ competitor_id: self.id, date: m.date as string, metric: m.platform === 'instagram' ? 'ig_followers' : 'fb_followers', value: Number(m.value), method: 'api', source: m.source_api as string });
  }
  const all = [...rows, ...own];
  const sortKey = METRICS.some((m) => m.key === sp.sort) ? (sp.sort as string) : 'ig_followers';

  const table = sortBy(
    competitors.map((c) => ({ c, cells: Object.fromEntries(METRICS.map((m) => [m.key, latestCell(all, c.id, m.key)])) as Record<string, Cell> })),
    sortKey
  );
  const share = shareOf(table.map((t) => ({ id: t.c.id, value: t.cells.google_reviews.value })));
  const tab = sp.tab === 'ig' || sp.tab === 'reviews' ? sp.tab : 'league';

  return (
    <AdminShell active="social">
      <div className="sm-page cp">
        <p className="sm-back"><Link href="/admin/social">← Inbox</Link></p>
        <header className="cp-head">
          <div>
            <h1>Competitors</h1>
            <p className="sm-sub">How Heliaxis compares with other local installers. Public information only. Each figure shows the day it was recorded and how it was found, and anything we cannot find reliably says so instead of being guessed.</p>
          </div>
          <span className="sm-headlinks">
            <Link href="/admin/social/seo" className="sm-btn">Search and AI answers</Link>
            {isAdmin && <Link href="/admin/social/competitors/manage" className="sm-btn">Manage competitors</Link>}
            <Link href="/admin/social/competitors/legal" className="sm-btn">Legal check</Link>
          </span>
        </header>

        {!legal && (
          <p className="sm-empty">
            <b>Automated collection is switched off.</b> Until an admin has read and signed off the legal check, nothing is collected automatically from other businesses: you can still enter figures by hand, and Heliaxis’s own figures arrive as normal. <Link href="/admin/social/competitors/legal">Read the legal check</Link>
          </p>
        )}

        <nav className="sm-tabs" aria-label="View">
          <Link href="/admin/social/competitors" className={tab === 'league' ? 'sm-tab on' : 'sm-tab'}>League table</Link>
          <Link href="/admin/social/competitors?tab=reviews" className={tab === 'reviews' ? 'sm-tab on' : 'sm-tab'}>Share of reviews</Link>
        </nav>

        {tab === 'reviews' ? (
          <section className="sm-card">
            <h2>Share of Google reviews</h2>
            <p className="sm-sub">Each business’s share of all the Google reviews we have a figure for. Based on {share.covered} of {share.total} businesses with data. This is a share of reviews on the page, not of new reviews in a period, until monthly figures build up.</p>
            <ul className="cp-share">
              {table.map(({ c }) => (
                <li key={c.id} className={c.is_self ? 'is-self' : ''}>
                  <span>{c.name}</span>
                  <i style={{ width: `${share.shares[c.id] ?? 0}%` }} />
                  <b>{share.shares[c.id] != null ? `${share.shares[c.id]}%` : 'Unavailable'}</b>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <section className="sm-card cp-scroll">
            <table className="cp-table">
              <thead>
                <tr>
                  <th>Business</th>
                  {METRICS.map((m) => (
                    <th key={m.key}>
                      <Link href={`/admin/social/competitors?sort=${m.key}`} className={sortKey === m.key ? 'is-sorted' : ''}>{m.label}</Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.map(({ c, cells }) => (
                  <tr key={c.id} className={c.is_self ? 'is-self' : ''}>
                    <th scope="row">
                      {isAdmin && !c.is_self ? <Link href={`/admin/social/competitors/${c.id}`}>{c.name}</Link> : c.name}
                      <small>{c.base_location ?? ''}</small>
                    </th>
                    {METRICS.map((m) => {
                      const cell = cells[m.key];
                      const g = m.key === 'ig_followers' || m.key === 'fb_followers' ? growth(all, c.id, m.key, 30) : null;
                      const age = ageDays(cell.date);
                      return (
                        <td key={m.key} title={cell.date ? `${cell.method === 'manual' ? 'Entered by hand' : 'From the platform’s API'} · ${cell.source} · ${cell.date}` : (cell.reason ?? '')}>
                          {cell.value != null ? (
                            <>
                              <b>{fmt(cell.value, m.unit)}</b>
                              <small className={age != null && age > 45 ? 'is-stale' : ''}>{cell.date}{age != null && age > 45 ? ' (out of date)' : ''}</small>
                              {g && <small>{g.delta >= 0 ? '+' : ''}{g.delta.toLocaleString('en-GB')} in 30 days</small>}
                            </>
                          ) : (
                            <span className="cp-na">Unavailable<small>{cell.reason}</small></span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        <p className="sm-sub">Heliaxis’s own Instagram and Facebook followers come from our daily snapshots (they appear after the first collection). Everything else is entered by hand for now.{isAdmin ? ' Click a competitor’s name to enter figures.' : ''}</p>
      </div>
    </AdminShell>
  );
}
