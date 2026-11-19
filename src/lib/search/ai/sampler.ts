import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { dfs, dfsConfigured } from '@/lib/dataforseo/client';
import { callCostUsd } from '@/lib/social/costs';
import { recordUsage } from '@/lib/social/usage';
import { aiSpendThisMonthGbp, GEO_MODEL } from '@/lib/social/competitors/geo-run';
import { budget, checkCap, getSetting } from '../server';
import { clearAction, raiseAction } from '../inbox';
import { analyseAnswer, factAction, readClaudeBlocks, readDfsTask, type Engine, type Facts, type Reply, type Rival } from './parse';
import { DFS_ANSWER_USD, remainingWork, RUNS, type WorkItem } from './report';

/**
 * M6 sampler (spec §5 M6, §7). On the 3rd of the month a run opens; each dispatcher tick then asks a bounded batch of
 * questions until every active question has been asked 3 times on every engine. Claude goes through the Anthropic
 * account with web search, as the old sampler did, under the social AI cap; ChatGPT, Gemini and Perplexity go through
 * DataForSEO LLM Responses (live, one task per call) under the DataForSEO cap, with a pre-flight estimate. Every
 * answer is an "API sample": the consumer apps can answer differently.
 */

type Db = ReturnType<typeof createAdminClient>;

const CLAUDE_SEARCH_USD = 0.01;
const OVERRIDE_NOTE = 'Owner override: may pass the cap';
const CONCURRENCY = 8;
const MAX_PER_STEP = 40;
/** A live LLM Responses task can take up to 120 s; never start a batch that might not finish before the deadline. */
const SLOWEST_MS = 130_000;

const DFS: Record<Exclude<Engine, 'claude'>, { path: string; body: (prompt: string) => Record<string, unknown> }> = {
  chatgpt: {
    path: '/ai_optimization/chat_gpt/llm_responses/live',
    body: (p) => ({ user_prompt: p, model_name: process.env.SEARCH_AI_MODEL_CHATGPT || 'gpt-4.1-mini', web_search: true, web_search_country_iso_code: 'GB' }),
  },
  gemini: {
    path: '/ai_optimization/gemini/llm_responses/live',
    body: (p) => ({ user_prompt: p, model_name: process.env.SEARCH_AI_MODEL_GEMINI || 'gemini-2.5-flash', web_search: true }),
  },
  perplexity: {
    path: '/ai_optimization/perplexity/llm_responses/live',
    body: (p) => ({ user_prompt: p, model_name: process.env.SEARCH_AI_MODEL_PERPLEXITY || 'sonar', web_search_country_iso_code: 'GB' }),
  },
};

/** Engines that can run: Claude needs ANTHROPIC_API_KEY, the rest need DataForSEO. */
export function enabledEngines(): Engine[] {
  return [...(process.env.ANTHROPIC_API_KEY ? (['claude'] as const) : []), ...(dfsConfigured() ? (['chatgpt', 'gemini', 'perplexity'] as const) : [])];
}

const ukDate = (d: Date | string = new Date()) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
const ukMonth = (d: Date = new Date()) => `${ukDate(d).slice(0, 7)}-01`;

export const estimateRun = (prompts: number, engines: Engine[]) => Math.round(prompts * RUNS * engines.filter((e) => e !== 'claude').length * DFS_ANSWER_USD * 100) / 100;

async function askClaude(prompt: string): Promise<Reply> {
  const res = await new Anthropic().messages.create(
    {
      model: GEO_MODEL,
      max_tokens: 2000,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3, user_location: { type: 'approximate', country: 'GB', timezone: 'Europe/London' } }] as never,
      messages: [{ role: 'user', content: prompt }],
    },
    { timeout: 60_000 },
  );
  const { text, urls } = readClaudeBlocks(res.content as never);
  const searches = (res.usage as unknown as { server_tool_use?: { web_search_requests?: number } }).server_tool_use?.web_search_requests ?? 0;
  await recordUsage('geo', res.model, res.usage, searches * CLAUDE_SEARCH_USD);
  return { text, urls, model: res.model, costUsd: callCostUsd(res.model, res.usage) + searches * CLAUDE_SEARCH_USD };
}

async function askDfs(engine: Exclude<Engine, 'claude'>, prompt: string): Promise<Reply> {
  const e = DFS[engine];
  const { tasks } = await dfs(e.path, [e.body(prompt)], { module: 'm6', timeoutMs: SLOWEST_MS });
  const t = tasks[0];
  if (!t || t.status_code !== 20000) throw new Error(t?.status_message || 'No task came back');
  return readDfsTask(t);
}

