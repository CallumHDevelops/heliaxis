import { z } from 'zod';
import type { BlogBodyBlock } from './types';

const bodyBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('p'), text: z.string() }),
  z.object({ type: z.literal('h2'), text: z.string() }),
  z.object({ type: z.literal('h3'), text: z.string() }),
  z.object({ type: z.literal('ul'), items: z.array(z.string()) }),
  z.object({ type: z.literal('quote'), text: z.string() }),
  z.object({
    type: z.literal('cta'),
    label: z.string(),
    href: z.string(),
  }),
]);

export const generatedPostSchema = z.object({
  title: z.string().min(3),
  slug: z.string().min(3).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  excerpt: z.string().min(20).max(160),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  categorySlugs: z.array(z.string()).default([]),
  body: z.array(bodyBlockSchema).min(2),
});

export type GeneratedPost = z.infer<typeof generatedPostSchema>;

const CTA_ALLOW = new Set(['/#quote', '/commercial-funding', '/solar-estimator', '/blog', '/newport-net-zero-grant', '/warehousing']);

export function isSafeCtaHref(href: string): boolean {
  if (!href || typeof href !== 'string') return false;
  if (href.startsWith('javascript:') || href.startsWith('data:')) return false;
  if (href.startsWith('/')) {
    return /^\/[a-zA-Z0-9#/?_-]*$/.test(href);
  }
  return false;
}

export function sanitizeCtaHref(href: string): string {
  if (isSafeCtaHref(href)) return href;
  return '/#quote';
}

function aiConfig() {
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
  return Boolean(aiConfig().apiKey);
}

const SYSTEM = `You are a content writer for Heliaxis, an MCS-certified solar, battery and energy installer in South Wales (UK).
Write practical, trustworthy British English. No hype, no purple prose.
Return ONLY valid JSON matching this shape:
{
  "title": string,
  "slug": "kebab-case-slug",
  "excerpt": string (max 160 chars),
  "seoTitle": string,
  "seoDescription": string,
  "categorySlugs": string[] // from: solar, battery, funding, business, home,
  "body": Array of blocks:
    { "type": "p", "text": "..." } |
    { "type": "h2", "text": "..." } |
    { "type": "h3", "text": "..." } |
    { "type": "ul", "items": ["..."] } |
    { "type": "quote", "text": "..." } |
    { "type": "cta", "label": "...", "href": "/#quote" }
}
Include 1 mid-article CTA to "/#quote" or "/commercial-funding" or "/solar-estimator" when relevant.
Aim for roughly 600–900 words across the body blocks.`;

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1].trim() : trimmed;
  return JSON.parse(raw);
}

/** Provider-agnostic: OpenRouter now; Claude/OpenAI later via AI_BASE_URL + AI_API_KEY + AI_MODEL. */
export async function generateBlogPost(prompt: string): Promise<GeneratedPost> {
  const { apiKey, baseUrl, model } = aiConfig();
  if (!apiKey) throw new Error('AI is not configured. Set OPENROUTER_API_KEY (or AI_API_KEY).');

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://heliaxis.co.uk',
      'X-Title': 'Heliaxis Blog CMS',
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`AI request failed (${res.status}): ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('AI returned an empty response');

  const parsed = extractJson(content);
  const draft = generatedPostSchema.parse(parsed);
  draft.body = draft.body.map((b) =>
    b.type === 'cta' ? { ...b, href: sanitizeCtaHref(b.href) } : b,
  );
  // Prefer allowlisted CTAs when model invents odd paths
  draft.body = draft.body.map((b) => {
    if (b.type !== 'cta') return b;
    if (CTA_ALLOW.has(b.href.split('?')[0]) || b.href.startsWith('/#')) return b;
    return { ...b, href: '/#quote' };
  });
  return draft;
}

export function generatedToBody(blocks: GeneratedPost['body']): BlogBodyBlock[] {
  return blocks as BlogBodyBlock[];
}
