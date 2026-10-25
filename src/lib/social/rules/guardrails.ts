import config from '@/lib/social/config/guardrails.json';
import { BOOKING_SENTENCE } from './template';
import { words } from './similarity';
import type { Platform, Severity } from './types';

/**
 * The checks every reply passes before it can be copied (docs/social-monitoring/04-reply-engine.md §6),
 * on generation and again on every reviewer edit. Pure and deterministic. Copy stays disabled while
 * `pass` is false. The AI never decides any of this.
 */

export type GuardrailInput = {
  text: string;
  /** A reply to a safety comment: the strictest rules apply (no claims, no absolute words). */
  isSafety: boolean;
  severity: Severity;
  platform: Platform;
  officePhone: string;
  /** Banned phrases of the script used, on top of the global list. */
  scriptBannedPhrases?: string[];
  /** The commenter's first name as used in the greeting (allowed through the personal-details check). */
  commenterFirstName?: string | null;
  signoff?: string;
  /** The comment being answered, for the echo check. */
  comment?: string;
  approvedOffers?: string[];
  /** Competitor names on top of the built-in list. */
  competitorNames?: string[];
  /**
   * Text the system itself wrote (approved script wording, approved Fact Sheet claims, the sign-off, the
   * booking sentence). It is set aside before the claim check. A reviewer's edits are not in this list,
   * so they get the full check.
   */
  fixedTexts?: string[];
};

export type GuardrailFailure = { rule: string; detail: string; span: [number, number] | null };
export type GuardrailResult = {
  pass: boolean;
  failures: GuardrailFailure[];
  warnings: GuardrailFailure[];
  rulesVersion: string;
};

type Cfg = typeof config;
const cfg: Cfg = config;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const straight = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
const isAlnum = (ch: string) => /[\p{L}\p{N}]/u.test(ch);
const rxCache = new Map<string, RegExp>();

/** Index of the term in already-lower-cased text, or -1. Whole words/phrases unless the term starts or ends with a symbol. */
function find(norm: string, term: string, from = 0): number {
  const t = straight(term).toLowerCase();
  if (!isAlnum(t[0]) || !isAlnum(t[t.length - 1])) return norm.indexOf(t, from);
  let rx = rxCache.get(t);
  if (!rx) {
    rx = new RegExp(`(?<![\\p{L}\\p{N}])${t.split(/\s+/).map(escape).join('[\\s\\-]+')}(?![\\p{L}\\p{N}])`, 'gu');
    rxCache.set(t, rx);
  }
  rx.lastIndex = from;
  const m = rx.exec(norm);
  return m ? m.index : -1;
}

function findAll(norm: string, terms: readonly string[]): { term: string; at: number }[] {
  const out: { term: string; at: number }[] = [];
  for (const term of terms) {
    const at = find(norm, term);
    if (at >= 0) out.push({ term, at });
  }
  return out;
}

// A new sentence starts after . ! ? and after an emoji, so a capital after them is not a name.
const sentencesOf = (s: string) => s.split(/\n+|(?<=[.!?])\s+|(?<=\p{Extended_Pictographic}\uFE0F?)\s+/u).map((x) => x.trim()).filter((x) => /[\p{L}\p{N}]/u.test(x));

