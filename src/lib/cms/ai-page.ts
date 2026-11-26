import { aiConfig, isAiConfigured } from '@/lib/blog/ai';
import { recordChatUsage } from '@/lib/ai-usage';
import { DEFAULT_FACTS, type Facts } from './facts';
import { briefMessage, buildSystemPrompt } from './builder-prompt';
import { cleanBrief, shapePage, type Brief } from './blueprints';
import { checkPage, type Issue } from './validate';

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
  testi: { eyebrow: 'Real customers', title: 'What customers say', footnote: '', speed: 36, items: [{ stars: 5, quote: 'Great service.', name: 'Name', loc: 'Town · Solar' }] },
  pricing: { eyebrow: 'Options', title: 'Choose how you fund it', plans: [{ name: 'Plan', price: 'From £0', per: 'one-off', feats: ['Feature one'], cta: 'Get a quote', ctaHref: '#quote', hl: false }] },
  casestudy: { eyebrow: 'Our work', title: 'Recent projects', items: [{ img: '', loc: 'Location', title: 'Project', stat: '00%', statlabel: 'Result' }] },
  gallery: { eyebrow: 'Recent work', title: 'Recent installs', sub: '', featuredLabel: 'Featured install', footnote: '', featuredIndex: 0, items: [{ img: '', loc: 'Location', featured: true }] },
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

const TYPE_KEYS = ['t', 'type', 'blockType', 'block'];

/** Locate the block type + props tolerantly — strong models emit varied shapes:
 *  {t,p}, {type,props}, flattened {t,...fields}, or object-keyed {hero:{...}}. Only
 *  HOW we find type/props is relaxed; the field-level whitelist (mergeObj against
 *  DEFAULTS) and the per-type hardening below are unchanged, so nothing unsafe leaks. */
function readBlock(raw: unknown): { t: string; p: Record<string, unknown> } | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  let t = '';
  for (const k of TYPE_KEYS) {
    if (o[k] != null && o[k] !== '') { t = String(o[k]).trim().toLowerCase(); break; }
  }
  let p: unknown;
  // Object-keyed shape: { "hero": { ...fields } }
  if (!ALLOWED.has(t)) {
    const typeKey = Object.keys(o).find(
      (k) => ALLOWED.has(k.trim().toLowerCase()) && o[k] && typeof o[k] === 'object',
    );
    if (typeKey) { t = typeKey.trim().toLowerCase(); p = o[typeKey]; }
  }
  if (!ALLOWED.has(t)) return null;
  if (!p || typeof p !== 'object') {
    // Explicit props wrapper.
    for (const k of ['p', 'props']) {
      if (o[k] && typeof o[k] === 'object') { p = o[k]; break; }
    }
    // A generic container (content/data/fields/attributes) only counts as the props
    // wrapper if it actually carries this type's fields — otherwise it's an incidental
    // field on a flattened block and must not hijack the real siblings.
    if (!p || typeof p !== 'object') {
      const defKeys = Object.keys(DEFAULTS[t] || {});
      for (const k of ['content', 'data', 'fields', 'attributes']) {
        const v = o[k];
        if (v && typeof v === 'object' && Object.keys(v as object).some((kk) => defKeys.includes(kk))) {
          p = v;
          break;
        }
      }
    }
    // Flattened fields: { t:'hero', headline:'…' }
    if (!p || typeof p !== 'object') {
      const clone: Record<string, unknown> = { ...o };
      for (const k of TYPE_KEYS) delete clone[k];
      p = clone;
    }
  }
  return { t, p: p as Record<string, unknown> };
}

