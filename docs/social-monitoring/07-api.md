# 07 · API routes and payloads

Next.js route handlers in the Heliaxis app under `/api/social/*` (paths below drop the old `/api/social/v1` prefix: read `/api/social/x` as `/api/social/x`). All JSON, zod-validated.

## 1. Conventions

- **Auth**: the app's existing Supabase session (cookies). Each route checks access with the same helpers the other admin routes use: approved, and admin or the `social_monitoring` tick. "Admin" in the tables below means `profiles.role = 'admin'`; "Anyone with access" means admin or the tick.
- **Cron routes** (`/api/cron/social`, `/api/cron/social-daily`): `Authorization: Bearer CRON_SECRET`, as the existing cron routes.
- **Ids**: uuids (as the rest of the app).
- **Pagination**: `?cursor=…&limit=50` (max 200). Response `{ items, nextCursor }`.
- **Errors**: `{ "error": { "code", "message" } }`. Codes: `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `VALIDATION` 422, `CONFLICT` 409, `APPROVAL_REQUIRED` 409, `GUARDRAIL_FAILED` 409, `STALE_DRAFT` 409, `RATE_LIMITED` 429.
- **Concurrency**: mutations send the `updated_at` they loaded; a mismatch returns 409 `CONFLICT`.
- **Audit**: every mutating route writes `social_audit` (11 §3).

## 2. Webhooks (public)

| Method & path | Verification | Body | Response |
|---|---|---|---|
| GET `/api/meta/webhook` (existing) | `hub.verify_token` equals the secret | — | `hub.challenge` |
| POST `/api/meta/webhook` (existing; new branch for `feed`, IG `comments`/`mentions`) | `X-Hub-Signature-256` (app secret) | Meta payload | 200 after storing `ingest_event` |
| POST `/api/social/webhooks/gbp` | Pub/Sub push OIDC JWT (audience = this URL, service account allow-listed) | Pub/Sub envelope | 204 |

## 3. Mentions

| Route | Role | Request | Response |
|---|---|---|---|
| GET `/api/social/mentions` | Anyone with access | query: `severity[]`, `platform[]`, `status[]`, `topic[]`, `assignee`, `q`, `postId`, `from`, `to`, `includeIgnored`, `sort=sla|newest|severity`, `cursor`, `limit` | `MentionListResponse { items: MentionSummary[], nextCursor, counts: {critical, high, medium, low, positive, ignore, overdue} }` |
| GET `/api/social/mentions/:id` | Anyone with access | — | `MentionDetail` (below) |
| POST `/api/social/mentions/manual` | Anyone with access | `ManualMentionCreate { platform, link?, authorDisplayName?, text (1–10000), rating?, createdAt? }` | 201 `MentionDetail` |
| POST `/api/social/mentions/:id/assign` | Anyone with access | `{ userId: string \| null }` | `MentionDetail` |
| POST `/api/social/mentions/:id/notes` | Anyone with access | `{ text (1–2000) }` | 201 `Note` |
| POST `/api/social/mentions/:id/status` | Anyone with access (Critical dismiss: Admin) | `{ to: 'in_review'\|'dismissed'\|'escalated', reason?: string }`; reason required for dismissed/escalated | `MentionDetail` |
| POST `/api/social/mentions/:id/downgrade` | Admin | `{ to: Severity, reason (10–500) }` | `MentionDetail`; resolves open alerts |
| POST `/api/social/mentions/:id/hide-ignored` | Anyone with access | — | 204 (Ignore severity only) |

```ts
type MentionSummary = {
  id; platform; kind; excerpt; severity; topics; status; createdAt; receivedAt;
  slaDueAt; slaState: 'ok'|'warning'|'breached'; assignee: UserRef|null;
  authorDisplayName: string|null; post: { id; title } | null; rating: number|null;
  notifiedAt: string|null;
  draftStatus: DraftStatus|null; removedAtSource: boolean; edited: boolean;
};
type MentionDetail = MentionSummary & {
  text; commentPermalink; postPermalink; thread: ThreadItem[];
  classification: { severity; keywordSeverity; modelSeverity; adjustments; reason; confidence;
                    safetyRelated; ruleHits: {ruleId; term; category; matchedText}[]; modelStatus; language; sentiment };
  classificationHistory: ClassificationSummary[];
  versions: { version; text; editedAt }[];
  drafts: DraftDetail[];            // newest first; at most one non-superseded
  notes: Note[]; statusHistory: StatusEvent[]; alerts: AlertSummary[];
  version: number;
};
```

## 4. Drafts

| Route | Role | Request | Response / errors |
|---|---|---|---|
| POST `/api/social/mentions/:id/drafts` | Anyone with access | `{ reason: 'regenerate'\|'manual', text?: string, scriptId?: string }`. `manual` takes the reviewer's text (no script; guardrails still run) | 202 `DraftDetail` (status `generating`) · 429 after 5/hour |
| GET `/api/social/drafts/:id` | Anyone with access | — | `DraftDetail` |
| PATCH `/api/social/drafts/:id` | Anyone with access | `{ text }` + `If-Match` | `DraftDetail` (guardrails re-run; approval voided if text changed) |
| POST `/api/social/drafts/:id/approve` | Admin | `{ textSha256 }`, which must equal the current hash | `DraftDetail` · 409 `GUARDRAIL_FAILED` / `STALE_DRAFT` / `CONFLICT` |
| POST `/api/social/drafts/:id/reject` | Anyone with access | `{ reasonCode: 'tone'\|'facts'\|'wrong_script'\|'not_needed'\|'other', reasonText? }` | `DraftDetail` |
| POST `/api/social/drafts/:id/copy` | Anyone with access | `{ textSha256 }` | `{ text, bookingUrl, copiedAt }` · 409 `APPROVAL_REQUIRED` \| `GUARDRAIL_FAILED` \| `STALE_DRAFT` |
| POST `/api/social/drafts/:id/posted` | Anyone with access | `{ postedAt?: string, replyLink?: string }` | `MentionDetail` (status posted) |
| POST `/api/social/drafts/:id/guardrail-override` | Admin | `{ rule: 'G3'\|'G6', reason (10–500) }`; refused for safety drafts | `DraftDetail` |
| POST `/api/social/guardrails/check` | Anyone with access | `{ text, mentionId }` (live check while editing; nothing stored) | `GuardrailResult` |

```ts
type DraftDetail = {
  id; mentionId; status: 'generating'|'ready'|'approved'|'copied'|'posted'|'stale'|'rejected'|'failed'|'no_script'|'superseded';
  text; textSha256; script: { id; name; version } | null; segments; bookingType; bookingUrl;
  factClaims: { id; wording; sourceRef }[]; isSafety; requiresApproval;
  approvedBy: UserRef|null; approvedAt; approvalValid: boolean;
  guardrail: GuardrailResult; overrides: { rule; reason; by; at }[];
  reviewerNote: string|null; copiedAt; copiedBy; postedAt; postedBy; edits: DraftEditSummary[]; version;
};
type GuardrailResult = { pass: boolean; failures: { rule: string; detail: string; span: [number, number] | null }[]; warnings: {…}[]; rulesVersion: string };
```

## 5. Needs attention

| Route | Who | Response |
|---|---|---|
| GET `/api/social/attention` | Anyone with access | `{ critical: MentionSummary[], high: MentionSummary[], overdue: MentionSummary[], connectorsDown: ConnectorStatus[], peopleWithoutNotifications: {id, name}[] }` |
| GET `/api/social/counts` | Anyone with access | `{ critical, high, open }` for the menu badges (polled by the app's live refresh) |

Notifications themselves go through the existing `notify()` (05); there are no alert routes.

## 6. Scripts, Fact Sheet, rules

| Route | Role | Notes |
|---|---|---|
| GET `/api/social/scripts` | Anyone with access | list with latest published version + stats |
| GET `/api/social/scripts/:id` | Anyone with access | all versions |
| POST `/api/social/scripts` | Anyone with access | create a script in `draft` (`ScriptVersionInput`, validated against the YAML schema in 04 §1) |
| POST `/api/social/scripts/:id/versions` | Anyone with access | new draft version |
| POST `/api/social/scripts/:id/versions/:v/submit` | Anyone with access | → `pending_approval` |
| POST `/api/social/scripts/:id/versions/:v/publish` | Admin | runs the guardrails over every variant and example (all must pass); previous published version → `retired` |
| POST `/api/social/scripts/:id/retire` | Admin | |
| GET `/api/social/fact-sheet` | Anyone with access | active locked version (or null) + drafts |
| POST `/api/social/fact-sheet/versions` | Admin | create a draft version |
| PUT `/api/social/fact-sheet/versions/:v/claims` | Admin | replace the claims list in a draft |
| POST `/api/social/fact-sheet/versions/:v/lock` | Admin | locks (immutable); requires every claim to have a source_ref, review_date and expiry_date |
| GET `/api/social/rules` | Anyone with access | read-only keywords/guardrails + rules_version + last eval run |
| POST `/api/social/rules/change-requests` | Anyone with access | `{ kind: 'keyword'\|'guardrail', proposal, reason }` → stored + notifies Admin |
| GET `/api/social/suggestions` | Anyone with access | edit-learning + missing-script suggestions |

## 7. Insights

| Route | Role | Notes |
|---|---|---|
| GET `/api/social/insights/summary?from&to&platform[]&compare=true` | Anyone with access | KPI tiles: `{ metric, value, previous, change, available, source, asOf }[]` |
| GET `/api/social/insights/series?metric&from&to&platform[]&granularity=day\|week` | Anyone with access | `{ metric, points: {date, value}[], unavailable: {platform, reason}[] }` |
| GET `/api/social/insights/posts?from&to&platform[]&sort=reach\|engagement&limit` | Anyone with access | best/worst posts |
| GET `/api/social/insights/best-times?platform` | Anyone with access | 7×24 matrix of median engagement rate (needs ≥ 30 posts, else `insufficientData`) |
| GET `/api/social/insights/feedback?from&to` | Anyone with access | sentiment over time, topic breakdown, recurring questions (with script link or "no script") |
| GET `/api/social/insights/response?from&to` | Anyone with access | median time to reply, % replied, SLA breaches by severity |
| GET `/api/social/insights/reviews?from&to` | Anyone with access | Trustpilot/Google average rating, trend, volume, reply rate |
| GET `/api/social/insights/bookings?from&to` | Anyone with access | bookings by source tag (from the booking backend, 10 §3) |
| GET `/api/social/insights/weekly-summaries?limit` | Anyone with access | stored weekly summaries |
| GET `/api/social/insights/export.csv?…` | Anyone with access | CSV of the same query |
| POST `/api/social/insights/export.pdf` | Anyone with access | `{ from, to, platforms, sections[] }` → 202 `{ jobId }`; GET `/exports/:jobId` → signed S3 URL (15 min) |

## 8. Competitors, SEO and GEO

| Route | Role | Notes |
|---|---|---|
| GET/POST `/api/social/competitors` | Anyone with access / Admin | list / add manually |
| PATCH `/api/social/competitors/:id` | Admin | profile links, service area, tracked flag |
| GET `/api/social/competitors/suggestions` | Admin | candidates from research jobs |
| POST `/api/social/competitors/suggestions/:id/approve` \| `/reject` | Admin | |
| GET `/api/social/competitors/league?metric[]&asOf` | Anyone with access | league table rows incl. Heliaxis, each value `{ value, source, collectedAt, method }` or `{ unavailable, reason }` |
| GET `/api/social/competitors/series?competitorId[]&metric&from&to` | Anyone with access | trends |
| GET `/api/social/competitors/share-of-voice?from&to&basis=reviews\|search\|instagram` | Anyone with access | |
| GET `/api/social/competitors/opportunities` | Anyone with access | opportunity cards with source links |
| GET `/api/social/competitors/:id/changes` | Anyone with access | website change log, offers spotted |
| POST `/api/social/competitors/manual-snapshots` | Anyone with access | `{ competitorId, platform, metric, value, observedAt, evidenceUploadId }` (manual monthly entry) |
| GET `/api/social/seo/ranks?keyword&town&from&to` | Anyone with access | |
| GET `/api/social/seo/visibility?from&to` | Anyone with access | share of local search visibility |
| GET `/api/social/geo/share?from&to&engine[]` | Anyone with access | AI answer share with prompt-level drill-down |
| GET `/api/social/seo/site-health?business` | Anyone with access | latest crawl results |
| GET `/api/social/seo/weekly-summaries` | Anyone with access | |

## 9. Settings and admin

| Route | Role | Notes |
|---|---|---|
| GET/PUT `/api/social/settings` | Anyone with access / Admin | `Settings` object (01 §8); PUT validates booking URLs (https, heliaxis.co.uk domain) |
| GET `/api/social/connectors` | Anyone with access | health per connector |
| GET `/api/social/heartbeat` | Admin | last 30 runs |
| POST `/api/social/heartbeat/run` | Admin | run now |
| GET `/api/social/audit?target&actor&from&to` | Admin | read-only audit log |
| POST `/api/social/privacy/erasure` | Admin | `{ platform, authorDisplayName?, platformAuthorId?, mentionIds?, requestRef }` → preview of matches |
| POST `/api/social/privacy/erasure/:id/execute` | Admin | erase (11 §4) |
| GET `/healthz` / `/readyz` | public | liveness / readiness |
