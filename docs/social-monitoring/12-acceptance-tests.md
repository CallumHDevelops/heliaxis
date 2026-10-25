# 12 · Acceptance tests per phase

Each test has an id, steps and a pass condition. "Automated" tests run in CI. "Manual" tests are run by Cal (or a named tester) and recorded in `docs/acceptance/<phase>.md` with date, device and result.

## 1. Always-on gates (every PR, every phase)

| Id | Test | Pass |
|---|---|---|
| AT-CL-01 | `npm run test:classifier --keyword-only` over `tests/fixtures/classifier-testset.jsonl` | 100% of `must_keyword_hit` cases hit at the expected severity, and no case has a keyword severity above its `expected_severity` |
| AT-CL-02 | Full classifier (live model) over the test set. Runs on changes to keywords, prompt, combine rules or model id, and nightly | 03 §8 release-gate criteria 1–5 |
| AT-GR-01 | `npm run test:guardrails` over `tests/fixtures/guardrail-cases.jsonl` | Every case's `pass` matches `expected_pass`, and every rule in `expected_rules` fires (other rules may also fire) |
| AT-GR-02 | Every variant and example in `config/scripts.seed.yaml` (and every published script in the DB) passes the guardrails | 0 failures |
| AT-SEC-01 | CI grep for platform write calls outside `egressGuard.ts`; unit test that the egress guard rejects POST/DELETE to every platform host except the exact allow-list | 0 matches; all rejections raise `EgressForbiddenError` |
| AT-SEC-02 | Static check: no Meta/Google/Trustpilot scope outside the minimum lists in 02 is requested | pass |
| AT-DB-01 | Migrations apply on a clean Postgres 16; constraint tests: audit UPDATE/DELETE rejected; safety draft cannot reach `copied` without a matching approval hash; classification below keyword floor rejected | pass |
| AT-RULES-COV | `src/lib/social/rules` branch coverage | 100% |

## 2. Phase 1: safety core

| Id | Test | Pass |
|---|---|---|
| AT-P1-01 **(gate)** | **GoodWe end to end on a real phone.** A Vercel preview deploy connected to a Meta test Page; Cal's iPhone has the Heliaxis app on the Home Screen with notifications on (and an Android phone with the Heliaxis app). A tester posts the `goodwe-reference` text as a comment on a test post. | Critical push appears on the iPhone **≤ 60 s** after the comment is posted (measured: comment `created_time` vs device notification time, screen-recorded). The push shows platform, CRITICAL and the first 120 chars. Tapping it opens the Review screen. |
| AT-P1-02 **(gate)** | Classifier test set (AT-CL-01 + AT-CL-02) | pass |
| AT-P1-03 | Recipients: give a member the Social monitoring tick, remove it from another | The ticked member and every admin get the next Critical; the unticked member gets nothing |
| AT-P1-04 | Webhook outage: disable the webhook subscription, post a comment | The poller ingests it ≤ 2 min later and the alert fires; with the webhook re-enabled, the duplicate delivery does not create a second mention or alert |
| AT-P1-05 | Duplicate delivery: replay the same webhook twice | One mention, one notification per person (`social_alert.dedupe_key`) |
| AT-P1-06 | Model down: invalid API key in staging; post a Critical and a Medium comment | Critical still alerts within 60 s (keyword path). The Medium comment is classified High with "AI classification unavailable"; Warning to admin |
| AT-P1-07 | Draft for the GoodWe comment | Uses `safety-concern`; guardrails pass; Copy disabled until an Admin approves; approval then edit voids approval; Copy returns the text with a `src=facebook-reply` link; Mark as Posted closes the item; all of it in the audit log |
| AT-P1-08 | Member with access role cannot approve; — cannot copy | 403s, and the controls are hidden in the UI |
| AT-P1-09 | Prompt injection: post `inj-02` | Critical; draft from the script only; guardrails pass; no "100% safe" text anywhere in the draft |
| AT-P1-10 | Edited comment: post a Medium comment, let a draft generate, edit the comment to add "it caught fire" | Re-classified Critical, new alert, old draft `stale`, new safety draft requires approval |
| AT-P1-11 | iPhone not added to the Home Screen | Settings › Social Monitoring shows that person without notifications; the bell still shows the alert in the app |
| AT-P1-12 | Read-only check against the real Meta app | Egress logs over the test window show only GET requests plus the allow-listed subscription calls |

## 3. Phase 2: full monitoring

