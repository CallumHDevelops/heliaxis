import { z } from 'zod';
import { cmsArticleAiSchema, type CmsArticleAi } from './cms-article-template';

export const generatedPostSchema = cmsArticleAiSchema;
export type GeneratedPost = CmsArticleAi;

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

You fill a FIXED blog article template. Return ONLY valid JSON with this exact shape:
{
  "title": string,                 // page / CMS title
  "slug": "kebab-case-slug",       // no leading slash; letters, numbers, hyphens only
  "seoTitle": string,              // ~50–60 chars
  "seoDescription": string,        // 120–160 chars
  "tags": string,                  // e.g. "Solar | Battery" (pipe-separated, 1–3 short tags) — shown as hero eyebrow
  "headline": string,              // hero H1
  "sub": string,                   // usually "" on the example template (optional short hero sub)
  "introEyebrow": string,          // usually "INTRODUCTION"
  "introTitle": string,            // intro section title (media block)
  "introText": string,             // 2–4 sentences of plain text (not HTML)
  "bodyHtml1": string,             // first rich block — exactly 2 medium <p> paragraphs
  "ctaHeadline": string,           // mid-page CTA band headline
  "ctaSub": string,                // CTA supporting line
  "ctaBtn": string,                // CTA button label e.g. "Get my free quote"
  "bodyHtml2": string,             // second rich block — 1 medium <p> + 1 short <p>
  "homeTitle": string,             // usually "For your home"
  "homeDesc": string,              // 1 short sentence for the home card
  "homeBullets": [string, string, string], // 2–3 short benefit bullets for homes
  "homeBtn": string,               // e.g. "Get my home quote"
  "businessTitle": string,         // usually "For your business"
  "businessDesc": string,          // 1 short sentence for the business card
  "businessBullets": [string, string, string], // 2–3 short benefit bullets for businesses
  "businessBtn": string            // e.g. "Explore business funding"
}

Rules:
- The live page layout is FIXED like /example-blog-page: hero → intro media → body → CTA → closing → contact form → home/business split.
- Do NOT invent contact forms, form fields, emails, phone numbers, or user-submitted data.
- You MUST fill the home/business split (homeTitle, homeDesc, homeBullets, homeBtn, businessTitle, businessDesc, businessBullets, businessBtn) — tailor bullets to the article topic.
- Prefer an empty hero "sub" unless a short line is clearly useful.
- slug must be unique-looking kebab-case related to the title.

Rich text lengths (strict):
- bodyHtml1: EXACTLY two <p> paragraphs, each medium length (~70–110 words / 3–5 sentences). No headings, lists, or extra paragraphs.
- bodyHtml2: EXACTLY two <p> paragraphs — first medium (~70–110 words), second short (~25–45 words / 1–2 sentences). No headings or lists.
- Allowed tags only: <p>, <strong>, <em>, <a>, <br> (prefer <p> + occasional <strong> / <a>).
- Use <strong> on a few key phrases; include 1–2 internal <a href="/…"> links when natural (e.g. /solar-estimator, /commercial-funding, /newport-net-zero-grant, /#quote).
- No inline styles, classes, images, <h2>, <h3>, <ul>, or <ol>.

Split cards:
- Keep titles as "For your home" / "For your business" unless a clearer short title fits.
- Descriptions: one plain sentence each (no HTML).
- Bullets: 2 or 3 short lines each, concrete and UK/South Wales relevant.
- Buttons: short CTA labels (no arrows — the UI adds them).`;

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1].trim() : trimmed;
  return JSON.parse(raw);
}

function normalizeSlug(slug: string): string {
  return String(slug || '')
    .trim()
    .toLowerCase()
    .replace(/^\/+/, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
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

  const parsed = extractJson(content) as Record<string, unknown>;
  if (parsed && typeof parsed.slug === 'string') {
    parsed.slug = normalizeSlug(parsed.slug);
  }
  return generatedPostSchema.parse(parsed);
}

/** @deprecated free-form body blocks removed — kept for type compatibility. */
export function generatedToBody(_blocks: unknown): never[] {
  return [];
}

export { z };
