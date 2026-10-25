# 02 · Sources, connectors and ingestion

## 1. Connector contract

Every source is one file implementing this interface (`src/lib/social/connectors/types.ts`). Adding a platform means adding one file and one registry entry.

```ts
export type Platform = 'facebook' | 'instagram' | 'trustpilot' | 'google' | 'manual';

export interface NormalisedMention {
  platform: Platform;
  platformId: string;               // platform's comment/review id; dedupe key with platform
  platformPostId: string | null;    // post/media id the comment belongs to (null for reviews)
  postPermalink: string | null;     // link to the post
  commentPermalink: string | null;  // deep link to the comment/review if the platform offers one
  parentPlatformId: string | null;  // for replies in a thread
  kind: 'comment' | 'reply' | 'mention' | 'review' | 'tag';
  authorDisplayName: string | null;
  authorPlatformId: string | null;  // stored hashed (sha256 + pepper) for repeat-commenter detection
  authorIsOwnAccount: boolean;      // replies by Heliaxis's own Page/account: stored, never classified or alerted
  text: string;                     // plain text, emoji kept, max 10,000 chars (truncate with flag)
  rating: 1 | 2 | 3 | 4 | 5 | null; // reviews only
  createdAt: string;                // ISO 8601 UTC from platform
  editedAt: string | null;
  removedAtSource: boolean;
  raw: unknown;                     // full payload, stored in mention_raw
}

export interface ConnectorHealth {
  status: 'green' | 'amber' | 'red';
  lastSuccessAt: string | null;
  lastError: string | null;          // sanitised message, no tokens
  tokenExpiresAt: string | null;
}

export interface Connector {
  readonly source: Platform;
  /** Verify a webhook request (signature) and turn its body into zero or more raw events. */
  parseWebhook?(req: { headers: Record<string, string>; rawBody: Buffer }): Promise<RawEvent[]>;
  /** Poll for items changed since cursor. Must be idempotent and paginate fully. */
  poll(cursor: PollCursor | null): Promise<{ events: RawEvent[]; nextCursor: PollCursor }>;
  /** Fetch one item by platform id (used to resolve webhook stubs and to re-check removal). */
  fetchOne?(platformId: string): Promise<RawEvent | null>;
  normalise(event: RawEvent): NormalisedMention | null; // null = not a mention we store (e.g. a like)
  health(): Promise<ConnectorHealth>;
}
```

Health colours: **green** = last success within 2× poll interval and token valid for more than 7 days; **amber** = last success within 4× interval, or token expires in 7 days or less, or the last 3 calls hit rate limits; **red** = otherwise, or token invalid. Any transition to red, and any token within 7 days of expiry, raises a **Warning** alert to the admin. The health check runs every minute, so the brief's 5-minute limit holds.

## 2. Ingestion rules

1. Webhook handler: verify signature → insert into `ingest_event` (raw body, headers subset, received_at) → enqueue `ingest.raw` in the same transaction → return 200. If the DB is unavailable, return 503 so the platform retries (Meta retries webhooks).
2. `ingest.raw` handler: `connector.normalise(...)`, then upsert on `(platform, platform_id)`:
   - **New** → insert `mention` (version 1), insert `mention_raw`, run the classification pipeline (03).
   - **Text changed** → insert a `mention_version` row (old text), set `edited_at`, bump `version`, re-run classification, then apply the edit rules (03 §7).
   - **Removed at source** → set `removed_at_source = true`. The row is never deleted. If a draft is open, show the banner "Comment removed at source; replying may not be possible".
   - **Same content** → no-op (dedupe).
3. Each mention is tagged with its post (`post` table upsert: platform, platform_post_id, permalink, caption excerpt, created time).
4. The system's own account replies (`authorIsOwnAccount`) are stored for thread context and for "Mark as Posted" verification. They are never classified.
5. Ingestion never truncates silently: text over 10,000 chars is truncated with `text_truncated = true`, and the full text stays in `mention_raw`.

## 3. Facebook Page (Meta Graph API)

- **Access**: a Meta app owned by the Heliaxis Business Manager; a long-lived Page access token derived from a system user (non-expiring system-user token preferred). Standard Access suffices for a Page Heliaxis manages.
- **Permissions (minimum)**: `pages_show_list`, `pages_read_engagement`, `pages_read_user_content`, `pages_manage_metadata` (required to subscribe the Page to webhooks), `read_insights`. **Do not request** `pages_manage_posts` or `pages_manage_engagement`.
- **Webhooks**: Page subscription, field `feed` (comments and replies on Page posts, `item=comment`, `verb=add|edited|remove|hide`). Also `mention` for Page mentions. Verify `X-Hub-Signature-256` (HMAC-SHA256 of raw body with app secret). Handle the GET verification challenge.
- **Polling backup**: every **2 minutes**, `GET /{page-id}/feed?fields=id,created_time,permalink_url` for posts from the last 30 days, then `GET /{post-id}/comments?filter=stream&order=reverse_chronological&fields=id,from,message,created_time,parent{id},permalink_url,is_hidden&since=…`. Use the `x-business-use-case-usage` header to back off at 75% usage.
- **Fallback**: manual paste-in form (§8).
- **Verify at build time (T1.2)**: current Graph API version; whether `from` (commenter name) is returned for non-admin commenters under current privacy rules (it may be omitted, so `authorDisplayName` is nullable); webhook payload shape.

