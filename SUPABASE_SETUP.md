# Admin login & user approval — Supabase setup

The admin login, registration, and approval flow are built. To switch them on, do the
following one-time setup (only you can — it needs your Supabase account + secret keys).

## 1. Create a Supabase project
1. Go to **supabase.com** → sign in → **New project**.
2. Name it `heliaxis`, set a strong database password (save it), region **London / eu-west**.
3. Wait ~2 min for it to provision.

## 2. Create the database tables
1. In the project, open **SQL Editor → New query**.
2. Paste the contents of [`supabase/schema.sql`](supabase/schema.sql) and **Run**.
   This creates `profiles` (users/approval), `enquiries` (leads from the quote form),
   and `cms_kv` (the CMS page-builder documents), plus security policies.
   The script is safe to re-run — if you set it up earlier, run it again to add the
   newer `enquiries` and `cms_kv` tables.

## 3. Turn off email confirmation (for now)
Our gate is *admin approval*, so email verification just adds friction.
- **Authentication → Providers → Email** → turn **Confirm email** OFF → Save.
  (You can re-enable it later if you want both checks.)

## 4. Grab your API keys
**Project Settings → API**, copy these three:
- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **service_role** key → `SUPABASE_SERVICE_ROLE_KEY`  ⚠️ *secret — server only, never share/commit*

## 5. Add the env vars
**In Vercel** (Project → Settings → Environment Variables, all environments):
```
NEXT_PUBLIC_SUPABASE_URL      = https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = eyJ...
SUPABASE_SERVICE_ROLE_KEY     = eyJ...
```
**For local testing**, create a `.env.local` in the project root with the same three lines
(this file is git-ignored). Then redeploy on Vercel so the vars take effect.

## 5b. The RAMS project — a SECOND, DIFFERENT Supabase project

Everything above belongs to **this site's** Supabase project. The subcontractor
portal at `subcontract.heliaxis.co.uk` writes into a **different** one: the RAMS
compliance platform behind `rams.heliaxis.co.uk`, which has its own schema, its
own keys and its own policies. Do not paste one project's values under the
other's names — the two sets of names are confusingly similar, and nothing about
getting it wrong is loud.

From the **RAMS** Supabase project (Project Settings → API), add to Vercel:
```
RAMS_SUPABASE_URL              = https://<rams-project-ref>.supabase.co
RAMS_SUPABASE_SERVICE_ROLE_KEY = eyJ...        # secret — server only
RAMS_APP_URL                   = https://rams.heliaxis.co.uk   # optional
```

- **Neither may ever be `NEXT_PUBLIC_`.** `NEXT_PUBLIC_` values are inlined into
  the browser bundle; the portal only talks to RAMS from the server, and
  `next.config.ts` already reads `NEXT_PUBLIC_SUPABASE_URL` to build its image
  host allowlist, so the RAMS URL must not travel under that name either.
- `RAMS_APP_URL` is optional. When set, the notification email links straight to
  the new firm's record instead of leaving the office to search for it.
- `createRamsClient()` refuses to run when `RAMS_SUPABASE_URL` equals
  `NEXT_PUBLIC_SUPABASE_URL`. The two projects are never the same one, so
  equality means somebody pasted the wrong values, and failing loudly beats
  writing an application into the marketing database.
- ⚠️ The RAMS **service_role** key bypasses row-level security across the whole
  compliance platform — every project, document and signature. Keeping it here
  widens its blast radius to this deployment: treat it as a RAMS credential,
  never log it, and **rotate it if this site is ever compromised**.
- The RAMS schema must already be applied in that project (it carries
  `public.subcontractors`, `public.subcontractor_insurances` and the private
  `subcontractor-docs` bucket). Until these variables are set, every portal
  submission is refused with an honest message and the office is emailed a
  "NOT RECORDED" alert — nothing is silently lost.

## 6. Make yourself the first admin
There's no one to approve the *first* account, so seed it:
1. Go to **/register** on the site and register with `callum@heliaxis.co.uk`.
2. Back in Supabase **SQL Editor**, run:
   ```sql
   update public.profiles
   set role = 'admin', status = 'approved'
   where email = 'callum@heliaxis.co.uk';
   ```
3. Now sign in at **/login** → you'll reach the CMS, and **/admin/approvals** to approve others.

## How it works
| Route | Who | What |
|---|---|---|
| `/register` | Anyone | Create an account → lands **pending** |
| `/login` | Registered users | Sign in; approved → `/admin`, otherwise → `/pending` |
| `/pending` | Pending users | "Awaiting approval" screen |
| `/admin` | Approved users | The CMS (protected by middleware) |
| `/admin/approvals` | Admins only | Approve / reject pending users |

New sign-ups can't access `/admin` until an admin approves them on `/admin/approvals`.
