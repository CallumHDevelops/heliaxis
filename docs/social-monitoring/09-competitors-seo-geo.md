# 09 · Competitor portal, SEO and GEO tracking

**Public information only, gathered within each platform's terms. No scraping that breaks a platform's rules, no fake accounts, no logged-in collection, no private data.** Phase 4 cannot start until the legal check (§2) is signed off.

## 1. Rules (all views)

1. Every figure carries `source`, `method` (api | manual | crawl | vendor | model_summary) and `collected_at`, shown in a tooltip and in exports.
2. Anything that cannot be collected reliably shows as **"Unavailable"** with a reason, never as an estimate and never as zero.
3. Model output (themes, opportunity cards, research) must cite source URLs or review ids. Unsupported statements are dropped by code (each item needs ≥ 1 source that resolves to a stored record or a fetched URL).
4. AI-answer results are shares over repeated samples, never a single yes/no.
5. Seed figures from the 25 October 2026 baseline research are stored as `method = manual`, `source = "Baseline research 25 Oct 2026 (unverified)"`, and are flagged for re-collection.

## 2. Collection methods and legal position (to be confirmed by the Phase 4 legal check)

| Data | Method | Position (Opus assessment, **not legal advice**) | Default |
|---|---|---|---|
| Competitor Instagram followers, media count, recent media like/comment counts | Instagram Graph API **Business Discovery** | Official API designed for this purpose, so permitted | ✅ automated, daily |
| Competitor Facebook followers / posts | Requires Meta "Page Public Content Access" (app review) | Not permitted without approval | Manual monthly entry with screenshot. Apply for PPCA only if Cal wants it (T4.2) |
| Competitor Google rating and review count | Places API (New) Place Details `rating`, `userRatingCount`, about 20 lookups a month, well inside Google's free monthly allowance | Allowed to display; **long-term storage of Places content may breach the Maps Platform terms** (00 Q19) | Live display (cached ≤ 24 h). History: manual monthly entry with screenshot, until legal sign-off |
| Competitor review text themes (Google) | Places API returns at most 5 reviews; storing them has the same issue | Same | Themes generated on the fly from the 5 live reviews, with links; nothing stored except the generated summary text plus source URLs, refreshed monthly |
| Competitor Trustpilot rating/count/reply rate | Manual monthly spot check (brief: collecting rival data at scale may breach Trustpilot's terms) | Manual is fine | Manual monthly |
| Competitor websites (pricing, finance and product pages) | Polite crawler: identifies itself (`HeliaxisMonitor/1.0 (+https://heliaxis.co.uk/bot)`), obeys robots.txt, ≤ 1 request per 5 s per host, ≤ 20 pages per site, weekly | Generally lawful for public pages; store hashes + text diffs for internal use only | ✅ weekly |
| Search rankings | **Free only.** Heliaxis: Google Search Console (our real positions per search, free). Competitors and town-by-town positions: a manual check of 10 key searches once a month, recorded in the app (method `manual`). No paid rank-tracking service | Search Console is our own data; manual searches are fine | ✅ free |
| AI-answer presence | Claude with web search, on the existing Anthropic account (the only paid item; about £1–2 a month at this size). Other AI tools are checked by hand only if Cal wants | Within API terms; API answers differ from consumer apps, so label them "API sample" | ✅ monthly |
| Name/address/phone consistency | Manual quarterly checklist for key directories (Google, Bing Places, Apple Business Connect, Yell, Checkatrade, Trustpilot, Facebook, MCS directory, Renewable Energy Hub) | Manual | Quarterly task |
| Heliaxis's own data | Own APIs (Meta, GBP, Trustpilot, Search Console) | Our data | ✅ |

## 3. Competitor set

- Table `competitor` (02-schema). Seed (from the brief, `tracked = true`, `approved_by = cal`, `approved_at` = migration time): Green Energy Solar (Cardiff, St Mellons), SolarSense (Bristol), GetZero (Newport, Caerleon), InspireGreen (Cardiff), ICE Solar (Risca: **official website unconfirmed**), Silverstone Green Energy (Pembrokeshire).
- Seed as **suggestions** (need Cal's approval): The Solar House, Limitless Energy, JM Renewable Solutions, Celtic Green Energy, Cymru Solar, ECOnomy Energy Group, Glow Green, Sunsave, Urban Solar, Lectogic, Heatforce (Wales), Greenlands Heating, Wye Energy Group.
- **Local area** (setting, editable): default = postcode areas **CF, NP, SA** plus districts **LD3** (Brecon) and **NP22–NP23** (Tredegar), **and/or** a radius of **60 km** from the Heliaxis base postcode (setting, required). A competitor is "local" if its base or any listed service-area page falls in the area. National firms (Glow Green, Sunsave) are tracked with `scope = national_with_local_pages`.

### Baseline competitor research job (`competitors.research`, runs once at Phase 4 start, then quarterly)

1. Read Heliaxis's own profile: services and areas from settings plus a crawl of heliaxis.co.uk (home, service pages, location pages).
2. Candidate discovery: Places API Text Search for `{service} installer` × `{town}` (services: solar panels, battery storage, heat pump, EV charger; towns: Cardiff, Newport, Swansea, Bridgend, Barry, Cwmbran, Pontypridd, Caerphilly, Neath, Port Talbot, Llanelli, Merthyr Tydfil) plus Claude with web search ("Which companies install {service} in {town}?").
3. Deduplicate by website domain and name similarity.
4. Profile each candidate: website, base, service area pages, accreditations stated on their site, social links found on their site, rating/count (live display only).
5. Output to `competitor_suggestion` with evidence URLs. Cal approves or rejects in Competitors › Research. **Nothing is tracked until approved.**

## 4. Tracked per competitor (and Heliaxis)

| Metric | Method | Cadence |
|---|---|---|
| Instagram followers, growth, posting frequency, content mix, top posts by visible engagement | Business Discovery | daily |
| Facebook followers, posting frequency | manual (or PPCA) | monthly |
| Google rating, review count, review growth | live Places (inside Google's free monthly allowance) / manual history | monthly |
| Trustpilot rating, count, reply rate | manual | monthly |
| Review themes (praise/complaints) | Claude over the reviews we lawfully hold (Heliaxis: all; competitors: the live 5 Google reviews plus manually pasted Trustpilot excerpts) | monthly |
| Public offers and promotions | website watcher; Claude only looks at pages whose text actually changed | weekly crawl (free); Claude only on changes |
| Mentions of Heliaxis in competitor posts or reviews | text search over collected competitor IG captions and review text | on collection |
| Website changes (pricing, finance, product, location pages) | crawler diff | weekly |

## 5. Views

- **League table**: rows = Heliaxis (highlighted) and tracked competitors; columns = followers (IG, FB), 30-day growth, Google rating, Google reviews, Trustpilot rating, Trustpilot reviews, review reply rate, posts per week. Sortable. Each cell shows a value with its date, or "Unavailable".
- **Trends**: pick a metric and businesses; Heliaxis is drawn in the brand colour, others in neutral greys with hover highlight.
- **Share of voice**: three bases, chosen by a tab: (a) **Reviews**, the share of new reviews in the period (Google + Trustpilot, where known); (b) **Search**, the share of visibility from §6; (c) **Instagram engagement**, the share of total visible engagement on posts in the period. Each tab shows its definition and coverage ("based on 9 of 14 competitors with data").
- **Gap and opportunity cards**: monthly Claude job over the review themes, the website change log and the league table. Each card: `{title, insight, evidence: [source links], suggested_action, confidence}`. Example: "Customers of two rivals repeatedly mention slow installs (5 reviews ↗). Heliaxis could publish an install-time promise." Cards without evidence links are dropped.
- **Competitor alerts** (Medium; in-app only unless `competitor_alerts_push`): a new promotion detected; IG followers +5% in 7 days; Google rating change ≥ 0.2 or reviews +10 in a month; a new location page for a Heliaxis town.

## 6. SEO and GEO tracking

### Keywords (40, seed; editable by an admin)

Towns: Cardiff, Swansea, Newport, Bridgend (plus "Vale of Glamorgan" for 2 terms). Services × towns:

```
solar panel installers {town}        (4)
solar panels {town}                  (4)
battery storage {town}               (4)
home battery installer {town}        (4)
heat pump installer {town}           (4)
air source heat pump {town}          (4)
solar and battery {town}             (4)
EV charger installer {town}          (4)
MCS solar installer {town}           (4)
solar panel cost {town}              (2: Cardiff, Swansea)
solar panels Vale of Glamorgan       (1)
heat pump Vale of Glamorgan          (1)
```

- **Rank tracking (free):** Heliaxis's own positions, clicks and searches come daily from **Google Search Console** (free). For competitors, someone checks **10 key searches** (e.g. "solar panel installers Cardiff", "battery storage Swansea") once a month in a private browser window set to the town, and records the top results in a short form in the app (`social_seo_rank`, method `manual`). The keyword list holds all 40 searches, and Cal picks the 10 to check by hand. Paid rank tracking is not built. It can be added later behind the same table if Cal ever wants it.
- **Share of local search visibility**: calculated from the monthly manual checks, with the method shown in the UI.
- **Search Console** (Heliaxis only): daily clicks, impressions, CTR, position by query and page (Search Console API, free, 16-month retention: snapshot daily).
- **On-site health** (monthly crawl, Heliaxis + competitors, free): title tag text and length, duplicate brand in title (flags "Home Page — Heliaxis | Heliaxis"), meta description, H1, location pages present (per town), blog post count in the last 90 days, schema.org types present (LocalBusiness, Organization, Review/AggregateRating, FAQPage), `llms.txt` present, PageSpeed Insights API (free: mobile performance score, LCP, CLS, INP).
- **AI-answer share** (monthly, first Tuesday 04:00): **10 local questions** (seed list in `config/geo-prompts.json`, T4.9, e.g. "Who are the best solar panel installers in Cardiff?"), each asked **3 times** to Claude with web search on. Parse the answer for business names (matched against the competitor set and Heliaxis) and cited sites. Store `social_geo_sample`. Show share = mentions ÷ runs per business, with the question-level drill-down.
- **Spending limit:** £10 a month in total (00 Q27). The AI-answer job and Places lookups record their cost in `social_vendor_spend` and stop for the month if the limit is reached, notifying admins.

### Monthly SEO and AI-answer summary

First Tuesday of the month, 08:00 (after the AI-answer run): code computes the biggest movers (Search Console position changes ≥ 3, manual rank changes ≥ 3 positions, AI-answer share changes ≥ 10 points), new competitor pages (from the crawl diff) and site-health failures for Heliaxis; Claude writes `{headline, movers[], new_competitor_pages[], top_actions[3]}` with the same number-check rule as 08 §5. Seed priority actions to include whenever still open: fix the title tag; show the review count; publish prices or ranges; add LocalBusiness/AggregateRating schema; add `llms.txt`; align "South Wales" vs "Wales and South West England" wording.
