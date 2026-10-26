import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadAssumptions } from '../assumptions';
import { recordUsage } from '../usage';
import { domainsFrom, mentionedIn } from './geo';
import { getLegalSignOff } from './data';

/**
 * Asks an AI assistant (Claude with web search, through the Anthropic account Heliaxis already has) the local
 * questions and records which businesses it names. Monthly, a few pounds at most, and it stops by itself if the
 * month's AI spend has reached the cap. Answers are labelled "API sample": they can differ from what the
 * consumer apps say.
 */

export const GEO_MODEL = process.env.SOCIAL_GEO_MODEL || 'claude-sonnet-5-5';
const RUNS = 3;
const SEARCH_USD = 0.01;

const monthStart = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();

export async function aiSpendThisMonthGbp(): Promise<{ gbp: number; capGbp: number }> {
  const a = await loadAssumptions();
  const { data } = await createAdminClient().from('social_usage').select('cost_usd').gte('at', monthStart());
  const usd = (data ?? []).reduce((s, r) => s + Number(r.cost_usd), 0);
  return { gbp: usd * a.usd_to_gbp, capGbp: a.ai_monthly_cap_gbp };
}

/** Queues one job per question and run. Does nothing twice in a month, and nothing before the legal sign-off. */
export async function queueGeoRun(now = new Date()): Promise<{ queued: number; reason?: string }> {
  if (!(await getLegalSignOff())) return { queued: 0, reason: 'The legal check has not been signed off.' };
  if (!process.env.ANTHROPIC_API_KEY) return { queued: 0, reason: 'No AI key is set.' };
  const db = createAdminClient();
  const { data: prompts } = await db.from('social_geo_prompt').select('id').eq('active', true);
  const month = now.toISOString().slice(0, 7);
  const date = now.toISOString().slice(0, 10);
  const jobs = (prompts ?? []).flatMap((p) => Array.from({ length: RUNS }, (_, i) => ({ kind: 'geo', dedupe_key: `geo:${month}:${p.id}:${i + 1}`, payload: { promptId: p.id, run: i + 1, date } })));
  if (!jobs.length) return { queued: 0, reason: 'No questions to ask.' };
  const { error } = await db.from('social_job').upsert(jobs, { onConflict: 'dedupe_key', ignoreDuplicates: true });
  return error ? { queued: 0, reason: 'Could not queue.' } : { queued: jobs.length };
}

type Block = { type: string; text?: string; citations?: { url?: string }[]; content?: { url?: string }[] | unknown };

/** One question, one run. Returns false to retry later, true when done (including "skipped, over the cap"). */
export async function runGeoSample(promptId: number, run: number, date: string): Promise<boolean> {
  const db = createAdminClient();
  const spend = await aiSpendThisMonthGbp();
  if (spend.gbp >= spend.capGbp) return true;
  const { data: p } = await db.from('social_geo_prompt').select('id, prompt').eq('id', promptId).maybeSingle();
  if (!p) return true;
  const { data: exists } = await db.from('social_geo_sample').select('id').eq('date', date).eq('engine', 'claude-web-search').eq('prompt_id', promptId).eq('run', run).maybeSingle();
  if (exists) return true;
  const { data: comps } = await db.from('social_competitor').select('id, name, website').eq('tracked', true);
  try {
    const res = await new Anthropic().messages.create(
      {
        model: GEO_MODEL,
        max_tokens: 2000,
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }] as never,
        messages: [{ role: 'user', content: `${p.prompt} Give a short list of specific company names and say where you found them.` }],
      },
      { timeout: 60_000 }
    );
    const blocks = res.content as unknown as Block[];
    const answer = blocks.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n').trim();
    const urls: string[] = [];
    for (const b of blocks) {
      if (b.type === 'text') for (const c of b.citations ?? []) if (c.url) urls.push(c.url);
      if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) for (const r of b.content as { url?: string }[]) if (r.url) urls.push(r.url);
    }
    const searches = (res.usage as unknown as { server_tool_use?: { web_search_requests?: number } }).server_tool_use?.web_search_requests ?? 0;
    await recordUsage('geo', res.model, res.usage, searches * SEARCH_USD);
    const domains = domainsFrom(urls);
    await db.from('social_geo_sample').insert({ date, engine: 'claude-web-search', model: res.model, prompt_id: promptId, run, answer_text: answer.slice(0, 8000), mentioned_ids: mentionedIn(answer, domains, comps ?? []), cited_domains: domains });
    return true;
  } catch {
    return false;
  }
}
