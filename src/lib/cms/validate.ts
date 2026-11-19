/**
 * Page checks: the pre-publish checklist from PAGE-BUILDER-SPEC.md, as pure code. Given a page, the facts sheet and a little
 * context (the other pages, the image library, today's date), it returns errors (these block Publish) and warnings (shown in the
 * editor). Every rule has a code, so the builder can read the same list it is judged against, and so each can be tested alone.
 *
 * Where this departs from the spec, on purpose: a hero with no background image is a warning, not an error (the home page's design
 * does not use one); descriptions are checked against 120 to 160 characters, the band the CMS guide teaches.
 */

import { allowedWarrantyYears, fundingExpired, heldCredentials, ratingShown, type Facts } from './facts';

export type Level = 'error' | 'warning';
export type Issue = { level: Level; code: string; message: string; blockId?: string; blockType?: string };
export type PageKind = 'home' | 'service' | 'blog' | 'case-study' | 'area' | 'landing';

export type CmsBlockLike = { id?: string; t?: string; p?: Record<string, unknown> };
export type CmsPageLike = {
  name?: string;
  slug?: string;
  type?: string;
  _draft?: unknown;
  seo?: { title?: string; desc?: string; slug?: string; noindex?: boolean };
  blocks?: CmsBlockLike[];
};
export type LibImageLite = { id?: string; source?: string; approved?: boolean; kind?: string };

export type CheckContext = {
  facts: Facts;
  /** Slugs of every page in the site document (links to them resolve). */
  pageSlugs: string[];
  images: LibImageLite[];
  /** YYYY-MM-DD, for funding end dates. */
  today: string;
  /** The other pages, for the area-page similarity check. */
  pages?: CmsPageLike[];
};

/* ── Small helpers ─────────────────────────────────────────────────────────────── */

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const s = (v: unknown) => (typeof v === 'string' ? v : '');
const norm = (v: string) => v.toLowerCase().replace(/\s+/g, '');

