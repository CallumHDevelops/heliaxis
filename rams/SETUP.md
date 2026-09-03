# Setting up Heliaxis RAMS

One-time setup. You need a Supabase account and a Vercel account.

---

## 1. Create the Supabase project

1. **supabase.com** → **New project**.
2. Name it `heliaxis-rams`, set a strong database password (save it), region
   **London / eu-west-2**.
3. Wait ~2 minutes for it to provision.

## 2. Run the schema

1. **SQL Editor → New query**.
2. Paste the whole of [`supabase/schema.sql`](supabase/schema.sql) and **Run**.

That creates every table, the row-level security policies, the two private
storage buckets and the helper functions. It is safe to re-run.

## 3. Turn off email confirmation

The gate here is *admin approval*, so email verification only adds friction.

**Authentication → Providers → Email** → turn **Confirm email** OFF → Save.

## 4. Collect the API keys

**Project Settings → API**:

| Supabase field | Environment variable |
|---|---|
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| `anon` `public` key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `service_role` key | `SUPABASE_SERVICE_ROLE_KEY` ⚠️ **secret — never commit or share** |

## 5. Set the environment variables

**Locally** — create `.env.local` in the project root (git-ignored):

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

**On Vercel** — Project → Settings → Environment Variables, all environments,
the same four with `NEXT_PUBLIC_SITE_URL=https://rams.heliaxis.co.uk`.

`NEXT_PUBLIC_SITE_URL` is what share links are built from, so it must be the
real public URL in production or the links you send out will point at the wrong
host.

## 6. Deploy and point the domain

1. Vercel → **Add New → Project** → import this repository.
2. Framework preset: **Next.js**. Nothing else needs changing.
3. Deploy, then **Settings → Domains** → add `rams.heliaxis.co.uk`.
4. In your DNS, add the `CNAME` Vercel gives you for the `rams` subdomain.

## 7. Make yourself the first admin

There is nobody to approve the *first* account, so seed it:

1. Go to **/register** on the deployed site and register with
   `callum@heliaxis.co.uk`.
2. Back in Supabase **SQL Editor**, run:

   ```sql
   update public.profiles
      set role = 'admin', status = 'approved'
    where email = 'callum@heliaxis.co.uk';
   ```

3. Sign in at **/login**. You now have **Users** in the nav and can approve
   everyone else.

## 8. Fill in the company details

Go to **Company** and complete the company name, address, registration number
and insurance. These print in the header and footer of every RAMS, so get them
right before you issue anything.

Then add your company accreditations under **Certifications** — MCS, NICEIC,
CHAS, employers' and public liability — with their PDFs and expiry dates.

---

## Roles

| Role | Can do |
|---|---|
| **Member** | Create and edit projects and RAMS, upload files, record their own certificates, submit documents for review, create share links for approved documents. |
| **Manager** | Everything a member can, plus approve and issue documents, reopen issued ones, edit company details, record other people's certificates, delete projects and documents. |
| **Admin** | Everything, plus approve new accounts and set roles. |

Nobody can approve their own document unless they are an admin — that is
deliberate, and it is what makes the approval step mean anything.

## Day-to-day

1. **Projects → New project** — site, client, access, nearest A&E, CDM details.
2. **New RAMS** from the project — choose the technology and sector.
3. Work through the builder tabs: Scope → Risk assessment → Method statement →
   PPE/plant/COSHH → Welfare & emergency → People & certificates.
4. **Submit for review**, then a manager **approves** and **issues**.
5. **Preview & PDF** to print or save; **Share links** to send a client a
   time-limited copy.
6. Record the briefing before work starts, or print the blank rows and have the
   team sign on site.

## Troubleshooting

**Everything redirects to /login.** The Supabase environment variables are
missing or wrong. The app fails closed on purpose — check them in Vercel and
redeploy.

**"Approve the document before sharing it externally."** Drafts and in-review
documents cannot be shared. Get it approved first.

**Certificate PDFs won't upload.** The `certifications` and `project-files`
buckets are created by the schema. If you created the project before running it,
run `schema.sql` again.

**Share links point at localhost.** `NEXT_PUBLIC_SITE_URL` is not set in the
Vercel environment. Set it and redeploy.
