# 04 · Scripted reply engine, Fact Sheet and guardrails

The model **never writes a reply from a blank page**. A reply is assembled from an approved script. The model's job is limited to (a) choosing a script among the eligible ones, (b) choosing one approved variant per segment, (c) filling enum slots, and (d) where a segment allows it, lightly rewording. Deterministic code renders the text and runs the guardrails.

## 1. Script format

Scripts live in the DB (`script`, `script_version`) and are seeded from `config/scripts.seed.yaml`. A published version is immutable. Schema:

```yaml
id: safety-concern                # stable slug
name: Safety concern
version: 1
status: published                 # draft | pending_approval | published | retired
topics: [safety, battery]         # match any
severities: [critical]            # match any
platforms: [facebook, instagram, trustpilot, google, manual]
safety: true                      # safety scripts: rewording none everywhere; facts only from Fact Sheet; never auto-approved
allowed_claims: []                # Fact Sheet claim ids this script may use (empty at launch)
banned_phrases: [...]             # script-specific, added to the global list
approver: cal                     # user id of the approver who published this version
last_reviewed: 2026-10-25
review_every_days: 90             # Scripts screen flags overdue reviews
segments:
  - id: greeting
    rewording: none               # none | light
    variants: ["Hi {{first_name}},", "Hello {{first_name}},"]
    variants_no_name: ["Hi there,", "Hello,"]
  - id: thanks
    rewording: none
    variants:
      - "Thank you for raising this."
      - "Thanks for asking about this."
  - id: facts
    kind: fact_claims             # rendered only when a Fact Sheet is active AND allowed_claims non-empty
    max_claims: 2
  - id: offer
    rewording: none
    variants: [...]
  - id: signoff
    rewording: none
    variants: ["{{signoff}}"]
slots:
  concern_phrase:                 # enum slot chosen by the model
    enum: ["battery safety", "how home batteries are installed", "the safety of your system"]
examples:                         # 3–4 example finished replies, for reviewers and for the drafting prompt
  - "Hi Sarah, Thank you for raising this. …"
```

**Slot syntax**: `{{name}}` only. No logic, loops or expressions. Unknown slots fail rendering, and a failed render produces no draft.

**Built-in slots** (filled by code, never by the model):

| Slot | Source |
|---|---|
| `first_name` | First token of the author display name if it matches `^[A-Z][a-z'’-]{1,20}$` after title-casing and is not in the not-a-name list (`Mr`, `Mrs`, `The`, `Admin`, business words). Otherwise absent, and `variants_no_name` is used. |
| `signoff` | Member with access's sign-off setting, else the global default "The Heliaxis team". |
| `booking` | A **full sentence**, rendered per platform and booking type (§4). Scripts put it in its own segment. |
| `office_phone` | Setting. |
| `product` | From topics: battery → "battery", panels → "solar panels", heat_pump → "heat pump", otherwise "system". |

**Model-chosen slots** must be enum slots declared in the script. The model cannot create a free-text slot.

## 2. Script selection

1. Eligible = published scripts where `severity ∈ severities` **and** at least one topic overlaps **and** the platform is listed.
2. If any eligible script has `safety: true` and the mention is `safety_related`, **only safety scripts remain eligible.** A Critical mention that is not safety-related (legal, privacy, fraud) gets `critical-private-followup`. Every Critical draft has `requires_approval = true`, whatever the script.
   - Exception: when an Admin downgrades a keyword-Critical mention with the reason "not a safety issue" (00 Q10, e.g. "switching from a gas boiler"), the mention gets `safety_cleared = true`, and the next draft is chosen from the non-safety scripts. The downgrade and the regenerated draft are both audited.
3. If no script is eligible → no model call. Draft status `no_script`, and the Review screen shows "No approved script covers this. Write a reply manually, or create a script." with a prompt to create one (counted in Insights "questions without a script").
4. The model picks one script id from the eligible list (sent as ids + names + descriptions). If it returns an id not in the list → retry once, then use the first eligible script in priority order (`priority` field, lower first).

## 3. Safety replies (hard rules from the brief)

- Script `safety-concern` is the **only** script eligible for `safety_related` mentions. Its shape is locked: greeting → thanks for raising → acknowledge that this is a fair thing to ask → [facts: only when a Fact Sheet is active] → offer a call or survey with the booking slot → sign-off.
- Every segment has `rewording: none`. The model picks variants and the `concern_phrase` enum value. Nothing else.
- **At launch there is no Fact Sheet** (00 D6), so the `facts` segment renders empty and guardrail G3 rejects any factual claim sentence.
- The draft is created with `requires_approval = true`. Copy is disabled until an Admin presses Approve on the **current** text hash (§7).
- `draft.auto_approved` does not exist as a column. The DB check constraint `draft_safety_never_auto` ensures `approved_by IS NOT NULL` before status `approved` when `is_safety = true` (see 0001_core.sql).

### Fact Sheet (for later; data model and UI built in Phase 2 but empty)