export function stripHtml(h: string): string {
  return h
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export const wordCount = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

export function pageKind(page: CmsPageLike): PageKind {
  const slug = s(page.slug) || '/';
  if (slug === '/' || slug === '') return 'home';
  if (slug.startsWith('/blog/')) return 'blog';
  if (slug.startsWith('/areas/')) return 'area';
  if (page.type === 'landing' || slug.startsWith('/lp/')) return 'landing';
  if (slug.startsWith('/case-studies/') || /case-study$/.test(slug) || /case study/i.test(s(page.name))) return 'case-study';
  return 'service';
}

/** Pages written for businesses, where a link to the commercial funding page is right. */
const BUSINESS_PAGE = /commercial|business|care-home|agricultur|farm|manufactur|warehous|ppa|maintenance|funding|o-m/i;

/* ── Reading blocks ──────────────────────────────────────────────────────────────── */

export type Piece = { text: string; blockId?: string; blockType?: string; key: string };
type ImageRef = { empty: boolean; src: string; libId: string; alt: string; decorative: boolean };

const SKIP_KEY = /(^id$|^_pb$|^t$|^anchor$|^side$|^fit$|^variant$|^theme$|^cols$|^speed$|^stars$|^focus[XY]$|^zoom$|^bgOverlay$|^featuredIndex$|^dark$|^rating|^icon$|Icon$|(^|[a-z])img$|Img$|Href$|href$|Disabled$|Pulse$|^hide[A-Z])/;
const URLISH = /^(https?:|\/|#|tel:|mailto:|data:)/i;

/** Every human-readable string in a block, with where it was found. */
export function blockPieces(b: CmsBlockLike): Piece[] {
  const out: Piece[] = [];
  const walk = (v: unknown, key: string) => {
    if (typeof v === 'string') {
      if (SKIP_KEY.test(key.split('.').pop() ?? key)) return;
      const t = key.endsWith('html') ? stripHtml(v) : v.trim();
      if (t && !URLISH.test(t)) out.push({ text: t, blockId: b.id, blockType: b.t, key });
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${key}.${i}`));
    else if (isObj(v)) for (const [k, x] of Object.entries(v)) walk(x, key ? `${key}.${k}` : k);
  };
  if (isObj(b.p)) walk(b.p, '');
  return out;
}

/** An image field is "", a URL, or a small JSON object with the alt text and the library id. */
export function parseImage(v: unknown): ImageRef {
  if (typeof v !== 'string' || !v.trim()) return { empty: true, src: '', libId: '', alt: '', decorative: false };
  const t = v.trim();
  if (t.startsWith('{')) {
    try {
      const o = JSON.parse(t) as Record<string, unknown>;
      const src = s(o.src);
      const libId = s(o.libId);
      return { empty: !src && !libId, src, libId, alt: s(o.alt).trim(), decorative: o.decorative === true };
    } catch {
      return { empty: false, src: t, libId: '', alt: '', decorative: false };
    }
  }
  return { empty: false, src: t, libId: '', alt: '', decorative: false };
}

type ImageSlot = { ref: ImageRef; block: CmsBlockLike; slot: string; required: boolean };

function imageSlots(b: CmsBlockLike): ImageSlot[] {
  const p = isObj(b.p) ? b.p : {};
  const out: ImageSlot[] = [];
  const add = (v: unknown, slot: string, required: boolean) => out.push({ ref: parseImage(v), block: b, slot, required });
  if (b.t === 'hero') {
    add(p.bgImg, 'hero background', false);
  } else if (b.t === 'media') {
    add(p.img, 'media picture', true);
  } else if (b.t === 'explorer' || b.t === 'gallery' || b.t === 'casestudy') {
    (Array.isArray(p.items) ? p.items : []).forEach((it, i) => isObj(it) && add(it.img, `${b.t} item ${i + 1}`, true));
  }
  return out;
}

type LinkRef = { label: string; href: string; block: CmsBlockLike };

/** Every button and link in a block, with the destination it really has (an unset link means the quote form). */
export function blockLinks(b: CmsBlockLike): LinkRef[] {
  const p = isObj(b.p) ? b.p : {};
  const out: LinkRef[] = [];
  const push = (label: unknown, href: unknown, implicit?: string) => {
    const l = s(label).trim();
    const h = s(href).trim() || (l ? implicit ?? '' : '');
    if (h) out.push({ label: l, href: h, block: b });
  };
  const generic = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(generic);
    if (!isObj(v)) return;
    for (const [k, x] of Object.entries(v)) {
      if (k.endsWith('Href') && typeof x === 'string' && x.trim()) {
        const base = k.slice(0, -4);
        push(base === 'cta' && b.t === 'hero' ? v.ctaLabel : v[base] ?? (base === 'cta' ? v.ctaLabel : ''), x);
      } else if (k === 'href' && typeof x === 'string' && x.trim()) push(v.label, x);
      else if (typeof x === 'object') generic(x);
    }
  };
  generic(p);
  // Buttons with no link chosen go to the quote form.
  const q = '#quote';
  if (b.t === 'hero' && !p.ctaDisabled && s(p.ctaLabel).trim() && !s(p.ctaHref).trim()) push(p.ctaLabel, '', q);
  if (b.t === 'cta' && !p.ctaDisabled && s(p.btn).trim() && !s(p.btnHref).trim()) push(p.btn, '', q);
  if (b.t === 'split') {
    if (s(p.lc).trim() && !s(p.lcHref).trim()) push(p.lc, '', q);
    if (s(p.rc).trim() && !s(p.rcHref).trim()) push(p.rc, '', q);
  }
  if (b.t === 'media' && !p.ctaDisabled && s(p.cta).trim() && !s(p.ctaHref).trim()) push(p.cta, '', q);
  if (b.t === 'explorer') (Array.isArray(p.items) ? p.items : []).forEach((it) => isObj(it) && s(it.cta).trim() && !s(it.ctaHref).trim() && push(it.cta, '', q));
  return out;
}

/* ── Internal routes ────────────────────────────────────────────────────────────── */

/** Pages in the app itself (not the CMS), so links to them are fine. */
export const APP_ROUTES = [
  '/',
  '/blog',
  '/book-a-call',
  '/book-a-survey',
  '/commercial-funding',
  '/data-deletion',
  '/free-solar-quote',
  '/get-a-quote',
  '/newport-net-zero-grant',
  '/privacy-policy',
  '/roof-designer',
  '/solar-estimator',
  '/terms',
  '/updates',
  '/warehousing',
];

/** Pages whose job is to hold a contact form: a link to one is a way to get in touch. */
const CONTACT_PATHS = new Set(['/free-solar-quote', '/get-a-quote', '/book-a-survey', '/book-a-call']);

const cleanPath = (h: string) => {
  const p = h.split(/[?#]/)[0].replace(/\/+$/, '');
  return p === '' ? '/' : p;
};

/* ── Text patterns ──────────────────────────────────────────────────────────────── */

const SAMPLE_TEXT = new Set(
  [
    'eyebrow', 'your headline here', 'supporting sentence.', 'point one', 'point two', 'text.', 'option', 'detail.', 'description.', 'great service.',
    'a question?', 'an answer.', 'another?', 'another answer.', 'a section title', 'describe the benefit here.', 'item one', 'item two', 'item three',
    'town · solar', 'feature one', 'new section', 'untitled', 'untitled page', 'untitled article',
  ].map((x) => x.toLowerCase()),
);
const PLACEHOLDER = /\[\[\s*CONFIRM|lorem ipsum|\byour headline here\b|\buntitled (page|article)\b/i;

/** Schemes Heliaxis does not hold (as far as the facts sheet says), which pages must never name. */
const OTHER_SCHEMES = ['NICEIC', 'Gas Safe', 'Checkatrade', 'TrustATrader', 'Trusted Trader', 'HETAS', 'OFTEC', 'Constructionline', 'CHAS', 'Which? Trusted'];

const RATING_TEXT = /\b[1-5]\.\d\s*(?:\/\s*5|stars?|★)|★{3,}|\b(?:five|5)[- ]stars?\b|\bhighly rated\b|\brated (?:excellent|highly|\d)|\btop[- ]rated\b/i;
// Real boasts only. "Best for warehouses" is a recommendation, and is fine.
const SUPERLATIVE = /\b(?:the )?best (?:solar |battery |heat pump |ev )?(?:installers?|compan(?:y|ies)|providers?)\b|\bbest in\b|\bnumber (?:one|1)\b|\bno\.? ?1\b|\bleading (?:installer|provider|supplier|company)\b|\bcheapest\b|\bunbeatable\b|\bguaranteed to\b|\bnever (?:lose|fail)\b/i;
const COUNT_CLAIM = /\b(\d[\d,]*)\+?\s*(?:installs?|installations?|arrays|systems installed|homes|customers|projects|jobs)\b/gi;
const YEARS_IN_BUSINESS = /\b\d+\+?\s*[- ]?years?\b[^.]{0,40}\b(?:experience|in business|established|trading|serving)\b|\bsince\s+(?:19|20)\d\d\b|\bestablished\s+in\b/i;
const MONEY = /£\s?\d[\d,]*(?:\.\d+)?\s?(?:k|m|million)?/gi;
const PERCENT = /\b\d+(?:\.\d+)?\s?%/g;

/** Place names used to check that service pages stay area-neutral. */
const BASE_PLACES = ['South Wales', 'Wales', 'South West', 'Cardiff', 'Swansea', 'Newport', 'Bridgend', 'Cwmbran', 'Caerphilly', 'Pontypridd', 'Barry', 'Vale of Glamorgan', 'Bristol', 'Bath', 'Swindon', 'Gloucester', 'Cheltenham', 'Weston-super-Mare', 'Pembrokeshire', 'Carmarthenshire', 'Somerset', 'Gloucestershire'];

const escRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function placeRegex(facts: Facts): RegExp {
  const names = [...new Set([...BASE_PLACES, ...facts.towns])].sort((a, b) => b.length - a.length);
  return new RegExp(`\\b(?:${names.map(escRe).join('|')})\\b`, 'gi');
}

/* ── The checks ──────────────────────────────────────────────────────────────────── */

const BAD_LABEL = /^(learn more|read more|submit|click here|find out more)$/i;

function words(blocks: CmsBlockLike[]): number {
  return blocks.filter((b) => b.t !== 'footer').reduce((n, b) => n + blockPieces(b).reduce((m, pc) => m + wordCount(pc.text), 0), 0);
}

/** Everything wrong, or doubtful, on one page. */
export function checkPage(page: CmsPageLike, ctx: CheckContext): Issue[] {
  const issues: Issue[] = [];
  const add = (level: Level, code: string, message: string, b?: CmsBlockLike) => issues.push({ level, code, message, blockId: b?.id, blockType: b?.t });
  const blocks = (Array.isArray(page.blocks) ? page.blocks : []).filter(isObj) as CmsBlockLike[];
  const kind = pageKind(page);
  const slug = s(page.slug) || '/';
  const f = ctx.facts;
  const body = blocks.filter((b) => b.t !== 'footer');
  const pieces = body.flatMap(blockPieces);
  const seo = page.seo ?? {};

  /* Placeholders and sample text, on the blocks and the search listing */
  const listing = [s(page.name), s(seo.title), s(seo.desc)];
  for (const t of listing) if (PLACEHOLDER.test(t)) add('error', 'placeholder', `Placeholder text in the page name or search listing: “${t.slice(0, 60)}”.`);
  for (const pc of pieces) {
    if (PLACEHOLDER.test(pc.text) || SAMPLE_TEXT.has(pc.text.toLowerCase())) {
      add('error', 'placeholder', `Placeholder or sample text: “${pc.text.slice(0, 70)}”.`, { id: pc.blockId, t: pc.blockType });
    }
  }

  /* Contact: a form, or buttons to the quote form (which opens the quote drawer when the page has no form of its own) */
  const links = blocks.flatMap(blockLinks);
  const hasForm = blocks.some((b) => b.t === 'form');
  // A form, buttons to the quote form (the page then opens the quote drawer), a call, WhatsApp, or the pages that hold the forms.
  const contactLink = (h: string) => h === '#quote' || h.startsWith('/#quote') || /^(tel:|https?:\/\/wa\.me)/i.test(h) || CONTACT_PATHS.has(cleanPath(h));
  if (!hasForm && !links.some((l) => contactLink(l.href))) add('error', 'no-contact', 'Nothing on this page lets a reader get in touch: add a quote form, a button to the quote form, or a phone number.');

  /* Links */
  const anchors = new Set(blocks.map((b) => s(b.p?.anchor)).filter(Boolean));
  const routes = new Set([...APP_ROUTES, ...ctx.pageSlugs.map((x) => cleanPath(x))]);
  const audienceBusiness = BUSINESS_PAGE.test(`${slug} ${s(page.name)}`);
  for (const l of links) {
    const h = l.href;
    if (h === '#quote' || /^(tel:|mailto:|https?:)/i.test(h)) continue;
    if (h.startsWith('#')) {
      if (!anchors.has(h.slice(1))) add('error', 'broken-anchor', `The button “${l.label || h}” goes to ${h}, which is not on this page.`, l.block);
      continue;
    }
    if (h.startsWith('/')) {
      const path = cleanPath(h);
      if (!routes.has(path) && !/^\/(assets|api|_next)\//.test(path) && !path.startsWith('/blog/')) add('error', 'broken-link', `The link “${l.label || h}” goes to ${path}, which is not a page on the site.`, l.block);
      if (path === '/commercial-funding' && !audienceBusiness && kind !== 'home') add('error', 'link-mismatch', `“${l.label || h}” sends a homeowner page to the commercial funding page.`, l.block);
    }
  }

  /* Images */
  for (const b of blocks) {
    for (const sl of imageSlots(b)) {
      if (sl.ref.empty) {
        add(sl.required ? 'error' : 'warning', 'image-empty', `The ${sl.slot} has no picture.`, b);
        continue;
      }
      if (!sl.ref.decorative && !sl.ref.alt) add('error', 'image-alt', `The ${sl.slot} has no alt text.`, b);
      const lib = sl.ref.libId ? ctx.images.find((x) => x.id === sl.ref.libId) : undefined;
      if (lib?.source === 'ai') {
        if (lib.approved !== true) add('error', 'image-unapproved', `The ${sl.slot} is an AI image that nobody has approved.`, b);
        if (b.t === 'gallery' || b.t === 'casestudy') add('error', 'image-ai-as-install', `The ${sl.slot} is an AI image in a section that shows real installs.`, b);
      }
    }
  }

  /* Facts: ratings, counts, years, schemes, money */
  const hero = blocks.find((b) => b.t === 'hero');
  if (hero?.p && !hero.p.hideRating) {
    const hp = hero.p;
    const rv = s(hp.ratingValue).trim();
    const rp = s(hp.ratingPlatform).trim();
    if (rv && rp && !(ratingShown(f) && rv === f.rating.value)) add('error', 'rating-not-in-facts', 'The hero shows a review rating that is not verified on the facts sheet.', hero);
    const iv = s(hp.ratingInstalls).trim();
    if (iv && s(hp.ratingInstallsLabel).trim() && norm(iv) !== norm(f.installCount)) add('error', 'installs-not-in-facts', 'The hero shows an install figure that is not on the facts sheet.', hero);
  }
  const allowedMoney = new Set([...f.allowedFigures, ...f.funding.flatMap((x) => x.figures)].map(norm));
  const years = allowedWarrantyYears(f);
  const held = heldCredentials(f);
  for (const pc of pieces) {
    const t = pc.text;
    const at = { id: pc.blockId, t: pc.blockType };
    if (RATING_TEXT.test(t) && !(ratingShown(f) && t.includes(f.rating.value))) add('error', 'rating-claim', `A rating or review claim with nothing on the facts sheet behind it: “${t.slice(0, 70)}”.`, at);
    if (SUPERLATIVE.test(t)) add('error', 'superlative', `A claim the facts cannot back (“best”, “leading”…): “${t.slice(0, 70)}”.`, at);
    for (const m of t.matchAll(COUNT_CLAIM)) if (norm(m[1]) !== norm(f.installCount)) add('error', 'count-claim', `A count (“${m[0]}”) that is not on the facts sheet.`, at);
    if (YEARS_IN_BUSINESS.test(t)) add('error', 'years-in-business', `A claim about years of experience or when the business began: “${t.slice(0, 70)}”.`, at);
    for (const m of t.matchAll(/\b(\d+)[- ]?(?:year|yr)s?\b[^.]{0,40}\b(?:warrant|guarant)|\b(?:warrant|guarant)\w*[^.]{0,30}\b(\d+)[- ]?(?:year|yr)s?\b/gi)) {
      const n = Number(m[1] ?? m[2]);
      if (!years.has(n)) add('error', 'warranty-not-in-facts', `A ${n}-year warranty or guarantee that is not on the facts sheet.`, at);
      else if (!/manufacturer|heliaxis|workmanship|insurance/i.test(t)) add('warning', 'warranty-unattributed', 'A warranty length with no word saying whose warranty it is.', at);
    }
    for (const sch of OTHER_SCHEMES) {
      if (new RegExp(`\\b${escRe(sch)}`, 'i').test(t) && !held.some((h) => h === sch.toLowerCase())) add('error', 'credential-not-held', `${sch} is not one of the credentials on the facts sheet.`, at);
    }
    for (const m of t.matchAll(MONEY)) {
      if (allowedMoney.has(norm(m[0]))) continue;
      // A guide's worked example may carry sums, with its assumptions stated; anywhere else a figure must come from the facts sheet.
      if (kind === 'blog') add('warning', 'money-figure', `A money figure (${m[0].trim()}). In a worked example it needs its assumptions stated beside it; otherwise take it out.`, at);
      else add('error', 'money-figure', `A money figure (${m[0].trim()}) that is not on the facts sheet. Prices come from the packages, never from page copy.`, at);
    }
    for (const m of t.matchAll(PERCENT)) {
      const tok = norm(m[0]);
      if (![...allowedMoney].some((a) => a.includes(tok))) add('warning', 'percentage-figure', `A percentage (${m[0].trim()}) with no fact behind it. Check it before publishing.`, at);
    }
  }
  for (const fx of f.funding) {
    if (!fundingExpired(fx, ctx.today)) continue;
    if (fx.figures.some((fig) => pieces.some((pc) => pc.text.toLowerCase().includes(fig.toLowerCase())))) add('error', 'funding-expired', `“${fx.name}” ended on ${fx.until}; the page still mentions it.`);
  }

  /* Testimonials and case studies must be approved ones */
  for (const b of blocks.filter((x) => x.t === 'testi')) {
    const items = (Array.isArray(b.p?.items) ? b.p?.items : []) as unknown[];
    const approved = f.testimonials;
    const unmatched = items.filter((it) => !(isObj(it) && approved.some((a) => norm(a.name) === norm(s(it.name)) && norm(s(it.quote).replace(/["“”]/g, '')) === norm(a.quote.replace(/["“”]/g, '')))));
    if (unmatched.length) add('error', 'testimonial-not-approved', approved.length ? `${unmatched.length} testimonial(s) here are not on the facts sheet.` : 'This page has testimonials, but the facts sheet has no approved ones.', b);
    else if (b.p?.approved !== true) add('warning', 'testimonial-not-marked', 'These testimonials match the facts sheet, but the block is not marked approved, so the live site will hide it. Use “Use approved testimonials” on the block.', b);
  }
  for (const b of blocks.filter((x) => x.t === 'casestudy')) {
    const titles = [s(b.p?.title), ...((Array.isArray(b.p?.items) ? b.p?.items : []) as unknown[]).map((it) => (isObj(it) ? s(it.title) : ''))].filter(Boolean).map(norm);
    if (!titles.some((t) => f.caseStudies.some((c) => norm(c.title) === t && c.permission))) add('error', 'casestudy-not-approved', 'This case study is not on the facts sheet with the customer’s permission.', b);
  }

  /* Structure */
  for (const b of blocks.filter((x) => x.t === 'steps')) {
    const n = (Array.isArray(b.p?.items) ? b.p?.items : []).length;
    if (n !== 4 && n !== 8) add('warning', 'steps-count', `${n} steps: four or eight fit the grid best.`, b);
  }
  for (const b of blocks.filter((x) => x.t === 'grid')) {
    const items = (Array.isArray(b.p?.items) ? b.p?.items : []) as unknown[];
    const cols = Number(b.p?.cols) || 3;
    if (items.length % cols !== 0) add('warning', 'grid-count', `${items.length} cards in a ${cols}-column grid leaves a gap.`, b);
    if (items.some((it) => !(isObj(it) && s(it.desc).trim()))) add('warning', 'grid-empty', 'A card in this grid has no description.', b);
  }
  const labelUse = new Map<string, number>();
  for (const l of links) {
    if (!l.label) continue;
    if (BAD_LABEL.test(l.label)) add('warning', 'button-label', `“${l.label}” does not say what the reader gets.`, l.block);
    if (l.block.t === 'footer') continue;
    labelUse.set(l.label.toLowerCase(), (labelUse.get(l.label.toLowerCase()) ?? 0) + 1);
  }
  const heroLabel = s(hero?.p?.ctaLabel).trim().toLowerCase();
  const lastCta = [...blocks].reverse().find((b) => b.t === 'cta');
  const finalLabel = s(lastCta?.p?.btn).trim().toLowerCase();
  for (const [label, n] of labelUse) {
    const allowed = heroLabel && heroLabel === finalLabel && label === heroLabel ? 2 : 1;
    if (n > allowed) add('warning', 'button-repeat', `The button “${label}” appears ${n} times.`);
  }
  const contentKind = kind === 'service' || kind === 'blog' || kind === 'area';
  if (contentKind) {
    const places = placeRegex(f);
    const h1 = s(hero?.p?.headline);
    if (kind !== 'area' && places.test(h1)) add('warning', 'place-in-h1', 'The headline names a place. Service pages stay area-neutral.', hero);
    const count = pieces.filter((pc) => !(pc.blockType === 'hero' && pc.key === 'microtrust') && !(pc.blockType === 'hero' && pc.key === 'eyebrow')).reduce((n, pc) => n + (pc.text.match(placeRegex(f)) ?? []).length, 0);
    if (kind !== 'area' && count > 2) add('warning', 'place-names', `Place names appear ${count} times in the body; two at most.`);
    const heroAt = blocks.findIndex((b) => b.t === 'hero');
    const next = heroAt >= 0 ? blocks[heroAt + 1] : undefined;
    const introWords = next && (next.t === 'media' || next.t === 'rich') ? wordCount(blockPieces(next).map((pc) => pc.text).join(' ')) : 0;
    if (introWords < 120) add('warning', 'intro', 'There is no introduction of 120 words or more straight after the hero.');
    const total = words(blocks);
    const [lo, hi] = kind === 'blog' ? [1200, 2000] : [900, 1500];
    if (total < lo || total > hi) add('warning', 'length', `${total} words; ${kind === 'blog' ? 'guides' : 'service pages'} work best at ${lo} to ${hi}.`);
    if (!blocks.some((b) => b.t === 'testi' || b.t === 'casestudy' || b.t === 'gallery') && kind !== 'blog') add('warning', 'proof', 'No proof on the page: a testimonial, case study or gallery of real installs.');
  }
  if (hero?.p) {
    if (hero.p.hideMicrotrust) add('warning', 'trust-off', 'The hero trust line is switched off.', hero);
    if (hero.p.hideRating && ratingShown(f)) add('warning', 'rating-hidden', 'A verified rating is on the facts sheet but the hero hides it.', hero);
  }
  if (blocks.filter((b) => b.t === 'hero').length > 1) add('warning', 'one-h1', 'More than one hero: a page should have one main heading.');

  /* Search listing */
  const fullTitle = s(seo.title) && !/heliaxis/i.test(s(seo.title)) ? `${s(seo.title)} | Heliaxis` : s(seo.title);
  if (fullTitle && (fullTitle.length < 50 || fullTitle.length > 60)) add('warning', 'seo-title', `The search title is ${fullTitle.length} characters with the brand; 50 to 60 reads best.`);
  if (!s(seo.title)) add('warning', 'seo-title', 'No search title.');
  const dl = s(seo.desc).length;
  if (!dl) add('warning', 'seo-description', 'No search description.');
  else if (dl < 120 || dl > 160) add('warning', 'seo-description', `The search description is ${dl} characters; 120 to 160 reads best.`);
  if (kind === 'service' && placeRegex(f).test(slug.replace(/-/g, ' '))) add('warning', 'seo-slug-place', 'The address names a place. Service pages stay area-neutral.');

  /* Area pages: only with local proof, and not a copy of another area page */
  if (kind === 'area') {
    const proof = f.areaProof.find((a) => a.slug === slug);
    if (!proof || proof.installs < 2 || proof.reviews < 1) add('error', 'area-proof', 'An area page needs at least two real local installs and one local review on the facts sheet.');
    const mine = shingles(pieces.map((pc) => pc.text).join(' '));
    for (const other of ctx.pages ?? []) {
      if (other === page || pageKind(other) !== 'area' || s(other.slug) === slug) continue;
      const theirs = shingles((other.blocks ?? []).filter((b) => b.t !== 'footer').flatMap(blockPieces).map((pc) => pc.text).join(' '));
      if (differentShare(mine, theirs) < 0.6) add('error', 'area-duplicate', `Less than 60% of this page’s text differs from ${s(other.name) || s(other.slug)}.`);
    }
  }

  return issues;
}

/* ── Area pages: how different two texts are ─────────────────────────────────────── */

export function shingles(text: string, n = 5): Set<string> {
  const w = text.toLowerCase().replace(/[^a-z0-9£%\s]/g, ' ').split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(' '));
  return out;
}

/** The share of text that is NOT shared: 1 means nothing in common, 0 means identical. */
export function differentShare(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 0;
  let both = 0;
  for (const x of a) if (b.has(x)) both++;
  return 1 - both / (a.size + b.size - both);
}

/* ── Whole site ─────────────────────────────────────────────────────────────────── */

export type PageReport = {
  slug: string;
  name: string;
  kind: PageKind;
  draft: boolean;
  /** New, or different from the published copy. Only these can block Publish. */
  changed: boolean;
  issues: Issue[];
  errors: number;
  warnings: number;
};

export type SiteReport = { pages: PageReport[]; blocking: PageReport[]; errors: number; warnings: number };

const stable = (p: CmsPageLike) => JSON.stringify({ n: p.name, s: p.slug, t: p.type, o: p.seo ?? {}, b: p.blocks ?? [] });

/**
 * Check every page. A page already published and unchanged is still reported (so its problems are visible) but cannot block
 * Publish, otherwise a page nobody touched could stop everyone publishing anything else.
 */
export function checkSite(pages: CmsPageLike[], ctx: Omit<CheckContext, 'pageSlugs' | 'pages'>, published: CmsPageLike[] = []): SiteReport {
  const full: CheckContext = { ...ctx, pageSlugs: pages.map((p) => s(p.slug) || '/'), pages };
  const was = new Map(published.map((p) => [s(p.slug) || '/', stable(p)]));
  const reports: PageReport[] = pages.map((p) => {
    const issues = checkPage(p, full);
    const slug = s(p.slug) || '/';
    const changed = was.get(slug) !== stable(p);
    const errors = issues.filter((i) => i.level === 'error').length;
    return { slug, name: s(p.name) || slug, kind: pageKind(p), draft: !!p._draft, changed, issues, errors, warnings: issues.length - errors };
  });
  return {
    pages: reports,
    blocking: reports.filter((r) => r.changed && r.errors > 0),
    errors: reports.reduce((n, r) => n + r.errors, 0),
    warnings: reports.reduce((n, r) => n + r.warnings, 0),
  };
}
