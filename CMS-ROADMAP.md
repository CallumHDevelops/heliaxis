# Heliaxis CMS — Roadmap & Current State

_Branch: `new-site-cms`. This is the honest state of the CMS today plus the plan to get
it to where you want it._

---

## 1. How it works today (the important context)

- **The CMS** (`public/pages/cms.html`) is a self-contained, browser-based page builder
  written in vanilla JS. Its whole state (`STATE`) — pages, menu, logos, images — is saved
  as one JSON blob to Supabase (`cms_kv` table) via `/api/cms`.
- **The live site nav** is a **separate, hardcoded React component**
  (`src/components/site/Header.tsx`) with a `MENU` constant baked into the code.
- **Publish** (`/api/cms/publish`) snapshots the draft and stores rendered page HTML — but
  it does **not** currently touch the nav/mega-menu.

### ⚠️ The critical gap (read this first)
**Editing the mega menu in the CMS changes nothing on the live site**, because the live
`Header.tsx` doesn't read the CMS menu — it uses its own hardcoded copy. Every menu feature
you've asked for depends on first **wiring the live Header to render from the published CMS
menu** (`STATE.site.menu` → `cms_kv` → `Header.tsx`). That's Phase 1 below and it unlocks
everything else.

---

## 2. "Where are the pages that were created before?"

They're **static HTML files in `public/pages/`**, served at clean URLs via rewrites in
`next.config.ts`:

| Page | File |
|------|------|
| Home | `public/pages/home.html` |
| Commercial funding | `public/pages/commercial-funding.html` |
| Newport Net Zero grant | `public/pages/newport-net-zero-grant.html` |
| Warehousing | `public/pages/warehousing.html` |
| Solar estimator | `public/pages/solar-estimator.html` |
| Roof designer | `public/pages/roof-designer.html` |

**Why they're not in the CMS:** the CMS keeps its *own* list of pages (`STATE.pages`), which
only seeds a single block-built "Home" page. The pre-built HTML pages were never imported
into the CMS data model, so the editor doesn't know they exist. They're two parallel worlds
right now. **Phase 2** imports them so they appear in — and can be edited from — the CMS.

---

## 3. Your mega-menu requests — status & plan

| # | What you asked for | Today | Plan |
|---|--------------------|-------|------|
| a | **Icon picker** — click the icon next to a menu item, pick from a library popup | ❌ menu items only edit label text; icon is hardcoded to `solar`. *(An icon picker with ~35 icons already exists for page blocks — we reuse it.)* | Phase 3 |
| b | **"Enable Mega Menu" toggle** on a top-level item → adds columns/links/excerpts/icons; otherwise pick a **page to link to** | ❌ every top item assumes a mega panel; no page-link option | Phase 3 |
| c | **Reorder rows** via click-and-drag | ❌ drag-reorder exists for page sections, not menu items | Phase 3 |
| d | **Sticky mega-menu preview** pinned at top while you scroll the editor | ⚠️ a preview exists but scrolls away with the page | Phase 3 |
| e | **Edit the image/featured panel on the right** — choose light/dark background, edit text, set button target | ❌ the `featured` panel isn't editable in the CMS at all (not even in the data model yet) | Phase 3 |

All of (a)–(e) sit in **Phase 3 (Mega-menu editor overhaul)** — but they only become *visible
on the real site* once **Phase 1** wires the nav to the CMS.

---

## 4. The roadmap

### Phase 1 — Make the mega menu CMS-driven _(foundation — unblocks everything)_
- Add the menu (+ featured panel) to the published document and have `Header.tsx` render
  from it, with the current hardcoded menu as the fallback/default seed.
- Extend the menu data model: per-item `icon` + `href`, top-item `megaEnabled` flag +
  `pageHref`, and a `featured` object `{ bg: 'light'|'dark', title, text, cta, href }`.

### Phase 2 — Bring existing pages into the CMS
- Import the 6 static `public/pages/*.html` pages into `STATE.pages` so they list in the
  editor and can be managed/edited/published from one place.

### Phase 3 — Mega-menu editor overhaul (your requests a–e)
- Icon picker popup on every menu item.
- "Enable Mega Menu" toggle → columns/links/excerpts/icons **or** a simple page link.
- Drag-and-drop reorder of top items, columns and links.
- Sticky live preview of the mega panel while editing.
- Featured-panel editor: light/dark background, text, button target.

### Phase 4 — Leads: map + CRM view _(the "maps integration" you mentioned)_
- Plot enquiries from the `enquiries` table on a **map by postcode** in the admin dashboard
  (cluster pins, filter by status/date/source).
- Turn the current sample dashboard into the **real** leads pipeline (new → contacted →
  qualified → won/lost), with export.

### Phase 5 — Publish pipeline hardening
- One "Publish" that pushes pages **and** nav/menu live together, with a draft/preview vs
  published split and a visible "last published" state.

---

## 5. What else we'll need (integrations & decisions)

- **Map provider for leads** — options: Google Maps (best geocoding, paid), Mapbox (great
  styling, generous free tier), or **Leaflet + OpenStreetMap** (free, no key). Postcode →
  lat/lng needs a geocoder (Google, Mapbox, or postcodes.io — free UK-only).
- **Domain email** — verify `heliaxis.co.uk` in Resend (currently sending from the test
  domain) before go-live.
- **Image hosting** — CMS images are embedded as data URLs today; move to Supabase Storage
  for performance as the library grows.
- **Roles & access** — multi-user admin/editor roles on top of the existing approval auth.
- **Analytics** — wire the dashboard's visitor/lead stats to a real source (Vercel
  Analytics / Plausible / GA4).
- **Go-live** — point `heliaxis.co.uk` at the new Vercel project deliberately when ready.

---

_Recommended first build: **Phase 1** (wire the nav to the CMS) immediately followed by
**Phase 3a–e**, since Phase 1 is what makes your mega-menu edits actually show up on the
site._
