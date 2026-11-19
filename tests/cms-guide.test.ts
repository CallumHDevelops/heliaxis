import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  completionHtml,
  emptyProgress,
  guideHtml,
  itemKey,
  LESSONS,
  lessonCounts,
  markRight,
  parseProgress,
  serializeProgress,
  toggleStep,
  totals,
} from '@/lib/cms-guide';

const everyText = () =>
  LESSONS.flatMap((l) => [
    l.title,
    l.goal,
    ...l.read,
    l.stepsTitle,
    ...l.steps.map((s) => s.text),
    ...l.callouts.flatMap((c) => [c.title, c.text]),
    ...l.quiz.flatMap((q) => [q.q, ...q.options, q.why]),
    ...(l.table ? l.table.rows.flat() : []),
  ]);

describe('CMS guide content', () => {
  it('has unique lesson ids and something to do and check in every lesson', () => {
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length);
    for (const l of LESSONS) {
      expect(l.steps.length, l.id).toBeGreaterThan(3);
      expect(l.quiz.length, l.id).toBeGreaterThan(0);
      expect(l.minutes, l.id).toBeGreaterThan(0);
    }
  });

  it('has quiz answers that exist, and does not always put the right one in the same place', () => {
    const answers = new Set<number>();
    for (const l of LESSONS)
      for (const q of l.quiz) {
        expect(q.options.length, q.q).toBeGreaterThanOrEqual(3);
        expect(q.answer, q.q).toBeGreaterThanOrEqual(0);
        expect(q.answer, q.q).toBeLessThan(q.options.length);
        expect(new Set(q.options).size, q.q).toBe(q.options.length);
        expect(q.why.length, q.q).toBeGreaterThan(20);
        answers.add(q.answer);
      }
    expect(answers.size).toBeGreaterThanOrEqual(3);
  });

  it('links only to pages that exist in the app or the live site', () => {
    const help = new Set(readdirSync('src/content/help/website').filter((f) => f.endsWith('.md') && !f.startsWith('_')).map((f) => f.replace(/\.md$/, '')));
    const links = LESSONS.flatMap((l) => [...l.steps.flatMap((s) => (s.open ? [s.open] : [])), ...l.help]);
    expect(links.length).toBeGreaterThan(10);
    for (const link of links) {
      expect(link.label.length).toBeGreaterThan(2);
      expect(/^(\/admin(\/|$)|https:\/\/heliaxis\.co\.uk)/.test(link.href), link.href).toBe(true);
      const m = /^\/admin\/help\/website\/(.+)$/.exec(link.href);
      if (m) expect(help.has(m[1]), link.href).toBe(true);
    }
  });

  it('makes no claim the site cannot make', () => {
    const wrongAnswers = new Set(LESSONS.flatMap((l) => l.quiz.flatMap((q) => [q.q, ...q.options.filter((_, i) => i !== q.answer)])));
    for (const t of everyText()) {
      // No emoji anywhere (house rule).
      expect(/\p{Extended_Pictographic}/u.test(t), t).toBe(false);
      // NICEIC only ever appears to say it is not ours, or in a quiz question or wrong answer.
      if (/NICEIC/.test(t) && !wrongAnswers.has(t)) expect(/not NICEIC|never|not ours|Remove it/i.test(t), t).toBe(true);
    }
    const all = everyText().join(' ');
    expect(all).toContain('MCS, RECC, NAPIT, TrustMark, SSIP, ISO 9001 and ISO 14001');
    expect(all).toContain('01633 965205');
    expect(all).toContain('South Wales and the South West');
    expect(all).toContain('/free-solar-quote');
    // The quiz may mention example figures, but only inside questions about removing them.
    for (const l of LESSONS) for (const s of l.steps) expect(/\b4\.9\b|1,200/.test(s.text) ? /Replace|replace|example|Example/.test(s.text) : true, s.text).toBe(true);
  });
});

describe('CMS guide progress', () => {
  it('counts steps and quiz answers, and finishes a lesson only when both are done', () => {
    const l = LESSONS[0];
    let p = emptyProgress();
    expect(lessonCounts(l, p).done).toBe(false);
    for (let i = 0; i < l.steps.length; i++) p = toggleStep(p, l.id, i, '2026-11-19');
    expect(lessonCounts(l, p).stepsDone).toBe(l.steps.length);
    expect(lessonCounts(l, p).done).toBe(false);
    for (let i = 0; i < l.quiz.length; i++) p = markRight(p, l.id, i, '2026-11-19');
    expect(lessonCounts(l, p).done).toBe(true);
    expect(totals(p).lessonsDone).toBe(1);
    expect(p.last).toBe(l.id);
  });

  it('unticks a step, and records the day everything was first finished', () => {
    let p = emptyProgress();
    for (const l of LESSONS) {
      l.steps.forEach((_, i) => (p = toggleStep(p, l.id, i, '2026-11-19')));
      l.quiz.forEach((_, i) => (p = markRight(p, l.id, i, '2026-11-19')));
    }
    expect(totals(p)).toMatchObject({ pct: 100, lessonsDone: LESSONS.length });
    expect(p.finishedAt).toBe('2026-11-19');
    p = toggleStep(p, LESSONS[2].id, 0, '2026-11-20');
    expect(p.finishedAt).toBe('');
    p = toggleStep(p, LESSONS[2].id, 0, '2026-11-21');
    expect(p.finishedAt).toBe('2026-11-21');
  });

  it('reads saved progress safely', () => {
    expect(parseProgress('')).toEqual(emptyProgress());
    expect(parseProgress('{not json')).toEqual(emptyProgress());
    const good = toggleStep(emptyProgress(), LESSONS[1].id, 2, '2026-11-19');
    expect(parseProgress(serializeProgress(good)).steps[itemKey(LESSONS[1].id, 2)]).toBe(true);
    // Ticks for steps that do not exist (an older or edited guide), and odd values, are dropped.
    const odd = parseProgress(JSON.stringify({ steps: { 'rules:99': true, 'nope:0': true, 'rules:0': 'yes' }, quiz: { 'rules:0': true }, name: 'x'.repeat(500), last: 'missing', finishedAt: 'today' }));
    expect(odd.steps).toEqual({});
    expect(odd.quiz).toEqual({ 'rules:0': true });
    expect(odd.name.length).toBe(80);
    expect(odd.last).toBe('');
    expect(odd.finishedAt).toBe('');
  });
});

describe('CMS guide printouts', () => {
  it('prints every lesson with empty boxes, and the answers at the end', () => {
    const h = guideHtml();
    for (const l of LESSONS) expect(h).toContain(l.title.replace(/&/g, '&amp;'));
    expect(h).toContain('Answers (for whoever is training)');
    expect(h).toContain('window.print()');
    expect((h.match(/class="box"/g) ?? []).length).toBe(LESSONS.reduce((a, l) => a + l.steps.length, 0));
  });

  it('escapes a name typed on the completion sheet', () => {
    const p = { ...emptyProgress(), name: '<script>alert(1)</script> & Co', finishedAt: '2026-11-19' };
    const h = completionHtml(p);
    expect(h).not.toContain('<script>alert(1)</script>');
    expect(h).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; Co');
    expect(h).toContain('19 November 2026');
  });
});
