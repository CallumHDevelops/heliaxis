# Metis Desktop

Windows desktop app for Metis, the Heliaxis assistant. It is the same Metis as in HAP: the same threads, the same drafts and
the same system prompt. It signs in with your normal HAP login and talks to HAP's `/api/desktop/*` routes. The Anthropic key
and the Supabase service role key stay on the server; the app never has them. Anything Metis makes here (quotes, design
packs, contract packs, tasks, drafts) appears in HAP straight away, and the other way round.

Built with Electron (not Tauri): Electron needs only Node to build, the Rust and MSVC toolchain Tauri needs is not installed
here, and Electron has an NSIS installer, auto-update, global hotkey and tray built in.

## What it does

- `Ctrl+Shift+H` shows or hides Metis (change it in Settings; if Windows will not register it, a banner and a dialog say so).
- Tray icon: Open, New chat, Settings, Quit. Optional start with Windows.
- A quick-ask bar that grows into a full chat with a chats sidebar (new, rename, archive, search).
- Enter sends, Shift+Enter new line, Esc hides, Ctrl+N new chat.
- Cards for what Metis made, with Open quote, Open file, Open design, Open in HAP. Files are fetched with your own sign-in.
- Nothing is sent to a customer from here: emails and messages are drafts; quotes are drafts; a person presses Send in HAP.

## Run in development

```powershell
cd desktop
npm install
node node_modules/electron/install.js   # only if npm skipped Electron's download script
npm start                               # add --hidden to start in the tray
```

By default it talks to `https://heliaxis.co.uk`. To use a local HAP (`npm run dev` in the repo root), set **Settings → HAP
address** to `http://localhost:3000`. Settings are in `%APPDATA%\Metis\settings.json`; your sign-in (a refresh token) is
encrypted with Windows DPAPI in `session.bin` beside it and is never written in plain text.

Automated tests must not open real programs. Set `METIS_TEST_NO_OPEN=1` when driving the app from a script: "Open file" and
"Open in HAP" then do nothing outside the app.

## Build the installer

```powershell
cd desktop
npm install
npm run dist          # NSIS installer: dist\Metis-Setup-<version>.exe and dist\latest.yml
npm run pack          # an unpacked copy in dist\win-unpacked, for a quick look
```

Raise `version` in `desktop/package.json` for every release: installed copies only update to a higher version.

**Signing.** An unsigned installer works, but Windows SmartScreen will warn. To sign it, set the certificate before building:

```powershell
$env:CSC_LINK = "C:\path\to\certificate.pfx"      # or a base64 string
$env:CSC_KEY_PASSWORD = "the password"
npm run dist
```

and add `"publisherName": ["Heliaxis Limited"]` under `build.win` in `package.json` so updates verify the publisher. The
certificate is not in this repository and must not be.

## Mac

The app is cross-platform: on a Mac it uses the menu bar, the Keychain for your sign-in, vibrancy instead of Mica, and an Edit
menu so copy and paste work. A Mac app can only be built on a Mac, so either run this on one:

```bash
cd desktop && npm ci && npm run dist:mac     # dist/Metis-<version>-mac.dmg and a .zip for auto-update
```

or use GitHub: **Actions → Metis Desktop → Run workflow** builds Windows and Mac together (and on a pushed tag `metis-v0.2.0`).
It is untested on a Mac so far: the first build there is the first real check.

To give Mac users no warnings it needs an **Apple Developer** account (paid, yearly): create a *Developer ID Application*
certificate, then add `MAC_CSC_LINK` (base64 `.p12`), `MAC_CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and
`APPLE_TEAM_ID` as repository secrets and the workflow signs and notarises it. Mac auto-update only works for a signed app.
Unsigned, users right-click the app and choose **Open** the first time. iPhone and iPad already use HAP from Safari's
Add to Home Screen (see the App page), including Metis at `/admin/assistant`.

## Publishing, and the App page

HAP's **App** page (`/admin/app`) has a *Metis for your computer* card that reads the published version and offers the download.
The files are not in the site (the installer is about 100 MB): they live in a public storage folder, and a new version is just a
new upload, never a new deploy.

1. The files go in a public **Vercel Blob** store (`metis-desktop-releases`), because Supabase Storage caps uploads at 50 MB on
   the free plan and the installer is about 100 MB. Copy the store's token from Vercel → Storage → metis-desktop-releases →
   `.env.local` (`BLOB_READ_WRITE_TOKEN`).
2. Build, then upload: set `BLOB_READ_WRITE_TOKEN` in your terminal and run `npm run publish` (installers first, the
   `latest*.yml` files last). The workflow's *publish* step does the same from GitHub with the token as a repository secret.
   (If your Supabase plan allows big files you can publish there instead with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.)
3. `METIS_UPDATE_URL` in Vercel is the folder the files are in, e.g.
   `https://<store>.public.blob.vercel-storage.com/metis-desktop`; the script prints it when it finishes. That one address
   feeds the App page download **and** the in-app auto-update. Set `METIS_SIGNED=1` once the installers are signed, to hide the
   "not code-signed" note. Changing an environment variable needs a redeploy to take effect.

