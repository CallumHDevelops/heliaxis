# HAP SEO & GEO Command Centre — Build Spec

Nov 19, 2026 · @Cal

## 1. Brief for Sonnet

**Build one SEO & GEO Command Centre inside HAP at `/admin/search`. It should turn search data into pages that bring in enquiries, and prove which enquiries came from search.** It replaces the two SEO screens that exist today (`/admin/analytics/seo` and `/admin/social/seo`) and reuses their code where it works. It is presented as its own product inside HAP, called Search, with weekly reports, a Needs you inbox and a Settings area (§10).

**Why now.** The current dashboard cannot answer Cal's basic question, "where are we on Google?". The latest saved run (`seo-serp:2026-11-17`) holds 103 tracked searches. Not one has an organic result parsed, 46 have errors, and the competitor analysis is empty. Two faults cause this:

1. **Google now wraps result links.** Since about 30 October 2026, DataForSEO's live SERP responses return organic results as `google.com/goto?url=…` with `domain: "google.com"`. `parseSerp()` in `src/lib/seo/rankings.ts` skips every row it cannot resolve, so every organic list comes back empty. DataForSEO added a fix on 16 November 2026: the `resolve_goto_urls` parameter, which is off by default on Live requests.
2. **Depth 20 hides us.** `oneSearch()` in `src/lib/seo/serp.ts` asks for 20 results. Heliaxis is not in the top 20 for any tracked search, so the dashboard shows "not ranked" when we may be at 34 or 71. Cal wants our position "whichever page we are on".

**The business outcome is more organic enquiries.** Of the 165 enquiries in HAP today, about 140 came from Meta ads and 11 came from website forms (cms-form, quote-form, solar-estimator, website-booking). None is labelled organic, because `src/lib/attribution.ts` records UTM tags, `fbclid` and `gclid` but not the referrer. So organic leads cannot be counted at all yet.