## 4. Instagram Business

- **Access**: Instagram professional account linked to the Facebook Page (Facebook Login path), reusing the same system-user token.
- **Permissions (minimum)**: `instagram_basic`, `instagram_manage_comments` (**needed to read comments; it also grants write. See 01 §6**), `instagram_manage_insights`, `pages_read_engagement`, `pages_show_list`.
- **Webhooks**: Instagram subscription fields `comments`, `mentions`. Verify `X-Hub-Signature-256`.
- **Polling backup**: every **2 minutes**: `GET /{ig-user-id}/media?fields=id,permalink,timestamp,caption` (last 30 days), then `GET /{media-id}/comments?fields=id,text,username,timestamp,replies{id,text,username,timestamp},hidden`. Mentions (captions or comments tagging @heliaxis) via `GET /{ig-user-id}/tags` and the `mentioned_comment`/`mentioned_media` fields when a webhook stub arrives.
- **Note**: Instagram comment URLs in replies are not clickable. See the booking slot rendering in 04 §4.

## 5. Google Business Profile

- **Access**: OAuth 2.0 (Google Workspace user who manages the Profile) with scope `https://www.googleapis.com/auth/business.manage`. **Requires Google's Business Profile API access approval** (T0.3 submits the form in Phase 0; approval can take weeks, so the email fallback below must work from day one).
- **Reviews**: `GET https://mybusiness.googleapis.com/v4/accounts/{a}/locations/{l}/reviews?orderBy=updateTime desc` (the reviews endpoint remains on v4). Store `starRating` → 1–5, `comment`, `reviewer.displayName`, `createTime`, `updateTime`, `reviewReply` (to know whether we've replied).
- **Real-time**: Business Profile Notifications → Cloud Pub/Sub topic (`NEW_REVIEW`, `UPDATED_REVIEW`) → push subscription to `POST /webhooks/gbp` (verify the Pub/Sub OIDC token). Polling every **15 minutes** as backup.
- **Q&A**: **not collected.** The API was discontinued on 3 Nov 2025.
- **Fallback**: parse Google's "new review" notification emails (§7).

## 6. Trustpilot

- **Access**: Trustpilot Business API: API key + secret, OAuth client-credentials (or the password grant for a business user if the plan requires it; T2.1 verifies). Business Unit id from config.
- **Reviews**: `GET /v1/private/business-units/{businessUnitId}/reviews?orderBy=createdat.desc&perPage=100` with pagination; map `stars`, `title` + `text` (concatenate as `title — text`), `consumer.displayName`, `createdAt`, `updatedAt`, `companyReply`.
- **Speed**: poll every **15 minutes**. If T2.1 finds webhook support on the Heliaxis plan, add `POST /webhooks/trustpilot` with signature verification and keep polling as backup.
- **Fallback**: parse Trustpilot "new review" notification emails (§7).

## 7. Email notification parsing (fallback for Google and Trustpilot)

- Google and Trustpilot send a "new review" email to a Heliaxis mailbox (`SOCIAL_REVIEW_MAILBOX`, e.g. `reviews@heliaxis.co.uk` on Microsoft 365; Cal to create, with an auto-forward rule if needed).
- `/api/cron/social` reads new messages from that mailbox every 5 minutes through Microsoft Graph, using the app's existing `src/lib/ms365.ts` connection (add the `Mail.Read` permission for that mailbox only).
- `reviewEmail.ts` has one parser per sender, built from **real sample emails** (T2.2). It extracts star rating, reviewer name, review text (or the excerpt, then sets `text_truncated = true`) and the review link.
- `platform_id` for email-sourced items = `email:{sha256(link or reviewer+date+excerpt)}`. When the API later returns the same review (same platform, same reviewer name, created within ±2 days, text similarity ≥ 0.8), the two are merged into the API record, keeping the earlier `received_at`.
- An email from those senders that fails to parse still creates a `manual` mention with the subject line, and notifies admins, so nothing is dropped.

## 8. Manual paste-in

`POST /api/social/v1/mentions/manual` (Reviewer+): platform, link, author display name (optional), text, rating (optional), created time (default now). Classified exactly like any other mention. Also used for platforms without a connector (Checkatrade, Nextdoor, local Facebook groups).

## 9. Rate limits and backoff (all connectors)

- Respect `Retry-After`. Otherwise exponential backoff 2s → 4s → … capped at 5 min, with ±20% jitter.
- Meta: read `x-app-usage`, `x-business-use-case-usage`; when any value is ≥ 75%, double the poll interval until it falls below 50%.
- A token or permission error (Meta code 190, Google 401/403, Trustpilot 401) turns the connector **red immediately**, with no retry storm, and raises a Warning: "Facebook token invalid: reconnect in Settings".

## 10. Connecting the sources

Keys are Vercel env vars (01 §6), listed with hints on the app's existing **/admin/setup/env** page (`src/lib/env-check.ts`), the same way every other integration in the app is set up. The Google refresh token is created once with a small admin-only "Connect Google" button that shows the token to copy into Vercel. Settings › Social Monitoring shows each connection's colour, last success and last error.
