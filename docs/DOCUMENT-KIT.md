# Heliaxis document kit: a briefing for building new PDF packs

For anyone (or any Claude Code chat) asked to build a new branded Heliaxis PDF, such as the **Proposal Pack** or the **In House Pack**. Read this first, then `AGENTS.md` (house rules) in the repo root.

## What it is

Every generated Heliaxis PDF is made with **pdf-lib** through one shared kit, `src/lib/documents/pdf-kit.ts`. The kit gives you the brand's page furniture and a small set of building blocks; you write the content top to bottom and the kit handles page breaks, headers and footers.

Documents already built on it (read these as worked examples):

| Document | Code | Notes |
|---|---|---|
| Customer quote PDF | `src/lib/quotes/pdf.ts` | The richest example: cover page, clickable contents with page numbers, design pages, About page, accept button and QR, signatures |
| Quote design pages | `src/lib/quotes/design-pages.ts` | Tiles, product cards, charts, tables, the how-it-works diagram, MCS tables |
| Handover pack documents | `src/lib/documents/handover/*.ts` | Cover letter, contents, summary, warranty, plan, receipt, switch-off, G98/G99 sheets. `common.ts` has `begin()`. `pack.ts` merges them into one pack |
| Site paperwork | `src/lib/documents/site/*.ts` | Photo record, PV tests, battery sheets |
| Certificates | `src/lib/documents/eic/*.ts` | Ruled forms with their own page head |
| Labour PO, reports | `src/lib/site/labour-po.ts`, `reports.ts` | Smaller examples |

## The look (do not reinvent it)

- Palette (exported from the kit): `INK #211F18`, `PAPER #F7F2E7`, `CARD`, `SOLAR` gold `#F8BC1E`, `AMBER`, `MUTED`, `LINE`. Gold is an accent, never body text on light.
- First page: an ink header band with the reversed wordmark, a gold mono eyebrow, the title in Ezra, references on the right. Later pages: a slim ink strip. Every page: a dark footer banner with the legal line and "CODE · Issue n · Page x of y".
- Two variants from the same layout: `digital` (cream, filled) and `print` (the ink saver, white page, hairlines). Always pass the variant through. Test both.
- Fonts: Hanken Grotesk (body), Ezra (headings), JetBrains Mono (labels). The kit embeds them. Helvetica fallbacks only draw Latin text, so use `pdfText()` for anything user-supplied.

## Starting a document

```ts
import { newDocument, longDate, INK, SOLAR, MUTED } from '@/lib/documents/pdf-kit';
import { issueOf } from '@/lib/documents/issue';

const kit = await newDocument({
  code: 'HX-PP-01',               // the document's own code: eyebrow, footer, metadata
  title: 'Your proposal',
  revision: issueOf('HX-PP-01'),  // add the code to documents/issue.ts
  jobRef: 'HX-0130',
  refLabel: 'Customer',           // or 'Project'
  issued: '2026-11-01',           // YYYY-MM-DD
  accreditations: true,           // MCS, TrustMark, NAPIT, RECC, SSIP badge strip on pages 2+
  variant: 'digital',
});
kit.header({ meta: [['Project', 'HX-0130'], ['Date', longDate('2026-11-01')]] });
kit.idGrid([['Address', '…'], ['Customer', '…']]);
// … content …
const bytes = await kit.save();   // draws the footer banner on every page
```

For pack documents use `begin()` in `src/lib/documents/handover/common.ts`, which does the header and site box for you.

## Building blocks (methods on `kit`)

| Method | Use |
|---|---|
| `section(title, { intro?, keep? })` | A heading on a hairline with the spark. `keep` points must fit or it starts a new page |
| `rows([{label, value, strong?, must?, note?}], { card? })` | Label and answer rows. `strong` makes the key figure an ink bar |
| `grid({ columns, rows, widths })` | A table; headings repeat on new pages |
| `list(items)`, `note(text)`, `paragraph(text)` | Text |
| `checklist(items)`, `results(items)` | Tick boxes and results |
| `photos` / `photoKeep` | 4:3 photo cards |
| `signatures` | Signature blocks |
| `block(height, draw)` | A layout of your own. `draw(d)` gets a `Drawing` (`d.rect`, `d.text`, `d.right`, `d.line`, `d.image`, `d.lines`, `d.widthOf`, `d.logo`, `d.spark`, `d.page`, `d.x`, `d.top`, `d.width`). Synchronous: embed images first |
| `newPage({ landscape?, continued? })` | A new page. `continued: true` gives the slim strip |
| `room()`, `gap(h)`, `pageNumber`, `width` | Layout helpers |
| `brandImage(name)` | An image from `public/assets` (PNG or JPG), e.g. `heliaxis-accreditations-light.png`, `heliaxis-about-callum.jpg` |
| `embed(bytes)` | Embed bytes you fetched (photos, signatures) |

Rule: lay out first, then draw. Measure with `d.lines(text, size, width)` and `d.widthOf()` to size a `block` before drawing, as the quote's About page does. Check there is room with `kit.room()`.

## Patterns worth copying from the quote PDF

