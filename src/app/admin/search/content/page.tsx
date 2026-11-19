import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { searchSession } from '@/lib/search/server';
import { can } from '@/lib/search/settings';
import { contentRules, newPagesThisWeek } from '@/lib/search/studio/server';
import { STATUS_LABEL, type ContentStatus } from '@/lib/search/studio/types';
import { BrandIcon } from '@/app/admin/crm/CrmUi';
import { dateLabel, n, PageHead, Pos } from '../common';
import './content.css';

export const dynamic = 'force-dynamic';

type Row = {
  id: number;
  kind: 'cms_page' | 'blog';
  mode: 'new' | 'refresh';
  title: string | null;
  slug: string | null;
  status: ContentStatus;
  created_by: string | null;
  approved_by: string | null;
  published_at: string | null;
  published_ref: string | null;
  cost_usd: number;
  updated_at: string;
  checks: { ok?: boolean; results?: { ok: boolean; blocking: boolean }[] } | null;
};
type M = { content_id: number; day: number; best_pos: number | null; impressions: number | null; enquiries: number | null };

const GROUPS: { title: string; statuses: ContentStatus[]; note: string }[] = [
  { title: 'Waiting for approval', statuses: ['in_review', 'approved'], note: 'An admin approves and publishes.' },
  { title: 'Being written', statuses: ['brief', 'proof', 'drafting', 'draft'], note: 'Brief, proof pack, draft and checks.' },
  { title: 'Published and measuring', statuses: ['published'], note: 'Measured at 14, 28, 56 and 90 days.' },
  { title: 'Rejected', statuses: ['rejected'], note: '' },
];

export default async function Content() {
  const db = createAdminClient();
  const session = await searchSession();
  const [{ data }, rules, used] = await Promise.all([
    db.from('seo_content').select('id, kind, mode, title, slug, status, created_by, approved_by, published_at, published_ref, cost_usd, updated_at, checks').order('updated_at', { ascending: false }).limit(300),
    contentRules(db),
    newPagesThisWeek(db),
  ]);
  const rows = (data ?? []) as Row[];
  const ids = rows.filter((r) => r.status === 'published').map((r) => r.id);
  const { data: ms } = ids.length ? await db.from('seo_content_measure').select('content_id, day, best_pos, impressions, enquiries').in('content_id', ids) : { data: [] };
  const measures = new Map<number, Map<number, M>>();
  for (const m of (ms ?? []) as M[]) {
    if (!measures.has(m.content_id)) measures.set(m.content_id, new Map());
    measures.get(m.content_id)!.set(m.day, m);
  }
  const canDraft = session ? can.draft(session.role) : false;
  const spent = rows.reduce((a, r) => a + Number(r.cost_usd ?? 0), 0);

  return (
    <>
      <PageHead
        title="Content"
        sub="Write pages that can rank, from the teardown and Heliaxis’s own proof. A person approves every page before it goes live."
        fresh={
          <>
            New pages this week: <b>{used} of {rules.weeklyNewPages}</b>
            <br />
            <small>Settings › Content rules</small>
          </>
        }
      />
      <section className="sx-card">
        <div className="sx-row" style={{ justifyContent: 'space-between' }}>
          <h2>
            <BrandIcon k="document" /> The studio
          </h2>
          {canDraft && (
            <Link className="crm-btn crm-btn--solar crm-btn--small" href="/admin/search/content/new">
              Start a page
            </Link>
          )}
        </div>
        <p className="sx-note">
          {rows.length ? `${rows.length} page${rows.length === 1 ? '' : 's'} in the studio. Writing cost so far: $${spent.toFixed(2)} (from ai_usage).` : 'Nothing in the studio yet. Start from a group in Plan, a tracked search in Rankings, or a live page that needs a refresh.'}{' '}
          {used >= rules.weeklyNewPages && 'This week’s new-page limit is reached: new pages can be drafted and approved, and publish from Monday. Refreshes are not limited.'}
        </p>
      </section>

      {GROUPS.map((g) => {
        const list = rows.filter((r) => g.statuses.includes(r.status));
        if (!list.length) return null;
        const published = g.statuses.includes('published');
        return (
          <section className="sx-card" key={g.title}>
            <h2>
              {g.title} ({list.length})
            </h2>
            {g.note && <p className="sx-note">{g.note}</p>}
            <div className="sx-tablewrap">
              <table className="sx-table">
                <thead>
                  <tr>
                    <th>Page</th>
                    <th>Kind</th>
                    <th>Status</th>
                    {published ? (
                      <>
                        <th>Live at</th>
                        <th className="num">Day 0</th>
                        <th className="num">Day 14</th>
                        <th className="num">Day 28</th>
                        <th className="num">Day 90</th>
                        <th className="num">Enquiries</th>
                      </>
                    ) : (
                      <>
                        <th>Checks</th>
                        <th>By</th>
                        <th>Updated</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => {
                    const m = measures.get(r.id);
                    const failing = (r.checks?.results ?? []).filter((x) => x.blocking && !x.ok).length;
                    const last = m ? [...m.values()].sort((a, b) => b.day - a.day)[0] : undefined;
                    return (
                      <tr key={r.id}>
                        <td>
                          <Link className="crm-link" href={`/admin/search/content/${r.id}`}>
                            {r.title || 'Untitled'}
                          </Link>
                          {r.mode === 'refresh' && <span className="sx-chip">refresh</span>}
                        </td>
                        <td>{r.kind === 'blog' ? 'Article' : 'Page'}</td>
                        <td>
                          <span className={`sx-state ${r.status === 'published' ? 'done' : r.status === 'in_review' ? 'manual' : r.status === 'rejected' ? 'action' : 'manual'}`}>{STATUS_LABEL[r.status]}</span>
                        </td>
                        {published ? (
                          <>
                            <td>
                              {r.published_ref}
                              <br />
                              <small className="sx-note">{dateLabel(r.published_at)}</small>
                            </td>
                            {[0, 14, 28, 90].map((d) => (
                              <td className="num" key={d}>
                                {m?.has(d) ? <Pos p={m.get(d)!.best_pos} /> : <span className="sx-note">–</span>}
                              </td>
                            ))}
                            <td className="num">{last ? n(last.enquiries) : '–'}</td>
                          </>
                        ) : (
                          <>
                            <td>{r.checks?.results?.length ? failing ? <span className="sx-down">{failing} blocking</span> : <span className="sx-up">all pass</span> : <span className="sx-note">not run</span>}</td>
                            <td>{r.created_by}</td>
                            <td>{dateLabel(r.updated_at)}</td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {published && <p className="sx-note">Best position across the page’s searches (seo_serp_result). Enquiries: those that landed on the page since it went live (enquiries.landing_path).</p>}
          </section>
        );
      })}
    </>
  );
}
