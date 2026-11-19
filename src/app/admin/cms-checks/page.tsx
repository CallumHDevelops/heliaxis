import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { requirePortal } from '@/lib/auth';
import { checkSaved } from '@/lib/cms/checks-server';
import '../cms-facts/facts.css';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const metadata: Metadata = { title: 'Page checks · Heliaxis', robots: { index: false, follow: false } };

/** CMS › Page checks: every page in the editor checked against the facts sheet. Errors on a new or changed page stop it publishing. */
export default async function CmsChecksPage() {
  const s = await requirePortal('cms');
  if (!s) redirect('/admin?denied=1');
  let report = null;
  try {
    report = await checkSaved();
  } catch {
    report = null;
  }
  const pages = report ? [...report.pages].sort((a, b) => Number(b.changed && b.errors > 0) - Number(a.changed && a.errors > 0) || b.errors - a.errors || b.warnings - a.warnings) : [];
  return (
    <AdminShell active="cmschecks" fluid>
      <div className="fx">
        <div className="fx-head">
          <h1>Page checks</h1>
          <p>
            Every page saved in the editor, checked against the <Link href="/admin/cms-facts">Facts sheet</Link>. An error on a new or changed page stops it publishing. Warnings do not, but are worth fixing. Pages already live and unchanged never block anything.
          </p>
        </div>
        {!report ? (
          <p className="fx-bad">The checks could not run just now. Publishing is not blocked by this. Try again in a moment.</p>
        ) : (
          <>
            <div className="fx-sum">
              <span className="fx-pill">{report.blocking.length} page{report.blocking.length === 1 ? '' : 's'} blocking Publish</span>
              <span className="fx-pill fx-err">{report.errors} errors</span>
              <span className="fx-pill fx-warn">{report.warnings} warnings</span>
            </div>
            {pages.map((p) => (
              <details className="fx-page" key={p.slug} open={p.changed && p.errors > 0}>
                <summary>
                  <b>{p.name || p.slug}</b>
                  <span className="fx-muted">{p.slug}</span>
                  {p.draft && <span className="fx-tag">draft</span>}
                  {p.changed && p.errors > 0 && <span className="fx-tag is-block">blocks Publish</span>}
                  <span className="fx-err">{p.errors} errors</span>
                  <span className="fx-warn">{p.warnings} warnings</span>
                </summary>
                <ul>
                  {p.issues.map((i, n) => (
                    <li key={n} className={i.level === 'error' ? 'fx-err' : undefined}>
                      {i.level === 'error' ? 'Error: ' : 'Warning: '}
                      <span style={{ fontWeight: 400 }}>{i.message}</span>
                    </li>
                  ))}
                  {p.issues.length === 0 && <li style={{ fontWeight: 400 }}>No problems found.</li>}
                </ul>
              </details>
            ))}
          </>
        )}
      </div>
    </AdminShell>
  );
}
