# SEO and GEO strategy for Heliaxis

For Cal, and for any Claude session doing the work. Builds on what is already in the repo: `docs/social-monitoring/09-competitors-seo-geo.md` (the tracking design), `/admin/social/seo` (Search Console positions, local visibility, AI-answer sampling), `docs/WEBSITE-CONTENT-SPEC.md` (the landing page and content brief) and the 13 written blog drafts (Admin › Blog › "Load the written drafts").

**Facts this strategy rests on (confirmed by Cal, 16 November 2026):** Heliaxis is MCS-certified, a member of RECC and registered with NAPIT. It is **not** NICEIC. It covers **South Wales and the South West**. Its phone number is 01633 965205. It has project photos in the social tool. Reviews are wanted, with a £50 Amazon gift card offered (see section 6, which changes how that can be done).

SEO is search engine optimisation: being found on Google for what people search. GEO is generative engine optimisation: being named and cited when someone asks an AI assistant "who installs solar in Cardiff?". They share most of the work. The difference is that an AI answer is one paragraph, so being the clearest, most consistent and best-supported source matters more than being one of ten blue links.

## 1. What winning looks like

| Goal | Measure | First target (to be set from the baseline) |
|---|---|---|
| More quote requests from search | Enquiries with source "organic" or "google" per month (CRM lead sources) | A baseline in month 1, then growth each month |
| Be found locally | Google Business Profile views, calls, direction requests; local pack position for "{service} {town}" | Top three for the home towns |
| Be named by AI assistants | Share of monthly AI-answer samples that name Heliaxis (existing tool) | Rising month on month, from a baseline of the first run |
| Be trusted | Number and average of real reviews, on Google and on our own site | A steady flow, every completed job asked |
| Be cheap to run | Cost per enquiry by source (ad spend is already in the CRM) | Organic cost per enquiry well below paid |

Do not set numeric targets until the first month's baseline exists. A made-up target is worse than none.

## 2. Where we are weak today (from our own data and the earlier research)

These are in `09-competitors-seo-geo.md` as the seed priority actions. Status after this week's work:

- **Accreditation wording was wrong on the site** (NICEIC claimed). Fixed in code and in the published CMS on 16 November. This was the most important fix: a false credential damages trust and breaks advertising rules.
- **Few service pages.** The CMS had one solar page, an off-grid page, a care-home page and three blog posts. The brief pack (`PAGE_BRIEFS`) lists 20 pages to build.
- **No dedicated quote page that sells.** The landing-page spec is written.
- **Thin proof.** No reviews shown, no published prices, few project photos on the site. Packages and prices are now editable and the estimator uses them.
- **Location wording drifted** ("South Wales", "Wales and South West England"). Now fixed to **South Wales and the South West**.
- **Duplicate brand in the title** ("Home Page — Heliaxis | Heliaxis") and missing structured data: tracked by the monthly on-site health check.

## 3. Geography: South Wales and the South West

Search is local. "Solar panels Cardiff" is a different search from "solar panels Newport", and an AI assistant asked about Bristol will look for a Bristol installer.

**Principle: a location page must earn its place.** Google treats near-identical pages with the town name swapped as spam ("doorway pages"), and AI assistants ignore them. A location page is worth publishing only if it has facts that are true for that place and not for the next one.

For each priority town, a page needs at least:

- a short, specific opening (what we install there and how people reach us),
- the **local network operator** (National Grid Electricity Distribution across most of the region: confirm town by town) and the local council that handles planning and building control,
- the **local housing and roofs** we actually see (terraces, slate, estates, farms), from real surveys,
- **real projects done in that area** with photos and a short story, only with the customer's permission,
- **real reviews from that area** (section 6),
- local FAQs (planning for conservation areas, council schemes if any),
- a map or area description, the phone number and the main call to action.

**Order of work:** build towns where we have real projects first. Suggested first wave (confirm against where jobs have been done): Newport, Cardiff, Swansea, Bridgend, Barry/Vale of Glamorgan, Cwmbran/Torfaen, Caerphilly, Pontypridd/Rhondda Cynon Taf. Second wave: the South West, led by **Bristol**, then **Bath, Gloucester, Somerset and Devon towns**, only where we can serve and show proof. Do not publish a town page for somewhere we do not install.

