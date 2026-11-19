import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { dfsConfigured } from '@/lib/dataforseo/client';
import { gscConfigured } from '@/lib/search/gsc';
import { budget, getSetting, searchSession } from '@/lib/search/server';
import { can, tierOf } from '@/lib/search/settings';
import { STATUS_LABEL, type QueueStatus } from '@/lib/search/planner/config';
import { effortOf, medianOf, quadrantOf, QUADRANT_LABEL, type Action, type Quadrant, type ScoreInputs } from '@/lib/search/planner/plan';
import { getPlannerSettings } from '@/lib/search/planner/server';
import { planResearch, readResearchState } from '@/lib/search/planner';
import { estimateOf, researchSteps } from '@/lib/search/planner/steps';
import { linkingHint, PAGE_TYPE_LABEL, type PageType, type Service } from '@/lib/search/planner/words';
import { dateLabel, filtersFrom, n, one, PageHead, Pos, type SP } from '../common';
import { QueueControls, RescoreButton, ResearchButton, RowActions, WeightsForm } from './PlanClient';
import './plan.css';

export const dynamic = 'force-dynamic';
// "Keyword research now" runs paid steps for up to about 3 minutes inside the action.
export const maxDuration = 300;

type ClusterKw = { phrase: string; keyword_id: number | null; volume: number | null; volume_from: string | null; pos: number | null; url: string | null; sources: string[]; by: string; shared: number | null };
type Cluster = {
  id: number;
  name: string;
  keywords: ClusterKw[];
  page_type: PageType | null;
  action: Action;
  target_page: string | null;
  town: string | null;
  service: Service | null;
  score: number | null;
  score_inputs: Partial<ScoreInputs> & { scoredAt?: string };
  hold_reason: string | null;
  status: QueueStatus | 'dismissed';
  owner: string | null;
  due: string | null;
  updated_at: string;
};

const ACTION_LABEL: Record<Action, string> = { improve: 'Improve', create: 'Create', hold: 'Hold' };
const SOURCE_LABEL: Record<string, string> = { tracked: 'Tracked', ranked: 'Labs: we rank', gap: 'Rival gap', idea: 'Keyword idea', gsc: 'Search Console' };
const GROUPED_LABEL: Record<string, string> = { serp: 'grouped by SERP overlap', words: 'grouped by words (no SERP data)', mixed: 'SERP overlap, plus searches joined by words' };

const path = (u: string | null) => {
  if (!u) return '';
  try {
    return new URL(u).pathname || '/';
  } catch {
    return u;
  }
};

const qs = (q: Record<string, string | string[] | undefined>, patch: Record<string, string | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (one(v)) p.set(k, one(v));
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) p.delete(k);
    else p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : '?';
};