**What the build must do (Cal's asks, in his words first):**

| Cal asked for | What we build | Module |
| --- | --- | --- |
| "See our position on Google, despite which page we are on" | Positions 1 to 100 for every tracked search, plus every keyword Google already ranks us for (tracked or not) | M1 Rank tracker |
| "Know what the top 10 are doing to rank" | A teardown of each top-10 result: page type, word count, headings, schema, questions answered, freshness, links, Google Business Profile strength | M2 SERP teardown |
| "Work out what pages we need" | A keyword-to-page map, content gaps against competitors, and a scored queue of pages to build or improve | M3 Opportunity planner |
| "Write pages of content that will help our position" | A brief-then-draft writer that grounds every page in the teardown and in Heliaxis's own facts, with human approval before publishing to the CMS | M4 Content studio |
| "Review best SEO / GEO practice" | Local pack and map grid, AI-answer visibility, technical health | M5, M6, M7 |
| "Increase organic lead acquisition" | Organic lead attribution, from search to enquiry to won job | M8 Lead attribution |

**Ground rules for the build.** Follow `AGENTS.md` (house buttons, `BrandIcon`, no emoji, `WritingSpark` while the assistant works). Read the Next.js docs in `node_modules/next/dist/docs/` before touching routing or caching. Follow the claims rules in `docs/SEO-GEO-STRATEGY.md` §11: credentials are MCS, RECC and NAPIT only, with no invented reviews, prices or figures. Every paid API call is logged with its cost and capped monthly (§7).

## 2. Context: Heliaxis and HAP today

**Heliaxis is an MCS-certified installer in Newport covering South Wales and the South West.** It installs solar PV, battery storage, air source heat pumps, EV chargers and infrared heating, for homes and businesses. The facts the build may state are fixed in `docs/SEO-GEO-STRATEGY.md`: MCS, RECC and NAPIT (not NICEIC), phone 01633 965205, and "South Wales and the South West" as the area wording.

**Stack.** HAP is the Next.js 16 app in `CallumHDevelops/heliaxis`, deployed to the Vercel project `heliaxis` (region `lhr1`). Its data lives in the Supabase project `Heliaxis` (`evkicstyibkxxfgyqfno`, eu-west-2). Website analytics come from Umami (`src/lib/umami.ts`). The writing assistant goes through OpenRouter (`src/lib/studio/ai.ts`), and the AI-answer sampler uses the Anthropic SDK directly (`src/lib/social/competitors/geo-run.ts`).

**What already exists, and what to do with it:**

| Piece | Where | State today | Decision |
| --- | --- | --- | --- |
| Weekly rankings (DataForSEO, Live, depth 20, desktop) | `src/lib/seo/serp.ts`, `rankings.ts`, cron `/api/cron/seo-rankings` Mon 04:30 | Broken by goto links; snapshots kept as JSON in `cms_kv` | Rebuild on new tables (M1); keep the town location lookup and the `NOT_INSTALLERS` list |
| Map pack league | `packLeague()` in `rankings.ts` | Works: the pack is parsed by business name | Keep, move to M5 |
| Competitor page facts and AI write-up | `runCompetitorAnalysis()` | Empty, because it depends on organic results | Replace with M2 teardown |
| Site health crawl and meta proposals | `src/lib/seo/server.ts`, cron `/api/cron/seo-weekly` Mon 05:00 | Works (audit saved 19 Nov) | Keep; extend in M7 |
| Tracked keywords | `social_seo_keyword` (103 rows: Cardiff, Swansea, Newport, Bridgend) | `location_code` empty | Migrate into `seo_keyword` with service, town and intent |
| Unused SEO tables | `social_seo_rank`, `social_search_console_daily`, `social_site_health` (all 0 rows) | Never filled | Drop after migration |
| AI-answer sampling | `social_geo_prompt` (10 prompts), `social_geo_sample`, plus `geo_prompts`, `geo_runs`, `geo_checks`, `geo_suggestions` | Two parallel designs, both nearly empty | Merge into one in M6 |
| Competitors | `social_competitor` (7 rows, websites mostly blank) | Names and towns only | Fill domains and Google place IDs from M2 and M5 |
| Blog and page writer | `src/lib/blog/*`, `src/lib/cms/ai-page.ts` (CMS block contract), `page-briefs.ts` (22 briefs) | Works | M4 writes through these, it does not fork them |
| Lead attribution | `src/lib/attribution.ts`, `crm_lead_origins`, `enquiries.source` | UTM, Meta and Google Ads only | Extend with referrer and landing page (M8) |
| Spend tracking | `social_vendor_spend`, `ai_usage` | In use for AI | Add DataForSEO rows (§7) |

**Constraints.** Vercel functions here run for up to 5 minutes, so long jobs run as queued steps, never one request. Search Console and Bing Webmaster Tools are not yet connected: verifying them is a manual step for Cal (§8). The marketing team will grow, so every screen needs roles: `owner` and `admin` can spend and publish, `editor` can draft, `viewer` can only read.

## 3. What good SEO and GEO look like in late 2026

**For Google, GEO is still SEO: AI Overviews and AI Mode are built on the normal index and ranking systems, so the work that ranks pages also gets them cited.** Google's May 2026 guide says so directly. It also lists what not to do: llms.txt files, splitting content into chunks, and creating a page for every fan-out query, which it classes as scaled content abuse. The tool is built around that position. It measures AI visibility on its own, but the actions it suggests are ordinary, honest SEO.

| # | Finding (late 2026) | Evidence | What HAP does about it |
| --- | --- | --- | --- |
| 1 | AI features run on core Search. Google says no special files, markup or chunking are needed, and a page per fan-out variation breaks the scaled content policy | [Google AI optimisation guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide), May 2026 | M3 groups similar searches into one page. M4 refuses near-duplicate pages. No llms.txt or "AI markup" features |
| 2 | AI Overviews take clicks. Ahrefs found position 1 gets about 58% lower CTR when an Overview shows | [Ahrefs](https://ahrefs.com/blog/ai-overviews-reduce-clicks-update) (Dec 2025 data) | M1 records whether each search shows an Overview and whether we are cited in it. Reports show impressions and enquiries, not just clicks |
| 3 | Mass-produced AI pages are being hit. The March 2026 core update and the August 2026 spam update targeted scaled content | [Digital Applied](https://www.digitalapplied.com/blog/scaled-content-abuse-google-march-update-ai-pages-decimated), [GSQI](https://gsqi.com/marketing-blog/august-2026-google-spam-update-case-studies/) | M4 has a weekly publish limit, an originality check, and a person must approve every page. No town-swap pages |
| 4 | Local rankings: the primary Business Profile category ranks first of 187 factors. On-page signals are 33% of local organic ranking, and review signals rose from 16% to 20% | [Whitespark 2026 Local Search Ranking Factors](https://whitespark.ca/local-search-ranking-factors/), [Advice Local summary](https://www.advicelocal.com/?p=20716), [Emulent summary](https://emulent.com/?p=20138) | M5 tracks the map pack on a grid, our profile against rivals' profiles, and review count and pace. M3 favours service pages for each town where we have real work |
| 5 | AI assistants name brands that others write about. Ahrefs found off-site brand mentions correlate with AI Overview visibility much more strongly than backlinks. Engines disagree with each other a lot | [Ahrefs, 75k brands](https://ahrefs.com/blog/llm-search), [SparkToro via GoGoChimp](https://www.gogochimp.com/blog/how-to-get-cited-chatgpt) | M6 samples each question several times on several engines and records **mentions** and **citations** separately. It also tracks which sites the engines cite, so outreach goes there |
| 6 | Google writes its result links as `google.com/goto` wrappers and slows down tools that follow them. Some automated results are "poisoned" with substitute listings | [DataForSEO goto fix](https://dataforseo.com/update/get-final-destination-urls-with-serp-api), [poisoned results](https://dataforseo.com/update/detect-and-resolve-poisoned-google-results-with-dataforseo-serp-api), [SEJ](https://www.searchenginejournal.com/google-goto-result-links-throttling/595959/) | M1 sends `resolve_goto_urls` and `resolve_poisoned_results`, uses the standard queue, and cross-checks positions against Search Console |
| 7 | Search Console added a Generative AI report on 3 June 2026 (impressions by page, country, device and date; no queries or clicks). Bing added an AI Performance report with grounding queries in February 2026 | [SEJ](https://searchenginejournal.com/google-reports-ai-search-impressions-how-to-read-them/582824), [Search Influence](https://www.searchinfluence.com/blog/bing-ai-performance-report-copilot-citations/) | M6 shows both. Until either has an API, admins upload the CSV export (§4) |
| 8 | FAQ rich results stopped showing in Google on 7 May 2026. FAQPage stays valid markup, but it no longer adds a rich result | [SEJ](https://www.searchenginejournal.com/google-drops-faq-rich-results/574429/), [PPC Land](https://ppc.land/google-kills-faq-rich-results-what-seos-saw-coming-since-2019/) | M7 checks schema for accuracy (LocalBusiness, Organization, Service, BreadcrumbList, Article). It does not score pages for FAQ markup |
| 9 | llms.txt does little: Ahrefs found 97% of files got no requests in May 2026, and Google says Search ignores it | [SEJ on Ahrefs](https://www.searchenginejournal.com/97-of-llms-txt-files-got-no-requests-ahrefs-data-shows/), [Optimizely](https://www.optimizely.com/field-notes/articles/does-llms-txt-work/) | It stays a low-priority item on the health checklist and is not a feature |
| 10 | Google rewards a "unique point of view" and facts that are not commodity summaries | Google guide (row 1) | M4 will not draft a page until it has Heliaxis-only facts: real installs, survey findings, the local DNO, photos with permission |

**What this means in practice.** Clicks from informational searches will keep falling. The searches that bring in installs ("solar panels Cardiff", "battery installer near me") still lead to a map pack and a short list of installers. So the tool puts effort in this order: local commercial searches and the map pack first, then pages that win those searches, then AI-answer visibility, then informational content that supports all three.

## 4. Data sources

**DataForSEO covers what Google won't tell us about competitors. Search Console covers the truth about our own site. Business Profile, Umami and the CRM tie it to enquiries.** Build a thin, typed client `src/lib/dataforseo/client.ts` that every module uses. It handles auth (the existing `DATAFORSEO_LOGIN`/`PASSWORD`/`BASE64` env vars), task post and get, retries, and writes `cost` from every response to `seo_api_call`.

### 4.1 DataForSEO endpoint map

| Need | Endpoint | Mode and key settings | Price (Nov 2026) | Cadence |
| --- | --- | --- | --- | --- |
| Our position 1 to 100, top 10 snapshot, SERP features, AI Overview | `serp/google/organic/task_post` then `task_get/advanced` | Standard queue, `depth: 100`, `device: mobile` weekly and `desktop` monthly, `location_code` per town, `resolve_poisoned_results: true`, `load_async_ai_overview: true`. `resolve_goto_urls` is on by default in this mode, but set it anyway | $0.0006 per 10-result page; poisoned check adds one page; async Overview adds $0.0006 ([pricing](https://dataforseo.com/pricing/google-serp-pricing/google-organic-serp-api), [poisoned](https://dataforseo.com/update/detect-and-resolve-poisoned-google-results-with-dataforseo-serp-api), [task\_post docs](https://docs.dataforseo.com/v3/serp-google-type-task_post/)) | Weekly |
| "Check now" on one search | `serp/google/organic/live/advanced` | Live, with `resolve_goto_urls: true` (adds up to 40 s) | $0.002 per page | On demand |
| Every keyword we rank for, tracked or not | `dataforseo_labs/google/ranked_keywords/live` | Target `heliaxis.co.uk`, location United Kingdom (2826). Labs data is refreshed weekly but can lag weeks behind, so label it "estimate" | Per task plus per row ([Labs pricing](https://dataforseo.com/pricing/dataforseo-labs/dataforseo-google-api)) | Weekly |
| Who our real search competitors are | `dataforseo_labs/google/serp_competitors/live`, `competitors_domain/live` | Our tracked keyword set | Per task plus per row | Monthly |
| Keywords they have and we lack | `dataforseo_labs/google/domain_intersection/live`, `ranked_keywords` per rival | Top 8 rival domains | Per task plus per row | Monthly |
| New keyword ideas, volume, difficulty, intent | `dataforseo_labs/google/keyword_ideas`, `related_keywords`, `bulk_keyword_difficulty`, `search_intent`; `keywords_data/google_ads/search_volume` | UK, en | Per task plus per keyword | Monthly, and on demand in M3 |
| What the top-10 pages contain | `on_page/instant_pages` + `on_page/content_parsing/live` | One call per unique URL, cached 30 days | $0.00015 per page each ([On-Page pricing](https://dataforseo.com/pricing/on-page/onpage-api)) | When a URL enters a top 10 |
| Page speed of rivals and us | `on_page/lighthouse/live` | Mobile | $0.005 per page ([Lighthouse pricing](https://dataforseo.com/pricing/on-page/lighthouse-api)) | Monthly, top pages only |
| Our site crawl | `on_page/task_post` | Up to 500 pages, JS rendering on | $0.00015 per page plus options | Monthly (the weekly in-house crawl stays) |
| Map pack on a grid | `serp/google/maps/task_post` | `location_coordinate` per grid point ([grid guide](https://dataforseo.com/help-center/build-grid-rank-tracker-maps)) | Per SERP (confirm in the calculator) | Monthly, core searches only |
| Rival Business Profiles | `business_data/google/my_business_info/live` | By name and town, store `cid` and `place_id` | $0.0054 per profile live ([Business Data](https://dataforseo.com/google-business-profile-data-api)) | Weekly |
| Rival reviews and pace | `business_data/google/reviews/task_post` | Newest first, depth 50 | $0.00075 per 10 reviews ([pricing](https://dataforseo.com/pricing/business-data/google-reviews-api)) | Weekly |
| AI answers from several engines | `ai_optimization/llm_responses/*` (ChatGPT, Claude, Gemini, Perplexity) | Same prompts as M6, 3 runs each | Per request (confirm in the calculator) | Monthly |

**Do not buy at launch:** the LLM Mentions API. It costs $0.10 per request plus $0.001 per row, needs a $100 monthly top-up, and its ChatGPT data is US only ([DataForSEO](https://dataforseo.com/update/introducing-llm-mentions-api)). That is a poor fit for Welsh local searches. Look at it again when the business works nationally.

### 4.2 Other sources (free)

| Source | What it gives | How |
| --- | --- | --- |
| Google Search Console API | Our real clicks, impressions, CTR and average position by query, page, device and date. Up to 25,000 rows a request and 50,000 rows a day per search type, kept 16 months ([Google](https://developers.google.com/search/blog/2022/10/performance-data-deep-dive)). URL Inspection for index status | Service account added as a user on the property. Daily import into `gsc_daily`, so history outlives the 16 months |
| Search Console Generative AI report | Our impressions in AI Overviews and AI Mode, by page | No API confirmed. Admin uploads the CSV export monthly (M6) |
| Bing Webmaster Tools API and AI Performance | Bing clicks and Copilot citations with grounding queries | API for search data; CSV upload for AI Performance |
| Google Business Profile Performance API | Our calls, website clicks, direction requests, impressions, and monthly search keywords ([Google](https://developers.google.com/my-business/reference/performance/rpc)) | OAuth as the profile owner. Access must be requested first, because new projects start with a quota of 0 |
| Umami | Landing pages, referrers, events (quote click, form start, submit) | Existing `src/lib/umami.ts` |
| CRM | Enquiries, surveys, quotes, won jobs and value | Existing tables, joined in M8 |

## 5. Modules

**Eight modules form one loop: measure where we stand, see what the winners do, decide which page to build, write it, publish it, then check whether it brought enquiries.** Each module gets a tab under `/admin/search`. The landing screen is the Overview in §10.2.

```text
 ┌───────────────────────── next week's positions ─────────────────────────┐
 ▼                                                                          │
[M1 Rank tracker] → [M2 SERP teardown] → [M3 Planner] → [M4 Content studio] │
                                              ▲               │ publish     │
                          add to the queue    │               ▼             │
          [M5 Local]  [M6 AI visibility]  [M7 Tech health]  [M8 Attribution]┘
```

M1 to M4 run left to right each week. M5 to M7 add work to the planner's queue. M8 checks each published page against enquiries before the next week's positions come in.

### M1 Rank tracker: our position wherever it is

**Records our organic position from 1 to 100, our map-pack position and our AI Overview citation for every tracked search each week, plus every keyword Google already ranks us for.**

- **Keywords.** Move the 103 rows from `social_seo_keyword` into `seo_keyword`, adding `service`, `town`, `intent` (local commercial, commercial, informational), `priority` (1 to 3), `target_page` and `location_code`. Admins add searches in bulk or from M3 with one click. Add South West towns only once a page and real projects exist there (strategy §3).
- **Fix the parser** (`parseSerp`). Read the resolved `url` and `domain`. If a row still holds a `google.com/goto` link, fall back to `website_name` or the host in `breadcrumb`, and mark it `resolved_by: breadcrumb`. Never drop a row. Read `rank_group` as the organic position and keep `rank_absolute` too.
- **Per result, store:** our position and URL (or "not in top 100"), the top 10 (domain, URL, title), the SERP features present (`local_pack`, `ai_overview`, `people_also_ask`, video, images), our place in the map pack (by domain, or by business name "Heliaxis"), and whether the AI Overview cites a Heliaxis URL (its `references`).
- **Cannibalisation.** If two Heliaxis URLs both rank for one search, flag it and suggest which page should own it.
- **Everything we rank for.** A weekly `ranked_keywords` pull fills an "Untracked wins" list: keywords we already appear for, with a one-click Track button.
- **Cross-check against Search Console.** Show the Search Console average position beside the DataForSEO position. Flag the search when they differ by more than 10 places.
- **Screen.** A table with these columns: Search, Town, Position (mobile), Change this week, Ranking page, Map pack, AI Overview (shown or cited), Top rival, Monthly volume, Opportunity. Filter by service, town and intent. Each row opens a drawer with the full top 100 (our row highlighted), the features, and a 26-week sparkline. Above the table, a chart shows how many searches sit at 1–3, 4–10, 11–20, 21–50, 51–100 and not found, week by week. Add a visibility score that weights each position by click share and volume.

### M2 SERP teardown: what the top 10 do

**For each priority search, shows what the pages and businesses that beat us have in common, and exactly where we fall short.**

- **Page facts** for each top-10 URL (On-Page `instant_pages` plus `content_parsing`, cached 30 days, robots.txt respected): page type (service, town page, guide, directory, manufacturer, government), word count, H1 and H2s, questions answered, schema types, images and video, prices shown, reviews on the page, author and date, town mentions, links to other town pages, mobile Lighthouse score.
- **Business facts** for each map-pack business (`my_business_info` and reviews): primary and other categories, rating, review count, reviews in the last 90 days, photo count, and whether a website is linked.
- **"What it takes" card** for each search, computed from those facts rather than guessed. For example: median words 1,450 against our 941; 7 of 10 name MCS in a heading; 6 of 10 show prices; median map-pack reviews 84 against ours. These numbers are examples only; real ones come from the data.
- **AI write-up.** The model receives the facts (never raw HTML) and writes three things: what the winners share, our gaps, and a suggested outline. It follows the current `writeAnalysis` rules: facts only, British English, no invented figures.
- **Rival profiles.** One page per competitor domain: the towns and searches it wins, its best pages, its Business Profile, and its review pace. Fill the blank `website` and `google_place_id` fields in `social_competitor` from this data.

### M3 Opportunity planner: which pages to build

**Turns every keyword source into a short, scored queue of pages to create or improve. One page serves each group of related searches.**

- **Keyword pool:** tracked searches, Labs ranked keywords, rival gaps (`domain_intersection`), keyword ideas, and Search Console queries in "striking distance" (position 8 to 30 with real impressions).
- **Grouping by SERP overlap.** Two searches belong on one page if their top 10s share at least 4 URLs. This follows Google's warning against a page per variation, and it stops M4 writing duplicates.
- **Mapping.** Each group becomes Improve (an existing page targets it), Create (no page does), or Hold. Hold means the group needs proof we don't have, such as a town page for a town with no installs. Check proof against CRM projects by postcode area.
- **Page types:** service pillar, service in a town, case study, cost guide, comparison, commercial sector page, and supporting article. The linking rules come from strategy §4.
- **Score** = volume × position gain available × intent weight (local commercial 3, commercial 2, informational 1) × proof (1 with proof, 0.3 without) ÷ difficulty band. Show the formula on screen. The owner can tune the weights in settings.
- **Queue.** A table with these columns: Page, Type, Searches covered, Volume, Current best position, Score, Owner, Status, Due date. Status is one of Idea, Briefed, Drafting, In review, Published, Measuring. Optionally, an impact-against-effort 2x2 view.

### M4 Content studio: write pages that can rank

**Writes a brief from the teardown, collects Heliaxis-only proof, drafts in the CMS block format, checks the draft, and publishes only after a person approves it.**

1. **Brief** (generated): the target group and its intent, an H2 outline covering the subtopics the top 10 share plus People Also Ask questions, a word range from the top-10 median, schema to use, internal links in and out, and the call to action.
2. **Proof pack** (filled in by people; drafting is locked until the required items are in): real projects and photos with permission, system sizes, the local network operator and council, prices from `pv_packages`, real reviews, and Cal as the named author on every page, with a short real bio and photo.
3. **Draft.** Use the existing CMS block contract (`src/lib/cms/ai-page.ts`) for pages and `src/lib/blog/*` for articles. Never fork them. Answer the question in the first two sentences. Include a worked example with its assumptions, a comparison table where it helps, and a "last checked" date on any figure. Use the strongest model available (`claude-sonnet-5-5`, already used by the GEO sampler) and log the cost to `ai_usage`.
4. **Checks** that block publishing: a claims check (credentials must be MCS, RECC or NAPIT only; every price, saving and number must come from the proof pack or packages); an originality check against our own pages (over 30% shingle overlap blocks it) and against the teardown text (no copying rivals); title 50–60 and description 120–158 characters; valid schema; at least 3 internal links.
5. **Approve and publish.** Editors draft and admins approve. On publish: add the page to the sitemap, ping IndexNow for Bing, and record a baseline.
6. **Measure.** Positions, impressions, clicks and enquiries at 14, 28, 56 and 90 days. A page that hasn't moved by day 90 goes back to the queue as Improve.

**Refresh mode** for existing pages: compare the page against the latest teardown and suggest section edits, not a full rewrite. **Rate limit:** at most 3 new pages a week by default. Only the owner can raise it.

### M5 Local: map pack and Business Profile

**Shows where we appear in the map pack across our area, and how our Business Profile compares with the profiles that beat us.**

- **Grid.** A 5×5 grid, 10 km across, centred on each Tier 1 area in §9, for the 10 most important searches, run monthly. Report average rank and the share of grid points where we are in the top 3. Draw it as a heat map with `maplibre-gl` (already a dependency).
- **Profile against rivals:** categories, rating, review count and 90-day pace, photos, and response rate.
- **Our profile performance** from the Business Profile API: calls, website clicks, direction requests and search keywords, month on month.
- **Reviews.** Show a review-pace target and link it to the review-request flow in strategy §6 (Ask A). Never offer an incentive for a Google review.
- **Citations checklist.** One table of directories (MCS, RECC, NAPIT, Bing Places, Apple Business Connect, Yell, Facebook, Trustpilot), with status and the name, address and phone shown on each, flagged when they don't match the profile.

### M6 AI visibility

**Measures how often AI assistants name and cite Heliaxis for local questions, and which sources they rely on.**

- **Merge** `social_geo_*` and `geo_*` into one set of tables (§6). Keep the existing Claude web-search sampler and its monthly spend cap.
- **Engines:** Claude (existing), and ChatGPT, Gemini and Perplexity through DataForSEO LLM Responses. The Google AI Overview comes from M1 SERPs. Add AI Mode only if the account has a DataForSEO endpoint for it.
- **Prompts:** town × service ("who installs home batteries in Swansea?") and consideration questions ("is solar worth it in Wales?"). Run each 3 times per engine, monthly.
- **Per answer, record:** whether Heliaxis is mentioned, whether a Heliaxis URL is cited, our place in any list, the rivals named, the domains cited, and accuracy problems (for example an answer that says we are NICEIC).
- **Reports:** mention share and citation share by engine and month; the third-party domains cited most often, which become outreach and directory targets; and any accuracy problems. Label all results "API sample".
- **Uploads:** the Search Console Generative AI CSV and the Bing AI Performance CSV, shown as monthly trends.
- **Crawler access:** check that robots.txt (today it allows every crawler) and the Vercel firewall (default rules, no custom config; the site has no Cloudflare) keep letting in Googlebot, Bingbot, OAI-SearchBot, ChatGPT-User, PerplexityBot and Claude-SearchBot (extend `AI_CRAWLERS` in `shared.ts`).

### M7 Technical health

**Keeps the weekly site audit and adds the checks that decide whether a page can rank at all.**

- Keep `runWeekly()` and the meta-tag proposals.
- Add an index check for the 50 most important URLs through the URL Inspection API (limit 2,000 a day).
- Add a sitemap check: is every published CMS page and blog post in `sitemap.ts`?
- Add orphan pages (no internal links in), canonical mistakes, schema validation, mobile Lighthouse for key pages, and AI crawler access.
- llms.txt stays a low-priority item on the checklist.

### M8 Lead attribution: prove search brings work

**Labels every enquiry with the channel it came from. Organic search, the Business Profile and AI assistants then show up in the sales report next to Meta.**

- **Capture** the referrer host and landing path on the first page view and send them with every form submission. Extend `Attribution` in `src/lib/attribution.ts` with `r` (referrer host) and `ch` (channel). Respect the cookie consent that exists today. Where consent is missing, send only the referrer at submit time, kept in session storage and not in a cookie. Have this checked against the privacy policy before launch.
- **Channel rules**, in order: `paid_meta` (fbclid), `paid_google` (gclid), `gbp` (UTM `utm_campaign=gbp` on the profile's website link), `ai_assistant` (referrer chatgpt.com, perplexity.ai, gemini.google.com, copilot.microsoft.com, claude.ai, or `utm_source=chatgpt.com`), `organic_google` (google.\* referrer), `organic_bing`, `referral`, `direct`.
- **Store** `channel`, `landing_path`, `referrer_host` and `first_seen_at` on `enquiries` and `crm_lead_origins`.
- **Funnel by page and by page group:** Umami sessions, then enquiries, surveys, quotes, and won jobs with their value. Show cost per enquiry for organic against Meta, using `src/lib/ad-spend.ts`.
- **Monthly Growth Report** (strategy §9): built automatically on the first Tuesday of the month and emailed to Cal.

## 6. Data model (Supabase)

**Move SEO data out of JSON blobs in `cms_kv` and into proper tables, so history can be queried, charted and joined to enquiries.** Write one migration per phase in `supabase/migrations/`. Every table has RLS on: staff with the right role can read, and only the service role (cron and server actions) can write. Keep raw DataForSEO responses in Supabase Storage (`seo-raw/{date}/{task_id}.json.gz`) for 90 days, so the parser can be fixed and re-run without paying again.

| Table | Key columns | Notes |
| --- | --- | --- |
| `seo_keyword` | id, phrase, service, town, intent, priority, location\_code, devices\[\], target\_page, cluster\_id, source, active | Seeded from `social_seo_keyword` |
| `seo_serp_run` | id, kind (weekly, live), device, started\_at, finished\_at, status, tasks, cost\_usd, error | One row per run |
| `seo_serp_result` | keyword\_id, date, device, our\_pos (null if not in top 100), our\_url, our\_pack\_pos, aio\_present, aio\_cited, features\[\], poisoned\_restored, error | Primary key (keyword\_id, date, device) |
| `seo_serp_item` | keyword\_id, date, device, pos, rank\_absolute, type, domain, url, title, resolved\_by | The top 100 rows behind each result |
| `seo_ranked_keyword` | date, keyword, pos, url, volume, etv, serp\_features\[\] | From Labs `ranked_keywords` |
| `seo_page_facts` | url (key), fetched\_at, status, page\_type, words, h1, headings jsonb, questions jsonb, schema\[\], images, has\_video, prices\_shown, reviews\_on\_page, author, published\_at, modified\_at, town\_mentions, lighthouse\_perf, content\_hash | Cached 30 days |
| `seo_business` | id, cid, place\_id, name, domain, competitor\_id, primary\_category, categories\[\], website | Links to `social_competitor` |
| `seo_business_snapshot` | business\_id, date, rating, reviews, reviews\_90d, photos | Weekly |
| `seo_teardown` | keyword\_id, date, facts jsonb, summary jsonb, model, cost\_usd | M2 output |
| `seo_cluster` | id, name, primary\_keyword\_id, page\_type, action (improve, create, hold), target\_page, score, score\_inputs jsonb, status, owner, due | M3 queue |
| `seo_content` | id, cluster\_id, kind (cms\_page, blog), brief, proof, draft, checks (all jsonb), status, created\_by, approved\_by, approved\_at, published\_ref, published\_at | M4 |
| `seo_content_measure` | content\_id, day (0, 14, 28, 56, 90), best\_pos, impressions, clicks, enquiries | M4 measure |
| `seo_grid_scan`, `seo_grid_point` | scan: keyword\_id, centre, size, radius\_km, date, cost\_usd. Point: scan\_id, lat, lng, our\_rank, top3 jsonb | M5 |
| `gsc_daily` | date, query, page, device, country, clicks, impressions, ctr, position | Rename `social_search_console_daily` and add device and country |
| `gbp_daily`, `gbp_keyword_monthly` | date, metric, value / month, keyword, impressions | M5 |
| `ai_prompt`, `ai_run`, `ai_answer` | answer: prompt\_id, engine, model, run\_no, date, text, mentioned, cited, list\_pos, rivals\[\], cited\_domains\[\], accuracy\_flags jsonb, cost\_usd | Replaces `social_geo_*` and `geo_*` (copy the 10 prompts across) |
| `ai_upload` | source (gsc\_genai, bing\_ai), period, rows jsonb, uploaded\_by | CSV imports |
| `seo_api_call` | at, vendor, endpoint, module, cost\_usd, ok, ms | Every paid call (§7) |
| `enquiries` (alter) | + channel, landing\_path, referrer\_host, first\_seen\_at | M8; same columns on `crm_lead_origins` |

Drop `social_seo_rank` and `social_site_health` (both empty) once the migration is verified. Leave the old `cms_kv` snapshots in place, read-only, for one month.

## 7. Jobs, schedule and cost controls

**All paid work runs as small queued steps through one dispatcher, under a monthly cap. Running costs should stay around $15 to $25 a month at launch.** Vercel functions here stop at 5 minutes, and standard-queue SERPs take minutes to come back. So never wait inside a request.

**Pattern.** Add a `seo_job` table, modelled on `social_job`: kind, dedupe\_key, payload, status, attempts, run\_after, cost\_usd. One cron, `/api/cron/growth` every 10 minutes, claims due jobs and runs them. A weekly run posts its SERP tasks in batches of up to 100, each with a `pingback_url` to `/api/seo/dataforseo/pingback?token=…` (shared secret). As a fallback, it polls `serp/google/organic/tasks_ready`. Each result is fetched, saved raw to Storage, parsed and written. The run closes when every task is in or has failed twice. Replace the two existing Monday crons with jobs queued by the dispatcher.

| Job | When (UK time) | Module |
| --- | --- | --- |
| Weekly SERPs, mobile | Sun 23:00 post, results by Mon 06:00 | M1, M2, M5 |
| Monthly SERPs, desktop | 1st of month | M1 |
| Labs ranked keywords, ours | Mon 06:30 | M1 |
| Page facts for new top-10 URLs | After each SERP run | M2 |
| Teardown write-ups (priority 1 searches) | Mon 07:00 | M2 |
| Business profiles and reviews | Mon 07:30 | M2, M5 |
| Search Console import | Daily 05:00 (data lags 2–3 days, so re-pull the last 4 days) | M1, M3, M8 |
| Business Profile metrics | Daily 05:30 | M5 |
| Opportunity scoring | Mon 08:00 | M3 |
| Rival gaps, keyword ideas | 1st of month | M3 |
| Map grid | 2nd of month | M5 |
| AI-answer sampling | 3rd of month | M6 |
| Site audit (existing) | Mon 05:00 | M7 |
| Content measures | Daily, for pages at day 14, 28, 56, 90 | M4 |
| Growth Report | First Tuesday of the month, 08:00 | M8 |

**Estimated monthly cost at launch (150 searches).** These are estimates to check against real `task.cost` values after the first month. The last real figure: the depth-20 live run of 103 searches cost $0.23 to $0.40.

| Item | Assumption | Estimate per month |
| --- | --- | --- |
| Weekly mobile SERPs | 150 × 4.3 runs, up to 10 pages each plus the poisoned check and async Overview, at most $0.0072 each | up to $4.70 |
| Monthly desktop SERPs | 150 × $0.0072 | up to $1.10 |
| Page facts and Lighthouse | 600 new URLs × $0.0003; 50 × $0.005 | about $0.45 |
| Business profiles and reviews | 30 businesses weekly | about $1.20 |
| Map grid | 4 centres × 25 points × 10 searches | about $0.60 to $2 |
| Labs (ranked keywords, gaps, ideas) | Per-task pricing | budget $5 |
| AI answers (LLM Responses) | 30 prompts × 3 runs × 3 engines | budget $10 |
| Writing (M4) | 12 pages a month on a strong model | logged in `ai_usage` under the existing AI cap |

**Controls.**

- **Monthly caps** per vendor, using the existing `social_vendor_spend.cap_pence`. Start at $40 for DataForSEO. That figure is a ceiling, not a forecast: expected spend is about $10 to $25 a month. Only the owner can change a cap.
- **Pre-flight estimate.** Every "Run now" button shows its estimated cost, worked out as tasks × unit price. It is disabled if the run would pass the cap, unless the owner overrides it.
- **Balance.** Show the DataForSEO balance (from `appendix/user_data`, as today) on the Overview, and alert below $10.
- **No double paying.** Page facts are cached 30 days. A live re-check of the same search is allowed once in 24 hours. Raw results are kept, so a parser fix can re-run them for free.
- **Alerts** through the existing `notify()`: a priority-1 search falls 5 or more places; we leave the map pack; a new rival enters a top 3; an AI answer gets a fact about us wrong; a run fails; the balance is low.

## 8. Build order, acceptance tests and open questions

**Ship in five phases. Each phase is usable on its own and must pass its tests before the next starts.** Phase 0 is a one-day fix, so Cal sees real positions this week.

1. **Phase 0: fix today's tracker.** In `serp.ts` add `resolve_goto_urls: true` and `resolve_poisoned_results: true`, raise `depth` to 100, and switch to mobile. In `parseSerp` add the `website_name`/`breadcrumb` fallback. Remove the "beyond 20 counts as nothing" cut-offs in `clickShare` and `parseSerp`, but keep the click-share weights.
   - Gate: a unit test built from the stored `seo-serp-sample-v1` fixture (all organic rows wrapped) returns real domains. On the next live run, at least 95% of organic rows have a domain other than google.com, and our position is recorded wherever it falls in 1 to 100.
2. **Phase 1: foundations and M1, plus M8 capture.** The DataForSEO client, `seo_api_call`, `seo_job` and the dispatcher, the §6 tables for M1, the keyword migration, the Search Console import, the rank tracker screen. From §10: the Search shell, the Overview, the weekly report, Needs you, and the Settings pages for the setup checklist, connections, business facts, author, target areas, keywords and budget. Referrer and channel capture goes live now, so lead data starts building up early.
   - Gate: a full weekly run finishes within the cap. The Search Console and DataForSEO positions agree within 10 places on most searches where both have data. A test form submission arriving from a google.co.uk referrer is stored as `organic_google`.
3. **Phase 2: M2 teardown and M5 local.** Page facts, business profiles, What-it-takes cards, rival pages, the grid heat map and the citations checklist.
   - Gate: every priority-1 search has a teardown built only from stored facts. The test: every number in the summary can be traced to a row.
4. **Phase 3: M3 planner and M4 content studio.** Grouping, scoring, the queue, briefs, proof packs, drafting into the CMS and blog, checks, approval, publishing and measurement.
   - Gate: the claims check blocks a draft that says "NICEIC" or gives a price not in `pv_packages`. The originality check blocks a town-swapped copy of an existing page. Nothing publishes without an admin's approval.
5. **Phase 4: M6, M7 and the Growth Report.** Merge the AI-answer tables, add the multi-engine sampler and CSV uploads, extend the health checks, and email the monthly report.
   - Gate: the report for the first month matches the CRM counts by channel exactly.

**Tests.** Use Vitest, as in the repo. Write unit tests for the parser (wrapped, poisoned, breadcrumb-only and empty fixtures), the channel classifier, grouping by overlap, the score, and the claims and originality checks. Tests never call paid APIs. For integration runs, use `sandbox.dataforseo.com`, which returns free dummy data.

**Open questions for Cal** (setup steps only Cal can do are marked \*):

- [ ] \*Verify `heliaxis.co.uk` in Search Console and Bing Webmaster Tools. This is now a task in HAP, due 21 November, with the steps written out. The domain's DNS is on Vercel and has no Google verification record yet.
- [ ] \*Give HAP owner access to the Google Business Profile, and request Business Profile API access.
- [ ] Confirm the target areas and where the installs are, in §9.
- [ ] Top up DataForSEO (the minimum top-up is $50, and the balance doesn't expire). Is a $40 monthly cap right?
- [ ] Sign off the referrer capture against the privacy policy before Phase 1 goes live.
- [ ] Who approves content alongside Cal as the team grows?

**Decided on 19 November:** Cal is the named author on every page. The site has no Cloudflare: it runs on Vercel's default firewall, and robots.txt allows every crawler.

## 9. Target areas (draft for Cal to confirm)

**This draft lists 26 areas in five regions. Ten are Tier 1 and get their own town page in the first wave.** Each area is ranked on three things: where Cal says we have installed, where HAP's enquiries come from, and how well-off the area is. Cal fills the last column. Heliaxis will install anywhere, so no area is cut from the list. Local proof is what decides whether an area gets a page: at least one real project, photo or review from that area. Without one, Google treats the page as a doorway page (strategy §3).

**How affluence is used.** Monmouthshire is the most expensive council area in Wales ([UK HPI, Aug 2026](https://www.gov.uk/government/statistics/uk-house-price-index-for-august-2026/uk-house-price-index-wales-august-2026)), followed by the Vale of Glamorgan and Cardiff ([Principality via Nation.Cymru](https://nation.cymru/feature/new-figures-show-the-latest-average-house-prices-across-wales/)). Better-off suburbs sit inside those places. They get no pages of their own, because a near-copy page per suburb is what Google treats as doorway spam. Instead they are:

1. named on the town page, with real projects there;
2. the centre points of the map grid in M5;
3. the areas targeted in Meta ads.

A suburb gets its own page only once it has several real installs.

**Two Newports.** Newport, Pembrokeshire and Newport, South Wales need separate names, slugs (`/solar-panels-newport-pembrokeshire`) and DataForSEO locations. The current tracker would map both to Newport, Gwent.

**Map pack reach.** Installing anywhere widens what organic pages and ads can win, but not the map pack. Distance from the searcher to the business address is one of the strongest map-pack factors, so the map pack will stay strongest around Newport whatever the pages say. Areas far from Newport (West Wales, Bristol, Wiltshire) are won through town pages, regional hub pages and reviews that name the town, not the map pack. M5 reports the map grid only for areas within reach and labels the rest "organic only".

| Area | Region | Enquiries in HAP (postcode districts) | Better-off pockets | Tier | Installs here? (Cal) |
| --- | --- | --- | --- | --- | --- |
| Newport | South East Wales | NP10, NP18, NP19, NP20 | Caerleon, Langstone, Rogerstone | 1 | Yes |
| Cardiff | South East Wales | CF5, CF11, CF14, CF15, CF23, CF24 | Lisvane, Cyncoed, Radyr, Penylan, Llandaff, Pentyrch ([PropertyData](https://propertydata.co.uk/cities/cardiff)) | 1 | Yes |
| Chepstow and Caldicot | Monmouthshire | NP16, NP26 (survey booked) | Whole area | 1 | Yes |
| Usk, Monmouth, Abergavenny | Monmouthshire | NP15 (4, one quote sent), NP7 | Usk, Raglan, Monmouth | 1 |  |
| Penarth and the Vale | Vale of Glamorgan | CF62, CF63, CF64 (3), CF71 | Penarth, Cowbridge, Dinas Powys | 1 |  |
| Bridgend and Porthcawl | Bridgend | CF32, CF35, CF36 | Porthcawl | 1 | Yes |
| Swansea, Mumbles and Gower | South West Wales | SA4, SA8 | Mumbles, Langland, Killay ([Swansea Bay News](https://swanseabaynews.com/?p=94529)) | 1 |  |
| Carmarthen and the Tywi valley | West Wales | SA31–SA33 (SA33: 4) | Llandeilo | 1 | Yes (West Wales) |
| Bristol north-west | South West England | BS8, BS13, BS14 | Westbury-on-Trym, Henleaze, Stoke Bishop, Sneyd Park; Clifton and Redland are mostly conservation areas ([Luxury Playbook](https://theluxuryplaybook.com/inside-bristols-property-market-in-2026/)) | 1 | Yes |
| Chippenham and Corsham | Wiltshire | SN14, SN15 | Corsham (SN13), the dearest Chippenham district ([Hutch](https://joinhutch.com/price-guide/chippenham-wiltshire)) | 1 | Yes |
| Cwmbran and Torfaen | South East Wales | NP44 (one job installing) |  | 2 |  |
| Caerphilly | South East Wales | CF83 |  | 2 |  |
| Pontypridd and Llantrisant | The Valleys | CF37, CF38, CF39, CF72 | Llantrisant, Pontyclun | 2 | Yes (Valleys) |
| Aberdare and Merthyr | The Valleys | CF44 (4), CF48 |  | 2 | Yes (Valleys) |
| Llandeilo, Ammanford, Llanelli | West Wales | SA19 (4), SA18 (3), SA14, SA15 | Llandeilo | 2 | Yes (West Wales) |
| Llandysul, Newcastle Emlyn, Cardigan | West Wales | SA38, SA39, SA44 (4) |  | 2 | Yes (West Wales) |
| Pembrokeshire, including Newport (Pembs) | West Wales | SA34, SA61, SA62, SA67 | Narberth, Newport (Pembs) | 2 | Yes (Newport, Pembs) |
| Brecon | Powys | LD3 (4), LD2 |  | 2 |  |
| Portishead and Clevedon | North Somerset | BS21 | Portishead | 2 |  |
| Thornbury | South Gloucestershire | BS35 | Thornbury | 2 |  |
| Weston-super-Mare, Cheddar, Chew Valley | North Somerset | BS22, BS24 (2), BS26 (2), BS40 | Chew Valley | 2 |  |
| Bath, Bradford-on-Avon, Trowbridge, Frome | Bath and Wiltshire | BA2, BA11, BA13, BA14 | Bath, Bradford-on-Avon | 2 |  |
| Blackwood, Tredegar, Ebbw Vale | The Valleys | NP12, NP13, NP22 |  | 3 |  |
| Neath Port Talbot | South West Wales | SA11, SA13 |  | 3 |  |
| Aberystwyth | Ceredigion | SY23 (2) |  | 3 |  |
| Gloucestershire and Somerset towns | South West England | GL2, GL6, GL15, GL18, GL53, BA4, BA16, TA5, TA24 | Cheltenham, Stroud | 3 |  |

**Tiers.**

- **Tier 1:** a town page in the first wave, the 8 core service searches tracked weekly, and a map grid.
- **Tier 2:** 4 core searches tracked, covered by a regional hub page ("Solar panels in the Valleys", "Solar panels in West Wales"), and a town page once photos and projects exist.
- **Tier 3:** mentioned on the hub page only, no tracking yet.

That comes to about 150 tracked searches, which matches the cost estimate in §7. Note that "Enquiries in HAP" means leads in the CRM, not completed installs. Most past installs predate the CRM.

## 10. The portal: Search, a product inside HAP

**Build the dashboard as its own product inside HAP, called Search, at `/admin/search`. It has its own shell, a reporting home with week-on-week numbers, a Needs you inbox, and a Settings area.** It looks and works like HAP's document writer (`src/app/admin/sales/documents/[id]/DocumentEditor.tsx`): a slim dark rail of icons, a light side panel for the open tab, and a page with a dark header and a gold rule. Add the portal key `search` to `src/lib/portals.ts`, guard every route with `requirePortal('search')`, and add a Search tile to the HAP hub (`HubView.tsx`).

### 10.1 The shell

- **Layout.** `src/app/admin/search/layout.tsx` wraps every screen in `AdminShell` (`active="search"`, `fluid`) and a new `SearchShell`. Reuse the document writer's `dw-rail` styles: 76 px wide, background #211f18, the open tab marked with a gold (#f8bc1e) bar on its left edge. Beside the rail sits the side panel (`dw-panel` styles) holding the open tab's filters and saved views. The page uses the `dw-pagehead` dark header, showing the screen title, the period, and a freshness stamp ("Search Console data to Sun 16 Nov").
- **Rail tabs, top to bottom:** Overview, Reports, Rankings, Competitors, Plan, Content, Local, AI answers, Site health, Leads.
- **Rail actions, at the bottom:** Needs you (with a count badge), Settings, and Run now (the gold button, which shows its cost before running).
- **Period bar** on every report screen: This week, Last week, Last 4 weeks, This month, Last month, Quarter, Custom. Compare with the previous period or the same period last year. A week runs Monday to Sunday, UK time.
- **Side-panel filters:** device, area tier, town, service and intent. They apply to every chart and table on the screen.
- **Phones.** The rail becomes a row along the top, as the document writer's does below 900 px.
- **House rules** from `AGENTS.md`: `crm-btn` buttons, `BrandIcon` icons, `WritingSpark` while the assistant writes, no emoji.

### 10.2 Overview: how we are doing this week

**Eight number tiles, each comparing this week with last week, followed by the charts and lists that explain the change.** Each tile shows the value, the change in absolute and percentage terms, an arrow coloured by whether the change is good (a lower position is better), and a 12-week sparkline. If last week's value is under 10, hide the percentage and show only the absolute change, labelled "small numbers".

| Tile | Measure | Source |
| --- | --- | --- |
| Organic enquiries | Enquiries with channel `organic_google`, `organic_bing`, `gbp` or `ai_assistant` | `enquiries` (M8) |
| Organic clicks | Google clicks to the site | `gsc_daily` |
| Impressions | Times we were shown on Google | `gsc_daily` |
| Average position | Average position across all searches, weighted by impressions | `gsc_daily` |
| In the top 3 / top 10 | Tracked searches where we are in the top 3, and in the top 10 | `seo_serp_result` |
| Visibility | Share of the clicks available across tracked searches, 0–100 | `seo_serp_result` × volume |
| Business Profile actions | Calls, website clicks and direction requests | `gbp_daily` |
| AI mention share | Share of sampled AI answers that name Heliaxis (monthly, so it shows the latest month) | `ai_answer` |

Under the tiles, in this order:

1. Clicks and impressions, a 26-week line chart.
2. Position bands (1–3, 4–10, 11–20, 21–50, 51–100, not found), stacked by week.
3. Winners and losers: the 5 biggest rises and 5 biggest falls, ranked by places moved × search volume.
4. Needs you: the top 5 open items.
5. Recent pages: each published page with its day-14 and day-28 change.
6. Leads by channel this week against last week.
7. Data health: when each feed last ran, this month's spend against the cap, and the DataForSEO balance.

```text
┌──────────┬───────────────┬────────────────────────────────────────────────────────┐
│ RAIL     │ SIDE PANEL    │ HEADER (dark, gold rule): Overview, this week           │
│ Overview*│ Filters       │ Freshness stamp: Search Console data to Sunday          │
│ Reports  │ Period        ├─────────────┬─────────────┬─────────────┬──────────────┤
│ Rankings │ vs last week  │Organic leads│ Clicks      │ Impressions │ Avg position │
│ Competit.│ Device        ├─────────────┼─────────────┼─────────────┼──────────────┤
│ Plan     │ Area tier     │Top 3/top 10 │ Visibility  │ GBP actions │ AI mentions  │
│ Content  │ Town          ├─────────────┴─────────────┼─────────────┴──────────────┤
│ Local    │ Service       │ Clicks and impressions    │ Position bands by week     │
│ AI       │ Intent        │ (26-week line)            │ (stacked bars)             │
│ Health   │               ├──────────────┬────────────┴───┬────────────────────────┤
│ Leads    │ Saved views   │ Winners and  │ Needs you,     │ Leads by channel       │
│ ──────── │ My weekly view│ losers       │ top 5          │ this week vs last      │
│ Needs you│ Tier 1 towns  ├──────────────┴────────────┬───┴────────────────────────┤
│ Settings │               │ Recent pages, day 14 & 28 │ Data health and spend      │
│ RUN NOW* │               │                           │                            │
└──────────┴───────────────┴───────────────────────────┴────────────────────────────┘
* gold highlight (dw-rail__tab.on / dw-rail__btn--solar)
```

The rail and side panel copy the document writer's layout. The Overview tab and the Run now button are highlighted here. In the build they are gold, as `dw-rail__tab.on` and `dw-rail__btn--solar` do there. The boxes show where things sit, not real figures.

### 10.3 Reports

**Every week the portal writes a report that is frozen once final, so last week's numbers never shift. Reports can also be built on demand for any period.**

- **Weekly report.** A provisional version is built Monday at 07:00. The final version follows Wednesday at 07:00, once Search Console has Sunday's data (it lags 2–3 days).
  - Contents: a three-sentence headline, and a table with this week, last week, the change and the 4-week average for every Overview measure.
  - Then: winners and losers, pages published and their movement, the map pack and Business Profile, leads by channel, and the next week's 3 actions, taken from the top of the M3 queue.
- **Monthly Growth Report** (strategy §9). The same layout, comparing month on month and, once a year of data exists, against the same month last year.
- **Custom report.** Pick the period, comparison, sections, area tier and service, then save it as a named view.
- **Outputs.**
  - On screen.
  - PDF through the document kit (`src/lib/documents/pdf-kit.ts`), with the Heliaxis header.
  - Email to the recipients set in Settings.
  - CSV of every table.
- **Archive:** every past report, newest first.
- **Number rules.** Every number shows its source and dates. The model writes only the words. A check rejects any report text containing a number that is not in the snapshot.

### 10.4 Needs you: things to respond to

**One inbox for everything that needs a person. Each item has an owner, a due date, a reason and a link to fix it, and it closes by itself when the cause clears.** Items can be marked Done, snoozed, or marked Not relevant with a reason.

| Item | Raised when | Due |
| --- | --- | --- |
| New Google review to answer | A new review appears on our profile | 2 working days |
| Wrong fact about us in an AI answer | M6 flags an accuracy problem | 5 days |
| Ranking drop | A priority-1 search falls 5 or more places, or we leave the map pack | 3 days |
| Index or sitemap problem | A key page is not indexed (URL Inspection API) or the sitemap has errors (Sitemaps API) | 3 days |
| Draft waiting for approval | An M4 page is in review | 2 days |
| Page needs a refresh | A page has not moved by day 90 | 14 days |
| Meta tag proposal | The weekly audit suggests a title or description fix | 7 days |
| Setup gap | An item on the Settings checklist is not done | Set per item |
| Budget or run problem | Spend is over 80% of the cap, the balance is under $10, or a run failed | 1 day |

Manual actions and security issues are not available in the Search Console API. So the checklist asks for a monthly manual look at those two reports.

### 10.5 Settings

**Every setting the system depends on lives here, with a live checklist showing what is done and what still needs doing.** Settings are stored in `seo_setting` (key, value jsonb, updated\_by, updated\_at), with a zod schema for each key. Changes to business facts, budget or access need the owner.

| Page | What it holds |
| --- | --- |
| Setup checklist | Live status, with how-to steps, for each of these: Search Console verified and HAP has access; sitemap submitted and read; Bing verified; Generative AI features enabled in Search Console; Business Profile connected and API approved; DataForSEO credentials and balance; Umami connected; robots.txt allows search and AI crawlers; every published page in the sitemap; Organization and LocalBusiness schema present and matching Business facts; IndexNow key installed; monthly manual check of manual actions and security. Each item reads Done, Needs action, or Can't check automatically. It links to the HAP task created on 19 November |
| Connections | Search Console (service account), Bing, Business Profile (OAuth), DataForSEO (a part-hidden login and the balance, never the secret), Umami. Shows the last sync and any error |
| Business facts | The one source for name, address, phone, area wording, credentials (MCS, RECC, NAPIT), services, hours and social profile links. Schema, the page writer, the claims check and the citations checker all read from here |
| Author | Cal's bio, photo, role and profile links, used on every page and in `Person` schema |
| Target areas | The §9 table, editable: tier, installs, photos available, grid centre, DataForSEO location (with the two Newports set apart) |
| Keywords | Tracked searches, bulk add, import from Untracked wins, priority, devices, target page |
| Competitors | Rival domains and Business Profile IDs, tracked or not, and the list of directory sites not counted as rivals |
| AI questions | Prompts, engines, and runs per prompt |
| Content rules | Weekly new-page limit (3), originality threshold, the proof items required, banned claims, approvers |
| Reports and alerts | Recipients, schedules, alert thresholds |
| Budget | Cap per vendor, this month's spend by module, DataForSEO balance and top-up link |
| Access | Who can view, draft, approve and spend: owner, admin, editor, viewer |
| Data | Raw-file retention, a reprocess button, and history exports |

### 10.6 Extra tables and maths

**Three more tables:**

- `seo_report`: kind, period\_start, period\_end, compare\_start, compare\_end, status (provisional or final), numbers jsonb, text jsonb, pdf\_path, sent\_at.
- `seo_action`: kind, ref, title, why, fix\_href, owner, due, status, snoozed\_until, closed\_reason, created\_at, closed\_at.
- `seo_setting`: as above.

**How the numbers are worked out:**

- Search Console measures are daily sums.
- Average position is weighted by impressions.
- Rank counts come from the week's single SERP run, compared with the previous run.
- Visibility = Σ(volume × click share at our position) ÷ Σ(volume × click share at position 1) × 100.
- Enquiries are counted by `created_at` within the week.

## Sources

Pages opened for this spec, all accessed 19 November 2026: [Google AI optimisation guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide) · [DataForSEO goto URL fix](https://dataforseo.com/update/get-final-destination-urls-with-serp-api) · [DataForSEO poisoned results](https://dataforseo.com/update/detect-and-resolve-poisoned-google-results-with-dataforseo-serp-api) · [DataForSEO LLM Mentions](https://dataforseo.com/update/introducing-llm-mentions-api) · [SEJ on goto throttling](https://www.searchenginejournal.com/google-goto-result-links-throttling/595959/) · [SEJ on the Search Console AI report](https://www.searchenginejournal.com/google-reports-ai-search-impressions-how-to-read-them/582824/). The other pages are linked in the tables above, and the HAP facts come from the repo and the Supabase project as they stood on 19 November 2026.
