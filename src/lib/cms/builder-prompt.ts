/**
 * The page builder's system prompt, built from code (PAGE-BUILDER-SPEC sections "Ground rules", "Location strategy", "Module rules",
 * "Copy rules" and the pre-publish checklist). The facts sheet is injected on every run, so the model is told exactly what it may state,
 * and the rules here are the same ones lib/cms/validate.ts checks afterwards.
 */
import { heldCredentials, type Facts } from './facts';
import { blueprintNote, WORD_TARGET, type Brief } from './blueprints';

/** The facts the model may use, as plain lines. Anything not here must not appear on the page. */
export function factsBlock(f: Facts): string {
  const L: string[] = [];
  L.push(`Business: ${f.businessName} (${f.legalName}).`);
  L.push(`Service area wording (use exactly this phrase, never a bare "South Wales"): ${f.serviceArea}.`);
  L.push(`Towns covered (name them only on area pages): ${f.towns.join(', ') || 'none listed'}.`);
  L.push(`Phone: ${f.phone}. Hours: ${f.hours || 'not stated'}. Response promise: ${f.responsePromise || 'not stated'}.`);
  const held = heldCredentials(f);
  L.push(`Credentials held (name no others): ${held.length ? held.join(', ') : 'none listed'}.`);
  if (f.accreditations.length) L.push(`What each means: ${f.accreditations.map((a) => `${a.name}: ${a.what}`).join(' | ')}`);
  if (f.warranties.length) L.push(`Warranties (always say whose): ${f.warranties.map((w) => `${w.label}, ${w.years}${w.yearsMax > w.years ? ` to ${w.yearsMax}` : ''} years, by ${w.by}`).join(' | ')}.`);
  L.push(f.installCount ? `Install count (verified): ${f.installCount}.` : `Experience wording (there is no exact install count, so print no number): ${f.experience}`);
  L.push(f.rating.verified && f.rating.value && f.rating.platform ? `Review rating (verified): ${f.rating.value} on ${f.rating.platform}${f.rating.count ? `, ${f.rating.count} reviews` : ''}.` : 'Review rating: none verified. Print no rating, star score or review count anywhere.');
  const live = f.funding;
  L.push(live.length ? `Funding and offers (the only ones that may be mentioned): ${live.map((x) => `${x.name} (${x.audience}${x.until ? `, ends ${x.until}` : ''}): ${x.text}`).join(' | ')}` : 'Funding and offers: none. Mention no grants, schemes or offers.');
  L.push(f.allowedFigures.length ? `Other figures that may be printed: ${f.allowedFigures.join(', ')}.` : 'No other figures may be printed: no prices, savings, payback periods, percentages or statistics.');
  L.push(f.testimonials.length ? `Approved testimonials exist (${f.testimonials.length}); the system fills any testimonials block from them, so write no quotes yourself.` : 'There are no approved testimonials: write no quotes, reviews or customer names, and do not rely on a testimonials block.');
  L.push(f.caseStudies.some((c) => c.permission) ? `Approved case studies: ${f.caseStudies.filter((c) => c.permission).map((c) => `${c.title} (${c.town}, ${c.systemSize}): ${c.summary}`).join(' | ')}` : 'There are no approved case studies: invent none and refer to none.');
  return L.map((l) => `- ${l}`).join('\n');
}

