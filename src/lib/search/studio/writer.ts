import type { Brief, CheckResult, ContentKind, Proof } from './types';

/**
 * What the writer is told (spec §5 M4.3), and the JSON-LD for the page. Pure. The writing itself goes through the
 * existing contracts: generatePage() in src/lib/cms/ai-page.ts for pages and generateBlogPost() in src/lib/blog/ai.ts for
 * articles, which take a free-text brief. This builds that brief from the studio's brief and proof pack.
 */

export type WriterFacts = {
  business: { name: string; phone: string; area: string; credentials: string[]; website: string; address?: string };
  author: { name: string; role: string; bio: string; photo: string; links?: string[] };
  bannedClaims: string[];
};

const money = (v: number | null) => (v == null ? '' : `£${v.toLocaleString('en-GB', { maximumFractionDigits: 2 })}`);

function section(title: string, lines: string[]): string {
  const l = lines.map((x) => x.trim()).filter(Boolean);
  return l.length ? `${title}:\n${l.map((x) => `- ${x}`).join('\n')}` : '';
}

/** Allowed figures, as the writer sees them: every one carries its "last checked" date. */
export function figureLines(proof: Proof): string[] {
  const out: string[] = [];
  for (const p of proof.packages) {
    out.push(`${p.name}: ${money(p.priceIncVat)} including VAT${p.kwp ? `, ${p.kwp} kWp` : ''}${p.usableKwh ? `, ${p.usableKwh} kWh usable battery` : ''}, ${p.panels} panels${p.warranties ? `, warranties: ${p.warranties}` : ''} (our package price, last checked ${p.checkedAt})`);
  }
  for (const f of proof.figures) out.push(`${f.label}: ${f.value} (source: ${f.source}, last checked ${f.checked}${f.money ? '; a £ amount the page may quote' : '; not a £ amount: never write it with a £ sign'})`);
  return out;
}

export function proofLines(proof: Proof): { projects: string[]; reviews: string[]; local: string[] } {
  return {
    projects: proof.projects.map((p) => `${p.town}${p.date ? `, ${p.date}` : ''}: ${[p.sizeKwp ? `${p.sizeKwp} kWp solar` : '', p.batteryKwh ? `${p.batteryKwh} kWh battery` : ''].filter(Boolean).join(' + ')}${p.summary ? `. ${p.summary}` : ''}`),
    reviews: proof.reviews.map((r) => `"${r.quote}" (${r.name}${r.town ? `, ${r.town}` : ''}, ${r.source}${r.date ? `, ${r.date}` : ''})`),
    local: [proof.dno ? `Local network operator: ${proof.dno}` : '', proof.council ? `Local council: ${proof.council}` : '', proof.findings ? `What our surveys find here: ${proof.findings.trim()}` : ''],
  };
}

