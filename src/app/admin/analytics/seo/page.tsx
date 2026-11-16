import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { requirePortal } from '@/lib/auth';
import { compareAudits, SEVERITY_ORDER } from '@/lib/seo/shared';
import { readProposals, recentAudits } from '@/lib/seo/server';
import { Proposals } from './SeoControls';
import { RankingsTable, RunCentre, type RankRow } from './SeoDashboard';
import { createAdminClient } from '@/lib/supabase/admin';
import { history, movers, summarise, visibility, type SerpSnapshot } from '@/lib/seo/rankings';
import { latestCompetitorAnalysis, readAuditStatus, readRunStatus, recentRankings, serpConfigured } from '@/lib/seo/serp';
import './seo.css';

export const dynamic = 'force-dynamic';
// The "Run now" buttons keep working after they answer (site check, rankings, competitors).
export const maxDuration = 300;
export const metadata: Metadata = { title: 'SEO dashboard · Heliaxis', robots: { index: false, follow: false } };

const when = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

/** A run counts as stuck after ten minutes without news (the server stops it at five). */
function isStuck(s: { step: string; updatedAt: string } | null): boolean {
  return !!s && (s.step === 'rankings' || s.step === 'competitors') && Date.now() - Date.parse(s.updatedAt) > 10 * 60_000;
}

const OFFLINE = new Set(['crm', 'whatsapp', 'whatsapp-import', 'phone call', 'other']);
/** Where an enquiry came from, in two buckets: Meta lead forms, or the website (anything else not typed in by staff). */
const bucket = (src: string | null) => {
  const s = String(src ?? '').toLowerCase();
  if (s.startsWith('meta')) return 'meta';
  if (OFFLINE.has(s)) return 'offline';
  return 'website';
};

async function enquiryCounts(days: number) {
  const since = new Date(Date.now() - 2 * days * 86_400_000).toISOString();
  const cut = Date.now() - days * 86_400_000;
  const { data } = await createAdminClient().from('enquiries').select('source, created_at').gte('created_at', since).limit(5000);
  const c = { website: 0, meta: 0, websitePrev: 0, metaPrev: 0 };
  for (const r of data ?? []) {
    const b = bucket(r.source as string | null);
    if (b === 'offline') continue;
    const isNow = Date.parse(String(r.created_at)) >= cut;
    if (b === 'website') {
      if (isNow) c.website++;
      else c.websitePrev++;
    } else if (isNow) c.meta++;
    else c.metaPrev++;
  }
  return c;
}

/** The rankings table: the newest check, the move since `before`, and the trend over the recent checks. */
function rankRows(now: SerpSnapshot | null, before: SerpSnapshot | null, recent: SerpSnapshot[]): RankRow[] {
  if (!now) return [];
  const prev = new Map((before?.results ?? []).filter((r) => !r.error).map((r) => [r.keywordId, r.ours.pos]));
  return now.results
    .map((r) => {
      const had = prev.has(r.keywordId);
      const b = prev.get(r.keywordId) ?? null;
      return {
        keywordId: r.keywordId,
        keyword: r.keyword,
        town: r.town,
        pos: r.ours.pos,
        change: !had || r.error ? null : (b ?? 21) - (r.ours.pos ?? 21),
        pack: r.ours.pack,
        url: r.ours.url,
        leader: r.organic[0]?.domain ?? '',
        error: r.error,
        trend: history(recent, r.keywordId).map((h) => h.pos),
      };
    })
    .sort((a, b) => (a.pos ?? 99) - (b.pos ?? 99) || a.keyword.localeCompare(b.keyword));
}

function Delta({ now, before, unit = '' }: { now: number; before: number; unit?: string }) {
  if (now === before) return <small>Same as before</small>;
  return (
    <small className={now > before ? 'up' : 'down'}>
      {now > before ? 'Up' : 'Down'} from {before}
      {unit}
    </small>
  );
}

