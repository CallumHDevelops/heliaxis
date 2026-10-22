'use client';

import { Fragment, useState } from 'react';
import type { Field, Step } from '@/lib/site/forms/types';
import { setAnswer, type PackRecord } from '@/lib/site/offline';
import { perStringValues, stringsOf, visibleFields } from '@/lib/site/rules';
import type { Answers, Source } from '@/lib/site/types';
import type { JobForms } from './form-state';
import { NumberBox, SourceTag, SuggestChip, TextBox, Tiles } from './widgets';

/**
 * P8, the string tests screen: the rows asked once (new install or re-test, what's tested, the tester,
 * strings), then a tab per string (1, 2, 3…) and that string's rows in their groups, each its own
 * card. "Same as string 1" is on by default where the field says so (cable type, irradiance, test
 * voltage, isolator, inverter) and never offered for a measurement. Expected Voc sits beside the measured box. What the
 * roofer gave is offered with one tap, for every string at once.
 */
export function StringsStep({ step, rec, answers, jf, locked, row }: { step: Step; rec: PackRecord; answers: Answers; jf: JobForms; locked: boolean; row: (f: Field) => React.ReactNode }) {
  const { ctx } = jf;
  const fields = visibleFields(step, ctx);
  const firstPer = fields.findIndex((f) => f.perString);
  const before = fields.slice(0, firstPer < 0 ? fields.length : firstPer).filter((f) => f.level !== 'optional');
  const per = fields.filter((f) => f.perString);
  const after = fields.slice(firstPer < 0 ? fields.length : firstPer).filter((f) => !f.perString);
  const n = per.length ? stringsOf(per[0], ctx) : 0;
  const [tab, setTab] = useState(0);
  const at = Math.min(tab, Math.max(0, n - 1));

  const stringDone = (i: number) => per.every((f) => f.level !== 'must' || answered(f, perStringValues(f, ctx)[i]));
  const groups: { title: string; note: string | null; fields: Field[] }[] = [];
  const groupOf = new Map<string, string>();
  let group = '';
  let note: string | null = null;
  for (const f of step.fields) {
    if (f.group) [group, note] = [f.group, f.groupNote ?? null];
    groupOf.set(f.key, group);
    if (!f.perString || !per.includes(f)) continue;
    const last = groups.at(-1);
    if (last && last.title === group) last.fields.push(f);
    else groups.push({ title: group, note, fields: [f] });
  }
  // The rows asked once, under their group's heading ("About this test", "Wrapping up").
  const once = (list: Field[]) =>
    list.map((f, i) => (
      <Fragment key={f.key}>
        {groupOf.get(f.key) && groupOf.get(f.key) !== groupOf.get(list[i - 1]?.key ?? '') && <h3 className="sa-qgroup">{groupOf.get(f.key)}</h3>}
        {row(f)}
      </Fragment>
    ));

  return (
    <>
      {once(before)}
      {n > 0 && (
        <div className="sa-strtabs-wrap">
          <div className="sa-strtabs" role="tablist" aria-label="Strings">
            {Array.from({ length: n }, (_, i) => (
              <button key={i} type="button" role="tab" aria-selected={i === at} className={`sa-strtab${i === at ? ' is-on' : ''}${stringDone(i) ? ' is-done' : ''}`} onClick={() => setTab(i)}>
                String {i + 1}
                {stringDone(i) ? ' ✓' : ''}
              </button>
            ))}
          </div>
          {groups.map((g) => (
            <section key={g.title} className="sa-strcard">
              <h3 className="sa-strcard-title">{g.title}</h3>
              {g.note && <p className="sa-intro">{g.note}</p>}
              {g.fields.map((f) => (
                <StringRow key={`${f.key}:${at}`} f={f} i={at} rec={rec} answers={answers} jf={jf} locked={locked} />
              ))}
            </section>
          ))}
          {at < n - 1 && (
            <button type="button" className="sa-btn sa-btn-2" onClick={() => (setTab(at + 1), window.scrollTo({ top: 0 }))}>
              On to string {at + 2}
            </button>
          )}
        </div>
      )}
      {once(after)}
    </>
  );
}

