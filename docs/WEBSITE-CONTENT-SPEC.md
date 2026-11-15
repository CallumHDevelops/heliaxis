# Spec: website content, packages and a free-solar-quote landing page

For: Claude Opus (or any Claude Code session) working in this repo. Written for Cal at Heliaxis.
Read first: `AGENTS.md` (house rules), `docs/DOCUMENT-KIT.md` is not needed. Next.js here is not the version you know: read the relevant guide in `node_modules/next/dist/docs/` before changing routing, caching or rendering code.

## 1. The goal

Heliaxis (South Wales, MCS-certified solar, battery, heat pump and EV installer, homes and businesses) now gets real leads from the solar estimator. We want more of them, and for every "get a quote" button on the site to land somewhere that converts.

Deliver, in this order:

1. **A dedicated landing page for a free solar quote** (the page ads and buttons link to), showing the packages and their from-prices.
2. **A set of content pages** (solar, solar plus battery, battery, heat pumps, EV, commercial) written to the briefs already in the repo.
3. **Blog articles** that answer the questions people search before they ask for a quote.
4. **One consistent set of call-to-action links** across the whole site.

Everything goes live on heliaxis.co.uk. Quality over volume: one finished, checked page is worth more than five drafts.

## 2. What already exists (use it, do not rebuild it)

| Thing | Where | Notes |
|---|---|---|
| Quote form, one question at a time | `src/components/quote/StepQuoteForm.tsx` | Posts to `/api/quote`. Takes a `source` (how the lead is labelled in the CRM). |
| A quote page | `src/app/(site)/get-a-quote/page.tsx` | Simple: brand panel plus the form. Keep it; the new landing page is a richer, ad-ready page. |
| Solar estimator | `src/app/(site)/solar-estimator/` | Draws the roof, gives savings and a price. Its leads arrive with the figures attached. |
| Survey booking | `src/app/(site)/book-a-survey/`, `book-a-call/` | |
| CMS pages (block builder) | stored in `cms_kv` key `heliaxis-cms-v1`, drawn by `src/app/(site)/[...slug]/page.tsx` | Currently: `/` (home), `/solar-panels`, `/off-grid-solar-systems`, `/solar-panels-care-homes-south-wales`, `/residential-case-study`, `/case-studies/congress-theatre`, and four blog pages. |
| Top-20 page briefs | `src/lib/cms/page-briefs.ts` (`PAGE_BRIEFS`, `GLOBAL_RULES`) | Ready-to-run prompts: slug, keywords, audience, goal, CTA. Fed to the AI page generator (`src/lib/cms/ai-page.ts`) by the CMS "Bulk create pages" tool. |
| Blog generator and house rules | `src/lib/blog/prompt.ts`, `ai.ts`, `briefs.ts`; API `/api/blog/generate`, `/api/blog/create-page` | The house rules in `BLOG_SYSTEM` are the voice for everything you write. Read them in full. |
| CTA bands on CMS pages | `src/lib/cms-ctas.ts` | Adds a "survey" band and a "talk" band to published pages at render time. |
| Packages and prices (new) | `readEstimatorSettings().packages` in `src/lib/estimator/settings.ts`; edited by Cal at Sales › Solar estimator in the admin | `Package` = name, kind (`solar` or `solar_battery`), summary, includes (lines), battery kWh, `bands` (panels and installed price). See section 4. |
| Lead attribution | `src/lib/attribution.ts` (cookie plus UTM capture) | Leads are labelled by source and campaign automatically. Keep UTM parameters working on any new page. |
| Sitemap | `src/app/sitemap.ts` | Add every new public page. |
| Brand look | `src/app/(site)/site.css`, `home.css`, `pt-btn` buttons, `Eyebrow`, the document `brand-kit/` | Match the existing pages. Do not invent a new style. |

## 3. Rules (non-negotiable)

These come from `AGENTS.md`, `GLOBAL_RULES` and `BLOG_SYSTEM`. Where this spec and those disagree, those win.

