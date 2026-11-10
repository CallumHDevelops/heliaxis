# ProspectPV database

Sales › ProspectPV (`/admin/sales/prospectpv`). Every table, function and policy here is prefixed `pv_`, so nothing clashes with the rest of the admin.

## Already applied to the live Heliaxis project (10 Nov 2026)

These files are the exact SQL that was applied, in this order, as Supabase migrations of the same names:

| File | Migration name | What it does |
| --- | --- | --- |
| `20261109120000_prospectpv_schema.sql` | `prospectpv_schema` | 17 `pv_` tables, PostGIS (in the `extensions` schema) |
| `20261109120100_prospectpv_rls.sql` | `prospectpv_rls` | Roles and row level security (see below) |
| `20261109120200_prospectpv_functions.sql` | `prospectpv_functions` | Landing page, booking, opt-out, re-mail and spend functions |
| `20261109120300_prospectpv_seed.sql` | `prospectpv_seed` | Default settings, packages, extras, templates. All prices and rates are blank `[TBC]` |
| `20261110090000_prospectpv_admin.sql` | `prospectpv_admin` | Manual letters, scaffolding settings, brand-image bucket `prospectpv-assets` |
| `20261110120000_prospectpv_map.sql` | `prospectpv_map` | Drawn-area campaigns, `map` and `ranking` settings, area functions |
| `20261110130000_prospectpv_revoke_anon_helpers.sql` | `prospectpv_revoke_anon_helpers` | Signed-out visitors can no longer call the role helpers |
| `20261110140000_prospectpv_package_image.sql` | `prospectpv_package_image` | `pv_packages.image_path`: a picture per package for the letter |

Nothing needs running again. Keep the files so a new environment can be built from them.

## Who can do what

Roles come from `public.profiles`, the same users database as the rest of the admin, and `src/lib/prospectpv/server/auth.ts` applies the same rule in the app:

- **ProspectPV admin**: an approved `admin`. Can change packages, extras, settings, brand images and spend caps.
- **ProspectPV staff**: an approved admin, or an approved member with the **CRM** portal ticked in `/admin/users` (Sales lives under CRM). Can use the map, create letters and read everything.
- Nobody else, and nobody signed out, can read or write any `pv_` table. The public letter page and opt-out use security-definer functions that only the server's service role can call.

## Environment

Already set in Vercel and used as-is: `OS_DATAHUB_KEY` (OS Places search and counts, map tiles), `GOOGLE_SOLAR_API_KEY` (used from Phase M3), `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

To add: `PROSPECTPV_PUBLIC_BASE_URL` (for example `https://heliaxis.co.uk`), used for the QR link printed on each letter; letters can't be created without it. Optional: `PROSPECTPV_OS_TILE_LAYER` (`Light_3857` default, `Road_3857`, `Outdoor_3857`) and `PROSPECTPV_LEADS_WEBHOOK_URL`.

## Tests

```
npm test                                   # unit tests, including src/lib/prospectpv/*.test.ts
./supabase/prospectpv/tests/run.sh         # SQL checks; needs Postgres with PostGIS (header explains PSQL=…)
PVTEST_DATABASE_URL=… npm run test:prospectpv:int   # actions and pages against a database with the migrations
npm run test:prospectpv:browser            # the Map screen in Chromium
npm run test:prospectpv:e2e                # real actions through PostgREST (header of tests/prospectpv/e2e/run.sh)
```

The test database uses a simple stand-in for roles (`tests/00_test_jwt_roles.sql`) so tests can act as different users; `prospectpv_profiles_roles.sql` tests the real mapping onto `profiles`.