function answered(f: Field, v: unknown): boolean {
  if (f.na && v === 'na') return true;
  if (f.type === 'NUM') return (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && /^>\s*\d/.test(v));
  return typeof v === 'string' && v.trim().length > 0;
}

/** One row of one string: the box (or tiles), its N/A, Same as string 1, the note beside it. */
function StringRow({ f, i, rec, answers, jf, locked }: { f: Field; i: number; rec: PackRecord; answers: Answers; jf: JobForms; locked: boolean }) {
  const { ctx } = jf;
  const job = rec.id;
  const n = stringsOf(f, ctx);
  const raw = Array.isArray(ctx.values[f.key]) ? (ctx.values[f.key] as unknown[]) : [];
  const resolved = perStringValues(f, ctx);
  const sameOn = !!f.same && i > 0 && (raw[i] === null || raw[i] === undefined);
  const v = resolved[i];

  /** Write string i's value (null with Same as string 1 on), and anything the choice fills. */
  const write = (key: string, from: unknown[], value: unknown, src: Source = 'typed') => {
    const next = Array.from({ length: n }, (_, j) => (from[j] === undefined ? null : from[j]));
    next[i] = value === undefined ? null : value;
    void setAnswer(job, key, next.every((x) => x === null) ? undefined : next, src);
  };
  const set = (value: unknown) => {
    write(f.key, raw, value === undefined ? (f.same && i > 0 ? '' : null) : value);
    if (f.fills && value === f.fills.when) for (const k of f.fills.keys) write(k, Array.isArray(ctx.values[k]) ? (ctx.values[k] as unknown[]) : [], f.fills.v);
  };
  const s = f.suggest?.(ctx) ?? null;
  const suggest = s && ctx.values[f.key] === undefined && !locked ? s : null;
  const note = f.stringNote?.(ctx, i) ?? (i === 0 ? f.note?.(ctx) : null);

  let widget: React.ReactNode;
  if (v === 'na' && f.na) {
    widget = (
      <button type="button" className="sa-na is-on" disabled={locked} onClick={() => set(undefined)}>
        ✓ N/A <span className="sa-muted">(tap to change)</span>
      </button>
    );
  } else if (f.type === 'PF') widget = <Tiles field={f} value={v} onChange={(x) => set(x)} disabled={locked || sameOn} />;
  else if (f.type === 'NUM') widget = <NumberBox field={f} label={`${f.label}: string ${i + 1}`} value={v ?? undefined} onChange={(x) => set(x)} disabled={locked || sameOn} />;
  else
    widget = (
      <>
        <TextBox field={{ ...f, label: `${f.label}: string ${i + 1}` }} value={v ?? undefined} onChange={(x) => set(x)} disabled={locked || sameOn} />
        {!!f.choices?.length && !sameOn && (
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

  return (
    <div className="sa-q sa-strrow" data-key={f.key} data-string={i + 1}>
      <div className="sa-q-head">
        <h4 className="sa-q-label">{f.label}</h4>
        <SourceTag answer={answers[f.key]} />
      </div>
      {f.hint && i === 0 && <p className="sa-q-hint">{f.hint}</p>}
      {note && <p className="sa-q-note">{note}</p>}
      {suggest && <SuggestChip s={{ ...suggest, text: `${suggest.text}${n > 1 ? ' · every string' : ''}` }} onTake={() => void setAnswer(job, f.key, suggest.v, suggest.src)} />}
      {f.same && i > 0 && (
        <label className="sa-same">
          <input type="checkbox" checked={sameOn} disabled={locked} onChange={(e) => write(f.key, raw, e.target.checked ? null : '')} />
          <span>Same as string 1</span>
        </label>
      )}
      {widget}
      {f.na && v !== 'na' && !sameOn && (
        <button type="button" className="sa-na" disabled={locked} onClick={() => set('na')}>
          N/A
        </button>
      )}
    </div>
  );
}
