'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import type { Field, SiteForm, Step } from '@/lib/site/forms/types';
import { setAnswer, type PackRecord } from '@/lib/site/offline';
import { needOf, slotsOf, stepProgress, stepShown, valueOf, visibleFields } from '@/lib/site/rules';
import type { Answers, Source } from '@/lib/site/types';
import { SyncLine, TopBar } from './bits';
import { FileSlot } from './FileSlot';
import type { JobForms } from './form-state';
import { go } from './nav';
import { PhotoSlot } from './PhotoSlot';
import { Evidence, Info, MissingPanel } from './rows';
import { ScanField } from './ScanSheet';
import { StringsStep } from './StringsStep';
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
  // A group's heading above the first of its rows that's asked ("Solar PV", "Part 1: General").
  const groupOf = new Map<string, string>();
  let group = '';
  for (const f of step.fields) {
    if (f.group) group = f.group;
    groupOf.set(f.key, group);
  }
  const rows = (list: Field[]) =>
    list.map((f, i) => {
      const head = groupOf.get(f.key);
      return (
        <Fragment key={f.key}>
          {head && head !== groupOf.get(list[i - 1]?.key ?? '') && <h3 className="sa-group">{head}</h3>}
          {row(f)}
        </Fragment>
      );
    });
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
        {step.layout === 'strings' ? <StringsStep step={step} rec={rec} answers={answers} jf={jf} locked={locked} row={row} /> : rows(main)}
        {extra.length > 0 && (
          <div className="sa-more">
            <button type="button" className="sa-link" aria-expanded={more} onClick={() => setMore((m) => !m)}>
              {more ? 'Less detail' : `More detail (${extra.length})`}
            </button>
            {more && rows(extra)}
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

/** Labels of every photo slot on the job's forms, and the roofer's evidence, for the evidence lines. */
function slotLabels(jf: JobForms): Record<string, string> {
  const out: Record<string, string> = { RF2: 'roof hooks', RX4p: 'cable entry' };
  for (const form of jf.forms) for (const st of form.steps) for (const f of st.fields) if (f.type === 'PHOTOS') out[f.key] = f.label;
  return out;
}

export function FieldRow({ f, rec, answers, jf, locked }: { f: Field; rec: PackRecord; answers: Answers; jf: JobForms; locked: boolean }) {
  const { ctx } = jf;
  const job = rec.id;
  const given = Object.prototype.hasOwnProperty.call(ctx.values, f.key);
  const v = valueOf(f, ctx);
  const ref = useRef<HTMLDivElement>(null);
  const set = (value: unknown, src: Source = 'typed') => {
    lastChanged = f.key;
    // A worked-out answer taken away is kept as 'off', so it isn't worked out again.
    void setAnswer(job, f.key, value === undefined && f.auto ? 'off' : value, src);
    if (f.fills && value === f.fills.when) for (const k of f.fills.keys) void setAnswer(job, k, f.fills.v, 'typed');
  };

  // A follow-up that has just opened: into view, and its first box focused.
  useEffect(() => {
    if (!f.parent || lastChanged !== f.parent || !ref.current) return;
    ref.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    ref.current.querySelector<HTMLElement>('input, textarea')?.focus({ preventScroll: true });
  }, [f.parent]);

  const s = f.suggest?.(ctx) ?? null;
  const suggest = s && !given && !locked ? s : null;
  // Taken from the roofer, and the roofer has changed it since: offered again, never changed underneath.
  const changedSince = s && given && !locked && s.src === 'roofer' && answers[f.key]?.src === 'roofer' && JSON.stringify(ctx.values[f.key]) !== JSON.stringify(s.v) ? s : null;
  const note = f.note?.(ctx);
  const auto = f.auto && !given && v !== undefined ? (f.autoFrom?.(ctx) ?? 'Worked out for you') : null;
  const labels = slotLabels(jf);
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
      widget =
        f.na && v === 'na' ? (
          <button type="button" className="sa-na is-on" disabled={locked} onClick={() => set(undefined)}>
            ✓ N/A <span className="sa-muted">(tap to change)</span>
          </button>
        ) : (
          <>
            <NumberBox field={f} value={v} onChange={set} disabled={locked} />
            {f.na && (
              <button type="button" className="sa-na" disabled={locked} onClick={() => set('na')}>
                N/A
              </button>
            )}
          </>
        );
      break;
    case 'TEXT':
    case 'LONG':
      widget = (
        <>
          <TextBox field={f} value={v} onChange={set} disabled={locked} />
          {!!f.choices?.length && (
            <div className="sa-chips">
              {f.choices.map((c) => (
                <button key={c} type="button" className={`sa-chip${v === c ? ' is-on' : ''}`} disabled={locked} onClick={() => set(v === c ? undefined : c)}>
                  {v === c ? '✓ ' : ''}
                  {c}
                </button>
              ))}
            </div>
          )}
        </>
      );
      break;
    case 'SEL':
    case 'MULTI':
      widget = <Chips field={f} value={v} onChange={set} disabled={locked} />;
      break;
    case 'PER_STRING':
      widget = <PerString field={f} ctx={ctx} value={v} onChange={set} disabled={locked} />;
      break;
    case 'SCAN':
      widget = (
        <ScanField
          field={f}
          ctx={ctx}
          value={v}
          job={job}
          onChange={(x) => set(x, x?.some((c) => c.src === 'scan') ? 'scan' : x?.some((c) => c.src === 'photo') ? 'photo' : x?.some((c) => c.src === 'roofer') ? 'roofer' : 'typed')}
          disabled={locked}
        />
      );
      break;
    case 'AUTO':
      widget = f.panel === 'missing' ? <MissingPanel jf={jf} rec={rec} /> : <p className="sa-auto">{s ? s.text : '–'}</p>;
      break;
    case 'PHOTOS': {
      const need = needOf(f, ctx);
      widget = f.files ? (
        <FileSlot field={f} rec={rec} jf={jf} need={need} locked={locked} />
      ) : (
        slotsOf(f, ctx).map((slot) => (
          <PhotoSlot key={slot} field={f} slot={slot} title={slot.includes(':') ? SIDE_LABEL[slot.split(':')[1]] ?? slot.split(':')[1] : undefined} need={need} rec={rec} photos={jf.photos[slot] ?? []} locked={locked} />
        ))
      );
      break;
    }
  }
  const fixing = f.fix && v === f.fix.when;
  const bulk = f.bulk && !locked && f.bulk.when(ctx) && f.bulk.keys.some((k) => ctx.values[k] === undefined) ? f.bulk : null;
  return (
    <div ref={ref} className={`sa-q${f.parent ? ' sa-follow' : ''}`} data-key={f.key}>
      <div className="sa-q-head">
        <h3 className="sa-q-label">
          {f.say?.(ctx) ?? f.label}
          {f.level === 'optional' && <span className="sa-muted"> (if you can)</span>}
        </h3>
        <SourceTag answer={answers[f.key]} />
      </div>
      {f.hint && <p className="sa-q-hint sa-pre">{f.hint}</p>}
      {f.info && <Info text={f.info} />}
      {note && <p className="sa-q-note">{note}</p>}
      <Evidence f={f} jf={jf} rec={rec} labels={labels} />
      {auto && <p className="sa-autotag">{auto} ✓</p>}
      {bulk && (
        <button type="button" className="sa-btn sa-btn-2 sa-bulk" onClick={() => bulk.keys.forEach((k) => ctx.values[k] === undefined && void setAnswer(job, k, bulk.v, 'typed'))}>
          {bulk.label}
        </button>
      )}
      {suggest && <SuggestChip s={suggest} onTake={() => set(suggest.v, suggest.src)} />}
      {changedSince && <SuggestChip s={{ ...changedSince, text: `Changed since: ${changedSince.text}` }} onTake={() => set(changedSince.v, changedSince.src)} />}
      {widget}
      {fixing && <p className="sa-fix">{f.fix!.text}</p>}
    </div>
  );
}