The seed keyword list in the tracker covers Cardiff, Swansea, Newport and Bridgend. Add Bristol and the South West towns once pages exist.

## 4. Content architecture

Pillars (a main page per topic) with supporting articles (clusters) that answer one question each and link up to the pillar and across to related articles.

| Pillar page | Cluster articles (written now = W, to write = next) |
|---|---|
| `/solar-panels` (exists) | W: what happens at a survey; planning permission; shaded and north-facing roofs; how long installation takes; what decides the cost; South Wales and South West guide. Next: solar panel maintenance and cleaning; solar panels and roof types (slate, tile); do panels work in winter; solar panel degradation and warranties; solar and your mortgage or house sale |
| `/solar-and-battery` (to build) | W: is a battery worth it; solar only or solar and battery; adding a battery to existing solar. Next: battery size explained; DC or AC coupled; battery in a power cut; time-of-use tariffs with a battery |
| `/battery-storage`, `/battery-backup` (to build) | Next: how a home battery is wired; batteries and fire safety; battery warranties |
| `/ev-chargers` (to build) | W: solar and an EV charger. Next: choosing a home charger; EV tariffs; workplace charging |
| `/air-source-heat-pumps` (to build) | Next: how a heat pump works; heat pump running costs; heat pump and solar; is my house suitable |
| Commercial pages (to build) | W: solar for small business. Next: commercial solar and tax; PPA explained; solar for farms; solar for care homes; battery for business; ESG reporting with solar |
| Trust and process | W: what is MCS. Next: what is RECC; what is NAPIT and a competent person scheme; how to check an installer; our guarantees |

**Linking rules:** every article links to its pillar, to two related articles and to the quote page; every pillar links to all its articles; location pages link to the relevant service pillars and to nearby towns. Use descriptive link text, not "click here".

**Formats that rank and get cited:** a direct answer in the first two sentences; a worked example with its assumptions stated; a comparison table; a short FAQ with standalone answers; a clear date and "last checked" line on anything with numbers. The written drafts follow this.

**Quality guard:** do not publish an article with unresolved editor notes. Every figure that can change (rates, VAT, schemes, rules) is either checked and dated, or left out. Do not mass-produce pages. Fewer, better, checked pages beat many thin ones, and Google says helpful, accurate content is what it wants whoever writes it.

## 5. Local SEO: Google Business Profile and citations

1. **Google Business Profile (GBP).** Claim and verify it. Primary category "Solar energy installer"; secondary "Electrician" only if accurate, "Renewable energy company". Service areas: list the towns and counties, not a radius. Add services (solar panels, battery storage, heat pumps, EV chargers) each with a short description. Upload real photos weekly: installs, teams, finished roofs. Post an update when a job is finished (with permission). Answer the questions section. Use the **same name, address and phone** as everywhere (name: Heliaxis Limited; 01633 965205).
2. **Reviews on GBP** (section 6).
3. **Citations and directories** (the quarterly checklist in `09`): Bing Places, Apple Business Connect, Yell, Facebook, the **MCS** installer directory, **RECC** member directory, **NAPIT** find-a-contractor, Trustpilot, and any trade directory we really belong to. Only list where we are genuinely a member. Keep name, address, phone, hours and website identical.
4. **Manufacturer installer finders** (for example GoodWe, the Congress Theatre project is a GoodWe case study): ask for a listing if we are on their approved list. Only where true.

## 6. Reviews and reputation (read before sending anything)

Cal wants reviews and plans to offer a £50 Amazon gift card. **That can be done, but not in the simple form of "post a Google review and get £50".** The rules:

- **Google's policy** prohibits offering or accepting incentives for reviews on Google. **Trustpilot** also prohibits incentivising reviews. Offering a gift card for a review on either risks having reviews removed and the profile penalised.
- **UK law** (the Digital Markets, Competition and Consumers Act 2024, enforced by the CMA from April 2025) bans fake and misleading reviews, and the **ASA/CAP Code** and CMA guidance say an incentivised review is not independent and must be clearly disclosed. Paying only for positive reviews, or hiding the incentive, is unlawful.

**A compliant programme that gets the content:**

