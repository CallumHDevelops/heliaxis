import { describe, expect, it } from 'vitest';
import {
  backfillPreview,
  buildLeads,
  channelFromSource,
  channelFunnel,
  confirmedChanges,
  costPerEnquiry,
  funnelOf,
  groupFunnel,
  inRange,
  jobOutcome,
  leadChannel,
  normalisePath,
  pageFunnel,
  pageGroup,
  parseUmamiPages,
  ukStart,
  usdToPence,
  type EnquiryRow,
  type OriginRow,
  type ProjectRow,
} from '@/lib/search/leads/aggregate';

const TOWNS = ['Newport', 'Cardiff', 'Vale of Glamorgan', 'Newport (Pembs)', 'Bath'];

const enq = (id: string, over: Partial<EnquiryRow> = {}): EnquiryRow => ({
  id,
  name: `Person ${id}`,
  created_at: '2026-11-10T10:00:00Z',
  source: 'cms-form',
  channel: null,
  landing_path: null,
  referrer_host: null,
  ...over,
});
const job = (id: string, enquiry_id: string, stage: string, value: number | string | null = null, survey_at: string | null = null): ProjectRow => ({ id, enquiry_id, stage, value, survey_at });

describe('paths and page groups', () => {
  it('normalises landing paths', () => {
    expect(normalisePath('/Solar-Panels/?utm_source=x#top')).toBe('/solar-panels');
    expect(normalisePath('https://heliaxis.co.uk/blog/post/')).toBe('/blog/post');
    expect(normalisePath('/')).toBe('/');
    expect(normalisePath('battery-storage')).toBe('/battery-storage');
    expect(normalisePath('')).toBeNull();
    expect(normalisePath(null)).toBeNull();
  });

  it('groups pages: blog, then town, then service, then other', () => {
    expect(pageGroup('/blog', TOWNS)).toBe('blog');
    expect(pageGroup('/blog/solar-panels-cardiff', TOWNS)).toBe('blog');
    expect(pageGroup('/solar-panels-cardiff', TOWNS)).toBe('town');
    expect(pageGroup('/areas/newport', TOWNS)).toBe('town');
    expect(pageGroup('/solar-vale-of-glamorgan', TOWNS)).toBe('town');
    expect(pageGroup('/bathroom-heating', TOWNS)).toBe('other'); // "bath" only as a whole word
    expect(pageGroup('/battery-storage', TOWNS)).toBe('service');
    expect(pageGroup('/commercial-ev-charging', TOWNS)).toBe('service');
    expect(pageGroup('/air-source-heat-pumps', TOWNS)).toBe('service');
    expect(pageGroup('/free-solar-quote', TOWNS)).toBe('service');
    expect(pageGroup('/', TOWNS)).toBe('other');
    expect(pageGroup('/contact', TOWNS)).toBe('other');
    expect(pageGroup(null, TOWNS)).toBe('none');
  });
});

describe('channels', () => {
  it('uses the captured channel, Meta by source, otherwise before tracking', () => {
    expect(leadChannel({ channel: 'organic_google', source: 'meta: Ad' })).toBe('organic_google');
    expect(leadChannel({ channel: null, source: 'meta: Solar Oct' })).toBe('paid_meta');
    expect(leadChannel({ channel: null, source: 'cms-form' })).toBe('untracked');
    expect(leadChannel({ channel: 'nonsense', source: null })).toBe('untracked');
  });
});

describe('job outcomes', () => {
  it('reads survey, quote and won from stage, survey date, surveys and quotes', () => {
    expect(jobOutcome(job('p', 'e', 'lead'), [], [])).toMatchObject({ surveyed: false, quoted: false, won: false, value: 0 });
    expect(jobOutcome(job('p', 'e', 'survey_booked'), [], [])).toMatchObject({ surveyed: true, quoted: false });
    expect(jobOutcome(job('p', 'e', 'lost', 9000, '2026-11-01T09:00:00Z'), [], [])).toMatchObject({ surveyed: true, quoted: false, won: false, value: 0 });
    expect(jobOutcome(job('p', 'e', 'lost'), [{ project_id: 'p', status: 'declined', sent_at: '2026-11-02T00:00:00Z' }], [])).toMatchObject({ surveyed: true, quoted: true });
    expect(jobOutcome(job('p', 'e', 'contacted'), [{ project_id: 'p', status: 'draft', sent_at: null }], [{ project_id: 'p', status: 'cancelled' }])).toMatchObject({ surveyed: false, quoted: false });
    expect(jobOutcome(job('p', 'e', 'contacted'), [], [{ project_id: 'p', status: 'complete' }])).toMatchObject({ surveyed: true });
    expect(jobOutcome(job('p', 'e', 'install_booked', '12500.50'), [], [])).toMatchObject({ surveyed: true, quoted: true, won: true, value: 12500.5 });
  });
});

