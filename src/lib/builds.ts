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
  const b = (id: string, v: Omit<BuildItem, 'id' | 'createdAt' | 'updatedAt'>) => cleanBuild({ id, ...v, createdAt: now }, now);
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
