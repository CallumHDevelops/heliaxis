# 01 · Architecture, stack and where the code goes

**Social Monitoring is built inside the existing Heliaxis app** (`CallumHDevelops/heliaxis`), not as a separate service. It reuses what the app already has:

| Need | Already in the app | Used for |
|---|---|---|
| Hosting | Next.js 16 on Vercel, region `lhr1` (London) | Pages, API routes, webhooks |
| Database | Supabase Postgres (London), service-role server access, SQL files in `supabase/*.sql` run from the "From Claude" setup page | All social tables (`supabase/social-monitoring.sql`) |
| Sign-in and access | Supabase auth; `profiles.role` (member/admin); per-person ticks in `profiles.portals` (`src/lib/portals.ts`) | A new **Social monitoring** tick decides who can see it and who gets notified |
| Notifications | `notify()` in `src/lib/notify.ts`: a bell row, Web Push (VAPID) and the Android app (Firebase) | Every social alert. No new notification system |
| Scheduled jobs | Supabase `pg_cron` + `net.http_post` calling `/api/cron/*` with `CRON_SECRET`; Vercel crons for daily jobs | The job runner and the pollers |
| Meta | Meta app with a webhook at `/api/meta/webhook` (`META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`) used for lead ads | The same app and webhook, subscribed to Page `feed` and Instagram `comments`/`mentions` |
| Claude | `@anthropic-ai/sdk`, `claude-opus-5-5` (`src/lib/assistant/run.ts`) | Classification, drafts and summaries |
| Email | Resend (sending) and Microsoft 365 via `src/lib/ms365.ts` | Heartbeat-failure email to admins; reading the review-notification mailbox |
| Booking | Survey booking engine (`src/lib/booking/*`, `/book-a-survey`, `/api/book/*`), callback requests, attribution cookie (`src/lib/attribution.ts`) | The booking button and booking links in replies (10) |
| Settings | `cms_kv` key-value store; env vars checked on `/admin/setup/env` (`src/lib/env-check.ts`) | Social settings and API keys |

## 1. How a comment flows

```
Facebook / Instagram ──webhook──▶ /api/meta/webhook (existing route, new branch for feed/comments)
Google reviews ───────Pub/Sub──▶ /api/social/webhooks/gbp
Trustpilot ───────────poll─────▶ /api/cron/social   (every minute via Supabase pg_cron; each source has its own interval)
Review emails ────────poll─────▶ /api/cron/social   (Microsoft 365 mailbox, every 5 min)
Manual paste ──────────────────▶ /api/social/mentions/manual
            │
            ▼
   social_ingest_event row saved ─▶ 200 returned
            │ after() (Next.js) – and the cron sweeps anything after() missed within 1 minute
            ▼
   normalise + dedupe ─▶ social_mention
            │
            ├─▶ KEYWORD LAYER (sync, <5 ms) ─▶ Critical/High? ─▶ notify() everyone with Social monitoring access
            │
            └─▶ social_job queue: classify (Claude) ─▶ may raise severity ─▶ notify() again if it rose to High/Critical
                                  draft (Claude picks script variants) ─▶ guardrails ─▶ draft ready in the app
```

- **The notification does not wait for the AI.** The keyword layer runs first, and `notify()` is called straight after the mention is saved.
- **Nothing is ever posted.** The draft path ends at a person who copies and pastes (§5).
- **Nothing is lost.** The raw webhook body is saved before the 200. Every job is a row in `social_job`, claimed with `FOR UPDATE SKIP LOCKED`, retried with backoff, and moved to `failed` after its last attempt (which notifies admins).

## 2. Stack (decided: matches the app)

| Concern | Choice |
|---|---|
| Framework | Next.js 16 App Router, React 19, TypeScript, Tailwind 4, Radix, lucide icons (as the app) |
| DB access | `createAdminClient()` (service role) from server code only, as the app does. RLS on, with no policies, on every social table |
| Validation | zod 4 (already a dependency) |
| Jobs | `social_job` table + `/api/cron/social` called every minute by Supabase `pg_cron`, same pattern as `whatsapp-outbox` |
| LLM | `@anthropic-ai/sdk`, `claude-opus-5-5`, structured outputs, server-side fallbacks (`prompts/*`) |
| Notifications | `notify()`, unchanged apart from a new Android channel name (05 §4) |
| Tests | The app has no test runner. Add **vitest** for `src/lib/social/rules/*` (keyword layer, guardrails, template, combine rules) and for the test-set runners. Run in a GitHub Action on every PR |

## 3. Where the code goes (in the Heliaxis repo)

