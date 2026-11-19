import Link from 'next/link';
import type { ReactNode } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
import { dfsConfigured } from '@/lib/dataforseo/client';
import { readProposals, recentAudits } from '@/lib/seo/server';
import { readAuditStatus } from '@/lib/seo/serp';
import { SEVERITY_ORDER } from '@/lib/seo/shared';
import { gscConfigured } from '@/lib/search/gsc';
import { searchSession } from '@/lib/search/server';
import { can } from '@/lib/search/settings';
import { latestHealth } from '@/lib/search/health/server';
import { HEALTH_LABEL, type HealthCheck, type HealthRow } from '@/lib/search/health/checks';
import { dateLabel, n, PageHead } from '../common';
import { ProposalCard, RunChecks } from './HealthClient';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);

function Tile({ label, value, note, href }: { label: string; value: ReactNode; note: ReactNode; href?: string }) {
  return (
    <div className="sx-tile">
      <span className="sx-tile__label">{href ? <a href={href}>{label}</a> : label}</span>
      <span className="sx-tile__value">{value}</span>
      <span className="sx-tile__note">{note}</span>
    </div>
  );
}

const Waiting = ({ children }: { children: ReactNode }) => <p className="sx-note">{children}</p>;

export default async function Health() {
  const db = createAdminClient();
  const [s, { latest }, audits, proposals, status] = await Promise.all([searchSession(), latestHealth(db), recentAudits(2, db).catch(() => []), readProposals(db).catch(() => []), readAuditStatus(db).catch(() => null)]);
  const canSpend = !!s && can.spend(s.role);
  const audit = audits[0] ?? null;
  const waiting = proposals.filter((p) => p.status === 'proposed');
  const gsc = gscConfigured();
  const dfs = dfsConfigured();

  const rowsOf = (k: HealthCheck) => latest[k]?.rows ?? [];
  const pagesOf = (k: HealthCheck) => rowsOf(k).filter((r) => r.url !== '');
  const bad = (k: HealthCheck) => pagesOf(k).filter((r) => !r.ok);
  const on = (k: HealthCheck) => (latest[k] ? `Checked ${dateLabel(latest[k]!.date)}` : 'Not checked yet');

  const index = pagesOf('index');
  const sitemapSummary = rowsOf('sitemap').find((r) => r.url === '');
  const gscSitemap = (sitemapSummary?.detail.gsc ?? null) as { message?: string; errors?: number; warnings?: number; lastDownloaded?: string | null } | null;
  const lighthouse = pagesOf('lighthouse');
  const perf = lighthouse.map((r) => r.detail.performance).filter((v): v is number => typeof v === 'number').sort((a, b) => a - b);
  const median = perf.length ? perf[Math.floor(perf.length / 2)] : null;
  const llms = rowsOf('llms')[0];

  return (
    <>
      <PageHead
        title="Site health"
        sub="The weekly site audit, and the checks that decide whether a page can rank at all: in Google’s index, in the sitemap, linked from other pages, with a sound canonical and valid structured data, quick on a phone, and open to search and AI crawlers."
        fresh={audit ? `Audit ${dateLabel(audit.id)}` : 'No audit yet'}
      />

      <section className="sx-card">
        <div className="sx-tiles">
          <Tile label="Audit score" value={audit ? `${audit.summary.score}/100` : '–'} note={audit ? `Weekly audit of ${audit.summary.pages} pages from the sitemap, ${dateLabel(audit.id)}` : 'Runs Monday 05:00'} href="#audit" />
          <Tile label={HEALTH_LABEL.index} value={!gsc ? '–' : index.length ? `${index.filter((r) => r.ok).length}/${index.length}` : '–'} note={!gsc ? 'Can’t check yet: connect Search Console' : `URL Inspection API, key pages. ${on('index')}`} href="#index" />
          <Tile label={HEALTH_LABEL.sitemap} value={latest.sitemap ? (bad('sitemap').length ? `${bad('sitemap').length} missing` : 'All in') : '–'} note={`Published CMS pages and blog posts against /sitemap.xml. ${on('sitemap')}`} href="#sitemap" />
          <Tile label="Orphan pages" value={latest.orphan ? n(bad('orphan').length) : '–'} note={`No internal links in, from the audit’s link graph. ${on('orphan')}`} href="#orphans" />
          <Tile label="Canonical mistakes" value={latest.canonical ? n(bad('canonical').length) : '–'} note={`From the audit’s pages. ${on('canonical')}`} href="#canonical" />
          <Tile label="Structured data problems" value={latest.schema ? n(bad('schema').length) : '–'} note={`JSON-LD on the key pages. ${on('schema')}`} href="#schema" />
          <Tile label="Mobile speed, median" value={median !== null ? `${median}/100` : '–'} note={!dfs ? 'Connect DataForSEO to run Lighthouse' : lighthouse.length ? `Lighthouse performance, ${lighthouse.length} pages. ${on('lighthouse')}` : 'Monthly, after Monday’s audit'} href="#lighthouse" />
          <Tile label="Crawlers blocked" value={latest.crawlers ? n(bad('crawlers').length) : '–'} note={`robots.txt, search and AI crawlers. ${on('crawlers')}`} href="#crawlers" />
        </div>
        {canSpend && <RunChecks />}
        {status?.step === 'running' && <p className="sx-note">The site audit started {dateLabel(status.startedAt)} and is still running.</p>}
        {status?.step === 'failed' && <p className="sx-down">The last audit run failed: {status.message}</p>}
      </section>

      <section className="sx-card" id="proposals">
        <h2>Title and description suggestions ({waiting.length})</h2>
        {waiting.length ? (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {waiting.map((p) => (
              <ProposalCard key={p.id} p={p} canPublish={!!s && can.publish(s.role)} canDraft={!!s && can.draft(s.role)} />
            ))}
          </ul>
        ) : (
          <Waiting>None waiting. When a page’s title or description is missing, too short or too long, the Monday audit writes a better one here for you to approve.</Waiting>
        )}
      </section>

      <div className="sx-grid2">
        <section className="sx-card" id="index">
          <h2>{HEALTH_LABEL.index}</h2>
          {!gsc ? (
            <Waiting>
              Can’t check yet: Search Console is not connected. <Link href="/admin/search/settings/connections">Connect it in Settings</Link>, then the 50 most important pages are checked every day.
            </Waiting>
          ) : !index.length ? (
            <Waiting>Not checked yet: the index check runs daily.</Waiting>
          ) : (
            <div className="sx-tablewrap">
              <table className="sx-table">
                <thead>
                  <tr>
                    <th>Page</th>
                    <th>Google says</th>
                    <th>Last crawled</th>
                  </tr>
                </thead>
                <tbody>
                  {[...index].sort((a, b) => Number(a.ok) - Number(b.ok)).map((r) => (
                    <tr key={r.url}>
                      <td>
                        {r.url}
                        {str(r.detail.googleCanonical) && str(r.detail.userCanonical) && str(r.detail.googleCanonical) !== str(r.detail.userCanonical) && (
                          <>
                            <br />
                            <small className="sx-down">Google chose {str(r.detail.googleCanonical)} as the canonical</small>
                          </>
                        )}
                      </td>
                      <td>
                        <span className={`sx-state ${r.ok ? 'done' : 'action'}`}>{r.ok ? 'Indexed' : 'Not indexed'}</span> <small className="sx-note">{str(r.detail.coverageState)}</small>
                      </td>
                      <td>{dateLabel(str(r.detail.lastCrawlTime)) || 'Never'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="sx-note">Source: Search Console URL Inspection API ({on('index').toLowerCase()}). A page not indexed is a Needs you item; it clears itself once Google indexes it.</p>
        </section>

        <section className="sx-card" id="sitemap">
          <h2>{HEALTH_LABEL.sitemap}</h2>
          {!latest.sitemap ? (
            <Waiting>Not checked yet: runs on Monday after the site audit.</Waiting>
          ) : (
            <>
              <p className="sx-note">
                {n(Number(sitemapSummary?.detail.sitemapUrls ?? 0))} addresses in /sitemap.xml; {n(Number(sitemapSummary?.detail.expected ?? 0))} published CMS pages and blog posts should be there. {str(sitemapSummary?.detail.message)}
              </p>
              <ul className="sx-list">
                {bad('sitemap').map((r) => (
                  <li key={r.url}>
                    <span>{r.url}</span>
                    <span className="sx-state action">Missing</span>
                  </li>
                ))}
                {!bad('sitemap').length && <li className="sx-note">Every published page and post is in the sitemap.</li>}
              </ul>
              <p className="sx-note">
                Search Console:{' '}
                {gscSitemap ? `${gscSitemap.message ?? ''}${gscSitemap.lastDownloaded ? ` Last read ${dateLabel(gscSitemap.lastDownloaded)}.` : ''}` : gsc ? 'no answer from the Sitemaps API.' : 'can’t check yet (not connected).'}
              </p>
            </>
          )}
          <p className="sx-note">Source: the live /sitemap.xml against the website editor’s published pages and the blog ({on('sitemap').toLowerCase()}).</p>
        </section>

        <section className="sx-card" id="orphans">
          <h2>Orphan pages</h2>
          {!latest.orphan ? (
            <Waiting>Waiting for a site audit from the last week (Monday 05:00).</Waiting>
          ) : (
            <ul className="sx-list">
              {bad('orphan').map((r) => (
                <li key={r.url}>
                  <span>{r.url}</span>
                  <small>no links in</small>
                </li>
              ))}
              {!bad('orphan').length && <li className="sx-note">Every page in the sitemap has a link from another page.</li>}
            </ul>
          )}
          <p className="sx-note">Source: the internal links found by the weekly audit across the sitemap’s pages. Link each orphan from a related page or a hub.</p>
        </section>

        <section className="sx-card" id="canonical">
          <h2>{HEALTH_LABEL.canonical}</h2>
          {!latest.canonical ? (
            <Waiting>Waiting for a site audit from the last week (Monday 05:00).</Waiting>
          ) : (
            <ul className="sx-list">
              {bad('canonical').map((r) => (
                <li key={r.url} style={{ display: 'grid', gap: 2 }}>
                  <span>{r.url}</span>
                  <small>{list(r.detail.problems).join(' ')}</small>
                </li>
              ))}
              {!bad('canonical').length && <li className="sx-note">Every page names itself as its canonical.</li>}
            </ul>
          )}
          <p className="sx-note">Source: each page’s canonical link, from the weekly audit ({on('canonical').toLowerCase()}).</p>
        </section>

        <section className="sx-card" id="schema">
          <h2>{HEALTH_LABEL.schema}</h2>
          {!latest.schema ? (
            <Waiting>Not checked yet: runs on Monday after the site audit.</Waiting>
          ) : (
            <div className="sx-tablewrap">
              <table className="sx-table">
                <thead>
                  <tr>
                    <th>Page</th>
                    <th>Types</th>
                    <th>Problems</th>
                  </tr>
                </thead>
                <tbody>
                  {[...pagesOf('schema')].sort((a, b) => Number(a.ok) - Number(b.ok)).map((r: HealthRow) => (
                    <tr key={r.url}>
                      <td>{r.url}</td>
                      <td>{list(r.detail.types).map((t) => <span key={t} className="sx-chip">{t}</span>)}{!list(r.detail.types).length && <small className="sx-note">none</small>}</td>
                      <td>
                        {r.ok ? <span className="sx-state done">OK</span> : <small className="sx-down">{list(r.detail.problems).join(' ')}</small>}
                        {list(r.detail.notes).map((x) => (
                          <small key={x} className="sx-note" style={{ display: 'block' }}>
                            {x}
                          </small>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="sx-note">Source: the JSON-LD on the key pages, checked for the required properties of LocalBusiness, Organization, Service, BreadcrumbList and Article. FAQ markup is listed but not scored: FAQ rich results ended in May 2026.</p>
        </section>

        <section className="sx-card" id="lighthouse">
          <h2>{HEALTH_LABEL.lighthouse}</h2>
          {!dfs ? (
            <Waiting>
              Can’t check yet: DataForSEO is not connected (<Link href="/admin/search/settings/connections">Settings</Link>).
            </Waiting>
          ) : !lighthouse.length ? (
            <Waiting>Not run yet: key pages are checked once a month after Monday’s audit, about half a US cent each, within the monthly cap.</Waiting>
          ) : (
            <div className="sx-tablewrap">
              <table className="sx-table">
                <thead>
                  <tr>
                    <th>Page</th>
                    <th className="num">Performance</th>
                    <th className="num">Largest paint</th>
                    <th className="num">Layout shift</th>
                    <th className="num">SEO</th>
                  </tr>
                </thead>
                <tbody>
                  {lighthouse.map((r) => (
                    <tr key={r.url}>
                      <td>
                        {r.url}
                        {str(r.detail.error) && (
                          <>
                            <br />
                            <small className="sx-down">{str(r.detail.error)}</small>
                          </>
                        )}
                      </td>
                      <td className="num">
                        <span className={r.ok ? 'sx-up' : 'sx-down'}>{n(r.detail.performance as number | null)}</span>
                      </td>
                      <td className="num">{typeof r.detail.lcpMs === 'number' ? `${n(r.detail.lcpMs / 1000, 1)} s` : '–'}</td>
                      <td className="num">{n(r.detail.cls as number | null, 3)}</td>
                      <td className="num">{n(r.detail.seo as number | null)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="sx-note">Source: DataForSEO Lighthouse, mobile, lab data ({on('lighthouse').toLowerCase()}). Red when performance is under 50 or the largest paint takes over 4 seconds.</p>
        </section>

        <section className="sx-card" id="crawlers">
          <h2>{HEALTH_LABEL.crawlers}</h2>
          {!latest.crawlers ? (
            <Waiting>Not checked yet: runs on Monday after the site audit.</Waiting>
          ) : (
            <ul className="sx-list">
              {rowsOf('crawlers').map((r) => (
                <li key={r.url || 'robots'}>
                  <span>{r.url || 'robots.txt'}</span>
                  <span className={`sx-state ${r.ok ? 'done' : 'action'}`}>{r.ok ? 'Allowed' : str(r.detail.message) || 'Blocked'}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="sx-note">
            Source: the live robots.txt ({on('crawlers').toLowerCase()}). {llms ? `llms.txt (low priority): ${str(llms.detail.message)}` : ''}
          </p>
        </section>

        <section className="sx-card" id="audit">
          <h2>Site audit findings</h2>
          {!audit ? (
            <Waiting>No audit yet: it runs every Monday at 05:00.</Waiting>
          ) : (
            <>
              <p className="sx-note">
                {audit.summary.pages} pages checked {dateLabel(audit.id)}: {audit.summary.clean} clean, {audit.summary.high} high, {audit.summary.medium} medium and {audit.summary.low} low problems.
                {audits[1] ? ` Score ${audits[1].summary.score} the week before.` : ''}
              </p>
              <ul className="sx-list">
                {[...audit.site].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]).map((f, i) => (
                  <li key={`${f.code}-${i}`} style={{ display: 'grid', gap: 2 }}>
                    <span>
                      <span className={`sx-state ${f.severity === 'high' ? 'action' : 'manual'}`}>{f.severity}</span> {f.message}
                    </span>
                    {f.paths?.length ? <small>{f.paths.slice(0, 6).join(', ')}</small> : null}
                  </li>
                ))}
                {audit.pages
                  .filter((p) => p.findings.some((f) => f.severity === 'high'))
                  .slice(0, 12)
                  .map((p) => (
                    <li key={p.path} style={{ display: 'grid', gap: 2 }}>
                      <span>
                        <span className="sx-state action">high</span> {p.path}
                      </span>
                      <small>{p.findings.filter((f) => f.severity === 'high').map((f) => f.message).join(' ')}</small>
                    </li>
                  ))}
                {!audit.site.length && !audit.pages.some((p) => p.findings.some((f) => f.severity === 'high')) && <li className="sx-note">No site-wide or high problems.</li>}
              </ul>
            </>
          )}
          <p className="sx-note">Source: the weekly site audit of every page in the sitemap (titles, descriptions, headings, images, broken links).</p>
        </section>
      </div>
    </>
  );
}
