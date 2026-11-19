/**
 * M6 reports (spec §5 M6): mention share and citation share by engine and month, the third-party domains cited most
 * often, the rivals named, and the sampling work list. Pure; the page reads rows and passes them in.
 */

import { isOurDomain, type AccuracyFlag } from './parse';

/** Each question is asked this many times per engine per month. */
export const RUNS = 3;
/** Pre-flight estimate per DataForSEO answer: $0.0006 task fee plus the model's own charge with web search. A guess, to check against the logged costs after the first run. */
export const DFS_ANSWER_USD = 0.03;

export type AnswerRow = {
  id?: number;
  prompt_id: number;
  engine: string;
  run_no: number;
  date: string;
  mentioned: boolean;
  cited: boolean;
  list_pos: number | null;
  rivals: string[] | null;
  cited_domains: string[] | null;
  accuracy_flags: AccuracyFlag[] | null;
  error: string | null;
};

export type ShareCell = { month: string; engine: string; answers: number; mentioned: number; cited: number; mentionShare: number; citeShare: number; avgListPos: number | null };

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

/** Shares by month and engine, from answers that came back (failed calls are left out, and counted on the page). */
export function shareByEngineMonth(rows: AnswerRow[]): ShareCell[] {
  const m = new Map<string, AnswerRow[]>();
  for (const r of rows) {
    if (r.error) continue;
    const k = `${r.date.slice(0, 7)}|${r.engine}`;
    m.set(k, [...(m.get(k) ?? []), r]);
  }
  return [...m.entries()]
    .map(([k, rs]) => {
      const [month, engine] = k.split('|');
      const mentioned = rs.filter((r) => r.mentioned).length;
      const cited = rs.filter((r) => r.cited).length;
      const pos = rs.map((r) => r.list_pos).filter((p): p is number => p !== null);
      return { month, engine, answers: rs.length, mentioned, cited, mentionShare: pct(mentioned, rs.length), citeShare: pct(cited, rs.length), avgListPos: pos.length ? Math.round((pos.reduce((a, b) => a + b, 0) / pos.length) * 10) / 10 : null };
    })
    .sort((a, b) => b.month.localeCompare(a.month) || a.engine.localeCompare(b.engine));
}

/** All engines together for one month. */
export function monthTotal(rows: AnswerRow[], month: string) {
  const rs = rows.filter((r) => !r.error && r.date.startsWith(month));
  return { answers: rs.length, mentionShare: pct(rs.filter((r) => r.mentioned).length, rs.length), citeShare: pct(rs.filter((r) => r.cited).length, rs.length) };
}

export type DomainCount = { domain: string; answers: number; engines: string[]; prompts: number; rival: boolean };

/**
 * The third-party sites engines cite most (our own site left out): directories, review sites and articles to get listed
 * in or written up by. A site that belongs to a rival is marked, since it is not an outreach target.
 */
export function topCitedDomains(rows: AnswerRow[], rivalDomains: string[] = [], limit = 25): DomainCount[] {
  const rivals = new Set(rivalDomains.map((d) => d.toLowerCase()));
  const m = new Map<string, { answers: number; engines: Set<string>; prompts: Set<number> }>();
  for (const r of rows) {
    if (r.error) continue;
    for (const d of new Set(r.cited_domains ?? [])) {
      if (isOurDomain(d)) continue;
      const e = m.get(d) ?? { answers: 0, engines: new Set(), prompts: new Set() };
      e.answers++;
      e.engines.add(r.engine);
      e.prompts.add(r.prompt_id);
      m.set(d, e);
    }
  }
  return [...m.entries()]
    .map(([domain, e]) => ({ domain, answers: e.answers, engines: [...e.engines].sort(), prompts: e.prompts.size, rival: rivals.has(domain) }))
    .sort((a, b) => b.answers - a.answers || b.prompts - a.prompts || a.domain.localeCompare(b.domain))
    .slice(0, limit);
}

/** How often each rival is named, against how often we are. */
export function rivalCounts(rows: AnswerRow[], limit = 15): { name: string; answers: number; share: number }[] {
  const ok = rows.filter((r) => !r.error);
  const m = new Map<string, number>();
  for (const r of ok) for (const n of new Set(r.rivals ?? [])) m.set(n, (m.get(n) ?? 0) + 1);
  return [...m.entries()]
    .map(([name, answers]) => ({ name, answers, share: pct(answers, ok.length) }))
    .sort((a, b) => b.answers - a.answers || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export type WorkItem = { promptId: number; engine: string; runNo: number };

/** What a run still has to ask: every active question × engine × run, less the answers already saved for that date. */
export function remainingWork(promptIds: number[], engines: string[], runs: number, done: { prompt_id: number; engine: string; run_no: number }[]): WorkItem[] {
  const have = new Set(done.map((d) => `${d.prompt_id}|${d.engine}|${d.run_no}`));
  const out: WorkItem[] = [];
  // Run 1 of everything first, so a run cut short by the cap still covers every question once.
  for (let runNo = 1; runNo <= runs; runNo++) for (const promptId of promptIds) for (const engine of engines) if (!have.has(`${promptId}|${engine}|${runNo}`)) out.push({ promptId, engine, runNo });
  return out;
}

/** The Google AI Overview from M1's SERPs: per month, searches seen, Overview shown, and our page cited in it. */
export function overviewByMonth(rows: { date: string; aio_present: boolean | null; aio_cited: boolean | null; error?: string | null }[]) {
  const m = new Map<string, { searches: number; shown: number; cited: number }>();
  for (const r of rows) {
    if (r.error) continue;
    const k = r.date.slice(0, 7);
    const e = m.get(k) ?? { searches: 0, shown: 0, cited: 0 };
    e.searches++;
    if (r.aio_present) e.shown++;
    if (r.aio_cited) e.cited++;
    m.set(k, e);
  }
  return [...m.entries()]
    .map(([month, e]) => ({ month, ...e, shownShare: pct(e.shown, e.searches), citedShareOfShown: pct(e.cited, e.shown) }))
    .sort((a, b) => b.month.localeCompare(a.month));
}
