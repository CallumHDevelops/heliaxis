# Heliaxis: AI built into the platform

A review of every place the platform uses AI, written from the code as it stands. Costs are rough estimates from the price table in the code (`src/lib/social/costs.ts`); the real figures will appear on **CMS → AI costs** once `supabase/ai-usage.sql` has been run.

## At a glance

| # | Feature | Where | What the AI does | Model |
|---|---|---|---|---|
| 1 | Proposal reader | Quote builder | Reads an uploaded OpenSolar PDF and copies out its figures | Claude Haiku (default) |
| 2 | Introduction writer | Quote builder | Writes the quote's cover letter | Claude Haiku (default) |
| 3 | "What is included" writer | Quote builder | Writes the formal scope paragraphs | Claude Haiku (default) |
| 4 | Metis, the CRM assistant | Assistant page | Turns talk into tasks, notes, contacts and message drafts | Claude Opus 5.5 |
| 5 | MCS certificate reader | Job documents | Reads the certificate number off an uploaded certificate | Claude Opus 5.5 |
| 6 | Label and photo reader | Site commissioning forms | Reads serials, make, model and ratings off equipment photos | Claude Opus 5.5 |
| 7 | Social comment sorting | Social monitoring | Classifies comments and reviews (type, severity, sentiment) | Claude Haiku (default) |
| 8 | Social reply drafts | Social monitoring | Chooses an approved reply script and wording options | Claude Haiku (default) |
| 9 | AI-answer sampling | Social monitoring, competitors | Asks an AI assistant local questions and records which businesses it names | Claude Sonnet 5.5 with web search |
| 10 | Blog article generator | CMS, Blog | Drafts an article from a brief | Claude Sonnet 5.5 (or OpenRouter) |
| 11 | CMS page generator | CMS | Drafts a page as website blocks | OpenRouter-style model (configurable) |

Everything the AI produces is a **suggestion for a person to check**. Nothing is sent to a customer, posted to social media or published by the AI by itself.

## What is not AI

Worth saying clearly, because it is easy to assume otherwise. These are ordinary, predictable code:

- **The quote PDF and its design pages**, the contents page, page numbers, QR codes, accept button and signatures.
- **The savings and payback recalculation** on the interactive proposal (`roi.ts`), the year-by-year sums, the charts and the yearly energy flows.
- **The "How your system works" diagram** and its moments of the day.
- **The solar estimator's roof analysis**: it uses Google's Solar API plus the PVGIS sun data, with our own panel-fitting maths.
- **Keyword rules and guardrails** around the social monitoring, which run before and after the AI step.

## The features in detail

### 1. Proposal reader (quote builder)
- **Does:** when you upload an OpenSolar PDF, sends its first 24 pages to Claude, which copies out: system size, panels, inverter, battery, warranties, yearly generation, the monthly figures, the tariff, the MCS data, the environmental figures and the net system price.
- **Rule it follows:** copy only what is printed; use "not printed" for anything missing; never work anything out or guess.
- **Checks on the answer:** the reply is validated and cleaned (numbers rounded, text trimmed) before it is kept. It is shown to you to check before use.
- **Data sent to Anthropic:** the proposal PDF (customer name and address appear in it).
- **If it fails:** a clear message ("It couldn't make sense of that file this time. Try again."), and the real error is written to the server log.
- **Rough cost:** a few pence per proposal.

### 2 and 3. Introduction and "What is included" writers
- **Do:** write the cover letter and the formal "This quote includes…" paragraphs from the quote's items. With no items yet, they work from the equipment in the uploaded design proposal.
- **Safeguards in the instructions:** formal British English, no hype, no prices, no savings claims, no invented warranties, certifications or timescales. Only items, design-proposal facts and the key points you give.
- **Safeguards in the code:** an answer cut off by the length limit is never used; the system falls back to a rule-written version instead. With no AI key it uses the rule-written version too, so a quote can always be made.
- **Shown as:** the spark animation while writing.
- **Rough cost:** a fraction of a penny each time (rewrites cost again).

### 4. Metis, the CRM assistant
- **Does:** takes rambling or voice-typed messages after a meeting and creates tasks, notes, next steps, contacts and opportunities, drafts emails and WhatsApps, finds customers, shows "my day", and answers "how do I…" questions from the Help section.
- **Tools it has (14):** add contact, add note, create opportunity, create task, draft email, draft WhatsApp, find contact, find organisation, get customer, list team, my day, search customers, search help, set next step.
- **Hard limit:** it **cannot send anything to a customer**. Emails and WhatsApps are saved as drafts for a person to check and send.
- **Other rules:** it must not invent prices, dates or technical promises; "how do I" answers come only from the Help articles.
- **Model:** Claude Opus 5.5, with a server-side fallback if the model declines a request. A refused turn is not kept.
- **Data sent to Anthropic:** the conversation and whatever CRM details its tools fetch (customer names, contact details, notes).
- **Rough cost:** the dearest feature per use, in the region of a few pence per message with tool use.

### 5 and 6. Certificate and label readers
- **MCS certificate reader:** reads the certificate number from an uploaded certificate (PDF or image) when a document is added to a job.
- **Label reader:** reads a photo of an equipment label or data badge in the site commissioning forms: make, model, serials, and the printed ratings (panel watts and voltages, battery kWh, and so on).
- **Safeguard:** a read is only ever a suggestion. Nothing is saved into the answers until a person taps the tick or types over it. The photo goes as data from storage, so no public link to it leaves the system.
- **Model:** Claude Opus 5.5. This is more than reading a printed number needs (see recommendations).

