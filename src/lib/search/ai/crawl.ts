/** Crawler access: the user agents to fetch as, and what a status code means. Pure, so it can be tested and shown client-side. */

export const CRAWLER_UA: Record<string, string> = {
  browser: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Googlebot: 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  Bingbot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/131.0.0.0 Safari/537.36',
  'OAI-SearchBot': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.3; +https://openai.com/searchbot',
  'ChatGPT-User': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot',
  PerplexityBot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
  'Claude-SearchBot': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-SearchBot/1.0; +Claude-SearchBot@anthropic.com)',
};

export type CrawlerVerdict = 'ok' | 'blocked' | 'robots' | 'error' | 'site_down';
export type CrawlerResult = { bot: string; status: number; ms: number; redirectedTo: string | null; error?: string; robotsBlocked: boolean; verdict: CrawlerVerdict };

export function crawlerVerdict(status: number, baseline: number, robotsBlocked: boolean): CrawlerVerdict {
  if (robotsBlocked) return 'robots';
  if (baseline === 0 || baseline >= 500) return 'site_down';
  if (status >= 200 && status < 400) return 'ok';
  if (status === 401 || status === 403 || status === 429) return 'blocked';
  return 'error';
}

export const VERDICT_LABEL: Record<CrawlerVerdict, string> = {
  ok: 'Let in',
  blocked: 'Turned away',
  robots: 'Blocked by robots.txt',
  error: 'Error',
  site_down: 'Site not answering',
};
