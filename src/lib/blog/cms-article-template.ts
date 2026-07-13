import { z } from 'zod';

/** AI output that maps onto the fixed CMS blog article template. */
export const cmsArticleAiSchema = z.object({
  title: z.string().min(3).max(120),
  slug: z
    .string()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be kebab-case'),
  seoTitle: z.string().min(3).max(70).optional(),
  seoDescription: z.string().min(20).max(160).optional(),
  tags: z.string().min(2).max(80),
  headline: z.string().min(3).max(140),
  sub: z.string().max(200).optional().default(''),
  introEyebrow: z.string().min(2).max(40).default('INTRODUCTION'),
  introTitle: z.string().min(3).max(120),
  introText: z.string().min(40).max(1200),
  bodyHtml1: z.string().min(40),
  ctaHeadline: z.string().min(3).max(100),
  ctaSub: z.string().min(3).max(160),
  ctaBtn: z.string().min(2).max(40).default('Get my free quote'),
  bodyHtml2: z.string().min(40),
  /** Home / business split cards at the bottom */
  homeTitle: z.string().min(2).max(40).default('For your home'),
  homeDesc: z.string().min(20).max(160),
  homeBullets: z.array(z.string().min(4).max(80)).min(2).max(3),
  homeBtn: z.string().min(2).max(40).default('Get my home quote'),
  businessTitle: z.string().min(2).max(40).default('For your business'),
  businessDesc: z.string().min(20).max(180),
  businessBullets: z.array(z.string().min(4).max(80)).min(2).max(3),
  businessBtn: z.string().min(2).max(40).default('Explore business funding'),
});

export type CmsArticleAi = z.infer<typeof cmsArticleAiSchema>;

export type CmsBlock = { id: string; t: string; p: Record<string, unknown> };

export const EXAMPLE_BLOG_SLUG = '/example-blog-page';

/**
 * Stock contact form — matches /example-blog-page (visitor chrome, never AI-written).
 */
export const STOCK_FORM_PROPS = {
  heading: 'Start the conversation',
  sub: 'No obligation, no pushy sales. We reply within 1 working day.',
  btn: 'Send enquiry',
  pulse: true,
  fName: true,
  fEmail: true,
  fPhone: true,
  fPost: false,
  fOrg: true,
  fMsg: true,
  fSector: true,
  fInterests: true,
} as const;

/** Fallback split if AI omits fields. */
export const STOCK_SPLIT_PROPS = {
  lt: 'For your home',
  ld: 'Cut your bills, add battery backup and go greener.',
  lb: [
    'Free, no-obligation home survey',
    '0% VAT on residential solar to 2027',
    'Finance to spread the cost',
  ],
  lc: 'Get my home quote',
  rt: 'For your business',
  rd: 'Turn your roof into lower running costs, with ROI, grants and finance.',
  rb: ['Free commercial energy assessment', 'Grants, finance & PPA', 'Typical 3–6 year payback'],
  rc: 'Explore business funding',
} as const;

export function splitPropsFromAi(ai: CmsArticleAi) {
  const homeBullets = (ai.homeBullets?.length ? ai.homeBullets : STOCK_SPLIT_PROPS.lb).slice(0, 3);
  const businessBullets = (ai.businessBullets?.length ? ai.businessBullets : STOCK_SPLIT_PROPS.rb).slice(0, 3);
  return {
    lt: ai.homeTitle || STOCK_SPLIT_PROPS.lt,
    ld: ai.homeDesc || STOCK_SPLIT_PROPS.ld,
    lb: homeBullets,
    lc: ai.homeBtn || STOCK_SPLIT_PROPS.lc,
    rt: ai.businessTitle || STOCK_SPLIT_PROPS.rt,
    rd: ai.businessDesc || STOCK_SPLIT_PROPS.rd,
    rb: businessBullets,
    rc: ai.businessBtn || STOCK_SPLIT_PROPS.rc,
  };
}

const ALLOWED_TAGS = new Set(['p', 'h2', 'h3', 'ul', 'ol', 'li', 'strong', 'em', 'a', 'br']);

