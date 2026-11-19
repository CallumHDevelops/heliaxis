import { describe, expect, it } from 'vitest';
import chatgpt from './fixtures/ai-chatgpt.json';
import gemini from './fixtures/ai-gemini.json';
import perplexity from './fixtures/ai-perplexity.json';
import claude from './fixtures/ai-claude.json';
import { accuracyFlags, analyseAnswer, citedDomains, factAction, listItems, listPosition, readClaudeBlocks, readDfsTask, rivalsNamed, urlsInText, type Facts } from '@/lib/search/ai/parse';
import { cleanPrompt, proposePrompts } from '@/lib/search/ai/prompts';
import { isoDate, monthlyTrend, num, parseCsv, parseUpload } from '@/lib/search/ai/uploads';
import { monthTotal, overviewByMonth, remainingWork, rivalCounts, shareByEngineMonth, topCitedDomains, type AnswerRow } from '@/lib/search/ai/report';
import { crawlerVerdict } from '@/lib/search/ai/crawl';
import { DEFAULT_AREAS } from '@/lib/search/settings';

const FACTS: Facts = {
  name: 'Heliaxis',
  phone: '01633 965205',
  credentials: ['MCS', 'RECC', 'NAPIT'],
  website: 'https://heliaxis.co.uk',
  places: ['South Wales and the South West', ...DEFAULT_AREAS.flatMap((a) => [a.name, a.region, ...a.towns])],
};
const RIVALS = [
  { name: 'Celtic Solar Ltd', website: 'https://www.celticsolar.co.uk' },
  { name: 'Green Valley Renewables', website: 'greenvalleyrenewables.co.uk' },
  { name: 'Gower Energy', website: null },
  { name: 'Heliaxis', website: 'https://heliaxis.co.uk' },
  { name: 'Sun', website: null },
];

describe('reading engine replies', () => {
  it('reads a ChatGPT task: text, annotations and links in the text', () => {
    const r = readDfsTask(chatgpt);
    expect(r.text).toMatch(/^Here are some home battery installers/);
    expect(r.model).toBe('gpt-4.1-mini-2025-04-14');
    expect(r.costUsd).toBeCloseTo(0.012431);
    expect(r.urls).toContain('https://heliaxis.co.uk/battery-storage?utm_source=openai');
    // search_results are what it read, not what it cited
    expect(r.urls.some((u) => u.includes('yell.com'))).toBe(false);
  });
  it('uses Gemini direct_url, not the Vertex redirect, and skips reasoning', () => {
    const r = readDfsTask(gemini);
    expect(r.text).not.toMatch(/Thinking/);
    expect(citedDomains(r.urls)).toEqual(['greenvalleyrenewables.co.uk', 'which.co.uk']);
  });
  it('reads Perplexity, including the bare link in the answer', () => {
    const r = readDfsTask(perplexity);
    expect(citedDomains(r.urls)).toEqual(['energysavingtrust.org.uk', 'mcscertified.com', 'heliaxis.co.uk']);
  });
  it('copes with an empty or failed task', () => {
    expect(readDfsTask({ result: null })).toMatchObject({ text: '', urls: [], model: null, costUsd: 0 });
    expect(readDfsTask(undefined).text).toBe('');
  });
  it('reads Claude web-search blocks like the old sampler', () => {
    const r = readClaudeBlocks(claude as never);
    expect(r.text).toMatch(/Celtic Solar Ltd/);
    expect(citedDomains(r.urls).sort()).toEqual(['celticsolar.co.uk', 'trustatrader.com']);
  });
  it('finds links written in the text', () => {
    expect(urlsInText('See [x](https://a.example.com/p). Or https://b.example.org.')).toEqual(['https://a.example.com/p', 'https://b.example.org']);
  });
});

