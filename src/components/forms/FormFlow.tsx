'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SignaturePad } from '@/components/subcontractors/SignaturePad';
import { visibility } from '@/lib/templates/rules';
import type { Answers, DocTemplate, TemplateField } from '@/lib/templates/types';
import './form-flow.css';

/**
 * A pack item's questions, one at a time (the office's "Complete it myself" and the installer's link):
 * a welcome, then each question on its own screen in big type (Enter for next, Y / N / A and A, B, C… to
 * pick), a review of every answer, and the signature when it's a form. Answers save as they go, so a
 * closed tab loses nothing. Questions that only apply after an earlier answer appear and disappear as
 * the template says.
 */
export type FlowView = {
  code: string;
  kind: 'form' | 'values';
  title: string;
  template: DocTemplate;
  answers: Answers;
  merge: Record<string, string>;
  status: 'open' | 'done';
  job: { ref: string | null; address: string; customer: string };
  signLine: { key: string; label: string } | null;
  who?: string;
  note?: string | null;
  submitted?: boolean;
};

type Q = TemplateField & { section: string };
type Screen = { at: 'intro' } | { at: 'q'; i: number } | { at: 'review' } | { at: 'sign' } | { at: 'done' };

const fill = (s: string | undefined, merge: Record<string, string>) => (s ?? '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => merge[k] ?? '');
const blank = (v: unknown) => v === null || v === undefined || String(v).trim() === '';
const isNa = (v: unknown) => /^n\/?a$/i.test(String(v ?? '').trim());
/** Questions that can be answered Not applicable (not a yes/no, which has its own N/A, nor a list). */
const canNa = (q: TemplateField) => !q.required && (q.kind === 'text' || q.kind === 'number' || q.kind === 'date' || q.kind === 'long');
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const YESNO: { v: string; label: string; key: string }[] = [
  { v: 'yes', label: 'Yes', key: 'Y' },
  { v: 'no', label: 'No', key: 'N' },
  { v: 'na', label: 'Not applicable', key: 'A' },
];
const shown = (q: Q, v: unknown) => {
  if (blank(v)) return '';
  if (isNa(v)) return 'Not applicable';
  if (q.kind === 'yesno') return YESNO.find((y) => y.v === v)?.label ?? String(v);
  return `${v}${q.kind === 'number' && q.unit ? ` ${q.unit}` : ''}`;
};

export function FormFlow({
  view,
  save,
  finish,
  onClose,
  who,
}: {
  view: FlowView;
  /** Save these answers (returns the view as it now is). */
  save: (answers: Answers) => Promise<FlowView>;
  /** Finish: sign (a form) and send. */
  finish: (sign: { name: string; image?: string } | null) => Promise<FlowView>;
  onClose?: () => void;
  /** Whose name to suggest for the signature. */
  who?: string;
}) {
  const t = view.template;
  // Pre-filled answers from the job ({{customer}}, {{commissioned}}…), only where nothing is answered yet; saved like any answer.
  const prefilled = useMemo(() => {
    const a: Answers = {};
    for (const s of t.sections) if (s.type === 'fields') for (const f of s.fields) if (blank(view.answers[f.key]) && f.prefill) {
      const v = fill(f.prefill, view.merge).trim();
      if (v) a[f.key] = v;
    }
    return a;
  }, [t, view]);
  const [answers, setAnswers] = useState<Answers>(() => ({ ...view.answers, ...prefilled }));
  const [help, setHelp] = useState(false);
  const [screen, setScreen] = useState<Screen>(view.status === 'done' || view.submitted ? { at: 'done' } : { at: 'intro' });
  const [dir, setDir] = useState<1 | -1>(1);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(who ?? '');
  const [image, setImage] = useState<string | null>(null);
  const dirty = useRef<Answers>({ ...prefilled });
  const input = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  // The questions asked for the answers so far, in order.
  const questions: Q[] = useMemo(() => {
    const vis = visibility(t, answers);
    return t.sections.flatMap((s, si) => (s.type === 'fields' && vis.sections[si] ? s.fields.filter((f) => vis.fields.has(f.key)).map((f) => ({ ...f, section: s.title })) : []));
  }, [t, answers]);
  const left = questions.filter((q) => blank(answers[q.key]));
  const answered = questions.filter((q) => !blank(answers[q.key])).length;
  const pct = screen.at === 'done' ? 100 : screen.at === 'review' || screen.at === 'sign' ? 100 : screen.at === 'q' ? Math.round((screen.i / Math.max(1, questions.length)) * 100) : 0;

  const flush = useCallback(async () => {
    const patch = dirty.current;
    if (!Object.keys(patch).length) return true;
    dirty.current = {};
    try {
      await save(patch);
      return true;
    } catch (e) {
      dirty.current = { ...patch, ...dirty.current };
      setErr(e instanceof Error ? e.message : 'Not saved. Check your signal.');
      return false;
    }
  }, [save]);

  const set = (key: string, v: string) => {
    setAnswers((a) => ({ ...a, [key]: v }));
    dirty.current[key] = v;
  };
  const go = (s: Screen, d: 1 | -1 = 1) => {
    setErr('');
    setHelp(false);
    setDir(d);
    // A worked-out answer (panels × Voc…) is filled in on arrival, when it's still empty and its parts are numbers.
    if (s.at === 'q') {
      const q = questions[s.i];
      if (q?.calc?.length && blank(answers[q.key])) {
        const parts = q.calc.map((k) => Number(answers[k]));
        if (parts.every((n) => Number.isFinite(n) && n > 0)) set(q.key, String(Math.round(parts.reduce((a, b) => a * b, 1) * 100) / 100));
      }
    }
    setScreen(s);
    void flush();
  };
  const next = () => {
    if (screen.at === 'intro') return go(questions.length ? { at: 'q', i: 0 } : { at: 'review' });
    if (screen.at !== 'q') return;
    const q = questions[screen.i];
    if (q?.required && blank(answers[q.key])) return setErr('This one’s needed. Answer it to carry on.');
    if (q?.kind === 'number' && !blank(answers[q.key]) && !isNa(answers[q.key]) && !Number.isFinite(Number(answers[q.key]))) return setErr('That needs to be a number, or Not applicable.');
    if (q && !q.required && blank(answers[q.key])) return setErr('Answer it, or choose Not applicable.');
    go(screen.i + 1 < questions.length ? { at: 'q', i: screen.i + 1 } : { at: 'review' });
  };
  const back = () => {
    if (screen.at === 'q') go(screen.i > 0 ? { at: 'q', i: screen.i - 1 } : { at: 'intro' }, -1);
    else if (screen.at === 'review') go(questions.length ? { at: 'q', i: questions.length - 1 } : { at: 'intro' }, -1);
    else if (screen.at === 'sign') go({ at: 'review' }, -1);
  };
  const pick = (key: string, v: string) => {
    set(key, v);
    // A tap on a choice moves on by itself, after a beat so the choice is seen.
    setTimeout(() => {
      setScreen((s) => {
        if (s.at !== 'q') return s;
        setDir(1);
        return s.i + 1 < questions.length ? { at: 'q', i: s.i + 1 } : { at: 'review' };
      });
      void flush();
    }, 260);
  };

  async function submit() {
    if (left.length) return setErr(`${left.length} question${left.length === 1 ? ' is' : 's are'} still to answer.`);
    if (view.signLine && !name.trim()) return setErr('Type your name to sign.');
    setBusy(true);
    setErr('');
    if (!(await flush())) return setBusy(false);
    try {
      await finish(view.kind === 'form' ? { name: name.trim(), image: image ?? undefined } : null);
      setDir(1);
      setScreen({ at: 'done' });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Not sent. Try again.');
    }
    setBusy(false);
  }

  // Keys: Enter for next (Ctrl+Enter in a long answer), Y/N/A and letters to pick, Escape or Alt+← for back.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
      if (e.key === 'Enter' && !e.shiftKey && (el.tagName !== 'TEXTAREA' || e.ctrlKey || e.metaKey)) {
        if (screen.at === 'intro' || screen.at === 'q') {
          e.preventDefault();
          next();
        }
        return;
      }
      if ((e.key === 'ArrowLeft' && e.altKey) || (e.key === 'Escape' && screen.at !== 'intro')) return back();
      if (typing || screen.at !== 'q') return;
      const q = questions[screen.i];
      if (!q) return;
      const k = e.key.toUpperCase();
      if (q.kind === 'yesno') {
        const y = YESNO.filter((x) => !(q.noNa && x.v === 'na')).find((x) => x.key === k);
        if (y) pick(q.key, y.v);
      } else if (q.kind === 'choice') {
        const n = LETTERS.indexOf(k);
        if (n >= 0 && q.options?.[n]) pick(q.key, q.options[n]);
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });
  useEffect(() => {
    input.current?.focus();
  }, [screen]);
  // Save before the page goes away.
  useEffect(() => {
    const on = () => void flush();
    window.addEventListener('pagehide', on);
    return () => window.removeEventListener('pagehide', on);
  }, [flush]);

  const q = screen.at === 'q' ? questions[screen.i] : null;
  const val = q ? String(answers[q.key] ?? '') : '';

  return (
    <div className="ff" data-dir={dir}>
      <div className="ff-bar" aria-hidden="true">
        <span style={{ width: `${pct}%` }} />
      </div>
      <header className="ff-top">
        <span className="ff-brand">Heliaxis</span>
        <span className="ff-title">{view.title}</span>
        {onClose && (
          <button type="button" className="ff-x" onClick={() => void flush().then(onClose)} aria-label="Close">
            ✕
          </button>
        )}
      </header>

      <main className="ff-stage" key={`${screen.at}-${screen.at === 'q' ? screen.i : ''}`}>
        {screen.at === 'intro' && (
          <section className="ff-card">
            <p className="ff-eyebrow">{view.job.ref ? `${view.job.ref} · ` : ''}{view.job.address}</p>
            <h1>{view.title}</h1>
            {t.intro && <p className="ff-lede">{fill(t.intro, view.merge)}</p>}
            {view.note && <p className="ff-note">“{view.note}”</p>}
            <p className="ff-meta">
              {questions.length} question{questions.length === 1 ? '' : 's'}
              {answered ? ` · ${answered} answered already` : ''} · about {Math.max(1, Math.round(questions.length / 4))} minute{questions.length > 7 ? 's' : ''}
            </p>
            <div className="ff-go">
              <button type="button" className="ff-btn" onClick={next}>
                {answered ? 'Carry on' : 'Start'}
              </button>
              <span className="ff-hint">
                press <kbd>Enter ↵</kbd>
              </span>
            </div>
          </section>
        )}

        {q && screen.at === 'q' && (
          <section className="ff-card">
            <p className="ff-eyebrow">
              {q.section} · {screen.i + 1} of {questions.length}
            </p>
            <h2 className="ff-q">
              {q.label}
              {q.required && <span className="ff-req" aria-label="needed"> *</span>}
              {q.help && (
                <button type="button" className={`ff-info${help ? ' on' : ''}`} aria-expanded={help} aria-label="What to put here" onClick={() => setHelp((h) => !h)}>
                  i
                </button>
              )}
            </h2>
            {q.hint && <p className="ff-lede">{q.hint}</p>}
            {q.help && help && <p className="ff-help">{q.help}</p>}

            {(q.kind === 'text' || q.kind === 'number' || q.kind === 'date') && (
              <div className="ff-field">
                <input
                  ref={input}
                  className="ff-input"
                  type={q.kind === 'date' && !isNa(val) ? 'date' : 'text'}
                  inputMode={q.kind === 'number' ? 'decimal' : undefined}
                  value={val}
                  onChange={(e) => set(q.key, e.target.value)}
                  placeholder={q.kind === 'number' ? 'Type a number' : 'Type your answer here…'}
                  aria-label={q.label}
                />
                {q.kind === 'number' && q.unit && <span className="ff-unit">{q.unit}</span>}
              </div>
            )}
            {q.kind === 'long' && (
              <textarea ref={input} className="ff-input ff-long" rows={4} value={val} onChange={(e) => set(q.key, e.target.value)} placeholder="Type your answer here…" aria-label={q.label} />
            )}
            {q.kind === 'yesno' && (
              <div className="ff-choices" role="radiogroup" aria-label={q.label}>
                {YESNO.filter((y) => !(q.noNa && y.v === 'na')).map((y) => (
                  <button key={y.v} type="button" role="radio" aria-checked={val === y.v} className={`ff-choice${val === y.v ? ' on' : ''}`} onClick={() => pick(q.key, y.v)}>
                    <kbd>{y.key}</kbd> {y.label}
                    {val === y.v && <span className="ff-tick">✓</span>}
                  </button>
                ))}
              </div>
            )}
            {q.kind === 'choice' && (
              <div className="ff-choices" role="radiogroup" aria-label={q.label}>
                {(q.options ?? []).map((o, n) => (
                  <button key={o} type="button" role="radio" aria-checked={val === o} className={`ff-choice${val === o ? ' on' : ''}`} onClick={() => pick(q.key, o)}>
                    <kbd>{LETTERS[n]}</kbd> {o}
                    {val === o && <span className="ff-tick">✓</span>}
                  </button>
                ))}
              </div>
            )}

            {err && <p className="ff-err" role="alert">{err}</p>}
            {(q.kind === 'text' || q.kind === 'number' || q.kind === 'date' || q.kind === 'long') && (
              <div className="ff-go">
                <button type="button" className="ff-btn" onClick={next}>
                  OK ✓
                </button>
                {canNa(q) && (
                  <button type="button" className={`ff-btn ff-btn--ghost${isNa(val) ? ' on' : ''}`} onClick={() => pick(q.key, 'N/A')}>
                    Not applicable
                  </button>
                )}
                <span className="ff-hint">
                  press <kbd>{q.kind === 'long' ? 'Ctrl + Enter ↵' : 'Enter ↵'}</kbd>
                </span>
              </div>
            )}
          </section>
        )}

        {screen.at === 'review' && (
          <section className="ff-card ff-review">
            <p className="ff-eyebrow">Nearly done</p>
            <h2 className="ff-q">Check your answers</h2>
            <Left left={left} questions={questions} go={(i) => go({ at: 'q', i }, -1)} />
            <ul>
              {questions.map((x, i) => (
                <li key={x.key} className={blank(answers[x.key]) ? 'is-missing' : ''}>
                  <button type="button" onClick={() => go({ at: 'q', i }, -1)}>
                    <span>{x.label}</span>
                    <b>{shown(x, answers[x.key]) || 'Still to answer'}</b>
                  </button>
                </li>
              ))}
            </ul>
            {err && <p className="ff-err" role="alert">{err}</p>}
            <div className="ff-go">
              {view.signLine ? (
                <button type="button" className="ff-btn" disabled={!!left.length} onClick={() => go({ at: 'sign' })}>
                  {left.length ? `${left.length} still to answer` : 'Sign it'}
                </button>
              ) : (
                <button type="button" className="ff-btn" disabled={busy || !!left.length} onClick={() => void submit()}>
                  {busy ? 'Sending…' : left.length ? `${left.length} still to answer` : 'Send it'}
                </button>
              )}
            </div>
          </section>
        )}

        {screen.at === 'sign' && view.signLine && (
          <section className="ff-card">
            <p className="ff-eyebrow">Last step</p>
            <h2 className="ff-q">{view.signLine.label}</h2>
            <p className="ff-lede">Signing confirms the answers are right. It locks the form and puts it in the customer’s handover pack.</p>
            <Left left={left} questions={questions} go={(i) => go({ at: 'q', i }, -1)} />
            <div className="ff-field">
              <input ref={input} className="ff-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" aria-label="Your full name" autoComplete="name" />
            </div>
            <div className="ff-pad">
              <SignaturePad onChange={setImage} height={150} />
            </div>
            {err && <p className="ff-err" role="alert">{err}</p>}
            <div className="ff-go">
              <button type="button" className="ff-btn" disabled={busy || !name.trim() || !!left.length} onClick={() => void submit()}>
                {busy ? 'Signing…' : 'Sign and send'}
              </button>
            </div>
          </section>
        )}

        {screen.at === 'done' && (
          <section className="ff-card ff-done">
            <div className="ff-big-tick" aria-hidden="true">
              ✓
            </div>
            <h2 className="ff-q">Thank you{who ? `, ${who.split(/\s+/)[0]}` : ''}</h2>
            <p className="ff-lede">{view.kind === 'form' ? 'It’s signed and in the handover pack.' : 'Your answers are in, and the handover pack has been updated.'}</p>
            {onClose ? (
              <div className="ff-go">
                <button type="button" className="ff-btn" onClick={onClose}>
                  Back to the job
                </button>
              </div>
            ) : (
              <p className="ff-meta">You can close this page.</p>
            )}
          </section>
        )}
      </main>

      {(screen.at === 'q' || screen.at === 'review' || screen.at === 'sign') && (
        <nav className="ff-nav" aria-label="Move between questions">
          <button type="button" onClick={back} aria-label="Previous question">
            ↑
          </button>
          {screen.at === 'q' && (
            <button type="button" onClick={next} aria-label="Next question">
              ↓
            </button>
          )}
        </nav>
      )}
    </div>
  );
}

/** "3 questions still to answer", each a link to its question. Nothing when all are answered. */
function Left({ left, questions, go }: { left: Q[]; questions: Q[]; go: (i: number) => void }) {
  if (!left.length) return null;
  return (
    <div className="ff-left" role="alert">
      <b>
        {left.length} question{left.length === 1 ? '' : 's'} still to answer
      </b>
      <span>Answer each one, or choose Not applicable where it doesn’t apply.</span>
      <ul>
        {left.map((q) => (
          <li key={q.key}>
            <button type="button" onClick={() => go(questions.indexOf(q))}>
              {q.label} →
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
