import { aiConfig, isAiConfigured } from '@/lib/blog/ai';

export { isAiConfigured };

export type CmsBlock = { t: string; p: Record<string, unknown> };

const MAX_BLOCKS = 16;
const MAX_ITEMS = 12;

/**
 * Canonical block contract — an approximate allow-list mirror of blockDefs() /
 * EXTRA_DEFAULTS in src/app/admin/cms-engine.ts. Only these block types may be
 * produced by the AI, and only the p fields listed here survive normalization
 * (everything else the model emits is discarded). Array fields use element [0]
 * as the item shape template. Keep in rough sync with cms-engine.ts — extra
 * fields there are harmless (client renders with ||-fallbacks); the AI just
 * won't populate them until they are listed here.
 */
const DEFAULTS: Record<string, Record<string, unknown>> = {
  hero: { eyebrow: 'Eyebrow', headline: 'Your headline here', sub: 'Supporting sentence.', dark: true, ctaLabel: 'Get a quote', ctaHref: '#quote', ctaPulse: false, cta2: '', cta2Href: '', ctaDisabled: false, cta2Disabled: false, textWide: false, tags: '', hideMark: false, hideSun: false, hideRating: true, hideMicrotrust: true },
  stats: { items: [{ n: '100+', k: 'Installs' }] },
  grid: { eyebrow: 'Section', title: 'Section title', anchor: '', cols: 3, fill: 'none', items: [{ icon: 'solar', title: 'Item one', desc: 'Description.' }] },
  split: { lIcon: 'home', lt: 'For your home', ld: 'Text.', lb: ['Point one', 'Point two'], lc: 'Home quote', lcHref: '#quote', rIcon: 'building', rt: 'For your business', rd: 'Text.', rb: ['Point one', 'Point two'], rc: 'Business quote', rcHref: '/commercial-funding' },
  media: { img: '', side: 'right', eyebrow: 'Why choose us', title: 'A section title', text: 'Describe the benefit here.', cta: 'Learn more', ctaHref: '#quote', ctaDisabled: false, textWide: false, fit: 'cover' },
  steps: { eyebrow: 'How it works', title: 'From enquiry to switch-on', items: [{ title: 'Step', text: 'Detail.' }] },
  funding: { eyebrow: 'Funding & finance', title: 'Solar within reach, whatever your budget', sub: '', items: [{ title: 'Option', text: 'Detail.' }], cta: '', ctaHref: '/commercial-funding', ctaDisabled: false },
  explorer: { eyebrow: 'Mounting systems', title: 'One roof, every way to mount it', sub: '', items: [{ title: 'Option', text: 'Detail.', img: '', cta: '', ctaHref: '#quote' }] },
  faq: { eyebrow: 'Good to know', title: 'Your questions, answered', anchor: 'faq', items: [{ q: 'A question?', a: 'An answer.' }] },
  cta: { headline: 'Ready to start?', sub: 'Book a free survey today.', btn: 'Get my free quote', btnHref: '#quote', pulse: true, ctaDisabled: false, btn2: '', btn2Href: '', cta2Disabled: false },
  rich: { html: '<p>Write anything here…</p>' },
  testi: { eyebrow: 'Real customers', title: 'Trusted across South Wales', footnote: '', speed: 36, items: [{ stars: 5, quote: 'Great service.', name: 'Name', loc: 'Town · Solar' }] },
  pricing: { eyebrow: 'Options', title: 'Choose how you fund it', plans: [{ name: 'Plan', price: 'From £0', per: 'one-off', feats: ['Feature one'], cta: 'Get a quote', ctaHref: '#quote', hl: false }] },
  casestudy: { eyebrow: 'Our work', title: 'Recent projects', items: [{ img: '', loc: 'Location', title: 'Project', stat: '00%', statlabel: 'Result' }] },
  gallery: { eyebrow: 'Recent work', title: 'Installs across South Wales', sub: '', featuredLabel: 'Featured install', footnote: '', featuredIndex: 0, items: [{ img: '', loc: 'Location', featured: true }] },
};