describe('scoring an answer', () => {
  it('ChatGPT: named, cited, second in the list, rivals, and the wrong facts', () => {
    const a = analyseAnswer(readDfsTask(chatgpt), FACTS, RIVALS);
    expect(a.mentioned).toBe(true);
    expect(a.cited).toBe(true);
    expect(a.listPos).toBe(2);
    expect(a.rivals.sort()).toEqual(['Celtic Solar Ltd', 'Gower Energy']);
    expect(a.citedDomains).toContain('checkatrade.com');
    const codes = a.flags.map((f) => `${f.code}:${f.said}`);
    expect(codes).toContain('credential:NICEIC');
    expect(codes).toContain('area:Exeter');
    expect(codes).toContain('website:heliaxis.com');
    // MCS is ours; the right phone is not flagged; Celtic's phone is in Celtic's entry, not ours
    expect(codes.some((c) => c.startsWith('phone'))).toBe(false);
    expect(codes).not.toContain('credential:MCS');
    expect(a.flags.find((f) => f.code === 'credential')!.quote).toMatch(/NICEIC certified/);
  });
  it('Gemini: not named, not cited, rivals found by name', () => {
    const a = analyseAnswer(readDfsTask(gemini), FACTS, RIVALS);
    expect(a).toMatchObject({ mentioned: false, cited: false, listPos: null, flags: [] });
    expect(a.rivals.sort()).toEqual(['Celtic Solar Ltd', 'Green Valley Renewables']);
  });
  it('Perplexity: named in prose (no list), cited, MCS is fine', () => {
    const a = analyseAnswer(readDfsTask(perplexity), FACTS, RIVALS);
    expect(a).toMatchObject({ mentioned: true, cited: true, listPos: null, flags: [] });
  });
  it('a rival is matched by a cited website too, and short names are ignored', () => {
    expect(rivalsNamed('Try a local firm.', ['celticsolar.co.uk'], RIVALS)).toEqual(['Celtic Solar Ltd']);
    expect(rivalsNamed('The sun is strong in summer.', [], RIVALS)).toEqual([]);
  });
  it('flags a wrong phone number and a credential, not a negated one', () => {
    const t = 'Heliaxis (call 01633 111222) is TrustMark registered. Heliaxis is not NICEIC registered.';
    const codes = accuracyFlags(t, FACTS).map((f) => `${f.code}:${f.said}`);
    expect(codes).toEqual(['credential:TrustMark', 'phone:01633 111222']);
    expect(accuracyFlags('Heliaxis: +44 1633 965205', FACTS)).toEqual([]);
  });
  it('a known area is not flagged', () => {
    expect(accuracyFlags('Heliaxis is based in Newport and covers Cardiff.', FACTS)).toEqual([]);
    expect(accuracyFlags('Heliaxis is located in Weston-super-Mare.', FACTS)).toEqual([]);
    expect(accuracyFlags('Heliaxis is based in Manchester.', FACTS).map((f) => f.said)).toEqual(['Manchester']);
  });
  it('list position ignores sub-bullets and counts within the list that names us', () => {
    const t = 'Options:\n\n1. Alpha Solar\n   - Phone: 01000 000000\n   - Good reviews\n2. Beta Energy\n3. Heliaxis\n\nTips:\n- Get three quotes\n- Check MCS';
    expect(listItems(t).length).toBe(3);
    expect(listPosition(t)).toBe(3);
    expect(listPosition('- Heliaxis\n- Beta')).toBe(1);
    expect(listPosition('Heliaxis is a good choice.')).toBeNull();
  });
  it('one Needs you item per engine and fact', () => {
    const f = { code: 'credential' as const, said: 'NICEIC', quote: '…NICEIC certified…' };
    const a = factAction('chatgpt', f, 'Who installs batteries in Swansea?');
    expect(a.kind).toBe('ai_fact');
    expect(a.ref).toBe('ai:chatgpt:credential:niceic');
    expect(a.title).toMatch(/^ChatGPT: gives us a credential we do not hold/);
    expect(a.why).toMatch(/Swansea/);
  });
});

