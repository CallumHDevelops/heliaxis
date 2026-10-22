'use client';

import type { PackRecord } from '@/lib/site/offline';
import { formProgress, missing, openForms, stepProgress, stepShown, summaryLine } from '@/lib/site/rules';
import { REVIEW_STATE_LABEL } from '@/lib/site/review-shared';
import { STAGES_FOR, type Answers } from '@/lib/site/types';
import { shortDate } from '@/lib/site/client';
import { CheckSign } from './CheckSign';
import { CustomerSign, CustomerSignCard } from './CustomerSign';
import { DoneScreen } from './DoneScreen';
import { useJobForms } from './form-state';
import { PutRightScreen, REVIEW_PILL, reviewOf } from './Review';
import { go } from './nav';
import { StepScreen } from './StepScreen';

/**
 * The job's forms. On the job screen (no `rest`): "16 questions, 9 photos, about 10 minutes", the
 * step list with progress and ticks, What's left, and Start / Carry on / Check and sign. With `rest`
 * (/portal/site/job/<id>/<step>): that step (P5), its Check and sign (sign-<stage>, P10) or the
 * signed screen (done-<stage>, P11); for an electrician, "Hand the phone to Jane" (customer, P15);
 * after a return to site, its Put right (put-right-<n>, Review.tsx).
 */
export function JobSteps({ rec, answers, rest }: { rec: PackRecord; answers: Answers; rest: string[] }) {
  const jf = useJobForms(rec, answers);
  if (!jf) return null;
  const { ctx, forms } = jf;
  const job = rec.id;
  const key = rest[0];

  if (key) {
    if (key === 'customer' && rec.pack.assignment.trade === 'electrician') return <CustomerSign rec={rec} />;
    if (/^put-right-\d+$/.test(key)) return <PutRightScreen rec={rec} jf={jf} n={Number(key.slice(10))} />;
    if (key.startsWith('sign-') || key.startsWith('done-')) {
      const form = forms.find((f) => f.stage === key.slice(5));
      if (form && key.startsWith('sign-')) return <CheckSign rec={rec} jf={jf} form={form} />;
      if (form) return <DoneScreen rec={rec} form={form} pending={jf.pendingSign.includes(form.stage)} />;
    }
    for (const form of openForms(forms, jf.signed)) {
      const step = form.steps.find((s) => s.key === key);
      if (step) return <StepScreen rec={rec} answers={answers} jf={jf} form={form} step={step} />;
    }
    return <p className="sa-empty">That step isn’t on this job. Go back to the job.</p>;
  }

  if (!forms.length) return null;
  const open = openForms(forms, jf.signed);
  const waiting = forms.filter((f) => !open.includes(f));
  // Where the office's review of each signed form is up to ("Waiting for review", "Green light"…).
  const reviews = reviewOf(rec);
  const pillFor = (stage: string) => {
    const r = reviews.find((x) => x.stage === stage);
    return r ? { text: REVIEW_STATE_LABEL[r.state], tone: REVIEW_PILL[r.state].tone } : null;
  };
  return (
    <div className="sa-forms">
      {open.map((form) => {
        const signedOn = rec.pack.assignment.signoffs.find((s) => s.stage === form.stage);
        const signedHere = !signedOn && jf.pendingSign.includes(form.stage);
        const steps = form.steps.filter((s) => stepShown(s, ctx));
        const total = formProgress(form, ctx);
        const left = missing(form, ctx).must;
        const firstOpen = steps.find((s) => {
          const p = stepProgress(s, ctx);
          return p.done < p.total;
        });
        const started = total.done > 0;
        return (
          <section key={form.id} className="sa-card sa-form">
            <div className="sa-form-head">
              <h3>{form.title}</h3>
              {signedOn || signedHere ? (
                <span className="sa-pill-ok sa-tag">Signed ✓</span>
              ) : (
                <span className="sa-muted">
                  {total.done} of {total.total}
                </span>
              )}
            </div>
            {signedOn ? (
              <p className="sa-muted">
                Signed by {signedOn.signed_name} on {shortDate(signedOn.signed_at)}.
                {pillFor(form.stage) && <span className={`sa-review-pill is-${pillFor(form.stage)!.tone}`}>{pillFor(form.stage)!.text}</span>}
              </p>
            ) : signedHere ? (
              <p className="sa-muted">Signed on this phone. It will send when you have signal.</p>
            ) : (
              <p className="sa-muted">{summaryLine(form, ctx)}</p>
            )}
            <ol className="sa-steplist">
              {steps.map((s) => {
                const p = stepProgress(s, ctx);
                const done = p.total > 0 && p.done >= p.total;
                return (
                  <li key={s.key}>
                    <button type="button" className={`sa-steprow${done ? ' is-done' : ''}`} onClick={() => go(`/portal/site/job/${job}/${s.key}`)}>
                      <span className="sa-steprow-tick" aria-hidden="true">
                        {done ? '✓' : ''}
                      </span>
                      <span className="sa-steprow-title">{s.title}</span>
                      <span className="sa-steprow-count">
                        {p.done} of {p.total}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
            {!signedOn && !signedHere && left.length > 0 && started && (
              <div className="sa-left">
                <h4>What’s left</h4>
                <ul>
                  {left.slice(0, 6).map((m) => (
                    <li key={m.key}>
                      <button type="button" className="sa-todo-row" onClick={() => go(`/portal/site/job/${job}/${m.step}`)}>
                        <span>{m.label}</span>
                        <span className="sa-muted">{m.why}</span>
                      </button>
                    </li>
                  ))}
                  {left.length > 6 && <li className="sa-muted">and {left.length - 6} more</li>}
                </ul>
              </div>
            )}
            {!signedOn && !signedHere && (
              <button
                type="button"
                className="sa-btn sa-btn-1"
                onClick={() => go(`/portal/site/job/${job}/${firstOpen && left.length ? firstOpen.key : `sign-${form.stage}`}`)}
              >
                {!started ? 'Start' : left.length ? 'Carry on' : 'Check and sign'}
              </button>
            )}
          </section>
        );
      })}
      {rec.pack.assignment.trade === 'electrician' && (rec.pack.assignment.signoffs.length > 0 || jf.pendingSign.length > 0) && <CustomerSignCard rec={rec} />}
      {waiting.map((form) => (
        <section key={form.id} className="sa-card sa-form is-waiting">
          <div className="sa-form-head">
            <h3>{form.title}</h3>
          </div>
          <p className="sa-muted">Opens once the {STAGES_FOR[rec.pack.assignment.trade].includes('erection') && form.after === 'erection' ? 'scaffold is signed off as up' : 'first part is signed off'}.</p>
        </section>
      ))}
    </div>
  );
}
