import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { dfsBalance, dfsConfigured } from '@/lib/dataforseo/client';
import { getUmamiConfig } from '@/lib/umami';
import { siteBase } from '@/lib/seo/server';
import { gscStatus } from './gsc';
import { clearAction, raiseAction } from './inbox';
import { budget, getSetting } from './server';

/**
 * The setup checklist (spec §10.5): what the system depends on, each item Done, Needs action, or Can't check
 * automatically (a person ticks it, with the date). Items that need action become Needs you items, and close by
 * themselves once done.
 */

type Db = ReturnType<typeof createAdminClient>;
export type CheckState = 'done' | 'action' | 'manual';
export type CheckItem = { key: string; label: string; state: CheckState; detail: string; how: string[]; href?: string };

async function fetchText(url: string): Promise<{ status: number; body: string }> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10_000), cache: 'no-store', headers: { 'User-Agent': 'HeliaxisSearch/1.0' } });
    return { status: r.status, body: await r.text() };
  } catch {
    return { status: 0, body: '' };
  }
}

/** The search and AI crawlers that must stay allowed (spec M6). */
export const CRAWLERS = ['Googlebot', 'Bingbot', 'OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'Claude-SearchBot'];

/** Does robots.txt block any of them from the whole site? A simple reading: a group naming it (or *) with "Disallow: /". */
export function robotsBlocks(robots: string): string[] {
  const groups: { agents: string[]; disallowAll: boolean }[] = [];
  let cur: { agents: string[]; disallowAll: boolean } | null = null;
  let lastWasAgent = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const [k, ...v] = line.split(':');
    const key = k.trim().toLowerCase();
    const val = v.join(':').trim();
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], disallowAll: false };
        groups.push(cur);
      }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (cur && key === 'disallow' && val === '/') cur.disallowAll = true;
    }
  }
  return CRAWLERS.filter((bot) => {
    const own = groups.find((g) => g.agents.includes(bot.toLowerCase()));
    const g = own ?? groups.find((x) => x.agents.includes('*'));
    return !!g?.disallowAll;
  });
}

