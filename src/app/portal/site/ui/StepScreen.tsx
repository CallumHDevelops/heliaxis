'use client';

import { useEffect, useRef, useState } from 'react';
import type { Field, SiteForm, Step } from '@/lib/site/forms/types';
import { setAnswer, type PackRecord } from '@/lib/site/offline';
import { needOf, slotsOf, stepProgress, stepShown, visibleFields } from '@/lib/site/rules';
import type { Answers, Source } from '@/lib/site/types';
import { SyncLine, TopBar } from './bits';
import type { JobForms } from './form-state';
import { go } from './nav';
import { PhotoSlot } from './PhotoSlot';
import { ScanField } from './ScanSheet';
import { Chips, Confirm, NumberBox, PerString, SourceTag, SuggestChip, TextBox, Tiles } from './widgets';

const SIDE_LABEL: Record<string, string> = { front: 'Front', rear: 'Rear', left: 'Left side', right: 'Right side' };

/** The key changed last: a follow-up that opens because of it takes the focus. */
let lastChanged = '';

/** P5: one step, one question per row, follow-ups opening under their row; Back and Next in the same place every time. */
export function StepScreen({ rec, answers, jf, form, step }: { rec: PackRecord; answers: Answers; jf: JobForms; form: SiteForm; step: Step }) {
  const { ctx } = jf;
  const job = rec.id;
  const steps = form.steps.filter((s) => stepShown(s, ctx));
  const at = steps.findIndex((s) => s.key === step.key);
  const fields = visibleFields(step, ctx);
  const [more, setMore] = useState(false);
  const p = stepProgress(step, ctx);
  const locked = jf.signed.includes(form.stage);
  const main = fields.filter((f) => f.level !== 'optional');
  const extra = fields.filter((f) => f.level === 'optional');
  const next = at < steps.length - 1 ? `/portal/site/job/${job}/${steps[at + 1].key}` : `/portal/site/job/${job}/sign-${form.stage}`;
  const prev = at > 0 ? `/portal/site/job/${job}/${steps[at - 1].key}` : `/portal/site/job/${job}`;

  const row = (f: Field) => <FieldRow key={f.key} f={f} rec={rec} answers={answers} jf={jf} locked={locked && !f.late} />;
  return (
    <>
      <TopBar title={step.title} onBack={() => go(`/portal/site/job/${job}`)} />
      <div className="sa-progress" aria-hidden="true">
        <span style={{ width: `${p.total ? Math.round((p.done / p.total) * 100) : 100}%` }} />
      </div>
      <p className="sa-progress-text">
        {form.title} · {step.title} · {p.done} of {p.total}
      </p>
      <SyncLine />
      <main className="sa-main sa-step">
        {locked && <p className="sa-alert">Signed off. Ask the office to reopen it if something needs changing.</p>}
        {step.intro && <p className="sa-intro">{step.intro}</p>}
        {main.map(row)}
        {extra.length > 0 && (
          <div className="sa-more">
            <button type="button" className="sa-link" aria-expanded={more} onClick={() => setMore((m) => !m)}>
              {more ? 'Less detail' : `More detail (${extra.length})`}
            </button>
            {more && extra.map(row)}
          </div>
        )}
      </main>
      <nav className="sa-bottom">
        <button type="button" className="sa-btn sa-btn-2" onClick={() => go(prev)}>
          Back
        </button>
        <button type="button" className="sa-btn sa-btn-1" onClick={() => go(next)}>
          {at < steps.length - 1 ? 'Next' : 'Check and sign'}
        </button>
      </nav>
    </>
  );
}

function FieldRow({ f, rec, answers, jf, locked }: { f: Field; rec: PackRecord; answers: Answers; jf: JobForms; locked: boolean }) {
  const { ctx } = jf;
  const job = rec.id;
  const v = ctx.values[f.key];
  const ref = useRef<HTMLDivElement>(null);
  const set = (value: unknown, src: Source = 'typed') => {
    lastChanged = f.key;
    void setAnswer(job, f.key, value, src);
  };

  // A follow-up that has just opened: into view, and its first box focused.
  useEffect(() => {
    if (!f.parent || lastChanged !== f.parent || !ref.current) return;
    ref.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    ref.current.querySelector<HTMLElement>('input, textarea')?.focus({ preventScroll: true });
  }, [f.parent]);

  const s = f.suggest?.(ctx) ?? null;
  const suggest = s && v === undefined && !locked ? s : null;
  const note = f.note?.(ctx);
  let widget: React.ReactNode = null;
  switch (f.type) {
    case 'YN':
    case 'YNN':
    case 'PF':
    case 'PFN':
    case 'TICK':
      widget = <Tiles field={f} value={v} onChange={set} disabled={locked} />;
      break;
    case 'CONFIRM':
      widget = <Confirm field={f} value={v} onChange={set} disabled={locked} />;
      break;
    case 'NUM':
      widget = <NumberBox field={f} value={v} onChange={set} disabled={locked} />;
      break;
    case 'TEXT':
    case 'LONG':
      widget = <TextBox field={f} value={v} onChange={set} disabled={locked} />;
      break;
    case 'SEL':
    case 'MULTI':
      widget = <Chips field={f} value={v} onChange={set} disabled={locked} />;
      break;
    case 'PER_STRING':
      widget = <PerString field={f} ctx={ctx} value={v} onChange={set} disabled={locked} />;
      break;
    case 'SCAN':
      widget = <ScanField field={f} ctx={ctx} value={v} job={job} onChange={(x) => set(x, x?.some((c) => c.src === 'scan') ? 'scan' : 'typed')} disabled={locked} />;
      break;
    case 'AUTO':
      widget = <p className="sa-auto">{s ? s.text : '–'}</p>;
      break;
    case 'PHOTOS': {
      const need = needOf(f, ctx);
      widget = slotsOf(f, ctx).map((slot) => (
        <PhotoSlot key={slot} field={f} slot={slot} title={slot.includes(':') ? SIDE_LABEL[slot.split(':')[1]] ?? slot.split(':')[1] : undefined} need={need} rec={rec} photos={jf.photos[slot] ?? []} locked={locked} />
      ));
      break;
    }
  }
  const fixing = f.fix && v === f.fix.when;
  return (
    <div ref={ref} className={`sa-q${f.parent ? ' sa-follow' : ''}`} data-key={f.key}>
      <div className="sa-q-head">
        <h3 className="sa-q-label">
          {f.label}
          {f.level === 'optional' && <span className="sa-muted"> (if you can)</span>}
        </h3>
        <SourceTag answer={answers[f.key]} />
      </div>
      {f.hint && <p className="sa-q-hint">{f.hint}</p>}
      {note && <p className="sa-q-note">{note}</p>}
      {suggest && <SuggestChip s={suggest} onTake={() => set(suggest.v, suggest.src)} />}
      {widget}
      {fixing && <p className="sa-fix">{f.fix!.text}</p>}
    </div>
  );
}
