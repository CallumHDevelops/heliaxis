import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSetting, searchSession } from '@/lib/search/server';
import { can } from '@/lib/search/settings';
import { cmsAdminEditSlug } from '@/lib/blog/cms-ai-blogs';
import { contentRules, getContent, ourPages, proofGate, site, townNames, type ContentRow, type PublishInfo } from '@/lib/search/studio/server';
import { canPublish, canSubmit } from '@/lib/search/studio/checks';
import { DNOS, normaliseProof } from '@/lib/search/studio/proof';
import { suggestEdits } from '@/lib/search/studio/refresh';
import { blocksText, articleText } from '@/lib/search/studio/text';
import { MEASURE_DAYS, addDaysIso } from '@/lib/search/studio/measure';
import { STATUS_LABEL, type Brief, type Checks, type Draft } from '@/lib/search/studio/types';
import { BrandIcon } from '@/app/admin/crm/CrmUi';
import { dateLabel, n, PageHead, Pos } from '../../common';
import { BriefTools, DraftEditor, ProofForm, RecordRefresh, ReviewBar, RunChecks, WriteDraft } from '../StudioClient';
import '../content.css';

export const dynamic = 'force-dynamic';
// Writing the draft on the strongest model can take a couple of minutes (the server action runs under this page).
export const maxDuration = 300;

type M = { day: number; measured_at: string; best_pos: number | null; impressions: number | null; clicks: number | null; enquiries: number | null };
type Pkg = { id: string; name: string; min_panels: number; panel_watts: number | null; usable_kwh: number | null; price_inc_vat: number | null; active: boolean };

const STEPS = ['Brief', 'Proof pack', 'Draft', 'Checks', 'Approval', 'Measures'];
const stepOf = (c: ContentRow) => (c.status === 'brief' ? 0 : c.status === 'proof' || c.status === 'drafting' ? 1 : c.status === 'draft' ? 3 : c.status === 'in_review' || c.status === 'approved' ? 4 : c.status === 'published' ? 5 : 0);