- **Contents with page numbers.** Content is built in two passes: pass one records which page each section landed on (`mark(title)`), pass two draws the contents with those numbers. A third pass runs only if the numbers moved. See `build()` and `quotePdf()` in `pdf.ts`.
- **Clickable links.** Link annotations are added in `linkContents()` after the document is built (to a page, or to a URL for the accept button).
- **Accept button and QR.** `linkButton()` and `drawQr()` (`src/lib/quotes/qr.ts`, vector squares via the `qrcode` package).
- **Accreditation band.** Ink rect with a gold rule and the cream logo strip (`heliaxis-accreditations-light.png`). Used on the cover and the About page.
- **Cards with the brand cross-hatch.** `cardFill()` in `design-pages.ts`.
- **Merged packs.** `src/lib/documents/handover/pack.ts` merges the generated documents (and customer-supplied PDFs) into one pack with a built contents page.
- **Appending third-party PDFs** (datasheets): load with `PDFDocument.load(bytes, { ignoreEncryption: true })` and `copyPages` onto the end.

## House rules (from `AGENTS.md`, summarised)

- Nothing is claimed that is not in the quote, the proposal or the job data. No invented warranties, certifications, prices or timescales.
- Buttons use the house classes (`crm-btn`, `pt-btn`); never the browser's file control (use `FileButton`); icons only from the brand kit; **no emoji anywhere** in the interface or in customer documents.
- Anything that waits on AI shows the `WritingSpark`.
- Next.js here is a newer version than most training data: read the relevant guide in `node_modules/next/dist/docs/` before changing routing, caching or rendering code.

## How to verify your work (always render it and look)

Do not trust the code alone. Render pages to images and read them.

1. Write a throwaway vitest that builds the document with sample data and writes a PDF. Copy the pattern of `.render-tmp/example.test.ts` (it is git-ignored; it mocks `server-only` with `vi.mock('server-only', () => ({}))`, builds the facts and calls the generator, then `writeFileSync`).
2. Run it: `npx vitest run tests/zz-example.test.ts --testTimeout=60000`, then delete the file.
3. Convert pages: `pdftoppm -r 70 -png out.pdf page`, then look at each PNG. Check text overflow, orphan pages, tables splitting, and the print variant.
4. Before committing: `npx tsc --noEmit -p .`, `npx eslint <changed paths>`, `npx vitest run`. Check the vitest output is green **before** committing and pushing.
5. Push: `git push origin site/estimator-v2:main` (every push to main deploys to heliaxis.co.uk, so the tests must pass first).

Tests for documents live in `tests/` (see `tests/quote-pdf.test.ts` and `tests/quote-mcs.test.ts` for the style: assert on content and page counts rather than pixels).

## Where the data comes from

- Quotes: `src/lib/quotes/types.ts` (`QuoteContent`, `ProposalOption`), `server.ts` (`renderQuote`), `proposal.ts` (OpenSolar reading, `glanceRows`, `factsText`), `interactive.ts` (the web version's data).
- Jobs and handover: `src/lib/handover/inputs.ts` (`JobHead`), `facts.ts`, `slots.ts`.
- Company facts: `HELIAXIS_COMPANY` and `HELIAXIS_PARTY` in `src/lib/subcontractors/agreement.ts` (address, phone, email, MCS number, company number, VAT).
- Database access: the Supabase admin client, `createAdminClient()`. A table that needs creating is a `supabase/*.sql` file that Cal runs by hand; code must cope with the table being missing (see `schemaReady()`).

## The two packs to build

Cal has not yet written down exactly what goes in these, so **start by asking him** (one short question each) rather than guessing:

1. **Proposal Pack** (customer-facing): presumably the quote, the OpenSolar-derived design pages, About Heliaxis, accreditations, the survey and structural notes, terms, and acceptance, merged as one branded PDF. Ask: is it the existing quote PDF plus more, or a replacement? What other sections? Who receives it and how (portal, email, print)?
2. **In House Pack** (internal): Ask: who is it for (installers, office, surveyors)? Does it carry costs, margins and supplier details that customers must never see? That would need an admin-only route and a clear "Internal, not for customers" mark on every page. What job data goes in (items with cost prices, survey notes, DNO/MCS status, RAMS, site contacts, equipment list)?

Build each as its own generator file next to the existing ones, a route that calls it (admin or CRM-session protected), a button in the CRM using the house `crm-btn` classes, and a test. Keep customer and internal data strictly apart: never let the In House Pack's generator be reachable from a customer link.

## A starter message for a new Claude Code chat

> Read `docs/DOCUMENT-KIT.md` and `AGENTS.md` in this repo first. Then use the document kit in `src/lib/documents/pdf-kit.ts` to build the **Proposal Pack** (and after that the **In House Pack**), following the patterns in `src/lib/quotes/pdf.ts` and `src/lib/documents/handover/`. Before writing code, ask me what sections each pack must contain and who sees it. Render every document to PNG with `pdftoppm` and check it by eye, in both digital and print variants. Run tsc, eslint and vitest and check they pass before you commit. Push with `git push origin site/estimator-v2:main`.
