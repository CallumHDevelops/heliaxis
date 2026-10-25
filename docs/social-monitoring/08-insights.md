# 08 · Marketing analytics (Insights)

Answers three questions: **is the audience growing, is content reaching people, and what are people saying.**

## 1. Rules

1. **Daily snapshots of every metric** into `metric_snapshot (date, platform, account_id, scope ['account'|'post'], object_id, metric, value, source_api, api_metric_name, collected_at)`. History is ours, not limited by a platform's retention window.
2. **Never invent a proxy.** If a platform does not provide a metric, the UI shows "Not available from {platform} API". The `metric_catalogue` (§2) is the single source of truth.
3. **Never splice series.** When Meta renames or replaces a metric with a different methodology (e.g. impressions → views), the new metric is a **new catalogue entry**, and charts show a vertical "Metric changed by Meta on {date}" marker instead of joining the lines.
4. Every figure has a tooltip showing its source API, metric name and collection time.
5. Synthetic mentions are excluded everywhere.
6. Date ranges: 7, 30, 90 days and custom. "Compare to previous period" compares with the same-length period immediately before. Platform filter. All times Europe/London.
7. Charting: the app's existing charting library (T0.1). Fallback if the app has none: Recharts.

## 2. Metric catalogue (seed; T3.1 verifies every API name against current docs)

| Key | Facebook Page | Instagram | Trustpilot | Google BP | Notes |
|---|---|---|---|---|---|
| `followers` | `page_follows` (follows, replaced `page_fans` Nov 2025) | `followers_count` (account field, snapshot daily) | — | — | |
| `followers_net_change` | derived from daily `followers` | derived | — | — | derived = computed by us from our own snapshots |
| `views` | `page_media_view` (verify) | `views` | — | Performance API `BUSINESS_IMPRESSIONS_*` (sum of desktop/mobile, maps/search) | "Views" is **not** the old "impressions"; label clearly |
| `reach_unique` | `page_total_media_view_unique` (from Jun 2026; earlier `page_impressions_unique` kept as a separate retired entry) | `reach` | — | — | |
| `profile_visits` | — (not available) | `profile_views` (verify availability) | — | — | |
| `link_clicks` | — (not reliably available for organic) | `website_clicks` (verify) | — | `WEBSITE_CLICKS` | |
| `calls_from_profile` | — | — | — | `CALL_CLICKS` | |
| `post_reactions` / `likes` | post `reactions` summary | media `like_count` | — | — | |
| `comments` | from our own mention table (authoritative) and the post `comments.summary` | `comments_count` | — | — | |
| `shares` | post `shares` | media insight `shares` | — | — | |
| `saves` | — | media insight `saved` | — | — | |
| `engagement_rate` | derived: (reactions + comments + shares) ÷ `reach_unique` per post | derived: (likes + comments + shares + saves) ÷ `reach` | — | — | formula shown in tooltip; not shown when reach is unavailable |
| `rating_avg` | — | — | from stored reviews | from stored reviews | computed from our own review records |
| `review_count` | — | — | from stored reviews | from stored reviews | |
| `review_reply_rate` | — | — | % with `companyReply` | % with `reviewReply` | |
| `organic_vs_paid` | — | — | — | — | Brief asks for "split by organic". **We report organic only**; ad data is out of scope (no ads API access). Label: "Organic only". |

Content type per post: `video | image | carousel | text | reel | story` (from platform fields). Stories are only available for 24 h through the API, so the collector polls active stories every 6 h.

## 3. Collection jobs

| Job | Schedule | What |
|---|---|---|
| `metrics.snapshot.facebook` | daily 02:15 | Page metrics for yesterday; post metrics for posts < 90 days old |
| `metrics.snapshot.instagram` | daily 02:20 + stories every 6 h | account and media insights |
| `metrics.snapshot.google` | daily 02:30 | Performance API daily metrics (they arrive with a delay of a few days, so the job re-fetches the last 7 days and upserts) |
| `metrics.snapshot.reviews` | daily 02:40 | rating/count/reply-rate from our stored reviews |
| `metrics.backfill` | on first connect | maximum history each API allows (Meta: up to 2 years for some metrics) |

All jobs upsert on `(date, platform, account_id, scope, object_id, metric)`, so they are safe to re-run.

## 4. Views and their calculations

**Audience and reach**: followers per platform (line), net change (bar), growth rate = net change ÷ followers at period start; views, reach, profile visits and link clicks (lines, with the unavailable notes); best and worst 5 posts by reach and by engagement rate (minimum reach 50 to qualify, to avoid tiny-denominator noise).

**Best posting days and times**: a 7×24 heatmap of the median engagement rate by publish hour (Europe/London), using our own post history; minimum 30 posts in the window, otherwise "Not enough posts yet (n/30)". Hours with fewer than 3 posts are greyed out.

**Engagement**: likes/reactions, comments, shares and saves per post and per platform; engagement rate; content type comparison (median engagement rate by type, with n shown).

**Feedback on comments** (from our own `mention`/`classification` data):
- Sentiment split over time (stacked area, weekly).
- Topic breakdown (bar).
- **Top recurring questions**: weekly job clusters `is_question = true` mentions from the last 90 days (Claude, structured output: `{cluster_label, mention_ids[], suggested_script_id | null}`), with ≥ 3 mentions per cluster. Each cluster links to the script that answers it, or shows "No script yet" with a "Create script" button (prefills topics and two examples).
- **Response metrics**: median time from `received_at` to `posted_at`, % of non-Ignore mentions reaching Posted or Dismissed, SLA breaches by severity, and the % of Critical acknowledged within 15 minutes.
- **Reviews**: Trustpilot and Google average rating, rating trend (rolling 90 days), volume per month, reply rate.

**Bookings by channel**: survey bookings and callback requests whose attribution has `utm_medium=social-reply` or `review-reply`, by `utm_source`, read from the app's existing booking and lead records (10 §4); conversion = those bookings ÷ replies posted on that platform.

## 5. Weekly summary

- Job `weekly.summary` every **Monday 07:30 Europe/London**, covering Monday–Sunday of the previous week.
- Input to Claude (prompt `prompts/weekly-summary.md`): a JSON digest computed by code. **The model receives numbers, not raw comments**: KPI values and previous-week values, the top changes (computed in code as the largest relative changes with an absolute floor), topic counts, SLA stats, review stats, and recurring-question clusters (labels and counts only).
- Output (structured): `{ headline_numbers: [{metric, value, change}] (exactly 4), biggest_changes: [{metric, change, explanation}] (exactly 3), actions: [{action, why, linked_metric}] (exactly 3) }`. Every number in the output must exist in the input digest. Code checks this: any number not found in the digest → regenerate once, else publish the code-built tables with no prose and a note.
- Shown as a card at the top of Insights and stored in `weekly_summary`. Push to an admin (silent) "Your weekly social summary is ready".

## 6. Export

- **CSV**: the current view's underlying rows, UTF-8 with BOM (for Excel), ISO dates.
- **PDF**: the browser's print-to-PDF on a print stylesheet (as the app's other reports do), A4; includes the date range, filters, the generated-at time and source notes. Stored in S3 (eu-west-2) for 7 days.