export async function checklist(db: Db = createAdminClient()): Promise<CheckItem[]> {
  const base = siteBase();
  const [gsc, robots, sitemap, home, confirmed, money, b] = await Promise.all([
    gscStatus(),
    fetchText(`${base}/robots.txt`),
    fetchText(`${base}/sitemap.xml`),
    fetchText(`${base}/`),
    getSetting('checklist', db),
    dfsConfigured() ? dfsBalance().catch(() => null) : Promise.resolve(null),
    budget('dataforseo', db),
  ]);
  const manual = (key: string) => confirmed.confirmed[key];
  const blocked = robots.status === 200 ? robotsBlocks(robots.body) : [];
  const ld = [...home.body.matchAll(/"@type"\s*:\s*"([^"]+)"/g)].map((m) => m[1]);
  const umami = getUmamiConfig();

  const items: CheckItem[] = [
    {
      key: 'gsc',
      label: 'Search Console verified, and HAP has access',
      state: gsc.ok ? 'done' : 'action',
      detail: gsc.message,
      how: [
        'In Search Console, add a Domain property for heliaxis.co.uk.',
        'Copy the TXT record it gives you and add it in Vercel › Domains › heliaxis.co.uk › DNS records.',
        'Press Verify in Search Console.',
        'In Google Cloud, create a service account with the Search Console API on, and download its JSON key.',
        'In Search Console › Settings › Users and permissions, add the service account’s email as a user.',
        'Add the JSON key to Vercel as GSC_SERVICE_ACCOUNT.',
      ],
      href: '/admin/search/settings/connections',
    },
    {
      key: 'sitemap',
      label: 'Sitemap submitted and read',
      state: sitemap.status === 200 && manual('sitemap') ? 'done' : sitemap.status === 200 ? 'manual' : 'action',
      detail: sitemap.status === 200 ? `${(sitemap.body.match(/<loc>/g) ?? []).length} addresses in /sitemap.xml${manual('sitemap') ? `; submitted, ticked ${manual('sitemap')}` : '. Tick once it is submitted in Search Console.'}` : `/sitemap.xml answered ${sitemap.status || 'nothing'}`,
      how: ['In Search Console › Sitemaps, submit https://heliaxis.co.uk/sitemap.xml.', 'Come back when it says Success and tick this item.'],
    },
    {
      key: 'bing',
      label: 'Bing Webmaster Tools verified',
      state: manual('bing') ? 'done' : 'manual',
      detail: manual('bing') ? `Ticked ${manual('bing')}` : 'Not checked automatically yet.',
      how: ['At bing.com/webmasters, choose Import from Google Search Console (quickest once Search Console is verified).', 'Tick this item.'],
    },
    {
      key: 'genai',
      label: 'Generative AI report available in Search Console',
      state: manual('genai') ? 'done' : 'manual',
      detail: manual('genai') ? `Ticked ${manual('genai')}` : 'Has no API: check it shows under Performance, then tick.',
      how: ['In Search Console › Performance, look for the Generative AI report.', 'Each month, export it as CSV and upload it in AI answers (phase 4).'],
    },
    {
      key: 'gbp',
      label: 'Business Profile connected and API approved',
      state: 'action',
      detail: 'Not connected yet (phase 2).',
      how: ['Give HAP owner access to the Google Business Profile.', 'Request Business Profile API access in Google Cloud: new projects start with a quota of 0.'],
    },
    {
      key: 'dataforseo',
      label: 'DataForSEO credentials and balance',
      state: dfsConfigured() && money !== null && money >= 10 ? 'done' : 'action',
      detail: !dfsConfigured() ? 'No login set.' : money === null ? 'The login was not accepted, or DataForSEO did not answer.' : `Balance $${money.toFixed(2)}; this month $${b.spent.toFixed(2)} of the $${b.cap} cap.`,
      how: ['Top up at app.dataforseo.com (the minimum top-up is $50 and the balance does not expire).', 'Set DATAFORSEO_BASE64 (or LOGIN and PASSWORD) in Vercel.'],
    },
    {
      key: 'umami',
      label: 'Umami connected',
      state: umami ? 'done' : 'action',
      detail: umami ? 'Connected.' : 'Umami is not set up.',
      how: ['Set the Umami variables in Vercel (see Analytics).'],
    },
    {
      key: 'robots',
      label: 'robots.txt allows search and AI crawlers',
      state: robots.status === 200 && !blocked.length ? 'done' : 'action',
      detail: robots.status !== 200 ? `/robots.txt answered ${robots.status || 'nothing'}` : blocked.length ? `Blocked: ${blocked.join(', ')}` : `Allows ${CRAWLERS.join(', ')}.`,
      how: ['Edit src/app/robots.ts so none of these is disallowed.'],
    },
    {
      key: 'schema',
      label: 'Organization and LocalBusiness schema on the home page',
      state: ld.some((t) => /LocalBusiness|Organization|HomeAndConstructionBusiness|Electrician/i.test(t)) ? 'done' : 'action',
      detail: ld.length ? `Types found: ${[...new Set(ld)].slice(0, 8).join(', ')}` : 'No structured data found on the home page.',
      how: ['Add LocalBusiness JSON-LD built from Settings › Business facts (name, address, phone, area, credentials).'],
    },
    {
      key: 'indexnow',
      label: 'IndexNow key installed',
      state: process.env.INDEXNOW_KEY ? 'done' : 'action',
      detail: process.env.INDEXNOW_KEY ? 'Key set.' : 'No INDEXNOW_KEY yet (used when the content studio publishes, phase 3).',
      how: ['Generate a key at bing.com/indexnow and set it in Vercel as INDEXNOW_KEY.'],
    },
    {
      key: 'manual_review',
      label: 'Monthly look at Manual actions and Security issues',
      state: manual('manual_review') && Date.now() - Date.parse(manual('manual_review')!) < 35 * 86_400_000 ? 'done' : 'manual',
      detail: manual('manual_review') ? `Last ticked ${manual('manual_review')}` : 'These two reports are not in the Search Console API.',
      how: ['In Search Console › Security and manual actions, open both reports.', 'Tick this item; it asks again after a month.'],
    },
  ];
  return items;
}

/** Daily: each item needing action is a Needs you item, closed when it is done. */
export async function runSetupCheck(db: Db = createAdminClient()) {
  const items = await checklist(db);
  for (const i of items) {
    if (i.state === 'done') await clearAction('setup', i.key, db);
    else if (i.state === 'action') await raiseAction({ kind: 'setup', ref: i.key, title: `Set up: ${i.label}`, why: i.detail, fixHref: '/admin/search/settings' }, db);
  }
  const b = await budget('dataforseo', db);
  if (b.cap && b.spent > b.cap * 0.8) await raiseAction({ kind: 'budget', ref: 'cap:dataforseo', title: 'DataForSEO spend is over 80% of this month’s cap', why: `$${b.spent.toFixed(2)} of $${b.cap}.`, fixHref: '/admin/search/settings/budget' }, db);
  else await clearAction('budget', 'cap:dataforseo', db);
  return items;
}
