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