describe('question proposals', () => {
  it('Tier 1 towns × core services, then consideration questions, skipping what is asked', () => {
    const p = proposePrompts(DEFAULT_AREAS, ['Who are the best solar panel installers in Cardiff?', 'Which companies install home batteries in Swansea?']);
    const tier1 = DEFAULT_AREAS.filter((a) => a.tier === 1).length;
    expect(p.filter((x) => x.kind === 'local').length).toBe(tier1 * 3 - 2);
    expect(p.some((x) => x.prompt === 'Who are the best solar panel installers in Cardiff?')).toBe(false);
    expect(p.some((x) => x.prompt === 'Who installs home batteries in Swansea?')).toBe(false);
    expect(p.some((x) => x.prompt === 'Who installs home batteries in Newport?')).toBe(true);
    expect(p.some((x) => x.prompt === 'Is solar worth it in Wales?' && x.kind === 'consideration')).toBe(true);
    expect(p.some((x) => x.town === 'Brecon')).toBe(false);
  });
  it('can follow the Business facts services', () => {
    const p = proposePrompts(DEFAULT_AREAS, [], { services: ['EV chargers'] });
    expect(p.filter((x) => x.kind === 'local').every((x) => x.service === 'ev charger')).toBe(true);
  });
  it('cleans typed questions', () => {
    expect(cleanPrompt('  who fits solar   in Usk ')).toBe('who fits solar in Usk?');
    expect(cleanPrompt('hi')).toBeNull();
  });
});