function uid(): string {
  return 'b' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/** Strip unsafe HTML; keep basic article tags. */
export function sanitizeArticleHtml(html: string): string {
  let s = String(html || '');
  s = s.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
  s = s.replace(/on\w+\s*=\s*(['"]).*?\1/gi, '');
  s = s.replace(/javascript:/gi, '');
  s = s.replace(/<\/?([a-z0-9]+)(\s[^>]*)?>/gi, (full, tag: string, attrs = '') => {
    const t = tag.toLowerCase();
    if (!ALLOWED_TAGS.has(t)) return '';
    if (t === 'br') return '<br>';
    if (full.startsWith('</')) return `</${t}>`;
    if (t === 'a') {
      const href = (attrs.match(/\bhref\s*=\s*(['"])(.*?)\1/i) || [])[2] || '';
      if (!href || /^javascript:/i.test(href) || /^data:/i.test(href)) return '<a>';
      if (href.startsWith('/') || href.startsWith('https://') || href.startsWith('http://') || href.startsWith('#')) {
        const safe = href.replace(/"/g, '');
        return `<a href="${safe}">`;
      }
      return '<a>';
    }
    return `<${t}>`;
  });
  return s.trim() || '<p></p>';
}

export function normalizeCmsSlug(raw: string): string {
  let s = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^\/+/, '')
    .replace(/[^a-z0-9/-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (!s) s = 'article';
  return '/' + s.replace(/^\/+/, '');
}

export function isReservedCmsSlug(slug: string): boolean {
  const s = normalizeCmsSlug(slug);
  return s === '/blog' || s.startsWith('/blog/') || s === '/admin' || s.startsWith('/admin/');
}

export function placeholderCmsArticleAi(): CmsArticleAi {
  return {
    title: 'Example Blog Page',
    slug: 'example-blog-page',
    seoTitle: 'Example Blog Page — Heliaxis',
    seoDescription:
      'Practical guidance on solar, battery storage and energy upgrades from Heliaxis in South Wales.',
    tags: 'Solar | Battery',
    headline: 'Your headline here',
    sub: '',
    introEyebrow: 'INTRODUCTION',
    introTitle: 'What this article covers',
    introText:
      'Open with the problem your reader faces and why Heliaxis is a trusted local partner for solar and battery projects across South Wales.',
    bodyHtml1:
      '<p>Many South Wales homes still pay more than they need because generation, storage and heating are quoted as separate jobs. A joined-up survey looks at roof space, daytime use and evening demand together, so you can see where <strong>solar</strong>, a battery, or both will actually cut the bill. Use the <a href="/solar-estimator">savings estimator</a> for a quick sense-check, then confirm figures on site.</p><p>Good design is local: shading, loft access and export limits matter as much as panel brand. An <strong>MCS-certified</strong> installer will size the system for Welsh weather and your usage pattern, then explain payback without a hard sell — so you know what happens from survey through to switch-on.</p>',
    ctaHeadline: 'Ready to start?',
    ctaSub: 'Book a free survey today.',
    ctaBtn: 'Get my free quote',
    bodyHtml2:
      '<p>When you are ready, book a free no-obligation survey. We cover Cardiff, Newport, Swansea and the wider region, and we will talk through options for homes and businesses — including <a href="/commercial-funding">funding routes</a> where they apply. Expect clear next steps, not pressure.</p><p>Prefer to start online? <a href="/#quote">Request a free quote</a> and we will reply within one working day.</p>',
    homeTitle: 'For your home',
    homeDesc: 'Cut your bills, add battery backup and go greener.',
    homeBullets: [
      'Free, no-obligation home survey',
      '0% VAT on residential solar to 2027',
      'Finance to spread the cost',
    ],
    homeBtn: 'Get my home quote',
    businessTitle: 'For your business',
    businessDesc: 'Turn your roof into lower running costs, with ROI, grants and finance.',
    businessBullets: [
      'Free commercial energy assessment',
      'Grants, finance & PPA',
      'Typical 3–6 year payback',
    ],
    businessBtn: 'Explore business funding',
  };
}

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/**
 * Fixed article layout matching /example-blog-page:
 * hero → media → rich → cta → rich → form → split
 *
 * Blog tags use hero `eyebrow` (as on the example page), not the separate tags field.
 */
export function buildBlogArticleBlocks(ai: CmsArticleAi): CmsBlock[] {
  const tags = (ai.tags || '').trim();
  const body1 = sanitizeArticleHtml(ai.bodyHtml1);
  const body2 = sanitizeArticleHtml(ai.bodyHtml2);
  const split = splitPropsFromAi(ai);

  return [
    {
      id: uid(),
      t: 'hero',
      p: {
        eyebrow: tags,
        headline: ai.headline,
        sub: ai.sub || '',
        dark: true,
        textWide: true,
        ctaLabel: 'Get a quote',
        ctaPulse: false,
        cta2: '',
        ctaDisabled: false,
        tags: '',
      },
    },
    {
      id: uid(),
      t: 'media',
      p: {
        img: '',
        side: 'right',
        eyebrow: ai.introEyebrow || 'INTRODUCTION',
        title: ai.introTitle,
        text: ai.introText,
        cta: '',
        ctaDisabled: true,
        textWide: false,
      },
    },
    { id: uid(), t: 'rich', p: { html: body1 } },
    {
      id: uid(),
      t: 'cta',
      p: {
        headline: ai.ctaHeadline,
        sub: ai.ctaSub,
        btn: ai.ctaBtn || 'Get my free quote',
        pulse: true,
      },
    },
    { id: uid(), t: 'rich', p: { html: body2 } },
    {
      id: uid(),
      t: 'form',
      p: { ...STOCK_FORM_PROPS },
    },
    {
      id: uid(),
      t: 'split',
      p: split,
    },
  ];
}

type LoosePage = {
  id?: string;
  name?: string;
  slug?: string;
  type?: string;
  theme?: string;
  seo?: Record<string, unknown>;
  blocks?: Array<{ id?: string; t?: string; p?: Record<string, unknown> }>;
};

/**
 * Clone /example-blog-page blocks and overwrite AI-filled fields.
 * Keeps the contact form stock; fills the home/business split from AI.
 */
export function fillExampleBlogTemplate(template: LoosePage, ai: CmsArticleAi, opts?: { pageId?: string }) {
  const blocks = deepClone(template.blocks || []);
  let richIndex = 0;
  const split = splitPropsFromAi(ai);

  for (const bl of blocks) {
    bl.id = uid();
    const t = bl.t || '';
    const p = (bl.p = bl.p || {});

    if (t === 'hero') {
      p.eyebrow = (ai.tags || '').trim();
      p.headline = ai.headline;
      p.sub = ai.sub || '';
      p.dark = true;
      p.textWide = true;
      p.tags = '';
      if (p.ctaLabel == null) p.ctaLabel = 'Get a quote';
      if (p.ctaPulse == null) p.ctaPulse = false;
      if (p.cta2 == null) p.cta2 = '';
      if (p.ctaDisabled == null) p.ctaDisabled = false;
    } else if (t === 'media') {
      p.eyebrow = ai.introEyebrow || 'INTRODUCTION';
      p.title = ai.introTitle;
      p.text = ai.introText;
      p.ctaDisabled = true;
      p.cta = '';
      if (p.side == null) p.side = 'right';
    } else if (t === 'rich') {
      if (richIndex === 0) p.html = sanitizeArticleHtml(ai.bodyHtml1);
      else if (richIndex === 1) p.html = sanitizeArticleHtml(ai.bodyHtml2);
      richIndex += 1;
    } else if (t === 'cta') {
      p.headline = ai.ctaHeadline;
      p.sub = ai.ctaSub;
      p.btn = ai.ctaBtn || 'Get my free quote';
      if (p.pulse == null) p.pulse = true;
    } else if (t === 'split') {
      Object.assign(p, split);
    }
    // form: leave stock chrome from the example page
  }

  // If the example is missing expected sections, fall back to the hardcoded layout.
  const types = blocks.map((b) => b.t).join(',');
  if (!types.includes('hero') || !types.includes('form')) {
    return buildCmsArticlePage(ai, opts);
  }

  const slug = normalizeCmsSlug(ai.slug);
  return {
    id: opts?.pageId || uid(),
    name: ai.title,
    slug,
    type: 'blog' as const,
    origin: 'ai-blog' as const,
    blogStatus: 'draft' as const,
    publishAt: null as string | null,
    theme: (template.theme as 'light' | 'dark') || 'light',
    seo: {
      title: ai.seoTitle || `${ai.title} — Heliaxis`,
      desc: ai.seoDescription || '',
      slug,
    },
    blocks: blocks as CmsBlock[],
  };
}

export function findExampleBlogPage(pages: LoosePage[]): LoosePage | undefined {
  return pages.find((p) => normalizeCmsSlug(String(p.slug || '')) === EXAMPLE_BLOG_SLUG);
}

export function buildCmsArticlePage(ai: CmsArticleAi, opts?: { pageId?: string }) {
  const slug = normalizeCmsSlug(ai.slug);
  return {
    id: opts?.pageId || uid(),
    name: ai.title,
    slug,
    type: 'blog' as const,
    origin: 'ai-blog' as const,
    blogStatus: 'draft' as const,
    publishAt: null as string | null,
    theme: 'light' as const,
    seo: {
      title: ai.seoTitle || `${ai.title} — Heliaxis`,
      desc: ai.seoDescription || '',
      slug,
    },
    blocks: buildBlogArticleBlocks(ai),
  };
}

/** True for AI / CMS blog articles (kept separate from website pages). */
export function isCmsBlogPage(
  pg:
    | {
        type?: unknown;
        origin?: unknown;
        slug?: unknown;
        blocks?: unknown[] | null;
      }
    | null
    | undefined,
): boolean {
  if (!pg) return false;
  const type = String(pg.type || '').toLowerCase();
  const origin = String(pg.origin || '').toLowerCase();
  if (type === 'blog' || origin === 'ai-blog') return true;
  // Backfill older AI articles created before type:'blog' was set
  const slug = normalizeCmsSlug(String(pg.slug || ''));
  if (slug === EXAMPLE_BLOG_SLUG) return false;
  const seq = (pg.blocks || [])
    .map((b) => (b && typeof b === 'object' && 't' in b ? String((b as { t?: unknown }).t || '') : ''))
    .join(',');
  return (
    seq === 'hero,media,rich,cta,rich,form,split' ||
    seq.startsWith('hero,media,rich,cta,rich,form,split')
  );
}
