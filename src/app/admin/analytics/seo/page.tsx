import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { requirePortal } from '@/lib/auth';
import { compareAudits, SEVERITY_ORDER } from '@/lib/seo/shared';
import { readProposals, recentAudits } from '@/lib/seo/server';
import { Proposals, RunNow } from './SeoControls';
import './seo.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'SEO and AI report · Heliaxis', robots: { index: false, follow: false } };

const when = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

export default async function SeoReportPage() {
  const s = await requirePortal('analytics');
  if (!s) redirect('/admin?denied=1');
  const admin = s.profile.role === 'admin';
  const [audits, proposals] = await Promise.all([recentAudits(8).catch(() => []), readProposals().catch(() => [])]);
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
            <h1>SEO and AI report</h1>
            <p>
              Every Monday the whole site is checked the way a search engine or an AI assistant would read it. Nothing on the website changes until you approve it.
              {now && <> Last check: {when(now.at)}.</>}
            </p>
          </div>
          {admin && <RunNow />}
        </header>

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

            <Proposals waiting={waiting} admin={admin} />

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
