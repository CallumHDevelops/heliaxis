/**
 * The Build tracker (Team › Build tracker): every piece of work being built on HAP and the website, so it can be put down and
 * picked up again. Each one keeps where it stands, the next step, what it is waiting on, a checklist and links.
 * Kept as one record in cms_kv ("build-tracker"): small, admin-only, no table needed. Pure parts here; saving is in builds-server.ts.
 */

export const BUILD_STATUSES = [
  { key: 'doing', label: 'In progress' },
  { key: 'waiting', label: 'Waiting on a decision' },
  { key: 'next', label: 'Up next' },
  { key: 'ideas', label: 'Ideas and parked' },
  { key: 'done', label: 'Done' },
] as const;

export type BuildStatus = (typeof BUILD_STATUSES)[number]['key'];

export const BUILD_AREAS = ['Website', 'SEO and AI', 'Content and blog', 'HAP', 'Sales and quotes', 'Marketing', 'Other'] as const;
export type BuildArea = (typeof BUILD_AREAS)[number];

export type BuildItem = {
  id: string;
  title: string;
  area: BuildArea;
  status: BuildStatus;
  /** One or two lines: what it is and where it stands. */
  summary: string;
  /** The very next thing to do when it is picked up again. */
  next: string;
  /** What it is waiting on (a decision, a person, a fact), if anything. */
  waitingOn: string;
  checklist: { text: string; done: boolean }[];
  links: { label: string; href: string }[];
  /** Notes for whoever (or whichever Claude session) picks it up: files, facts, decisions. Goes into its prompt. */
  brief: string;
  createdAt: string;
  updatedAt: string;
};

export const isStatus = (s: unknown): s is BuildStatus => BUILD_STATUSES.some((x) => x.key === s);
export const isArea = (s: unknown): s is BuildArea => (BUILD_AREAS as readonly string[]).includes(String(s));

const str = (v: unknown, max: number) => String(v ?? '').replace(/\s+$/g, '').slice(0, max);