1. **Two separate asks, never linked.**
   - **Ask A (no reward):** a neutral invitation for every customer, a few days after handover, to leave a review on Google and, if wanted, Trustpilot. No gift card, no mention of one, no pressure on the rating. Send it to everyone, not only happy customers.
   - **Ask B (a thank-you for their time):** invite customers to give a **testimonial and project story for the Heliaxis website** on our own form (a rating, a few sentences, optional photo or short video, and a permission to publish their first name, town and photos). In return they receive a £50 Amazon gift card **for completing the form**, whatever they say and whatever rating they give. Do not require positivity, do not edit their words except for typos, and do not tie the reward to a public platform.
2. **Disclose it on the page.** Wherever an Ask B testimonial appears, show "Customer given a £50 gift card for their time". Keep these on our own pages, labelled "Customer stories", separate from independent review platforms and never used to compute a star rating shown as independent.
3. **Do not put review star markup on our own pages** for testimonials we collected ourselves. Google does not show stars for self-served reviews, and it risks a manual action.
4. **Consent.** Get explicit permission to publish their name, town, photos or video, and say how to withdraw it. Record it against the job.
5. **Keep records:** who was asked, who responded, what was paid, to show regulators or a platform if ever asked.
6. **Respond to every review**, good or bad, politely and specifically, within two working days. Never argue.

If Cal wants a single rule: pay people for their time to tell us their story on our own site, and separately ask for independent reviews with no reward.

**What to build in HAP (offered, not built):** a "Customer stories" step in the job flow. When a job reaches Handed over, HAP sends Ask A and Ask B by email and WhatsApp (respecting consent), opens a review form at a personal link, records the consent, flags the entry in the CRM and creates a task to send the gift card. Entries appear in the website's Customer stories section after a person approves them.

## 7. GEO: being named by AI assistants

How assistants pick businesses: they draw on search results and trusted pages, prefer sources that state facts plainly and consistently, and repeat what several sources agree on. We cannot buy a place in an answer, but we can make ourselves the easiest to quote.

**Do:**

- **Answer first.** Every page and article opens with a direct two or three sentence answer. This is also what Google shows in snippets.
- **Be consistent.** The same company name, address, phone, credentials (MCS, RECC, NAPIT) and area (South Wales and the South West) everywhere: site, GBP, directories, social, emails, PDFs.
- **Name the entities.** Say "Heliaxis, an MCS-certified installer in Newport covering South Wales and the South West" in the text, not just in a logo. Say what MCS, RECC and NAPIT are.
- **Structured data.** `Organization`/`LocalBusiness` with name, address, phone, area served and sameAs links; `FAQPage` on pages with real FAQs; `Service` for each service; breadcrumbs. No fake `AggregateRating`.
- **Original, checkable facts.** Local worked examples, what a survey found, install times we actually achieve, our own estimator's yield by area (only once validated). Facts others do not have are what gets cited.
- **Case studies with real detail** (what was installed, where, the system size, the result, with permission). The Congress Theatre page is the model.
- **Make it crawlable.** Text in the page, not in images or scripts; fast; sitemap complete; `robots.txt` allowing the main AI crawlers (decide deliberately: GPTBot, ClaudeBot, PerplexityBot, Google-Extended). Add an `llms.txt` summarising the business and key pages (low cost, unproven benefit, harmless).
- **Earn mentions elsewhere.** Local press, council and community energy pages, trade bodies, supplier case studies, local business directories. Assistants trust what other sites say about us.

**Measure it:** the existing monthly AI-answer sample (10 local questions, 3 runs each) in `/admin/social/seo`. Treat results as shares over repeated samples, never a single answer, and label them "API sample" because consumer apps can differ. Add the South West questions ("best solar installer in Bristol") when those pages exist.

**Be realistic:** GEO has no guarantee and little published evidence. The work that helps (clear, accurate, consistent, well-supported pages) also helps ordinary SEO, which is why it is the same plan.

## 8. Technical foundations

