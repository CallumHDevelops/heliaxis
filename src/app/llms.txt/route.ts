import { getCmsRendered } from '@/lib/cms-rendered';
import { normPath } from '@/lib/geo/shared';

export const dynamic = 'force-dynamic';

const BASE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://heliaxis.co.uk').replace(/\/$/, '');

/** Pages built into the app rather than the CMS (as in sitemap.ts). */
const APP_PAGES: [string, string][] = [
  ['/commercial-funding', 'Commercial solar funding and finance'],
  ['/solar-estimator', 'Solar savings estimator'],
  ['/book-a-survey', 'Book a free survey'],
  ['/newport-net-zero-grant', 'Newport net zero grant'],
  ['/warehousing', 'Solar for warehousing and logistics'],
  ['/blog', 'Blog'],
];

const line = (path: string, name: string, desc?: string) =>
  `- [${name.replace(/[[\]]/g, '')}](${BASE}${path === '/' ? '' : path})${desc ? `: ${desc.replace(/\s+/g, ' ').trim()}` : ''}`;

/**
 * /llms.txt (llmstxt.org): a plain map of the site for AI assistants and their crawlers, built from
 * the published CMS pages, so it follows every Publish and the GEO bot's changes (src/lib/geo).
 */
export async function GET() {
  const rendered = await getCmsRendered();
  const live = (rendered?.pages ?? []).filter((p) => p.html?.trim() && !p.seo?.noindex);
  const seen = new Set<string>();
  const pages: string[] = [];
  const articles: string[] = [];
  for (const p of live) {
    const path = normPath(p.slug);
    if (seen.has(path)) continue;
    seen.add(path);
    const entry = line(path, p.seo?.title || p.name || path, p.seo?.desc);
    (path.startsWith('/blog/') ? articles : pages).push(entry);
  }
  for (const [path, name] of APP_PAGES) if (!seen.has(path)) pages.push(line(path, name));

  const body = [
    '# Heliaxis',
    '',
    '> Heliaxis Ltd is an MCS-certified renewable energy installer based in Newport, South Wales. It designs and installs solar PV, battery storage, air source heat pumps, EV chargers, infrared heating and LED lighting for homes, businesses, local authorities and public sector organisations across Wales and the South West of England.',
    '',
    `Website: ${BASE}. Free, no-obligation surveys can be booked at ${BASE}/book-a-survey.`,
    '',
    '## Pages',
    '',
    ...pages,
    ...(articles.length ? ['', '## Articles', '', ...articles] : []),
    '',
  ].join('\n');

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400' },
  });
}