| Id | Test | Pass |
|---|---|---|
| AT-P2-01 **(gate)** | All four sources flowing: post a test review on Trustpilot and Google (staff accounts, then deleted) plus FB and IG comments | All four appear in the Inbox with the correct platform, rating and link; the connector strip is green |
| AT-P2-02 **(gate)** | **One week of live running** | Zero missed Critical items: a daily reconciliation compares platform-native notifications and emails against Inbox items, with any gap investigated; heartbeat passed 7/7 days; no unexplained red connector longer than 15 min |
| AT-P2-03 | Token expiry simulation (set `token_expires_at` to now+6 days) | Amber status and a Warning push within 5 min |
| AT-P2-04 | Email-parse fallback: disable the Trustpilot API connector, then trigger a review notification email | Mention created from the email; when the API is re-enabled, the records merge into one |
| AT-P2-05 | Scripts screen: a Member with access creates a new version of `price-objection`, an Admin publishes it; an admin publishes a safety script; an Admin tries to publish a safety script | Versions immutable; the Admin is blocked from the safety script; new drafts use the new version |
| AT-P2-06 | Booking button: two taps from any screen copies a survey link with `src=app-manual` | pass on iOS Safari PWA, Android Chrome, desktop Chrome |
| AT-P2-07 | Booking portal: book a survey via `/book/fb` | Booking record has `source=facebook-reply`; confirmation email with .ics; Ops gets an in-app notice and push; the slot is no longer offered |
| AT-P2-08 | Double booking: two browsers submit the same slot at the same time | Exactly one succeeds; the other sees nearby alternatives |
| AT-P2-09 | DST: availability on 28 March and 31 October 2027 (the UK clock-change Sundays) | Slots correct in Europe/London |
| AT-P2-10 | SLA timers: a High item ages past 4 business hours | Turns red, appears in Needs attention as OVERDUE, counted in the Insights breach stats |
| AT-P2-11 | Heartbeat failure: turn off VAPID and Firebase keys on a preview deploy | The daily check fails and admins get an email through Resend and a dashboard banner |

## 4. Phase 3: marketing portal

| Id | Test | Pass |
|---|---|---|
| AT-P3-01 **(gate)** | **Cal signs off the numbers** against Meta Business Suite, Instagram Insights, Trustpilot Business and the Google Business Profile dashboards for one 30-day window | Each metric matches the native dashboard, or the difference is explained in the tooltip (e.g. time zone, metric definition). The sign-off is recorded |
| AT-P3-02 | Unavailable metrics | Shown as "Not available from {platform} API", never 0 |
| AT-P3-03 | Weekly summary | Generated Monday 07:30; every number traceable to the digest; push sent |
| AT-P3-04 | Exports | CSV opens in Excel with correct £ and dates; PDF renders all selected sections |
| AT-P3-05 | Metric deprecation marker | A catalogue entry with `available_to` shows a "Metric changed by Meta" marker and does not join the series |

## 5. Phase 4: competitor portal

| Id | Test | Pass |
|---|---|---|
| AT-P4-01 **(gate)** | Legal check on every collection method in 09 §2 completed, with the outcome recorded in `docs/legal/competitor-collection.md` | Signed by Cal (and an adviser if used) |
| AT-P4-02 **(gate)** | Cal approves the first competitor set from the research suggestions | ≥ 6 tracked competitors approved |
| AT-P4-03 | League table | Every cell shows a value with source and date, or "Unavailable" with a reason |
| AT-P4-04 | Opportunity cards | Every card has ≥ 1 working evidence link; cards with no evidence are not shown |
| AT-P4-05 | Monthly AI-answer job and Places lookups | Spend recorded in `social_vendor_spend`; the £10 limit pauses the job and notifies admins |
| AT-P4-06 | Crawler etiquette | robots.txt respected (test against a disallowing fixture site); ≤ 1 request per 5 s per host |

## 6. Phase 5: hardening

| Id | Test | Pass |
|---|---|---|
| AT-P5-01 | Load: 500 comments in 5 minutes (synthetic) including 20 Critical | All 20 Critical notifications sent (`notify()` called) ≤ 10 s from ingest; no failed jobs. |
| AT-P5-02 | Failure injection: kill a worker mid-job; restart the DB (Multi-AZ failover) | No mention lost; jobs resume; alerts not duplicated |
| AT-P5-03 | Retention sweep on a time-travelled copy | Raw payloads older than 90 days deleted; mentions older than 24 months after close anonymised; audit chain intact |
| AT-P5-04 | Erasure request end to end | Matched records erased; the audit entry records only the reference and counts; a re-ingested comment from the same author is handled as new |
| AT-P5-05 | Audit chain verifier detects a tampered row (in a test DB with the trigger temporarily disabled) | `system.critical` raised |
| AT-P5-06 | Restore test from backup into staging | Service runs against the restored DB |
| AT-P5-07 | Team documentation | `docs/runbook.md`, `docs/reviewer-guide.md` (with the iOS setup steps) and `docs/notificationsalation.md` reviewed by Cal |
