# 13 · Build tickets for Sonnet

All work is in the Heliaxis app repository (`CallumHDevelops/heliaxis`), on a feature branch per ticket.

Rules for every ticket:
- One ticket per Sonnet session. Read the listed spec sections first. Match the app's existing code style (look at a neighbouring file before writing a new one). **Never add code that posts, replies, hides or deletes on any platform.**
- **Tests first** for `src/lib/social/rules/*` (keyword layer, combine rules, guardrails, template rendering).
- Done means the **Done when** list passes and `npm run lint`, `npx tsc --noEmit` and `npm run test` are green.
- New SQL goes in `supabase/social-monitoring.sql` or `supabase/social-insights.sql` (re-runnable), and is listed on the From Claude setup page like the other SQL files.
- If the spec is ambiguous, choose the more cautious behaviour, note it in `docs/social-decisions.md`, and continue.

**In** = what to read · **Out** = what to produce · **Done when** = acceptance.

## Phase 0: access and foundations

**T0.1 · Meta access** In: 02 §3–4, the existing `/api/meta/webhook`. Out: the existing Meta app gets the comment and insights permissions and Page `feed` + Instagram `comments`/`mentions` webhook fields; `META_SOCIAL_TOKEN`, `META_PAGE_ID` and `META_IG_USER_ID` set; real payloads recorded into `tests/social/payloads/`. Done when: the payloads exist; the lead-ads flow still works.

**T0.2 · Google and Trustpilot access** In: 02 §5–6. Out: the Business Profile API access request submitted (date recorded); a Pub/Sub topic; a Trustpilot key tested; findings in `docs/social-platform-access.md`. Done when: complete, or each blocked item has a date and an owner.

**T0.3 · Foundations** In: 01, 05 §1, 06 intro, `supabase/social-monitoring.sql`. Out: vitest set up with `npm run test`; a GitHub Action for lint, typecheck and tests; the SQL file added to the repo and to the setup page; the `social_monitoring` portal tick in `portals.ts` and the Users page; the Operations menu item (hidden until the SQL has run, using `schemaReady`); the new env vars on `env-check.ts`; `src/lib/social/config/*` and `tests/social/*` copied from this spec. Done when: an admin can tick a member, and the empty `/admin/social` page opens for them only.

## Phase 1: safety core

**T1.1 · Keyword layer (tests first)** In: 03 §2–3, `keywords.json`, the classifier test set. Out: `rules/normalise.ts`, `rules/keywordLayer.ts`, `npm run test:classifier -- --keyword-only`. Done when: AT-CL-01 passes; < 5 ms per comment.

**T1.2 · Combination rules (tests first)** In: 03 §5–6. Out: `rules/combine.ts` (pure). Done when: a table-driven test covers C1–C5, R1, R2, T1, T3 and the model-failure rule.

**T1.3 · Guardrails and templates (tests first)** In: 04 §1, §4–6, `guardrails.json`, `scripts.seed.yaml`, the guardrail cases. Out: `rules/{template,guardrails,similarity}.ts`, `npm run test:guardrails`. Done when: AT-GR-01 and AT-GR-02 pass.

**T1.4 · Claude classifier** In: 01 §7, 03 §4, `prompts/classifier.md`. Out: `src/lib/social/classify.ts` (model call, failure handling) and the full test-set runner writing `social_eval_run`. Done when: AT-CL-02 passes on the cheapest model that can pass it (Haiku first, 01 §7); mocked tests cover refusal, timeout and invalid output.

**T1.5 · Jobs, ingest and the read-only guard** In: 01 §1, §4–5, 02 §1–2, §8. Out: `jobs.ts` (claim with `social_claim_jobs`, retries, failed → notify admins), `/api/cron/social`, `ingest.ts` (normalise, dedupe, edits, removals, threads, posts), `readonlyGuard.ts`, `POST /api/social/mentions/manual`. Done when: replaying the recorded payloads (including a duplicate, an edit and a removal) gives the right rows; a non-GET platform call throws.

**T1.6 · Facebook and Instagram** In: 02 §3–4. Out: a new branch in `/api/meta/webhook` for `feed` and IG `comments`/`mentions` (lead-ads handling unchanged); `connectors/facebook.ts` and `connectors/instagram.ts` with 2-minute backup polling. Done when: a real test comment arrives both by webhook and by poll with the webhook off.

**T1.7 · Pipeline and notifications** In: 03 (all), 05 (all). Out: the keyword layer runs immediately after ingest; `alerts.ts` with recipients (admins + ticked members), `social_alert` dedupe, quiet hours for High, `clearSocialNotifications`, the `social` Android channel in `notify.ts`; the classify job raising severity; edit rules (03 §7). Done when: AT-P1-03 and AT-P1-05 pass; a keyword Critical calls `notify()` before the model runs.

