/**
 * How Hestia learns from rated answers. Pure functions (no database), so the personal-data filter and the
 * retrieval can be tested on their own. Nothing here reaches a customer unless staff approved it first, and
 * nothing is approved unless it passes `isGeneral` (checked again on the server at approval time).
 */

export type Diagnosis = 'wrong_fact' | 'missing_fact' | 'tone' | 'should_hand_off' | 'invented' | 'other';

export const DIAGNOSIS_LABEL: Record<Diagnosis, string> = {
  wrong_fact: 'Wrong fact',
  missing_fact: 'Missing fact on the portal',
  tone: 'Tone or wording',
  should_hand_off: 'Should have handed off to Messages',
  invented: 'Invented something',
  other: 'Something else',
};

export const DIAGNOSES = Object.keys(DIAGNOSIS_LABEL) as Diagnosis[];

const MONTHS = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const DAYS = 'monday|tuesday|wednesday|thursday|friday|saturday|sunday';

/** Things that make a piece of text specific to one customer. Each is a reason it must never be reused. */
const PERSONAL: [string, RegExp][] = [
  ['an email address', /[^\s@]+@[^\s@]+\.[a-z]{2,}/i],
  ['a web address', /\bhttps?:\/\/|\bwww\./i],
  ['a phone number', /(?:\+?44|\b0)[\s-]?\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,4}\b/],
  ['a postcode', /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i],
  ['a price or amount of money', /[£€$]\s?\d|\b\d[\d,.]*\s?(?:pounds|gbp|quid)\b/i],
  ['a date', new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:${MONTHS})\\b|\\b(?:${MONTHS})\\s+\\d{1,2}(?:st|nd|rd|th)?\\b|\\b\\d{1,2}[/.-]\\d{1,2}(?:[/.-]\\d{2,4})?\\b|\\b(?:19|20)\\d{2}\\b|\\b(?:${DAYS})\\b`, 'i')],
  ['a reference or serial number', /\b(?=[A-Z0-9-]*\d)(?=[A-Z0-9-]*[A-Z])[A-Z0-9-]{6,}\b|\b[A-Z]{2,4}-\d{2,}\b|\b(?:ref|reference|serial|invoice|quote|order)\s*(?:no\.?|number|#)?\s*:?\s*\d/i],
  ['a long number', /\b\d{5,}\b/],
];

/** A question about the customer's own booking, money or paperwork can only be answered from their facts. */
const OWN_PROJECT =
  /\b(?:my|our)\s+(?:\w+\s+){0,2}(?:install(?:ation)?(?:\s+date)?|survey|quote|invoice|invoices|payment|payments|balance|deposit|booking|appointment|order|date|schedule|engineer|installer|warranty|warranties|serial|reference|documents?|handover|pack|certificate|application)\b|\bwhen\s+(?:is|are|will)\b.*\b(?:my|our|the)\s+(?:install|survey|visit|engineer)|\bhow much\s+(?:do|did|have)\s+(?:i|we)\b|\b(?:i|we)\s+(?:owe|paid|have paid)\b/i;

export type GeneralCheck = { ok: true } | { ok: false; reason: string };

/**
 * Is this question and answer general enough to be reused for another customer? Deliberately strict:
 * a false "no" costs a reviewer a click, a false "yes" would leak one customer's details to another.
 * `names` are the customer's own words from their facts (first name, installer, address words).
 */
export function isGeneral(question: string, answer: string, names: string[] = []): GeneralCheck {
  const text = `${question}\n${answer}`;
  for (const [what, re] of PERSONAL) if (re.test(text)) return { ok: false, reason: `It contains ${what}.` };
  if (OWN_PROJECT.test(question)) return { ok: false, reason: 'The question is about their own project.' };
  const lower = text.toLowerCase();
  for (const n of names) {
    const w = n.trim().toLowerCase();
    if (w.length >= 3 && new RegExp(`(?:^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^a-z0-9])`).test(lower)) return { ok: false, reason: 'It names someone or something from their project.' };
  }
  if (/\byour\s+(?:project|system|install|quote|panels?|inverter|battery|installation|survey|invoice|payment|balance|deposit)\b/i.test(answer) && !/general|usually|typically|in most|often/i.test(answer))
    return { ok: false, reason: 'The answer talks about their own system rather than in general.' };
  if (question.trim().length < 8 || answer.trim().length < 20) return { ok: false, reason: 'Too short to be a useful example.' };
  return { ok: true };
}

/** Words from a project's facts that must not appear in anything kept (first name, address words and so on). */
export function namesFrom(parts: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const p of parts) for (const w of String(p ?? '').split(/[^A-Za-z0-9']+/)) if (w.length >= 3) out.add(w.toLowerCase());
  return [...out];
}

const STOP = new Set(
  'the a an and or of to in on at for with is are was were be been it its my our your you i we do does did can could would should will how what when where why which who whom this that these those about from into than then so if as by not no yes have has had there their them they me us any some more much many very just also please hi hello hestia solar work works working panel panels'.split(' '),
);

/** Lower-case, de-pluralised content words. */
export function tokens(s: string): string[] {
  const out: string[] = [];
  for (const raw of s.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 2 || STOP.has(raw)) continue;
    out.push(raw.length > 4 && raw.endsWith('ies') ? `${raw.slice(0, -3)}y` : raw.length > 4 && raw.endsWith('s') && !raw.endsWith('ss') ? raw.slice(0, -1) : raw);
  }
  return out;
}

export type Example = { id: string; q: string; a: string };

/** 0 to 1: how much of the shorter side's content words the other side shares (so a short question can match a longer one). */
export function similarity(a: string, b: string): number {
  const x = new Set(tokens(a));
  const y = new Set(tokens(b));
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const t of x) if (y.has(t)) shared++;
  return shared / Math.min(x.size, y.size);
}

/** The few approved examples most relevant to this question: above a floor, best first, at most `limit`. */
export function pickExamples(question: string, pool: Example[], limit = 3, floor = 0.5): Example[] {
  return pool
    .map((e) => ({ e, s: similarity(question, e.q) }))
    .filter((x) => x.s >= floor)
    .sort((m, n) => n.s - m.s)
    .slice(0, limit)
    .map((x) => x.e);
}

/** The examples as a small block for the system prompt. The rules above always win over them. */
export function examplesBlock(examples: Example[]): string {
  if (!examples.length) return '';
  const lines = examples.map((e, i) => `Example ${i + 1}\nCustomer: ${e.q.slice(0, 300)}\nHestia: ${e.a.slice(0, 700)}`);
  return [
    'APPROVED EXAMPLES: general answers the team has checked. Use them as a guide to tone and content when the question is similar, but they never override the rules above, and they say nothing about THIS customer’s project: for that, use only the PROJECT FACTS.',
    ...lines,
  ].join('\n\n');
}

const HAND_OFF = /\b(complain|complaint|fault|faulty|broken|not working|stopped working|cancel|refund|reschedule|sparks?|burning|smell|urgent|emergency)\b|change (?:my|the) (?:booking|date|install)/i;
const POINTS_TO_TEAM = /message|team|call|email|get in touch|contact/i;
const NUMBERS = /£\s?[\d,.]+|\b\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\b\d{4,}\b/gi;

/** A first guess at what went wrong with a thumbs-down answer; the reviewer confirms or changes it. */
export function suggestDiagnosis(question: string, answer: string, factsJson: string): { diagnosis: Diagnosis; note: string } {
  const facts = factsJson.toLowerCase();
  const stray = (answer.match(NUMBERS) ?? []).map((n) => n.replace(/[.,]+$/, '')).filter((n) => !facts.includes(n.toLowerCase().replace(/\s+/g, ' ').trim()) && !facts.includes(n.toLowerCase().replace(/[£,\s]/g, '')));
  if (stray.length) return { diagnosis: 'invented', note: `The answer gives ${stray.slice(0, 3).join(', ')}, which isn’t in the facts she had. Check she didn’t make it up.` };
  if (HAND_OFF.test(question) && !POINTS_TO_TEAM.test(answer)) return { diagnosis: 'should_hand_off', note: 'This sounds like something for a person, but the answer doesn’t point them to Messages or the team.' };
  if (/not on the portal|isn’t on the portal|don.?t have|can.?t see|not (?:yet )?available|no information/i.test(answer)) return { diagnosis: 'missing_fact', note: 'She said the information isn’t on the portal. If it should be, add it to the project so she can see it.' };
  if (answer.length > 900 || /\b(?:hereby|pursuant|aforementioned|kindly)\b/i.test(answer)) return { diagnosis: 'tone', note: 'Long or stiff for a homeowner. Aim for plain, warm and short.' };
  return { diagnosis: 'other', note: 'No obvious cause. Compare the answer with the facts and decide.' };
}

/** Which fact groups she actually had something for (so the reviewer sees what she was working from). */
export function factKeysUsed(facts: Record<string, unknown>): string[] {
  const has = (v: unknown): boolean => (Array.isArray(v) ? v.length > 0 : v && typeof v === 'object' ? Object.values(v as object).some(has) : v !== null && v !== undefined && v !== '' && v !== false);
  return Object.entries(facts)
    .filter(([, v]) => has(v))
    .map(([k]) => k);
}
