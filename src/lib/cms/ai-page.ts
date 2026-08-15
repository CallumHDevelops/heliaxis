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

function extractJson(text: string): unknown {
  const trimmed = String(text || '').trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const rawText = fence ? fence[1].trim() : trimmed;
  return JSON.parse(rawText);
}

const SYSTEM = `You are a page-layout assistant for the Heliaxis CMS (Heliaxis is an MCS-certified solar, battery and energy installer in South Wales, UK). The user describes a page. You return the sections ("blocks") that build it, in reading order.

Write practical, trustworthy British English. No hype. Never invent statistics, prices, certifications, grants, phone numbers, emails or customer data — if a figure is unknown, keep copy qualitative.

Return ONLY valid JSON of this exact shape (no prose, no markdown):
{ "blocks": [ { "t": <type>, "p": { ...fields } }, ... ] }

Rules:
- 3 to 8 blocks. A good page usually opens with a hero and ends with a cta.
- Use ONLY these block types and fields. Any other type or field is discarded.
- Do NOT set image fields (img) — leave images out; the user adds photos afterwards. Do NOT invent ids.

BLOCK TYPES:
hero  { eyebrow, headline, sub, ctaLabel, ctaHref, tags, dark:true }  // page banner. headline = the page's main H1.
stats { items:[{ n:"55 kWp", k:"System size" }] }  // 2-4 short stat items.
grid  { eyebrow, title, cols:3, items:[{ icon, title, desc }] }  // feature cards. icon from: solar,battery,heatpump,ev,home,building,shield,coin,grant,warehouse,monitor,clock,bolt,sun,leaf,pound,chart,check,star,map,wrench,users,award,factory,plug,target.
split { lIcon:"home", lt, ld, lb:[".."], lc, rIcon:"building", rt, rd, rb:[".."], rc }  // two side-by-side cards (home vs business), lb/rb are bullet arrays.
media { eyebrow, title, text, side:"right", cta, ctaHref }  // one image-and-text row (image left blank).
steps { eyebrow, title, items:[{ title, text }] }  // numbered process, 3-5 steps.
funding { eyebrow, title, sub, items:[{ title, text }], cta, ctaHref }  // finance/grant cards.
faq   { eyebrow, title, items:[{ q, a }] }  // Q&A accordion.
testi { eyebrow, title, items:[{ stars:5, quote, name, loc }] }  // testimonials. Mark quotes as illustrative in footnote if invented.
pricing { eyebrow, title, plans:[{ name, price, per, feats:[".."], cta, ctaHref, hl:false }] }  // set hl:true on one recommended plan.
casestudy { eyebrow, title, items:[{ loc, title, stat, statlabel }] }  // project cards with a headline stat.
gallery { eyebrow, title, sub, items:[{ loc }] }  // photo grid (captions only).
cta   { headline, sub, btn, btnHref }  // closing call-to-action band.
rich  { html }  // long-form prose. Allowed HTML only: <p> <strong> <em> <a> <br> <ul> <ol> <li> <h3> <h4> <blockquote>. No inline styles, images or scripts.

Hrefs: use "#quote" for quote CTAs, "/commercial-funding" for business/funding, or a real internal path. Keep the JSON compact and valid.`;

/** Provider-agnostic: reuses aiConfig() from src/lib/blog/ai.ts (OpenRouter now; swap via AI_BASE_URL/AI_API_KEY/AI_MODEL). */
export async function generatePageBlocks(prompt: string, context?: string): Promise<CmsBlock[]> {
  const { apiKey, baseUrl, model } = aiConfig();
  if (!apiKey) throw new Error('AI is not configured. Set OPENROUTER_API_KEY (or AI_API_KEY).');

  const topic = String(prompt || '').trim();
  const ctx = String(context || '').trim().slice(0, 2000);
  const userMessage =
    (ctx ? `Current page context (match its tone; avoid duplicating sections that already exist):\n${ctx}\n\n` : '') +
    `Build the page for this brief. Return ONLY the JSON object described in the system message:\n\n${topic}`;

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
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: userMessage },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`AI request failed (${res.status}): ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('AI returned an empty response');

  const parsed = extractJson(content) as { blocks?: unknown } | unknown[];
  const rawBlocks = Array.isArray(parsed) ? parsed : (parsed as { blocks?: unknown }).blocks;
  return normalizeBlocks(rawBlocks);
}