- **Nothing is claimed that is not true and checkable.** No invented prices, savings, paybacks, grant values, tariffs, warranties, awards, review scores, customer numbers, years in business or testimonials. Heliaxis credentials may be named only as the briefs name them (MCS, RECC, NICEIC, TrustMark) and explained, not just listed. Prices on pages come from the packages in the backend, never typed into copy. If you need a fact you do not have, put it in a list at the end of your report titled "Needs Cal" and leave it out of the page.
- **Voice:** British English, plain, calm, expert, never pushy. Answer first, then the reasoning. No hype words ("revolutionary", "game-changer"), no rhetorical-question openers, no "in today's fast-paced world". Say when something is not a good fit.
- **Savings are estimates, not promises.** Show assumptions beside every number (usage, tariff, size). Use "typically", "depends on" and an honest range.
- **No emoji** anywhere in pages or emails. Icons only from the brand kit.
- **Buttons use the site's own button classes** (`pt-btn` and the existing patterns). Never an unstyled link-as-button.
- **Accessibility:** one `<h1>` per page, real headings in order, alt text on every image, 4.5:1 contrast, visible focus, the form usable by keyboard.
- **Speed:** no new heavy libraries. Images sized and lazy-loaded below the fold. The landing page should score well on mobile (most traffic is a phone).

## 4. Packages: what they are and how to show them

Cal now defines packages in the admin (Sales › Solar estimator › Packages and prices): "Solar only", "Solar and battery", and any others. Each has a price list by number of panels. The estimator already prices from them.

Build a small server component, `PackagesBand`, that:

