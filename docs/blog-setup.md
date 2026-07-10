# Heliaxis Blog — setup notes

## Public site (done)

- `/blog` — index with featured + list + category filters
- `/blog/[slug]` — article + related + CTA band
- `/blog/category/[slug]` — filtered index
- Mock posts in `src/data/blog-mock.ts` until Sanity is connected
- DIY visibility: `published` or (`scheduled` and `publishAt <= now`)

## Admin

- `/admin/blog` — list posts + AI create form
- Dashboard → Site & admin → **Blog**
- AdminShell nav includes Blog

## Connect Sanity (Free)

1. Create a project at [sanity.io](https://www.sanity.io)
2. Add schema fields from `sanity/schemaTypes.ts` (category + post) in Sanity Studio
3. Categories are auto-seeded on first save (solar, battery, funding, business, home)
4. Set env vars (see `docs/blog-env.md`)
5. Create an API token with write access → `SANITY_API_TOKEN`

Public queries only return `published` or due `scheduled` posts. Drafts are never fetched on the public CDN client.

## RSS

- `/blog/rss.xml`

## Connect AI (OpenRouter)

1. Set `OPENROUTER_API_KEY`
2. Optional: `AI_MODEL`, `AI_BASE_URL`
3. Later: point `AI_BASE_URL` + `AI_API_KEY` + `AI_MODEL` at Claude or OpenAI — same `generateBlogPost()` module

## Live preview

- **Unsaved AI draft:** on `/admin/blog`, after Generate, click **Live preview** — opens the real article layout in a new tab (admin-only).
- **Saved post (any status):** click **Preview** in the post list → `/admin/blog/preview/[slug]`
- **Public URL:** **Live** only works when the post is published or the schedule is due

Preview pages are not indexed and show a banner so you know visitors cannot see drafts.

## Flow

Admin prompt → `/api/blog/generate` → review / edit / **Live preview** → `/api/blog` POST → Sanity → public `/blog` (ISR 60s + revalidate on save)

## Scheduled posts

Public site already shows `scheduled` posts once `publishAt <= now`. Optional cron flips them to `published` for cleaner Studio status:

- `GET /api/blog/publish-due` (every 15 min via `vercel.json`)
- Protect with `CRON_SECRET` (or `BLOG_CRON_SECRET`) — Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when configured
- In local dev without a secret, the route is open