describe('leads and the funnel', () => {
  const enquiries = [
    enq('a', { channel: 'organic_google', landing_path: '/solar-panels-cardiff', referrer_host: 'google.co.uk' }),
    enq('b', { channel: 'organic_google', landing_path: '/battery-storage/' }),
    enq('c', { source: 'meta: Solar Oct', created_at: '2026-11-12T10:00:00Z' }),
    enq('d', { channel: 'direct', landing_path: '/' }),
  ];
  const projects = [job('pa', 'a', 'won', 10000), job('pa2', 'a', 'quote_sent'), job('pb', 'b', 'surveyed'), job('pc', 'c', 'lead'), job('moved', 'd', 'complete', 8000)];
  const origins: OriginRow[] = [
    // The job "moved" came to d in a merge: its own lead was a Bing visitor whose customer row is gone.
    { id: 'o1', project_id: 'moved', enquiry_id: 'd', role: 'own', source: 'quote-form', came_in_at: '2026-11-11T09:00:00Z', job_created_at: '2026-11-11T09:00:00Z', channel: 'organic_bing', landing_path: '/solar-panels', referrer_host: 'bing.com' },
    // A lead joined into another job: counted, nothing sold.
    { id: 'o2', project_id: 'pa', enquiry_id: 'a', role: 'also', source: 'meta: Ad 2', came_in_at: null, job_created_at: '2026-11-13T09:00:00Z', channel: null, landing_path: null, referrer_host: null },
  ];
  const leads = buildLeads({ enquiries, projects, origins });

  it('builds one lead per enquiry and per kept origin, with moved jobs on their own lead', () => {
    expect(leads).toHaveLength(6);
    expect(leads.find((l) => l.id === 'd')!.jobs).toHaveLength(0);
    const own = leads.find((l) => l.id === 'origin:o1')!;
    expect(own).toMatchObject({ kind: 'origin', channel: 'organic_bing', captured: true, landingPath: '/solar-panels' });
    expect(own.jobs.map((j) => j.id)).toEqual(['moved']);
    const also = leads.find((l) => l.id === 'origin:o2')!;
    expect(also).toMatchObject({ channel: 'paid_meta', captured: false, at: '2026-11-13T09:00:00Z', jobs: [] });
    expect(leads.find((l) => l.id === 'b')!.landingPath).toBe('/battery-storage');
  });

  it('counts leads reaching each stage and adds won value', () => {
    expect(funnelOf(leads)).toEqual({ enquiries: 6, surveys: 3, quotes: 2, won: 2, value: 18000 });
    expect(funnelOf([])).toEqual({ enquiries: 0, surveys: 0, quotes: 0, won: 0, value: 0 });
  });

  it('splits by channel, every channel listed, against the previous period', () => {
    const before = buildLeads({ enquiries: [enq('x', { channel: 'organic_google' }), enq('y', { channel: 'gbp' })], projects: [] });
    const f = channelFunnel(leads, before);
    expect(f.rows.map((r) => r.channel)).toEqual(['organic_google', 'organic_bing', 'gbp', 'ai_assistant', 'paid_meta', 'paid_google', 'referral', 'direct', 'offline', 'untracked']);
    const g = f.rows.find((r) => r.channel === 'organic_google')!;
    expect(g.now).toEqual({ enquiries: 2, surveys: 2, quotes: 1, won: 1, value: 10000 });
    expect(g.before.enquiries).toBe(1);
    expect(f.rows.find((r) => r.channel === 'paid_meta')!.now.enquiries).toBe(2);
    expect(f.organic.now).toEqual({ enquiries: 3, surveys: 3, quotes: 2, won: 2, value: 18000 });
    expect(f.organic.before.enquiries).toBe(2);
    expect(f.total.now.enquiries).toBe(6);
  });

  it('joins pages to Umami sessions, including pages with no enquiries, and sums groups', () => {
    const sessions = { kind: 'visits' as const, byPath: parseUmamiPages([{ x: '/solar-panels-cardiff', y: 40 }, { x: '/battery-storage', y: 10 }, { x: '/Battery-Storage/', y: 10 }, { x: '/blog/x', y: 100 }, { x: '/', y: 50 }]) };
    const pages = pageFunnel(leads, sessions, TOWNS);
    const cardiff = pages.find((p) => p.path === '/solar-panels-cardiff')!;
    expect(cardiff).toMatchObject({ group: 'town', sessions: 40, enquiries: 1, won: 1, value: 10000, rate: 2.5 });
    expect(pages.find((p) => p.path === '/battery-storage')).toMatchObject({ sessions: 20, enquiries: 1, rate: 5 });
    expect(pages.find((p) => p.path === '/blog/x')).toMatchObject({ group: 'blog', enquiries: 0, sessions: 100, rate: 0 });
    expect(pages.find((p) => p.path === '/solar-panels')).toMatchObject({ sessions: 0, enquiries: 1, rate: null });
    const none = pages.find((p) => p.path === null)!;
    expect(none).toMatchObject({ group: 'none', sessions: null, enquiries: 2 });

    const groups = groupFunnel(pages, true);
    expect(groups.map((g) => g.group)).toEqual(['service', 'town', 'blog', 'other', 'none']);
    expect(groups.find((g) => g.group === 'service')).toMatchObject({ pages: 2, sessions: 20, enquiries: 2, won: 1, value: 8000, rate: 10 });
    expect(groups.find((g) => g.group === 'other')).toMatchObject({ pages: 1, sessions: 50, enquiries: 1, rate: 2 });
    expect(groups.find((g) => g.group === 'none')).toMatchObject({ sessions: null, enquiries: 2, pages: 0 });
    expect(groupFunnel(pageFunnel(leads, null, TOWNS), false).every((g) => g.sessions === null)).toBe(true);
  });
});