const ALLOWED = new Set(Object.keys(DEFAULTS));
const ALLOWED_TAGS = new Set(['p', 'strong', 'em', 'a', 'br', 'ul', 'ol', 'li', 'h3', 'h4', 'blockquote']);

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function sanitizeRich(html: unknown): string {
  let s = String(html || '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<\/?(?:script|style|iframe|object|embed|link|meta|form|input|svg|img)\b[^>]*>/gi, '');
  s = s.replace(/<([a-zA-Z0-9]+)\b([^>]*)>/g, (_m, tag: string, attrs: string) => {
    const t = tag.toLowerCase();
    if (!ALLOWED_TAGS.has(t)) return '';
    if (t === 'a') {
      const m = /href\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
      let url = m ? (m[1] || m[2] || '') : '';
      if (/^\s*javascript:/i.test(url)) url = '#';
      if (url && !/^(?:https?:\/\/|\/|#|mailto:|tel:)/i.test(url)) url = '#';
      return url ? '<a href="' + url.replace(/"/g, '&quot;') + '">' : '<a>';
    }
    return '<' + t + '>';
  });
  s = s.replace(/<\/([a-zA-Z0-9]+)\s*>/g, (_m, tag: string) => {
    const t = tag.toLowerCase();
    return ALLOWED_TAGS.has(t) ? '</' + t + '>' : '';
  });
  // Kill any unterminated tag fragment at EOF. The passes above only match tags
  // that carry their own '>', so an unclosed '<img src=x onerror=...' or
  // '<a href="javascript:...' survives untouched — and the surrounding wrapper
  // markup ('<div class="pv-rich">…</div>') would supply the closing '>' at render
  // time, reviving it as a live element (classic unclosed-tag XSS absorption).
  s = s.replace(/<[^>]*$/, '');
  // Escape any remaining stray '<' that does not begin a well-formed allowed tag
  // (all kept tags are already bare <tag>/</tag>/<a href="…"> forms by now).
  s = s.replace(/<(?!\/?(?:p|strong|em|a|br|ul|ol|li|h3|h4|blockquote)\b)/gi, '&lt;');
  return s.trim() || '<p></p>';
}

function coerce(def: unknown, val: unknown): unknown {
  if (typeof def === 'string') return typeof val === 'string' ? val : (val == null ? def : String(val));
  if (typeof def === 'number') { const n = Number(val); return Number.isFinite(n) ? n : def; }
  if (typeof def === 'boolean') return typeof val === 'boolean' ? val : def;
  if (Array.isArray(def)) {
    const template = def[0];
    if (!Array.isArray(val) || val.length === 0) return clone(def);
    const out = val.slice(0, MAX_ITEMS).map((item) => {
      if (template && typeof template === 'object') return mergeObj(template as Record<string, unknown>, (item && typeof item === 'object') ? item as Record<string, unknown> : {});
      if (typeof template === 'number') { const n = Number(item); return Number.isFinite(n) ? n : 0; }
      return String(item == null ? '' : item);
    });
    return out.length ? out : clone(def);
  }
  if (def && typeof def === 'object') return mergeObj(def as Record<string, unknown>, (val && typeof val === 'object') ? val as Record<string, unknown> : {});
  return def;
}

function mergeObj(def: Record<string, unknown>, val: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(def)) out[k] = coerce(def[k], val[k]);
  return out;
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeBlock(raw: unknown): CmsBlock | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = String((raw as Record<string, unknown>).t || '').trim().toLowerCase();
  if (!ALLOWED.has(t)) return null;
  const rawP = (raw as Record<string, unknown>).p;
  const p = mergeObj(DEFAULTS[t], (rawP && typeof rawP === 'object') ? rawP as Record<string, unknown> : {});
  // Per-type hardening — the model never supplies real assets or out-of-range values.
  if (t === 'grid') p.cols = clampInt(p.cols, 1, 4, 3);
  if (t === 'media') p.img = '';
  if (t === 'rich') p.html = sanitizeRich(p.html);
  if (t === 'testi') (p.items as Array<Record<string, unknown>>).forEach((it) => { it.stars = clampInt(it.stars, 1, 5, 5); });
  if (t === 'casestudy') (p.items as Array<Record<string, unknown>>).forEach((it) => { it.img = ''; });
  if (t === 'explorer') (p.items as Array<Record<string, unknown>>).forEach((it) => { it.img = ''; });
  if (t === 'gallery') {
    const items = p.items as Array<Record<string, unknown>>;
    items.forEach((it) => { it.img = ''; it.featured = false; });
    const fi = clampInt(p.featuredIndex, 0, Math.max(0, items.length - 1), 0);
    p.featuredIndex = fi;
    if (items[fi]) items[fi].featured = true;
  }
  return { t, p };
}

export function normalizeBlocks(rawBlocks: unknown): CmsBlock[] {
  if (!Array.isArray(rawBlocks)) return [];
  const out: CmsBlock[] = [];
  for (const raw of rawBlocks) {
    const b = normalizeBlock(raw);
    if (b) out.push(b);
    if (out.length >= MAX_BLOCKS) break;
  }
  return out;
}

/** Best-effort repair for a JSON object truncated by the model's output cap:
 *  close an open string, drop a dangling comma / valueless key, and balance the
 *  open braces/brackets. The result parses to the sections that DID complete
 *  (normalizeBlocks then keeps only the valid ones) instead of failing outright. */
function repairTruncatedJson(s: string): string {
  const start = s.indexOf('{');
  const body = start > 0 ? s.slice(start) : s;
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{' || c === '[') stack.push(c === '{' ? '}' : ']');
    else if (c === '}' || c === ']') stack.pop();
  }
  let out = body;
  if (esc) out = out.slice(0, -1); // dangling escape char
  if (inStr) out += '"'; // close an open string
  out = out.replace(/,\s*$/, ''); // trailing comma
  out = out.replace(/:\s*$/, ':null'); // key with no value yet
  out = out.replace(/,\s*$/, '');
  for (let i = stack.length - 1; i >= 0; i--) out += stack[i];
  return out;
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
  // Strong models sometimes wrap JSON in prose — pull out the first {...} object.
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      /* fall through */
    }
  }
  // Last resort: repair a truncated (over-cap) completion.
  try {
    return JSON.parse(repairTruncatedJson(raw));
  } catch {
    throw new Error('AI returned unparseable JSON');
  }
}

export type PageSeo = { title: string; description: string; slug: string };

function stripTags(s: unknown): string {
  return String(s ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
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

function sanitizeSeo(raw: unknown, fallbackTitle: string): PageSeo {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const title = (stripTags(o.title) || stripTags(fallbackTitle) || 'New page').slice(0, 70);
  const description = stripTags(o.description ?? o.desc).slice(0, 180);
  const slug = (normalizeSlug(String(o.slug ?? title)) || 'page').slice(0, 80);
  return { title, description, slug };
}

/** Writing model. Long-form pages default to a strong model; override with
 *  AI_PAGE_MODEL (falls back to the shared AI_MODEL, else a sensible strong default). */
function pageModel(): string {
  // Deep page writing needs a STRONG model. Use AI_PAGE_MODEL if set, otherwise a
  // strong default. Deliberately does NOT inherit AI_MODEL / OPENAI_MODEL — those may
  // point at a cheap model configured for the blog generator (openai/gpt-4o-mini),
  // which produced thin, generic 2-section pages.
  return process.env.AI_PAGE_MODEL || 'openai/gpt-4o';
}

/** Best-effort live web research via Tavily (TAVILY_API_KEY). Reads the current
 *  top-ranking pages for the topic so the writer can beat them. Returns '' when no
 *  key is set or the call fails — the writer then proceeds on model knowledge.
 *  We only call Tavily's own API (no arbitrary URL fetching), so there is no SSRF
 *  surface; the returned text is treated as untrusted and only used as context. */
async function researchTopic(brief: string): Promise<string> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return '';
  const query =
    brief
      .replace(
        /^\s*(?:i\s+(?:want|need|would\s+like)\s+to\s+)?(?:please\s+)?(?:write|create|build|make|generate|draft)\s+(?:me\s+)?(?:a\s+|an\s+|the\s+)?(?:new\s+)?(?:web\s*)?page\s+(?:about|on|for|covering)\s+/i,
        '',
      )
      .trim()
      .slice(0, 380) || brief.slice(0, 380);
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        query,
        search_depth: 'advanced',
        max_results: 5,
        include_answer: true,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return '';
    const data = (await res.json()) as {
      answer?: string;
      results?: Array<{ title?: string; url?: string; content?: string }>;
    };
    const parts: string[] = [];
    if (data.answer) parts.push('Synthesised answer from current search results:\n' + String(data.answer).slice(0, 800));
    (data.results || []).slice(0, 5).forEach((r, i) => {
      const title = String(r.title || '').replace(/\s+/g, ' ').slice(0, 140);
      const url = String(r.url || '');
      const content = String(r.content || '').replace(/\s+/g, ' ').slice(0, 700);
      if (title || content) parts.push(`[${i + 1}] ${title} — ${url}\n${content}`);
    });
    return parts.join('\n\n').slice(0, 6500);
  } catch {
    return '';
  }
}

const SYSTEM = `You are a senior SEO & GEO/AEO content strategist and copywriter for Heliaxis, an MCS-certified solar, battery, heat-pump and EV-charging installer in South Wales, UK. You produce a COMPLETE, genuinely useful web page as CMS sections ("blocks") in reading order.

GOAL: write a page that OUTRANKS and OUT-HELPS the competitor pages provided in the research. Cover everything they cover, then go further — more specific, better organised, more trustworthy.

Write plain, authoritative British English. No hype, no filler, no purple prose. Never invent statistics, prices, percentages, certifications, grants, phone numbers, emails, dates or customer names — if a figure is not established, keep the claim qualitative. Use the research ONLY for topic coverage and structure, never to copy wording or lift unverified numbers.

WRITE FOR THE READER (audience-first — this matters most; earlier drafts were too generic and textbook):
- Work out WHO the page is for from the brief (e.g. business owners / facilities managers, or homeowners) and write to their actual priorities: cost, payback drivers, disruption, reliability, warranties, and the practical next step.
- Lead with the reader's outcome and concrete specifics, NOT a dictionary definition. NEVER open a section with "X refers to…", "X is the installation of…", "X is a system that…", or "Understanding X". Assume they already know what solar is — tell them what it means for THEIR site and why it's worth their time.
- Be concrete and differentiated: name real options/methods and real next steps rather than explaining the concept in the abstract. Good example of the register to hit: "Commercial solar designed around your half-hourly demand, not your roof area — in-roof, on-roof, flat-roof, ground-mount or carport, MCS-certified and built to last." Prefer specific nouns and outcomes over encyclopaedic filler.

Return ONLY valid JSON of this exact shape (no prose, no markdown, no code fences):
{ "seo": { "title": "...", "description": "...", "slug": "kebab-slug" }, "blocks": [ { "t": <type>, "p": { ...fields } }, ... ] }

SEO (for Google indexing):
- Put the primary keyword/topic naturally in seo.title, the hero headline, the first intro paragraph and the slug.
- seo.title ~50–60 chars; seo.description 120–160 chars with a clear benefit + the topic; slug = short kebab-case, no leading slash.
- Give each section a distinct title that targets a relevant sub-topic (clear heading hierarchy).

GEO / AEO (for AI answer engines — Google AI Overviews, ChatGPT, Perplexity):
- Open the page's first text section with a DIRECT 1–2 sentence answer to the reader's core question, then expand.
- Include a strong faq block: 5–8 real "People Also Ask"-style questions with concrete, self-contained answers.
- Make claims specific, quotable and citeable; prefer concrete facts and practical takeaways over vague statements.

STRUCTURE — use the RIGHT block for each idea. This is critical: do NOT output a wall of "rich" text sections.
- Produce 8 to 12 blocks with VARIED types. A strong page looks like:
  hero → media (intro that leads with the direct answer) → grid (key benefits/features) → steps (how it works / the process) → [optional: stats, split for home-vs-business, funding, casestudy, testi] → faq → cta.
- You MUST include a grid OR a steps block, and you MUST include an faq block (5–8 questions).
- Use AT MOST 2 "rich" blocks in the entire page, and NEVER place two rich blocks back-to-back. Turn list-like, step-like, comparison or benefit content into grid / steps / split / stats / funding blocks — these read far better than prose. Reach for "rich" only for genuine long-form explanation that no structured block fits.
- Each rich block = 2–3 substantial paragraphs. Every section must add DISTINCT value; never repeat a point across sections.
- Keep sections scannable: steps = 3–8 steps (up to ~10 only for a genuinely detailed end-to-end process), grid = 3 or 4 cards, funding = 3 cards. Card titles are short; card text is 1–2 tight sentences, not a paragraph.

RULES:
- Use ONLY the block types and fields below. Any other type or field is discarded.
- Do NOT set image fields (img) — leave images out; the user adds photos afterwards. Do NOT invent ids.

BLOCK TYPES:
hero  { eyebrow, headline, sub, ctaLabel, ctaHref, tags, dark:true }  // page banner. headline = the page's main H1.
stats { items:[{ n:"55 kWp", k:"System size" }] }  // 2-4 short stat items.
grid  { eyebrow, title, cols:3, items:[{ icon, title, desc }] }  // feature cards. icon from: solar,battery,heatpump,ev,home,building,shield,coin,grant,warehouse,monitor,clock,bolt,sun,leaf,pound,chart,check,star,map,wrench,users,award,factory,plug,target.
split { lIcon:"home", lt, ld, lb:[".."], lc, rIcon:"building", rt, rd, rb:[".."], rc }  // two side-by-side cards (home vs business), lb/rb are bullet arrays.
media { eyebrow, title, text, side:"right", cta, ctaHref }  // one image-and-text row (image left blank).
steps { eyebrow, title, items:[{ title, text }] }  // numbered process, 3-8 steps (up to ~10 for a detailed end-to-end process).
funding { eyebrow, title, sub, items:[{ title, text }], cta, ctaHref }  // finance/grant cards.
explorer { eyebrow, title, sub, items:[{ title, text, cta, ctaHref }] }  // dark interactive "feature explorer": 3-6 options a visitor clicks to expand; leave images out.
faq   { eyebrow, title, items:[{ q, a }] }  // Q&A accordion.
testi { eyebrow, title, items:[{ stars:5, quote, name, loc }] }  // testimonials. Mark quotes as illustrative in footnote if invented.
pricing { eyebrow, title, plans:[{ name, price, per, feats:[".."], cta, ctaHref, hl:false }] }  // set hl:true on one recommended plan.
casestudy { eyebrow, title, items:[{ loc, title, stat, statlabel }] }  // project cards with a headline stat.
gallery { eyebrow, title, sub, items:[{ loc }] }  // photo grid (captions only).
cta   { headline, sub, btn, btnHref }  // closing call-to-action band.
rich  { html }  // long-form prose. Allowed HTML only: <p> <strong> <em> <a> <br> <ul> <ol> <li> <h3> <h4> <blockquote>. No inline styles, images or scripts.

Hrefs: use "#quote" for quote CTAs, "/commercial-funding" for business/funding, or a real internal path. Keep the JSON compact and valid.`;

/** Safety net for the model over-using rich blocks: fold any back-to-back rich
 *  blocks into one so the page never renders as a wall of prose sections. Lossless
 *  (their HTML is concatenated) and order-preserving. */
function mergeAdjacentRich(blocks: CmsBlock[]): CmsBlock[] {
  const out: CmsBlock[] = [];
  for (const b of blocks) {
    const prev = out[out.length - 1];
    if (b.t === 'rich' && prev && prev.t === 'rich') {
      const pp = prev.p as Record<string, unknown>;
      const a = String(pp.html || '');
      const c = String((b.p as Record<string, unknown>).html || '');
      pp.html = a && c ? a + '\n' + c : a || c;
    } else {
      out.push(b);
    }
  }
  return out;
}

/** Research-driven, SEO/GEO-optimised page generator. Reuses the OpenRouter config
 *  from src/lib/blog/ai.ts; writing model via pageModel(); optional live web research
 *  via researchTopic(). Returns validated blocks + SEO metadata. */
export async function generatePage(
  prompt: string,
  context?: string,
): Promise<{ blocks: CmsBlock[]; seo: PageSeo; debug: { model: string; rawCount: number; keptCount: number } }> {
  const { apiKey, baseUrl } = aiConfig();
  if (!apiKey) throw new Error('AI is not configured. Set OPENROUTER_API_KEY (or AI_API_KEY).');

  const topic = String(prompt || '').trim().slice(0, 4000);
  const ctx = String(context || '').trim().slice(0, 2000);
  const research = await researchTopic(topic);

  const userMessage =
    (ctx ? `Current page context (match its tone; do not duplicate sections that already exist):\n${ctx}\n\n` : '') +
    (research
      ? `RESEARCH — current top-ranking pages for this topic (use for coverage & structure only; never copy wording or unverified numbers):\n${research}\n\n`
      : `No live research was available — write from your own expertise.\n\n`) +
    `Write the most comprehensive, better-structured and more helpful page than the sources above, for this brief. Return ONLY the JSON object described in the system message:\n\n${topic}`;

  // Try the configured/strong model first, then fall back to widely-available models
  // if it is unavailable (e.g. a retired/renamed OpenRouter slug → 404 "no endpoints").
  const primary = pageModel();
  const candidates = [primary];
  if (!candidates.includes('openai/gpt-4o')) candidates.push('openai/gpt-4o');
  if (!candidates.includes('openai/gpt-4o-mini')) candidates.push('openai/gpt-4o-mini');

  let content: string | undefined;
  let usedModel = primary;
  let lastErr = '';
  for (const model of candidates) {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://heliaxis.co.uk',
        'X-Title': 'Heliaxis CMS Page Builder',
      },
      body: JSON.stringify({
        model,
        temperature: 0.6,
        max_tokens: 8000,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: userMessage },
        ],
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      content = data.choices?.[0]?.message?.content;
      usedModel = model;
      if (content) break;
      lastErr = 'empty response';
      continue;
    }

    const errText = await res.text().catch(() => '');
    lastErr = `${res.status}: ${errText.slice(0, 200)}`;
    // Only fall through to the next candidate when the model itself is unavailable;
    // for auth/rate-limit/other errors, fail fast with the real message.
    const modelUnavailable =
      res.status === 404 || /no endpoints|not a valid model|model_not_found|does not exist/i.test(errText);
    if (!modelUnavailable) throw new Error(`AI request failed (${lastErr})`);
  }

  if (!content) throw new Error(`AI request failed (${lastErr || 'no usable model'})`);

  const parsed = extractJson(content) as { blocks?: unknown; seo?: unknown } | unknown[];
  const rawBlocks = Array.isArray(parsed) ? parsed : (parsed as { blocks?: unknown }).blocks;
  const rawCount = Array.isArray(rawBlocks) ? rawBlocks.length : 0;
  const blocks = mergeAdjacentRich(normalizeBlocks(rawBlocks));
  const heroBlock = blocks.find((b) => b.t === 'hero');
  const fallbackTitle = heroBlock ? String((heroBlock.p as Record<string, unknown>).headline || topic) : topic;
  const seo = sanitizeSeo(Array.isArray(parsed) ? undefined : (parsed as { seo?: unknown }).seo, fallbackTitle);
  return { blocks, seo, debug: { model: usedModel, rawCount, keptCount: blocks.length } };
}

/** @deprecated use generatePage — kept so existing imports keep working. */
export async function generatePageBlocks(prompt: string, context?: string): Promise<CmsBlock[]> {
  return (await generatePage(prompt, context)).blocks;
}
