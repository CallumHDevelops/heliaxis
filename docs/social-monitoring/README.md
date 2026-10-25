# Heliaxis Social Monitoring: build spec

Engineering spec for **Operations › Social Monitoring**, built inside the existing Heliaxis app (`CallumHDevelops/heliaxis`: Next.js on Vercel, Supabase), written by Opus from Cal's brief of 25 October 2026, for Sonnet to build ticket by ticket.

**Start here:** Cal reads `00-decisions-and-open-questions.md` and answers section D. Sonnet starts at `13-tickets.md`, T0.1, working in the Heliaxis repo.

| File | What it covers |
|---|---|
| `00-decisions-and-open-questions.md` | Decisions (incl. Cal's answers of 25 Oct), what was confirmed from the app's code, platform facts verified in Oct 2026, the remaining questions |
| `01-architecture.md` | How it fits into the existing app: what is reused, the comment flow, file layout, jobs, read-only enforcement, keys |
| `02-connectors.md` | Connector contract, ingestion rules, Facebook, Instagram, Google, Trustpilot, email fallback, manual paste |
| `03-classifier.md` | Keyword layer, model layer, combination/repeat/thread/edit rules, failure handling, test-set release gate |
| `04-reply-engine.md` | Script format, selection, the locked safety template, Fact Sheet, booking slot, guardrails G1–G14, reviewer workflow, brand voice |
| `05-alerts.md` | Simple notifications through the app's `notify()` to everyone with Social monitoring access; daily check |
| `06-app-screens.md` | Wireframes and states for every screen, roles matrix, status transitions |
| `07-api.md` | Every route with payloads and errors |
| `08-insights.md` | Metric catalogue, snapshots, views, weekly summary, exports |
| `09-competitors-seo-geo.md` | Collection methods and legal position, competitor set, views, SEO and AI-answer tracking |
| `10-booking.md` | Header button, booking portal requirements B1–B15 |
| `11-security-compliance.md` | Secrets, audit log, UK GDPR, prompt injection, reliability |
| `12-acceptance-tests.md` | Always-on gates and per-phase acceptance tests |
| `13-tickets.md` | Tickets, each sized for one Sonnet session, all in the Heliaxis repo |
| `supabase/*.sql` | Supabase schema in the app's style (re-runnable; tested on Postgres 16: applies twice cleanly, safety constraints hold) |
| `config/keywords.json` | Keyword layer: 20 categories incl. misspellings, leetspeak, Welsh |
| `config/guardrails.json` | Guardrail data |
| `config/scripts.seed.yaml` | 12 initial scripts with variants and 3 examples each (all pass the guardrails) |
| `config/settings.defaults.json` | Default business settings |
| `prompts/*.md` | Classifier, drafter, summary, research and GEO prompts |
| `tests/fixtures/classifier-testset.jsonl` | **234 labelled comments**, incl. the GoodWe case |
| `tests/fixtures/guardrail-cases.jsonl` | 41 guardrail cases, incl. a paraphrase of the improvised GoodWe reply (must fail) |

## The safety path in one paragraph

A comment arrives by webhook (or a 2-minute poll as backup) and is saved first. The deterministic keyword layer runs straight away. Any fire, burn, explode, overheat, smoke, gas, danger, injury, insurance or emergency term makes it **Critical**, and the app's existing `notify()` immediately sends one notification (bell, phone and browser) to everyone with Social monitoring access, without waiting for the AI. The AI can only raise severity. The draft is assembled from the locked `safety-concern` script, with no free text and no factual claims (there is no Fact Sheet at launch). It passes deterministic guardrails, and **cannot be copied until an admin approves the exact text**. Nothing is ever posted by the system: social code can only make read requests to the platforms.

## Known limitations, stated rather than hidden

- Without a Fact Sheet, replies explain process, not product facts. Cal can add approved fixed-text variants later.
- The broad keywords in the brief (gas, insurance, 🔥) will produce some false Criticals. This is by design, and it is reviewed after 4 weeks (T5.6).
- Notifications are deliberately simple (no SMS, calls or repeats). iPhone Focus or Silent mode can hold them, so the bell, the Needs attention panel and the Inbox's waiting time are the backstop.
- Competitor Google and Facebook history is manual until the legal check allows more (09 §2).
