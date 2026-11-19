/**
 * M6 AI visibility: the pure parts (spec §5 M6). Reading an engine's reply into text and links, and scoring one answer:
 * is Heliaxis named, is a heliaxis.co.uk page cited, our place in any list, the rivals named, the domains cited, and
 * facts about us the answer gets wrong. No I/O, so every rule is unit-tested against stored replies.
 */

export type Engine = 'claude' | 'chatgpt' | 'gemini' | 'perplexity';
export const ENGINES: Engine[] = ['claude', 'chatgpt', 'gemini', 'perplexity'];
export const ENGINE_LABEL: Record<string, string> = { claude: 'Claude', chatgpt: 'ChatGPT', gemini: 'Gemini', perplexity: 'Perplexity', google_aio: 'Google AI Overview' };

export type Reply = { text: string; urls: string[]; model: string | null; costUsd: number };

/* ── Reading replies ─────────────────────────────────────────────────────────────────────────────────────────────── */

type DfsAnnotation = { url?: string | null; direct_url?: string | null };
type DfsSection = { type?: string; text?: string | null; annotations?: DfsAnnotation[] | null };
type DfsItem = { type?: string; sections?: DfsSection[] | null };
type DfsResult = { model_name?: string; money_spent?: number | null; items?: DfsItem[] | null };

/** One DataForSEO LLM Responses task (ChatGPT, Gemini, Perplexity): the message text and the cited links. */
export function readDfsTask(task: { cost?: number; result?: unknown[] | null } | null | undefined): Reply {
  const res = (task?.result?.[0] ?? null) as DfsResult | null;
  const texts: string[] = [];
  const urls: string[] = [];
  for (const it of res?.items ?? []) {
    if (it?.type !== 'message') continue;
    for (const s of it.sections ?? []) {
      if (s?.type !== 'text') continue;
      if (s.text) texts.push(s.text);
      // Gemini's url is a Vertex AI redirect; direct_url is the real page.
      for (const a of s.annotations ?? []) {
        const u = a?.direct_url || a?.url;
        if (u) urls.push(u);
      }
    }
  }
  const text = texts.join('\n').trim();
  return { text, urls: [...new Set([...urls, ...urlsInText(text)])], model: res?.model_name ?? null, costUsd: Number(task?.cost ?? 0) || 0 };
}

type ClaudeBlock = { type: string; text?: string; citations?: { url?: string }[] | null; content?: unknown };

/** A Claude web-search reply (the same reading as the old sampler in social/competitors/geo-run.ts). */
export function readClaudeBlocks(blocks: ClaudeBlock[]): { text: string; urls: string[] } {
  const text = blocks
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('')
    .trim();
  const urls: string[] = [];
  for (const b of blocks) {
    if (b.type === 'text') for (const c of b.citations ?? []) if (c.url) urls.push(c.url);
    if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) for (const r of b.content as { url?: string }[]) if (r?.url) urls.push(r.url);
  }
  return { text, urls: [...new Set([...urls, ...urlsInText(text)])] };
}

/** Links written in the answer itself (markdown links and bare URLs). */
export function urlsInText(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/https?:\/\/[^\s)\]}>"'<,]+/gi)) out.add(m[0].replace(/[.;:!?]+$/, ''));
  return [...out];
}

/* ── Domains ─────────────────────────────────────────────────────────────────────────────────────────────────────── */

export function domainOf(url: string | null | undefined): string {
  if (!url) return '';
  try {
    const h = new URL(/^https?:/i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '').toLowerCase();
    return h.includes('.') ? h : '';
  } catch {
    return '';
  }
}

export const OUR_DOMAIN = 'heliaxis.co.uk';
export const isOurDomain = (d: string) => d === OUR_DOMAIN || d.endsWith(`.${OUR_DOMAIN}`);
/** Hosts that are an engine's own plumbing, not a source. */
const PLUMBING = ['vertexaisearch.cloud.google.com', 'google.com/url'];

export function citedDomains(urls: string[]): string[] {
  return [...new Set(urls.map(domainOf).filter((d) => d && !PLUMBING.includes(d)))];
}

/* ── Scoring one answer ──────────────────────────────────────────────────────────────────────────────────────────── */

export type Rival = { name: string; website?: string | null };
export type Facts = {
  /** Settings › Business facts. */
  name: string;
  phone: string;
  credentials: string[];
  website: string;
  /** Places we cover or are based in: every town, area and region from Settings › Target areas, plus the business area. */
  places: string[];
};

export type AccuracyFlag = { code: 'credential' | 'phone' | 'area' | 'website'; said: string; quote: string };