export default async function Plan({ searchParams }: { searchParams: SP }) {
  const q = await searchParams;
  const { filters } = filtersFrom(q);
  const view = one(q.view) === 'matrix' ? 'matrix' : 'table';
  const actionFilter = (['improve', 'create', 'hold'] as const).find((a) => a === one(q.action)) ?? null;
  const showAll = one(q.all) === '1';

  const db = createAdminClient();
  const session = await searchSession();
  const [clustersRes, poolRes, weights, areas, state, spend] = await Promise.all([
    db.from('seo_cluster').select('*').order('score', { ascending: false, nullsFirst: false }).limit(2000),
    db.from('seo_keyword_pool').select('source, updated_at').limit(20000),
    getPlannerSettings(db),
    getSetting('areas', db),
    readResearchState(db),
    budget('dataforseo', db),
  ]);

  const all = (clustersRes.data ?? []) as Cluster[];
  const passes = (c: Cluster) =>
    (!filters.town || c.town === filters.town) &&
    (!filters.service || c.service === filters.service) &&
    (!filters.intent || c.score_inputs?.intent === filters.intent) &&
    (!filters.tier || tierOf(c.town, areas.list) === filters.tier);
  const open = all.filter((c) => c.status !== 'dismissed' && passes(c));
  const dismissed = all.filter((c) => c.status === 'dismissed');
  const queue = open.filter((c) => !actionFilter || c.action === actionFilter);
  const shown = showAll ? queue : queue.slice(0, 40);
  const scoredAt = all.map((c) => c.score_inputs?.scoredAt ?? '').sort().at(-1) || null;

  // Pool: rows per source and when each was last refreshed.
  const pool = new Map<string, { n: number; at: string }>();
  for (const r of (poolRes.data ?? []) as { source: string; updated_at: string }[]) {
    const e = pool.get(r.source) ?? { n: 0, at: '' };
    e.n++;
    if (r.updated_at > e.at) e.at = r.updated_at;
    pool.set(r.source, e);
  }

  // Pre-flight for "Keyword research now": what is left of this month's run, or a fresh run.
  const month = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }).slice(0, 7);
  const thisMonth = state && state.month === month ? state : null;
  const plan = thisMonth ? null : await planResearch(db);
  const steps = thisMonth ? researchSteps(thisMonth.rivals, thisMonth.relatedSeeds) : (plan?.steps ?? []);
  const left = thisMonth ? steps.filter((s) => !thisMonth.done[s.id]) : steps;
  const estimate = estimateOf(left.filter((s) => s.paid));
  const errors = thisMonth ? Object.entries(thisMonth.done).filter(([, l]) => l.error) : [];
  const rivals = thisMonth?.rivals ?? plan?.rivals ?? [];
  const canDraft = session ? can.draft(session.role) : false;
  const canSpend = session ? can.spend(session.role) : false;
  const isOwner = session?.role === 'owner';

  const median = medianOf(open.map((c) => Number(c.score ?? 0)));
  const iw = weights.intentWeights;

  return (
    <>
      <PageHead
        title="Plan"
        sub="Which pages to build or improve. Related searches are grouped so one page serves each group, never a page per variation."
        fresh={scoredAt ? <>Scored <b>{dateLabel(scoredAt.slice(0, 10), true)}</b><br />re-scored Mondays 08:00</> : 'Not scored yet'}
      />

      <section className="sx-card">
        <h2>How the score works</h2>
        <p className="pl-formula">
          Score = volume × position gain × intent weight × proof ÷ difficulty band
        </p>
        <ul className="pl-defs">
          <li><b>Volume</b>: monthly searches across every search in the group (DataForSEO; a Search Console-only search counts its impressions over 28 days; an unknown volume counts as {n(weights.unknownVolume)}).</li>
          <li><b>Position gain</b>: the share of clicks at position 1 minus the share at our best position in the group now (0.28 when we are not in the top 100).</li>
          <li><b>Intent weight</b>: local commercial {n(iw.local_commercial, 2)}, commercial {n(iw.commercial, 2)}, informational {n(iw.informational, 2)}.</li>
          <li><b>Proof</b>: {n(weights.proofWeights.with, 2)} with real local work (a won or completed CRM project in the town’s postcode districts, or installs marked yes in Target areas), {n(weights.proofWeights.without, 2)} without.</li>
          <li><b>Difficulty band</b>: Labs keyword difficulty, banded at {weights.difficultyCuts.join(', ')} into 1 to {weights.difficultyCuts.length + 1}; {n(weights.unknownDifficultyBand)} while unknown.</li>
          <li><b>One page per group</b>: two searches share a page when their top 10s share at least {weights.overlapUrls} URLs. Searches with no SERP data are grouped by service, town and page kind, and say so.</li>
        </ul>
        {isOwner ? (
          <details className="pl-details">
            <summary>Tune the weights (owner)</summary>
            <WeightsForm value={weights} />
          </details>
        ) : (
          <p className="sx-note">Only the owner can tune the weights.</p>
        )}
      </section>

      <section className="sx-card">
        <div className="sx-row" style={{ justifyContent: 'space-between' }}>
          <h2>Queue ({queue.length})</h2>
          <div className="sx-row">
            <span className="pl-seg" role="group" aria-label="View">
              <Link className={`crm-btn crm-btn--small ${view === 'table' ? 'crm-btn--solar' : 'crm-btn--ghost'}`} href={qs(q, { view: null })} scroll={false}>Table</Link>
              <Link className={`crm-btn crm-btn--small ${view === 'matrix' ? 'crm-btn--solar' : 'crm-btn--ghost'}`} href={qs(q, { view: 'matrix' })} scroll={false}>Impact against effort</Link>
            </span>
            <span className="pl-seg" role="group" aria-label="Action">
              {([null, 'improve', 'create', 'hold'] as const).map((a) => (
                <Link key={a ?? 'all'} className={`crm-btn crm-btn--small ${actionFilter === a ? 'crm-btn--solar' : 'crm-btn--ghost'}`} href={qs(q, { action: a })} scroll={false}>
                  {a ? `${ACTION_LABEL[a]} (${open.filter((c) => c.action === a).length})` : 'All'}
                </Link>
              ))}
            </span>
            {canDraft && <RescoreButton />}
          </div>
        </div>

        {!all.length ? (
          <p>
            No pages queued yet. Scoring runs every Monday at 08:00 from the tracked searches, Search Console striking-distance queries and the monthly keyword research (the 1st of each month).
            {canDraft ? ' Press Re-score now to run it from what is stored.' : ''}
          </p>
        ) : !queue.length ? (
          <p>Nothing matches these filters.</p>
        ) : view === 'matrix' ? (
          <Matrix clusters={queue} median={median} />
        ) : (
          <>
            <div className="sx-tablewrap">
              <table className="sx-table pl-table">
                <thead>
                  <tr>
                    <th>Page</th>
                    <th>Type</th>
                    <th className="num">Searches covered</th>
                    <th className="num">Volume</th>
                    <th className="num">Current best position</th>
                    <th className="num">Score</th>
                    <th>Owner, status and due date</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((c) => (
                    <Row key={c.id} c={c} canEdit={canDraft} />
                  ))}
                </tbody>
              </table>
            </div>
            {queue.length > shown.length && (
              <p>
                Showing the top {shown.length} by score. <Link className="crm-link" href={qs(q, { all: '1' })} scroll={false}>Show all {queue.length}</Link>
              </p>
            )}
          </>
        )}
        <p className="sx-note">
          Improve: a page of ours already ranks for the group or is set as its target page. Create: no page of ours does. Hold: a town page or case study for a town with no installs on record (it would read as a doorway page), with the reason. Write it opens the content studio with the group’s searches.
        </p>
      </section>

      <section className="sx-grid2">
        <div className="sx-card">
          <h2>Keyword pool</h2>
          <table className="sx-table">
            <thead>
              <tr>
                <th>Source</th>
                <th className="num">Searches</th>
                <th>Refreshed</th>
              </tr>
            </thead>
            <tbody>
              {(['tracked', 'ranked', 'gsc', 'gap', 'idea'] as const).map((s) => {
                const e = pool.get(s);
                const empty =
                  s === 'gsc'
                    ? gscConfigured()
                      ? 'None in striking distance yet (position 8 to 30 with real impressions, last 28 days)'
                      : 'Connect Search Console in Settings › Connections'
                    : s === 'ranked'
                      ? 'Labs ranked keywords arrive Monday 06:30'
                      : s === 'tracked'
                        ? 'Add searches in Settings › Keywords'
                        : dfsConfigured()
                          ? 'Keyword research runs on the 1st of the month'
                          : 'Connect DataForSEO in Settings › Connections';
                return (
                  <tr key={s}>
                    <td>{SOURCE_LABEL[s]}</td>
                    <td className="num">{e ? n(e.n) : '–'}</td>
                    <td>{e ? dateLabel(e.at.slice(0, 10)) : <span className="sx-note">{empty}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="sx-note">Tracked searches, Search Console and Labs ranked keywords are re-read free before every scoring run. Rival gaps and keyword ideas (DataForSEO Labs, UK, an estimate) are bought monthly.</p>
        </div>

        <div className="sx-card">
          <h2>Keyword research this month</h2>
          {thisMonth ? (
            <p>
              {steps.length - left.length} of {steps.length} steps done{thisMonth.finishedAt ? `, finished ${dateLabel(thisMonth.finishedAt.slice(0, 10))}` : ''}. Rivals compared: {thisMonth.rivals.length ? thisMonth.rivals.join(', ') : 'none yet (no installer in the latest top 10s)'}.
            </p>
          ) : (
            <p>Not run this month. It compares us with the top {rivals.length || 8} rival installers in the latest top 10s{rivals.length ? ` (${rivals.join(', ')})` : ''}, then asks for keyword ideas, related keywords, difficulty and intent.</p>
          )}
          {errors.length > 0 && (
            <ul className="sx-list">
              {errors.map(([id, l]) => (
                <li key={id}>
                  {id}: <span className="sx-note">{l.error}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="sx-note">
            Estimate for what is left: ${estimate.toFixed(2)} (tasks × Labs unit price). This month’s DataForSEO spend: ${spend.spent.toFixed(2)} of the ${spend.cap.toFixed(0)} cap.
          </p>
          {canSpend && left.length > 0 && dfsConfigured() && (
            <ResearchButton estimate={estimate} overCap={spend.spent + estimate > spend.cap} canOverride={session ? can.overrideCap(session.role) : false} label={thisMonth ? 'Carry on the research' : 'Keyword research now'} />
          )}
        </div>
      </section>

      {dismissed.length > 0 && (
        <section className="sx-card">
          <details className="pl-details">
            <summary>Dismissed ({dismissed.length})</summary>
            <ul className="sx-list">
              {dismissed.map((c) => (
                <li key={c.id} className="sx-row" style={{ justifyContent: 'space-between' }}>
                  <span>
                    {c.name} <small>{c.page_type ? PAGE_TYPE_LABEL[c.page_type] : ''}</small>
                  </span>
                  {canDraft && <RowActions id={c.id} writeHref={null} dismissed />}
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}
    </>
  );
}

function scoreSum(i: Cluster['score_inputs']) {
  if (i?.volume === undefined) return '';
  return `${n(i.volume)} × ${n(i.gain, 4)} × ${n(i.intentWeight, 2)} × ${n(i.proofWeight, 2)} ÷ ${n(i.band)}`;
}

function Row({ c, canEdit }: { c: Cluster; canEdit: boolean }) {
  const i = c.score_inputs ?? {};
  const kws = c.keywords ?? [];
  const type = c.page_type ?? 'article';
  const service = c.service ?? 'general';
  return (
    <tr className={c.action === 'hold' ? 'pl-hold' : ''}>
      <td className="pl-page">
        <div>
          <span className={`sx-chip ${c.action === 'improve' ? 'gold' : ''} pl-act-${c.action}`}>{ACTION_LABEL[c.action]}</span> <b>{c.name}</b>
          {i.stale && <span className="sx-chip" title="No longer found by the latest scoring run">not in latest scoring</span>}
        </div>
        {c.target_page && <small title={c.target_page}>Page: {path(c.target_page)}</small>}
        {c.hold_reason && <small className="pl-reason">{c.hold_reason}</small>}
        <details className="pl-details">
          <summary>Searches and links</summary>
          <ul className="pl-kws">
            {kws.map((k) => (
              <li key={k.phrase}>
                {k.phrase}
                <small>
                  {k.volume !== null ? ` ${n(k.volume)}${k.volume_from === 'gsc_impressions' ? ' impressions' : '/mo'}` : ' volume unknown'}
                  {k.pos !== null ? ` · ours at ${n(k.pos, 1)}` : ''}
                  {k.by === 'serp' && k.shared !== null ? ` · shares ${k.shared} top-10 URLs` : k.by === 'words' ? ' · joined by words' : ''}
                  {` · ${k.sources.map((s) => SOURCE_LABEL[s] ?? s).join(', ')}`}
                </small>
              </li>
            ))}
          </ul>
          <p className="sx-note">Links: {linkingHint(type, service, c.town)}</p>
        </details>
      </td>
      <td>
        {PAGE_TYPE_LABEL[type]}
        {c.town && <small className="pl-block">{c.town}</small>}
      </td>
      <td className="num">
        {kws.length}
        <small className="pl-block">{GROUPED_LABEL[i.groupedBy ?? 'words']}</small>
      </td>
      <td className="num">
        {n(i.volume)}
        {i.volumeUnknown ? <small className="pl-block">{i.volumeUnknown} unknown</small> : null}
      </td>
      <td className="num">
        <Pos p={i.bestPos === null || i.bestPos === undefined ? null : Math.round(i.bestPos)} />
      </td>
      <td className="num" title={scoreSum(i)}>
        <b>{n(c.score, 1)}</b>
        <small className="pl-block">{scoreSum(i)}</small>
      </td>
      <td>
        {canEdit ? (
          <QueueControls id={c.id} owner={c.owner} status={c.status} due={c.due} canEdit />
        ) : (
          <>
            {c.owner || '–'} · {STATUS_LABEL[c.status as QueueStatus] ?? c.status}
            {c.due ? ` · due ${dateLabel(c.due)}` : ''}
          </>
        )}
      </td>
      <td>{canEdit && <RowActions id={c.id} writeHref={c.action === 'hold' ? null : `/admin/search/content/new?cluster=${c.id}`} />}</td>
    </tr>
  );
}

function Matrix({ clusters, median }: { clusters: Cluster[]; median: number }) {
  const by: Record<Quadrant, Cluster[]> = { quick_win: [], big_bet: [], fill_in: [], later: [] };
  for (const c of clusters) by[quadrantOf(Number(c.score ?? 0), effortOf(c.page_type ?? 'article', c.action), median)].push(c);
  const box = (k: Quadrant, note: string) => (
    <div className={`pl-quad pl-quad--${k}`}>
      <h3>
        {QUADRANT_LABEL[k]} <small>({by[k].length})</small>
      </h3>
      <p className="sx-note">{note}</p>
      <ul>
        {by[k].slice(0, 15).map((c) => (
          <li key={c.id}>
            <span>{c.name}</span>
            <small>
              {ACTION_LABEL[c.action]} · {c.page_type ? PAGE_TYPE_LABEL[c.page_type] : ''} · {n(c.score, 1)}
            </small>
          </li>
        ))}
        {by[k].length > 15 && <li className="sx-note">and {by[k].length - 15} more</li>}
      </ul>
    </div>
  );
  return (
    <>
      <div className="pl-matrix">
        {box('quick_win', 'High score, less work')}
        {box('big_bet', 'High score, more work')}
        {box('fill_in', 'Lower score, less work')}
        {box('later', 'Lower score, more work')}
      </div>
      <p className="sx-note">
        Impact is the score: high means at or above the median of the open queue ({n(median, 1)}). Effort runs from 1 (an edit to an existing article) to 4 (a new pillar or sector page); improving a page is one step less than writing it. High effort is 3 or more.
      </p>
    </>
  );
}
