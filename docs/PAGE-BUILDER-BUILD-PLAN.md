# Page builder: build plan

Source specs: `PAGE-BUILDER-SPEC.md` and `IMAGE-SPEC.md` (19 November 2026, Cal). This file says how they are built: in what order, why that order, what each phase must prove before the next starts, and where the specs meet things already live. Written 19 November 2026; update the status lines as phases land.

## How the pieces fit

- **Two renderers** turn blocks into page HTML: the browser engine (`src/app/admin/cms-engine.ts`, used when someone presses Publish) and the TypeScript renderer (`src/lib/cms-render-html.ts`, used for scheduled blog posts). Any visual change is made in **both**, and `tests/cms-renderers.test.ts` checks they agree.
- **Pages live in one document** (`cms_kv` key `heliaxis-cms-v1`), saved whole by the editor, so the last save wins. The server never writes that document. Migrations run inside the editor's own upgrade step (the `ensure…()` functions in the engine), which is how every earlier one-off fix was done.
- **Live pages are a published snapshot** (`heliaxis-cms-rendered`). Renderer changes reach a live page only after the next **Publish**. `LIVE_FIXES_CSS` and `CmsBody` (`src/lib/cms-ctas.ts`, `src/components/cms/CmsBody.tsx`) change what is *shown* without republishing, and are used for safe fixes to pages already live.
- **Facts** go in their own key (`heliaxis-facts`), not in the site document, so editing a fact can never collide with someone editing pages.
- **The SEO & GEO Command Centre** (`/admin/search`, another build, spec `docs/SEO-PORTAL-SPEC.md`) writes pages *through* this builder (`src/lib/cms/ai-page.ts`). So this builder, the facts sheet and the validator are shared foundations, and the SEO loop in the page-builder spec (change 15) belongs to that build (see phase 7).

## Where the specs meet what is already live

| Topic | Already live (this week) | Decision |
| --- | --- | --- |
| Invented hero rating | The engine's upgrade step **wrote** `ratingValue 4.9` and `ratingInstalls 1200` into every hero, and the renderer printed "Google & Trustpilot" and "installs across South Wales" beside them | Phase 1: never invent. A rating or installs figure shows only when its value **and** its source/label are filled in. Existing 4.9 / 1200 values are cleared (they were never verified) |
| Testimonials | Every Testimonials block is hidden at render time (`withoutTestimonials`), because the sample ones were made up | Stays. Phase 2 adds approved testimonials to the facts sheet; blocks built from them carry `approved: true` and are the only ones shown |
| `#quote` with no form on the page | Buttons go to `/free-solar-quote` (`fixDeadQuoteLinks`) | Phase 1 keeps that as the no-JavaScript fallback and adds the spec's quote **drawer**: the same buttons open the quote form on the page. The 16 Nov rule "forms only on the landing page" is superseded by this spec: every service page gets its own form block (phase 3) |
| Service area wording | Cal confirmed "South Wales and the South West" (16 Nov). The spec's examples say "Wales & the South West" | The facts sheet is seeded with Cal's 16 Nov wording. **Cal to confirm the exact phrase** |
| Warranties | The home page says "30-year panel warranties as standard" | Now confirmed: panel warranties are the manufacturer's, 25 to 30 years; Heliaxis gives a 7-year workmanship warranty and a 6-year insurance-backed guarantee. The home page text is CMS content: Cal changes it in the editor, or a later pass does |
| One source of business facts | The SEO portal spec also has a "Business facts" setting | One source: `heliaxis-facts`. The SEO portal reads it (a small adapter, agreed with that build), so there is never a second copy to drift |

## Phases

Each phase ends with a gate: something that can be checked, not a feeling. A phase does not start until the one before has passed.

### Phase 1: stop the visible damage (spec changes 1 to 5)

No new data model, no AI cost. Fixes what is visibly broken and what could mislead.

1. **Steps filler becomes a call-to-action tile** (both renderers, CSS). Four or eight steps still look best, but any other count no longer shows hatched boxes.
2. **Hero never invents trust.** Rating and installs cells need real values; the upgrade step no longer writes 4.9 / 1200 and clears the old ones. New fields: rating source, installs label.
3. **Split buttons.** The right-hand button defaults to `#quote` (not `/commercial-funding`); the home page keeps its funding link explicitly. The editor warns when both buttons read the same.
4. **Area and sample defaults.** One `SERVICE_AREA` constant replaces "South Wales" in templates, footer text and sample copy; fabricated counts ("Join 1,200+ South Wales homes") are removed. Old default strings are upgraded only where they match exactly.
5. **Quote drawer.** Any page with `#quote` buttons and no form gets a drawer with the real quote form; without JavaScript the button still goes to the quote page.

