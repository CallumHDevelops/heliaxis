import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requirePortal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { schemaReady } from '@/lib/schema-ready';
import { AdminShell } from '@/components/admin/AdminShell';
import { change, durationText, median, sharePct, topPosts, type Point } from '@/lib/social/insights/calc';
import { CATALOGUE, METRIC_LABEL } from '@/lib/social/insights/catalogue';
import { PLATFORM_LABEL } from '../labels';
import { Bars, LineChart } from './Chart';
import '../social.css';
import './insights.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Insights · Social monitoring · Heliaxis', robots: { index: false, follow: false } };

const RANGES = [7, 30, 90];
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(d);

type Snap = { date: string; platform: string; scope: string; object_id: string; metric: string; value: number; source_api: string; api_metric_name: string | null; collected_at: string };

/**
 * Operations › Social › Insights: is the audience growing, are posts reaching people, and what are people
 * saying. Every figure is a daily snapshot we saved (history is ours), or counted from our own comment
 * records. A figure a platform does not provide says so, instead of being estimated.
 */
export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ days?: string; platform?: string }> }) {
  const session = await requirePortal('social_monitoring');
  if (!session) redirect('/admin');
  const ready = await schemaReady();
  if (!ready.social) redirect('/admin/social');
  const sp = await searchParams;
  const days = RANGES.includes(Number(sp.days)) ? Number(sp.days) : 30;
  const platform = sp.platform === 'facebook' || sp.platform === 'instagram' ? sp.platform : 'all';
  const since = daysAgo(days);
  const sinceDay = day(since);
  const db = createAdminClient();

  const [snapRes, mentionRes] = await Promise.all([
    db.from('social_metric_snapshot').select('date, platform, scope, object_id, metric, value, source_api, api_metric_name, collected_at').gte('date', sinceDay).order('date'),
    db.from('social_mention').select('id, platform, severity, status, received_at, closed_at, comment_type').eq('is_synthetic', false).eq('author_is_own', false).gte('received_at', since.toISOString()).limit(5000),
  ]);
  const snaps = ((snapRes.data ?? []) as Snap[]).filter((s) => platform === 'all' || s.platform === platform);
  const mentions = (mentionRes.data ?? []).filter((m) => platform === 'all' || m.platform === platform);

  const account = (p: string, metric: string): Point[] => snaps.filter((s) => s.scope === 'account' && s.platform === p && s.metric === metric).map((s) => ({ date: s.date, value: Number(s.value) }));
  const platforms = (['facebook', 'instagram'] as const).filter((p) => platform === 'all' || platform === p);

  // Posts: the latest figure we hold for each, with its caption.
  const postIds = [...new Set(snaps.filter((s) => s.scope === 'post').map((s) => s.object_id))];
  const { data: postRows } = postIds.length ? await db.from('social_post').select('platform_post_id, platform, permalink, caption_excerpt, published_at').in('platform_post_id', postIds) : { data: [] };
  const postInfo = new Map((postRows ?? []).map((p) => [p.platform_post_id as string, p]));
  const latestPost = (id: string, metric: string) => {
    const rows = snaps.filter((s) => s.scope === 'post' && s.object_id === id && s.metric === metric);
    return rows.length ? Number(rows[rows.length - 1].value) : null;
  };
  const posts = topPosts(postIds.map((id) => ({ id, likes: latestPost(id, 'likes') ?? 0, comments: latestPost(id, 'comments') ?? 0, shares: latestPost(id, 'shares'), reach: null as number | null })), 5);

  // What people are saying: counted from our own records.
  const ids = mentions.map((m) => m.id as string);
  const { data: cls } = ids.length ? await db.from('social_classification').select('mention_id, sentiment, topics, id').in('mention_id', ids.slice(0, 1000)).eq('model_status', 'ok').order('id') : { data: [] };
  const latestCls = new Map<string, { sentiment: string | null; topics: string[] }>();
  for (const c of cls ?? []) latestCls.set(c.mention_id as string, { sentiment: c.sentiment as string | null, topics: (c.topics as string[]) ?? [] });
  const sentiment = new Map<string, number>();
  const topics = new Map<string, number>();
  for (const v of latestCls.values()) {
    if (v.sentiment) sentiment.set(v.sentiment, (sentiment.get(v.sentiment) ?? 0) + 1);
    for (const t of v.topics) topics.set(t, (topics.get(t) ?? 0) + 1);
  }
  const needsReply = mentions.filter((m) => m.severity !== 'ignore' && m.severity !== 'positive');
  const closed = needsReply.filter((m) => m.status === 'posted' || m.status === 'dismissed');
  const responseMins = closed.filter((m) => m.closed_at).map((m) => (Date.parse(m.closed_at as string) - Date.parse(m.received_at as string)) / 60000);
  const byPlatform = new Map<string, number>();
  for (const m of mentions) byPlatform.set(m.platform as string, (byPlatform.get(m.platform as string) ?? 0) + 1);
  const unavailable = CATALOGUE.filter((c) => !c.available && platforms.includes(c.platform));

  const href = (d: number, p: string) => `/admin/social/insights?days=${d}${p !== 'all' ? `&platform=${p}` : ''}`;
  const nothingYet = snaps.length === 0;

  return (
    <AdminShell active="social">
      <div className="sm-page in">
        <p className="sm-back">
          <Link href="/admin/social">← Inbox</Link>
        </p>
        <header className="in-head">
          <div>
            <h1>Insights</h1>
            <p className="sm-sub">Is the audience growing, are posts reaching people, and what are people saying. Figures are daily snapshots we keep ourselves. Anything a platform does not provide is marked, not estimated.</p>
          </div>
          <div className="in-filters">
            <nav aria-label="Range">
              {RANGES.map((d) => (
                <Link key={d} href={href(d, platform)} className={days === d ? 'sm-tab on' : 'sm-tab'}>
                  {d} days
                </Link>
              ))}
            </nav>
            <nav aria-label="Platform">
              {(['all', 'facebook', 'instagram'] as const).map((p) => (
                <Link key={p} href={href(days, p)} className={platform === p ? 'sm-tab on' : 'sm-tab'}>
                  {p === 'all' ? 'All' : PLATFORM_LABEL[p]}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        {nothingYet && (
          <p className="sm-empty">
            No audience figures saved yet. They are collected once a day after 02:15 once the every-minute job is switched on and the Meta connection is set up, so the first figures appear tomorrow morning. Comment figures below are already live.
          </p>
        )}

        <section className="in-tiles">
          {platforms.map((p) => {
            const f = account(p, 'followers');
            const c = change(f);
            const now = f.length ? f[f.length - 1] : null;
            return (
              <div className="in-tile" key={p} title={`Source: ${p === 'facebook' ? 'graph.facebook.com followers_count' : 'graph.instagram.com followers_count'}${now ? `, saved ${now.date}` : ''}`}>
                <span>{PLATFORM_LABEL[p]} followers</span>
                <b>{now ? now.value.toLocaleString('en-GB') : 'not yet'}</b>
                <small>{c ? `${c.delta >= 0 ? '+' : ''}${c.delta.toLocaleString('en-GB')}${c.pct != null ? ` (${c.pct.toFixed(1)}%)` : ''} in ${days} days` : 'change shows after two days of figures'}</small>
              </div>
            );
          })}
          <div className="in-tile">
            <span>Comments and reviews</span>
            <b>{mentions.length.toLocaleString('en-GB')}</b>
            <small>received in {days} days</small>
          </div>
          <div className="in-tile">
            <span>Handled</span>
            <b>{sharePct(closed.length, needsReply.length) ?? 'n/a'}{sharePct(closed.length, needsReply.length) != null ? '%' : ''}</b>
            <small>of those needing a reply</small>
          </div>
          <div className="in-tile">
            <span>Typical time to deal with one</span>
            <b>{durationText(median(responseMins))}</b>
            <small>median, comment to done</small>
          </div>
        </section>

        {platforms.map((p) => (
          <section className="sm-card" key={p}>
            <h2>{PLATFORM_LABEL[p]}: audience and reach</h2>
            <LineChart points={account(p, 'followers')} label={`${PLATFORM_LABEL[p]} followers`} />
            {p === 'facebook' && (
              <dl className="sm-facts in-facts">
                {(['views', 'reach_unique', 'post_engagements'] as const).map((m) => {
                  const pts = account(p, m);
                  const total = pts.reduce((s, x) => s + x.value, 0);
                  const meta = snaps.find((s) => s.platform === p && s.scope === 'account' && s.metric === m);
                  return (
                    <div key={m} title={meta ? `Source: ${meta.source_api} ${meta.api_metric_name}, last saved ${meta.collected_at.slice(0, 16).replace('T', ' ')}` : undefined}>
                      <dt>{METRIC_LABEL[m]}</dt>
                      <dd>{pts.length ? total.toLocaleString('en-GB') : 'not yet'}</dd>
                      <small>{pts.length ? `${pts.length} days saved` : 'collecting'}</small>
                    </div>
                  );
                })}
              </dl>
            )}
          </section>
        ))}

        <div className="sm-grid">
          <section className="sm-card">
            <h2>Best posts</h2>
            {posts.length === 0 ? (
              <p className="in-empty">Post figures appear after the first daily collection.</p>
            ) : (
              <ol className="in-posts">
                {posts.map((p) => {
                  const info = postInfo.get(p.id);
                  return (
                    <li key={p.id}>
                      <div>
                        {info?.permalink ? (
                          <a href={info.permalink} target="_blank" rel="noopener noreferrer">
                            {info.caption_excerpt || '(no caption)'}
                          </a>
                        ) : (
                          <span>{info?.caption_excerpt || '(no caption)'}</span>
                        )}
                        <small>
                          {PLATFORM_LABEL[info?.platform as string] ?? ''} · {p.likes} likes · {p.comments} comments{p.shares != null ? ` · ${p.shares} shares` : ''}
                        </small>
                      </div>
                      <b>{p.total}</b>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
          <section className="sm-card">
            <h2>Where comments come from</h2>
            <Bars rows={[...byPlatform.entries()].map(([k, v]) => ({ label: PLATFORM_LABEL[k] ?? k, value: v }))} />
          </section>
        </div>

        <div className="sm-grid">
          <section className="sm-card">
            <h2>What people feel</h2>
            <Bars rows={['positive', 'neutral', 'mixed', 'negative'].filter((k) => sentiment.has(k)).map((k) => ({ label: k[0].toUpperCase() + k.slice(1), value: sentiment.get(k) ?? 0 }))} />
          </section>
          <section className="sm-card">
            <h2>What they talk about</h2>
            <Bars rows={[...topics.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => ({ label: k.replace('_', ' '), value: v }))} />
          </section>
        </div>

        {unavailable.length > 0 && (
          <section className="sm-card">
            <h2>Not available</h2>
            <ul className="in-na">
              {unavailable.map((u) => (
                <li key={`${u.platform}-${u.metric}`}>
                  <b>
                    {PLATFORM_LABEL[u.platform]}: {METRIC_LABEL[u.metric]}
                  </b>
                  <span>{u.reason}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </AdminShell>
  );
}