```
supabase/social-monitoring.sql              # all social tables (run from From Claude › SQL)
src/lib/portals.ts                          # + 'social_monitoring' tick
src/lib/social/
  rules/normalise.ts  keywordLayer.ts  combine.ts  guardrails.ts  template.ts  similarity.ts   # pure, 100% tested
  config/keywords.json  guardrails.json  scripts.seed.yaml                                      # from this spec
  connectors/types.ts facebook.ts instagram.ts googleBusiness.ts trustpilot.ts reviewEmail.ts manual.ts
  ingest.ts  classify.ts  drafts.ts  alerts.ts  jobs.ts  readonlyGuard.ts  audit.ts  settings.ts
  insights/*  competitors/*  seo/*          # Phases 3–4
  prompts/classifier.ts drafter.ts summaries.ts
src/app/api/meta/webhook/route.ts           # + branch for Page feed and Instagram comments/mentions
src/app/api/social/**                       # app API routes (07)
src/app/api/cron/social/route.ts            # job runner + pollers (every minute)
src/app/api/cron/social-daily/route.ts      # snapshots, digest, heartbeat, retention (daily)
src/app/admin/social/                       # Inbox, review/[id], scripts, insights, competitors, settings
src/components/admin/social/*               # NeedsAttention, ConnectorStrip, CopyButton, DraftCard…
src/components/admin/BookingButton.tsx      # header booking shortcut (10)
src/content/help/social/*.md                # help pages, matching the app's help centre
tests/social/classifier-testset.jsonl  guardrail-cases.jsonl
```

## 4. Jobs

| Job (`social_job.kind`) | Started by | Retries |
|---|---|---|
| `ingest` | webhook / poller / manual | 10, backoff from 30 s |
| `classify` | ingest | 5, then the model-failure rule (03 §6) |
| `draft` | classify | 5, then "Write manually" |
| `poll:{source}` | `/api/cron/social`, by interval: Facebook and Instagram 2 min (backup to webhooks), Trustpilot and Google 15 min, review mailbox 5 min | next interval |
| daily jobs | `/api/cron/social-daily` (Vercel cron, 02:15) | next day |

`/api/cron/social` takes jobs in batches of 10, within a 50-second budget per call, so it stays inside Vercel's function limit.

## 5. Read-only on the platforms

Meta's comment permission also allows replying and deleting (00 §C), so read-only is enforced in code: every social platform call goes through `src/lib/social/readonlyGuard.ts`, which only allows GET. The single exception is the one-off webhook subscription call (`POST /{page-id}/subscribed_apps`). A CI check fails the build if social code calls a platform write endpoint. The existing lead-ads code is not touched.

## 6. Keys (Vercel env vars, listed on /admin/setup/env)

The existing `META_APP_SECRET` and `META_WEBHOOK_VERIFY_TOKEN` are reused, plus:

| New variable | For |
|---|---|
| `META_SOCIAL_TOKEN` | System-user token with the comment and insights permissions (02 §3) |
| `META_PAGE_ID`, `META_IG_USER_ID` | Which Page and Instagram account to watch |
| `GOOGLE_BP_CLIENT_ID`, `GOOGLE_BP_CLIENT_SECRET`, `GOOGLE_BP_REFRESH_TOKEN`, `GOOGLE_BP_LOCATION` | Google reviews |
| `TRUSTPILOT_API_KEY`, `TRUSTPILOT_API_SECRET`, `TRUSTPILOT_BUSINESS_UNIT_ID` | Trustpilot reviews |
| `SOCIAL_REVIEW_MAILBOX` | The Microsoft 365 mailbox that receives Google/Trustpilot review emails |
| `SOCIAL_AUTHOR_PEPPER` | Hashing commenter ids for repeat-commenter detection |

## 7. Model usage

**Lowest-cost model that passes the tests.** Classification and drafting use `claude-haiku-5-5`, the cheapest model, **only if it passes the full classifier test set (AT-CL-02) and the draft tests**. If it fails, move up to `claude-sonnet-5-5`, then `claude-opus-5-5`, and record the result in `docs/social-decisions.md`. Safety does not depend on the model choice: the keyword layer always runs first and the AI can only raise severity. Weekly and monthly summaries and the AI-answer check use `claude-sonnet-5-5`. All calls use structured outputs; `fallbacks: "default"` with `server-side-fallback-2026-07-01` where the model supports it; `refusal` and `max_tokens` treated as failures; no `temperature`. Model ids live in one config file. Prompt caching on the fixed system prompts. Expected cost at Heliaxis's volume: under £1 a month with Haiku, a few pounds with Opus.
