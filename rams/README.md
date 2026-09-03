# Heliaxis RAMS

In-house Risk Assessment and Method Statement platform for Heliaxis renewable
energy installations. Registered users only, deployed at
**rams.heliaxis.co.uk**.

Covers **Solar PV**, **Battery Energy Storage**, **Air Source Heat Pumps**,
**LED Lighting** and **Small-scale Wind**, across residential and commercial
work.

---

## What it does

| | |
|---|---|
| **Projects** | Site, client, access, welfare, CDM and F10 details in one place, with file uploads for surveys, drawings, photos and permits. Every RAMS inherits them. |
| **RAMS builder** | Pick a technology and sector and the document starts pre-filled from the Heliaxis template — core hazards with 5×5 scoring, the full method sequence with hold points, PPE, plant, COSHH and legislation. Edit anything; add more from a library of ~46 hazards. Autosaves. |
| **Approval workflow** | Draft → In review → Approved → Issued → Archived. Only managers approve and issue, nobody approves their own document, and an issued document is locked as a compliance record. Revising one creates v2 and archives v1. |
| **Certifications** | Company accreditations (MCS, NICEIC, CHAS, insurance) and individual competencies (IOSH, IODH, ECS, F-Gas, IPAF, PASMA…) with issue and expiry dates and a PDF upload. Expiring and expired certificates surface on the dashboard. Attach any of them to a RAMS and they print in Appendix A. |
| **Branded reports** | One A4 report component drives the on-screen preview, the PDF export and the share page. Export is the browser's own print-to-PDF — no server-side Chromium, no extra infrastructure. |
| **Time-limited share links** | Send a client or principal contractor a link that expires after 1 hour to 90 days, optionally capped to a number of views, and revocable at any moment. Only a hash of the token is stored, and every view is logged. |
| **Briefing record** | Record who was briefed and when; the printed document carries blank rows for on-site signatures. |

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Supabase
(Postgres + Auth + Storage) · deployed on Vercel.

## Getting started

```bash
npm install
cp .env.example .env.local     # fill in your Supabase keys
npm run dev
```

Then follow [`SETUP.md`](SETUP.md) to create the Supabase project, run the
schema and seed the first admin, and [`DEPLOY.md`](DEPLOY.md) to put it live on
rams.heliaxis.co.uk.

```bash
npm run build       # production build
npm run lint        # eslint
npm run typecheck   # tsc --noEmit
```

## Layout

```
src/
  app/
    (app)/            Authenticated shell — dashboard, projects, rams,
                      certifications, company, admin
    login/ register/ pending/    Auth screens
    share/[token]/    Public, time-limited document view
  components/
    brand/            Spark and wordmark
    ui/               Buttons, fields, cards, badges
    rams/             Hazard picker, risk selects, list editors
    report/           The A4 report — used by print and share alike
  lib/
    content/          Hazard library, method templates, PPE/plant/COSHH,
                      certification catalogue, defaults
    risk.ts           5×5 scoring and banding
    share.ts          Token generation, hashing and resolution (server-only)
    db.ts             Server-side reads
supabase/schema.sql   Full schema, RLS policies and storage buckets
```

## Security model

- Every route except `/login`, `/register`, `/pending` and `/share/*` requires an
  approved account; middleware **fails closed** if Supabase is not configured.
- Row-level security is on for every table. Members read and write operational
  data; managers approve, issue and manage company records; admins manage users.
- Storage buckets are private — files are served through short-lived signed URLs.
- Share tokens are 24 random bytes; only their SHA-256 hash is stored. Expiry,
  revocation and the view cap are all checked server-side before any document
  data is loaded, and the view counter increments atomically so two viewers
  can't both slip past a limit of one.
- Draft and in-review documents cannot be shared externally.
