# Deploying RAMS to rams.heliaxis.co.uk

RAMS lives in its own repository, **CallumHDevelops/RAMS**, and is served from
its own Vercel project on the **Production** environment.

Production custom domains are publicly accessible by default on every Vercel
plan — Standard Protection only covers preview deployments and generated URLs.
That matters here: share links go to clients and principal contractors who have
no Vercel account, so the site the links point at must be reachable without
signing in. Serving RAMS from a *preview* domain would put a Vercel login wall
in front of it, and the Protection Exception that removes it is Enterprise-only
or a paid Pro add-on. Production avoids that entirely, for free.

---

## 1. Create the repository

On GitHub: **New repository** → `RAMS`, owner `CallumHDevelops`, **Private**,
and **do not** add a README, .gitignore or licence — it must be empty.

## 2. Push the code

The app currently sits in `rams/` on the `claude/rams-repo-setup-f3dpf2` branch
of the heliaxis repo. `scripts/split-into-own-repo.sh` extracts it with its
history intact:

```bash
# from the root of a heliaxis checkout, on that branch
bash rams/scripts/split-into-own-repo.sh git@github.com:CallumHDevelops/RAMS.git
```

It prints the path of a ready-to-push clone. Review it, then push.

Afterwards `rams/` can be removed from the heliaxis branch — the history is
preserved in the new repository.

## 3. Create the Vercel project

Vercel → **Add New → Project** → import `CallumHDevelops/RAMS`.

- Framework preset: **Next.js** (detected automatically)
- Root directory: leave as the repository root
- Nothing else needs changing

## 4. Environment variables

Vercel → the RAMS project → **Settings → Environment Variables**. Add each for
**all environments**. This is a separate project from the marketing site, so
there is no risk of clashing with its variables of the same name.

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | The RAMS Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The RAMS `anon` `public` key |
| `SUPABASE_SERVICE_ROLE_KEY` | The RAMS `service_role` key — secret, server only |
| `NEXT_PUBLIC_SITE_URL` | `https://rams.heliaxis.co.uk` |
| `GETADDRESS_API_KEY` | getAddress.io key (optional — address autocomplete) |
| `W3W_API_KEY` | what3words key (optional — auto three-word addresses) |

`NEXT_PUBLIC_SITE_URL` is what share links are built from. Get it wrong and the
links you send to clients point at the wrong host.

The two optional keys can be added later; without them the address and
what3words fields simply stay manual.

## 5. Add the domain

Vercel → the RAMS project → **Settings → Domains → Add Domain**:

- Domain: `rams.heliaxis.co.uk`
- **Connect to an environment → Production**

Then add the DNS record Vercel shows you:

```
Type    Name    Value
CNAME   rams    cname.vercel-dns.com.
```

No Deployment Protection changes are needed. Production domains are public by
default, which is what share links require.

## 6. Set up the database

Follow [`SETUP.md`](SETUP.md): create the Supabase project, run
`supabase/schema.sql`, turn off email confirmation, then register at `/register`
and run the one SQL statement that makes you the first admin.

## 7. Verify

1. Open `https://rams.heliaxis.co.uk` — you should get the sign-in screen.
2. Sign in, create a project and a RAMS, approve and issue it.
3. Create a share link, then **open it in a private window while signed out of
   both Vercel and RAMS**. You should see the document, not a login page.

That last check is the one that matters — it is what your clients will do.

---

## Deploying changes

Every push to `main` in the RAMS repository deploys to production. Pushes to any
other branch produce a preview deployment, which stays protected — that is the
correct behaviour, and it does not affect the live domain.

## Troubleshooting

**Everything redirects to `/login` and no account works.** The Supabase
variables are missing or wrong. The app fails closed by design when Supabase is
not configured, so it will never accidentally serve unprotected.

**A Vercel login wall appears on the live domain.** The domain is attached to
Preview rather than Production, or Deployment Protection has been set to "All
Deployments". Production must be public for share links to work.

**Share links point at localhost or the wrong host.** `NEXT_PUBLIC_SITE_URL` is
not set in the Vercel environment.

**Address autocomplete does nothing.** `GETADDRESS_API_KEY` is not set, or the
plan's rate limit has been hit. The fields still accept typed input.

**Certificate uploads fail.** The `certifications` and `project-files` storage
buckets are created by `supabase/schema.sql`. If the Supabase project predates
running it, run the script again — it is idempotent.