- reads `readEstimatorSettings()` (server side, it is cached by the page; do not fetch it from the browser),
- shows each **active** package with its name, summary, includes list and a **from price** (the lowest band's price, formatted "From £x,xxx fitted"), and a typical size line only if it is derivable from the bands (for example "8 to 16 panels"),
- shows nothing about price for a package that has no bands, and the whole band is hidden if there are no active packages with prices (the page must still look right with no packages),
- ends each card with the main CTA (section 5) and a secondary link to the estimator,
- carries one honest line under the cards: "Prices are for a typical home and include fitting. Your survey sets the exact price."

Use it on the landing page, the solar pages and the solar-and-battery page. Do not copy prices into page text, blog posts or briefs: they change.

## 5. Calls to action: one set of links

| Intent | Label (exact) | Link |
|---|---|---|
| Main: ask for a quote | **Get my free solar quote** | `/free-solar-quote` |
| See numbers now | **Try the solar estimator** | `/solar-estimator` |
| Book the survey | **Book a free survey** | `/book-a-survey` |
| Talk to someone | **Talk to us** | `/book-a-call` |
| Phone | **01633 965205** | `tel:01633965205` |
| WhatsApp | **Message us on WhatsApp** | `https://wa.me/` plus `NEXT_PUBLIC_WHATSAPP_NUMBER` (digits only), with a short pre-filled message |

Rules:

- The main button on every page, banner and article is **Get my free solar quote** going to `/free-solar-quote`. On a battery or heat pump page the label may read "Get my free quote" with the same link and `?for=battery` (or `heatpump`, `ev`) so the form can start on the right product (see how `get-a-quote` reads `?for`).
- Keep UTM parameters intact when linking internally from ads; do not strip query strings.
- Update the places that currently send people elsewhere: the header (`src/components/site/Header.tsx`), `Hero.tsx`, `SiteFooter.tsx`, `EstimatorBand.tsx`, `MobileCta.tsx`, the estimator's result page, the CMS home page blocks, and `BLOG_SYSTEM` in `src/lib/blog/prompt.ts` (add `/free-solar-quote` to the list of pages an article may link to, and make it the default main button). `src/lib/cms-ctas.ts` adds bands to published pages: make its quote button point at the new page too.
- A page may have a quote form in the page only on the landing page. Everywhere else, the button goes to the landing page.

## 6. Deliverable 1: the landing page `/free-solar-quote`

A code page in `src/app/(site)/free-solar-quote/page.tsx`, in the style of `get-a-quote/page.tsx` (read it first). It is the page paid ads and every "free quote" button open, so it must work in about five seconds on a phone.

**Purpose:** get a visitor to start the quote form. One goal; no menus competing with it. Use a slim header (logo, phone number, WhatsApp) instead of the full mega menu, if the layout allows (check `src/app/(site)/layout.tsx` for how the header is chosen; do not break other pages).

**Structure, top to bottom:**

1. **Hero.** `<h1>` that says what they get: a free solar quote for a South Wales home. One supporting line (no obligation, a real survey, we call within one working day: these three are already true in the existing page). The quote form (`StepQuoteForm`, source `landing-free-solar-quote`) beside it on desktop and directly under it on a phone. A second, quiet button: "Not ready? Try the solar estimator".
2. **Why this quote is different.** Three points, all of which must be true and already stated elsewhere in the repo: a real survey of the roof, shading and electrics (not a guess); a fixed price in writing; no pushy sales. Add the MCS point only if you can explain what it means for the customer in one sentence (access to the Smart Export Guarantee and a recognised installation standard).
3. **Packages.** `PackagesBand` (section 4).
4. **How it works.** Four steps: quote request, we call within one working day, free survey, fixed written price and install. Plain, short.
5. **What affects the price.** Roof size and direction, shading, how much electricity you use, battery size, scaffold access. Link to the estimator and to the blog guide "What size solar system do I need".
6. **Questions.** Six to eight FAQs, each answered in two or three plain sentences (cost, payback, planning permission, how long the install takes, what a battery adds, what happens at the survey, grants and the Smart Export Guarantee, what happens if the roof is shaded). Mark them up with `FAQPage` JSON-LD.
7. **Final call to action.** The form again or a button that scrolls to it, plus phone and WhatsApp.
8. `SiteFooter`.

**Do not include** testimonials, review scores, "as seen on", installation counts or any figure you cannot source from the repo or from Cal.

**Tracking and CRM:** the form posts to `/api/quote`; the `source` and the UTM cookie decide how the lead is labelled in the CRM, so confirm a test submission appears under Enquiries with the right source. Fire no new third-party scripts. If the site already loads Meta or Umami, a quote submission should keep triggering whatever it triggers now (read `StepQuoteForm.tsx` and `src/lib/meta-capi.ts`; do not change what is sent without asking).

**SEO:** title (50 to 60 characters), description (120 to 158), canonical `/free-solar-quote`, indexable, `LocalBusiness` plus `FAQPage` JSON-LD, add to `sitemap.ts`. Keep `/get-a-quote` working and have it link to the landing page.

**Acceptance for this page:** passes `npx tsc --noEmit`, `npx eslint` on your files, `npx vitest run`; looks right at 390 px and 1440 px wide (take screenshots with Playwright and look at them); a test submission creates an enquiry; Lighthouse mobile performance and accessibility both 90 or more; no layout shift when the packages load; the page still looks right with no active packages.

## 7. Deliverable 2: content pages

Use `PAGE_BRIEFS`. Order of work (skip any slug that already exists in the CMS):

1. `/solar-and-battery`, `/battery-storage`, `/add-battery-to-existing-solar`, `/battery-backup`
2. `/residential`, `/whole-home-energy`
3. `/air-source-heat-pumps`, `/ev-chargers`
4. `/commercial-solar`, `/commercial`, `/commercial-battery-storage`, `/commercial-ev-charging`, `/solar-operation-maintenance`, `/solar-ppa`
5. The sector pages (`/manufacturing`, `/agriculture`, `/care-homes`) last.

`/solar-panels`, `/commercial-funding`, `/warehousing` already exist: review them against section 3 and section 5 and fix the calls to action and any claim you cannot support, rather than rewriting.

For each new page: use the brief's prompt, keywords, audience and CTA, but set the main CTA to section 5's. Add `PackagesBand` to the residential solar and battery pages by embedding the CMS block your generator supports for custom content, or, if the block system cannot take a server component, build these few pages as code pages in `src/app/(site)/` that reuse the same components (the landing page is the model). Say which route you took and why.

**How CMS pages get published (read this carefully):** a CMS page is stored as blocks in `cms_kv`, but the published HTML is rendered in the **browser** by the CMS engine (`src/app/admin/cms-engine.ts`, then `POST /api/cms/publish` with the rendered result). A command-line session cannot render them. So:

- Prefer code pages for anything you are building by hand (they deploy on `git push origin site/estimator-v2:main`).
- For pages made through the CMS generator, drive the real admin with a browser (Playwright) signed in as Cal, or prepare everything (the exact brief text per page) and ask Cal to run **CMS › Bulk create pages** and press **Publish**. Do not write to `cms_kv` directly: you would publish unrendered pages.
- After publishing, open each live URL, check it renders, the buttons go to the right place, and note the result in your report.

## 8. Deliverable 3: blog articles

Use the blog generator and house rules (`BLOG_SYSTEM`). It creates server-side articles through `/api/blog/generate` and `/api/blog/create-page` (admin session required) or through **CMS › Blog** in the admin. Each article: answer first, a worked example with every assumption stated, a "How Heliaxis approaches this" section, five to seven FAQs, button rows as `BLOG_SYSTEM` describes, and any figure you are not certain of listed in `editorNotes` for a person to check. Do not publish an article that has unresolved `editorNotes`: leave it as a draft and list it for Cal.

Suggested first twelve (search phrase, then slug). Check none duplicates an existing article first (`/blog/what-size-solar-system-do-i-need`, `/blog/home-battery-storage-south-wales` and `/blog/renewable-energy-solutions-south-wales` exist):

1. How much do solar panels cost in the UK? `how-much-do-solar-panels-cost-uk`
2. Is a solar battery worth it? `is-a-solar-battery-worth-it`
3. Solar panels and the Smart Export Guarantee `smart-export-guarantee-explained`
4. Do I need planning permission for solar panels? `solar-panels-planning-permission-uk`
5. How long does a solar panel installation take? `how-long-does-solar-installation-take`
6. Solar panels on a north-facing or shaded roof `solar-panels-shaded-or-north-facing-roof`
7. What happens at a solar survey? `what-happens-at-a-solar-survey`
8. Solar and battery or solar only? `solar-only-or-solar-and-battery`
9. Adding a battery to existing solar `add-a-battery-to-existing-solar-panels`
10. What is MCS and why does it matter? `what-is-mcs-certification-solar`
11. Solar panels and an electric car charger `solar-panels-and-ev-charger`
12. Solar panels for small businesses in South Wales `solar-panels-for-small-business-south-wales`

Each links to the landing page (main button) and the estimator (secondary).

## 9. Deliverable 4: link audit

Search the repo and the live CMS pages for every quote-type button and link (`get-a-quote`, "quote", "survey", `#quote`) and make them follow section 5. Report a table: where, what it said before, what it says now. The CMS-stored pages (home and the others) are changed through the CMS, not in code; list those for the CMS step.

## 10. Working method

- Work in small steps, commit often, and push with: `git fetch -q origin main && git rebase origin/main && git push -q origin site/estimator-v2:main` (another session pushes to main too; every push deploys to production, so tests must pass first).
- Check each page by rendering it and looking (Playwright screenshots at 390 and 1440 px). Do not trust the code alone.
- Do not touch Stripe, the CRM, the quote builder or the EIC code.
- Ask Cal, in one short question, before inventing any fact.

## 11. Your report back

When you finish a deliverable, say: what changed (with URLs), what you checked and how, what you could not check, and a **Needs Cal** list (facts missing, pages waiting for the CMS Publish step, articles held as drafts).

## 12. Things to confirm with Cal before you start

- The credentials and registrations that may be named on the landing page (the briefs say MCS, RECC, NICEIC and TrustMark; the certificates show NAPIT too).
- Office hours and the phone numbers to show (the code currently has 01633 965205, Mon to Fri 8am to 6pm, weekends 10am to 3pm).
- Whether the landing page should drop the main menu (slim header) or keep it.
- Whether any real customer reviews or photos may be used, and where they are.
- The area covered, in words (for the page and the `LocalBusiness` markup).
