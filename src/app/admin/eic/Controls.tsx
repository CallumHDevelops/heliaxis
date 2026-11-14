'use client';

import { useState } from 'react';

/** One answer's input, whatever its type: the same controls for the certificate's questions and for a board's and circuit's columns. */
export type Ctl = {
  type: string;
  label: string;
  options?: { key: string; label: string }[];
  unit?: string;
  dp?: number;
  chips?: number[];
  picks?: string[];
  choices?: string[];
  gt?: boolean;
  na?: boolean;
  cant?: string;
};
type Set = (v: unknown) => void;

const SEG: Record<string, [string, string][]> = {
  YN: [['yes', 'Yes'], ['no', 'No']],
  YNN: [['yes', 'Yes'], ['no', 'No'], ['na', 'N/A']],
  PF: [['pass', 'Pass'], ['fail', 'Fail']],
  PFN: [['pass', 'Pass'], ['fail', 'Fail'], ['na', 'N/A']],
  TICK: [['done', '✓ Done'], ['problem', '✗ Problem'], ['na', 'N/A']],
};

/** A number as typed: "0.45", or ">999" when the tester shows greater-than. Anything else isn't a number. */
const toNumber = (s: string): number | string | undefined => {
  const t = s.trim().replace(',', '.');
  if (!t) return undefined;
  if (/^>\s*\d+(\.\d+)?$/.test(t)) return `>${t.replace(/^>\s*/, '')}`;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
};
const shown = (v: unknown) => (v === undefined || v === null ? '' : String(v));

/** The choices of a one-tap question (Yes/No, Pass/Fail, a list of options), or null when it isn't one. */
export function choicesOf(c: Pick<Ctl, 'type' | 'options'>): { key: string; label: string }[] | null {
  if (SEG[c.type]) return SEG[c.type].map(([key, label]) => ({ key, label }));
  return c.type === 'SEL' ? (c.options ?? []) : null;
}

function Seg({ opts, value, onChange, label, numbered }: { opts: { key: string; label: string }[]; value: unknown; onChange: Set; label: string; numbered?: boolean }) {
  return (
    <div className="em-seg" role="radiogroup" aria-label={label}>
      {opts.map((o, i) => (
        <button key={o.key} type="button" role="radio" aria-checked={value === o.key} className={value === o.key ? 'is-on' : ''} onClick={() => onChange(value === o.key ? undefined : o.key)}>
          {numbered && i < 9 ? <i className="em-key">{i + 1}</i> : null}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Num({ c, value, onChange }: { c: Ctl; value: unknown; onChange: Set }) {
  const [text, setText] = useState(shown(value));
  const [focus, setFocus] = useState(false);
  const display = focus ? text : shown(value);
  const gt = display.startsWith('>');
  const commit = (s: string) => {
    setText(s);
    const n = toNumber(s);
    if (s.trim() === '') onChange(undefined);
    else if (n !== undefined) onChange(n);
  };
  if (c.na && value === 'na')
    return (
      <button type="button" className="em-na is-on" onClick={() => onChange(undefined)}>
        ✓ N/A <small>(click to change)</small>
      </button>
    );
  const bad = display.trim() !== '' && toNumber(display) === undefined;
  return (
    <div className="em-numwrap">
      <div className={`em-num${bad ? ' is-bad' : ''}`}>
        {c.gt && (
          <button type="button" className={`em-gt${gt ? ' is-on' : ''}`} aria-pressed={gt} aria-label="Greater than" onClick={() => commit(gt ? display.slice(1) : `>${display}`)}>
            &gt;
          </button>
        )}
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          aria-label={c.label}
          value={display}
          onFocus={() => {
            setText(shown(value));
            setFocus(true);
          }}
          onBlur={() => setFocus(false)}
          onChange={(e) => commit(e.target.value)}
        />
        {c.unit && <span className="em-unit">{c.unit}</span>}
      </div>
      {bad && <small className="em-err">Numbers only.</small>}
      {!!c.chips?.length && (
        <div className="em-chips">
          {c.chips.map((n) => (
            <button key={n} type="button" className={value === n ? 'is-on' : ''} onClick={() => commit(String(n))}>
              {n}
            </button>
          ))}
        </div>
      )}
      {c.na && (
        <button type="button" className="em-na" onClick={() => onChange('na')}>
          N/A
        </button>
      )}
    </div>
  );
}

export function Control({ c, value, onChange, numbered }: { c: Ctl; value: unknown; onChange: Set; numbered?: boolean }) {
  if (SEG[c.type]) return <Seg opts={SEG[c.type].map(([key, label]) => ({ key, label }))} value={value} onChange={onChange} label={c.label} numbered={numbered} />;
  switch (c.type) {
    case 'CONFIRM':
      return (
        <div className="em-confirm">
          <button type="button" role="checkbox" aria-checked={value === true} className={value === true ? 'is-on' : ''} onClick={() => onChange(value === true ? undefined : true)}>
            <span aria-hidden="true">{value === true ? '✓' : ''}</span>
            {value === true ? 'Confirmed' : 'Click to confirm'}
          </button>
          {c.cant && (
            <button type="button" className={`crm-link${value === 'cant' ? ' is-on' : ''}`} onClick={() => onChange(value === 'cant' ? undefined : 'cant')}>
              {value === 'cant' ? `✓ ${c.cant}` : c.cant}
            </button>
          )}
        </div>
      );
    case 'NUM':
      return <Num c={c} value={value} onChange={onChange} />;
    case 'SEL':
      return <Seg opts={c.options ?? []} value={value} onChange={onChange} label={c.label} numbered={numbered} />;
    case 'MULTI': {
      const list = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="em-chips em-chips--multi">
          {(c.options ?? []).map((o) => (
            <button key={o.key} type="button" className={list.includes(o.key) ? 'is-on' : ''} onClick={() => onChange(list.includes(o.key) ? list.filter((x) => x !== o.key) : [...list, o.key])}>
              {list.includes(o.key) ? '✓ ' : ''}
              {o.label}
            </button>
          ))}
        </div>
      );
    }
    case 'LONG':
      return <textarea className="crm-input em-long" rows={4} aria-label={c.label} value={shown(value)} onChange={(e) => onChange(e.target.value || undefined)} />;
    default: {
      // TEXT: a box, with the common answers as chips underneath.
      const quick = c.picks ?? c.choices ?? [];
      return (
        <div className="em-textwrap">
          <input className="crm-input" type="text" aria-label={c.label} value={shown(value)} onChange={(e) => onChange(e.target.value || undefined)} />
          {!!quick.length && (
            <div className="em-chips">
              {quick.map((q) => (
                <button key={q} type="button" className={value === q ? 'is-on' : ''} onClick={() => onChange(value === q ? undefined : q)}>
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>
      );
    }
  }
}