export default async function SeoReportPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const period = (await searchParams).p === 'month' ? 'month' : 'week';
  const days = period === 'month' ? 30 : 7;
  const s = await requirePortal('analytics');
  if (!s) redirect('/admin?denied=1');
  const admin = s.profile.role === 'admin';
  const [audits, proposals, snaps, comp, enq, status, auditStatus] = await Promise.all([
    recentAudits(8).catch(() => []),
    readProposals().catch(() => []),
    recentRankings(12).catch(() => [] as SerpSnapshot[]),
    latestCompetitorAnalysis().catch(() => null),
    enquiryCounts(days).catch(() => ({ website: 0, meta: 0, websitePrev: 0, metaPrev: 0 })),
    readRunStatus().catch(() => null),
    readAuditStatus().catch(() => null),
  ]);
  const stuck = isStuck(status);
  const serpOn = serpConfigured();
  // Compare like with like: the newest check with last week's, or with the one about a month before it.
  const snapNow = snaps[0] ?? null;
  const older = snaps.slice(1);
  const snapBefore =
    period === 'month' && snapNow ? (older.find((x) => Date.parse(snapNow.id) - Date.parse(x.id) >= 25 * 86_400_000) ?? older[older.length - 1] ?? null) : (older[0] ?? null);
  const sum = summarise(snapNow);
  const sumBefore = summarise(snapBefore);
  const rows = rankRows(snapNow, snapBefore, snaps);
  const moves = movers(snapBefore, snapNow).slice(0, 8);
  const league = snapNow ? visibility(snapNow).slice(0, 10) : [];
  const now = audits[0] ?? null;
  const change = now ? compareAudits(audits[1] ?? null, now) : null;
  const waiting = proposals.filter((p) => p.status === 'proposed');
  const done = proposals.filter((p) => p.status !== 'proposed').slice(0, 12);
  const problems = now
    ? [...now.pages.flatMap((p) => p.findings.map((f) => ({ where: p.path, ...f }))), ...now.site.map((f) => ({ where: f.paths?.length ? `${f.paths.slice(0, 3).join(', ')}${f.paths.length > 3 ? ` and ${f.paths.length - 3} more` : ''}` : 'Whole site', ...f }))]
        .filter((f) => f.severity !== 'low')
        .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    : [];

  return (
    <AdminShell active="analytics">
      <div className="seo-page">
        <p className="seo-back">
          <Link href="/admin/analytics">← Website analytics</Link>
        </p>
        <header className="seo-head">
          <div>
            <h1>SEO dashboard</h1>
            <p>
              Where Heliaxis appears on Google for {sum?.searches ?? 'each of our'} local searches, who beats us and why, the health of the site, and the changes waiting for you.
              It updates every Monday, or press “Run everything now”.
              {snapNow && <> Positions checked {when(snapNow.at)}.</>}
            </p>
          </div>
          <div className="seo-head__ctl">
            <nav className="seo-period" aria-label="Compare with">
              <Link href="?p=week" className={period === 'week' ? 'on' : ''} aria-current={period === 'week' ? 'page' : undefined}>
                Weekly
              </Link>
              <Link href="?p=month" className={period === 'month' ? 'on' : ''} aria-current={period === 'month' ? 'page' : undefined}>
                Monthly
              </Link>
            </nav>
          </div>
        </header>

        <RunCentre admin={admin} initial={{ audit: auditStatus, run: status, serp: serpOn }} />

        <section className="seo-cards" aria-label="Scoreboard">
          <div className="seo-card">
            <b>{enq.website}</b>
            <span>website enquiries, last {days} days</span>
            <Delta now={enq.website} before={enq.websitePrev} />
          </div>
          <div className="seo-card">
            <b>{enq.meta}</b>
            <span>Meta lead-form enquiries, last {days} days</span>
            <Delta now={enq.meta} before={enq.metaPrev} />
          </div>
          <div className="seo-card">
            <b>{sum ? `${sum.top10} of ${sum.checked}` : '–'}</b>
            <span>searches where we’re on Google’s first page</span>
            {sum && sumBefore && <Delta now={sum.top10} before={sumBefore.top10} />}
          </div>
          <div className="seo-card">
            <b>{sum ? sum.top3 : '–'}</b>
            <span>searches where we’re in the top 3</span>
            {sum && <small>{sum.inPack} in the map pack</small>}
          </div>
          <div className="seo-card">
            <b>{sum ? `${sum.visibility}%` : '–'}</b>
            <span>our share of local search visibility</span>
            {sum && sumBefore && <Delta now={sum.visibility} before={sumBefore.visibility} unit="%" />}
          </div>
          <div className="seo-card">
            <b>{now ? `${now.summary.score}%` : '–'}</b>
            <span>site health (pages with no serious problem)</span>
            {change && change.scoreBefore !== null && <Delta now={change.scoreNow} before={change.scoreBefore} unit="%" />}
          </div>
        </section>

        {status && (status.step === 'failed' || stuck || (status.step === 'done' && status.message)) && (
          <p className={`seo-status ${status.step === 'failed' || stuck ? 'bad' : ''}`} role="status">
            {stuck
              ? `The last run stopped while ${status.step === 'rankings' ? 'checking Google positions' : 'analysing competitors'} (started ${when(status.startedAt)}). Press “Run everything now” to try again.`
              : status.step === 'rankings'
                ? `Checking Google positions now (started ${new Date(status.startedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}). Refresh in a minute or two.`
                : status.step === 'competitors'
                  ? 'Positions saved. Analysing the competitors’ pages now: refresh in a minute.'
                  : status.step === 'failed'
                    ? `The last run failed: ${status.message}`
                    : status.message}
          </p>
        )}

        {!serpOn && (
          <p className="seo-empty">Google positions need DataForSEO: add DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD in Vercel, redeploy, then press “Run everything now”.</p>
        )}
        {serpOn && !snapNow && <p className="seo-empty">No Google positions yet. Press “Run everything now” (a few minutes), or wait for Monday.</p>}

        {comp && comp.actions.length > 0 && (
          <section className="seo-sec" aria-labelledby="seo-next">
            <h2 id="seo-next">Do this next</h2>
            <ol className="seo-list seo-actions">
              {comp.actions.map((a, i) => (
                <li key={i}>
                  <span className={`seo-pill eff-${a.effort}`}>{a.effort}</span>
                  <div>
                    <b>{a.title}</b>
                    <span>{a.why}</span>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        <Proposals waiting={waiting} admin={admin} />

        {rows.length > 0 && (
          <section className="seo-sec" aria-labelledby="seo-ranks">
            <h2 id="seo-ranks">Google positions</h2>
            <p className="seo-muted">On a phone, as seen from each search’s town. “Not in top 20” means we weren’t on the first two pages.</p>
            <RankingsTable rows={rows} />
          </section>
        )}

        {moves.length > 0 && (
          <section className="seo-sec" aria-labelledby="seo-moves">
            <h2 id="seo-moves">Biggest moves since {period === 'month' ? 'about a month ago' : 'last week'}</h2>
            <ul className="seo-list">
              {moves.map((m) => (
                <li key={m.keywordId}>
                  <span className={`seo-pill ${m.change > 0 ? 'mv-up' : 'mv-down'}`}>{m.change > 0 ? `up ${m.change}` : `down ${-m.change}`}</span>
                  <div>
                    <b>{m.keyword}</b>
                    <span>
                      {m.before === null ? 'Not in top 20' : `#${m.before}`} to {m.now === null ? 'not in top 20' : `#${m.now}`}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {league.length > 0 && (
          <section className="seo-sec" aria-labelledby="seo-comp">
            <h2 id="seo-comp">Who wins local search</h2>
            <p className="seo-muted">Installers only (directories such as Checkatrade are left out). Share is each site’s part of the likely clicks across every tracked search.</p>
            <div className="seo-table-wrap">
              <table className="seo-table">
                <thead>
                  <tr>
                    <th scope="col">Site</th>
                    <th scope="col">Share</th>
                    <th scope="col">Searches (top 20)</th>
                    <th scope="col">Top 3</th>
                    <th scope="col">Average place</th>
                    <th scope="col">Towns</th>
                  </tr>
                </thead>
                <tbody>
                  {league.map((l) => (
                    <tr key={l.domain} className={l.domain.endsWith('heliaxis.co.uk') ? 'is-us' : ''}>
                      <td>
                        <b>{l.domain}</b>
                      </td>
                      <td>{l.share}%</td>
                      <td>{l.searches}</td>
                      <td>{l.top3}</td>
                      <td>#{l.avgPos}</td>
                      <td className="seo-towns">{l.towns.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {comp && (
              <>
                <h3>What the leaders do better (positions of {comp.basedOn})</h3>
                {comp.note && <p className="seo-muted">{comp.note}</p>}
                <div className="seo-comps">
                  {comp.competitors.map((c) => (
                    <article key={c.domain} className="seo-comp">
                      <header>
                        <b>{c.domain}</b>
                        <small>
                          {c.share}% share · {c.searches} searches · {c.top3} in top 3 · average #{c.avgPos}
                        </small>
                      </header>
                      {c.summary && <p>{c.summary}</p>}
                      {c.better.length > 0 && (
                        <ul>
                          {c.better.map((b, i) => (
                            <li key={i}>{b}</li>
                          ))}
                        </ul>
                      )}
                      <details>
                        <summary>Their pages next to ours</summary>
                        <div className="seo-table-wrap">
                          <table className="seo-table seo-table--mini">
                            <thead>
                              <tr>
                                <th scope="col">Page</th>
                                <th scope="col">Words</th>
                                <th scope="col">Town links</th>
                                <th scope="col">Markup</th>
                              </tr>
                            </thead>
                            <tbody>
                              {[...c.pages.map((p) => ({ ...p, who: '' })), ...comp.ours.pages.map((p) => ({ ...p, who: 'Ours: ' }))].map((p) => (
                                <tr key={p.who + p.url}>
                                  <td className="seo-url">
                                    {p.who}
                                    {p.url.replace(/^https?:\/\//, '')}
                                  </td>
                                  <td>{p.ok ? p.words : '–'}</td>
                                  <td>{p.ok ? p.townLinks : '–'}</td>
                                  <td>{p.ok ? p.schema.join(', ') || 'none' : 'couldn’t read'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        <h2 className="seo-h2">Site health</h2>
        {!now ? (
          <p className="seo-empty">No check has run yet. The first one runs on Monday, or press “Check now” to run it straight away (it takes a minute or two, then refresh this page).</p>
        ) : (
          <>
            <section className="seo-cards" aria-label="This week">
              <div className="seo-card">
                <b>{now.summary.score}%</b>
                <span>of {now.summary.pages} pages have no high or medium problem</span>
                {change && change.scoreBefore !== null && (
                  <small className={change.scoreNow >= change.scoreBefore ? 'up' : 'down'}>
                    {change.scoreNow === change.scoreBefore ? 'Same as last week' : change.scoreNow > change.scoreBefore ? `Up from ${change.scoreBefore}%` : `Down from ${change.scoreBefore}%`}
                  </small>
                )}
              </div>
              <div className="seo-card">
                <b>{now.summary.high}</b>
                <span>high</span>
                <small>{now.summary.medium} medium · {now.summary.low} low</small>
              </div>
              <div className="seo-card">
                <b>{change?.fixed.length ?? 0}</b>
                <span>fixed since last week</span>
                <small>{change?.appeared.length ?? 0} new</small>
              </div>
              <div className="seo-card">
                <b>{waiting.length}</b>
                <span>suggestions waiting</span>
              </div>
            </section>

            <section className="seo-sec">
              <h2>What changed since last week</h2>
              {change && change.scoreBefore === null ? (
                <p className="seo-muted">This is the first check, so there is nothing to compare yet.</p>
              ) : (
                <div className="seo-two">
                  <div>
                    <h3>Fixed</h3>
                    {change?.fixed.length ? <ul>{change.fixed.slice(0, 25).map((x) => <li key={x}>{x}</li>)}</ul> : <p className="seo-muted">Nothing was fixed.</p>}
                  </div>
                  <div>
                    <h3>New</h3>
                    {change?.appeared.length ? <ul>{change.appeared.slice(0, 25).map((x) => <li key={x}>{x}</li>)}</ul> : <p className="seo-muted">No new problems.</p>}
                  </div>
                </div>
              )}
            </section>

            <section className="seo-sec">
              <h2>Problems found ({problems.length})</h2>
              {problems.length === 0 ? (
                <p className="seo-muted">No high or medium problems. Low ones (such as a long description) are not listed.</p>
              ) : (
                <ul className="seo-list">
                  {problems.slice(0, 80).map((f, i) => (
                    <li key={i} className={`sev-${f.severity}`}>
                      <span className="seo-pill">{f.severity}</span>
                      <div>
                        <b>{f.where}</b>
                        <span>{f.message}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {done.length > 0 && (
              <section className="seo-sec">
                <h2>Changes made from here</h2>
                <ul className="seo-list">
                  {done.map((p) => (
                    <li key={p.id}>
                      <span className="seo-pill">{p.status === 'applied' ? 'applied' : 'dismissed'}</span>
                      <div>
                        <b>{p.path}</b>
                        <span>{p.status === 'applied' ? `New title and description published${p.appliedBy ? ` by ${p.appliedBy}` : ''}, ${p.appliedAt ? when(p.appliedAt) : ''}.` : 'Dismissed.'}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {audits.length > 1 && (
              <section className="seo-sec">
                <h2>Past weeks</h2>
                <ul className="seo-list">
                  {audits.map((a) => (
                    <li key={a.id}>
                      <span className="seo-pill">{a.summary.score}%</span>
                      <div>
                        <b>{when(a.at)}</b>
                        <span>{a.summary.pages} pages · {a.summary.high} high, {a.summary.medium} medium, {a.summary.low} low</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        <p className="seo-muted">
          Searches and AI answers (where Heliaxis appears against other installers) are on{' '}
          <Link href="/admin/social/seo" className="crm-link">
            Search and AI answers
          </Link>
          . Real search clicks and rankings need Google Search Console connected; until then this report covers the site itself.
        </p>
      </div>
    </AdminShell>
  );
}
