/**
 * A promise made in an email you sent: "I'll get a quote over to you this weekend", "I'll call you Thursday",
 * "we'll send the design by Friday". Pure, so it can be tested; src/lib/email/promises.ts turns one into a task on the
 * customer's record. It only reads the part you wrote (the caller strips the quoted thread), and only a first-person
 * promise with a thing and a time, so ordinary pleasantries ("let me know") are never picked up.
 */
export type Promise_ = {
  /** What was promised: "a quote", "a call", "the design". */
  item: string;
  /** The words they promised it in: "this weekend". */
  when: string;
  /** The day it is due (UK date, YYYY-MM-DD): the first day it could be chased. */
  due: string;
  /** The sentence it was found in. */
  sentence: string;
};

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_RE = DAYS.join('|');

const dow = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
const plus = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** The next time the weekday `want` (0 = Sunday) comes round after `from`, or `from` itself when `today` is true. */
const next = (from: string, want: number, today = false) => {
  let n = (want - dow(from) + 7) % 7;
  if (n === 0 && !today) n = 7;
  return plus(from, n);
};

/** What was promised, with the words for it. Checked in this order. */
const ITEMS: [RegExp, string][] = [
  [/\b(quote|quotation|estimate)s?\b/, 'a quote'],
  [/\bproposal\b/, 'the proposal'],
  [/\bdesign\b/, 'the design'],
  [/\b(prices?|pricing|costs?|figures|breakdown|numbers)\b/, 'the pricing'],
  [/\b(invoice)\b/, 'the invoice'],
  [/\b(report|datasheets?|brochure|photos?|information|details|paperwork|documents?|certificate)\b/, 'the details'],
  [/\b(call|ring|phone|speak|give you a (call|ring|bell))\b/, 'a call'],
  [/\b(get back to you|come back to you|be in touch|reply|respond|update you|let you know)\b/, 'a reply'],
  [/\b(send|email|get|have|pop|drop|put|forward|let you have|get over|get across|sort|do|prepare|put together|draw up|work up|write)\b[^.!?]{0,40}\b(over|across|to you|for you|your)\b/, 'what I promised'],
];

/** The time words, most specific first: [pattern, due day from the sending day]. */
function dueFor(text: string, sent: string): { when: string; due: string } | null {
  const t = text;
  let m: RegExpMatchArray | null;
  if ((m = t.match(/\b(first thing|early) (next week)\b|\b(early )?next week\b/))) return { when: m[0], due: next(sent, 1) };
  if ((m = t.match(/\b(this|over the|by the|at the|for the|during the) weekend\b|\bover the weekend\b|\bby (the )?weekend\b/))) {
    const d = dow(sent);
    return { when: m[0], due: d === 6 || d === 0 ? sent : next(sent, 6) };
  }
  if ((m = t.match(/\b(by |before |at )?(the )?end of (the )?(week|play on friday)\b|\bby (the )?end of (the )?week\b/))) return { when: m[0], due: next(sent, 5, true) };
  if ((m = t.match(/\b(by |before |on |this |first thing |early )?(next )?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)( morning| afternoon| evening)?\b/))) {
    const want = DAYS.indexOf(m[3]);
    const nextWeek = !!m[2];
    let due = next(sent, want);
    if (nextWeek && dow(sent) !== 0 && due <= plus(sent, 6 - dow(sent) + 0)) due = plus(due, 7);
    return { when: m[0].trim(), due };
  }
  if ((m = t.match(/\b(first thing )?tomorrow( morning| afternoon| evening)?\b/))) return { when: m[0], due: plus(sent, 1) };
  if ((m = t.match(/\b(today|this (morning|afternoon|evening)|tonight|later today|by (close of business|cob|end of (the )?day)|within the hour|shortly|shortly after)\b/))) return { when: m[0], due: sent };
  if ((m = t.match(/\b(in|within) (the next )?(a )?(couple of|few|two|2|three|3) (working )?days\b/))) return { when: m[0], due: plus(sent, 2) };
  if ((m = t.match(/\b(in|within) (a|one|1) (working )?day\b/))) return { when: m[0], due: plus(sent, 1) };
  if ((m = t.match(/\b(in|within) (a|one|1|two|2) weeks?\b|\bin a week\b/))) return { when: m[0], due: plus(sent, 7) };
  return null;
}

const PROMISE = /\b(i|we)(?:'ll| will| shall|'m going to| am going to| can)\b|\b(i|we)(?:'ll| will) (?:definitely |certainly |aim to |try to |endeavour to )?|\bwill (?:get|send|have|call|ring|email|drop|pop)\b|\bwill be (?:with you|over to you|sent|ready|in your inbox)\b/;

export function findPromise(body: string, sentOn: string): Promise_ | null {
  const text = body.replace(/[’‘]/g, "'").replace(/\s+/g, ' ');
  for (const raw of text.split(/(?<=[.!?])\s+|\n/)) {
    const sentence = raw.trim();
    if (sentence.length < 12 || sentence.length > 300) continue;
    const s = sentence.toLowerCase();
    if (!PROMISE.test(s)) continue;
    if (/\b(if|unless|should|when you|once you|after you|let me know|please)\b[^.!?]*\b(i|we)(?:'ll| will)\b/.test(s) && !/\b(i|we)(?:'ll| will)\b[^.!?]*\b(this|tomorrow|today|by|on)\b/.test(s)) continue;
    const when = dueFor(s, sentOn);
    if (!when) continue;
    const item = ITEMS.find(([re]) => re.test(s));
    if (!item) continue;
    return { item: item[1], when: when.when, due: when.due, sentence: sentence.slice(0, 240) };
  }
  return null;
}
