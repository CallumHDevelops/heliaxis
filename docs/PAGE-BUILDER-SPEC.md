# Heliaxis page-building spec for the AI builder (Sonnet)

19 November 2026 · Callum Hiscott

## Purpose

Every Heliaxis page has one job: get the reader to make contact (form, call or WhatsApp). This spec says how the AI builder plans, writes, lays out and illustrates pages to do that job.

Two readers use it:

- **Sonnet in Claude Code**, which changes the CMS and the renderer (section 9) and updates the builder's system prompt.
- **The in-CMS AI page builder**, whose system prompt should hold sections 3–8 and 11 word for word.

The CMS stores pages in Supabase (`cms_kv`, key `heliaxis-cms-v1` for drafts and `heliaxis-cms-published` for live). Each page is an ordered list of blocks `{t, id, p}`, where `t` is the module type and `p` its fields. Field names in this spec match the stored data.

## What the audit found

The AI pages read like outlines, not pages that sell. None of the 19 AI-built service pages has a form, a review or a photo, so nothing on them earns contact. All 19 are still drafts (none is in `heliaxis-cms-published`), so they can be fixed before they go live.

| Pattern | Pages affected (of 19) | Why it hurts |
| --- | --- | --- |
| No form block, but every button points to `#quote` | 19 | The main CTA jumps to an anchor that isn't on the page |
| Hero rating and microtrust switched off (`hideRating`, `hideMicrotrust` = true) | 19 | Removes the only trust signal above the fold |
| No testimonials, gallery or case study | 19 | No proof at the point of decision |
| Every image slot empty (`img: ""`) | 19 | Text-only pages; explorer cards show blank tiles |
| Steps count not 4 or 8 (6, 7 or 5 steps) | 17 | Renderer fills the gap with hatched `pv-pstep-fill` boxes (your 2nd screenshot) |
| “South Wales” in copy, SEO and footer | 19 (2–9 times each, about 6 on average) | Shuts out readers outside it; reads as keyword stuffing |
| No intro paragraph: hero goes straight to a technical grid | 19 | Reader gets no answer to “is this for me?” |
| Long-form text (`rich` blocks) | 10 have none; the rest are under \~160 words | Information pages too thin to rank or to persuade |
| Five or six identical “Learn More” buttons, all to `#quote` | 5 | Says “learn” but sends to a form; same label repeated |

Page-level problems seen on Battery Backup (`/battery-backup`), the page in your screenshots:

- Headline is the SEO keyword (“Home Battery Backup South Wales”), not a promise.
- The split block's two cards each say only three words per bullet, and both buttons read “Book a backup survey”. The Whole-Property button links to `/commercial-funding`, which is wrong for a homeowner.
- The explorer lists six appliances, each with an empty image and a “Learn More” button to `#quote`.
- Six process steps in a four-across grid, so two hatched filler boxes.

The image library can't support good picks. It has 77 entries, but most are logos, badges and duplicates. About a dozen are real install photos, many named like `dji_fly_20260224_102518…`, and none has alt text or a description. The builder can't tell what a photo shows, so it leaves slots empty.

Your enquiries already come from well outside South Wales: Pembrokeshire, Somerset, Gloucestershire, the Bristol area and further into England. The home page already says “across Wales and England”; the AI pages contradict it.

Facts confirmed on 19 November 2026: panels carry 25–30 year manufacturer warranties; Heliaxis gives a 7-year workmanship warranty and a 6-year insurance-backed guarantee; Heliaxis has installed hundreds of arrays and specified many more. So “25 yr warranty” must always say whose warranty it is, and “1,200+ installs” comes out until there's a verified count. Still to check: the review rating and count, and whether the home page testimonials (Sarah M., David R., Gareth L) are real customers.

## Ground rules

The builder only states facts it was given. Everything else on the page is written to help a reader decide, not to fill space.

### 1. One facts sheet, nothing invented

Add a CMS key `heliaxis-facts`, edited by a person, which the builder reads on every run. It holds:

- Service area wording (see section 4) and the list of towns and regions served.
- Accreditations: MCS via NAPIT, RECC, TrustMark, SSIP, ISO 9001/14001, EUPD Awarded Installer 2026.
- Phone `01633 965205`, WhatsApp link, response promise (“same-day response”).
- Warranties: 7-year Heliaxis workmanship warranty; 6-year insurance-backed guarantee; panel manufacturer warranties of 25–30 years (per product, always labelled as the manufacturer's).
- Experience: “hundreds of arrays installed and many more specified” until there's an exact count. Review rating, count and platform: leave blank until verified; the builder hides the rating when blank.
- Funding facts with end dates (for example 0% VAT on residential installs until 31 March 2027).
- Approved testimonials: name, town, product, quote, date, source link.
- Approved case studies and their library image IDs.

If a sentence needs a number or claim that isn't in the facts sheet, the builder writes `[[CONFIRM: …]]` in its place. The validator (section 11) blocks publishing while any `[[CONFIRM` remains.

### 2. Location

Use the service-area phrase from the facts sheet, not “South Wales”. Name a place only on area pages, in the hero microtrust once, and in the footer. Never put a place in a service-page H1.

### 3. Voice

- UK English, plain words, second person (“you”, “your home”). Sentences under 25 words; paragraphs of 2–4 sentences.
- Calm and specific. Lead with what the reader gets, then how. “No pushy sales” is a brand promise; the copy must sound like it.
- Explain jargon the first time (“EPS, the backup output on some inverters”).

### 4. Never

- Placeholder text: “Your headline here”, “Lorem”, “Untitled article”.
- Invented statistics, testimonials, customer names, case studies or savings figures.
- AI images presented as a real Heliaxis install, customer or team member (section 8).
- Guarantees the facts can't back (“never lose power”, “best in Wales”). UK ad rules (CAP Code) apply to web pages, whether a person or AI wrote them.
- The same button label twice on one page except the hero and final CTA; generic “Learn More” or “Submit”.
- A link whose target doesn't match its label (for example homeowner backup → `/commercial-funding`).

## Location strategy

Service pages should not name a region. Area pages are worth building, but only where you have real local proof to put on them.

### Service pages (battery backup, solar, EV and so on)

- H1, eyebrow and body copy are area-neutral.
- SEO title: `<Service benefit> | Heliaxis`, for example “Home Battery Backup for Power Cuts | Heliaxis”. Meta description uses the service-area phrase once.
- Hero microtrust names the coverage once, for example “MCS-certified · Wales & the South West · Free survey” (exact phrase from the facts sheet).
- Fix the shared defaults that say South Wales: the footer `about`, the footer copyright line and the hero `ratingInstallsLabel`.

### Area pages

Google treats near-identical location pages as doorway pages and lists them as spam. A town page that only swaps the place name risks the whole site. Each area page must carry things only that area has.

Build an area page only when the facts sheet holds, for that area:

1. At least two real installs with photos (gallery, filtered by location).
2. At least one approved review from a customer there.
3. Local specifics: the towns covered, typical housing (terraces, farms, listed buildings), conservation-area or planning notes, and which network operator (DNO) the area sits under.
4. Any local grant or council scheme that applies.

Where an area doesn't meet that bar yet, don't build the page. Cover it with the Google Business Profile service-area list and a line on the “Areas we cover” page instead.

Start with regions, not every town. Pick them from where enquiries come from and the 103 tracked SEO keywords. A possible first set, for you to confirm: Cardiff & the Vale, Newport & Monmouthshire, Swansea & Neath Port Talbot, West Wales, Bristol & Somerset, Gloucestershire.

Structure: an `/areas` hub page lists every region. Each area page links to the service pages; each service page links to the hub. The footer currently links to `/solar-panels-cardiff`, `-swansea`, `-newport` and `-bridgend`, which are not in the CMS. Check whether they resolve; if not, point them at the hub until the area pages exist.

An area page's text must be at least 60% different from every other area page. The validator checks this (section 11).

## Page blueprints

Every page type follows the same arc: say what the reader gets, show it's real, explain it, remove doubts, then ask. The page type sets how much explaining comes before the ask. The builder picks a blueprint from the brief, then fills each block. Block names are CMS module types.

### A. Service / information page (e.g. Battery Backup)

Readers arrive from search or from the menu and are still weighing it up. Target 900–1,500 words.

1. `hero`: outcome headline, one-line sub saying who it's for, primary CTA to `#quote`, `cta2` = call. Rating and microtrust on.
2. `media`: **the introduction**. 120–180 words: the problem, what Heliaxis does about it, who it suits. With an image.
3. `grid` (3 or 4 cards): outcomes, not features. Each card 20–35 words.
4. `explorer` or `split`: the choices the reader has to make, with images and an honest trade-off for each.
5. `testi` or `casestudy`: proof at the point of doubt. Prefer reviews that mention this service.
6. `rich`: the explainer, 300–600 words under H3s (how it works, sizing, cost range, what affects it).
7. `steps`: 4 or 8 steps (section 6).
8. `form`: anchor `quote`, interest pre-filled for this service.
9. `faq`: 6–8 real questions, answers 40–80 words.
10. `funding`: only when a funding route applies.
11. `cta`: final ask, with a headline that differs from the hero's.
12. `accbanner` then `footer`.

### B. Ad landing page (Meta or Google Ads traffic)

The reader clicked one promise and should see it kept straight away. One goal, no exits. Target 300–600 words.

1. `hero`: headline repeats the ad's promise almost word for word.
2. `form` straight after the hero, short (name, phone, postcode, then email).
3. `stats` or `accbanner`: three or four verified trust facts.
4. `grid` of 3 benefits.
5. `testi`.
6. `steps` (4): what happens after they enquire.
7. `faq` (4–5): price, disruption, timing, obligation.
8. `cta` back to the form.

Use a new page type `landing` that hides the main menu and footer links (section 9).

### C. Blog / guide

Readers want an answer, not a sales pitch, so give the answer first and offer the next step softly. Target 1,200–2,000 words.

1. `hero`: the question as headline; sub = the short answer in one sentence; author and updated date.
2. `media`: a 3–5 bullet summary of the answer (shown as “In short”), with an image.
3. `rich` sections with H2s, each answering one part of the question. Use tables for comparisons.
4. Inline `cta` after the first section: soft offer (“Get a figure for my home” → savings estimator or survey).
5. `rich` continues.
6. `casestudy` or `testi` related to the topic.
7. `faq` (4–6).
8. `form`, then a `grid` of 3 links to the matching service pages.

### D. Case study

The current order works. Lead with the result as a number (“30 kWp with 92 kWh battery: £X a year saved”), then `stats`, the brief (`media`), what we installed (`grid`), `gallery`, `steps`, the client's quote (`testi`), and `form` with “Want results like this?”.

### E. Area page

`hero` (service + area), `media` local intro, `gallery` of local installs, `testi` from local customers, `grid` linking to services, `rich` local specifics (section 4), `steps`, local `faq`, `form`, `footer`.

## Module rules

Each of the 18 CMS modules has one job. These rules stop the empty or broken layouts in your screenshots.

| Module | Use it for | Rules |
| --- | --- | --- |
| `hero` | Promise + first ask | Headline ≤ 10 words, an outcome (“Keep the lights on when the grid goes down”). `sub` 15–30 words. `hideRating` and `hideMicrotrust` false whenever the facts sheet has the values. `bgImg` set. `cta2` = call. |
| `media` | Introduction; any idea that needs a picture | `text` 80–180 words. `img` always set, with `alt`. Alternate `side` left/right down the page. |
| `grid` | Benefits, features, what's included | `cols` 3 or 4 and item count a multiple of `cols`. Every `desc` filled, 20–35 words. |
| `split` | Two options compared | Each side: `ld` 40–70 words, 4–5 bullets in `lb`/`rb` of 4–10 words each. Labels differ (`lc` ≠ `rc`); both links stay on-topic. Follow it with a sentence or a `rich` block on how to choose. |
| `explorer` | Choices the reader picks between (appliances, products, sectors) | 3, 4 or 6 items. Every `img` set. `text` 25–45 words. Card button names the card (“See fridge backup options”) or is left out; never “Learn More” to `#quote`. |
| `steps` | What happens next | 4 or 8 items (renderer is 4 across). Each `text` 15–30 words and says who does what and how long it takes. |
| `rich` | The explainer | 300–600 words on service pages, H3 subheads, short paragraphs, a table where things are compared. Internal links to estimator, funding, related services. |
| `testi` | Reviews | Only approved reviews from the facts sheet, 3–6 items, each with town and product. |
| `casestudy` | A real project linked to this service | Only approved case studies. |
| `gallery` | Real installs | Library photos only, never AI. Caption with system size and place. |
| `stats` | Verified numbers | 3–4 items, all from the facts sheet. |
| `funding` | Ways to pay | Only routes that apply to this audience; end dates from the facts sheet. |
| `faq` | Doubts and objections | 6–8 questions people actually ask (cost, disruption, timing, what if it goes wrong). Answers 40–80 words, no repeats of body copy. |
| `form` | The conversion | One per page, `anchor: "quote"`. Tabs on for mixed audiences. `fInterest` pre-filled with the page's service. Button first-person (“Get my free survey”). Three reassurance `points`. |
| `cta` | Mid-page or final ask | Headline differs from the hero's. `btn` to `#quote`, `btn2` call. Max two per page. |
| `banner` | Brand logos strip | Optional, after proof. |
| `accbanner` | Accreditation logos | On every service, area and landing page. |
| `footer` | Site footer | Shared; no page-specific edits. |

## Copy rules

Write for a homeowner or business owner who is wary of being sold to. Every block should answer a question they have at that point on the page.

### Headlines

- Hero: the outcome in the reader's words, ≤ 10 words. “Keep your essentials running in a power cut”, not “Home Battery Backup South Wales”.
- Section titles say what the reader learns: “Why most solar systems switch off in a power cut”, not “Understanding Solar System Shutdowns”.
- Eyebrows are short labels (2–4 words), not a second headline.

### The introduction (every page)

The first `media` block after the hero. 120–180 words in four moves:

1. **The situation** in one or two sentences the reader recognises (“When the grid goes down, most solar and battery systems go down with it.”).
2. **What Heliaxis does** about it, plainly.
3. **Who it suits** and who it doesn't. Honesty here builds trust.
4. **The next step**, with a link to the form.

### Buttons and calls to action

- Start with a verb, say what the reader gets, and use first person: “Book my backup survey”, “Get my free quote”. Tests at Unbounce found “my” beat “your” on button copy; treat it as the default and test it.
- Each button label on a page is different, except the hero and final CTA may match.
- Labels fit the place on the page:

| Position | Example label |
| --- | --- |
| Hero | Book my free survey |
| After an option card | Plan essential-load backup / Plan whole-home backup |
| After proof | See if my home is suitable |
| Inline in a guide | Work out my savings |
| Form button | Get my free survey |
| Final CTA | Talk to an installer |
| Secondary (everywhere) | Call 01633 965205 |

### Near the form

Put reassurance next to the button: what happens next, how fast you reply, that there's no obligation. Say “We'll only use your details to arrange your survey”. Don't mention spam: in one published test, a privacy line that mentioned spam cut sign-ups.

### Length and specifics

- Word targets are in section 5. Thin pages are a bigger problem than long ones here, as long as every paragraph helps a decision.
- Prefer a number from the facts sheet to an adjective. “Same-day response” (already on your home page form) beats “fast service”.
- Use the reader's terms first, the trade term second (“backup output (EPS)”).
- No paragraph longer than 4 sentences; one idea per paragraph.

## Images

No image slot ships empty. Real photos come first, and AI images show ideas, never your work. Your “dark room, fridge still lit” idea is exactly the kind of picture AI should make.

The exact rules (house style, sizes, prompts, shot lists, approval) are in IMAGE-SPEC.md, which takes precedence over the summary below.

### Sourcing order for every slot

1. **Your own photos** from the library, matched by tags. Required for gallery, case studies, area pages and anything that says “our install”.
2. **AI-generated concept images** for ideas that are hard to photograph: a power cut, what stays on, energy flowing through a home.
3. **Stock photos** (Pexels first) for generic scenes: a family in a kitchen, a farm, a care-home lounge.

### Step one: make the library usable

The builder can't pick photos it can't read. Sonnet should add these fields to each `site.images` entry: `alt`, `desc`, `kind` (install / product / concept / stock / logo), `service` tags, `location`, `systemSize`, `source` (own / ai / pexels / unsplash), `credit`, `approved`.

Then run a one-off script: a vision model drafts `alt`, `desc` and tags for all 77 entries; a person confirms them in the CMS. Remove the duplicates.

Going forward, give installers a shot list for every job: wide shot of the array, inverter and battery on the wall, neat cable runs, the changeover switch or backup panel, the app screen, and the customer (with written permission).

### AI image generation

Recommended: **Google Nano Banana 2.1** through the Gemini API. It went generally available on 6 October 2026 at about 3.4¢ per 1K image and 5¢ per 2K image, and it edits images as well as making them. Alternative: OpenAI **GPT Image 2**, from about 0.6¢ (low quality) to 21¢ (high) per 1024×1024 image. Don't build on Google Imagen: it was shut down on the Gemini API on 17 August 2026.

Pipeline:

1. For each empty slot the builder writes an image brief: purpose, subject, what must stand out, aspect ratio, alt text.
2. A server route (for example `/api/cms/images/generate`) calls the model with the brief run through the prompt template below. The API key stays server-side.
3. The result is saved as WebP to the `cms-media` bucket and added to `site.images` with `source: "ai"`, the prompt, the model and `approved: false`.
4. A person approves it in the HAP app, one notification per page (see IMAGE-SPEC.md). The validator blocks publishing while any unapproved image is on the page.

**Matching sets:** generate one base scene first (for example a dark kitchen during a power cut). Then make each variant with the model's edit mode, passing the base image as reference: “same room, now only the fridge-freezer is lit”. Every card then shows the same room with a different thing lit, which is the effect you described.

**A cheaper route for the same effect:** a renderer treatment `img.effect: "spotlight"`. It darkens and desaturates the image and keeps a soft circle of full colour at `focusX`/`focusY`, which image objects already store. One kitchen photo then works for every appliance card, with a different focus point on each, and can brighten on hover.

### Prompt template

```
Photorealistic photograph. {scene}, inside a typical UK {house type}.
{what must stand out} is clearly lit and in full colour; the rest of the room
is in deep blue-grey shadow. Warm amber light, natural and believable.
35mm lens, eye level, shallow depth of field. {aspect ratio}.
No text, no logos, no brand names, no visible faces.
```

Examples for the Battery Backup page:

| Slot | Brief |
| --- | --- |
| Hero `bgImg` | A row of UK semi-detached houses at dusk in a street-wide power cut. Every window is dark except one home, whose kitchen glows warm amber. 16:9. |
| Explorer: Fridge/Freezer | Dark kitchen at night; only the fridge-freezer is lit, its door slightly open with interior light spilling out. 4:3. |
| Explorer: Lights & sockets | Same kitchen; one ceiling light and a phone charging at a worktop socket are lit. 4:3. |
| Explorer: Broadband | Dark hallway; a Wi-Fi router's lights glow on a shelf, a laptop open nearby. 4:3. |
| Explorer: Heating controls | Dark hallway; a wall thermostat display and boiler control panel glow. 4:3. |
| Explorer: Whole home | The whole house lit from inside while the street around it is dark. 4:3. |
| Explorer: Medical equipment | Use a calm, neutral image (a softly lit bedside table with a plugged-in device), or none. Never depict a patient. |

### Rules for AI images

- Never show a Heliaxis install, van, uniform, staff member, customer or result. Under UK ad rules an image that gives a misleading impression is not fixed by an “AI-generated” label.
- No readable text, logos or branded products in the image.
- Alt text describes what's in the picture, not the keyword.
- Sizes: hero 2400×1350, media 1600×1200, cards 1200×900; WebP under 250 KB.

### Stock photos

- **Pexels API**: free for commercial use. The API guidelines ask for a visible link to Pexels and credit to photographers. Images can be saved into `cms-media`.
- **Unsplash API**: better quality, but stricter. Images must be hotlinked from Unsplash's URLs, credited to the photographer and Unsplash, and each use must trigger the download endpoint.
- Store `credit` on the library entry; the renderer prints it as a small caption.

### What images cost

A fully illustrated page costs about £1 in AI images, retries included. Prices are per finished image, converted at about $1.33 to £1 (mid-2026 rate).

| Model | Size | USD per image | ≈ GBP |
| --- | --- | --- | --- |
| Nano Banana 2.1 (Google) | 1K | $0.034 | 2.5p |
| Nano Banana 2.1 | 2K (hero, media) | $0.050 | 3.8p |
| Nano Banana 2.1 | 4K | $0.113 | 8.5p |
| GPT Image 2 (OpenAI), landscape | low / medium / high | $0.005 / $0.041 / $0.165 | 0.4p / 3.1p / 12.4p |
| FLUX.2 Pro (Black Forest Labs) | 1 MP / \~4 MP | $0.030 / $0.075 | 2.3p / 5.6p |

What that means in practice:

- **Per page.** Battery Backup needs 8 images (hero, intro, six cards). At 2K with about three tries per slot, that's 24 generations × 3.8p ≈ **90p**. Budget £0.50–£2 per page.
- **Per month.** Ten new or refreshed pages ≈ **£10–£20**.
- **Concept library, one-off.** About 40 reusable scenes (power-cut street, kitchen set, heat pump in a garden, EV on a driveway, farm, care-home lounge) ≈ **£5**. Reuse them across pages instead of generating per page.
- **Library tagging.** Describing your 77 existing images with a vision model costs under £1.
- **Spotlight effect.** Free per card once built.

Other notes:

- Draft cheaply, finish well: GPT Image 2 low quality at 0.4p is fine for trying out compositions; make the keeper at 2K. OpenAI's Batch API halves its prices for jobs that can wait.
- Speed: about 10–30 seconds per image, so generate in the background and show results in the library.
- Edits (the “same room, different appliance lit” set) cost about the same as a new image, plus a fraction of a penny for the reference image.
- Prices move every few months. Store the per-image cost on each generation so the CMS shows actual monthly spend.

## SEO and GEO rewrite loop

The system should rewrite pages from the SEO tool's findings, as proposals a person approves. Changes must be built on real data and add information, not just shuffle keywords. Google says its AI Overviews and AI Mode need no special optimisation beyond normal SEO ([Google](https://developers.google.com/search/docs/appearance/ai-features)). It also lists AI-specific rewriting and llms.txt among tactics not worth pursuing ([summary](https://www.thekeyword.co/news/google-ai-search-optimization-guide)). What does raise citations in AI answers is substance: statistics, cited sources and quotes lifted visibility by up to 40% in the Princeton GEO study ([arXiv](https://arxiv.org/html/2311.09735v3)).

### What the SEO tool holds today

- 103 tracked keywords, but none has `target_page` set, so the tool can't tell which page should rank for what.
- All 103 are local “installer + town” searches (solar 47, heat pump 23, battery 22, EV 11) across 12 towns, including Bath, Bristol, Cheltenham, Gloucester and Swindon. There are no question searches (“does a solar battery work in a power cut”), which are what service pages and guides rank for.
- 10 GEO prompts, all “who are the best installers in X”. The results tables (`geo_checks`, `social_geo_sample`, `gsc_daily`, `seo_serp_item`) are empty: no runs stored yet.
- Proposals only change titles and descriptions, and the generator adds “South Wales” to them.

### Step 0: give the loop data

1. **Map every keyword to one page** (`target_page`). “Installer in {town}” goes to the area page, or the home page until one exists. “{Service} cost / how / does” goes to the service page or a guide. One primary page per keyword, so pages don't compete.
2. **Add question keywords**: 30–50 per service, from Search Console queries and Google's “People also ask”.
3. **Connect Google Search Console** to fill `gsc_daily`. It's the best signal: the searches each page already appears for.
4. **Run GEO checks weekly** across the AI engines. Add prompts that match service pages (“Will a home battery work in a power cut?”, “How much does battery backup cost in the UK?”) and English towns.
5. **Join enquiries to pages** (code change 13) so the loop knows which pages bring work.

### The loop, weekly per page

1. **Diagnose.** Build a page report from:
   - Search Console: searches where the page sits at positions 5–20 (closest wins); high impressions with low click-through (title and description problem).
   - SERP data: headings, subtopics and “People also ask” questions on the top five pages that this page lacks.
   - GEO checks: prompts where Heliaxis isn't mentioned, and which sites the engines cite instead.
   - Site audit and the page's enquiry rate.
2. **Propose.** The rewrite agent writes block-level changes, each with a reason tied to the data. For example: add an FAQ from a “People also ask” question; add an H3 to the `rich` block covering a missing subtopic; rewrite the title; add a figure from the facts sheet; add an internal link. Store each as a JSON patch in `geo_suggestions.payload` and show it as before/after in the existing Approve change screen.
3. **Check.** Every proposal must pass the validator (section 11) and the facts sheet. The system rejects anything else before a person sees it.
4. **Approve.** A person approves, edits or rejects. Nothing goes live unreviewed.
5. **Measure.** Log the change date. After 4–6 weeks compare rank, clicks, AI mentions and enquiries, and flag the change for rollback if the page got worse.

### Rewrite rules

- **Protect conversion.** SEO changes may not remove or weaken the hero CTA, the form or proof blocks.
- **Pace.** One substantial rewrite per page every six weeks, so each change can be measured. Titles and descriptions can change sooner.
- **Placement.** Search phrase in the title, the H1 (worded naturally), the first 100 words and one H2. No density targets, no lists of towns.
- **Location.** Follows section 4: place names on area pages only.
- **Add, don't pad.** Every addition answers a question, adds a figure or explains a choice. No synonyms or filler.

### Writing so AI answers cite you (GEO)

- **Answer first.** The first sentence under each heading answers it plainly, so an AI can quote it on its own.
- **Specific figures with a source.** Swap “save money” for a number from the facts sheet or a linked source (Energy Saving Trust, Ofgem, MCS).
- **Quotes from your own experts.** “Callum Hiscott, MCS installer: …”. Real people and real words, stored in the facts sheet.
- **Consistent business facts everywhere.** Name, phone, accreditations and area served match on the site, Google Business Profile and the MCS, TrustMark and RECC listings.
- **Work off-site too.** GEO checks show which sites AI engines cite (directories, review sites, local news). Being listed and reviewed there can matter more than another page rewrite.

### Staying clear of penalties

Google's spam policies cover scaled content abuse alongside doorway pages ([overview](https://bulkbase.ai/seo/doorway-pages-what-they-are-why-they-hurt-seo)). Auto-rewriting many pages with thin, keyword-led changes risks the whole site. The approval step, the facts sheet, the six-week pace and the “add, don't pad” rule keep the loop safe.

## Keyword plan

The SEO tool should track the searches you want to win, not only “installer + town”. Each wanted search should map to one page, and the builder should create the page when none exists. Today all 103 tracked keywords are local installer searches with no volumes stored. They lead to area pages and the map pack, but they miss the questions, costs, funding and sector searches that your service pages exist for.

### Keyword families to track

The phrases below are starting ideas to check for volume, not proven targets.

| Family | Starting phrases | Page that should rank |
| --- | --- | --- |
| Local installer (the current 103) | solar panel installers Bristol; heat pump installer Cardiff | Area page, or home page until one exists; Google Business Profile |
| Service, no town | home battery backup; solar battery for power cuts; add a battery to existing solar panels | Matching service page |
| Cost and value | home battery cost UK; off-grid solar system cost; is solar worth it UK | Cost section on the service page, or a guide |
| Questions | do solar panels work in a power cut; what size battery do I need; how long does a home battery last | Guides and FAQ blocks |
| Funding | 0% VAT solar panels; solar panel grants Wales; heat pump grant; commercial solar finance | Funding page and guides |
| Commercial and sector | commercial solar installers; solar panels for farms; solar for care homes; workplace EV charging; solar PPA UK; commercial battery storage | Sector and commercial pages |
| Off-grid (you already run ads for it) | off-grid solar system UK; off-grid power for a farm / cabin / container | Off-grid page and guides |
| Product and brand | GoodWe installer; GoodWe battery installer | A GoodWe page or the Congress Theatre case study `[[CONFIRM: partner status]]` |
| Your name | Heliaxis; Heliaxis reviews | Home page; a reviews page |

Also add towns where enquiries actually come from but aren't tracked yet, such as Pembrokeshire, Carmarthenshire, Somerset and Gloucestershire villages.

### How a wanted keyword becomes a page

1. **Wishlist.** In the SEO portal you add searches or topics you want to be found for, with a priority. They're saved to `seo_keyword` with `source: "wishlist"`.
2. **Expand.** The tool pulls related phrases, monthly volume and difficulty (from DataForSEO, which it already uses) plus your Search Console searches.
3. **Cluster.** Phrases whose Google top 10 share most of the same pages belong on one page. Store groups in a new `seo_cluster` table (`seo_keyword.cluster_id` already exists).
4. **Assign.** Each cluster gets exactly one page. If none fits, the cluster is marked “page needed” with a page type (service, guide, sector or area).
5. **Brief and build.** The builder receives a cluster brief: main phrase, supporting phrases, the questions people ask, what the top-ranking pages cover, the reader's main doubt and the facts available. It drafts the page to the blueprint in section 5 and sends it for review in HAP.
6. **Prioritise.** Score each cluster by volume × how likely that search leads to an enquiry × how far you are from the top three. Build the top three to five pages a month.

### Pages that already compete with each other

Two pages per topic split your ranking. Merge or give each a different job:

- `/care-homes` and `/solar-panels-care-homes-south-wales`: merge into `/care-homes`, redirect the other.
- `/solar-panels`, `/solar-and-battery` and `/residential`: give each a distinct cluster (solar only, solar plus storage, the whole-home overview).
- `/commercial` and `/commercial-solar`: hub and detail page; the hub links down rather than repeating the content.

The SEO portal has its own spec (`docs/SEO-PORTAL-SPEC.md`), which I couldn't read. Sonnet should merge this plan into it.

## Code changes for Sonnet

Fifteen changes, in priority order. The first five fix what's visibly broken; the rest make the builder produce better pages unaided.

1. **Every `#quote` link resolves.** If a page has no `form` block, the renderer opens a quote drawer (the same form component) when `#quote` is clicked. The builder still adds a form block (section 5).
2. **Steps filler becomes a CTA tile.** When the step count leaves gaps in the 4-across grid, render the spare cells as one tile spanning them: “Ready when you are” + “Book my free survey” + phone. Remove the hatched `pv-pstep-fill-box`. The builder rule (4 or 8 steps) still applies.
3. **Hero trust on by default.** `hideRating` and `hideMicrotrust` default to false. Rating values and `ratingInstallsLabel` come from the facts sheet; hide the rating only when its facts are blank.
4. **Remove South Wales from shared defaults.** Footer `about`, copyright line, hero `ratingInstallsLabel`, block templates and the “EV & fleet” template's eyebrow. Use `{serviceArea}` from the facts sheet. Write a migration that does the same across the 19 drafts.
5. **Explorer and split buttons.** Explorer: card button is optional and hidden when empty; no default “Learn More”. Split: warn in the editor when `lc` equals `rc`.
6. **Facts sheet.** New key `heliaxis-facts`, an editor screen, and injection into every builder run (section 3).
7. **Builder prompt and brief form.** Replace the builder's system prompt with sections 3–8 and 11 of this spec. The brief form asks for: page type, audience (home / business / both), service, area (optional), traffic source, target search phrase, the reader's biggest doubt, and any approved case study to feature.
8. **Image fields and library clean-up.** Add the fields in section 8, the vision-model tagging script, and duplicate removal.
9. **AI image route.** `/api/cms/images/generate` (Nano Banana 2.1, GPT Image 2 as fallback), saving to `cms-media` with `approved: false`, plus an approve button in the library.
10. **Spotlight effect and credits.** `img.effect: "spotlight"` using `focusX`/`focusY`; print `credit` as a caption when present.
11. **Mobile contact bar.** A sticky bar on phones with Call, WhatsApp and Get a quote, shown after the hero scrolls out of view.
12. **New fields and types.** Page type `landing` (no main menu, minimal footer). Blog `author` and `updated` fields. JSON-LD for `FAQPage` from `faq` blocks, `Article` for blogs, and `LocalBusiness` with `areaServed` from the facts sheet.
13. **Track which pages convert.** Recent enquiries have `landing_path` and `channel` empty. The form must send the page slug, the CTA that opened it and UTM values, so you can see enquiries per page.
14. **Validator and regeneration.** Run the checks in section 11 on save and block publish on errors. Then regenerate the 19 drafts with the new prompt and review each one.
15. **SEO and GEO rewrite loop.** Build the loop in the section above: keyword-to-page mapping, Search Console import, weekly GEO runs, block-level proposals as JSON patches, and before/after measurement. Fix the current title/description generator so it uses `{serviceArea}`, not “South Wales”.

## Worked example: Battery Backup rebuilt

This is the standard to hold the builder to. The page goes from 9 thin blocks to 13, with an intro, two real options, images, proof and a form. Copy below is ready to use; `[[CONFIRM]]` marks facts you need to supply.

**SEO:** title “Home Battery Backup for Power Cuts | Heliaxis”. Description: “Most solar batteries switch off in a power cut. We design backup so your fridge, lights, broadband and heating keep running. Free survey across {serviceArea}.”

1. **`hero`**
   - Eyebrow: Home battery backup
   - Headline: Keep your essentials running in a power cut
   - Sub: Most solar and battery systems switch off when the grid goes down. We design yours so the circuits you choose keep working.
   - Buttons: “Book my backup survey” → `#quote`; “Call 01633 965205”. Rating and microtrust on. `bgImg`: the dusk street image (section 8).
2. **`media` (introduction)**, image: dark kitchen with fridge lit.
   - When the grid goes down, most solar and battery systems go down with it. That surprises a lot of people, but it's a safety rule: inverters must stop sending power out so engineers working on the lines aren't put at risk.
   - Backup has to be designed in. With a backup-capable inverter, a changeover switch and a battery sized for the job, your home disconnects from the grid in a cut and runs from the battery. Where the system supports it, your panels keep topping it up in daylight.
   - It suits rural homes with frequent cuts, people who work from home, and anyone who can't be without heating controls or a working fridge. If cuts are rare where you live and you mainly want lower bills, a standard battery may be all you need, and we'll tell you so.
3. **`grid`** (4 cards) — “Why most solar systems switch off in a power cut”
   - Safety shutdown: Grid-tied inverters switch off within seconds of a cut so no power flows back into the lines. This is called anti-islanding, and every compliant system does it.
   - Backup output: Some inverters have a separate backup output (often called EPS). Only circuits wired to it stay live, so which circuits you connect matters.
   - Changeover switch: Isolates your home from the grid during a cut and reconnects it safely afterwards. It's what makes backup safe and compliant.
   - Output limit: The inverter caps how much power you can draw at once, however big the battery. Kettles, ovens and electric showers may need to wait.
4. **`split`** — “Two ways to back up your home”
   - Left, Essential-load backup: A protected circuit runs the things you can't do without. The load is small, so a modest battery lasts longer through an outage. It's the lower-cost option and suits most homes. Bullets: fridge and freezer · lights in key rooms · broadband and router · gas boiler and heating controls · a few sockets for phones and laptops. Button: “Plan essential-load backup”.
   - Right, Whole-home backup: Every circuit stays live, within the inverter's output limit. It needs a larger inverter and battery, and some heavy appliances are best left off during a cut. Best for larger homes, home businesses and long rural outages. Bullets: all sockets and lighting · most kitchen appliances, within limits · alarms, cameras and gates · the home office · heat pump, only if the system is sized for it. Button: “Plan whole-home backup” (to `#quote`, not `/commercial-funding`).
   - Under it: “Not sure which? Most people start with essentials. At the survey we check what you use and price both options.”
5. **`explorer`** — “What do you want to keep running?” Six cards using the matching AI image set from section 8: Fridge & freezer, Lights & sockets, Broadband, Heating controls, Medical equipment, Whole home. Each 25–45 words on why it matters and what it takes to back it up. No card buttons.
6. **`testi`**: two or three approved reviews that mention backup or power cuts. `[[CONFIRM: approved backup reviews]]`
7. **`rich`** — “Sizing your backup”, about 400 words under three H3s:
   - Power (kW) vs capacity (kWh): what can run at once vs how long it runs. Use a kettle and a fridge as the two examples.
   - How long will it last? A worked example adding up a fridge-freezer, router, LED lights and boiler controls over 24 hours, labelled as an example; your survey uses your real usage.
   - Can I add backup to my existing system? Depends on the inverter; some need a new hybrid inverter or a separate backup unit. Link to `/add-battery-to-existing-solar`.
8. **`steps`** (4) — “What happens next”
   - Survey: We look at your consumer unit, current system and what you want to keep running. About an hour at your home. `[[CONFIRM]]`
   - Design and quote: You get a written quote with both options and what each would keep running.
   - Installation: Usually completed in `[[CONFIRM]]` days by our own MCS-certified team.
   - Test and handover: We cut the supply and show you backup working, then walk you through the app.
9. **`form`** — Title “Find out what your home can keep running”, interest pre-filled “Battery backup”, button “Get my free backup survey”, three reassurance points.
10. **`faq`**: keep the current eight questions; rewrite each answer to 40–80 words. Example: *Will my solar recharge the battery in a long power cut?* “It can, if the system is designed for it. Some inverters keep the panels working while the house is off-grid and use them to recharge the battery in daylight. Others shut the panels down until the grid returns. We'll tell you which yours does and what it would take to change it.”
11. **`cta`** — Headline “Be ready before the next power cut”, buttons “Talk to an installer” + call.
12. **`accbanner`**
13. **`footer`**

## Pre-publish checklist

The validator runs on save and on publish. Errors block publishing; warnings show in the editor. Every check below would have caught a problem in the current drafts.

| Check | Rule | Level |
| --- | --- | --- |
| Placeholders | No `[[CONFIRM`, “Your headline here”, “Lorem”, “Untitled” | Error |
| Contact | Page has a `form` with `anchor: "quote"`, or the quote drawer is on | Error |
| Links | Every `#anchor` exists on the page; every internal link resolves; no button to `/commercial-funding` on a home page | Error |
| Images | No empty `img`/`bgImg`; every image has `alt`; no unapproved AI image | Error |
| AI images | No `source: ai` image in `gallery`, `casestudy`, or anywhere captioned as an install | Error |
| Facts | Every number, rating, review and case study matches the facts sheet | Error |
| Area pages | Text ≥ 60% different from every other area page; at least 2 local installs and 1 local review | Error |
| Steps | Item count is 4 or 8 | Warning |
| Grid | Item count is a multiple of `cols`; every `desc` filled | Warning |
| Buttons | No label repeated except hero = final CTA; no “Learn More”, “Submit” or “Click here” | Warning |
| Location | “South Wales” (or any place name) not in a service page's H1, and at most twice in the body | Warning |
| Intro | A `media` or `rich` block of 120+ words directly after the hero | Warning |
| Length | Word count within the page type's target range (section 5) | Warning |
| Proof | At least one `testi`, `casestudy` or `gallery` block on service and area pages | Warning |
| Trust | Hero rating and microtrust visible when the facts sheet has values | Warning |
| SEO | Title 50–60 characters, description 140–160, one H1, slug without a place name on service pages | Warning |

## Research basis and sources

The audit figures come from the Heliaxis Supabase project (`cms_kv`: `heliaxis-cms-v1`, `heliaxis-cms-published`, `heliaxis-cms-rendered`) as of 19 November 2026. The rules above rest on these findings:

- **Page structure.** Pages that convert do the same jobs in order: introduce, expand, illustrate, ask, prove, persuade, reassure, ask again ([Centric](https://www.centricdxb.com/insights/anatomy-high-converting-landing-page)). Ad landing pages work best with a single goal ([LearnyBox](https://learnybox.com/en/blog/landing-page-best-practices/)).
- **Reviews.** Showing reviews lifted conversion 190% on lower-priced items and 380% on higher-priced ones ([Spiegel Research Center](https://spiegel.medill.northwestern.edu/How-Online-Reviews-Influence-Sales)). A solar or battery install is a high-priced decision, so proof matters more.
- **Button copy.** Changing “Start your free trial” to “Start my free trial” raised click-through 90% in an Unbounce test, and Copy Hackers saw a 24% lift in a repeat ([ClickZ](https://clickz.com/me-vs-you-how-pronouns-affect-click-conversion-rates/32596/)). A privacy line that mentioned spam cut sign-ups 18.7% ([Review42 summary](https://resources.review42.com/call-to-action-tips/)).
- **Forms.** Worth testing next: splitting the quote form into two short steps. Venture Harbour reported its enquiry form going from 0.96% to 8.1% after the change ([Venture Harbour](https://ventureharbour.com/multi-step-lead-forms-get-300-conversions/)).
- **Area pages.** Google's spam policies name doorway abuse, and near-duplicate city pages are the common case ([StoreRocket](https://storerocket.io/learn/doorway-pages), [Search Engine Land](https://searchengineland.com/location-pages-google-october-spam-update-390016)).
- **AI images and UK ad rules.** CAP says existing rules apply however content is made, and disclosing AI use doesn't fix a misleading message ([RPC](https://www.rpclegal.com/snapshots/advertising-and-marketing/summer-2025/cap-issues-guidance-on-use-of-ai-in-ads/), [ASA](https://www.asa.org.uk/news/ai-and-deepfakes-four-things-advertisers-need-to-know-before-they-hit-run.html)).
- **Image models.** Nano Banana 2.1 pricing and release ([FourWeekMBA](https://fourweekmba.com/ai-google-halves-nano-banana-image-price-triples-input-price/)); Imagen shut down on the Gemini API ([Developers Digest](https://www.developersdigest.tech/models/image-generation/google-gemini-api)); GPT Image 2 per-image prices ([AI Agent Navi](https://aiagent-navi.com/special/image-gen-api-pricing/)). Check current prices before building; they change often.
- **Stock libraries.** Unsplash requires hotlinking, attribution and download tracking ([Unsplash API guidelines](https://help.unsplash.com/api-guidelines/unsplash-api-guidelines)); Pexels asks for a visible link to Pexels ([Pexels guidelines](https://python-pexels.readthedocs.io/en/stable/guidelines.html)).