function normalizeBlock(raw: unknown): CmsBlock | null {
  const rb = readBlock(raw);
  if (!rb) return null;
  const t = rb.t;
  const p = mergeObj(DEFAULTS[t], rb.p);
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

/** The block-type reference given to the model: which blocks and fields exist. The rules about what to write come from builder-prompt.ts. */
const BLOCK_DOC = `BLOCK TYPES:
hero  { eyebrow, headline, sub, ctaLabel, ctaHref, tags, dark:true }  // page banner. headline = the page's main H1.
grid  { eyebrow, title, cols:3, items:[{ icon, title, desc }] }  // feature cards. icon from: solar,battery,heatpump,ev,home,building,shield,coin,grant,warehouse,monitor,clock,bolt,sun,leaf,pound,chart,check,star,map,wrench,users,award,factory,plug,target.
split { lIcon:"home", lt, ld, lb:[".."], lc, rIcon:"building", rt, rd, rb:[".."], rc }  // two side-by-side cards, lb/rb are bullet arrays. Tailor BOTH sides to THIS page's audience and pick fitting icons/titles — do NOT default to generic "home vs business" unless the page genuinely serves both. Only use this block when a real two-way comparison helps the reader.
media { eyebrow, title, text, side:"right", cta, ctaHref }  // one image-and-text row (image left blank).
steps { eyebrow, title, items:[{ title, text }] }  // numbered process, 3-8 steps (up to ~10 for a detailed end-to-end process).
funding { eyebrow, title, sub, items:[{ title, text }], cta, ctaHref }  // finance/grant cards.
explorer { eyebrow, title, sub, items:[{ title, text, cta, ctaHref }] }  // dark interactive "feature explorer": 3-6 options a visitor clicks to expand; leave images out.
faq   { eyebrow, title, items:[{ q, a }] }  // Q&A accordion.
testi { eyebrow, title }  // testimonials: the system fills this from approved reviews. Write no quotes.
pricing { eyebrow, title, plans:[{ name, price, per, feats:[".."], cta, ctaHref, hl:false }] }  // set hl:true on one recommended plan.
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
  /** usageRef: saved as ai_usage.ref on every model call, so a caller can sum this run's own cost. */
  opts: { usageRef?: string; brief?: Partial<Brief>; facts?: Facts; repair?: boolean } = {},
): Promise<{
  blocks: CmsBlock[];
  seo: PageSeo;
  issues: Issue[];
  debug: { model: string; rawCount: number; keptCount: number; firstKeys: string[]; repaired?: boolean };
}> {
  const { apiKey, baseUrl } = aiConfig();
  if (!apiKey) throw new Error('AI is not configured. Set OPENROUTER_API_KEY (or AI_API_KEY).');

  const topic = String(prompt || '').trim().slice(0, 4000);
  const ctx = String(context || '').trim().slice(0, 2000);
  const research = await researchTopic(topic);

  const facts = opts.facts ?? DEFAULT_FACTS;
  const brief = cleanBrief(opts.brief);
  const systemPrompt = buildSystemPrompt(facts, brief, BLOCK_DOC);
  const userMessage =
    (ctx ? `Current page context (match its tone; do not duplicate sections that already exist):\n${ctx}\n\n` : '') +
    (research
      ? `RESEARCH — current top-ranking pages for this topic (use for coverage & structure only; never copy wording or unverified numbers):\n${research}\n\n`
      : `No live research was available — write from your own expertise.\n\n`) +
    `Write the most comprehensive, better-structured and more helpful page than the sources above, for this brief. Return ONLY the JSON object described in the system message:\n\n${briefMessage(brief, topic)}`;

  // Try the configured/strong model first, then fall back to widely-available models
  // if it is unavailable (e.g. a retired/renamed OpenRouter slug → 404 "no endpoints").
  const primary = pageModel();
  const candidates = [primary];
  if (!candidates.includes('openai/gpt-4o')) candidates.push('openai/gpt-4o');
  if (!candidates.includes('openai/gpt-4o-mini')) candidates.push('openai/gpt-4o-mini');

  const MAX_TOKENS = 6000;
  const CREDITS_MSG =
    'AI credits are low on OpenRouter — top up at https://openrouter.ai/settings/credits, then try again.';
  const callChat = (model: string, maxTokens: number, messages?: { role: string; content: string }[]) =>
    fetch(`${baseUrl}/chat/completions`, {
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
        max_tokens: maxTokens,
        messages: messages ?? [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      }),
    });

  let content: string | undefined;
  let usedModel = primary;
  let lastErr = '';
  for (const model of candidates) {
    let res = await callChat(model, MAX_TOKENS);

    // Low balance: OpenRouter (402) reports the max output tokens we can afford. If
    // that's enough for a usable page, retry within budget rather than failing.
    if (res.status === 402) {
      const errText = await res.text().catch(() => '');
      const afford = parseInt((errText.match(/afford\s+(\d+)/i) || [])[1] || '0', 10);
      if (afford >= 900) res = await callChat(model, Math.max(900, afford - 96));
      else throw new Error(CREDITS_MSG);
    }

    if (res.ok) {
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
      await recordChatUsage('cms_page', model, data.usage, opts.usageRef);
      content = data.choices?.[0]?.message?.content;
      usedModel = model;
      if (content) break;
      lastErr = 'empty response';
      continue;
    }

    const errText = await res.text().catch(() => '');
    lastErr = `${res.status}: ${errText.slice(0, 200)}`;
    if (res.status === 402) throw new Error(CREDITS_MSG);
    // Only fall through to the next candidate when the model itself is unavailable;
    // for auth/rate-limit/other errors, fail fast with the real message.
    const modelUnavailable =
      res.status === 404 || /no endpoints|not a valid model|model_not_found|does not exist/i.test(errText);
    if (!modelUnavailable) throw new Error(`AI request failed (${lastErr})`);
  }

  if (!content) throw new Error(`AI request failed (${lastErr || 'no usable model'})`);

  const parsed = extractJson(content) as { blocks?: unknown; seo?: unknown } | unknown[];
  const rawBlocks = Array.isArray(parsed) ? parsed : (parsed as { blocks?: unknown }).blocks;
  const rawArr = Array.isArray(rawBlocks) ? rawBlocks : [];
  const rawCount = rawArr.length;
  const firstKeys =
    rawArr[0] && typeof rawArr[0] === 'object' ? Object.keys(rawArr[0] as object).slice(0, 8) : [];
  const kindSlug = (slug: string) =>
    brief.pageType === 'blog' ? `/blog/${slug}` : brief.pageType === 'area' ? `/areas/${slug}` : brief.pageType === 'case-study' ? `/case-studies/${slug}` : `/${slug}`;
  const finish = (raw: unknown, rawSeo: unknown) => {
    const shaped = shapePage(mergeAdjacentRich(normalizeBlocks(raw)), brief, facts) as CmsBlock[];
    const hero = shaped.find((b) => b.t === 'hero');
    const fallbackTitle = hero ? String((hero.p as Record<string, unknown>).headline || topic) : topic;
    const seo = sanitizeSeo(rawSeo, fallbackTitle);
    // Links to other pages are checked at publish, when the whole site is known; a draft cannot know them yet.
    const issues = checkPage(
      { name: seo.title, slug: kindSlug(seo.slug), type: brief.pageType === 'landing' ? 'landing' : 'page', seo: { title: seo.title, desc: seo.description, slug: seo.slug }, blocks: shaped },
      { facts, pageSlugs: [], images: [], today: new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) },
    ).filter((i) => i.code !== 'broken-link');
    return { shaped, seo, issues };
  };
  const rawSeoIn = Array.isArray(parsed) ? undefined : (parsed as { seo?: unknown }).seo;
  let { shaped: blocks, seo, issues } = finish(rawBlocks, rawSeoIn);

  // One repair pass for what the writer can fix in words. Pictures, proof and links are not the writer's to fix, so they never trigger it.
  const FIXABLE = new Set(['placeholder', 'link-mismatch', 'money-figure', 'percentage-figure', 'count-claim', 'years-in-business', 'warranty-not-in-facts', 'credential-not-held', 'funding-expired', 'rating-claim', 'place-in-h1', 'place-names', 'button-repeat', 'button-label']);
  const fixable = issues.filter((i) => FIXABLE.has(i.code));
  let repaired = false;
  if (opts.repair !== false && fixable.length) {
    try {
      const fixMsg = `The page you wrote broke these rules. Return the complete corrected JSON (same shape), changing only what is needed to fix them and keeping everything else:\n${fixable.slice(0, 12).map((i) => `- ${i.message}`).join('\n')}`;
      const res = await callChat(usedModel, MAX_TOKENS, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
        { role: 'assistant', content },
        { role: 'user', content: fixMsg },
      ]);
      if (res.ok) {
        const data = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
        await recordChatUsage('cms_page', usedModel, data.usage, opts.usageRef);
        const again = data.choices?.[0]?.message?.content;
        if (again) {
          const p2 = extractJson(again) as { blocks?: unknown; seo?: unknown } | unknown[];
          const second = finish(Array.isArray(p2) ? p2 : (p2 as { blocks?: unknown }).blocks, Array.isArray(p2) ? undefined : (p2 as { seo?: unknown }).seo);
          // Keep the repair only if it is better.
          if (second.shaped.length >= 6 && second.issues.filter((i) => i.level === 'error').length <= issues.filter((i) => i.level === 'error').length) {
            ({ shaped: blocks, seo, issues } = second);
            repaired = true;
          }
        }
      }
    } catch {
      /* the first draft stands */
    }
  }
  return { blocks, seo, issues, debug: { model: usedModel, rawCount, keptCount: blocks.length, firstKeys, repaired } };
}

/** @deprecated use generatePage — kept so existing imports keep working. */
export async function generatePageBlocks(prompt: string, context?: string): Promise<CmsBlock[]> {
  return (await generatePage(prompt, context)).blocks;
}
