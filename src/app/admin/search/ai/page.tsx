import { createAdminClient } from '@/lib/supabase/admin';
import { budget, getSetting, searchSession } from '@/lib/search/server';
import { can } from '@/lib/search/settings';
import { enabledEngines, estimateRun } from '@/lib/search/ai/sampler';
import { domainOf, ENGINE_LABEL, ENGINES, FLAG_LABEL, type AccuracyFlag } from '@/lib/search/ai/parse';
import { proposePrompts } from '@/lib/search/ai/prompts';
import { monthTotal, overviewByMonth, rivalCounts, RUNS, shareByEngineMonth, topCitedDomains, type AnswerRow } from '@/lib/search/ai/report';
import { monthlyTrend, SOURCE_LABEL, type UploadRecord, type UploadSource } from '@/lib/search/ai/uploads';
import { CRAWLERS } from '@/lib/search/checklist';
import { dateLabel, n, PageHead } from '../common';
import { CrawlerPanel, DeleteUpload, PromptEditor, RunControls, UploadPanel, type PromptRow } from './AiClient';
import './ai.css';

export const dynamic = 'force-dynamic';
// "Run now" and "Ask the next batch now" ask up to a few minutes of questions inside the server action.
export const maxDuration = 300;

type Run = { id: number; month: string; started_at: string; finished_at: string | null; status: string; answers: number; cost_usd: number; error: string | null };
type Answer = AnswerRow & { id: number; model: string | null; cost_usd: number; run_id: number | null };
type Prompt = { id: number; prompt: string; town: string | null; service: string | null; kind: 'local' | 'consideration'; active: boolean };

