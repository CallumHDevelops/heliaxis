# 06 · Heliaxis app: Operations › Social Monitoring

Wireframes are layout and behaviour contracts, not visual design. Every screen uses the Heliaxis app's existing look and components (`AdminShell`, Tailwind 4, Radix dialogs, lucide icons, the existing card, chip and sheet styles), and follows the app's patterns for the phone layout and bottom bar. Colours are semantic tokens: `danger` (Critical), `warning` (High), `info` (Medium), `neutral` (Low), `success` (Positive).

Routes (inside the app router):

```
/admin/social                      Inbox (menu: Operations › Social monitoring)
/admin/social/review/[id]
/admin/social/scripts              (/scripts/[id], /scripts/fact-sheet, /scripts/rules)
/admin/social/insights
/admin/social/competitors          (/competitors/[id], /competitors/seo, /competitors/research)
/admin/social/settings             (connections, who has notifications on, booking links, quiet/business hours, local area)
```

Access: the `social_monitoring` portal key in `src/lib/portals.ts` with `paths: ['/admin/social']`, so the existing middleware access check covers every page. The Operations menu in `AdminShell` gets a **Social monitoring** item with `show: can('social_monitoring')`. A help section is added under `src/content/help/social/`.

## 0. Always-visible elements

### App header (every screen)

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ ☰ Heliaxis     Dashboard  Operations(3)  …                [ 📅 Book survey or call ] 👤 │
└───────────────────────────────────────────────────────────────────────────────┘
```
`Operations(3)` = open Critical + High count, red if any Critical. The booking button is specified in 10 §1.

### Needs attention panel (dashboard top, every login)

```
┌ NEEDS ATTENTION ─────────────────────────────────────────────────────────────┐
│ 🔴 CRITICAL  Facebook · "worrying the salesman said the battery could…" · 12m │
│              SLA 48m left · Waiting for approval                [Open]      │
│ 🟠 HIGH      Google ★1 · "Still waiting for someone to call back…" · 3h       │
│              SLA 58m left                                         [Open]      │
│ ⏰ OVERDUE   Instagram · "How much for a 5kW…" · 7h (SLA breached)  [Open]    │
│ 🔌 Trustpilot connection red since 08:12, token invalid      [Reconnect]      │
│ 📵 Sam has no phone or browser notifications turned on   [How to turn on] │
└──────────────────────────────────────────────────────────────────────────────┘
```
States: **loading** (skeleton of 3 rows); **empty** ("Nothing needs attention. All Critical and High items are handled." plus the time of the last check); **error** ("Couldn't load social alerts. Retrying…" with a red border; it must never show as empty when the request failed). The panel cannot be collapsed while it contains a Critical.

### Connector status strip (top of every Social Monitoring sub-view)

```
Facebook ● 2m ago   Instagram ● 2m ago   Trustpilot ● 14m ago   Google ◐ token expires in 5 days   Email parse ● 
```
Green/amber/red dots with the last-success time. Click → connection details (last error, key expiry, and for admins a link to the setup page).

### Sub-navigation

`Inbox (7) · Scripts · Insights · Competitors`. The Review screen opens from the Inbox.

## 1. Inbox

```
┌ Social Monitoring › Inbox ───────────────────────────────────────────────────────────┐
│ [Severity ▾ All] [Platform ▾ All] [Status ▾ Open] [Topic ▾ All] [Assigned ▾ Anyone] 🔍 │
│ [+ Add comment manually]                                         Sort: SLA ▾          │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ PINNED: CRITICAL                                                                       │
│ 🔴 [f] "Bit worrying that the salesman said the battery could catch fi…"  safety     │
│        GoodWe post · J. Smith · 12m ago      Waiting approval  SLA 48:12  Unassigned  │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ 🟠 [G] ★1 "Still waiting for someone to call back about the inverter…" service         │
│        3h ago                                In review · Sam      SLA 0:58            │
│ 🔵 [IG] "How much would a 10kWh battery be for a 3 bed?"            pricing           │
│        41m ago                               Draft ready          SLA 5:19            │
│ 🟢 [TP] ★5 "Fantastic team, install done in a day…"                 praise            │
│        2h ago                                Draft ready          SLA 4:02            │
└──────────────────────────────────────────────────────────────────────────────────────┘
```
- Row: platform icon, severity colour bar and label, excerpt (≤ 90 chars), topic chips, post name, author display name, age, status, SLA countdown (turns amber below 25% remaining, red when breached), assignee.
- Critical items are always pinned at the top in red, regardless of sort and filters (except when the status filter excludes open items).
- Bulk actions (anyone with access): Assign, Dismiss (not available for Critical), Mark as spam (Ignore, not available for Critical).
- Ignore items are hidden by default, behind "Show ignored (n)", with a one-click "Hide from queue".
- **States**: loading (10 skeleton rows); empty with filters ("No comments match these filters." [Clear filters]); empty with no filters ("All caught up. New comments appear here within a minute." plus the connector strip); error (inline error with Retry; the previous list is kept visible with a "may be out of date" banner).
- Live updates with the app's existing live refresh (`src/lib/use-live-refresh.ts`): new rows slide in with a highlight.
- Manual add: a drawer form (platform, link, author, text, rating, time). Submitting runs classification and opens Review.

## 2. Review

```
┌ ← Inbox    CRITICAL · Facebook · safety, battery          Status: In review ▾  Assignee: Cal ▾ ┐
│ 🔴 Notified 09:14 · everyone with Social monitoring access (3 people) · waiting 12 min        │
│ ORIGINAL COMMENT                                       [Open on platform ↗]                   │
│ J. Smith · 25 Oct 09:14 · on "GoodWe battery: what you need to know" (post ↗)                │
│ "Bit worrying that the salesman said the battery could catch fire 😬"                        │
│ Thread: ▸ 2 earlier comments  ▸ Heliaxis has not replied yet                                  │
│                                                                                              │
│ WHY CRITICAL                                                                                 │
│ Keyword: "catch fire" (safety_fire) · Model: critical, safety-related, confidence 0.97      │
│ "Commenter is worried about battery fire risk raised by a salesperson."                      │
│ [Downgrade… (Admin)]                                                                      │
│                                                                                              │
│ DRAFT REPLY · script: Safety concern v1 · rules v2026.10.1        Guardrails: ✅ all passed  │
│ ┌──────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ Hello, thank you for raising this. Battery safety is a fair thing to ask about…          │ │
│ └──────────────────────────────────────────────────────────────────────────────────────────┘ │
│ Facts used: none (no Fact Sheet is active, so this reply makes no safety claims)             │
│ Booking link: call · utm_source=facebook                                                     │
│                                                                                              │
│ ⚠ Approval required before copying. Any edit clears approval.                                │
│ [ APPROVE ]  [Edit] [Regenerate] [Reject…]                                                   │
│ [ ████ COPY REPLY ████ ] (disabled until approved)      [Mark as Posted]                      │
│                                                                                              │
│ INTERNAL NOTES                                       HISTORY                                 │
│ [Add a note…]                                        09:14 created · 09:14 Critical alert…   │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```
(The seeded draft text is in `config/scripts.seed.yaml`. "J." is not a usable first name under the `first_name` rule, so the no-name greeting is used.)

- The **Copy** button is the largest control on the page. After a successful copy: toast "Copied. Now paste it on Facebook." and the button changes to "Copied ✓ (copy again)". The Open on platform button pulses once.
- **Copy disabled states** (with an explanation under the button): "Approval required" (Critical/safety), "Guardrail failed: see highlighted text" (the failing spans are highlighted in the editor with the rule id), "Draft is stale: the comment was edited", "Generating draft…".
- **Edit** mode: textarea, live guardrail check (debounced 400 ms, server-side), Save/Cancel. Saving a Critical draft shows "Approval cleared".
- **Reject**: modal with the reason picklist plus text.
- **Mark as Posted**: confirm dialog with an optional "link to our reply". It closes the item.
- **Dismiss** (status menu): reason required. For Critical, Admin only, with reason.
- **Escalate** (status menu): assigns to an admin and sends them a push.
- **States**: draft generating (spinner in the draft card; everything else usable); `no_script` ("No approved script covers this comment. Write a reply below, or [Create a script].", and a manual reply editor that still runs the guardrails); `failed` ("Couldn't create a draft. Write one manually or [Try again]"); removed at source (grey banner); comment edited (amber banner, with old and new text expandable); permission-denied actions are hidden, not disabled, except Copy, which shows its reason.
- Keyboard: `c` copy, `o` open on platform, `e` edit, `a` approve (if allowed), `j/k` next/previous item.

## 3. Scripts

```
┌ Scripts ───────────────────────────────────────────── [+ New script] ┐
│ Tabs: Library · Fact Sheet · Rules (read-only) · Suggestions (2)     │
│ Name                 Topics          Severities  Platforms  Ver  Status     Reviewed │
│ Safety concern 🔒    safety,battery  critical    all        v1   Published  25 Oct   │
│ Price objection      pricing         medium,low  all        v1   Published  25 Oct   │
│ …                                                                                    │
└──────────────────────────────────────────────────────────────────────┘
```
- Script detail: segments with variants, slots, examples, version history (diff between versions), "Used in n drafts / edited in m / rejected in k" stats, and Approve/Publish for Admins.
- 🔒 = safety script: only an admin can publish.
- **Fact Sheet tab**: "No Fact Sheet is active. Safety replies make no factual claims." plus [Start a Fact Sheet draft] (Admin). When drafting: a table of claims with wording, category, source link, review date and expiry date, then submit and lock (Admin).
- **Rules tab**: read-only view of keyword categories and guardrail lists with the current `rules_version`, the last classifier test run (pass/fail, date), and a "Request a change" form.
- **Suggestions tab**: edit-learning cards (04 §7) and "Recurring questions without a script" (from Insights).
- **States**: empty library (impossible after seed; show the seed import action); a draft version pending approval shows a banner to Admins.

## 4. Insights

Specified in 08. Layout: a date-range picker (7/30/90/custom) plus "Compare to previous period" toggle plus platform filter, then KPI tiles, then chart sections (Audience, Reach, Engagement, Feedback, Reviews, Response), then the Weekly summary card, with [Export PDF] [Export CSV]. Every metric a platform does not provide shows "Not available from {platform} API", never zero.

## 5. Competitors

Specified in 09. Tabs: League table · Trends · Share of voice · Opportunities · SEO & AI search · Competitor list · Research.

## 6. Who can do what

This uses the app's existing access model: **admins** (`profiles.role = 'admin'`) and **members with the Social monitoring tick** (`'social_monitoring' = any(profiles.portals)`). There are no separate Social roles.

| Action | Admin | Member with the tick |
|---|---|---|
| See Inbox, Review, Insights, Competitors; get notifications | ✅ | ✅ |
| Assign, add notes, edit drafts, regenerate, reject, add a comment manually | ✅ | ✅ |
| Copy and mark Posted (non-Critical) | ✅ | ✅ |
| Dismiss a non-Critical item | ✅ | ✅ |
| **Approve a Critical or safety draft** | ✅ | ❌ (can copy it once an admin has approved it) |
| Dismiss or downgrade a Critical (with a reason) | ✅ | ❌ |
| Guardrail override (non-safety, listed rules) | ✅ | ❌ |
| Create a script draft | ✅ | ✅ |
| Publish a script, lock the Fact Sheet | ✅ | ❌ |
| Settings, competitor approvals, erasure requests | ✅ | ❌ |

If Cal wants a non-admin to approve Critical replies, add a second tick (`social_approver`) later. It is not built at launch.

## 7. Mention statuses

`new → in_review → approved (Critical only) → copied → posted`; side exits `dismissed`, `escalated` (returns to `in_review` when an admin picks it up). Transitions:

| From → To | Who | Trigger |
|---|---|---|
| new → in_review | system | first open by a Member with access, or assignment |
| in_review → approved | Admin | Approve on a Critical draft |
| in_review/approved → copied | Anyone with access | Copy succeeded |
| copied → posted | Anyone with access | Mark as Posted |
| any open → dismissed | Anyone with access (Critical: Admin) | Dismiss with reason |
| any open → escalated | Anyone with access | Escalate |
| posted → in_review | system | comment edited after posting, or the author replies negatively (03 T3) |

Every transition writes `mention_status_event` (who, when, from, to, reason) and an audit event.
