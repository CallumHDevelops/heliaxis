# 00 · Decisions, assumptions and open questions

Status: draft for Cal's review · 25 October 2026 · Author: Opus (spec for Sonnet)

This file is the Phase 0 gate artefact. The brief requires that "every open question is answered or assumed in writing". Every question below has an **assumed answer** that the rest of the spec is built on. Sonnet builds to the assumed answer unless Cal changes it here first. Items marked **⚠ SAFETY** are places where the brief was silent or ambiguous on something that affects safety. In each one the spec takes the more cautious option.

The brief's section 14 (open questions) was not included in the copy Opus received. The questions below were compiled from gaps found while reading sections 1–13.

---

## A. Confirmed decisions (from the brief, restated so they cannot drift)

| # | Decision | Where enforced |
|---|---|---|
| D1 | Replies are draft-only. Nothing is posted, hidden or deleted on any platform by the system. | 01 §6 (egress guard), 11 §2, test AT-SEC-01 |
| D2 | Feature lives at Operations › Social Monitoring in the Heliaxis app. | 06 |
| D3 | A bad or risky comment triggers an instant in-app notification (Web Push in the PWA). | 05 |
| D4 | Includes marketing Insights and a Competitor portal. | 08, 09 |
| D5 | Persistent "Book a survey or call" button in the app header. | 10 |
| D6 | No Safety Fact Sheet at launch. Safety replies make **no factual safety claims**. | 04 §3, guardrail G3 |
| D7 | Safety-related drafts are never auto-approved, now or in future. | 04 §6, DB constraint `draft_safety_never_auto` |

## B. Assumed answers (Cal to confirm or change)