describe('CSV uploads', () => {
  it('parses quotes, BOM, semicolons and tabs', () => {
    expect(parseCsv('﻿a,b\n"x, y","say ""hi"""\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"']]);
    expect(parseCsv('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a\tb\r\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('reads numbers and dates as the exports write them', () => {
    expect(num('1,234')).toBe(1234);
    expect(num('12.5%')).toBe(12.5);
    expect(num('–')).toBeNull();
    expect(num('Cardiff')).toBeNull();
    expect(isoDate('2026-11-03')).toBe('2026-11-03');
    expect(isoDate('03/11/2026')).toBe('2026-11-03');
    expect(isoDate('11/23/2026')).toBe('2026-11-23');
    expect(isoDate('3 Nov 2026')).toBe('2026-11-03');
    expect(isoDate('Nov 3, 2026')).toBe('2026-11-03');
    expect(isoDate('soon')).toBeUndefined();
  });
  it('Search Console Generative AI: a dated chart with a title line', () => {
    const csv = 'Generative AI performance\nDate,AI Overview impressions,AI Mode impressions\n2026-10-30,"1,200",40\n2026-10-31,800,10\n2026-11-01,500,5\n,,\n';
    const u = parseUpload('gsc_genai', csv);
    expect(u.measures).toEqual(['ai_overview_impressions', 'ai_mode_impressions']);
    expect(u.rows.length).toBe(3);
    expect(u.period).toBe('2026-10 to 2026-11');
    expect(u.warning).toBeUndefined();
    const t = monthlyTrend([{ source: 'gsc_genai', period: u.period!, rows: u.rows }], 'gsc_genai');
    expect(t.months).toEqual(['2026-10', '2026-11']);
    expect(t.totals['2026-10'].ai_overview_impressions).toBe(2000);
  });
  it('Search Console by page: undated rows count in the chosen month', () => {
    const u = parseUpload('gsc_genai', 'Top pages,Impressions\nhttps://heliaxis.co.uk/,300\nhttps://heliaxis.co.uk/solar,120\n');
    expect(u.rows[0]).toEqual({ page: 'https://heliaxis.co.uk/', values: { impressions: 300 } });
    expect(u.period).toBeNull();
    const t = monthlyTrend([{ source: 'gsc_genai', period: '2026-10', rows: u.rows }], 'gsc_genai');
    expect(t.totals['2026-10'].impressions).toBe(420);
  });
  it('Bing AI Performance: grounding queries, "Cited pages" counted as a number', () => {
    const csv = 'Date;Grounding query;Citations;Cited pages\n03/11/2026;solar panels newport;4;2\n04/11/2026;battery installer cardiff;1;1\n';
    const u = parseUpload('bing_ai', csv);
    expect(u.rows[0]).toEqual({ date: '2026-11-03', query: 'solar panels newport', values: { citations: 4, cited_pages: 2 } });
    expect(monthlyTrend([{ source: 'bing_ai', period: '2026-11', rows: u.rows }], 'bing_ai').totals['2026-11'].citations).toBe(5);
  });
  it('a later upload replaces the same month; junk gives a warning', () => {
    const a = { source: 'bing_ai' as const, period: '2026-11', rows: [{ date: '2026-11-01', values: { citations: 1 } }] };
    const b = { source: 'bing_ai' as const, period: '2026-11', rows: [{ date: '2026-11-02', values: { citations: 7 } }] };
    expect(monthlyTrend([a, b], 'bing_ai').totals['2026-11'].citations).toBe(7);
    expect(parseUpload('bing_ai', 'hello world').warning).toMatch(/No header/);
    expect(parseUpload('bing_ai', 'Date,Score\n2026-11-01,3').warning).toMatch(/citations/);
  });
});

const row = (o: Partial<AnswerRow>): AnswerRow => ({ prompt_id: 1, engine: 'chatgpt', run_no: 1, date: '2026-11-03', mentioned: false, cited: false, list_pos: null, rivals: [], cited_domains: [], accuracy_flags: [], error: null, ...o });

describe('reports', () => {
  const rows = [
    row({ mentioned: true, cited: true, list_pos: 2, cited_domains: ['heliaxis.co.uk', 'checkatrade.com'], rivals: ['Celtic Solar Ltd'] }),
    row({ run_no: 2, cited_domains: ['checkatrade.com', 'celticsolar.co.uk'], rivals: ['Celtic Solar Ltd'] }),
    row({ run_no: 3, error: 'timeout' }),
    row({ engine: 'gemini', mentioned: true, list_pos: 4, cited_domains: ['which.co.uk'] }),
    row({ date: '2026-10-03', engine: 'chatgpt' }),
  ];
  it('mention and citation share by engine and month, leaving failures out', () => {
    const s = shareByEngineMonth(rows);
    expect(s[0]).toMatchObject({ month: '2026-11', engine: 'chatgpt', answers: 2, mentioned: 1, cited: 1, mentionShare: 50, citeShare: 50, avgListPos: 2 });
    expect(s.find((x) => x.engine === 'gemini')).toMatchObject({ mentionShare: 100, citeShare: 0 });
    expect(s.find((x) => x.month === '2026-10')).toMatchObject({ answers: 1, mentionShare: 0 });
    expect(monthTotal(rows, '2026-11')).toEqual({ answers: 3, mentionShare: 66.7, citeShare: 33.3 });
  });
  it('third-party domains, without ours, rivals marked', () => {
    const d = topCitedDomains(rows, ['celticsolar.co.uk']);
    expect(d[0]).toMatchObject({ domain: 'checkatrade.com', answers: 2, engines: ['chatgpt'], rival: false });
    expect(d.find((x) => x.domain === 'celticsolar.co.uk')?.rival).toBe(true);
    expect(d.some((x) => x.domain === 'heliaxis.co.uk')).toBe(false);
  });
  it('rival counts', () => {
    expect(rivalCounts(rows)[0]).toEqual({ name: 'Celtic Solar Ltd', answers: 2, share: 50 });
  });
  it('the work list asks run 1 of everything first and skips what is saved', () => {
    const w = remainingWork([1, 2], ['claude', 'chatgpt'], 3, [{ prompt_id: 1, engine: 'claude', run_no: 1 }]);
    expect(w.length).toBe(11);
    expect(w.slice(0, 3).every((x) => x.runNo === 1)).toBe(true);
    expect(w.some((x) => x.promptId === 1 && x.engine === 'claude' && x.runNo === 1)).toBe(false);
  });
  it('the Google AI Overview by month', () => {
    const o = overviewByMonth([
      { date: '2026-11-02', aio_present: true, aio_cited: true },
      { date: '2026-11-09', aio_present: true, aio_cited: false },
      { date: '2026-11-09', aio_present: false, aio_cited: false },
      { date: '2026-11-09', aio_present: null, aio_cited: null, error: 'x' },
    ]);
    expect(o[0]).toEqual({ month: '2026-11', searches: 3, shown: 2, cited: 1, shownShare: 66.7, citedShareOfShown: 50 });
  });
});

describe('crawler verdicts', () => {
  it('reads status codes against the browser baseline', () => {
    expect(crawlerVerdict(200, 200, false)).toBe('ok');
    expect(crawlerVerdict(403, 200, false)).toBe('blocked');
    expect(crawlerVerdict(200, 200, true)).toBe('robots');
    expect(crawlerVerdict(0, 0, false)).toBe('site_down');
    expect(crawlerVerdict(404, 200, false)).toBe('error');
  });
});