- Set up **Google Search Console** and **Bing Webmaster Tools**; submit `sitemap.xml`. The tracker already reads Search Console.
- **Sitemap:** add every new public page to `src/app/sitemap.ts` (it only lists a handful of routes today; CMS pages come from the CMS: confirm they are included).
- **Titles and descriptions:** unique, 50 to 60 and 120 to 158 characters, main phrase first, brand last once. Fix the duplicated brand.
- **Performance:** mobile Core Web Vitals; compress images; lazy-load below the fold.
- **Canonicals:** `/free-solar-quote` is the quote landing page; `/get-a-quote` stays but links to it.
- **Tracking:** UTM parameters on every ad and email link; Umami events for quote-button clicks, form starts and submissions (names agreed in the content spec); the CRM already stores source and campaign per lead.
- **Call tracking:** a tracked number on the landing page is optional; if used, keep 01633 965205 as the main listed number in citations.
- **Welsh language:** consider Welsh versions of the quote page and key pages later. It can help in Wales, but only if done properly by a Welsh speaker.

## 9. Reporting

**Monthly Growth Report** (first week of each month; HAP can assemble most of it today):

1. **Leads:** enquiries by source and campaign, cost per enquiry, enquiry to survey to quote to won conversion (CRM and `salesReport`). Which pages and articles led to enquiries.
2. **Search:** clicks, impressions and average position, top queries and pages, pages gaining and losing (Search Console).
3. **Local:** GBP views, calls, direction requests, review count and rating; local pack position for the ten key searches (manual check).
4. **AI answers:** share of samples naming Heliaxis, by question; who else is named; sources cited.
5. **Content shipped:** pages and articles published, and what is waiting for review.
6. **Reputation:** new reviews, ratings, response times; customer stories collected.
7. **Site health:** titles, schema, speed, broken links (the monthly crawl).
8. **Three actions for next month,** each with an owner and a reason.

Weekly: a five-minute look at new enquiries by source and any ranking or review alerts. Quarterly: the citations checklist, a competitor refresh and a review of the keyword list.

**Build next (offered):** a "Growth report" page in HAP that gathers items 1 to 6 into one screen with month-on-month changes, and emails it to Cal on the first Tuesday after the AI-answer run. It would reuse the lead-source report, the SEO tracker and the AI-cost log.

## 10. A 90-day plan

| Weeks | Do |
|---|---|
| 1 to 2 | Credentials fixed (done). Confirm GBP, Search Console and Bing. Cal answers the open questions below. Load and review the 13 drafts; schedule the first four. Opus builds `/free-solar-quote` and the packages band. |
| 3 to 4 | Publish the landing page and point every quote button at it. Set packages and prices in the admin. Start Ask A (neutral review invitations) for recent customers. Collect project photos and permissions from the social tool. |
| 5 to 6 | Build the first wave of town pages with real local proof, and the solar-and-battery and battery pages. Schedule one article a week. |
| 7 to 8 | Case studies from real projects (3 to 5). Start Ask B (customer stories). Build the commercial pages. |
| 9 to 10 | Heat pump and EV pages. South West town pages where proof exists. Directory and citation clean-up. |
| 11 to 12 | First full Growth Report. Review what is working, double down on it, retire what is not. Decide on Welsh pages and on the HAP "Customer stories" and "Growth report" builds. |

## 11. Risks and rules

- **Never overclaim.** Credentials are MCS, RECC and NAPIT only. No NICEIC, no TrustMark, no awards, no review score, no customer counts, no years in business unless Cal supplies them and they are true.
- **Prices and savings** come from the packages and the estimator, with assumptions beside them.
- **Reviews** follow section 6.
- **AI-written content** is a draft until a person has read it, checked the editor notes and approved it. Do not publish unreviewed drafts.
- **Photos:** only with permission; strip location data where it identifies a customer's address; do not show house numbers or number plates.
- **Do not copy competitors.** Learn from what they cover, write our own.

## 12. What we need from Cal

1. Access to the **project photos** in the social tool (an export of the best 50 to 100, by job and date, with notes on which customers have agreed to their use), or a way for HAP to read them.
2. The **towns and counties** actually served in South Wales and the South West, and where real projects have been done.
3. Whether to proceed with the **Customer stories** build and the **Growth report** build.
4. **GBP**: who owns the profile, and the current review count and rating.
5. Confirmation of the **RECC and NAPIT** membership wording we may use, and whether **TrustMark and SSIP** (their logos appear in the brand kit) are held. Until confirmed, neither is claimed.
6. Confirmation that the **£50 gift card** is for the customer story form (section 6) and not for a Google or Trustpilot review.