/** A build as saved: every field present and within bounds, whatever was sent. */
export function cleanBuild(v: Partial<BuildItem> & { id: string }, now = new Date().toISOString()): BuildItem {
  return {
    id: str(v.id, 64),
    title: str(v.title, 140).trim() || 'Untitled',
    area: isArea(v.area) ? v.area : 'Other',
    status: isStatus(v.status) ? v.status : 'next',
    summary: str(v.summary, 2000),
    next: str(v.next, 600),
    waitingOn: str(v.waitingOn, 400),
    checklist: (Array.isArray(v.checklist) ? v.checklist : [])
      .map((c) => ({ text: str(c?.text, 300).trim(), done: !!c?.done }))
      .filter((c) => c.text)
      .slice(0, 40),
    links: (Array.isArray(v.links) ? v.links : [])
      .map((l) => ({ label: str(l?.label, 80).trim(), href: str(l?.href, 500).trim() }))
      .filter((l) => l.href && (l.href.startsWith('/') || /^https?:\/\//.test(l.href)))
      .slice(0, 12),
    brief: str(v.brief, 6000),
    createdAt: v.createdAt || now,
    updatedAt: now,
  };
}

/** Progress through the checklist, 0 to 100 (null without one). */
export function progress(b: BuildItem): number | null {
  if (!b.checklist.length) return null;
  return Math.round((b.checklist.filter((c) => c.done).length / b.checklist.length) * 100);
}

/** What was being built on 16 to 17 November 2026, so the tracker starts with today's work in it. */
export function starterBuilds(now = new Date().toISOString()): BuildItem[] {
  const b = (id: string, v: Omit<BuildItem, 'id' | 'createdAt' | 'updatedAt' | 'brief'>) => cleanBuild({ id, ...v, brief: STARTER_BRIEFS[id] ?? '', createdAt: now }, now);
  return [
    b('seo-dashboard', {
      title: 'SEO dashboard and Google positions',
      area: 'SEO and AI',
      status: 'doing',
      summary: 'Weekly Google positions for 103 local searches (DataForSEO), map-pack league, competitor analysis, site health and Approve change for titles, all on one page. Runs every Monday at 04:30 or on demand.',
      next: 'Press "Run everything now" and read the first full organic top 10 and competitor analysis.',
      waitingOn: '',
      checklist: [
        { text: 'Weekly rankings collection', done: true },
        { text: 'Dashboard: scoreboard, positions table, movers, league', done: true },
        { text: 'Live progress panel', done: true },
        { text: 'Approve change (with editing) for every page', done: true },
        { text: 'Read real sites behind Google-wrapped links', done: true },
        { text: 'First full organic run', done: false },
        { text: 'Competitor analysis report', done: false },
      ],
      links: [{ label: 'SEO dashboard', href: '/admin/analytics/seo' }],
    }),
    b('google-business-profile', {
      title: 'Google Business Profile: get into the map pack',
      area: 'SEO and AI',
      status: 'waiting',
      summary: 'Heliaxis appears in none of the 84 local map packs checked. The map pack is what most local searchers click, and it comes mainly from the Google Business Profile.',
      next: 'Check the profile is verified, primary category "Solar energy installer", every served town listed as a service area, services added, weekly photos.',
      waitingOn: 'Owner access to the Google Business Profile',
      checklist: [
        { text: 'Verified, with the same name, address and phone as the website', done: false },
        { text: 'Categories and services', done: false },
        { text: 'Service areas: every town we cover', done: false },
        { text: 'Photos of real jobs, weekly', done: false },
        { text: 'Ask every finished job for a review (no reward)', done: false },
      ],
      links: [{ label: 'SEO dashboard', href: '/admin/analytics/seo' }],
    }),
    b('free-solar-quote', {
      title: 'Free solar quote landing page',
      area: 'Website',
      status: 'done',
      summary: 'Live at /free-solar-quote: slim header, quote form, packages band, how it works, price factors, FAQs with markup.',
      next: 'Send one test enquiry and run Lighthouse on a phone.',
      waitingOn: 'Packages and prices entered in Sales › Solar estimator (the band stays hidden until then)',
      checklist: [
        { text: 'Page live and in the sitemap', done: true },
        { text: 'Test enquiry lands in Enquiries with the right source', done: false },
        { text: 'Lighthouse mobile 90+', done: false },
        { text: 'Packages entered', done: false },
      ],
      links: [
        { label: 'Live page', href: 'https://heliaxis.co.uk/free-solar-quote' },
        { label: 'Packages and prices', href: '/admin/sales/estimator' },
      ],
    }),
    b('site-trust-fixes', {
      title: 'Urgent site fixes: reviews, ratings, dead buttons, titles',
      area: 'Website',
      status: 'done',
      summary: 'Sample testimonials taken off the site, the star rating removed from the top bar, dead quote buttons now go to /free-solar-quote, page titles show the brand once.',
      next: '',
      waitingOn: '',
      checklist: [],
      links: [],
    }),
    b('claims-to-confirm', {
      title: 'Claims on the site to confirm or reword',
      area: 'Website',
      status: 'waiting',
      summary: 'Wording on the home page and elsewhere that needs proof or a change before it stays.',
      next: 'Change the home page warranty line to "25 to 30-year panel warranties, depending on the panel".',
      waitingOn: 'Owner answers on each claim',
      checklist: [
        { text: 'EUPD award: proof kept on file', done: false },
        { text: 'Panel warranty: "25 to 30 years, depending on the panel"', done: false },
        { text: 'Insurance-backed guarantees: confirm', done: false },
        { text: '"Never subcontracted out": true or remove', done: false },
        { text: 'Commercial grant "50% up to £30,000": check and date', done: false },
      ],
      links: [{ label: 'Website editor', href: '/admin/cms' }],
    }),
    b('cta-link-audit', {
      title: 'One set of call-to-action buttons across the site',
      area: 'Website',
      status: 'doing',
      summary: 'Every main button says "Get my free solar quote" and goes to /free-solar-quote. Dead links and the footer are done; the rest still point elsewhere.',
      next: 'Header, home hero, estimator results, CMS bands and the blog writing rules.',
      waitingOn: '',
      checklist: [
        { text: 'Dead #quote buttons on CMS pages', done: true },
        { text: 'Footer', done: true },
        { text: 'Header "Free quote" and "Contact"', done: false },
        { text: 'Home hero and mobile call bar', done: false },
        { text: 'Estimator result page', done: false },
        { text: 'CMS CTA bands', done: false },
        { text: 'Blog writing rules (BLOG_SYSTEM)', done: false },
      ],
      links: [],
    }),
    b('content-pages', {
      title: 'Service pages from the page briefs',
      area: 'Content and blog',
      status: 'next',
      summary: '19 pages: solar and battery, battery storage and backup, heat pumps, EV chargers, commercial and sector pages. Built as code pages so they publish without the CMS.',
      next: 'Start with /solar-and-battery and /battery-storage.',
      waitingOn: '',
      checklist: [],
      links: [],
    }),
    b('blog-conversion', {
      title: 'Blog articles that push towards a survey',
      area: 'Content and blog',
      status: 'next',
      summary: '13 articles are written and waiting to be loaded. Review the article layout so each one leads clearly to a free survey.',
      next: 'Review the article template and its call-to-action bands.',
      waitingOn: 'Loading the 13 drafts (Admin › Blog › "Load the written drafts")',
      checklist: [],
      links: [{ label: 'Blog', href: '/admin/blog' }],
    }),
    b('post-studio-photos', {
      title: 'Old Post Studio photos into the Content library',
      area: 'HAP',
      status: 'next',
      summary: '77 project photos and 22 library images from the old Post Studio are in the database but not shown. Real jobs in Tredegar, Llanfrechfa, Rhondda Cynon Taf, Cwmbran, Pontypool, Bristol, Newport, Ton Pentre, Chepstow and Lincolnshire.',
      next: 'Show them in the Content library alongside project photos.',
      waitingOn: '',
      checklist: [],
      links: [{ label: 'Content library', href: '/admin/content' }],
    }),
    b('home-speed', {
      title: 'Home page: shorter, faster, slimmer cookie banner',
      area: 'Website',
      status: 'next',
      summary: 'About 16 phone screens long, 43 images loaded up front, layout shift 0.137 on desktop; the cookie banner covers a third of a phone screen.',
      next: '',
      waitingOn: '',
      checklist: [],
      links: [],
    }),
    b('customer-stories', {
      title: 'Customer stories and reviews programme',
      area: 'Marketing',
      status: 'ideas',
      summary: 'Ask every finished job for an independent review (no reward), and separately pay £50 for a customer story on our own site, disclosed. See docs/SEO-GEO-STRATEGY.md section 6.',
      next: '',
      waitingOn: '',
      checklist: [],
      links: [],
    }),
    b('meta-landing-test', {
      title: 'Test Meta ads to the landing page',
      area: 'Marketing',
      status: 'ideas',
      summary: 'Send part of the Meta budget to /free-solar-quote (with tracking tags) and compare cost per enquiry with the lead forms.',
      next: '',
      waitingOn: '',
      checklist: [],
      links: [],
    }),
    b('town-pages', {
      title: 'Town pages with real local proof',
      area: 'Content and blog',
      status: 'ideas',
      summary: 'Only for towns with real jobs, photos (with consent) and local facts. First wave: Newport, Cardiff, Swansea, Bridgend, Cwmbran, Caerphilly; then Bristol and the South West.',
      next: '',
      waitingOn: 'Photos and consent for each town',
      checklist: [],
      links: [],
    }),
  ];
}

/** Background for the starting items (also used when an item saved before briefs existed has none). */
export const STARTER_BRIEFS: Record<string, string> = {
  'seo-dashboard': `Page: src/app/admin/analytics/seo (page.tsx, SeoDashboard.tsx, SeoControls.tsx, actions.ts). Rankings maths: src/lib/seo/rankings.ts (tested in tests/seo-rankings.test.ts). DataForSEO calls, run status and the competitor analysis: src/lib/seo/serp.ts. Weekly job: src/app/api/cron/seo-rankings (Mondays 04:30, vercel.json). Snapshots are stored in cms_kv as "seo-serp:YYYY-MM-DD" and "seo-competitors:YYYY-MM-DD"; run progress in "seo-run-status".
Credentials: DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD (or DATAFORSEO_BASE64) in Vercel. Searches are desktop, from each town; Google wraps result links, so the real site is read from each result's breadcrumb. Map-pack entries have no site, only the business name.
Keywords: social_seo_keyword table (103 searches over 11 towns, seeded from src/lib/social/competitors/seed.ts).`,
  'google-business-profile': `Facts to keep identical everywhere: Heliaxis Limited, 01633 965205, MCS, RECC, NAPIT, TrustMark, SSIP, ISO 9001 and ISO 14001 (never NICEIC). Area: South Wales and the South West (Swindon, Bath, Bristol, Weston-super-Mare, Gloucester, Cheltenham across to South Wales).
Reviews: never offer a reward for a Google or Trustpilot review (docs/SEO-GEO-STRATEGY.md section 6). The map-pack league is on the SEO dashboard.`,
  'free-solar-quote': `Page: src/app/(site)/free-solar-quote (page.tsx, faqs.ts, free-solar-quote.css). Packages band: src/components/quote/PackagesBand.tsx reading readEstimatorSettings().packages (src/lib/estimator/package-cards.ts). Slim header: SlimHeader in src/components/site/Header.tsx. The form posts to /api/quote with source "landing-free-solar-quote"; a test submission emails a receipt and alerts staff, so label it TEST.`,
  'claims-to-confirm': `The home page is a CMS page (stored blocks rendered in the browser): change it in the website editor (/admin/cms) and press Publish, or drive the admin with a browser signed in as the owner. Never write to cms_kv "heliaxis-cms-v1" directly. Owner has said: the EUPD award can be proven; panel warranties vary from 25 to 30 years by panel; Heliaxis has installed around the UK.`,
  'cta-link-audit': `The rule (docs/WEBSITE-CONTENT-SPEC.md section 5): the main button everywhere reads "Get my free solar quote" and goes to /free-solar-quote (battery or heat pump pages may say "Get my free quote" with ?for=battery etc.). Places: src/components/site/Header.tsx, src/components/home (Hero, MobileCta, EstimatorBand, SplitCards, FinalCta), the estimator result page, src/components/cms/CmsBody.tsx bands, BLOG_SYSTEM in src/lib/blog/prompt.ts. Already done: dead #quote links on CMS pages (fixDeadQuoteLinks in src/lib/cms-ctas.ts) and the footer. Report a before and after table.`,
  'content-pages': `Briefs: PAGE_BRIEFS in src/lib/cms/page-briefs.ts. Build as code pages in src/app/(site)/ like src/app/(site)/free-solar-quote (reuse PackagesBand on the solar and battery pages). Order: /solar-and-battery, /battery-storage, /add-battery-to-existing-solar, /battery-backup, then /residential, /whole-home-energy, heat pumps, EV, commercial, sectors. Add each to src/app/sitemap.ts, and read docs/WEBSITE-CONTENT-SPEC.md section 7 first.`,
  'blog-conversion': `Article view: src/components/blog/BlogArticleView.tsx; template src/lib/blog/cms-article-template.ts; house rules BLOG_SYSTEM in src/lib/blog/prompt.ts; written drafts in src/content/blog-drafts (do not rewrite the 13). Goal: every article leads clearly to a free survey (main button "Get my free solar quote" to /free-solar-quote, secondary "Book a free survey" to /book-a-survey) without being pushy.`,
  'post-studio-photos': `The old Post Studio saved photos as data URLs in the live database: project_images (77, linked to projects: name, location, system size, battery) and image_library (22). The Content library (src/app/admin/content, src/lib/content/server.ts) only shows HAP project photos. Show the old ones too, served through a route that decodes them, without loading every image on the list. Never show a customer's name, address or number plate.`,
  'home-speed': `Measured 16 Nov 2026 on the live site: the home page is about 16 phone screens long (13,920px), loads 43 images up front, layout shift 0.137 on desktop; the cookie banner covers about a third of a phone screen and hides the hero button on service pages. The home page is a CMS page: LIVE_FIXES_CSS in src/lib/cms-ctas.ts can change its styles without republishing.`,
};

const statusLabel = (s: BuildStatus) => BUILD_STATUSES.find((x) => x.key === s)?.label ?? s;
const SITE = 'https://heliaxis.co.uk';

/** A ready-to-paste brief for a Claude Code session that will pick this piece of work up. */
export function buildPrompt(b: BuildItem): string {
  const brief = (b.brief ?? '').trim() || STARTER_BRIEFS[b.id] || '';
  const open = b.checklist.filter((c) => !c.done);
  const done = b.checklist.filter((c) => c.done);
  const link = (l: { label: string; href: string }) => `- ${l.label}: ${l.href.startsWith('/') ? SITE + l.href : l.href}`;
  const lines: string[] = [
    `# ${b.title}`,
    '',
    'You are working in the Heliaxis repo (GitHub CallumHDevelops/heliaxis, Next.js 16, deployed on Vercel). Pick up the piece of work below from where it was left.',
    '',
    '## Before you start',
    '- Read AGENTS.md (house rules: buttons, icons, no emoji, nothing claimed that is not true). For website work also read docs/WEBSITE-CONTENT-SPEC.md and docs/SEO-GEO-STRATEGY.md.',
    '- Work in a fresh git worktree from origin/main: other sessions use the shared checkout at Desktop/heliaxis. Stage only your own files (never git add -A).',
    '- This Next.js may differ from the one you know: if node_modules/next/dist/docs/ exists, read the relevant guide before changing routing, caching or rendering.',
    '',
    '## The work',
    `- Area: ${b.area}`,
    `- Status: ${statusLabel(b.status)}`,
  ];
  if (b.summary.trim()) lines.push(`- Where it stands: ${b.summary.trim()}`);
  if (b.next.trim()) lines.push(`- Next step: ${b.next.trim()}`);
  if (b.waitingOn.trim()) lines.push(`- Waiting on: ${b.waitingOn.trim()} (ask Cal one short question rather than guess)`);
  if (open.length) lines.push('', '## Still to do', ...open.map((c) => `- [ ] ${c.text}`));
  if (done.length) lines.push('', '## Already done', ...done.map((c) => `- [x] ${c.text}`));
  if (brief) lines.push('', '## Background', brief);
  if (b.links.length) lines.push('', '## Links', ...b.links.map(link));
  lines.push(
    '',
    '## Rules',
    '- Nothing is claimed that is not true and checkable: no invented prices, savings, reviews, awards, customer numbers or years in business. If you need a fact you do not have, leave it out and list it under "Needs Cal".',
    '- British English, plain and calm, never pushy. No emoji. Use the house button styles.',
    '- Check visible changes by rendering them (screenshots at 390px and 1440px), not by reading the code alone.',
    '- Before every push: npx tsc --noEmit, npx eslint on the files you changed, npx vitest run. Every push to main deploys to production. Push with: git fetch -q origin main && git rebase origin/main && git push -q origin HEAD:main',
    '- Do not touch Stripe, the CRM, the quote builder or the EIC code unless this work is about them.',
    '',
    '## When you stop',
    `- Update this item in HAP › Team › Build tracker (${SITE}/admin/builds, item id "${b.id}"): its status, next step, waiting on and checklist, so the next session can pick it up.`,
    '- Report: what changed (with URLs), what you checked and how, what you could not check, and a "Needs Cal" list.',
  );
  return lines.join('\n') + '\n';
}

/** A file name for the downloaded prompt ("build-seo-dashboard-and-google-positions.md"). */
export function promptFileName(b: BuildItem): string {
  const slug = b.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || b.id;
  return `build-${slug}.md`;
}