/** What the answers are checked against: Business facts, the target areas, and every rival we know by name. */
async function context(db: Db): Promise<{ facts: Facts; rivals: Rival[] }> {
  const [biz, areas, comps, firms] = await Promise.all([
    getSetting('business', db),
    getSetting('areas', db),
    db.from('social_competitor').select('name, website').eq('is_self', false),
    db.from('seo_business').select('name, website, domain').eq('is_ours', false).limit(2000),
  ]);
  const places = [biz.area, biz.address, ...areas.list.flatMap((a) => [a.name, a.region, ...a.towns])]
    .flatMap((p) => String(p ?? '').split(/,| and /))
    .map((p) => p.replace(/\(.*?\)/g, '').trim())
    .filter((p) => p.length >= 3);
  const rivals: Rival[] = [
    ...((comps.data ?? []) as { name: string; website: string | null }[]),
    ...((firms.data ?? []) as { name: string; website: string | null; domain: string | null }[]).map((f) => ({ name: f.name, website: f.website || f.domain })),
  ];
  return { facts: { name: biz.name, phone: biz.phone, credentials: biz.credentials, website: biz.website, places }, rivals };
}

type Run = { id: number; month: string; started_at: string; status: string; error: string | null };

/** 3rd of the month (or "Run now"): open this month's run. The work list is every active question × engine × 3, less what is saved. */
export async function startAiSampling(db: Db = createAdminClient(), opts: { override?: boolean; again?: boolean; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const month = ukMonth(now);
  const { data: runs } = await db.from('ai_run').select('id, status').eq('month', month).order('started_at', { ascending: false });
  const open = (runs ?? []).find((r) => r.status === 'running');
  if (open) return { started: false, runId: open.id as number, reason: 'A run is already going.' };
  if ((runs ?? []).some((r) => r.status === 'done') && !opts.again) return { started: false, reason: 'This month has been sampled.' };
  const engines = enabledEngines();
  if (!engines.length) return { started: false, reason: 'No engine is connected (ANTHROPIC_API_KEY or DataForSEO).' };
  const { count } = await db.from('ai_prompt').select('id', { count: 'exact', head: true }).eq('active', true);
  if (!count) return { started: false, reason: 'No active questions.' };
  const estimateUsd = estimateRun(count, engines);
  try {
    await checkCap(estimateUsd, { override: opts.override }, db);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Over the cap';
    await db.from('ai_run').insert({ month, status: 'failed', finished_at: now.toISOString(), error: msg });
    await raiseAction({ kind: 'budget', ref: `ai_run:${month}`, title: 'AI answer sampling did not start: it would pass the DataForSEO cap', why: msg, fixHref: '/admin/search/ai' }, db);
    return { started: false, reason: msg, estimateUsd };
  }
  const { data, error } = await db
    .from('ai_run')
    .insert({ month, status: 'running', error: opts.override ? OVERRIDE_NOTE : null })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return { started: true, runId: data.id as number, estimateUsd, items: count * engines.length * RUNS };
}

async function closeRun(run: Run, db: Db, note?: string, status: 'done' | 'failed' = 'done') {
  const { data } = await db.from('ai_answer').select('cost_usd, error, engine, accuracy_flags').eq('run_id', run.id);
  const rows = (data ?? []) as { cost_usd: number; error: string | null; engine: string; accuracy_flags: { code: never; said: string; quote: string }[] }[];
  const error = [run.error === OVERRIDE_NOTE ? OVERRIDE_NOTE : null, note].filter(Boolean).join(' · ') || null;
  await db
    .from('ai_run')
    .update({ status, finished_at: new Date().toISOString(), answers: rows.filter((r) => !r.error).length, cost_usd: rows.reduce((a, r) => a + Number(r.cost_usd ?? 0), 0), error })
    .eq('id', run.id);
  // Wrong facts that no answer repeated this month close by themselves.
  if (status === 'done' && !note) {
    const live = new Set(rows.flatMap((r) => (r.accuracy_flags ?? []).map((f) => factAction(r.engine, f, '').ref)));
    const { data: open } = await db.from('seo_action').select('ref').eq('kind', 'ai_fact').like('ref', 'ai:%').in('status', ['open', 'snoozed']);
    for (const o of (open ?? []) as { ref: string }[]) if (!live.has(o.ref)) await clearAction('ai_fact', o.ref, db);
  }
}

/** Each tick while a run is open: ask a bounded batch, save it, close the run when nothing is left. */
export async function runAiSamplingStep(db: Db = createAdminClient(), opts: { until?: number } = {}): Promise<{ done: boolean; remaining: number; answered?: number; note?: string }> {
  const until = opts.until ?? Date.now() + 200_000;
  const { data: r } = await db.from('ai_run').select('id, month, started_at, status, error').eq('status', 'running').order('started_at').limit(1).maybeSingle();
  const run = r as Run | null;
  if (!run) return { done: true, remaining: 0 };
  // One step at a time per run (the dispatcher and the "step now" button could otherwise pay for the same batch twice).
  // The lock lapses after 4 minutes, so a step cut off by the function limit never blocks the run.
  const { data: claimed } = await db
    .from('ai_run')
    .update({ locked_at: new Date().toISOString() })
    .eq('id', run.id)
    .or(`locked_at.is.null,locked_at.lt.${new Date(Date.now() - 240_000).toISOString()}`)
    .select('id');
  if (!claimed?.length) return { done: false, remaining: -1, note: 'Another step of this run is already working' };
  const date = ukDate(run.started_at);
  const override = run.error === OVERRIDE_NOTE;

  const [{ data: prompts }, { data: saved }] = await Promise.all([
    db.from('ai_prompt').select('id, prompt').eq('active', true).order('id'),
    db.from('ai_answer').select('prompt_id, engine, run_no').eq('date', date).limit(20000),
  ]);
  const text = new Map(((prompts ?? []) as { id: number; prompt: string }[]).map((p) => [p.id, p.prompt]));
  let engines = enabledEngines();
  const notes: string[] = [];
  if (engines.includes('claude')) {
    const spend = await aiSpendThisMonthGbp();
    if (spend.gbp >= spend.capGbp) {
      engines = engines.filter((e) => e !== 'claude');
      notes.push(`Claude skipped: the AI cap (£${spend.capGbp}) was reached`);
    }
  }
  let work = remainingWork([...text.keys()], engines, RUNS, (saved ?? []) as never);
  if (!work.length) {
    await closeRun(run, db, notes.join(' · ') || undefined);
    return { done: true, remaining: 0, answered: 0, note: notes.join(' · ') || undefined };
  }

  const { facts, rivals } = await context(db);
  let answered = 0;
  const batch = work.slice(0, MAX_PER_STEP);
  for (let i = 0; i < batch.length; i += CONCURRENCY) {
    if (Date.now() + SLOWEST_MS > until) break;
    const chunk = batch.slice(i, i + CONCURRENCY);
    const paid = chunk.filter((w) => w.engine !== 'claude').length;
    if (paid) {
      try {
        await checkCap(paid * DFS_ANSWER_USD, { override }, db);
      } catch (e) {
        const b = await budget('dataforseo', db);
        const msg = `Stopped at the DataForSEO cap ($${b.spent.toFixed(2)} of $${b.cap.toFixed(0)} spent)`;
        await raiseAction({ kind: 'budget', ref: `ai_run:${run.month}`, title: 'AI answer sampling stopped at the DataForSEO cap', why: e instanceof Error ? e.message : msg, fixHref: '/admin/search/ai' }, db);
        await closeRun(run, db, [...notes, msg].join(' · '));
        return { done: true, remaining: work.length - answered, answered, note: msg };
      }
    }
    const results = await Promise.all(chunk.map((w) => sampleOne(w, text.get(w.promptId) ?? '', run.id, date, facts, rivals, db)));
    answered += results.length;
  }
  work = work.slice(answered);
  const { data: rows } = await db.from('ai_answer').select('cost_usd, error').eq('run_id', run.id);
  await db
    .from('ai_run')
    .update({ answers: (rows ?? []).filter((x) => !x.error).length, cost_usd: (rows ?? []).reduce((a, x) => a + Number(x.cost_usd ?? 0), 0) })
    .eq('id', run.id);
  if (!work.length) {
    await closeRun(run, db, notes.join(' · ') || undefined);
    return { done: true, remaining: 0, answered };
  }
  return { done: false, remaining: work.length, answered };
}

/** One question, one engine, one run. A failed call is saved with its error (and counts as asked), so a run always ends. */
async function sampleOne(w: WorkItem, prompt: string, runId: number, date: string, facts: Facts, rivals: Rival[], db: Db): Promise<boolean> {
  const base = { run_id: runId, prompt_id: w.promptId, engine: w.engine, run_no: w.runNo, date };
  try {
    const reply = w.engine === 'claude' ? await askClaude(prompt) : await askDfs(w.engine as Exclude<Engine, 'claude'>, prompt);
    if (!reply.text) throw new Error('The answer came back empty');
    const a = analyseAnswer(reply, facts, rivals);
    await db.from('ai_answer').upsert(
      {
        ...base,
        model: reply.model,
        text: reply.text.slice(0, 12000),
        mentioned: a.mentioned,
        cited: a.cited,
        list_pos: a.listPos,
        rivals: a.rivals,
        cited_domains: a.citedDomains,
        accuracy_flags: a.flags,
        cost_usd: Math.round(reply.costUsd * 100000) / 100000,
      },
      { onConflict: 'prompt_id,engine,run_no,date', ignoreDuplicates: true },
    );
    for (const f of a.flags) await raiseAction(factAction(w.engine, f, prompt), db);
    return true;
  } catch (e) {
    await db.from('ai_answer').upsert({ ...base, error: (e instanceof Error ? e.message : 'Failed').slice(0, 500) }, { onConflict: 'prompt_id,engine,run_no,date', ignoreDuplicates: true });
    return false;
  }
}
