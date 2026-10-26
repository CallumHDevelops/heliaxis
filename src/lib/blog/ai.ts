import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { cmsArticleAiSchema, type CmsArticleAi } from './cms-article-template';
import { BLOG_SYSTEM as SYSTEM, blogUserMessage } from './prompt';

export const generatedPostSchema = cmsArticleAiSchema;
export type GeneratedPost = CmsArticleAi;

export function aiConfig() {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = (
    process.env.OPENAI_API_BASE_URL ||
    process.env.AI_BASE_URL ||
    'https://openrouter.ai/api/v1'
  ).replace(/\/$/, '');
  const model = process.env.OPENAI_MODEL || process.env.AI_MODEL || 'openai/gpt-4o-mini';
  return { apiKey, baseUrl, model };
}

export function isAiConfigured(): boolean {
  return Boolean(aiConfig().apiKey || process.env.ANTHROPIC_API_KEY);
}

function extractJson(text: string): unknown {
  const trimmed = String(text || '').trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fence ? fence[1] : trimmed).trim();
  try {
    return JSON.parse(raw);
  } catch {
    /* fall through */
  }
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start !== -1 && end > start) return JSON.parse(raw.slice(start, end + 1));
  throw new Error('AI returned unparseable JSON');
}

/** The start of a reply, for the server log, when it is not the JSON we asked for. */
const peek = (t: string) => String(t || '').replace(/\s+/g, ' ').slice(0, 160);