export default async function ContentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const id = Number(raw);
  if (!Number.isFinite(id)) notFound();
  const db = createAdminClient();
  let c: ContentRow;
  try {
    c = await getContent(id, db);
  } catch {
    notFound();
  }
  const session = await searchSession();
  const role = session?.role ?? 'viewer';
  const canDraft = can.draft(role);
  const canPub = can.publish(role);
  const brief = (c.brief as Brief)?.target ? (c.brief as Brief) : null;
  const proof = normaliseProof(c.proof);
  const draft = (c.draft as Draft)?.kind ? (c.draft as Draft) : null;
  const checks = (c.checks as Checks & { published?: PublishInfo; error?: string }) ?? null;
  const hasChecks = !!checks?.results?.length;

  const [gate, rules, author, pkgRes, measRes, pages, towns] = await Promise.all([
    proofGate(c, db),
    contentRules(db),
    getSetting('author', db),
    db.from('pv_packages').select('id, name, min_panels, panel_watts, usable_kwh, price_inc_vat, active').order('display_order'),
    db.from('seo_content_measure').select('day, measured_at, best_pos, impressions, clicks, enquiries').eq('content_id', id).order('day'),
    c.mode === 'refresh' ? ourPages() : Promise.resolve([]),
    c.mode === 'refresh' ? townNames(db) : Promise.resolve([] as string[]),
  ]);
  const packages = ((pkgRes.data ?? []) as Pkg[]).map((p) => ({ id: p.id, name: p.name, price: p.price_inc_vat == null ? null : Number(p.price_inc_vat), kwp: p.panel_watts ? Math.round(((p.min_panels * p.panel_watts) / 1000) * 100) / 100 : null, usableKwh: p.usable_kwh == null ? null : Number(p.usable_kwh), active: p.active }));
  const measures = (measRes.data ?? []) as M[];
  const locked = ['in_review', 'approved', 'published', 'rejected'].includes(c.status);
  const step = stepOf(c);
  const failing = (checks?.results ?? []).filter((r) => r.blocking && !r.ok && r.key !== 'limit').length;
  const submit = canSubmit(c.status, checks);
  const publish = canPublish(c, role, checks);
  const live = c.mode === 'refresh' ? pages.find((p) => p.path === c.slug) : undefined;
  const suggestions = live && brief ? suggestEdits({ brief, html: live.html, title: live.title, description: live.description, path: live.path, site: site(), towns, schemaTypes: live.schemaTypes }) : [];

  return (
    <>
      <PageHead
        title={c.title || 'Untitled page'}
        sub={
          <>
            {c.mode === 'refresh' ? 'Refresh of a live page' : c.kind === 'blog' ? 'Blog article' : 'Website page'} · {STATUS_LABEL[c.status]} · started by {c.created_by ?? 'someone'} on {dateLabel(c.created_at)}
          </>
        }
        fresh={
          <>
            Writing cost: <b>${Number(c.cost_usd ?? 0).toFixed(3)}</b>
            <br />
            <Link className="crm-link" href="/admin/search/content">
              All pages
            </Link>
          </>
        }
      />
      <ol className="sc-steps" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} className={i < step || c.status === 'published' ? 'done' : i === step ? 'now' : ''}>
            {s}
          </li>
        ))}
      </ol>
      {checks?.error && <p className="sx-card sc-msg bad">{checks.error}</p>}

      {/* 1. Brief */}
      <section className="sx-card sc-section">
        <h2>
          <BrandIcon k="clipboard" /> Brief
        </h2>
        {!brief ? (
          <p className="sx-note">No brief.</p>
        ) : (
          <>
            <p>
              <b>{brief.target.primary}</b>
              {brief.target.phrases.length > 1 && <span className="sx-note"> · also {brief.target.phrases.filter((p) => p !== brief.target.primary).join(', ')}</span>}
            </p>
            <p className="sx-note">
              {brief.audience} Intent: {brief.target.intent.replace('_', ' ')} · type: {brief.target.pageType.replace('_', ' ')}
              {brief.target.town ? ` · ${brief.target.town}` : ''} · {brief.target.action === 'improve' ? `improve ${brief.target.targetPage ?? ''}` : 'new page'}
            </p>
            <p className="sx-note">
              Built {dateLabel(brief.generatedAt)} from: SERP of {brief.sources.serpDate ? dateLabel(brief.sources.serpDate) : 'none yet'} · teardown {brief.sources.teardownDate ? dateLabel(brief.sources.teardownDate) : 'none yet'} · page facts for {brief.sources.factsPages} of {brief.top10.length} top pages · {brief.sources.paa} People Also Ask.
            </p>
            {brief.notes.length > 0 && (
              <ul className="sc-outline">
                {brief.notes.map((x) => (
                  <li key={x}>
                    <small>{x}</small>
                  </li>
                ))}
              </ul>
            )}
            <div className="sx-grid2" style={{ marginTop: 12 }}>
              <div>
                <h3>Outline</h3>
                <ol className="sc-outline">
                  {brief.outline.map((o) => (
                    <li key={o.h2}>
                      {o.h2} <small>· {o.why}</small>
                    </li>
                  ))}
                </ol>
                {brief.questions.length > 0 && (
                  <>
                    <h3>Questions to answer</h3>
                    <ul className="sc-outline">
                      {brief.questions.map((q) => (
                        <li key={q}>{q}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
              <div>
                <h3>Length</h3>
                <p className="sx-note">
                  {n(brief.words.min)} to {n(brief.words.max)} words. {brief.words.note}
                </p>
                <h3>Schema</h3>
                <p className="sx-note">{brief.schema.join(', ')}</p>
                <h3>Call to action</h3>
                <p className="sx-note">
                  {brief.cta.label} → {brief.cta.href}
                </p>
                <h3>Links out (from this page)</h3>
                <ul className="sc-outline">
                  {brief.linksOut.map((l) => (
                    <li key={l.path}>
                      {l.path} <small>· {l.why}</small>
                    </li>
                  ))}
                  {!brief.linksOut.length && <li className="sx-note">None of our pages match yet.</li>}
                </ul>
                <h3>Links in (add a link to this page from)</h3>
                <ul className="sc-outline">
                  {brief.linksIn.map((l) => (
                    <li key={l.path}>
                      {l.path} <small>· {l.why}</small>
                    </li>
                  ))}
                  {!brief.linksIn.length && <li className="sx-note">No close matches; link from the service pillar by hand.</li>}
                </ul>
              </div>
            </div>
            {brief.top10.length > 0 && (
              <details style={{ marginTop: 10 }}>
                <summary>The top 10 it was built from</summary>
                <div className="sx-tablewrap">
                  <table className="sx-table">
                    <thead>
                      <tr>
                        <th className="num">Pos</th>
                        <th>Page</th>
                        <th className="num">Words</th>
                      </tr>
                    </thead>
                    <tbody>
                      {brief.top10.map((t) => (
                        <tr key={`${t.pos}-${t.url}`}>
                          <td className="num">{t.pos}</td>
                          <td>
                            {t.title ?? t.url}
                            <br />
                            <small className="sx-note">{t.domain}</small>
                          </td>
                          <td className="num">{n(t.words)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
            {c.mode === 'new' && (
              <details style={{ marginTop: 10 }} open={c.status === 'brief'}>
                <summary>Edit the brief</summary>
                <BriefTools id={id} status={c.status} outline={brief.outline.map((o) => o.h2)} min={brief.words.min} max={brief.words.max} kind={c.kind} pageType={brief.target.pageType} canEdit={canDraft} />
              </details>
            )}
          </>
        )}
      </section>

      {/* 2. Proof pack (new pages) */}
      {c.mode === 'new' && c.status !== 'brief' && (
        <section className="sx-card sc-section">
          <h2>
            <BrandIcon k="shield" /> Proof pack {gate.ready ? <span className="sx-state done">ready</span> : <span className="sx-state action">drafting locked</span>}
          </h2>
          <p className="sx-note">
            Heliaxis-only facts. Drafting is locked until the required items are in ({rules.requiredProof ? 'from Settings › Content rules' : 'the default list'}). Author: {author.name}
            {author.role ? `, ${author.role}` : ''} (Settings › Author{author.bio ? '' : ': add a bio there'}).
          </p>
          <ul className="sx-list">
            {gate.items
              .filter((i) => i.required || i.done)
              .map((i) => (
                <li key={i.key}>
                  <span>
                    {i.label} {i.required ? '' : <small>(optional)</small>}
                  </span>
                  <span>
                    <small>{i.detail}</small> <span className={`sx-state ${i.done ? 'done' : 'action'}`}>{i.done ? 'in' : 'missing'}</span>
                  </span>
                </li>
              ))}
          </ul>
          <details style={{ marginTop: 10 }} open={!gate.ready && !locked}>
            <summary>Fill the proof pack</summary>
            <ProofForm id={id} proof={proof} packages={packages} dnos={DNOS} locked={locked || !canDraft} />
          </details>
        </section>
      )}

      {/* 3. Draft, or refresh suggestions */}
      {c.mode === 'new' && c.status !== 'brief' && (
        <section className="sx-card sc-section">
          <h2>
            <BrandIcon k="document" /> Draft
          </h2>
          {draft ? (
            <p className="sx-note">
              Written by {draft.model} on {dateLabel(draft.writtenAt)}
              {draft.writtenBy ? ` for ${draft.writtenBy}` : ''}
              {draft.editedBy ? `; last edited by ${draft.editedBy} on ${dateLabel(draft.editedAt)}` : ''}. Goes live at {c.slug}.
            </p>
          ) : (
            <p className="sx-note">{gate.ready ? 'Ready to write. It answers the search in the first two sentences, works an example with its assumptions, and dates every figure.' : `Locked until the proof pack has: ${gate.missing.join(', ')}.`}</p>
          )}
          {!locked && <WriteDraft id={id} ready={gate.ready} hasDraft={!!draft} failing={failing} canEdit={canDraft} />}
          {draft && <DraftPreview draft={draft} />}
          {draft && c.status === 'draft' && (
            <details style={{ marginTop: 10 }}>
              <summary>Edit the draft</summary>
              <DraftEditor id={id} title={draft.title} description={draft.description} slug={draft.slug} schema={draft.schema} body={JSON.stringify(draft.kind === 'blog' ? draft.article : draft.blocks, null, 2)} canEdit={canDraft} isBlog={draft.kind === 'blog'} />
            </details>
          )}
        </section>
      )}
      {c.mode === 'refresh' && (
        <section className="sx-card sc-section">
          <h2>
            <BrandIcon k="trending" /> Suggested edits ({suggestions.length})
          </h2>
          {!live ? (
            <p className="sx-note">{c.slug} is not in the website editor’s live snapshot.</p>
          ) : (
            <>
              <p className="sx-note">
                Section edits from the latest brief, not a rewrite. Make them in the{' '}
                <Link className="crm-link" href={`/admin/cms/${encodeURIComponent(cmsAdminEditSlug(live.title, live.path))}`}>
                  website editor
                </Link>
                , publish there, then record the refresh below so the measures restart.
              </p>
              <ul className="sx-list">
                {suggestions.map((s) => (
                  <li key={s.title}>
                    <span>
                      <b>{s.title}</b>
                      <br />
                      <small>{s.detail}</small>
                    </span>
                    <span className="sx-chip">{s.kind}</span>
                  </li>
                ))}
                {!suggestions.length && <li className="sx-note">Nothing to suggest: the page already covers what the top 10 share.</li>}
              </ul>
            </>
          )}
        </section>
      )}

      {/* 4. Checks */}
      {(draft || c.mode === 'refresh') && (
        <section className="sx-card sc-section">
          <div className="sx-row" style={{ justifyContent: 'space-between' }}>
            <h2>
              <BrandIcon k="check" /> Checks {hasChecks && (checks.ok ? <span className="sx-state done">all blocking checks pass</span> : <span className="sx-state action">blocked</span>)}
            </h2>
            {canDraft && c.status !== 'published' && <RunChecks id={id} label={hasChecks ? 'Run again' : 'Run the checks'} />}
          </div>
          {hasChecks ? (
            <>
              <p className="sx-note">Last run {new Date(checks.ranAt).toLocaleString('en-GB', { timeZone: 'Europe/London' })}. Blocking checks stop publishing; the rest is advice.</p>
              {checks.results.map((r) => (
                <div className="sc-check" key={r.key}>
                  <span className={`sx-state ${r.ok ? 'done' : r.blocking ? 'action' : 'manual'}`}>{r.ok ? 'pass' : r.blocking ? 'blocks' : 'advice'}</span>
                  <div>
                    <b>{r.label}</b> <span className="sx-note">{r.detail}</span>
                    {r.issues.length > 0 && (
                      <ul>
                        {r.issues.slice(0, 12).map((i, k) => (
                          <li key={k}>
                            {i.text} {i.where && <q>{i.where}</q>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ))}
            </>
          ) : (
            <p className="sx-note">Not run yet.</p>
          )}
        </section>
      )}

      {/* 5. Approve and publish */}
      {(draft || c.mode === 'refresh') && (
        <section className="sx-card sc-section">
          <h2>
            <BrandIcon k="award" /> {c.mode === 'refresh' ? 'Record the refresh' : 'Approve and publish'}
          </h2>
          {c.status === 'published' && checks?.published ? (
            <p className="sx-note">
              Live at{' '}
              <a className="crm-link" href={checks.published.url} target="_blank" rel="noreferrer">
                {checks.published.path}
              </a>{' '}
              since {dateLabel(checks.published.at)}, approved by {c.approved_by}. Sitemap: {checks.published.inSitemap ? 'listed (from the website editor’s live snapshot)' : 'not found in the snapshot'}. IndexNow: {checks.published.indexNow}
            </p>
          ) : c.mode === 'refresh' ? (
            <RecordRefresh id={id} canPublish={canPub} />
          ) : c.status === 'rejected' ? (
            <p className="sx-note">Rejected.</p>
          ) : (
            <>
              <p className="sx-note">Editors send it for approval once every blocking check passes; an admin approves and publishes. Publishing adds it to the sitemap, pings IndexNow for Bing and records the day-0 baseline.</p>
              <ReviewBar id={id} status={c.status} canDraft={canDraft} canPublish={canPub} submitWhy={submit.ok ? null : submit.why} publishWhy={publish.ok ? null : publish.why} />
            </>
          )}
        </section>
      )}

      {/* 6. Measures */}
      {c.status === 'published' && c.published_at && (
        <section className="sx-card sc-section">
          <h2>
            <BrandIcon k="chart" /> Measures
          </h2>
          <div className="sx-tablewrap">
            <table className="sx-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Date</th>
                  <th className="num">Best position</th>
                  <th className="num">Impressions</th>
                  <th className="num">Clicks</th>
                  <th className="num">Enquiries</th>
                </tr>
              </thead>
              <tbody>
                {[0, ...MEASURE_DAYS].map((d) => {
                  const m = measures.find((x) => x.day === d);
                  return (
                    <tr key={d}>
                      <td>{d === 0 ? 'Baseline' : `Day ${d}`}</td>
                      <td>{m ? dateLabel(m.measured_at) : <span className="sx-note">due {dateLabel(addDaysIso(c.published_at!, d))}</span>}</td>
                      <td className="num">{m ? <Pos p={m.best_pos} /> : '–'}</td>
                      <td className="num">{m ? n(m.impressions) : '–'}</td>
                      <td className="num">{m ? n(m.clicks) : '–'}</td>
                      <td className="num">{m ? n(m.enquiries) : '–'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="sx-note">
            Best position across the page’s searches in the week up to that day (seo_serp_result; the baseline is the two weeks before publishing). Impressions and clicks: Search Console for this page over the 28 days up to that day (14 at day 14; the baseline is the 28 days before). Enquiries: enquiries.landing_path = {c.published_ref}, since publishing (the baseline: the 28 days before). Measured daily; a page with no movement by day 90 goes back to the planner as Improve.
          </p>
        </section>
      )}
    </>
  );
}

function DraftPreview({ draft }: { draft: Draft }) {
  if (draft.kind === 'blog') {
    const a = draft.article ?? {};
    const t = articleText(a);
    return (
      <div className="sc-preview">
        <span className="sc-blocktype">Article</span>
        <h3>{String(a.headline ?? draft.title)}</h3>
        <p>{t.text.slice(0, 2400)}{t.text.length > 2400 ? '…' : ''}</p>
      </div>
    );
  }
  return (
    <div className="sc-preview">
      {(draft.blocks ?? []).map((b, i) => {
        const t = blocksText([b]);
        const p = b.p as Record<string, unknown>;
        const head = String(p.title || p.headline || '');
        return (
          <div key={b.id ?? i}>
            <span className="sc-blocktype">{b.t}</span>
            {head && <h3>{head}</h3>}
            <p>{t.text.slice(0, 600)}{t.text.length > 600 ? '…' : ''}</p>
          </div>
        );
      })}
    </div>
  );
}
