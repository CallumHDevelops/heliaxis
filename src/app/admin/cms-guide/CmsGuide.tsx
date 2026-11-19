'use client';

import Link from 'next/link';
import { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import '../crm/crm.css';
import {
  completionHtml,
  GUIDE_CHECKED,
  guideHtml,
  LESSONS,
  lessonCounts,
  markRight,
  parseProgress,
  serializeProgress,
  toggleStep,
  totals,
  emptyProgress,
  itemKey,
  type Lesson,
  type Progress,
} from '@/lib/cms-guide';

/* Progress lives in this browser only (localStorage), read through useSyncExternalStore so the first paint matches the server. */
const KEY = 'hx-cms-guide-v1';
let memory = '';
const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) cb();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', onStorage);
  };
}
function getSnapshot() {
  try {
    return window.localStorage.getItem(KEY) ?? memory;
  } catch {
    return memory;
  }
}
const getServerSnapshot = () => '';
function store(p: Progress) {
  const s = serializeProgress(p);
  memory = s;
  try {
    window.localStorage.setItem(KEY, s);
  } catch {
    // Private windows and blocked storage still work for this visit.
  }
  listeners.forEach((l) => l());
}

const LETTERS = 'ABCDEFGH';
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

function openPrint(html: string) {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}

export function CmsGuide({ admin }: { admin: boolean }) {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const progress = useMemo(() => parseProgress(raw), [raw]);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [note, setNote] = useState('');
  const panel = useRef<HTMLElement>(null);
  const lesson = LESSONS[idx];
  const t = totals(progress);
  const counts = lessonCounts(lesson, progress);

  const change = (p: Progress) => store(p);
  function go(i: number) {
    setIdx(i);
    setNote('');
    change({ ...progress, last: LESSONS[i].id });
    requestAnimationFrame(() => panel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  function answer(l: Lesson, qi: number, oi: number) {
    const k = itemKey(l.id, qi);
    setPicked((p) => ({ ...p, [k]: oi }));
    if (oi === l.quiz[qi].answer && !progress.quiz[k]) change(markRight(progress, l.id, qi, today()));
  }
  function reset() {
    if (!window.confirm('Start the guide again? Your ticks and quiz answers on this computer will be cleared.')) return;
    setPicked({});
    store({ ...emptyProgress(), name: progress.name });
    setIdx(0);
  }
  function print(kind: 'guide' | 'done') {
    setNote('');
    if (!openPrint(kind === 'guide' ? guideHtml() : completionHtml(progress))) setNote('Your browser blocked the print window. Allow pop-ups for this site and try again.');
  }

  const lastIdx = LESSONS.findIndex((l) => l.id === progress.last);
  const finished = t.lessonsDone === t.lessons;

  return (
    <div className="cg">
      <header className="cg-head">
        <div>
          <h1>CMS guide</h1>
          <p>
            How to build, check and publish pages on heliaxis.co.uk. {LESSONS.length} short lessons, about {LESSONS.reduce((a, l) => a + l.minutes, 0)} minutes in all: tick off each step on the real screens, then answer a quick quiz.
            Last checked {GUIDE_CHECKED}.
          </p>
        </div>
      </header>

      <div className="cg-body">
        <aside className="cg-rail" aria-label="Lessons">
          <div className="cg-total">
            <div className="cg-total__row">
              <b>{t.pct}%</b>
              <span>
                {t.lessonsDone} of {t.lessons} lessons done
              </span>
            </div>
            <div className="cg-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={t.pct} aria-label="Guide progress">
              <span style={{ width: `${t.pct}%` }} />
            </div>
            {lastIdx >= 0 && lastIdx !== idx && !finished && (
              <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => go(lastIdx)}>
                Continue where you left off
              </button>
            )}
          </div>

          <nav>
            <ol className="cg-nav">
              {LESSONS.map((l, i) => {
                const c = lessonCounts(l, progress);
                return (
                  <li key={l.id}>
                    <button type="button" className={`cg-nav__item${i === idx ? ' is-on' : ''}${c.done ? ' is-done' : ''}`} aria-current={i === idx ? 'step' : undefined} onClick={() => go(i)}>
                      <span className="cg-dot" aria-hidden="true">
                        {c.done ? '✓' : i + 1}
                      </span>
                      <span className="cg-nav__t">
                        {l.title}
                        <small>
                          {c.done ? 'Done' : c.started ? `${c.stepsDone + c.quizDone} of ${c.steps + c.quiz} done` : `${l.minutes} min`}
                        </small>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>

          <div className="cg-tools">
            <label className="cg-name">
              <span>Your name (for the completion sheet)</span>
              <input className="crm-input" value={progress.name} maxLength={80} onChange={(e) => change({ ...progress, name: e.target.value })} autoComplete="name" />
            </label>
            <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => print('guide')}>
              Print the handout
            </button>
            <button type="button" className="crm-link" onClick={reset}>
              Start again
            </button>
            <small className="cg-muted">Your progress is saved in this browser only.</small>
            {note && <p className="crm-banner crm-banner--err">{note}</p>}
          </div>
        </aside>

        <section className="cg-lesson" ref={panel} aria-labelledby="cg-title">
          <p className="cg-kicker">
            Lesson {idx + 1} of {LESSONS.length} · about {lesson.minutes} minutes
          </p>
          <h2 id="cg-title">{lesson.title}</h2>
          <p className="cg-goal">{lesson.goal}</p>
          {lesson.read.map((r, i) => (
            <p key={i}>{r}</p>
          ))}

          {lesson.table && (
            <div className="cg-table-wrap">
              <table className="cg-table">
                <thead>
                  <tr>
                    <th scope="col">{lesson.table.head[0]}</th>
                    <th scope="col">{lesson.table.head[1]}</th>
                  </tr>
                </thead>
                <tbody>
                  {lesson.table.rows.map((r) => (
                    <tr key={r[0]}>
                      <th scope="row">{r[0]}</th>
                      <td>{r[1]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="cg-sec">
            <div className="cg-sec__head">
              <h3>{lesson.stepsTitle}</h3>
              <span className="cg-count">
                {counts.stepsDone} of {counts.steps} ticked
              </span>
            </div>
            <ol className="cg-steps">
              {lesson.steps.map((s, i) => {
                const done = !!progress.steps[itemKey(lesson.id, i)];
                return (
                  <li key={i} className={`cg-step${done ? ' is-done' : ''}`}>
                    <label>
                      <input type="checkbox" checked={done} onChange={() => change(toggleStep(progress, lesson.id, i, today()))} />
                      <span>
                        {s.text}
                        {s.adminOnly && <em className="cg-admin">{admin ? 'Admins only' : 'Admins only: you can read this one'}</em>}
                      </span>
                    </label>
                    {s.open && (
                      <Link className="crm-btn crm-btn--ghost crm-btn--small cg-open" href={s.open.href} target="_blank" rel="noreferrer">
                        {s.open.label}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>

          {lesson.callouts.map((c) => (
            <aside key={c.title} className={`cg-note cg-note--${c.kind}`}>
              <b>
                {c.kind === 'watch' ? 'Watch out: ' : 'Good to know: '}
                {c.title}
              </b>
              <p>{c.text}</p>
            </aside>
          ))}

          <div className="cg-sec">
            <div className="cg-sec__head">
              <h3>Check yourself</h3>
              <span className="cg-count">
                {counts.quizDone} of {counts.quiz} right
              </span>
            </div>
            {lesson.quiz.map((q, qi) => {
              const k = itemKey(lesson.id, qi);
              const right = !!progress.quiz[k];
              const choice = picked[k];
              const wrong = choice !== undefined && choice !== q.answer && !right;
              return (
                <fieldset key={k} className="cg-q">
                  <legend>
                    {qi + 1}. {q.q}
                  </legend>
                  <div className="cg-opts">
                    {q.options.map((o, oi) => {
                      const isRight = oi === q.answer;
                      const cls = right && isRight ? ' is-right' : !right && choice === oi && !isRight ? ' is-wrong' : '';
                      return (
                        <button key={oi} type="button" className={`cg-opt${cls}`} disabled={right} aria-pressed={choice === oi || (right && isRight)} onClick={() => answer(lesson, qi, oi)}>
                          <span className="cg-letter" aria-hidden="true">
                            {LETTERS[oi]}
                          </span>
                          <span>{o}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="cg-feedback" role="status" aria-live="polite">
                    {right ? (
                      <>
                        <b className="cg-ok">Correct.</b> {q.why}
                      </>
                    ) : wrong ? (
                      <b className="cg-bad">Not quite: have another go.</b>
                    ) : null}
                  </p>
                </fieldset>
              );
            })}
          </div>

          <div className={`cg-foot${counts.done ? ' is-done' : ''}`}>
            {counts.done ? (
              <p>
                <b>Lesson complete.</b> {idx < LESSONS.length - 1 ? 'On to the next one.' : finished ? 'That is the whole guide.' : 'Go back and finish the lessons still marked in the list.'}
              </p>
            ) : (
              <p className="cg-muted">
                To finish this lesson: tick every step and answer every question correctly ({counts.stepsDone + counts.quizDone} of {counts.steps + counts.quiz} so far).
              </p>
            )}
            <div className="cg-foot__btns">
              {idx > 0 && (
                <button type="button" className="crm-btn crm-btn--ghost" onClick={() => go(idx - 1)}>
                  Previous lesson
                </button>
              )}
              {idx < LESSONS.length - 1 && (
                <button type="button" className={`crm-btn ${counts.done ? 'crm-btn--solar' : 'crm-btn--ghost'}`} onClick={() => go(idx + 1)}>
                  Next lesson
                </button>
              )}
            </div>
          </div>

          {finished && (
            <div className="cg-finish" role="status">
              <h3>You have finished the CMS guide</h3>
              <p>
                {progress.name ? `${progress.name}, you` : 'You'} have worked through all {t.lessons} lessons{progress.finishedAt ? ` (${new Date(`${progress.finishedAt}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })})` : ''}.
                Print the completion sheet to hand to whoever is training you, then start with three pages from the weekly routine.
              </p>
              <button type="button" className="crm-btn crm-btn--solar" onClick={() => print('done')}>
                Print the completion sheet
              </button>
            </div>
          )}

          <p className="cg-help">
            Want the detail?{' '}
            {lesson.help.map((h, i) => (
              <span key={h.href}>
                {i > 0 && ' · '}
                <Link href={h.href} className="crm-link" target="_blank" rel="noreferrer">
                  {h.label}
                </Link>
              </span>
            ))}
          </p>
        </section>
      </div>
    </div>
  );
}
