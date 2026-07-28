import type { BlogCategory, BlogPost } from '@/lib/blog/types';

export const BLOG_CATEGORIES: BlogCategory[] = [
  { id: 'cat-solar', title: 'Solar', slug: 'solar', description: 'Solar PV for homes and businesses' },
  { id: 'cat-battery', title: 'Battery', slug: 'battery', description: 'Storage and self-consumption' },
  { id: 'cat-funding', title: 'Funding', slug: 'funding', description: 'Grants, finance and PPA' },
  { id: 'cat-business', title: 'Business', slug: 'business', description: 'Commercial and public sector' },
  { id: 'cat-home', title: 'Home', slug: 'home', description: 'Residential energy guides' },
];

const bySlug = (slug: string) => BLOG_CATEGORIES.find((c) => c.slug === slug)!;

/** Mock posts for Phase 1 UI and when Sanity is not configured. */
export const BLOG_MOCK_POSTS: BlogPost[] = [
  {
    id: 'mock-1',
    title: 'Solar PV for Cardiff homes: what actually matters',
    slug: 'solar-pv-cardiff-homes',
    excerpt:
      'A practical guide to roof suitability, bill savings, and MCS-certified install for South Wales households — without the sales fluff.',
    author: 'Heliaxis',
    status: 'published',
    publishAt: '2026-06-12T09:00:00.000Z',
    readMinutes: 8,
    categories: [bySlug('solar'), bySlug('home')],
    mainImage: {
      src: 'https://images.unsplash.com/photo-1509391366360-2e959784a276?w=1600&q=80',
      alt: 'Solar panels on a residential roof under clear sky',
    },
    seoTitle: 'Solar PV for Cardiff homes — Heliaxis guide',
    seoDescription:
      'How solar works for Cardiff and South Wales homes: roof checks, savings, battery pairing, and what an MCS install looks like.',
    body: [
      {
        type: 'p',
        text: 'If you live in Cardiff, Newport, or the Vale, solar is no longer a niche upgrade — it is one of the clearest ways to cut bills and lock in cleaner power. This guide covers what actually decides whether a system is worth it for your home.',
      },
      { type: 'h2', text: 'Start with the roof, not the brochure' },
      {
        type: 'p',
        text: 'Orientation, shading, and roof condition matter more than panel brand marketing. A south-facing plane with limited shade will outperform a larger array on a heavily shaded east–west split. We survey in person so the design matches your roof, not a generic template.',
      },
      {
        type: 'ul',
        items: [
          'Orientation and pitch — south and south-east/west usually win',
          'Trees, chimneys, and neighbouring buildings that cast shade',
          'Roof age and structure — we will not install on a roof that needs work first',
          'Loft access and inverter location for a tidy install',
        ],
      },
      { type: 'h2', text: 'What “savings” really means' },
      {
        type: 'p',
        text: 'Daytime generation offsets what you would have bought from the grid. Export payments help, but self-consumption is where most households feel the difference — especially if you can shift laundry, EV charging, or immersion to sunny hours.',
      },
      {
        type: 'quote',
        text: 'Honest figures beat optimistic ones. We model your usage pattern, not a best-case spreadsheet.',
      },
      { type: 'h2', text: 'Battery or solar-only?' },
      {
        type: 'p',
        text: 'A battery stores surplus for evening peaks. It is not mandatory, but it often makes sense for homes that use most electricity after dark. We size storage to your load — not the largest unit in the catalogue.',
      },
      {
        type: 'cta',
        label: 'Get a free survey',
        href: '/#quote',
      },
      { type: 'h3', text: 'MCS, warranties, and paperwork' },
      {
        type: 'p',
        text: 'Heliaxis is MCS-certified. That matters for quality, insurance, and any schemes that require accredited installers. You get clear documentation, handover, and monitoring so you can see generation from day one.',
      },
      {
        type: 'p',
        text: 'Ready to see what your roof can do? Book a free, no-obligation survey across South Wales.',
      },
    ],
  },
  {
    id: 'mock-2',
    title: 'When a battery pays for itself in a South Wales home',
    slug: 'battery-storage-south-wales',
    excerpt:
      'Self-consumption, evening peaks, and how we size storage so you are not paying for unused capacity.',
    author: 'Heliaxis',
    status: 'published',
    publishAt: '2026-05-28T09:00:00.000Z',
    readMinutes: 6,
    categories: [bySlug('battery'), bySlug('home')],
    mainImage: {
      src: 'https://images.unsplash.com/photo-1621905252507-b35492cc74b4?w=1600&q=80',
      alt: 'Home battery storage unit installed indoors',
    },
    body: [
      {
        type: 'p',
        text: 'Solar without storage still cuts daytime bills. A battery extends that benefit into the evening — which is when most Welsh homes use the most power.',
      },
      { type: 'h2', text: 'The self-consumption lever' },
      {
        type: 'p',
        text: 'Every kilowatt-hour you use from your own panels is a kilowatt-hour you do not buy at retail rates. Storage raises that share when generation and demand do not line up.',
      },
      {
        type: 'ul',
        items: [
          'Evening cooking and heating loads',
          'EV charging after work',
          'Heat pump demand in colder months',
          'Export rates that are lower than import rates',
        ],
      },
      {
        type: 'cta',
        label: 'Talk to us about storage',
        href: '/#quote',
      },
    ],
  },
  {
    id: 'mock-3',
    title: 'Commercial funding options: buy, finance, or PPA',
    slug: 'commercial-funding-buy-finance-ppa',
    excerpt:
      'How South Wales businesses choose between outright purchase, finance, and power purchase agreements.',
    author: 'Heliaxis',
    status: 'published',
    publishAt: '2026-05-10T09:00:00.000Z',
    readMinutes: 7,
    categories: [bySlug('funding'), bySlug('business')],
    mainImage: {
      src: 'https://images.unsplash.com/photo-1497435334941-8c899ee9e8e9?w=1600&q=80',
      alt: 'Commercial rooftop solar array on a warehouse',
    },
    body: [
      {
        type: 'p',
        text: 'Capital, cashflow, and who owns the system — those three questions decide the right funding path for a commercial roof.',
      },
      { type: 'h2', text: 'Buy outright' },
      {
        type: 'p',
        text: 'Highest lifetime return if you have the capital. You own the asset, claim the savings, and control maintenance strategy.',
      },
      { type: 'h2', text: 'Finance' },
      {
        type: 'p',
        text: 'Spread the cost. Often structured so monthly payments sit close to the bill reduction — bill-neutral or better in strong cases.',
      },
      { type: 'h2', text: 'PPA' },
      {
        type: 'p',
        text: 'Little or no upfront cost. A funder owns and maintains the system; you buy the power at an agreed rate. Strong fit when capital is reserved for the core business.',
      },
      {
        type: 'cta',
        label: 'Explore commercial funding',
        href: '/commercial-funding',
      },
    ],
  },
  {
    id: 'mock-4',
    title: 'Warehouse rooftops: why logistics sites suit solar',
    slug: 'warehouse-rooftop-solar',
    excerpt:
      'Large roofs, daytime loads, and predictable operations make warehousing a natural fit for PV.',
    author: 'Heliaxis',
    status: 'published',
    publishAt: '2026-04-22T09:00:00.000Z',
    readMinutes: 5,
    categories: [bySlug('business'), bySlug('solar')],
    mainImage: {
      src: 'https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=1600&q=80',
      alt: 'Industrial warehouse exterior with large roof area',
    },
    body: [
      {
        type: 'p',
        text: 'Warehouses often have the two things residential roofs lack at scale: area and daytime demand. That combination is why logistics and light industrial sites see strong solar economics.',
      },
      {
        type: 'quote',
        text: 'A clear structural survey and export strategy matter as much as panel count.',
      },
      {
        type: 'cta',
        label: 'Discuss a commercial survey',
        href: '/#quote',
      },
    ],
  },
  {
    id: 'mock-5',
    title: 'Newport net zero grants: what to check before you apply',
    slug: 'newport-net-zero-grant-checklist',
    excerpt:
      'Eligibility, timing, and installer accreditation — a short checklist before you chase grant paperwork.',
    author: 'Heliaxis',
    status: 'published',
    publishAt: '2026-04-02T09:00:00.000Z',
    readMinutes: 4,
    categories: [bySlug('funding'), bySlug('home')],
    mainImage: {
      src: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1600&q=80',
      alt: 'Person reviewing documents at a desk',
    },
    body: [
      {
        type: 'p',
        text: 'Grant schemes change. Before you spend evenings on forms, confirm the basics: property eligibility, technology list, and whether your installer must be MCS-accredited.',
      },
      {
        type: 'ul',
        items: [
          'Confirm the scheme is open and your postcode qualifies',
          'Check which measures are covered (solar, battery, heating)',
          'Use an accredited installer where required',
          'Keep quotes and surveys aligned with scheme rules',
        ],
      },
      {
        type: 'cta',
        label: 'Read the Newport grant guide',
        href: '/newport-net-zero-grant',
      },
    ],
  },
  {
    id: 'mock-6',
    title: 'Scheduled: heat pumps and solar working together',
    slug: 'heat-pumps-and-solar-together',
    excerpt:
      'How generation and heating loads interact — and why a joined-up design beats two separate quotes.',
    author: 'Heliaxis',
    status: 'scheduled',
    publishAt: '2099-01-15T09:00:00.000Z',
    readMinutes: 6,
    categories: [bySlug('home'), bySlug('solar')],
    mainImage: {
      src: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1600&q=80',
      alt: 'Modern home exterior in soft daylight',
    },
    body: [
      {
        type: 'p',
        text: 'This post is scheduled for the future and should not appear on the public blog until publishAt has passed.',
      },
    ],
  },
];