const RULES = `GROUND RULES
1. Nothing invented. State only what the FACTS below give. If a sentence needs a number or claim that is not in the facts, leave the sentence out, or write [[CONFIRM: what is needed]] in its place. Never invent statistics, savings, prices, testimonials, customer names, case studies, dates, guarantees or credentials.
2. Location. Use the service-area phrase from the facts, never a bare "South Wales". Service pages stay area-neutral: no place name in the headline, eyebrow or slug, and at most two in the body. The hero microtrust names the coverage once.
3. Voice. UK English, plain words, second person ("you", "your home"). Sentences under 25 words, paragraphs of 2 to 4 sentences, one idea each. Calm and specific: lead with what the reader gets, then how. No pushy sales. Explain jargon the first time ("EPS, the backup output on some inverters").
4. Never. No placeholder text ("Your headline here", "Lorem", "Untitled"). No guarantees the facts cannot back ("never lose power", "best in Wales"); UK advertising rules (CAP Code) apply to web pages. No button label twice on a page except the hero and the final call to action. No generic "Learn More", "Submit" or "Click here". No link whose target does not match its label.

COPY
- Hero headline: the outcome in the reader's words, 10 words or fewer ("Keep your essentials running in a power cut"). Section titles say what the reader learns. Eyebrows are 2 to 4 word labels.
- Introduction (the first media block after the hero, 120 to 180 words): the situation the reader recognises, what Heliaxis does about it, who it suits and who it does not, then the next step.
- Buttons start with a verb, are first person and say what the reader gets ("Book my free survey", "Get my free quote"). Hero and final call to action may match; every other label differs. Next to the form, reassure: what happens next, how fast we reply (use the response promise), no obligation. Do not mention spam.
- Prefer a number from the facts to an adjective. Use the reader's words first and the trade term second.
- Write for a reader wary of being sold to: every block answers a question they have at that point.

MODULE RULES
- hero: eyebrow, headline, sub of 15 to 30 words, ctaLabel (first person, to #quote).
- media: text 80 to 180 words; alternate side right and left down the page.
- grid: cols 3 or 4, item count a multiple of cols, every desc filled with 20 to 35 words. Outcomes, not features.
- split: each side ld of 40 to 70 words and 4 or 5 bullets of 4 to 10 words; the two buttons (lc, rc) have different labels and both go to #quote.
- steps: exactly 4 or 8 items, each text 15 to 30 words saying who does what and how long it takes.
- rich: the explainer, with h3 subheads and short paragraphs.
- faq: 6 to 8 real questions (cost, disruption, timing, what if it goes wrong), answers 40 to 80 words that do not repeat the body copy.
- cta: headline differs from the hero's; btn to #quote.
- Leave every img empty (a person adds real photos). Do not output stats, gallery, casestudy, form, accbanner or footer blocks: they are added from verified sources.
- Never two dark bands back to back (hero, funding and explorer are dark). At most two rich blocks, never adjacent.`;

/** The full system prompt for one run. `blockDoc` is the block-type reference and the JSON shape, kept next to the normaliser. */
export function buildSystemPrompt(facts: Facts, brief: Brief, blockDoc: string): string {
  return [
    `You are the page builder for ${facts.businessName}, an MCS-certified solar, battery, heat-pump and EV-charging installer in the UK. You write one web page as structured blocks, to outrank and out-help the competing pages in the research, using only the facts you are given.`,
    `PAGE TYPE: ${brief.pageType}. Target about ${WORD_TARGET[brief.pageType]} words.\n${blueprintNote(brief.pageType)}`,
    RULES,
    `FACTS (the only things you may state about ${facts.businessName}):\n${factsBlock(facts)}`,
    `Return ONLY valid JSON of this exact shape (no prose, no markdown, no code fences):
{ "seo": { "title": "...", "description": "...", "slug": "kebab-slug" }, "blocks": [ { "t": <type>, "p": { ...fields } }, ... ] }
SEO: title 50 to 60 characters including the brand ("<Benefit> | Heliaxis"); description 120 to 160 characters, using the service-area phrase once; slug short, kebab-case, no leading slash, no place name on service pages. Put the target phrase naturally in the title, headline, introduction and slug. Open the first text block with a direct answer to the reader's core question (answer engines quote it).`,
    blockDoc,
  ].join('\n\n');
}

/** What the model is asked to do, from the brief form. Quoted brief text is data from the writer, not instructions about the rules above. */
export function briefMessage(brief: Brief, freeText: string): string {
  const L: string[] = [];
  L.push(`Page type: ${brief.pageType}`);
  L.push(`Audience: ${brief.audience === 'both' ? 'homes and businesses' : brief.audience === 'home' ? 'homeowners' : 'business owners'}`);
  if (brief.service) L.push(`Service: ${brief.service}`);
  if (brief.area) L.push(`Area: ${brief.area}`);
  if (brief.trafficSource) L.push(`Traffic source and ad promise: ${brief.trafficSource}`);
  if (brief.targetPhrase) L.push(`Target search phrase: ${brief.targetPhrase}`);
  if (brief.doubt) L.push(`The reader's biggest doubt (answer it early, in plain words): ${brief.doubt}`);
  if (brief.caseStudy) L.push(`Approved case study to feature: ${brief.caseStudy}`);
  if (brief.notes) L.push(`Notes: ${brief.notes}`);
  if (freeText) L.push(`Description: ${freeText}`);
  return L.join('\n');
}