### 7 and 8. Social monitoring: sorting comments and drafting replies
- **Sorting:** each comment or review is classified by type (quote request, question, positive, complaint, general, spam), severity, sentiment, whether it is safety-related, whether it looks like an attempt to manipulate the AI, topics and language.
- **Two layers:** a keyword layer runs first. The AI can **raise** a severity but can **never lower** one the keywords found.
- **Drafting:** the AI only **chooses**: which approved script, which wording variants, which fixed options. The code writes the actual text from approved wording, then runs the guardrails. If the AI answers badly or there is no key, the first eligible script is used, so a draft always exists.
- **Nothing is posted:** a person copies the reply.
- **Cost control:** every call is logged in `social_usage`, with a monthly cap you set on the Costs report.

### 9. AI-answer sampling (competitors)
- **Does:** once a month, asks Claude (with web search) the local questions a customer might ask, and records which businesses it names. Used for the competitor and "AI answers" view.
- **Labelling:** answers are marked as an "API sample", because they can differ from what consumer chat apps say.
- **Cost control:** it stops by itself when the month's AI spend reaches the cap. It is the one feature with a per-search charge as well as token cost.
- **Legal:** there is a sign-off page for the competitor monitoring.

### 10. Blog article generator
- **Does:** drafts a full article, with a structured template, from a short brief, keyword and audience.
- **Model:** Claude Sonnet 5.5 when the Anthropic key is set; otherwise an OpenRouter model (defaults to `openai/gpt-4o-mini`).
- **Access:** admins only. A person reviews and publishes.
- **Rough cost:** around ten pence per article.

### 11. CMS page generator
- **Does:** drafts a website page as blocks, from a prompt.
- **Safeguards:** the AI may only use an allow-list of block types and fields; everything else it emits is discarded. It never supplies real image assets, and out-of-range values are corrected. A truncated answer is repaired where possible.
- **Access:** admins only.
- **Model:** configured through `AI_MODEL`, `AI_PAGE_MODEL`, `AI_BASE_URL` and the OpenRouter-style key.

## Settings that control it

| Setting (Vercel) | Used for |
|---|---|
| `ANTHROPIC_API_KEY` | Features 1 to 10. Without it, writers use rule-written text and the readers do nothing. |
| `QUOTE_READER_MODEL`, `QUOTE_WRITER_MODEL` | Override the quote model (default Haiku) |
| `SOCIAL_CLASSIFIER_MODEL`, `SOCIAL_DRAFTER_MODEL`, `SOCIAL_GEO_MODEL` | Override the social models |
| `AI_BLOG_CLAUDE_MODEL`, `AI_BLOG_MODEL` | Blog model |
| `OPENROUTER_API_KEY` or `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`, `AI_PAGE_MODEL` | The OpenRouter-style route (CMS page generator and blog fallback) |

The proposal reader has run successfully on a real OpenSolar file on the live site, so the Anthropic key is in place. Whether the OpenRouter-style key is set I cannot see from the code.

## Privacy and data

- Anthropic is already named as a data processor in the privacy policy, with a line about the admin assistant.
- Customer data reaches Anthropic in features 1, 4, 5, 6, 7, 8 (comment text) and 3 and 2 (item lists and facts).
- Nothing is sent to Anthropic from the customer-facing website or the customer portal. The customer never talks to an AI.
- If the policy wording is to stay accurate, it should also mention that uploaded design proposals and equipment photos are read by AI. Worth a look when you next update it.

## Cost tracking

- **New:** `CMS → AI costs` shows this month, the last 120 days, the average cost of a quote with a proposal, a per-quote table (reading, introduction, What is included) and a by-feature table. It needs `supabase/ai-usage.sql` to be run once. It records the quote features, the MCS and label readers, the blog (Claude path) and the assistant.
- **Existing:** the social features record to `social_usage` and are included on the same page. They also have their own report with a monthly cap.
- **Not yet recorded:** the CMS page generator, and the blog when it runs through OpenRouter. Those two bypass the new logging.

## Rough cost per use (estimates, to be replaced by real figures)

| Use | Estimate |
|---|---|
| Reading one OpenSolar proposal | a few pence |
| One introduction or What-is-included write | well under 1p |
| One assistant message with tools | a few pence |
| One label or certificate read | about 1p (Opus) |
| One blog article | about 10p |
| Monthly AI-answer sampling | a few pounds at most, capped |

## Recommendations

1. **Run `supabase/ai-usage.sql`** so the AI costs page starts filling in. Check the first real proposal's cost against the estimate above.
2. **Move the MCS certificate and label readers to a cheaper model.** They currently use Opus. Reading a printed number off a label is well within Haiku or Sonnet, which would cut their cost several-fold. Worth trying on a handful of real photos first, because accuracy matters more than cost here.
3. **Add a single monthly AI budget** across everything. Only the social features have a cap today. The quote writers, assistant and readers have none.
4. **Log the two uncovered paths** (CMS page generator, blog via OpenRouter) so the cost page shows the full bill.
5. **Update the privacy policy line** to mention uploaded proposals and equipment photos.
6. **Keep a person in the loop** exactly as it is now. The strongest part of the design is that every output is a draft or a suggestion, and that rules sit on both sides of the AI step in the social features.

## What I have not been able to check

- Real monthly spend: nothing was being logged before the cost log was added.
- Live behaviour of the OpenRouter-style route and the CMS page generator, which depend on keys I cannot see.
- The accuracy of the readers across a wide range of real files. The proposal reader has so far read one real OpenSolar file on the live site; more files will show how consistent it is.