export type Analysis = {
  mentioned: boolean;
  cited: boolean;
  listPos: number | null;
  rivals: string[];
  citedDomains: string[];
  flags: AccuracyFlag[];
};

const norm = (s: string) => s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const OUR_NAME = /\bheli\s?axis\b/i;

const NUMBERED = /^(\s*)(?:#{1,6}\s*)?(?:\*\*)?\d{1,2}[.)]\s+/;
const BULLET = /^(\s*)(?:#{1,6}\s*)?[-*•]\s+/;
const HEADING = /^(\s*)#{2,6}\s+\S/;

/**
 * Lists in an answer, each a run of top-level entries (numbered lines, else bullets, else headings) with the lines that
 * belong to them. Sub-bullets and indented lines stay with their entry; a plain paragraph ends the list.
 */
export function lists(text: string): string[][] {
  const lines = text.split(/\r?\n/);
  const numbered = lines.some((l) => NUMBERED.test(l));
  const bullets = !numbered && lines.some((l) => BULLET.test(l));
  const start = numbered ? NUMBERED : bullets ? BULLET : HEADING;
  const base = Math.min(...lines.map((l) => start.exec(l)?.[1].length ?? Infinity));
  const out: string[][] = [];
  let list: string[] | null = null;
  let cur: string[] | null = null;
  const closeItem = () => {
    if (cur && list) list.push(cur.join('\n'));
    cur = null;
  };
  const closeList = () => {
    closeItem();
    if (list?.length) out.push(list);
    list = null;
  };
  for (const line of lines) {
    const m = start.exec(line);
    if (m && m[1].length <= base) {
      closeItem();
      if (!list) list = [];
      cur = [line];
    } else if (!line.trim()) {
      closeItem();
    } else if (cur || (list && /^\s+/.test(line))) {
      // Sub-bullets, indented lines and the lines straight after an entry belong to it.
      if (cur) cur.push(line);
    } else {
      closeList();
    }
  }
  closeList();
  return out;
}

/** Every top-level entry, in order. */
export const listItems = (text: string): string[] => lists(text).flat();

/** Our place in the list that names us (1-based), or null when we are not in a list of two or more. */
export function listPosition(text: string): number | null {
  for (const l of lists(text)) {
    if (l.length < 2) continue;
    const i = l.findIndex((it) => OUR_NAME.test(it.split('\n')[0]));
    if (i >= 0) return i + 1;
  }
  return null;
}

/** The parts of an answer that speak about us: our list entry, and any sentence naming us. */
export function ourContext(text: string): string[] {
  const out: string[] = [];
  for (const it of listItems(text)) if (OUR_NAME.test(it.split('\n')[0])) out.push(it);
  const sentences = text
    .replace(/\r?\n+/g, '\n')
    .split(/(?<=[.!?])\s+|\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const s of sentences) if (OUR_NAME.test(s) && !out.some((o) => o.includes(s))) out.push(s);
  return out;
}

/** Credentials and schemes an answer might wrongly give us. Anything not in Business facts is wrong. */
const SCHEMES: { name: string; re: RegExp }[] = [
  { name: 'NICEIC', re: /\bNICEIC\b/i },
  { name: 'TrustMark', re: /\bTrust\s?Mark\b/i },
  { name: 'Which? Trusted Trader', re: /\bWhich\?? Trusted Trader/i },
  { name: 'HIES', re: /\bHIES\b/ },
  { name: 'Gas Safe', re: /\bGas Safe\b/i },
  { name: 'ECA', re: /\bECA\b/ },
  { name: 'Elecsa', re: /\bELECSA\b/i },
  { name: 'Stroma', re: /\bStroma\b/i },
  { name: 'NAPIT', re: /\bNAPIT\b/ },
  { name: 'RECC', re: /\bRECC\b/ },
  { name: 'MCS', re: /\bMCS\b/ },
];

const digits = (s: string) => {
  const d = s.replace(/\D/g, '');
  return d.startsWith('44') ? `0${d.slice(2)}` : d;
};
const PHONE = /(?:\+44\s?\(?0?\)?\s?|\b0)\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,4}\b/g;

function quoteOf(ctx: string, at: number, len: number): string {
  const s = Math.max(0, at - 80);
  const e = Math.min(ctx.length, at + len + 80);
  return `${s > 0 ? '…' : ''}${ctx.slice(s, e).replace(/\s+/g, ' ').trim()}${e < ctx.length ? '…' : ''}`;
}

/** Facts about us the answer gets wrong, each with the words it used. Only the parts that speak about us are read. */
export function accuracyFlags(text: string, facts: Facts): AccuracyFlag[] {
  const flags: AccuracyFlag[] = [];
  const seen = new Set<string>();
  const add = (f: AccuracyFlag) => {
    const k = `${f.code}:${f.said.toLowerCase()}`;
    if (!seen.has(k)) {
      seen.add(k);
      flags.push(f);
    }
  };
  const allowed = new Set(facts.credentials.map((c) => c.toUpperCase()));
  const ourPhone = digits(facts.phone);
  const places = facts.places.map(norm).filter(Boolean);
  const placeOk = (p: string) => {
    const n = norm(p);
    return places.some((x) => x === n || x.includes(n) || n.includes(x)) || /^(the )?(uk|united kingdom|great britain|britain|wales|south wales)$/.test(n);
  };
  for (const ctx of ourContext(text)) {
    for (const s of SCHEMES) {
      if (allowed.has(s.name.toUpperCase())) continue;
      const m = s.re.exec(ctx);
      // "not NICEIC" or "unlike NICEIC firms" is not a claim about us.
      if (m && !/\b(not|isn'?t|unlike|no)\s+(an?\s+)?$/i.test(ctx.slice(Math.max(0, m.index - 12), m.index))) add({ code: 'credential', said: s.name, quote: quoteOf(ctx, m.index, m[0].length) });
    }
    if (ourPhone) {
      for (const m of ctx.matchAll(PHONE)) {
        const d = digits(m[0]);
        if (d.length >= 10 && d !== ourPhone) add({ code: 'phone', said: m[0].trim(), quote: quoteOf(ctx, m.index ?? 0, m[0].length) });
      }
    }
    for (const m of ctx.matchAll(/\b(?:based|located|headquartered|situated)\s+(?:in|near|at|out of)\s+((?:[A-Z][\w'’-]+)(?:[ ,]+(?:upon|on|super|the|[A-Z][\w'’-]+))*)/g)) {
      const place = m[1].replace(/[,\s]+$/, '');
      if (!placeOk(place)) add({ code: 'area', said: place, quote: quoteOf(ctx, m.index ?? 0, m[0].length) });
    }
    for (const m of ctx.matchAll(/\b(?:www\.)?heli\s?axis\.[a-z.]{2,12}\b/gi)) {
      const d = m[0].toLowerCase().replace(/^www\./, '').replace(/\s/g, '').replace(/\.$/, '');
      if (d !== domainOf(facts.website || `https://${OUR_DOMAIN}`)) add({ code: 'website', said: d, quote: quoteOf(ctx, m.index ?? 0, m[0].length) });
    }
  }
  return flags;
}

/** The rivals an answer names, by name (four letters or more, whole words) or by a cited website. */
export function rivalsNamed(text: string, domains: string[], rivals: Rival[]): string[] {
  const t = ` ${norm(text)} `;
  const out = new Set<string>();
  for (const r of rivals) {
    const name = norm(r.name);
    if (!name || OUR_NAME.test(r.name)) continue;
    const d = domainOf(r.website);
    if ((name.length >= 4 && t.includes(` ${name} `)) || (d && !isOurDomain(d) && domains.includes(d))) out.add(r.name.trim());
  }
  return [...out];
}

export function analyseAnswer(reply: { text: string; urls: string[] }, facts: Facts, rivals: Rival[]): Analysis {
  const domains = citedDomains(reply.urls);
  const mentioned = OUR_NAME.test(reply.text);
  return {
    mentioned,
    cited: domains.some(isOurDomain),
    listPos: mentioned ? listPosition(reply.text) : null,
    rivals: rivalsNamed(reply.text, domains, rivals),
    citedDomains: domains,
    flags: mentioned ? accuracyFlags(reply.text, facts) : [],
  };
}

export const FLAG_LABEL: Record<AccuracyFlag['code'], string> = {
  credential: 'Gives us a credential we do not hold',
  phone: 'Gives a phone number that is not ours',
  area: 'Puts us somewhere we are not',
  website: 'Gives a website that is not ours',
};

/** The Needs you item for a wrong fact: one per engine and fact, so the same mistake in three runs is one item. */
export function factAction(engine: string, f: AccuracyFlag, prompt: string) {
  return {
    kind: 'ai_fact' as const,
    ref: `ai:${engine}:${f.code}:${norm(f.said).replace(/ /g, '-')}`,
    title: `${ENGINE_LABEL[engine] ?? engine}: ${FLAG_LABEL[f.code].toLowerCase()} (“${f.said}”)`,
    why: `Asked “${prompt}”, it said: “${f.quote}”. Correct the source it relies on (our site, Business Profile or the directory it cites).`,
    fixHref: '/admin/search/ai#accuracy',
  };
}
