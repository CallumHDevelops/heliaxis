# Deploying RAMS to rams.heliaxis.co.uk

RAMS follows the same pattern as **Post Studio** (`Social_Content_Creator`): one
GitHub repository, a branch whose **root is the app**, served on its own
subdomain from a Vercel *Preview* environment pinned to that branch.

- Repository: `CallumHDevelops/heliaxis`
- Branch: `claude/rams-repo-setup-f3dpf2`
- Domain: `rams.heliaxis.co.uk`
- Vercel project: the existing **heliaxis** project (no new project needed)

`main` still holds the marketing site and is untouched. This branch is not
intended to be merged into `main` — merging would overwrite the website, exactly
as it would for `Social_Content_Creator`.

---

## 1. Add the domain in Vercel

Vercel → the **heliaxis** project → **Settings → Domains → Add Domain**:

1. Domain: `rams.heliaxis.co.uk`
2. **Connect to an environment** → **Preview**
3. Branch: `claude/rams-repo-setup-f3dpf2`
4. **Add Domain**

## 2. Point the CNAME

In your DNS for `heliaxis.co.uk`, add the record Vercel shows you:

```
Type    Name    Value
CNAME   rams    cname.vercel-dns.com.
```

## 3. Environment variables — the important bit

The heliaxis Vercel project already holds the **marketing site's** Supabase
variables under the same names. RAMS uses a **separate Supabase project**, so if
you add its keys to "All Environments" you will overwrite the website's
configuration, or RAMS will connect to the website's database.

Add each variable scoped to **Preview → this branch only**:

Vercel → **Settings → Environment Variables → Add**, and for every variable:

- Environment: **Preview**
- Then choose **specific branch** and enter `claude/rams-repo-setup-f3dpf2`

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | The **RAMS** Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The RAMS `anon` `public` key |
| `SUPABASE_SERVICE_ROLE_KEY` | The RAMS `service_role` key — secret |
| `NEXT_PUBLIC_SITE_URL` | `https://rams.heliaxis.co.uk` |
| `GETADDRESS_API_KEY` | Your getAddress.io key (optional) |
| `W3W_API_KEY` | Your what3words key (optional) |

`NEXT_PUBLIC_SITE_URL` is what share links are built from. Get it wrong and the
links you send clients will point at the wrong host.

## 4. Turn off Deployment Protection for this domain

**Do not skip this.** Preview deployments are protected by default, which puts a
Vercel login wall in front of the site. Staff could sign in; **clients and
principal contractors could not open a share link** — which is the whole point
of the feature.

Vercel → **Settings → Deployment Protection → Protection Exceptions** → add
`rams.heliaxis.co.uk`.

Confirm it worked by opening a share link in a private window, signed out of
Vercel. If you see a Vercel login screen, the exception is not applied.

## 5. Deploying changes

Every push to `claude/rams-repo-setup-f3dpf2` redeploys `rams.heliaxis.co.uk`.
There is no separate release step.

---

## If you later want RAMS in its own repository

The branch root is the whole app, so extracting it is just a clone:

```bash
git clone --branch claude/rams-repo-setup-f3dpf2 --single-branch \
  https://github.com/CallumHDevelops/heliaxis.git RAMS
cd RAMS
git checkout -b main
git remote set-url origin git@github.com:CallumHDevelops/RAMS.git
git push -u origin main
```

Then point `rams.heliaxis.co.uk` at that project's **Production** environment
instead, and the Deployment Protection exception in step 4 becomes unnecessary.

---

## Troubleshooting

**rams.heliaxis.co.uk shows the marketing website.** The domain is attached to
Production, or to the wrong branch. It must be Preview + `claude/rams-repo-setup-f3dpf2`.

**A Vercel login wall appears.** Step 4 is missing.

**Everything redirects to /login and no account works.** The Supabase variables
are missing for this branch, or they are the marketing site's. The app fails
closed by design when Supabase is not configured.

**Share links point at localhost or the wrong host.** `NEXT_PUBLIC_SITE_URL` is
not set for this branch.
