import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { searchSession } from '@/lib/search/server';
import { can } from '@/lib/search/settings';
import { ourPages } from '@/lib/search/studio/server';
import { n, one, PageHead, type SP } from '../../common';
import { StartButton } from '../StudioClient';
import '../content.css';

export const dynamic = 'force-dynamic';

type Cluster = { id: number; name: string; page_type: string | null; action: string; target_page: string | null; town: string | null; score: number | null; status: string; keywords: unknown[] | null };
type Kw = { id: number; phrase: string; town: string | null; intent: string; priority: number; volume: number | null; target_page: string | null };

export default async function NewContent({ searchParams }: { searchParams: SP }) {
  const q = await searchParams;
  const clusterId = Number(one(q.cluster)) || undefined;
  const keywordId = Number(one(q.keyword)) || undefined;
  const page = one(q.page) || undefined;
  const db = createAdminClient();
  const session = await searchSession();
  const canDraft = session ? can.draft(session.role) : false;

  // Starting from one thing: say what the brief will be built from, then build it.
  if (clusterId || keywordId || page) {
    const [c, k] = await Promise.all([
      clusterId ? db.from('seo_cluster').select('id, name, page_type, action, target_page, town, score, status, keywords').eq('id', clusterId).maybeSingle() : Promise.resolve({ data: null }),
      keywordId ? db.from('seo_keyword').select('id, phrase, town, intent, priority, volume, target_page').eq('id', keywordId).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const cl = c.data as Cluster | null;
    const kw = k.data as Kw | null;
    return (
      <>
        <PageHead title={page ? 'Refresh a page' : 'Start a page'} sub="The brief is built from stored rows only: the latest SERP top 10, their page facts, the teardown and our own pages. No paid calls." />
        <section className="sx-card">
          {cl && (
            <>
              <h2>Planner group: {cl.name}</h2>
              <p className="sx-note">
                {cl.action === 'hold' ? 'On Hold: it needs proof we do not have yet, so a new page cannot start from it.' : `${cl.action === 'improve' ? 'Improve' : 'Create'} · ${cl.page_type?.replace('_', ' ') ?? 'page type to be guessed'} · ${(cl.keywords ?? []).length} searches${cl.town ? ` · ${cl.town}` : ''}${cl.score != null ? ` · score ${n(cl.score, 1)}` : ''}`}
              </p>
            </>
          )}
          {kw && (
            <>
              <h2>Tracked search: {kw.phrase}</h2>
              <p className="sx-note">
                {kw.town ?? 'No town'} · {kw.intent.replace('_', ' ')} · priority {kw.priority} · volume {n(kw.volume)}
                {kw.target_page ? ` · target page ${kw.target_page}` : ''}
              </p>
            </>
          )}
          {page && (
            <>
              <h2>Live page: {page}</h2>
              <p className="sx-note">Refresh mode compares the page with the latest brief and suggests section edits. It does not rewrite the page; the edits are made in the website editor.</p>
            </>
          )}
          {!cl && !kw && !page && <p className="sx-note">That group or search was not found.</p>}
          {canDraft ? (
            (cl || kw || page) && (cl?.action !== 'hold' || page) && (
              <div className="sx-row" style={{ marginTop: 10 }}>
                <StartButton clusterId={clusterId} keywordId={keywordId} page={page} label={page ? 'Compare it with the top 10' : 'Build the brief'} />
                {!page && <StartButton clusterId={clusterId} keywordId={keywordId} kind="blog" label="Build it as a blog article" solar={false} />}
              </div>
            )
          ) : (
            <p className="sx-note">Editors and above can start pages.</p>
          )}
        </section>
      </>
    );
  }

  const [{ data: clusters }, { data: kws }, { data: open }, pages] = await Promise.all([
    db.from('seo_cluster').select('id, name, page_type, action, target_page, town, score, status, keywords').in('status', ['idea', 'briefed']).neq('action', 'hold').order('score', { ascending: false, nullsFirst: false }).limit(30),
    db.from('seo_keyword').select('id, phrase, town, intent, priority, volume, target_page').eq('active', true).order('priority').order('volume', { ascending: false, nullsFirst: false }).limit(40),
    db.from('seo_content').select('cluster_id, slug, brief').not('status', 'in', '(published,rejected)'),
    ourPages(),
  ]);
  const busyClusters = new Set(((open ?? []) as { cluster_id: number | null }[]).map((o) => o.cluster_id).filter(Boolean));
  const busyPages = new Set(((open ?? []) as { slug: string | null }[]).map((o) => o.slug).filter(Boolean));
  const groups = ((clusters ?? []) as Cluster[]).filter((c) => !busyClusters.has(c.id));
  const searches = (kws ?? []) as Kw[];
  const live = pages.filter((p) => p.html && !busyPages.has(p.path));

  return (
    <>
      <PageHead title="Start a page" sub="Pick what the page is for. One page serves each group of related searches, so start from a planner group where you can." />
      <section className="sx-card">
        <h2>From the planner ({groups.length})</h2>
        {groups.length ? (
          <div className="sx-tablewrap">
            <table className="sx-table">
              <thead>
                <tr>
                  <th>Group</th>
                  <th>Action</th>
                  <th>Type</th>
                  <th className="num">Searches</th>
                  <th className="num">Score</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {groups.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{c.action === 'improve' ? `Improve ${c.target_page ?? ''}` : 'Create'}</td>
                    <td>{c.page_type?.replace('_', ' ') ?? '–'}</td>
                    <td className="num">{(c.keywords ?? []).length}</td>
                    <td className="num">{n(c.score, 1)}</td>
                    <td>{canDraft && <StartButton clusterId={c.id} label="Brief" solar={false} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="sx-note">No planner groups waiting. The planner scores groups on Monday at 08:00 (Plan tab); until then, start from a tracked search below.</p>
        )}
      </section>

      <section className="sx-card">
        <h2>From a tracked search</h2>
        {searches.length ? (
          <div className="sx-tablewrap">
            <table className="sx-table">
              <thead>
                <tr>
                  <th>Search</th>
                  <th>Town</th>
                  <th>Intent</th>
                  <th className="num">Priority</th>
                  <th className="num">Volume</th>
                  <th>Target page</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {searches.map((k) => (
                  <tr key={k.id}>
                    <td>{k.phrase}</td>
                    <td>{k.town}</td>
                    <td>{k.intent.replace('_', ' ')}</td>
                    <td className="num">{k.priority}</td>
                    <td className="num">{n(k.volume)}</td>
                    <td>{k.target_page ?? <span className="sx-note">none</span>}</td>
                    <td>{canDraft && <StartButton keywordId={k.id} label="Brief" solar={false} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="sx-note">
            No tracked searches. Add them in <Link className="crm-link" href="/admin/search/settings/keywords">Settings › Keywords</Link>.
          </p>
        )}
      </section>

      <section className="sx-card">
        <h2>Refresh a live page ({live.length})</h2>
        <p className="sx-note">Compares the page with the latest teardown and suggests section edits, not a rewrite. From the website editor’s live snapshot.</p>
        {live.length ? (
          <ul className="sx-list">
            {live.map((p) => (
              <li key={p.path}>
                <span>
                  {p.title} <small>{p.path}</small>
                </span>
                {canDraft && <StartButton page={p.path} label="Refresh" solar={false} />}
              </li>
            ))}
          </ul>
        ) : (
          <p className="sx-note">No live pages in the website editor’s snapshot.</p>
        )}
      </section>
    </>
  );
}
