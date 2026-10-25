# 03 · Classification and risk triage

Two layers. **Layer 1 (keyword) is deterministic, runs first, synchronously, and cannot be skipped or disabled by any setting.** Layer 2 (Claude) reads context, sarcasm and intent. The final severity is the **higher** of the two, plus the adjustment rules in §5–§7.

Severity order (rank): `ignore` 0 < `positive` 1 < `low` 2 < `medium` 3 < `high` 4 < `critical` 5.

## 1. Outputs stored per classification (`classification` table)

`mention_id, mention_version, severity, keyword_severity, model_severity, adjustments[] (rule ids applied), topics[], sentiment (positive|neutral|negative|mixed), language (ISO 639-1, e.g. en, cy), reason (one sentence, ≤ 200 chars), confidence (0–1), safety_related (bool), rule_hits[] ({ruleId, term, category, matchedText, variant}), model_id, model_status (ok|failed|refused|skipped), injection_suspected (bool), rules_version, created_at`.

Topics enum: `safety, pricing, installation, service, battery, panels, heat_pump, finance, warranty, competitor, legal, privacy, booking, praise, spam, other`. (`heat_pump` and `warranty`, `competitor`, `legal`, `privacy`, `booking`, `praise`, `spam` were added to the brief's list because the scripts need them. `other` remains.)

## 2. Layer 1: normalisation (`src/lib/social/rules/normalise.ts`)

Given the text `t`, produce **four variants**. Every pattern is tested against every variant, and a match in any variant is a hit (the variant name is recorded):

1. `basic`: Unicode NFKC → lowercase → curly quotes/apostrophes to straight → collapse whitespace → strip zero-width characters.
2. `squeezed`: `basic` with runs of the same letter collapsed to one (`fiiiire` → `fire`, `smokeee` → `smoke`). Patterns are squeezed the same way before comparison (`too hot` → `to hot`).
3. `deleet`: `basic` with `0→o, 1→i, 3→e, 4→a, 5→s, 7→t, @→a, $→s, !→i` applied **only inside tokens that contain at least one letter** (so "999" is untouched), then squeezed.
4. `despaced`: in `basic`, sequences of single characters separated by single spaces, dots, dashes or asterisks are joined (`f i r e`, `f.i.r.e`, `f-i-r-e`, `f*re` → `fire`/`f*re`). Asterisk-censored words are also matched by the `censored` patterns in keywords.json.

Diacritics are **not** stripped (Welsh `tân` must not become English `tan`). Welsh patterns are written with and without circumflex (`tân`, `tan` only inside the phrases `ar dan`, `gwasanaeth tan`, `brigad dan`).

Matching:
- `word` patterns: whole-word match using `(?<![\p{L}\p{N}])term(?![\p{L}\p{N}])` with the `u` flag.
- `phrase` patterns: whole-word at both ends, with internal whitespace matching `[\s\-]+`.
- `prefix` patterns: word-start match (`overheat` matches `overheating`, `overheated`).
- `emoji` patterns: literal code-point match, ignoring variation selectors.
- `regex` patterns: as written (used sparingly, each with a test).

Performance: compile once at start-up; budget < 5 ms per comment.

## 3. Layer 1: keyword categories → severity

The full lists are in `config/keywords.json`. Summary:

| Category id | Severity | Topic tags | Contents (summary) |
|---|---|---|---|
| `safety_fire` | critical | safety | spark/sparks/sparking/arcing, fire/fires/fired/on fire/catch fire/caught fire/burn the house down/fire risk/fire hazard/firework/fireproof/wildfire, misspellings (fier, fyre, fiar), 🔥 🧯 |
| `safety_burn` | critical | safety | burn/burns/burnt/burned/burning, burning smell, scorch, singe, smoulder, melt/melted/melting |
| `safety_explode` | critical | safety | explode/exploded/exploding/explosion/explosive, blow up/blew up/blown up/blowing up, went bang, time bomb, bomb, 💥, misspellings (expode, exploed, explod) |
| `safety_overheat` | critical | safety | overheat*, over heat*, too hot, red hot, hot to the touch, very hot, getting hot, thermal runaway, thermal event, runaway |
| `safety_smoke_gas` | critical | safety | smoke/smoking/smoky, fumes, toxic, acrid, gas/gases/gassing/off-gassing, venting, hydrogen, propane, refrigerant leak, R290, carbon monoxide |
| `safety_danger` | critical | safety | danger/dangerous/hazard/hazardous, death trap, accident waiting to happen, unsafe, not safe, isn't safe, is it safe, are they safe, how safe, safety concern/issue/risk, battery safety, safe to have/install, ⚠️ ☠️ (bare "safety" is left to the model, so praise like "great attention to safety" is not forced Critical) |
| `safety_injury` | critical | safety | injury/injuries/injured/injure, hurt, hospital, A&E, electric shock, got a shock, electrocuted/electrocution, killed, kill someone, fatal, died, death |
| `safety_insurance` | critical | safety, legal | insurance, insurer(s), insured, uninsured, loss adjuster |
| `safety_emergency` | critical | safety | fire brigade, fire service, fire department, firefighter(s), fireman/firemen, fire and rescue, 999, emergency services |
| `legal_threat` | critical | legal | solicitor, lawyer, legal action, sue/suing/sued, lawsuit, court, small claims, letter before action, CCJ, barrister |
| `regulator` | critical | legal | Ofgem, HSE, Health and Safety Executive, building control, trading standards, Citizens Advice, ombudsman, FCA, Financial Conduct Authority, ASA, Advertising Standards, ICO / Information Commissioner. Also threats to report: "report you", "reporting you" (in `legal_threat`) |
| `certification_body` | high | legal | MCS, RECC, HIES, TrustMark, NICEIC, NAPIT, consumer code. **High, not Critical:** these are certification schemes, and customers often ask "are you MCS registered?". A complaint to one of them ("I'm reporting you to MCS") is Critical through the "report you" phrase |
| `media` | high | service | Watchdog, journalist, newspaper, WalesOnline, BBC, ITV, Rip Off Britain, "going to the papers" |
| `privacy` | critical | privacy | GDPR, data protection, data breach, my data, my details, personal data, privacy, hacked, sold my number/details, cold call(ed/ing), nuisance call(s) |
| `fraud` | critical | legal | scam/scams/scammer/scammed, fraud/fraudulent/fraudster, con man/conman/con artist, mis-sold/missold/mis sold, stole/stolen/theft, criminal, police |
| `welsh_safety` | critical | safety | tân (and mutations dân, nhân, thân), beryglus, losgi, fwg, ar dân, llosgi, llosg, ffrwydro, ffrwydrad, gorboethi, rhy boeth, mwg, nwy, perygl, peryglus, anniogel, ddim yn ddiogel, diogelwch, anaf, anafu, anafwyd, yswiriant, gwasanaeth tân, brigâd dân, diffoddwyr tân |
| `welsh_legal_fraud` | critical | legal | cyfreithiwr, twyll, sgam, llys |
| `complaint` | high | service | refund, money back, chargeback, made/formal/raise a complaint, complained to/about, cancel my, rip off/ripped off, cowboy(s), liar(s)/lied/lying, misleading, false advertising ("pushy" and "hard sell" are left to the model because praise often says "not pushy", "no hard sell") |
| `fault` | high | installation | not working, stopped working, broken, faulty, a fault / fault with, leak/leaking, damp, roof damage, damaged, caused damage (not "damage to", which matches "no damage to the roof"), cracked, tripping, error code, offline, not generating/charging |
| `service_failure` | high | service | no one called, nobody called, no response, ignored, ghosted, still waiting, waiting weeks/months, chasing, unreturned, never turned up, no show, delayed, never heard back, no aftercare |
| `strong_negative` | high | service | worst, awful, terrible, appalling, disgraceful, disgusting, shocking, useless, rubbish, joke of a company, never again, avoid them / avoid this company, stay away, do not use, unprofessional, nightmare, would not recommend, waste of money, one star |

High-category lists are deliberately phrase-based where a bare word would also appear in praise ("no complaints", "no faults", "helped us avoid big bills"). The keyword layer can only raise severity, so a false High could not be corrected by the model. Safety categories make no such concession.

Rules:
- The MUST list in the brief (fire, burn, explode, overheat, thermal runaway, smoke, gas, danger, unsafe, injury, insurance, fire brigade) is covered by the `safety_*` categories. **There is no exclusion list and no allow-list.** "Gas boiler" is Critical. This is intentional (00 Q6).
- Keyword Critical always sets `safety_related = true` for any `safety_*` or `welsh_safety` category.
- The keyword layer never returns `positive`, `low` or `ignore`. No hit means `null`.

## 4. Layer 2: model classification

Prompt: `prompts/classifier.md`. Call: `client.messages.parse` with `zodOutputFormat(ModelClassification)`, `model: claude-opus-5-5`, `output_config: { effort: 'low', format }`, server-side fallbacks.

```ts
const ModelClassification = z.object({
  severity: z.enum(['critical','high','medium','low','positive','ignore']),
  safety_related: z.boolean(),
  topics: z.array(z.enum([...TOPICS])).min(1).max(5),
  sentiment: z.enum(['positive','neutral','negative','mixed']),
  language: z.string().regex(/^[a-z]{2}$/),
  reason: z.string().max(200),
  confidence: z.number().min(0).max(1),
  is_question: z.boolean(),
  mentions_competitor: z.boolean(),
  injection_suspected: z.boolean(),
  needs_private_followup: z.boolean(),
});
```

Model input (and nothing else): the comment text (in `<comment>` tags, escaped), the platform, star rating if any, the post caption excerpt (≤ 500 chars), up to 5 earlier comments in the same thread (excerpts ≤ 300 chars each, author names replaced by `Commenter A/B/…`), and whether the parent is a Heliaxis reply. **No customer records, no other personal data.**

Post-processing:
- `safety_related = true` → model severity raised to `critical`. (The model can find safety issues the keywords miss, e.g. "the box in the garage is hissing and smells funny".)
- Output that fails the zod schema → retry once, then treat as a model failure (§6).
- The model output can only set classification fields. It cannot trigger any action, change settings or select recipients.

## 5. Combination and adjustment rules (`src/lib/social/rules/combine.ts`)

Applied in order. Every applied rule's id is stored in `adjustments[]`.

| Id | Rule |
|---|---|
| C1 | `severity = max(keyword_severity, model_severity)` |
| C2 | Review rating 1 or 2 → at least `high`. Rating 3 → at least `medium`. |
| C3 | **Low-confidence escalation:** if `model.confidence < 0.70` and `sentiment ∈ {negative, mixed}` → raise one level (`high` → `critical` included). |
| C4 | If `model.injection_suspected` → at least `medium`, and add the reviewer note "Comment may contain instructions aimed at the bot; draft generated from script only." |
| C5 | `ignore` is only allowed when `keyword_severity` is null **and** the model says `ignore` with confidence ≥ 0.85. Otherwise `ignore` becomes `low`. |
| R1 | **Repeat commenter:** same `author_hash` on the same platform with ≥ 2 other negative mentions in the last 30 days → raise one level (max `critical`) and add tag `repeat_commenter`. |
| R2 | **Open Critical by same author:** if the author has any open Critical mention, the new mention is at least `high`. |
| T1 | **Thread inheritance:** a reply whose thread root or parent is an open `critical` mention is at least `high`. A reply under an open `high` is at least `medium`. |
| T2 | **Post spike:** ≥ 3 mentions with negative sentiment on the same post within 60 minutes → create one `high` system alert "Negative spike on post …" (idempotency key `spike:{postId}:{hourBucket}`). Mention severities are unchanged. |
| T3 | **Thread escalation:** if a thread already has a Heliaxis reply marked Posted and the original author replies with negative sentiment → at least `high`, with tag `escalating_thread`. |

## 6. Failure handling

| Situation | Behaviour |
|---|---|
| Model call fails after all retries, is refused (`stop_reason: refusal` after fallbacks), times out, or returns invalid output | `model_status = failed`. `severity = max(keyword_severity, high)`. Push a **High** alert (or Critical if the keyword says so) with the note "AI classification unavailable, please read manually". Raise a Warning to the admin if more than 3 failures in 15 minutes. Re-queue the model classification every 10 minutes for 2 hours. A later success may **raise** severity but never lowers it automatically. |
| Keyword layer throws (should be impossible; it is a pure function) | Treat as `critical`, alert, log an error. |
| Classification not finished 60 s after ingest | `sla.tick` raises a Warning, and the mention shows in the Inbox as "Unclassified" in red at the top. |

## 7. Edits after classification or drafting

When a mention's text changes (new `mention_version`):

1. Re-run both layers on the new text. Store a new `classification` row (old rows kept).
2. If the new severity is **higher** → new alert for the new severity (idempotency key includes the version).
3. If the new severity is **lower** → keep the higher severity for SLA and alert state (no automatic downgrade). Show a "Comment edited, severity may have changed" chip; an Admin can downgrade manually (00 Q10).
4. Any draft not yet Posted → status `stale`, Copy disabled, a new draft generated against the new text. Critical approval is voided.
5. If a draft was already **Posted** → mention status returns to `in_review` with the banner "Edited after we replied", and the assignee is notified (in-app badge; push if the new severity is High+).

## 8. Test set and release gate

- `tests/fixtures/classifier-testset.jsonl`: **234 labelled examples** (see the file), including the GoodWe reference case, misspellings, Welsh, sarcasm, injection attempts, false-positive-by-design cases ("gas boiler"), and Positive/Ignore cases.
- Each record: `id, platform, rating, text, expected_severity, expected_min_severity, must_keyword_hit (bool), expected_topics, notes`.
- `pnpm test:classifier` runs both layers (the model layer against the live API in CI with a dedicated key; the keyword layer offline).
- **Release gate (all must pass):**
  1. Keyword layer: 100% of `must_keyword_hit = true` records produce a keyword hit of the expected severity. (Offline, deterministic, runs on every PR.)
  2. Combined: **100% of `expected_severity = critical` records end Critical** (zero missed Criticals).
  3. Combined: zero records with expected `high` that end below `high`.
  4. Combined: ≥ 90% exact severity match overall.
  5. Combined: zero records with expected severity other than `ignore` that end `ignore`.
- Runs on every change to `config/keywords.json`, `prompts/classifier.md`, `combine.ts` or the model id, and nightly. Results are stored in `classifier_eval_run` and shown to an admin in Scripts › Rules.
- **The GoodWe case is a named test (`goodwe-reference`) that also runs end to end in the Phase 1 gate (12 §2).**