Gate: tsc, eslint and tests pass; a steps block with 5, 6 and 7 items renders a tile (screenshot, both renderers); a hero with default values shows no rating; the drawer opens on a test page and submits to `/api/quote` with source `cms-drawer`; the old strings are gone from both renderers (a test guards this).

### Phase 2: facts sheet and validator (spec changes 6 and 14, validator part)

The rails everything else runs on, and the cheapest place to catch mistakes.

1. **Facts sheet**: typed `heliaxis-facts` record (service area and towns, credentials, phone and response promise, warranties, experience wording, rating when verified, funding with end dates, approved testimonials, approved case studies, image approvers). A HAP editor screen under CMS. Seeded only with facts Cal has confirmed.
2. **`[[CONFIRM: …]]`** marker for any claim without a fact behind it.
3. **Validator** (`src/lib/cms/validate.ts`, pure and tested): every check in the spec's checklist, error or warning. Runs on save in the editor, on demand in HAP, and **blocks Publish on errors**.
4. **Approved testimonials** flow: only blocks marked approved survive the render-time strip.

Gate: the validator flags every audit pattern on the 19 current drafts, and passes the spec's worked Battery Backup example once its `[[CONFIRM]]` items are filled.

### Phase 3: builder prompt, brief form and blueprints (spec changes 7 and 14)

1. The spec's sections 3 to 8 and 11 become the builder's system prompt, built from code so the rules and the validator cannot drift apart.
2. **Brief form**: page type, audience, service, area (optional), traffic source, target phrase, the reader's biggest doubt, case study to feature.
3. **Blueprints A to E** pick the block order; a module-rule normaliser enforces counts (steps 4 or 8, grid multiples) and fills the form block.
4. The facts sheet is injected into every run; the validator runs on the result and the builder repairs what it can.
5. **Regenerate the 19 drafts**, starting with Battery Backup. Costs AI credit and changes content, so it needs Cal's go-ahead.

Gate: Battery Backup regenerates with no validator errors and Cal approves it; only then the other 18.

### Phase 4: image library and effects (spec changes 8 and 10; IMAGE-SPEC slots)

Library fields (alt, description, kind, service, location, source, credit, approved), a vision-model tagging script for the 77 entries (under £1) with Cal confirming each, duplicate removal, the spotlight effect, credit captions, `srcset` sizes. Gate: no image without alt text; duplicates gone.

### Phase 5: AI images (spec change 9; IMAGE-SPEC)

`generateImage(brief)`, the style references Cal approves first, automatic checking by a vision model, one HAP notification per page, the review screen. Needs an image-model API key and Cal's approval of the style references. Model names and prices in the spec date from after this plan was written: confirm them against the providers' own documentation before coding.

### Phase 6: conversion plumbing (spec changes 11, 12, 13)

Mobile contact bar, `landing` page type, `FAQPage`/`Article`/`LocalBusiness` markup, and the enquiry fields that say which page, button and campaign produced it.

### Phase 7: search loop, keyword plan, duplicate pages (spec change 15 and keyword plan)

Owned by the SEO & GEO Command Centre build (its M3 planner and M4 content studio). This build provides what it needs: the facts sheet, the validator, the builder's brief schema, and a patch format for block-level changes. Merging duplicate pages (`/care-homes` and `/solar-panels-care-homes-south-wales`, and the solar, residential and commercial overlaps) is Cal's call, then a redirect.

## What Cal needs to provide or decide

1. The exact service-area phrase.
2. Review rating, count and platform, once verified (the rating stays hidden until then), and which testimonials are real customers.
3. An exact install count if one exists (until then: "hundreds of arrays installed and many more specified").
4. Phase 5: an image-model API key, and approval of the style references.
5. Who approves images (the image-approver role).
6. Whether to merge the duplicate pages.
7. Photo permissions for any photo used as "our install".

## Status

| Phase | Status |
| --- | --- |
| 1 | Built and tested (19 Nov 2026). Reaches live pages after the next Publish; the quote drawer and old-filler hiding are live without it |
| 2 to 7 | Not started |
