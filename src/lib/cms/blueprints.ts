/**
 * Page briefs and blueprints for the AI page builder (PAGE-BUILDER-SPEC "Page blueprints" and "Module rules"). Pure code, tested.
 * A brief says what page is wanted; the blueprint says which blocks, in which order; `shapePage` makes whatever the model wrote obey the
 * module rules (step and grid counts, one quote form, proof only from the facts sheet, a call button on the hero).
 */
import type { Facts } from './facts';

export type PageType = 'service' | 'landing' | 'blog' | 'case-study' | 'area';
export type Audience = 'home' | 'business' | 'both';
export type Block = { t: string; p: Record<string, unknown> };

export type Brief = {
  pageType: PageType;
  audience: Audience;
  /** The service the page is about, for example "Home battery backup". */
  service: string;
  /** Area pages only: the region, which must have proof on the facts sheet. */
  area: string;
  /** Landing pages: where the traffic comes from and the promise in the ad. */
  trafficSource: string;
  /** The search phrase the page is meant to rank for. */
  targetPhrase: string;
  /** The reader's biggest doubt: the page answers it early. */
  doubt: string;
  /** Title of an approved case study (facts sheet) to feature. */
  caseStudy: string;
  /** Anything else, in the writer's own words. */
  notes: string;
};

export const PAGE_TYPES: { value: PageType; label: string }[] = [
  { value: 'service', label: 'Service or information page' },
  { value: 'landing', label: 'Ad landing page' },
  { value: 'blog', label: 'Guide' },
  { value: 'case-study', label: 'Case study' },
  { value: 'area', label: 'Area page' },
];

const clip = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

export function cleanBrief(raw: unknown): Brief {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pageType = (['service', 'landing', 'blog', 'case-study', 'area'] as const).find((x) => x === o.pageType) ?? 'service';
  const audience = (['home', 'business', 'both'] as const).find((x) => x === o.audience) ?? 'home';
  return {
    pageType,
    audience,
    service: clip(o.service, 120),
    area: clip(o.area, 80),
    trafficSource: clip(o.trafficSource, 200),
    targetPhrase: clip(o.targetPhrase, 120),
    doubt: clip(o.doubt, 300),
    caseStudy: clip(o.caseStudy, 140),
    notes: clip(o.notes, 1500),
  };
}

/** The blocks of each blueprint, in order. "form" and "accbanner" are filled with the editor's own defaults when the page is inserted. */
export const BLUEPRINTS: Record<PageType, string[]> = {
  service: ['hero', 'media', 'grid', 'split', 'testi', 'rich', 'steps', 'form', 'faq', 'funding', 'cta', 'accbanner'],
  landing: ['hero', 'form', 'grid', 'testi', 'steps', 'faq', 'cta', 'accbanner'],
  blog: ['hero', 'media', 'rich', 'cta', 'rich', 'faq', 'form', 'grid'],
  'case-study': ['hero', 'stats', 'media', 'grid', 'gallery', 'steps', 'testi', 'form'],
  area: ['hero', 'media', 'gallery', 'testi', 'grid', 'rich', 'steps', 'faq', 'form', 'accbanner'],
};

/** Words per page type, for the prompt (the validator checks the same ranges). */
export const WORD_TARGET: Record<PageType, string> = { service: '900 to 1,500', landing: '300 to 600', blog: '1,200 to 2,000', 'case-study': '500 to 900', area: '700 to 1,200' };

const BLUEPRINT_NOTES: Record<PageType, string> = {
  service:
    'Readers arrive from search or the menu and are still weighing it up. Order: hero (outcome headline, one-line sub saying who it is for); media introduction of 120 to 180 words (the situation, what Heliaxis does, who it suits and who it does not, the next step); grid of 3 or 4 outcome cards of 20 to 35 words; split of the two choices the reader must make, each with an honest trade-off; testi (only if approved testimonials are given); rich explainer of 300 to 600 words under h3 headings (how it works, sizing, what affects cost); steps; form; faq of 6 to 8 questions with answers of 40 to 80 words; funding only when a funding fact applies; cta whose headline differs from the hero.',
  landing:
    'The reader clicked one promise and must see it kept at once. One goal, no exits, 300 to 600 words. Order: hero whose headline repeats the ad promise almost word for word; form straight after it; grid of 3 benefits; testi (only approved); steps of 4 (what happens after they enquire); faq of 4 or 5 (price, disruption, timing, obligation); cta back to the form.',
  blog:
    'Give the answer first and offer the next step softly. Hero: the question as headline, the short answer in one sentence as sub. Then a media block that is a 3 to 5 bullet "In short" summary; rich sections that each answer one part of the question (use h3 headings; a table is fine for comparisons); a soft inline cta after the first section; more rich; faq of 4 to 6; form; grid of 3 links to matching service pages.',
  'case-study':
    'Lead with the result as a number taken ONLY from the approved case study facts. Then stats, the brief (media), what was installed (grid), gallery, steps, the client quote (testi, only if approved) and the form with "Want results like this?".',
  area:
    'Hero (service and area), a media local introduction, gallery of local installs, testi from local customers (approved only), grid linking to services, rich local specifics (typical housing, planning notes, network operator, local schemes: only what the facts give), steps, local faq, form.',
};
export const blueprintNote = (t: PageType) => BLUEPRINT_NOTES[t];

/* ── Shaping the model's output ───────────────────────────────────────────────────── */

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const items = (b: Block): Record<string, unknown>[] => (Array.isArray(b.p.items) ? (b.p.items as unknown[]).filter(isObj) : []);

