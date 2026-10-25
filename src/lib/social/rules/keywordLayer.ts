import config from '@/lib/social/config/keywords.json';
import { basic, squeeze, variants, VARIANT_NAMES, type VariantName } from './normalise';
import { maxSeverity, type Severity } from './types';

/**
 * Layer 1 of the classifier (docs/social-monitoring/03-classifier.md §2-§3): deterministic, runs first,
 * can never be skipped or switched off. It can only ever produce 'high' or 'critical', or nothing.
 * There is deliberately no exclusion list: "gas boiler" is Critical.
 */

export type KeywordCategory = {
  id: string;
  severity: 'high' | 'critical';
  safety: boolean;
  topics: string[];
  word?: string[];
  phrase?: string[];
  prefix?: string[];
  emoji?: string[];
  regex?: string[];
};
export type KeywordConfig = { version: string; categories: KeywordCategory[] };

export type KeywordHit = {
  category: string;
  severity: 'high' | 'critical';
  term: string;
  kind: 'word' | 'phrase' | 'prefix' | 'emoji' | 'regex';
  variant: VariantName | 'emoji';
  matchedText: string;
};

export type KeywordResult = {
  severity: 'high' | 'critical' | null;
  safetyRelated: boolean;
  topics: string[];
  hits: KeywordHit[];
  rulesVersion: string;
};

const BEFORE = '(?<![\\p{L}\\p{N}])';
const AFTER = '(?![\\p{L}\\p{N}])';
const KINDS = ['word', 'phrase', 'prefix', 'regex'] as const;
type Kind = (typeof KINDS)[number];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // not '-': an escaped hyphen is invalid in unicode mode
const stripVs = (s: string) => s.replace(/️/g, '');

function source(kind: Kind, term: string, variant: VariantName): string {
  if (kind === 'regex') return term;
  let t = basic(term);
  if (variant !== 'basic') t = squeeze(t);
  if (kind === 'word') return BEFORE + escape(t) + AFTER;
  if (kind === 'phrase') return BEFORE + t.split(' ').map(escape).join('[\\s\\-]+') + AFTER;
  return BEFORE + escape(t); // prefix
}

type Entry = { kind: Kind; term: string; src: string; rx?: RegExp };
type Compiled = {
  cat: KeywordCategory;
  byVariant: Record<VariantName, { combined: RegExp | null; entries: Entry[] }>;
  emoji: { combined: RegExp | null; terms: { term: string; rx: RegExp }[] };
};

function compile(cat: KeywordCategory): Compiled {
  const byVariant = {} as Compiled['byVariant'];
  for (const v of VARIANT_NAMES) {
    const entries: Entry[] = [];
    for (const kind of KINDS) for (const term of cat[kind] ?? []) entries.push({ kind, term, src: source(kind, term, v) });
    byVariant[v] = {
      entries,
      combined: entries.length ? new RegExp(entries.map((e) => `(?:${e.src})`).join('|'), 'iu') : null,
    };
  }
  const terms = (cat.emoji ?? []).map((term) => ({ term, rx: new RegExp(escape(stripVs(term)), 'u') }));
  return {
    cat,
    byVariant,
    emoji: { terms, combined: terms.length ? new RegExp(terms.map((t) => `(?:${escape(stripVs(t.term))})`).join('|'), 'u') : null },
  };
}

export type KeywordLayer = { rulesVersion: string; match(text: string): KeywordResult };

export function buildKeywordLayer(cfg: KeywordConfig): KeywordLayer {
  const compiled = cfg.categories.map(compile);
  return {
    rulesVersion: cfg.version,
    match(text: string): KeywordResult {
      const v = variants(text);
      const emojiTarget = stripVs(text);
      const hits: KeywordHit[] = [];
      const seen = new Set<string>();
      const push = (h: KeywordHit) => {
        const key = `${h.category}|${h.term}`;
        if (!seen.has(key)) {
          seen.add(key);
          hits.push(h);
        }
      };
      for (const c of compiled) {
        for (const name of VARIANT_NAMES) {
          const { combined, entries } = c.byVariant[name];
          if (!combined || !combined.test(v[name])) continue;
          for (const e of entries) {
            e.rx ??= new RegExp(e.src, 'iu');
            const m = e.rx.exec(v[name]);
            if (m) push({ category: c.cat.id, severity: c.cat.severity, term: e.term, kind: e.kind, variant: name, matchedText: m[0] });
          }
        }
        if (c.emoji.combined?.test(emojiTarget)) {
          for (const t of c.emoji.terms) {
            const m = t.rx.exec(emojiTarget);
            if (m) push({ category: c.cat.id, severity: c.cat.severity, term: t.term, kind: 'emoji', variant: 'emoji', matchedText: m[0] });
          }
        }
      }
      let severity: KeywordResult['severity'] = null;
      let safetyRelated = false;
      const topics = new Set<string>();
      for (const h of hits) {
        severity = maxSeverity(severity, h.severity) as KeywordResult['severity'];
        const cat = compiled.find((c) => c.cat.id === h.category)!.cat;
        if (cat.safety) safetyRelated = true;
        cat.topics.forEach((t) => topics.add(t));
      }
      return { severity, safetyRelated, topics: [...topics], hits, rulesVersion: cfg.version };
    },
  };
}

/** The live keyword layer, built once from src/lib/social/config/keywords.json. */
export const keywordLayer = buildKeywordLayer(config as KeywordConfig);

export type { Severity };