describe('Umami rows', () => {
  it('reads both the plain and the expanded shapes', () => {
    expect([...parseUmamiPages([{ x: '/a', y: 3 }, { x: '/a/', y: 2 }, { x: '', y: 9 }, null, 'x']).entries()]).toEqual([['/a', 5]]);
    expect([...parseUmamiPages([{ name: '/b', visits: 7, pageviews: 20 }], 'visits').entries()]).toEqual([['/b', 7]]);
    expect(parseUmamiPages({ error: 'no' }).size).toBe(0);
  });
});

describe('dates', () => {
  it('uses UK midnight and UK calendar days', () => {
    expect(ukStart('2026-01-15')).toBe('2026-01-15T00:00:00.000Z');
    expect(ukStart('2026-07-15')).toBe('2026-07-14T23:00:00.000Z');
    expect(inRange({ at: '2026-07-14T23:30:00Z' }, '2026-07-15', '2026-07-15')).toBe(true);
    expect(inRange({ at: '2026-07-14T22:30:00Z' }, '2026-07-15', '2026-07-15')).toBe(false);
  });
});

describe('cost per enquiry', () => {
  it('divides spend by enquiries, or says nothing', () => {
    expect(costPerEnquiry(53950, 10)).toBe(5395);
    expect(costPerEnquiry(1000, 3)).toBe(333);
    expect(costPerEnquiry(1000, 0)).toBeNull();
    expect(costPerEnquiry(null, 5)).toBeNull();
    expect(usdToPence(12.5, 0.8)).toBe(1000);
  });
});

describe('channel backfill', () => {
  it('only labels sources that name a channel without doubt', () => {
    expect(channelFromSource('meta: Solar Oct 2026')?.channel).toBe('paid_meta');
    expect(channelFromSource('meta-lead-ad')?.channel).toBe('paid_meta');
    expect(channelFromSource('meta-ad: Battery / Ad 3')?.channel).toBe('paid_meta');
    expect(channelFromSource('whatsapp-ad')?.channel).toBe('paid_meta');
    expect(channelFromSource('google-ads')?.channel).toBe('paid_google');
    expect(channelFromSource('google-ads: Brand')?.channel).toBe('paid_google');
    expect(channelFromSource('chatgpt.com')?.channel).toBe('ai_assistant');
    expect(channelFromSource('google: gbp')?.channel).toBe('gbp');
    expect(channelFromSource('google: gbp / listing')?.channel).toBe('gbp');
    for (const s of ['meta-organic', 'cms-form', 'quote-form', 'solar-estimator', 'website-booking', 'google', 'google: gbpx', 'metaverse', 'facebook', '', null]) expect(channelFromSource(s)).toBeNull();
  });

  it('previews exactly the unlabelled rows that change, and confirms only what was seen', () => {
    const rows = [
      { table: 'enquiries' as const, id: '1', at: '2026-01-01T00:00:00Z', name: 'A', source: 'meta: Ad', channel: null },
      { table: 'enquiries' as const, id: '2', at: '2026-02-01T00:00:00Z', name: 'B', source: 'meta: Ad', channel: 'organic_google' },
      { table: 'enquiries' as const, id: '3', at: '2026-03-01T00:00:00Z', name: 'C', source: 'cms-form', channel: null },
      { table: 'crm_lead_origins' as const, id: '4', at: '2026-04-01T00:00:00Z', name: null, source: 'google-ads: Brand', channel: null },
    ];
    const p = backfillPreview(rows);
    expect(p.map((c) => [c.table, c.id, c.channel])).toEqual([
      ['crm_lead_origins', '4', 'paid_google'],
      ['enquiries', '1', 'paid_meta'],
    ]);
    const seen = [
      { table: 'enquiries', id: '1', channel: 'paid_meta' },
      { table: 'enquiries', id: '3', channel: 'paid_meta' }, // never in the preview
      { table: 'crm_lead_origins', id: '4', channel: 'paid_meta' }, // a different answer than now
    ];
    expect(confirmedChanges(p, seen).map((c) => c.id)).toEqual(['1']);
  });
});