| # | Question | Answer used by this spec | Status / note |
|---|---|---|---|
| Q1 | What is the Heliaxis app built with? | **Answered from the repo (`CallumHDevelops/heliaxis`):** Next.js 16 on Vercel (London), Supabase Postgres (London) and Supabase auth, `profiles.role` + per-person portal ticks, `notify()` for bell + Web Push + Android app, Supabase pg_cron for jobs, Claude already in use. Social Monitoring is built **inside** the app (01). | Confirmed |
| Q2 | Where is it hosted? | Inside the existing app: Vercel `lhr1` + Supabase London. No new servers. | Confirmed |
| Q3 | Who gets alerts? | **Everyone with access to Social Monitoring**: admins plus members with the new Social monitoring tick (Cal, 25 Oct). | Confirmed |
| Q4 | SMS or phone calls? | **None.** A simple notification through the app only (Cal, 25 Oct). No repeats or escalation either. | Confirmed |
| Q5 | What if push fails? | The bell and the Needs attention panel still show it in the app. The daily check emails admins if notifications stop working (05 §5). No emergency phone number. | Follows from Q4 |
| Q6 | The keyword list in the brief includes broad words (**gas**, **insurance**, **danger**, **burn**, **fire**). These will make some harmless comments Critical (e.g. "switching from a gas boiler", "does solar affect my home insurance?", "this deal is fire 🔥"). Keep them? | **Keep exactly as the brief says (MUST).** Every match is Critical. The Critical alert explains which word matched, so the reviewer can dismiss quickly. Cal can approve a narrower rule later through the Scripts › Rules approval flow, but the code ships with the full list. ⚠ SAFETY | Alert fatigue is a real risk. Expect roughly 1–3 false Criticals a week from heat-pump and insurance chatter. Review after 4 weeks of live data (ticket T5.6). |
| Q7 | Treat the 🔥 💥 🧯 emojis as "mentioning fire"? | **Yes, Critical.** ⚠ SAFETY | Noisiest rule in the list. It is the first candidate for Cal to relax after review. |
| Q8 | Welsh-language comments? | **Supported.** The keyword layer includes Welsh safety terms (tân, llosgi, ffrwydro, mwg, nwy, peryglus…). Draft replies are English-only at launch. A Welsh comment gets an English draft and a reviewer note: "Comment is in Welsh. Consider replying in Welsh." ⚠ SAFETY | South Wales audience. A Welsh fire comment must not slip past an English-only list. |
| Q9 | Who can approve Critical drafts? | **Admins.** Any edit after approval clears it. A separate approver tick can be added later if needed. | Assumed |
| Q10 | Can a human downgrade a keyword-Critical item (e.g. "gas boiler" false positive)? | **Yes, Approver/Owner only, with a mandatory reason, logged.** Downgrading stops alert repeats. The item stays in the Critical history, and the classifier record is never edited. | A human has looked at it, which is the point of the alert. |
| Q11 | Quiet hours | Default 21:00–07:30 Europe/London, every day. Applies to High and below only. Critical always rings. | From the brief. |
| Q12 | SLA clock: 24/7 or business hours? | **Critical: 24/7 (1 hour).** High/Medium/Low/Positive: business hours, default Mon–Sat 08:00–20:00 Europe/London. The Positive digest time defaults to 08:30. | A 6-hour clock that runs overnight would breach on every evening comment. Critical is never paused. |
| Q13 | Booking types: the brief says "three choices" but also "two destination URLs". | **Three booking types, three editable URLs:** survey, phone call, quote consultation. | Resolves the inconsistency in the more complete direction. |
| Q14 | The existing booking portal | **Answered from the repo:** `/book-a-survey` with live slots and travel time, plus callback requests. Add `/book-a-call` (and quote consultation as a flagged callback) reusing that code (10). | Confirmed; quote option to confirm |
| Q15 | Booking links in replies: are links allowed in Instagram comments, Trustpilot replies and Google review replies? | Instagram comments do not make links clickable, so IG drafts point to "the link in our bio" or a DM. Trustpilot and Google drafts use a **plain short path** (`heliaxis.co.uk/book/tp`, `/book/g`) plus the office phone number, never a tracking query string. Ticket T2.9 verifies both platforms' current reply guidelines. | Avoids reply rejection and a spammy look, and keeps channel attribution through per-platform short paths. |
| Q16 | Who signs replies? | Signature slot `{{signoff}}`, default **"The Heliaxis team"**. Cal can set a personal sign-off per reviewer in settings. | |
| Q17 | Retention of comment data | Comment text, author name and drafts: **24 months** after the item is closed, then anonymised. Raw platform payloads: **90 days**. Audit events (which contain no comment text): **6 years**. Metric snapshots: indefinitely (aggregate, no personal data). | Section 11 §4. Cal to confirm with whoever handles GDPR. |
| Q18 | Model provider and data transfer | Claude via the Anthropic API, model `claude-opus-5-5` for classification, drafting and summaries. The Anthropic API offers only `global` or `us` inference geography, so comment text leaves the UK. This is lawful with the Anthropic DPA and the UK International Data Transfer Addendum. Only public comment text and post context are sent, never customer records. Phase 0 (T0.4) checks whether a UK/EU-region deployment (e.g. Amazon Bedrock in eu-west-2) carries the model; if Cal prefers it, the switch touches one module. | Section 11 §5. |
| Q19 | Competitor Google ratings over time | Google Maps Platform terms restrict storing Places content beyond short caching windows. **Until the Phase 4 legal check says otherwise**, competitor Google rating and review count are (a) shown live from the Places API without long-term storage, and (b) recorded monthly by a person using a manual-entry form with a screenshot. Heliaxis's own Google data comes from the Business Profile API and is stored. ⚠ legal | The brief already requires a legal check before Phase 4. |
| Q20 | Competitor Facebook data | The Meta API does not give follower counts for Pages we do not manage without "Page Public Content Access", which needs Meta app review. **Default: monthly manual entry.** Instagram competitor data uses the official **Business Discovery** API, which is permitted. | |
| Q21 | Google Business Profile Q&A | **Dropped.** Google discontinued the Q&A API on 3 November 2025 and is phasing Q&A out of Maps. The Google connector pulls reviews only. | Verified October 2026. See 02 §5. |
| Q22 | Facebook Page "impressions" | Meta deprecated `impressions` and `page_fans` in November 2025 and unique-reach metrics in June 2026, in favour of "views" and "media view" metrics, which are **not like-for-like**. Insights will label these metrics with Meta's current names and **never** splice old and new series together. | 08 §2. |
| Q23 | Positive comments with no question: reply or not? | Draft a short thank-you (per the brief); the reviewer may Dismiss without replying. Dismissing a Positive item counts as "handled" for SLA. | |
| Q24 | Should a reply ever name a competitor? | **Never.** Guardrail G7 blocks competitor names in drafts. | Avoids public arguments and comparative-advertising risk. |
| Q25 | Office phone, booking URLs | Office phone **01633 965205** (`OFFICE_PHONE` in the app). URLs: `/book-a-survey`, `/book-a-call`, `/book-a-call?reason=quote`. Base postcode for the competitor area still needed (Phase 4 only). | Mostly confirmed |
| Q26 | Daily heartbeat recipient | The first admin (Cal) by default; failures are emailed to all admins. | Assumed |
| Q27 | Budget for third-party data | **Minimal cost, free wherever possible (Cal, 25 Oct).** No paid rank tracking: Search Console (free) for our own positions plus a monthly manual check of 10 searches for competitors. Places lookups stay inside Google's free allowance. The only paid item is a monthly AI-answer check on the existing Claude account (about £1–2). Hard limit **£10/month**. Classification and drafting use the cheapest Claude model that passes the tests (01 §7). | Confirmed |