function normalizeSlug(slug: string): string {
  return String(slug || '')
    .trim()
    .toLowerCase()
    .replace(/^\/+/, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Writing model for blog articles. Strong by default; override with AI_BLOG_MODEL.
 *  Deliberately does NOT inherit AI_MODEL/OPENAI_MODEL (may be a cheap model set for
 *  something else). */
function blogModel(): string {
  return process.env.AI_BLOG_MODEL || 'openai/gpt-4o';
}

/** All template fields defaulted — used to backfill a slightly-incomplete AI draft so
 *  a near-miss response still yields an editable draft instead of hard-failing. */
function blogDraftDefaults(): Record<string, unknown> {
  return {
    title: 'Untitled article', slug: 'untitled-article', seoTitle: '', seoDescription: '',
    tags: '', headline: '', sub: '', introEyebrow: 'INTRODUCTION', introTitle: '', introText: '',
    bodyHtml1: '<p></p>', ctaHeadline: 'Ready to start?', ctaSub: 'Book a free survey today.',
    ctaBtn: 'Get my free quote', bodyHtml2: '<p></p>', homeTitle: 'For your home', homeDesc: '',
    homeBullets: ['', ''], homeBtn: 'Get my home quote', businessTitle: 'For your business',
    businessDesc: '', businessBullets: ['', ''], businessBtn: 'Explore business funding', imageQuery: '',
  };
}

/** Provider-agnostic (OpenRouter). Strong model with an availability fallback chain,
 *  low-credit (402) adaptive retry, and shape-tolerant parsing — mirrors the page builder. */
export async function generateBlogPost(prompt: string, opts: { keyword?: string; audience?: string } = {}): Promise<GeneratedPost> {
  const { apiKey, baseUrl } = aiConfig();
  const claudeKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey && !claudeKey) throw new Error('AI is not configured. Set ANTHROPIC_API_KEY (or OPENROUTER_API_KEY).');

  const topic = String(prompt || '').trim().slice(0, 6000);
  const userMessage = blogUserMessage({ prompt: topic, ...opts });

  const primary = blogModel();
  const candidates = [primary];
  if (!candidates.includes('openai/gpt-4o')) candidates.push('openai/gpt-4o');
  if (!candidates.includes('openai/gpt-4o-mini')) candidates.push('openai/gpt-4o-mini');
  const CREDITS_MSG =
    'AI credits are low on OpenRouter — top up at https://openrouter.ai/settings/credits, then try again.';
  const callChat = (model: string, maxTokens: number, repair = false, jsonMode = true) =>
    fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://heliaxis.co.uk',
        'X-Title': 'Heliaxis Blog CMS',
      },
      body: JSON.stringify({
        model,
        temperature: repair ? 0.2 : 0.7,
        max_tokens: maxTokens,
        // Ask the provider for a JSON object, so a long custom prompt cannot turn the reply into prose.
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
        messages: [
          { role: 'system', content: SYSTEM },
          {
            role: 'user',
            content: repair
              ? `${userMessage}\n\nIMPORTANT: reply with ONE valid JSON object only, in the exact shape from the system message. No markdown, no commentary, nothing before or after the JSON. Keep the article within the length limits so the JSON is complete.`
              : userMessage,
          },
        ],
      }),
    });

  /** Claude writes the article when ANTHROPIC_API_KEY is set (best quality for the price); OpenRouter is the fallback. */
  const claudeCall = async (repair: boolean): Promise<{ text?: string; finish?: string; err?: string; fatal?: string }> => {
    try {
      const res = await new Anthropic().messages.create({
        model: process.env.AI_BLOG_CLAUDE_MODEL || 'claude-sonnet-5-5',
        max_tokens: 14000,
        system: SYSTEM,
        messages: [
          {
            role: 'user',
            content: repair
              ? `${userMessage}\n\nIMPORTANT: reply with ONE valid JSON object only, in the exact shape from the system message. No markdown, no commentary. Keep to the lower end of the word counts so the JSON is complete.`
              : userMessage,
          },
        ],
      });
      const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
      return text ? { text, finish: res.stop_reason === 'max_tokens' ? 'length' : 'stop' } : { err: 'empty response' };
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      return { err, fatal: /credit|billing|401|403|authentication/i.test(err) ? `Claude request failed (${err.slice(0, 160)})` : undefined };
    }
  };

  let content: string | undefined;
  let finish: string | undefined;
  let lastErr = '';
  let usedModel = primary;
  const attempt = async (model: string, repair: boolean): Promise<{ text?: string; finish?: string; err?: string; fatal?: string }> => {
    let res = await callChat(model, 14000, repair);
    if (res.status === 400) {
      // Some models do not accept JSON mode: ask again without it.
      const errText = await res.text().catch(() => '');
      if (/response_format|json_object|json mode/i.test(errText)) res = await callChat(model, 14000, repair, false);
      else return { err: `400: ${errText.slice(0, 200)}`, fatal: `AI request failed (400: ${errText.slice(0, 200)})` };
    }
    if (res.status === 402) {
      const errText = await res.text().catch(() => '');
      const afford = parseInt((errText.match(/afford\s+(\d+)/i) || [])[1] || '0', 10);
      // A full article needs about 7,000 tokens: with less than that the JSON is cut off, so stop and say so.
      if (afford >= 7000) res = await callChat(model, Math.max(900, afford - 96), repair);
      else return { fatal: CREDITS_MSG };
    }
    if (res.ok) {
      const data = (await res.json()) as { choices?: { message?: { content?: string }; finish_reason?: string }[] };
      const text = data.choices?.[0]?.message?.content;
      return text ? { text, finish: data.choices?.[0]?.finish_reason } : { err: 'empty response' };
    }
    const errText = await res.text().catch(() => '');
    const err = `${res.status}: ${errText.slice(0, 200)}`;
    if (res.status === 402) return { fatal: CREDITS_MSG };
    const modelUnavailable = res.status === 404 || /no endpoints|not a valid model|model_not_found|does not exist/i.test(errText);
    return modelUnavailable ? { err } : { err, fatal: `AI request failed (${err})` };
  };
  let viaClaude = false;
  if (claudeKey) {
    const c = await claudeCall(false);
    if (c.text) {
      content = c.text;
      finish = c.finish;
      viaClaude = true;
    } else if (c.fatal && !apiKey) throw new Error(c.fatal);
    else lastErr = c.err || '';
  }
  for (const model of content ? [] : candidates) {
    const r = await attempt(model, false);
    if (r.fatal) throw new Error(r.fatal);
    if (r.text) {
      content = r.text;
      finish = r.finish;
      usedModel = model;
      break;
    }
    lastErr = r.err || 'no reply';
  }
  if (!content) throw new Error(`AI request failed (${lastErr || 'no usable model'})`);

  // The reply must be one complete JSON object. If it is prose, or was cut off at the length limit, ask once more, strictly.
  let parsed: Record<string, unknown> | null = null;
  try {
    if (finish !== 'length') parsed = extractJson(content) as Record<string, unknown>;
  } catch {
    parsed = null;
  }
  if (!parsed) {
    console.error('Blog AI: first reply was not usable JSON', { model: usedModel, finish, start: peek(content) });
    const again = viaClaude ? await claudeCall(true) : await attempt(usedModel, true);
    if (again.fatal) throw new Error(again.fatal);
    if (!again.text) throw new Error('AI returned unparseable JSON (no second reply). Try a shorter topic, or try again.');
    try {
      if (again.finish === 'length') throw new Error('cut off');
      parsed = extractJson(again.text) as Record<string, unknown>;
    } catch {
      console.error('Blog AI: second reply was not usable JSON', { model: usedModel, finish: again.finish, start: peek(again.text) });
      throw new Error(again.finish === 'length' ? 'The article was cut off before it finished. Try a narrower topic, or try again.' : 'AI returned unparseable JSON. Try a shorter, simpler topic, or try again.');
    }
  }
  if (parsed && typeof parsed.slug === 'string') {
    parsed.slug = normalizeSlug(parsed.slug);
  }
  // Shape-tolerant: try as-is, then backfill missing fields with defaults so a
  // near-miss response still produces an editable draft rather than throwing.
  const safe = generatedPostSchema.safeParse(parsed);
  if (safe.success) return safe.data;
  return generatedPostSchema.parse({
    ...blogDraftDefaults(),
    ...(parsed && typeof parsed === 'object' ? parsed : {}),
  });
}

/** @deprecated free-form body blocks removed — kept for type compatibility. */
export function generatedToBody(_blocks: unknown): never[] {
  return [];
}

export { z };
