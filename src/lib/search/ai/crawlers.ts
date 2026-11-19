import 'server-only';
import { CRAWLERS, robotsBlocks } from '../checklist';
import { siteBase } from '@/lib/seo/server';
import { crawlerVerdict, CRAWLER_UA, type CrawlerResult } from './crawl';

/**
 * Crawler access (spec §5 M6): robots.txt, then the home page fetched as each search and AI crawler, next to an
 * ordinary browser for comparison. A fetch with a crawler's name comes from HAP's servers, not the crawler's, so a block
 * that only one of them hits can be a firewall rule against look-alikes rather than against the real crawler.
 */

async function hit(url: string, ua: string): Promise<{ status: number; ms: number; redirectedTo: string | null; error?: string }> {
  const started = Date.now();
  try {
    const r = await fetch(url, { headers: { 'User-Agent': ua, Accept: 'text/html' }, redirect: 'follow', cache: 'no-store', signal: AbortSignal.timeout(12_000) });
    await r.body?.cancel().catch(() => {});
    return { status: r.status, ms: Date.now() - started, redirectedTo: r.redirected ? r.url : null };
  } catch (e) {
    return { status: 0, ms: Date.now() - started, redirectedTo: null, error: e instanceof Error ? e.message : 'No answer' };
  }
}

export async function checkCrawlers(): Promise<{ checkedAt: string; base: string; robotsStatus: number; robotsBlocked: string[]; baseline: number; results: CrawlerResult[] }> {
  const base = siteBase();
  const robots = await fetch(`${base}/robots.txt`, { cache: 'no-store', signal: AbortSignal.timeout(10_000), headers: { 'User-Agent': 'HeliaxisSearch/1.0' } })
    .then(async (r) => ({ status: r.status, body: await r.text() }))
    .catch(() => ({ status: 0, body: '' }));
  const blocked = robots.status === 200 ? robotsBlocks(robots.body) : [];
  const [browser, ...bots] = await Promise.all([hit(`${base}/`, CRAWLER_UA.browser), ...CRAWLERS.map((c) => hit(`${base}/`, CRAWLER_UA[c] ?? `${c}/1.0`))]);
  return {
    checkedAt: new Date().toISOString(),
    base,
    robotsStatus: robots.status,
    robotsBlocked: blocked,
    baseline: browser.status,
    results: CRAWLERS.map((c, i) => ({ bot: c, ...bots[i], robotsBlocked: blocked.includes(c), verdict: crawlerVerdict(bots[i].status, browser.status, blocked.includes(c)) })),
  };
}
