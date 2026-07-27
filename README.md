# Heliaxis Post Studio

An on-brand social post generator for Heliaxis. Next.js (App Router) + Supabase auth + a server-side Claude proxy. Built to hand to a marketing agency: they log in, generate posts, download PNGs, and shared history stops anyone posting the same thing twice.

## What's inside

- **Login / Register** — Supabase email + password. Protected routes via `middleware.ts`.
- **The Studio** — the canvas post tool: 8 templates, 4 sizes, 3 themes, cross-hatch toggle, photo backgrounds, click-to-edit, live caption + hashtags, PNG export.
- **Generate with Claude** — calls `/api/generate`, a **server** route that holds your Anthropic key. The key is never sent to the browser.
- **Shared history** — every generated/saved post is stored in Supabase and shown to all users, with Claude told to avoid repeating recent posts.

## Prerequisites

- Node 18.17+
- A Supabase project
- An Anthropic API key (console.anthropic.com)

## 1. Fonts and logos (required)

- Put the Ezra `.otf` files in `/fonts`:
  `Ezra_Black.otf`, `Ezra_ExtraBold.otf`, `Ezra_Bold.otf`, `Ezra_Medium.otf`
  (see `fonts/README.txt`). Without these the build will fail — Ezra is self-hosted.
- The logos are already in `/public` (`heliaxis-logo.png`, `heliaxis-logo-light.png`).

## 2. Supabase

1. Create a project at supabase.com.
2. SQL editor → paste and run `supabase-setup.sql` (creates the `posts` table + policies).
3. Authentication → Providers → keep **Email** enabled.
4. Authentication → URL Configuration → add your site URL and
   `https://YOUR-DOMAIN/auth/callback` as a redirect URL.
5. Project Settings → API → copy the **Project URL** and **anon public** key.

## 3. Environment variables

Copy `.env.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
ANTHROPIC_API_KEY=sk-ant-...        # server-side only, never NEXT_PUBLIC
ANTHROPIC_MODEL=claude-sonnet-5
```

## 4. Run locally

```bash
npm install
npm run dev
# http://localhost:3000  → redirects to /login
```

## 5. Deploy to Vercel

1. Push this repo to GitHub.
2. Import it in Vercel.
3. Add the four environment variables (Project → Settings → Environment Variables).
   **`ANTHROPIC_API_KEY` must NOT be prefixed with `NEXT_PUBLIC`** — that's what keeps it server-side.
4. Deploy. Then point your CNAME/subdomain at the Vercel project (Project → Settings → Domains).
5. Add the final domain to Supabase's redirect URLs (step 2.4).

## Handing it to your agency

- Create their accounts (Authentication → Users → Invite), then in
  Authentication → Providers turn **off** public sign-ups so `/register` can't
  create new accounts.
- They sign in, generate, download. History is shared across everyone.

## Security notes

- The Anthropic key lives only in Vercel's server environment. The browser never sees it.
- `/api/generate` refuses requests from anyone who isn't signed in.
- Row Level Security is on; only authenticated users can read/write history.
- If you want per-user (not shared) history, add an `org_id`/`created_by` filter
  to the select policy in `supabase-setup.sql`.

## Extending

- More templates: add to `TEMPLATES` in `lib/postEngine.ts` (add render handling if the layout is new).
- Batch mode, scheduled posts, direct publishing: all natural next steps — the engine and history table are ready for them.