## C. Things the brief asked Opus to verify, and what was found (October 2026)

| Item | Finding | Effect on spec |
|---|---|---|
| Meta Page Insights | `impressions` and `page_fans` deprecated from 15 Nov 2025 (replaced by `views` / follows metrics). Unique reach metrics deprecated around 15 Jun 2026 (Graph API v25), replaced by `*_total_media_view_unique`, a different methodology. | Metric catalogue is data-driven; each metric records its API name and an `available_from` date. 08 §2. |
| Instagram comment webhooks | `comments` and `mentions` webhook fields. The Facebook Login path needs `instagram_basic`, `instagram_manage_comments`, `pages_read_engagement`. The Instagram Login path needs `instagram_business_basic` + `instagram_business_manage_comments`. Standard Access is enough for accounts Heliaxis owns. | **The `manage_comments` permission technically allows replying, hiding and deleting.** Meta has no read-only comments permission. Read-only is therefore enforced in our code by an outbound request guard (01 §6), and stated as a risk. |
| Instagram competitor data | Business Discovery returns `followers_count`, `media_count` and recent media for other professional accounts. | Used for competitor IG metrics. |
| Google Business Profile | Q&A API discontinued 3 Nov 2025. Reviews remain available through the Business Profile reviews endpoint (`accounts.locations.reviews`), and new-review notifications go through Cloud Pub/Sub. API access requires Google's approval form. | Google connector = reviews only, with Pub/Sub plus 15-minute polling. |
| Trustpilot | The private Business API (`/v1/private/business-units/{id}/reviews`, OAuth client-credentials) returns our own reviews. No public webhook documentation was found. | Poll every 15 minutes. Fallback: parse Trustpilot's "new review" notification emails. Ticket T2.1 re-checks the plan's webhook availability. |
| Google Maps Platform caching | Terms restrict caching of Places content (lat/lng 30 days; place IDs may be stored). The field-level policy for `rating` was not confirmed. | Q19 cautious default. |

Sources consulted: Meta developer documentation (Instagram webhooks, Business Discovery, Page Insights API updates blog of Aug 2025); Coupler, Improvado and Supermetrics notes on 2025–2026 Meta metric deprecations; Yext and Reputation.com notes on the Google Q&A API sunset; Google Maps Platform Service Specific Terms; third-party Trustpilot connector documentation. **Every platform fact above must be re-verified by the ticket that implements it (each connector ticket has a "verify current docs" step), because these terms change often.**

## D. Questions still open for Cal

1. Keep gas, insurance and 🔥 as Critical at launch, accepting extra noise? (Q6, Q7)
2. Is "admins approve Critical replies" right, or should a non-admin be able to approve? (Q9)
3. Quote consultation: a flagged callback (recommended) or bookable diary slots? (10 §2)
4. Retention: 24 months for comments, 6 years for the audit log? (Q17)
5. Sending public comment text to the Anthropic API outside the UK: acceptable? (Q18; Claude is already used in the app)
