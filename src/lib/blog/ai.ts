import { z } from 'zod';
import { cmsArticleAiSchema, type CmsArticleAi } from './cms-article-template';

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
  return Boolean(aiConfig().apiKey);
}

const SYSTEM = `You are a blog content writer for the Heliaxis CMS (Heliaxis is an MCS-certified solar, battery and energy installer in South Wales, UK).
Write practical, trustworthy British English. No hype, no purple prose.

CRITICAL — topic fidelity:
- The USER message is the article topic. Write ONLY about that topic.
- Do NOT rewrite the request into a solar, battery, MCS, or Heliaxis sales article unless the user clearly asked for that.
- If the user asks for "iPad", "tea", "kebab", etc., the title, slug, headline, body, tags, imageQuery, and CTAs must be about that subject.
- Only mention Heliaxis / solar / South Wales when it naturally fits the requested topic (e.g. energy articles). Otherwise omit brand and solar keywords.

You fill a FIXED blog article template. Return ONLY valid JSON with this exact shape:
{
  "title": string,                 // page / CMS title — must match the user topic
  "slug": "kebab-case-slug",       // no leading slash; letters, numbers, hyphens only
  "seoTitle": string,              // ~50–60 chars
  "seoDescription": string,        // 120–160 chars
  "tags": string,                  // e.g. "Tech | Tablets" (pipe-separated, 1–3 short tags) — shown as hero eyebrow
  "headline": string,              // hero H1 — must match the user topic
  "sub": string,                   // usually "" on the example template (optional short hero sub)
  "introEyebrow": string,          // usually "INTRODUCTION"
  "introTitle": string,            // intro section title (media block)
  "introText": string,             // 2–4 sentences of plain text (not HTML)
  "bodyHtml1": string,             // first rich block — exactly 2 long <p> paragraphs
  "ctaHeadline": string,           // mid-page CTA band headline (topic-appropriate)
  "ctaSub": string,                // CTA supporting line
  "ctaBtn": string,                // CTA button label (topic-appropriate; not forced to solar quote)
  "bodyHtml2": string,             // second rich block — 1 long <p> + 1 short <p>
  "homeTitle": string,             // usually "For your home"
  "homeDesc": string,              // 1 short sentence for the home card — tailored to topic
  "homeBullets": [string, string, string], // 2–3 short benefit bullets
  "homeBtn": string,
  "businessTitle": string,         // usually "For your business"
  "businessDesc": string,          // 1 short sentence for the business card — tailored to topic
  "businessBullets": [string, string, string], // 2–3 short benefit bullets
  "businessBtn": string,
  "imageQuery": string             // 2–6 concrete nouns for Unsplash — must MATCH the article visually
}

Rules:
- The live page layout is FIXED like /example-blog-page: hero → intro media → body → CTA → closing → contact form → home/business split.
- Do NOT invent contact forms, form fields, emails, phone numbers, or user-submitted data.
- You MUST fill the home/business split — tailor bullets to the article topic (not always solar).
- Prefer an empty hero "sub" unless a short line is clearly useful.
- slug must be unique-looking kebab-case related to the title / user topic.
- imageQuery (required): short Unsplash search phrase (2–6 words) matching THIS article’s subject visually.

SEO, AEO & GEO (required — write for search engines, answer engines, and generative AI):
- SEO: Put the primary topic/keyword from the USER request naturally in title, seoTitle, slug, headline, introTitle, and early in introText/bodyHtml1. seoTitle ~50–60 chars; seoDescription 120–160 chars with a clear benefit + topic.
- AEO: Open introText or the first bodyHtml1 paragraph with a direct 1–2 sentence answer to the reader’s likely question. Prefer concrete, snippet-ready facts. Plain language — not fluff.
- GEO: Be quotable and citeable — specific claims and practical takeaways. Use local/brand context only when relevant to the topic. End bodyHtml2’s short paragraph with a crisp summary or next-step line.
- Never invent statistics, prices, certifications, or grants. Never force solar/MCS terms onto unrelated topics.

Rich text lengths (strict):
- Prefer long, thorough articles — not medium or short.
- bodyHtml1: EXACTLY two <p> paragraphs, each long (~280–400 words / 12–18 sentences). No headings, lists, or extra paragraphs.
- bodyHtml2: EXACTLY two <p> paragraphs — first long (~280–400 words), second short (~25–45 words / 1–2 sentences). No headings or lists.
- Allowed tags only: <p>, <strong>, <em>, <a>, <br> (prefer <p> + occasional <strong> / <a>).
- Use <strong> on a few key phrases (especially primary keywords and answer phrases). Internal <a href="/…"> links only when natural for the topic (energy articles may use /solar-estimator, /commercial-funding, /#quote).
- No inline styles, classes, images, <h2>, <h3>, <ul>, or <ol>.

Split cards:
- Keep titles as "For your home" / "For your business" unless a clearer short title fits.
- Descriptions: one plain sentence each (no HTML), relevant to the topic.
- Bullets: 2 or 3 short lines each, concrete and topic-relevant.
- Buttons: short CTA labels (no arrows — the UI adds them).`;

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
export async function generateBlogPost(prompt: string): Promise<GeneratedPost> {
  const { apiKey, baseUrl } = aiConfig();
  if (!apiKey) throw new Error('AI is not configured. Set OPENROUTER_API_KEY (or AI_API_KEY).');

  const topic = String(prompt || '').trim().slice(0, 4000);
  const userMessage =
    `Write the blog article JSON for this topic (follow it exactly — do not substitute a solar/energy article):\n\n${topic}`;

  const primary = blogModel();
  const candidates = [primary];
  if (!candidates.includes('openai/gpt-4o')) candidates.push('openai/gpt-4o');
  if (!candidates.includes('openai/gpt-4o-mini')) candidates.push('openai/gpt-4o-mini');
  const CREDITS_MSG =
    'AI credits are low on OpenRouter — top up at https://openrouter.ai/settings/credits, then try again.';
  const callChat = (model: string, maxTokens: number) =>
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
        temperature: 0.7,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: userMessage },
        ],
      }),
    });

  let content: string | undefined;
  let lastErr = '';
  for (const model of candidates) {
    let res = await callChat(model, 6000);
    if (res.status === 402) {
      const errText = await res.text().catch(() => '');
      const afford = parseInt((errText.match(/afford\s+(\d+)/i) || [])[1] || '0', 10);
      if (afford >= 900) res = await callChat(model, Math.max(900, afford - 96));
      else throw new Error(CREDITS_MSG);
    }
    if (res.ok) {
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      content = data.choices?.[0]?.message?.content;
      if (content) break;
      lastErr = 'empty response';
      continue;
    }
    const errText = await res.text().catch(() => '');
    lastErr = `${res.status}: ${errText.slice(0, 200)}`;
    if (res.status === 402) throw new Error(CREDITS_MSG);
    const modelUnavailable =
      res.status === 404 || /no endpoints|not a valid model|model_not_found|does not exist/i.test(errText);
    if (!modelUnavailable) throw new Error(`AI request failed (${lastErr})`);
  }
  if (!content) throw new Error(`AI request failed (${lastErr || 'no usable model'})`);

  const parsed = extractJson(content) as Record<string, unknown>;
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