/** Removes each fixed text (longest first, any letter case) and the booking sentences. */
function stripFixed(text: string, fixed: string[], officePhone: string): string {
  let t = text.replace(BOOKING_SENTENCE, ' ');
  const list = [...new Set(fixed.map((f) => f.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (list.length) t = t.replace(new RegExp(list.map(escape).join('|'), 'giu'), ' ');
  return t.split(officePhone).join(' ');
}

const digitsOnly = (s: string) => s.replace(/\D/g, '');

export function runGuardrails(input: GuardrailInput): GuardrailResult {
  const failures: GuardrailFailure[] = [];
  const warnings: GuardrailFailure[] = [];
  const fail = (rule: string, detail: string, at: number | null = null, len = 0) =>
    failures.push({ rule, detail, span: at === null ? null : [at, at + len] });
  const warn = (rule: string, detail: string, at: number | null = null, len = 0) =>
    warnings.push({ rule, detail, span: at === null ? null : [at, at + len] });

  const text = input.text;
  const norm = straight(text).toLowerCase();
  const leftover = stripFixed(text, input.fixedTexts ?? [], input.officePhone);

  // G1: banned phrases.
  for (const term of [...cfg.G1_banned_phrases_global, ...(input.scriptBannedPhrases ?? [])]) {
    const at = find(norm, term);
    if (at >= 0) fail('G1', `Banned phrase: "${term}"`, at, term.length);
  }

  // G2: absolute and certainty words, in any safety reply and anywhere a safety term appears.
  const safetyContext = input.isSafety || findAll(norm, cfg.G2_safety_terms).length > 0;
  if (safetyContext) {
    for (const { term, at } of findAll(norm, cfg.G2_absolute_words)) fail('G2', `Absolute or certain wording about safety: "${term}"`, at, term.length);
  }

  // G3: factual claims that nobody approved.
  const markerWords: readonly string[] = input.isSafety
    ? [...cfg.G3_claim_markers_word, ...cfg.G3_safety_extra_markers, ...cfg.G2_safety_terms]
    : cfg.G3_claim_markers_word;
  const markerRegexes = cfg.G3_claim_markers_regex.map((r) => new RegExp(r, 'i'));
  for (const sentence of sentencesOf(leftover)) {
    const sn = straight(sentence).toLowerCase();
    const hit = markerWords.find((m) => find(sn, m) >= 0) ?? markerRegexes.find((r) => r.test(sn))?.source;
    if (hit) {
      const at = text.indexOf(sentence);
      fail('G3', `Claim not in the approved wording: "${sentence}"`, at >= 0 ? at : null, sentence.length);
    }
  }

  // G4: prices, discounts and offers that aren't on the approved list.
  let offerText = norm;
  for (const ok of [...cfg.G4_approved_offers_default, ...(input.approvedOffers ?? []), ...cfg.G4_non_offer_phrases]) {
    offerText = offerText.split(ok.toLowerCase()).join(' ');
  }
  for (const { term, at } of findAll(offerText, cfg.G4_offer_markers_word)) fail('G4', `Price or offer: "${term}"`, at, term.length);
  for (const r of cfg.G4_offer_markers_regex) {
    const m = new RegExp(r, 'i').exec(offerText);
    if (m) fail('G4', `Price or offer: "${m[0]}"`, m.index, m[0].length);
  }

  // G5: legal admissions.
  for (const { term, at } of findAll(norm, cfg.G5_legal_admissions)) fail('G5', `Could be read as an admission: "${term}"`, at, term.length);

  // G6: personal details of anyone.
  const stripped = text.replace(BOOKING_SENTENCE, ' ');
  const office = digitsOnly(input.officePhone);
  for (const [name, pattern] of Object.entries(cfg.G6_regex)) {
    const rx = new RegExp(pattern, name === 'street_address' ? 'g' : 'gi');
    for (const m of stripped.matchAll(rx)) {
      if (name === 'uk_phone' && (digitsOnly(m[0]) === office || digitsOnly(m[0]) === `44${office.slice(1)}`)) continue;
      fail('G6', `Personal detail (${name.replace('_', ' ')}): "${m[0].trim()}"`, m.index ?? null, m[0].length);
    }
  }
  const allow = new Set(
    [
      ...cfg.G6_allowlist_proper_nouns,
      ...(input.commenterFirstName ? [input.commenterFirstName] : []),
      ...(input.signoff ?? '').split(/\s+/),
    ].map((w) => w.toLowerCase().replace(/[^\p{L}']/gu, ''))
  );
  for (const sentence of sentencesOf(stripped)) {
    const ws = [...sentence.matchAll(/[\p{L}][\p{L}'’]*/gu)];
    for (const m of ws.slice(1)) {
      const w = m[0];
      if (/^[A-Z]/.test(w) && w.length > 1 && !allow.has(w.toLowerCase().replace(/’/g, "'"))) {
        const at = text.indexOf(sentence);
        fail('G6', `A name or capitalised word that isn't approved: "${w}"`, at >= 0 ? at + (m.index ?? 0) : null, w.length);
      }
    }
  }

  // G7: competitor names.
  for (const term of [...cfg.G7_competitor_names_seed, ...(input.competitorNames ?? [])]) {
    const at = find(norm, term);
    if (at >= 0) fail('G7', `Competitor named: "${term}"`, at, term.length);
  }

  // G8: links other than Heliaxis's own.
  const urlRx =
    /(?:https?:\/\/)?((?:[a-z0-9-]+\.)+(?:co\.uk|com|org|net|uk|io|ly|me|info|biz|app|dev|gl|link|be))(?![a-z])(?:[/?#][^\s)]*)?/gi;
  for (const m of stripped.matchAll(urlRx)) {
    const host = m[1].toLowerCase();
    if (!cfg.G8_allowed_url_hosts.includes(host) && !/^[\w.+-]+@/.test(stripped.slice(Math.max(0, (m.index ?? 0) - 1), m.index))) {
      fail('G8', `Link to somewhere else: "${m[0]}"`, m.index ?? null, m[0].length);
    }
  }

  // G9: defensive or argumentative wording.
  for (const { term, at } of findAll(norm, cfg.G9_defensive_phrases)) fail('G9', `Defensive wording: "${term}"`, at, term.length);

  // G10: ends with a clear next step.
  if (input.severity !== 'ignore') {
    const tail = straight(sentencesOf(text).slice(-2).join(' ')).toLowerCase();
    if (!cfg.G10_next_step_markers.some((m) => tail.includes(m))) fail('G10', 'The reply does not end with a next step (a question, a call, or the booking link)');
  }

  // G11: length.
  const limit = input.severity === 'positive' ? cfg.G11_length.positive_max_chars : cfg.G11_length.default_max_chars;
  if (text.length > limit) fail('G11', `Too long: ${text.length} characters (limit ${limit})`);
  const hard = cfg.G11_length.platform_hard_limits[input.platform];
  if (hard && text.length > hard) fail('G11', `Too long for ${input.platform}: ${text.length} characters (limit ${hard})`);

  // G12: nothing copied from the comment.
  if (input.comment) {
    const n = cfg.G12_echo_max_consecutive_words + 1;
    const c = words(input.comment);
    const grams = new Set<string>();
    for (let i = 0; i + n <= c.length; i++) grams.add(c.slice(i, i + n).join(' '));
    const t = words(text);
    for (let i = 0; i + n <= t.length; i++) {
      if (grams.has(t.slice(i, i + n).join(' '))) {
        fail('G12', 'Copies a run of words from the comment');
        break;
      }
    }
  }

  // G13: emoji.
  const emoji = text.match(/\p{Extended_Pictographic}/gu)?.length ?? 0;
  const maxEmoji = input.isSafety || input.severity === 'critical' || input.severity === 'high' ? cfg.G13_emoji.critical_high_safety_max : cfg.G13_emoji.default_max;
  if (emoji > maxEmoji) fail('G13', maxEmoji === 0 ? 'No emoji in this kind of reply' : `At most ${maxEmoji} emoji`);

  // G14: UK spelling (a warning, not a block).
  for (const us of Object.keys(cfg.G14_us_to_uk)) {
    const at = find(norm, us);
    if (at >= 0) warn('G14', `US spelling: "${us}" → "${(cfg.G14_us_to_uk as Record<string, string>)[us]}"`, at, us.length);
  }

  return { pass: failures.length === 0, failures, warnings, rulesVersion: cfg.version };
}