- `fact_sheet_version` (draft | pending_approval | locked | retired) and `fact_claim` (id, wording **verbatim**, category: certification | protection | installation_standard, source_ref (URL or document reference + page), approved_by, approved_at, review_date, expiry_date).
- Only claims in the **locked** version, not expired, may be used. A draft records `fact_claim_ids[]` and the exact wording used.
- Claims are inserted **verbatim**: no rewording, no merging of two claims into one sentence.
- If a safety question is not covered by any claim, the facts segment renders the fixed text: "That's a detailed question, and we'd rather answer it properly than guess here." followed by the offer segment.
- The Review screen lists each claim used, with its source link, beside the draft (brief rule 5).

## 4. Booking slot rendering per platform

Booking URLs come from the Social Monitoring settings (`cms_kv` key `social-monitoring`). They point at the app's real booking pages (10), and channel tracking uses the app's existing UTM attribution:

| Platform | `{{booking}}` renders as |
|---|---|
| facebook | "You can {action} here: {url}?utm_source=facebook&utm_medium=social-reply" (URL for the selected booking type) |
| instagram | "You can {action} through the link in our bio, or send us a DM and we'll get back to you." (Instagram comment links aren't clickable) |
| trustpilot / google | "You can {action} at heliaxis.co.uk/book or call us on 01633 965205." (`/book` redirects to the survey page with `utm_medium=review-reply`) |
| manual | As facebook, with `utm_source=manual` |

URLs: survey `/book-a-survey`, call `/book-a-call`, quote `/book-a-call?reason=quote`. The rendered booking sentence and the office phone number are exempt from G3 and G6.

Booking type defaults: safety → `call`; pricing or comparison → `quote`; installation complaint → `call`; general → `survey`. The model may change the booking type only within the script's `booking_types` list.

## 5. Drafting call

Prompt: `prompts/drafter.md`. Structured output:

```ts
const DraftChoice = z.object({
  script_id: z.string(),
  segments: z.array(z.object({
    segment_id: z.string(),
    variant_index: z.number().int().min(0),
    reworded_text: z.string().max(400).nullable(),   // allowed only where rewording = light
  })),
  slots: z.record(z.string(), z.string()),           // only enum slots declared in the script
  booking_type: z.enum(['survey','call','quote']),
  reviewer_note: z.string().max(300),                // shown to the reviewer, never in the reply
});
```

Validation in code (failures → retry once → `dlq.draft` → "Write manually"):
- `segment_id`s must equal the script's segments in order. `variant_index` must be in range.
- `reworded_text` must be null when the segment's `rewording = none`.
- For `light` rewording: token-level normalised Levenshtein similarity to the chosen variant ≥ **0.75**; no new digits, `£`, `%` or URLs; no capitalised word absent from the variant, the allow-list (G6) and the slots. If any check fails, the original variant is used instead (no error).
- Slot values must be members of the declared enum.

The draft stores: `script_id, script_version, text, segments_json, slots_json, booking_type, booking_url, fact_claim_ids, guardrail_result_json, rules_version, model_id, is_safety, requires_approval, text_sha256`.

## 6. Guardrails (`src/lib/social/rules/guardrails.ts`, lists in `config/guardrails.json`)

Run on **every** draft text, on generation **and** on every reviewer edit. Result: `{ pass: boolean, failures: [{ rule, detail, span }], warnings: [...] }`. Copy is disabled while `pass = false`.

| Id | Rule | Applies to | Override? |
|---|---|---|---|
| G1 | Banned phrases (global + script) | all | No |
| G2 | **Absolute and safety-certainty language.** Fails on the absolute word list (never, impossible, 100%, 100 percent, completely, totally, absolutely, guarantee(d), always, zero risk, no risk, risk-free, perfectly safe, entirely safe, fireproof, can't/cannot/won't catch fire, can't explode, nothing to worry about, no need to worry) | Safety drafts: anywhere in the text. Any draft: applies whenever the text contains a safety term (fire, safe, safety, burn, explode, overheat, smoke, gas, danger, risk) | **No** |
| G3 | **Unapproved factual claims.** Safety drafts: the stricter `G3_safety_rule` in guardrails.json applies (any sentence that is not fixed script text or an approved claim must contain no claim markers, safety terms or protective language such as "designed to", "automatically", "rare", "likely"). All drafts: each sentence containing a claim marker (digits, years, `certif*`, `accredit*`, `approved`, `tested`, `standard`, `compliant`, `regulation`, `warranty`, `guarantee`, cert/standard names such as MCS, IEC, BS, UL, CE, NICEIC, RECC, HIES, TrustMark, GoodWe protections) must equal, verbatim, either an approved Fact Sheet claim used by this draft or a fixed-text variant of the script. | all; safety drafts with no Fact Sheet: **any** claim marker fails | **No** for safety; Admin override with reason for non-safety |
| G4 | **Prices and offers.** `£`, `%`, `discount`, `off`, `deal`, `offer`, `save`, `cheaper`, `price match`, `free` must match an entry in the setting `approved_offers` (seed: "free survey", "free, no-obligation survey") | all | No |
| G5 | **Legal admissions.** our fault, we made a mistake, we were negligent, negligence, we accept liability, liable, we are responsible for the damage, we admit, compensation, compensate, we will refund, refund you, pay for the damage, breach | all ("sorry to hear" and "sorry this has happened" are allowed) | No |
| G6 | **Personal details.** Emails other than `@heliaxis.co.uk`; phone numbers other than `office_phone`; UK postcodes; house-number + street patterns; any capitalised token not in the allow-list (sentence-initial words checked against a dictionary of common words; allow-list = Heliaxis, platform names, towns in the service area, product brands in `config/guardrails.json`, month/day names, the commenter's first name, the sign-off) | all | Admin override with reason for non-safety only |
| G7 | **Competitor names** (from the `competitor` table plus the seed list) | all | No |
| G8 | **URLs** other than the booking URLs and `heliaxis.co.uk` paths | all | No |
| G9 | **Defensive or argumentative tone.** actually, to be clear, to clarify, you're wrong, you are wrong, misinformed, misunderstood, that's not true, not true, false, incorrect, as we said, as we already said, obviously, clearly you, with respect, calm down, if you had read, you should have, you need to understand, let me correct | all | No |
| G10 | **Ends with a next step.** The last two sentences contain the booking slot, a question mark, or "call", "message", "DM" or "get in touch". | all except Ignore | No |
| G11 | **Length.** ≤ 600 characters (Positive ≤ 280). Platform hard limits: Instagram 2,200; Google 4,096; Trustpilot 2,048 (T2.9 verifies) | all | No |
| G12 | **Echo / injection.** No run of 8 or more consecutive words copied from the comment; no text from the comment inside the reply except the first name | all | No |
| G13 | **Emoji.** None in Critical/High/safety drafts; at most 1 elsewhere | all | No |
| G14 | **UK spelling** (US→UK list, e.g. color, center, organize, apologize, favorite, program for scheme) | all | Warning only |

Overrides: `POST /drafts/:id/guardrail-override {rule, reason}` (Admin, non-safety drafts, listed rules only). It is audited and shown on the draft.

## 7. Member with access workflow and Copy gating

Draft statuses: `generating → ready → (approved) → copied → posted`, plus `stale`, `rejected`, `failed`, `no_script`.

- **Edit**: the reviewer edits the text in place. The server re-runs the guardrails and stores a `draft_edit` row (before, after, diff, user, time). For safety/Critical drafts, any edit **voids the approval** (`approved_text_sha256` ≠ `text_sha256`).
- **Regenerate**: new draft row (`reason: regenerate`); the old one becomes `superseded`. Limit: 5 per mention per hour.
- **Reject**: reason required (picklist: wrong tone, wrong facts, wrong script, not needed, other plus text). It feeds script improvement suggestions.
- **Approve** (Critical and safety only; Admin): stores `approved_by`, `approved_at`, `approved_text_sha256`. Allowed only if the guardrails pass.
- **Copy**: `POST /drafts/:id/copy` returns the final plain text (booking link already rendered). The client writes it to the clipboard; the server sets `copied_at`, `copied_by` and status `copied`. Denied with 409 `APPROVAL_REQUIRED` for Critical/safety drafts whose `approved_text_sha256 ≠ text_sha256`, and with 409 `GUARDRAIL_FAILED` if the guardrails fail. **Approval is the only gate besides the guardrails.**
- **Open on platform**: opens `commentPermalink` (or the post permalink) in a new tab, or in the native app on mobile.
- **Mark as Posted**: records `posted_by` and `posted_at`, and the mention status becomes `posted`. If the platform later returns a Heliaxis-authored reply in the thread, the system links it (`posted_platform_id`) and shows "Verified on platform". If the posted text differs from the copied text (similarity < 0.9), show "Posted text differs from approved draft" to an admin.
- **Edit learning**: if a script segment collects ≥ 3 edits in 30 days, or ≥ 3 rejections for the same reason, the Scripts screen shows a suggestion card with the edits side by side. "Create new version from these edits" opens a draft script version prefilled with them.

## 8. Script and rule changes require approval

- Script versions: anyone with access may create a draft version. **Only an admin may publish.** The previous version stays immutable; drafts reference `(script_id, version)`.
- Safety scripts and Fact Sheet versions: **Admin only** may publish or lock.
- `config/keywords.json` and `config/guardrails.json` change only via a code PR that passes both test sets. The UI shows them read-only, with a "Request change" form that creates a task for the developer.

## 9. Brand voice rules (used in the drafting prompt and in script review)

1. Professional and friendly; warm, never gushing.
2. Plain English. Any technical term gets a few-word definition ("an inverter, the box that turns the panels' power into household electricity").
3. Never talk down. Never imply the person should already know something.
4. Acknowledge before anything else. Never argue, correct or "clarify" in public.
5. One clear, low-pressure next step at the end: a question, an offer of a call, or the booking link.
6. Complex or angry cases move to a phone call or private message.
7. UK spelling. No exclamation marks in negative or safety replies. No emoji in negative or safety replies.
8. Never name competitors. Never mention prices or offers outside the approved list.
9. Keep it short: 2–4 sentences on social, up to 5 on reviews.