## Auto-update

An installed copy checks for updates 30 seconds after it starts and every four hours, downloads quietly, and installs when
Metis is next quit or when you press **Restart to update**. It asks HAP where to look, so the address can change without a new
build:

| HAP environment variable | Meaning |
|---|---|
| `METIS_UPDATE_URL` | A folder served over HTTPS that holds `latest.yml` and the installer, e.g. a public Supabase Storage bucket. |
| `METIS_MIN_VERSION` | The oldest version HAP still supports. Older copies show "update required". |

To release: build, then upload `dist\latest.yml` and `dist\Metis-Setup-<version>.exe` to the folder at `METIS_UPDATE_URL`
(upload the installer first, `latest.yml` last).

## Adding a product to the price book

Metis prices quotes and checks designs from the `price_book` table (`supabase/price-book.sql`). A price or a datasheet figure
that is missing is never guessed: Metis shows a PRICE REQUIRED line, or reports the figure as missing, and asks you.

Add a product in either of two ways:

1. **By asking Metis** (admins only): tell her the product and its price and datasheet figures and say "save it". She uses
   `save_product`. She only saves figures you gave her and never replaces an existing price with a blank.
2. **In Supabase**, one row per product:

```sql
insert into public.price_book (sku, category, make, model, cost_pence, sell_pence, specs, datasheet_url) values
 ('ACME-400', 'panel', 'Acme', '400 W panel', 8000, 10000,
  '{"wp":400,"voc":37.4,"vmp":31.3,"isc":13.6,"imp":12.8,"temp_coeff_voc_pct":-0.27,"width_mm":1134,"height_mm":1722}',
  'https://example.com/acme-400.pdf');
```

Prices are whole pence and may be null. `category` is one of panel, inverter, battery, mounting, cable, isolator, comms, meter,
accessory, labour, other. The datasheet figures Metis needs (all optional, all snake_case):

- **panel:** `wp, voc, vmp, isc, imp, temp_coeff_voc_pct, width_mm, height_mm`
- **inverter:** `ac_kw, max_dc_v, mppt_min_v, mppt_max_v, mppt_count, max_input_current_a, max_isc_a, max_pv_kw, battery_min_v, battery_max_v, max_charge_kw, max_discharge_kw, off_grid_capable, generator_input`
- **battery:** `usable_kwh, nominal_v, max_charge_kw, max_discharge_kw`

Settings Metis reads (table `pv_settings`, admin-write): `pricing` (`markup_pct`, `min_margin_pct`, `labour_sell_day_gbp`,
`labour_cost_day_gbp`, `workmanship_warranty_years`, and `vat` as `{"domestic":{"default":20,"by_category":{"panel":0}},"commercial":{"default":20}}`;
the quote builder supports VAT rates of 0, 5 and 20), `scaffolding`, `design.layout` (`edge_mm`, `gap_mm`, `min_temp_c`,
`default_panel_sku`) and `kits` (the accessory kit for a product, saved by Metis or an admin).

## Adding a template

Document templates are code in `src/lib/templates/seed/` (one file per family: `solar-battery.ts`, `heat-pump.ts`,
`off-grid.ts`). A template is plain data: a code like `HX-XX-01`, a title, and sections of fields, text and signature lines.

1. Add the template to a seed file (or a new one) and list it in `src/lib/templates/registry.ts`.
2. Add its code to `ISSUE` in `src/lib/documents/issue.ts` (its issue, raised when the wording changes).
3. Set `tech` to the products it belongs to. Use `['offgrid']` for a template that is only made by Metis and never offered by product.
4. Wording that needs a solicitor sets `legalReview: true`. Until an admin approves the exact wording at
   **/admin/legal-templates** it prints "DRAFT — awaiting legal review" and cannot be signed. Changing a word withdraws the approval.
5. Add a test that validates it (`validateTemplate`) and, for legal wording, records its fingerprint
   (see `tests/contracts/offgrid-templates.test.ts`), so a change to the wording is always deliberate.

If Metis should fill it in, add a builder for its answers (see `src/lib/contracts/offgrid.ts`) and a tool (see
`src/lib/assistant/contract-tools.ts`). Metis supplies variables only: names, addresses, the system, prices, dates. She never
writes or changes a clause, and cannot sign or approve anything.

## Database changes to run in Supabase

Additive and safe to re-run. Metis tells you if one is missing.

| File | For |
|---|---|
| `supabase/assistant-threads-v2.sql` | Naming chats (rename). |
| `supabase/price-book.sql` | The price book. |
| `supabase/quote-versions.sql` | Quote versions, so a change never overwrites the old quote. |

## Phase 2 (designed for, not built)

Push-to-talk voice (local Whisper or Windows speech, not the browser's Web Speech API), dragging files and photos onto a
customer, and tray notifications from HAP's `notifications` table. The main process already owns the session and the window, so
each is a new IPC channel and a new server route; nothing about the current design needs to change.