/** Four or eight steps, the renderer's grid: trim 5 to 7 down to 4, anything over 8 to 8. Fewer than 4 are left (a warning, not a guess). */
function shapeSteps(b: Block) {
  const it = items(b);
  if (it.length > 8) b.p.items = it.slice(0, 8);
  else if (it.length > 4 && it.length < 8) b.p.items = it.slice(0, 4);
}

/** Cards in whole rows: choose 3 or 4 columns to fit, else trim to a whole row. */
function shapeGrid(b: Block) {
  const it = items(b).filter((x) => String(x.desc ?? '').trim() || String(x.title ?? '').trim());
  if (!it.length) return;
  let cols = Number(b.p.cols) || 3;
  if (it.length % cols !== 0) {
    if (it.length % 3 === 0) cols = 3;
    else if (it.length % 4 === 0) cols = 4;
    else {
      cols = it.length >= 6 ? 3 : cols;
      it.length = Math.max(cols, it.length - (it.length % cols));
    }
  }
  b.p.cols = cols;
  b.p.items = it;
}

/** The quote form's props, mirroring quoteFormDefaults() in the editor, with the facts sheet's phone and response promise. */
export function quoteFormProps(f: Facts): Record<string, unknown> {
  const tel = `tel:${f.phone.replace(/[^\d+]/g, '')}`;
  return {
    variant: 'quote',
    eyebrow: 'Free, no-obligation quote',
    title: 'Ready to see what you could save?',
    anchor: 'quote',
    points: [
      { title: 'A real survey, not a sales pitch', text: 'We assess your property and give honest figures.' },
      { title: f.responsePromise || 'We call within 1 working day', text: 'Quick, friendly, and only when it suits you.' },
      { title: 'Your details stay private', text: 'We only use your details to arrange your survey.' },
    ],
    callLabel: 'Prefer to talk?',
    phone: f.phone,
    callBtn: 'Call us now',
    callHref: tel,
    hideCall: false,
    tabHome: 'For my home',
    tabBiz: 'For my business',
    showTabs: true,
    fName: true, nameLabel: 'Full name', namePh: 'Your name',
    fPhone: true, phoneLabel: 'Phone', phonePh: 'Mobile or landline',
    fEmail: true, emailLabel: 'Email', emailPh: 'you@email.com',
    fPost: true, postLabel: 'Postcode', postPh: 'e.g. CF10 1AA',
    fInterest: true, interestLabel: 'What are you interested in? (optional)', interestPh: 'Solar, battery, heat pump, EV…',
    btn: 'Get my free survey',
    pulse: true,
    footnote: 'No obligation and no pushy sales. We only use your details to arrange your survey.',
    legalNote: '',
  };
}

/**
 * Make a generated page obey the module rules. Proof comes only from the facts sheet: testimonials are replaced by the approved ones
 * (and marked approved) or the block dropped; case-study cards and gallery frames need real library photos, so they are dropped here and
 * added by a person; stats are dropped (every number must come from the facts sheet). A quote form is added if there is none, the hero
 * gets a call button, and accreditation logos close the page when the blueprint calls for them.
 */
export function shapePage(blocks: Block[], brief: Brief, facts: Facts): Block[] {
  const out: Block[] = [];
  for (const raw of blocks) {
    const b: Block = { t: raw.t, p: { ...raw.p } };
    if (b.t === 'steps') shapeSteps(b);
    if (b.t === 'grid') shapeGrid(b);
    if (b.t === 'testi') {
      const list = facts.testimonials;
      if (!list.length) continue;
      b.p.items = list.slice(0, 6).map((t) => ({ stars: 5, quote: t.quote, name: t.name, loc: [t.town, t.product].filter(Boolean).join(' · ') }));
      b.p.approved = true;
      b.p.footnote = '';
    }
    if (b.t === 'casestudy' || b.t === 'gallery' || b.t === 'stats') continue;
    if (b.t === 'footer') continue;
    out.push(b);
  }

  // The hero: first-person quote button to the form, and the phone as the second button.
  const hero = out.find((b) => b.t === 'hero');
  if (hero) {
    hero.p.ctaHref = '#quote';
    hero.p.cta2 = `Call ${facts.phone}`;
    hero.p.cta2Href = `tel:${facts.phone.replace(/[^\d+]/g, '')}`;
    hero.p.hideRating = false;
    hero.p.hideMicrotrust = false;
  }

  // One quote form, anchor "quote", before the FAQ (landing pages: straight after the hero).
  const forms = out.filter((b) => b.t === 'form');
  for (const extra of forms.slice(1)) out.splice(out.indexOf(extra), 1);
  let form = out.find((b) => b.t === 'form');
  if (!form) {
    form = { t: 'form', p: quoteFormProps(facts) };
    const at = brief.pageType === 'landing' ? out.findIndex((b) => b.t === 'hero') + 1 : out.findIndex((b) => b.t === 'faq' || b.t === 'cta');
    out.splice(at > 0 ? at : out.length, 0, form);
  }
  form.p.anchor = 'quote';
  if (brief.service) form.p.interestPh = `For example: ${brief.service}`;

  // Accreditation logos close service, area and landing pages.
  if (BLUEPRINTS[brief.pageType].includes('accbanner') && !out.some((b) => b.t === 'accbanner')) out.push({ t: 'accbanner', p: { heading: 'Our accreditations' } });
  return out;
}
