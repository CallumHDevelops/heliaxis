# 11 · Security, privacy and compliance

## 1. Keys

- Platform keys (Meta, Google, Trustpilot) and the author-hash pepper are **Vercel environment variables** (encrypted at rest, server-only), the same as the app's existing Meta, Anthropic, Resend and Firebase keys. They are never written to Supabase, logs, the audit table or error messages.
- Expiry: the Meta system-user token does not expire; the Google refresh token is checked every minute by the connection health check, which notifies admins when it stops working.

## 2. Read-only platform access

01 §6 (egress guard, minimum scopes, CI check). Posting, hiding and deleting are impossible by design. AT-SEC-01 and AT-SEC-02 test this.

## 3. Audit log (cannot be edited)

- Table `social_audit` (supabase/social-monitoring.sql).
- **Append-only**: a trigger raises an exception on `UPDATE`/`DELETE`/`TRUNCATE`. `hash = sha256(prev_hash || canonical_json(row without hash))` forms a tamper-evident chain. A nightly job verifies the chain and raises `system.critical` on a break.
- **No personal data in audit rows.** `before`/`after` hold ids, statuses, hashes and field names, never comment text, author names or draft text. Draft text history lives in `draft_edit` (erasable). This keeps the audit log immutable while still allowing GDPR erasure.
- Audited actions (minimum): notification sent; draft generated/edited/approved/rejected/copied/posted/overridden; mention status changes/downgrades/assignment; script and Fact Sheet version create/submit/publish/lock/retire; settings changes; role changes; connector connect/disconnect; erasure requests and executions; egress guard blocks; exports.
- Retention: 6 years (00 Q17). An admin can view it in Settings › Audit.

## 4. UK GDPR

| Item | Specification |
|---|---|
| Personal data | Commenter display name, platform user id (stored **hashed** with a secret pepper), comment text (may contain personal data), profile links in raw payloads. Staff user ids. |
| Lawful basis | **Legitimate interests** (responding to public comments about Heliaxis, protecting customers and the public from safety concerns going unanswered, managing reputation). Ticket T5.4 produces a Legitimate Interests Assessment and a privacy-notice paragraph for heliaxis.co.uk ("We monitor public comments and reviews about Heliaxis on Facebook, Instagram, Trustpilot and Google so that we can respond…"). |
| Data minimisation | No enrichment of commenters, no cross-platform identity matching except the 30-day repeat-commenter rule within one platform (03 R1). No customer-record lookups. |
| Retention | Raw payloads 90 days → deleted. Mentions, classifications, drafts and notes: 24 months after the mention is closed → anonymised (text replaced with `[removed after retention period]`, author name and hash nulled; severity, topics and dates kept for statistics). Audit 6 years. Metric snapshots indefinitely. Job `retention.sweep` daily. |
| Erasure / objection | Admin-run flow (07 §9): search by platform + display name and/or platform author id (hashed for matching) and/or mention ids → preview → execute: delete `mention_raw`, `mention_version` text, `draft_edit` text, `note` text that quotes the person (Admin confirms per note); set mention text to `[erased on request REF]`, author name and hash to null. The audit log records `erasure.executed` with the request ref and counts only. Response deadline: one month (statutory). |
| Subject access | The same search, with an export (JSON + PDF) of the matched records. |
| Location | Supabase (London) and Vercel functions (`lhr1`). Anthropic API: outside the UK (00 Q18), covered by the Anthropic DPA + the UK IDTA Addendum; only comment text, thread excerpts with names replaced, and post captions are sent. Review emails are read from Heliaxis's own Microsoft 365 mailbox. |
| Processors list | Supabase, Vercel, Anthropic, Microsoft 365, Resend, Firebase, Meta/Google/Trustpilot (sources). T5.4 records this in the Record of Processing Activities. |
| DPIA | Recommended (systematic monitoring of public comments, plus AI processing). T5.4 drafts a DPIA. |

## 5. Untrusted input and prompt injection

- Comment text, review text, competitor web pages and AI-sampler answers are **untrusted**.
- Model inputs put untrusted text inside clearly delimited tags, and the system prompt states that the text is data. HTML/XML special characters are escaped so a comment cannot close the tag.
- Model outputs are **structured and validated** (zod). They can only fill classification fields or choose script variants and enum slots. **No model output can call a tool, change settings, select recipients, alter severity downward, approve, copy or post.**
- Every draft goes through the deterministic guardrails (04 §6), including G12 (no echo of the comment).
- Classification cannot be lowered by the model: keyword severity is a floor (03 §5 C1).
- Research and sampler calls with web search: their outputs are summaries with citations stored as text; they never feed back into the classifier or drafting prompts.
- Test cases with injection attempts are in the classifier test set (`inj-*`) and the guardrail test set.

## 6. Application security

- OWASP ASVS L2 as the baseline. All routes use zod validation; Kysely parameterised queries only; no raw SQL string concatenation (lint rule).
- CORS: the Heliaxis app origin only. CSP on the web module follows the app's policy.
- SSE tokens are single-use and short-lived (07 §5).
- Webhook signature checks happen before any parsing (raw body).
- Dependencies: `pnpm audit` and Renovate; lockfile committed.
- Backups: Supabase daily backups (point-in-time recovery if the plan has it). A quarterly restore test into a scratch project (T5.3).
- Access: only server code with the service-role key; RLS on with no policies on every social table, as the rest of the app.

## 7. Reliability (no comment lost)

- Webhook payloads are persisted before 200 (02 §2). If the DB is down, 503 makes Meta/Pub/Sub retry.
- Polling backups catch anything the webhooks miss; dedupe makes double delivery harmless.
- Idempotent handlers keyed on natural keys (01 §5).
- Dead-letter queues raise Warnings, and an admin can replay a DLQ item from Settings › System (`POST /api/social/v1/system/dlq/:id/replay`, Admin).
- Platform rate-limit handling: 02 §9.
- After an outage, pollers catch up from their stored cursors (`connector_cursor` table), with a 30-day overlap window on first run after more than 24 hours of downtime.
