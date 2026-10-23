import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { ASSISTANT_MODEL, assistantConfigured } from '@/lib/assistant/run';
import { aiConfig } from '@/lib/blog/ai';
import { dedupeSources, type GeoSource } from './shared';

/**
 * The AI engines the GEO bot asks. Each gets the customer's question exactly as typed, with no
 * mention of Heliaxis, and searches the web the way it would for anyone in South Wales. Claude needs
 * ANTHROPIC_API_KEY; the others go through OpenRouter (OPENROUTER_API_KEY) and are chosen with
 * GEO_OPENROUTER_MODELS (comma-separated OpenRouter model ids; "none" turns them off).
 */

const DEFAULT_OPENROUTER = ['perplexity/sonar', 'openai/gpt-4o-search-preview'];

export type EngineAnswer = { answer: string; sources: GeoSource[] };

function openRouterModels(): string[] {
  if (!process.env.OPENROUTER_API_KEY) return [];
  const raw = process.env.GEO_OPENROUTER_MODELS;
  if (raw && raw.trim().toLowerCase() === 'none') return [];
  const list = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_OPENROUTER;
  return [...new Set(list)].slice(0, 4);
}

/** The engines a new run asks: "claude" and "openrouter:<model>". */
export function geoEngines(): string[] {
  return [...(assistantConfigured() ? ['claude'] : []), ...openRouterModels().map((m) => `openrouter:${m}`)];
}

export async function askEngine(engine: string, prompt: string): Promise<EngineAnswer> {
  if (engine === 'claude') return askClaude(prompt);
  if (engine.startsWith('openrouter:')) return askOpenRouter(engine.slice('openrouter:'.length), prompt);
  throw new Error(`Unknown engine ${engine}`);
}

/** Claude with live web search, placed in Newport as a local customer would be. */
async function askClaude(prompt: string): Promise<EngineAnswer> {
  const client = new Anthropic();
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: prompt }];
  const text: string[] = [];
  const sources: GeoSource[] = [];
  // A long search can pause the turn; send it back to carry on, a few times at most.
  for (let i = 0; i < 3; i++) {
    const res = await client.beta.messages.create(
      {
        model: ASSISTANT_MODEL,
        max_tokens: 8000,
        output_config: { effort: 'low' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        tools: [
          {
            type: 'web_search_20260209',
            name: 'web_search',
            max_uses: 5,
            user_location: { type: 'approximate', city: 'Newport', region: 'Wales', country: 'GB', timezone: 'Europe/London' },
          },
        ],
        messages,
      },
      { timeout: 120_000 }
    );
    if (res.stop_reason === 'refusal') throw new Error('Claude declined to answer');
    for (const b of res.content) {
      if (b.type === 'text') {
        text.push(b.text);
        for (const c of b.citations ?? []) {
          if (c.type === 'web_search_result_location') sources.push({ url: c.url, title: c.title ?? undefined });
        }
      } else if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
        // Pages it read but may not have cited: kept after the cited ones.
        for (const r of b.content) sources.push({ url: r.url, title: r.title });
      }
    }
    if (res.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: res.content });
  }
  const answer = text.join('').trim();
  if (!answer) throw new Error('Claude gave no answer');
  return { answer, sources: dedupeSources(sources) };
}

type OpenRouterReply = {
  choices?: {
    message?: {
      content?: string;
      annotations?: { type?: string; url_citation?: { url?: string; title?: string } }[];
    };
  }[];
  citations?: string[];
};

/** A search-enabled model through OpenRouter (Perplexity's answers and ChatGPT search, by default). */
async function askOpenRouter(model: string, prompt: string): Promise<EngineAnswer> {
  const { apiKey, baseUrl } = aiConfig();
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://heliaxis.co.uk',
      'X-Title': 'Heliaxis AI visibility',
    },
    body: JSON.stringify({ model, max_tokens: 2000, messages: [{ role: 'user', content: prompt }] }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`${model}: ${res.status} ${err.slice(0, 160)}`);
  }
  const data = (await res.json()) as OpenRouterReply;
  const msg = data.choices?.[0]?.message;
  const answer = String(msg?.content || '').trim();
  if (!answer) throw new Error(`${model} gave no answer`);
  const sources: GeoSource[] = [
    ...(msg?.annotations ?? [])
      .filter((a) => a.type === 'url_citation' && a.url_citation?.url)
      .map((a) => ({ url: String(a.url_citation!.url), title: a.url_citation!.title })),
    ...(data.citations ?? []).map((url) => ({ url: String(url) })),
  ];
  return { answer, sources: dedupeSources(sources) };
}