const monthLabel = (m: string) => new Date(`${m.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
const eng = (e: string) => ENGINE_LABEL[e] ?? e;

export default async function AiAnswers() {
  const db = createAdminClient();
  const session = await searchSession();
  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - 12, 1);
  const sinceDate = since.toISOString().slice(0, 10);

  const [promptsRes, runsRes, answersRes, compsRes, firmsRes, aioRes, uploadsRes, areas, biz, b] = await Promise.all([
    db.from('ai_prompt').select('id, prompt, town, service, kind, active').order('active', { ascending: false }).order('kind').order('id'),
    db.from('ai_run').select('*').order('started_at', { ascending: false }).limit(12),
    db.from('ai_answer').select('id, run_id, prompt_id, engine, model, run_no, date, mentioned, cited, list_pos, rivals, cited_domains, accuracy_flags, cost_usd, error').gte('date', sinceDate).order('date', { ascending: false }).limit(20000),
    db.from('social_competitor').select('name, website').eq('is_self', false),
    db.from('seo_business').select('name, website, domain').eq('is_ours', false).limit(2000),
    db.from('seo_serp_result').select('date, aio_present, aio_cited, error').eq('device', 'mobile').gte('date', sinceDate).limit(50000),
    db.from('ai_upload').select('id, source, period, rows, uploaded_by, uploaded_at').order('uploaded_at'),
    getSetting('areas', db),
    getSetting('business', db),
    budget('dataforseo', db),
  ]);

  const prompts = (promptsRes.data ?? []) as Prompt[];
  const runs = (runsRes.data ?? []) as Run[];
  const answers = (answersRes.data ?? []) as Answer[];
  const lastRun = runs[0] ?? null;
  const running = runs.find((r) => r.status === 'running') ?? null;
  const promptText = new Map(prompts.map((p) => [p.id, p.prompt]));

  // The last run's answers, with their text, for reading.
  const shownRun = runs.find((r) => r.answers > 0 || r.status === 'running') ?? null;
  const { data: lastTexts } = shownRun ? await db.from('ai_answer').select('id, prompt_id, engine, run_no, model, text, mentioned, cited, list_pos, rivals, cited_domains, accuracy_flags, error').eq('run_id', shownRun.id).order('prompt_id').order('engine').order('run_no').limit(1000) : { data: [] };

  const engines = enabledEngines();
  const active = prompts.filter((p) => p.active);
  const estimateUsd = estimateRun(active.length, engines);
  const ukMonth = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }).slice(0, 7);
  const sampledThisMonth = runs.some((r) => r.month.startsWith(ukMonth) && r.status === 'done');
  const canSpend = session ? can.spend(session.role) : false;
  const canEdit = session ? can.draft(session.role) : false;

  const shares = shareByEngineMonth(answers);
  const months = [...new Set(shares.map((s) => s.month))];
  const latestMonth = months[0] ?? null;
  const total = latestMonth ? monthTotal(answers, latestMonth) : null;
  const prevTotal = months[1] ? monthTotal(answers, months[1]) : null;
  const rivalDomains = [...(compsRes.data ?? []).map((c) => domainOf(c.website)), ...(firmsRes.data ?? []).map((f) => domainOf(f.website || f.domain))].filter(Boolean);
  const domains = topCitedDomains(latestMonth ? answers.filter((a) => a.date.startsWith(latestMonth) || (months[1] && a.date.startsWith(months[1]))) : [], rivalDomains);
  const rivals = rivalCounts(latestMonth ? answers.filter((a) => a.date.startsWith(latestMonth)) : []);
  const failed = latestMonth ? answers.filter((a) => a.error && a.date.startsWith(latestMonth)).length : 0;
  const problems = answers
    .filter((a) => (a.accuracy_flags ?? []).length)
    .slice(0, 60)
    .flatMap((a) => (a.accuracy_flags as AccuracyFlag[]).map((f) => ({ a, f })));
  const overview = overviewByMonth((aioRes.data ?? []) as never);

  const perPrompt = new Map<number, { answers: number; mentioned: number }>();
  for (const a of answers) {
    if (a.error || (latestMonth && !a.date.startsWith(latestMonth))) continue;
    const e = perPrompt.get(a.prompt_id) ?? { answers: 0, mentioned: 0 };
    e.answers++;
    if (a.mentioned) e.mentioned++;
    perPrompt.set(a.prompt_id, e);
  }
  const allAnswers = new Map<number, number>();
  for (const a of answers) allAnswers.set(a.prompt_id, (allAnswers.get(a.prompt_id) ?? 0) + 1);
  const promptRows: PromptRow[] = prompts.map((p) => {
    const e = perPrompt.get(p.id);
    return { ...p, answers: allAnswers.get(p.id) ?? 0, mentionShare: e?.answers ? Math.round((e.mentioned / e.answers) * 100) : null };
  });
  const proposals = proposePrompts(areas.list, prompts.map((p) => p.prompt), { services: biz.services.filter((s) => /solar|batter|heat pump/i.test(s)) });

  const uploads = (uploadsRes.data ?? []) as (UploadRecord & { id: number; uploaded_by: string | null; uploaded_at: string })[];

  type TextRow = { id: number; prompt_id: number; engine: string; run_no: number; model: string | null; text: string | null; mentioned: boolean; cited: boolean; list_pos: number | null; rivals: string[]; cited_domains: string[]; accuracy_flags: AccuracyFlag[]; error: string | null };
  const byPrompt = new Map<number, TextRow[]>();
  for (const t of (lastTexts ?? []) as TextRow[]) byPrompt.set(t.prompt_id, [...(byPrompt.get(t.prompt_id) ?? []), t]);

  return (
    <>
      <PageHead
        title="AI answers"
        sub="How often AI assistants name and cite Heliaxis for local questions, and which sources they rely on. Every figure here is an API sample: the ChatGPT, Gemini, Perplexity and Claude apps can answer the same question differently."
        fresh={lastRun ? <>Last run <b>{dateLabel(lastRun.started_at, true)}</b><br />{lastRun.status === 'running' ? 'still asking' : lastRun.status}</> : 'No run yet'}
      />

      <section className="sx-card">
        <div className="sx-row" style={{ justifyContent: 'space-between' }}>
          <h2>This month’s sample</h2>
          <span className="sx-note">Runs by itself on the 3rd of each month</span>
        </div>
        <p>
          Each active question ({active.length}) is asked {RUNS} times on each connected engine:{' '}
          {engines.length ? engines.map(eng).join(', ') : 'none yet'}
          {ENGINES.filter((e) => !engines.includes(e)).length ? ` (not connected: ${ENGINES.filter((e) => !engines.includes(e)).map(eng).join(', ')}; Claude needs ANTHROPIC_API_KEY, the others DataForSEO)` : ''}. ChatGPT, Gemini and Perplexity come through DataForSEO, about ${estimateUsd.toFixed(2)} a run
          (estimate; ${b.spent.toFixed(2)} of the ${b.cap.toFixed(0)} DataForSEO cap spent this month). Claude comes through our Anthropic account under the AI spend cap.
        </p>
        {running && (
          <p>
            <b>Run under way:</b> {running.answers} answers saved since {dateLabel(running.started_at, true)} (about {active.length * engines.length * RUNS} in all). The dispatcher asks the next batch every 10 minutes.
          </p>
        )}
        {lastRun?.error && <p className="sx-note">Last run: {lastRun.error}</p>}
        <RunControls running={!!running} canSpend={canSpend} canOverride={session ? can.overrideCap(session.role) : false} estimateUsd={estimateUsd} wouldPassCap={b.spent + estimateUsd > b.cap} sampledThisMonth={sampledThisMonth} />
      </section>

      <section className="sx-tiles" aria-label="Latest month">
        <article className="sx-tile" title="Answers that name Heliaxis, all engines">
          <span className="sx-tile__label">Names us</span>
          <span className="sx-tile__value">{total ? `${n(total.mentionShare, 1)}%` : '–'}</span>
          <span className="sx-tile__note">{total ? `of ${total.answers} answers, ${monthLabel(latestMonth!)}${prevTotal ? ` (was ${n(prevTotal.mentionShare, 1)}%)` : ''} · API sample` : 'No answers yet'}</span>
        </article>
        <article className="sx-tile" title="Answers that link to a heliaxis.co.uk page">
          <span className="sx-tile__label">Cites our site</span>
          <span className="sx-tile__value">{total ? `${n(total.citeShare, 1)}%` : '–'}</span>
          <span className="sx-tile__note">{total ? `of ${total.answers} answers${prevTotal ? ` (was ${n(prevTotal.citeShare, 1)}%)` : ''} · API sample` : 'No answers yet'}</span>
        </article>
        <article className="sx-tile" title="Facts about us an answer got wrong (credentials, phone, area, website)">
          <span className="sx-tile__label">Wrong facts</span>
          <span className="sx-tile__value">{latestMonth ? problems.filter((p) => p.a.date.startsWith(latestMonth)).length : '–'}</span>
          <span className="sx-tile__note">checked against Settings › Business facts</span>
        </article>
        <article className="sx-tile" title="Answers that failed to come back">
          <span className="sx-tile__label">Failed calls</span>
          <span className="sx-tile__value">{latestMonth ? failed : '–'}</span>
          <span className="sx-tile__note">left out of the shares</span>
        </article>
      </section>

      <section className="sx-card">
        <h2>Mention share and citation share by engine</h2>
        {!shares.length ? (
          <p>No answers yet. The first run is on the 3rd of the month, or press Run now above.</p>
        ) : (
          <div className="sx-tablewrap">
            <table className="sx-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Engine</th>
                  <th className="num">Answers</th>
                  <th className="num">Names us</th>
                  <th className="num">Cites our site</th>
                  <th className="num">Our average place in lists</th>
                </tr>
              </thead>
              <tbody>
                {shares.map((s) => (
                  <tr key={`${s.month}${s.engine}`}>
                    <td>{monthLabel(s.month)}</td>
                    <td>{eng(s.engine)}</td>
                    <td className="num">{s.answers}</td>
                    <td className="num">
                      {n(s.mentionShare, 1)}% <span className="sx-note">({s.mentioned})</span>
                    </td>
                    <td className="num">
                      {n(s.citeShare, 1)}% <span className="sx-note">({s.cited})</span>
                    </td>
                    <td className="num">{s.avgListPos ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p>
          API sample. “Names us” means the answer says Heliaxis by name; “cites our site” means it links to a heliaxis.co.uk page. They are counted separately because engines often do one without the other. Shares are out of answers that came back; with {RUNS} runs per question
          they move a lot month to month, so read the trend, not one month.
        </p>
      </section>

      <section className="sx-card">
        <h2>Google AI Overview</h2>
        {!overview.length ? (
          <p>Comes from the weekly phone rankings run (Rankings). No runs in the last 12 months yet.</p>
        ) : (
          <div className="sx-tablewrap">
            <table className="sx-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th className="num">Search checks</th>
                  <th className="num">Overview shown</th>
                  <th className="num">Cites our site, when shown</th>
                </tr>
              </thead>
              <tbody>
                {overview.map((o) => (
                  <tr key={o.month}>
                    <td>{monthLabel(o.month)}</td>
                    <td className="num">{o.searches}</td>
                    <td className="num">
                      {n(o.shownShare, 1)}% <span className="sx-note">({o.shown})</span>
                    </td>
                    <td className="num">
                      {o.shown ? `${n(o.citedShareOfShown, 1)}%` : '–'} <span className="sx-note">({o.cited})</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p>From DataForSEO SERPs of every tracked search, each week on a phone (seo_serp_result). A search counts once per weekly check. See Rankings for each search.</p>
      </section>

      <div className="sx-grid2">
        <section className="sx-card">
          <h2>Sites the engines cite most</h2>
          {!domains.length ? (
            <p>No citations yet.</p>
          ) : (
            <div className="sx-tablewrap">
              <table className="sx-table">
                <thead>
                  <tr>
                    <th>Site</th>
                    <th className="num">Answers</th>
                    <th className="num">Questions</th>
                    <th>Engines</th>
                  </tr>
                </thead>
                <tbody>
                  {domains.map((d) => (
                    <tr key={d.domain}>
                      <td>
                        {d.domain}
                        {d.rival && <span className="sx-chip">rival</span>}
                      </td>
                      <td className="num">{d.answers}</td>
                      <td className="num">{d.prompts}</td>
                      <td>{d.engines.map(eng).join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p>Last two months, our own site left out. Directories, review sites and articles here are the places to get listed on or written up by; a rival’s own site is marked and is not a target.</p>
        </section>
        <section className="sx-card">
          <h2>Rivals named</h2>
          {!rivals.length ? (
            <p>No rivals named yet. Rivals are matched against Competitors and the businesses found in Local.</p>
          ) : (
            <ul className="sx-list">
              {rivals.map((r) => (
                <li key={r.name}>
                  <span>{r.name}</span>
                  <small>
                    {r.answers} answers ({n(r.share, 1)}%)
                  </small>
                </li>
              ))}
              {total && (
                <li className="ai-us">
                  <span>Heliaxis</span>
                  <small>{n(total.mentionShare, 1)}%</small>
                </li>
              )}
            </ul>
          )}
          <p>{latestMonth ? `${monthLabel(latestMonth)}, all engines. ` : ''}API sample.</p>
        </section>
      </div>

      <section className="sx-card" id="accuracy">
        <h2>Wrong facts about us</h2>
        {!problems.length ? (
          <p>No answer has got a fact about us wrong. Answers that name us are checked for credentials other than {biz.credentials.join(', ')}, a phone number other than {biz.phone}, a website other than ours, and a place we are not.</p>
        ) : (
          <ul className="sx-list">
            {problems.map(({ a, f }, i) => (
              <li key={`${a.id}-${i}`} className="ai-problem">
                <div>
                  <b>{FLAG_LABEL[f.code]}:</b> “{f.said}”
                  <div className="ai-quote">{f.quote}</div>
                  <small>
                    {eng(a.engine)}, {dateLabel(a.date)}, run {a.run_no}: “{promptText.get(a.prompt_id) ?? 'question removed'}”
                  </small>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p>Each new mistake also goes to Needs you. Fix the source the answer relies on (our site, the Business Profile, or the directory it cites); an item closes by itself when a later run no longer repeats it.</p>
      </section>

      <section className="sx-card">
        <h2>Questions ({active.length} asked)</h2>
        <p>Town × service questions (“who installs home batteries in Swansea?”) and consideration questions (“is solar worth it in Wales?”). Names us is for {latestMonth ? monthLabel(latestMonth) : 'the latest month'}.</p>
        <PromptEditor prompts={promptRows} proposals={proposals} canEdit={canEdit} />
      </section>

      {shownRun && (
        <section className="sx-card">
          <h2>Answers from the run of {dateLabel(shownRun.started_at)}</h2>
          {!byPrompt.size ? (
            <p>No answers saved for this run yet.</p>
          ) : (
            [...byPrompt.entries()].map(([pid, rows]) => (
              <details key={pid} className="ai-answers">
                <summary>
                  {promptText.get(pid) ?? 'Question removed'}{' '}
                  <span className="sx-note">
                    named in {rows.filter((r) => r.mentioned).length} of {rows.filter((r) => !r.error).length}
                  </span>
                </summary>
                {rows.map((r) => (
                  <div key={r.id} className="ai-answer">
                    <div className="sx-row">
                      <b>
                        {eng(r.engine)} {r.run_no}
                      </b>
                      {r.model && <span className="sx-note">{r.model}</span>}
                      {r.error ? <span className="sx-chip">failed: {r.error}</span> : null}
                      {r.mentioned && <span className="sx-chip gold">names us{r.list_pos ? `, #${r.list_pos}` : ''}</span>}
                      {r.cited && <span className="sx-chip gold">cites our site</span>}
                      {(r.accuracy_flags ?? []).map((f) => (
                        <span key={f.code + f.said} className="sx-chip">
                          wrong: {f.said}
                        </span>
                      ))}
                    </div>
                    {!!r.rivals?.length && <small className="sx-note">Rivals: {r.rivals.join(', ')}</small>}
                    {!!r.cited_domains?.length && <small className="sx-note">Cites: {r.cited_domains.join(', ')}</small>}
                    {r.text && <div className="ai-text">{r.text}</div>}
                  </div>
                ))}
              </details>
            ))
          )}
        </section>
      )}

      <section className="sx-card">
        <h2>Search Console and Bing AI reports</h2>
        <p>
          Neither report has an API yet, so upload the CSV export once a month: Search Console › Generative AI (impressions in AI Overviews and AI Mode, by date or page; no queries or clicks) and Bing Webmaster Tools › AI Performance (Copilot citations, with
          grounding queries). A new upload replaces the same month.
        </p>
        <UploadPanel canEdit={canEdit} />
        <div className="sx-grid2">
          {(['gsc_genai', 'bing_ai'] as UploadSource[]).map((src) => {
            const t = monthlyTrend(uploads, src);
            return (
              <div key={src}>
                <h3 className="ai-h3">{SOURCE_LABEL[src]}</h3>
                {!t.months.length ? (
                  <p className="sx-note">No upload yet.</p>
                ) : (
                  <div className="sx-tablewrap">
                    <table className="sx-table">
                      <thead>
                        <tr>
                          <th>Month</th>
                          {t.measures.map((m) => (
                            <th key={m} className="num">
                              {m.replace(/_/g, ' ')}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...t.months].reverse().map((m) => (
                          <tr key={m}>
                            <td>{monthLabel(m)}</td>
                            {t.measures.map((k) => (
                              <td key={k} className="num">
                                {n(t.totals[m][k] ?? null, 1)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {!!uploads.length && (
          <ul className="sx-list">
            {[...uploads].reverse().map((u) => (
              <li key={u.id}>
                <span>
                  {SOURCE_LABEL[u.source]}, {u.period} <small>({u.rows.length} rows)</small>
                </span>
                <span className="sx-row">
                  <small>
                    {u.uploaded_by ?? 'Someone'}, {dateLabel(u.uploaded_at)}
                  </small>
                  {canEdit && <DeleteUpload id={u.id} />}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p>Totals are the sum of the file’s rows for each month (rates such as CTR are summed too, so read those per row in the export). Rows with dates count in their own month; a by-page file counts in the month picked when it was uploaded.</p>
      </section>

      <section className="sx-card">
        <h2>Crawler access</h2>
        <p>
          Reads robots.txt, then fetches the home page as {CRAWLERS.join(', ')} and as an ordinary browser. These fetches come from our server under the crawler’s name, so a block here can mean the Vercel firewall turns away look-alikes rather than the real crawler:
          confirm in Search Console or Bing before changing anything. The site has no Cloudflare and uses Vercel’s default rules.
        </p>
        <CrawlerPanel />
      </section>
    </>
  );
}