/** The brief for the writer. Kept under `limit` characters by trimming the least important lists first. */
export function writerBrief(brief: Brief, proof: Proof, facts: WriterFacts, opts: { kind: ContentKind; today: string; fixes?: CheckResult[]; limit?: number }): string {
  const limit = opts.limit ?? (opts.kind === 'blog' ? 6000 : 4000);
  const t = brief.target;
  const p = proofLines(proof);
  const figures = figureLines(proof);
  const links = brief.linksOut.map((l) => `${l.path} (${l.title})`);
  const head = [
    `Write a ${opts.kind === 'blog' ? 'blog article' : 'web page'} for Heliaxis for the search "${t.primary}"${t.phrases.length > 1 ? `, also covering: ${t.phrases.filter((x) => x !== t.primary).slice(0, 5).join('; ')}` : ''}.`,
    `Audience: ${brief.audience} Page type: ${t.pageType.replace('_', ' ')}${t.town ? `, for ${t.town}` : ''}. Length: ${brief.words.min} to ${brief.words.max} words.`,
    `Author: ${facts.author.name}${facts.author.role ? `, ${facts.author.role}` : ''}. Area wording: "${facts.business.area}". Phone: ${facts.business.phone}.`,
  ].join('\n');
  const rules = section('RULES (these override everything else)', [
    'The first two sentences of the first text section answer the search directly.',
    'Include one worked example and list its assumptions. Use only the figures under FIGURES; put "(last checked <date>)" after each one.',
    opts.kind === 'blog' ? 'Use one HTML comparison table where a comparison helps.' : 'Use a grid, split or pricing block as a comparison table where a comparison helps.',
    'Never state any other price, saving, percentage, size or number. If a figure is not listed, describe it in words.',
    `Credentials: say only ${facts.business.credentials.join(', ')}. Never mention any other scheme or trade body.`,
    facts.bannedClaims.length ? `Never write: ${facts.bannedClaims.join(', ')}.` : '',
    `Link to at least 3 of these internal pages with real links: ${links.join(', ') || '/free-solar-quote, /solar-estimator, /book-a-survey'}.`,
    'Quote reviews only word for word from REVIEWS, with the name and town. No other testimonials.',
    'British English, plain words. Do not copy wording from any other website.',
    `Call to action: "${brief.cta.label}" linking to ${brief.cta.href}.`,
  ]);
  const outline = section('OUTLINE (H2 sections, in this order)', brief.outline.map((o) => o.h2));
  const questions = section('QUESTIONS to answer', brief.questions);
  const proj = section('OUR PROJECTS (real; use them)', p.projects);
  const rev = section('REVIEWS (real; quote exactly)', p.reviews);
  const local = section('LOCAL FACTS', p.local);
  const figs = section('FIGURES (the only numbers you may use)', figures.length ? figures : ['None: write without prices or figures.']);
  const fixes = opts.fixes?.length ? section('FIX THESE PROBLEMS FROM THE LAST DRAFT', opts.fixes.flatMap((f) => (f.issues.length ? f.issues.slice(0, 6).map((i) => `${f.label}: ${i.text}`) : [`${f.label}: ${f.detail}`]))) : '';

  // Most important first; lists that don't fit are cut item by item.
  const parts = [head, rules, fixes, figs, outline, proj, rev, local, questions].filter(Boolean);
  let out = parts.join('\n\n');
  while (out.length > limit && parts.length > 3) {
    const last = parts[parts.length - 1];
    const lines = last.split('\n');
    if (lines.length > 2) parts[parts.length - 1] = lines.slice(0, -1).join('\n');
    else parts.pop();
    out = parts.join('\n\n');
  }
  return out.slice(0, limit);
}

/* ── JSON-LD ────────────────────────────────────────────────────────────────────────────────────────────────────── */

export type SchemaInput = {
  types: string[];
  title: string;
  description: string;
  url: string;
  site: string;
  business: WriterFacts['business'];
  author: WriterFacts['author'];
  service?: string | null;
  town?: string | null;
  date: string;
  crumbs: { name: string; url: string }[];
};

export function buildSchema(s: SchemaInput): string {
  const orgId = `${s.site.replace(/\/$/, '')}/#organization`;
  const person = {
    '@type': 'Person',
    name: s.author.name,
    ...(s.author.role ? { jobTitle: s.author.role } : {}),
    ...(s.author.bio ? { description: s.author.bio } : {}),
    ...(s.author.photo ? { image: s.author.photo } : {}),
    ...(s.author.links?.length ? { sameAs: s.author.links } : {}),
    worksFor: { '@id': orgId },
  };
  const graph: Record<string, unknown>[] = [];
  if (s.types.includes('LocalBusiness') || s.types.includes('Service')) {
    graph.push({
      '@type': 'LocalBusiness',
      '@id': orgId,
      name: s.business.name,
      url: s.business.website || s.site,
      telephone: s.business.phone,
      areaServed: s.business.area,
      ...(s.business.address ? { address: s.business.address } : {}),
    });
  }
  if (s.types.includes('Service')) {
    graph.push({
      '@type': 'Service',
      name: s.title,
      description: s.description,
      url: s.url,
      ...(s.service ? { serviceType: s.service.replace('_', ' ') } : {}),
      areaServed: s.town ? { '@type': 'Place', name: s.town } : s.business.area,
      provider: { '@id': orgId },
    });
  }
  if (s.types.includes('Article')) {
    graph.push({
      '@type': 'Article',
      headline: s.title.slice(0, 110),
      description: s.description,
      mainEntityOfPage: s.url,
      datePublished: s.date,
      dateModified: s.date,
      author: person,
      publisher: { '@type': 'Organization', name: s.business.name, url: s.business.website || s.site },
    });
  }
  if (s.types.includes('BreadcrumbList')) {
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: s.crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.url })),
    });
  }
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2);
}

/** The page's public path for a slug. Articles live under /blog/. */
export function publicPath(kind: ContentKind, slug: string): string {
  const s = String(slug || '').trim().toLowerCase().replace(/^\/+/, '').replace(/^blog\//, '').replace(/[^a-z0-9/-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return kind === 'blog' ? `/blog/${s || 'article'}` : `/${s || 'page'}`;
}