**T1.8 · Scripts and drafts** In: 04 (all), `prompts/drafter.md`. Out: the seed loader (published v1), script selection, the `DraftChoice` call and validation, rendering with booking sentences, guardrails, the draft job. Done when: one sample mention per script drafts and passes; GoodWe gets `safety-concern` with approval required.

**T1.9 · Social API (Phase 1 routes)** In: 07 §1, §3–5. Out: mentions, drafts (approve, copy, posted, reject, edit, regenerate), attention and counts routes with access checks and audit. Done when: route tests cover the permission table in 06 §6 and the copy-gating errors.

**T1.10 · Inbox and Review screens** In: 06 §0–2, 04 §7. Out: `/admin/social` Inbox and `/admin/social/review/[id]` with every state, the Copy button, Approve (admins only), Edit with the live guardrail check, and Mark as Posted. Done when: AT-P1-07 and AT-P1-08 pass.

**T1.11 · Needs attention, badges and the help page** In: 05 §4, §6; 06 §0. Out: the dashboard panel, Operations badge, the "who has notifications on" list, and `src/content/help/social/*`. Done when: the panel cannot be collapsed while a Critical is open.

**T1.12 · Phase 1 gate** In: 12 §2. Out: `docs/acceptance/social-phase-1.md`. Done when: AT-P1-01 passes on a real phone and Cal signs it.

## Phase 2: full monitoring

**T2.1 · Trustpilot** (02 §6) · **T2.2 · Review email fallback via Microsoft 365** (02 §7, from real sample emails) · **T2.3 · Google reviews with Pub/Sub** (02 §5). Done when: each one ingests a staff test review on a preview deploy.

**T2.4 · Connection health** In: 02 §1, §9–10. Out: the per-minute health check, admin notifications, the status strip. Done when: AT-P2-03 passes.

**T2.5 · Scripts screen** In: 04 §1, §3, §8; 06 §3; 07 §6. Done when: AT-P2-05 passes.

**T2.6 · Social settings** In: `config/settings.defaults.json`, 06 §6. Out: `/admin/social/settings` (admins edit; stored in `cms_kv`). Done when: changes are validated and audited.

**T2.7 · Header booking button** In: 10 §1. Done when: AT-P2-06 passes.

**T2.8 · `/book-a-call` and quote consultations** In: 10 §2–3. Out: the call page (and `?reason=quote`), the `/book` redirect, reusing the callback code path and protections. Done when: AT-P2-07 passes and the lead appears in Operations like a callback does today.

**T2.9 · Platform reply rules check** In: 00 Q15, 04 §4, G11. Out: `docs/social-platform-reply-rules.md` and any config changes. Done when: Cal approves.

**T2.10 · SLA timers, positive digest, daily check** In: 05 §2, §5; 00 Q11–Q12. Done when: AT-P2-10 and AT-P2-11 pass.

**T2.11 · Edit learning** In: 04 §7. Done when: 3 seeded edits to one segment produce a suggestion card.

**T2.12 · Phase 2 gate: one week live** In: 12 §3. Done when: AT-P2-01 and AT-P2-02 pass and Cal signs.

## Phase 3: marketing portal

T3.1 metric catalogue + Meta snapshots · T3.2 Google and review snapshots, Search Console · T3.3 Insights API · T3.4 Insights screens (audience, reach, engagement, best times) · T3.5 feedback analytics (sentiment, topics, recurring questions, response times, reviews, bookings by channel) · T3.6 weekly summary · T3.7 CSV/PDF export · T3.8 sign-off (AT-P3-01). Specs in 08; tests in 12 §4. Daily jobs run from `/api/cron/social-daily` (Vercel cron).

## Phase 4: competitor portal (starts only after T4.1)

T4.1 legal check pack (09 §2), **signed before any collection code ships** · T4.2 competitor list and approvals · T4.3 baseline research job · T4.4 Instagram Business Discovery + manual monthly entry · T4.5 Places live display + website watcher · T4.6 review themes, opportunity cards, competitor alerts · T4.7 league table, trends, share of voice · T4.8 free SEO: Search Console, monthly manual rank form (10 searches), site health crawl + PageSpeed · T4.9 monthly AI-answer check (10 questions × 3, Claude) with the £10 limit · T4.10 monthly SEO/AI summary. Specs in 09; tests in 12 §5.

## Phase 5: hardening

T5.1 load and failure tests · T5.2 retention and erasure tools · T5.3 restore test and audit chain check · T5.4 GDPR documents (LIA, DPIA draft, privacy-notice paragraph) · T5.5 help pages and team guide · T5.6 keyword noise review 4 weeks after go-live (rules change only with Cal's written approval). Tests in 12 §6.
