'use client';

import { useState } from 'react';
import type { Field, FormCtx, Suggestion } from '@/lib/site/forms/types';
import { stringsOf } from '@/lib/site/rules';
import { SOURCE_LABEL, type Answer, type Source } from '@/lib/site/types';

/**
 * The answer widgets of the site app (P5, P8, P9): big tiles for Yes/No and Pass/Fail, a number box
 * with a decimal keypad and its unit inside, chips, text, a confirm box, and per-string cards. They
 * copy the survey form's look, sized for gloves: tiles 56 px tall, everything else 48 px or more.
 */

export type SetValue = (value: unknown, src?: Source) => void;

const TILES: Record<string, { key: string; label: string }[]> = {
  YN: [
    { key: 'yes', label: 'Yes' },
    { key: 'no', label: 'No' },
  ],
  YNN: [
    { key: 'yes', label: 'Yes' },
    { key: 'no', label: 'No' },
    { key: 'na', label: 'N/A' },
  ],
  PF: [
    { key: 'pass', label: 'Pass' },
    { key: 'fail', label: 'Fail' },
  ],
  PFN: [
    { key: 'pass', label: 'Pass' },
    { key: 'fail', label: 'Fail' },
    { key: 'na', label: 'N/A' },
  ],
  TICK: [
    { key: 'done', label: '✓ Done' },
    { key: 'problem', label: '✗ Problem' },
    { key: 'na', label: 'N/A' },
  ],
};

/** Yes/No, Pass/Fail and the checklist ticks: one tap, selected = ink with a tick, never colour alone. */
export function Tiles({ field, value, onChange, disabled }: { field: Field; value: unknown; onChange: SetValue; disabled?: boolean }) {
  const opts = TILES[field.type] ?? [];
  return (
    <div className={`sa-tiles sa-tiles-${opts.length}`} role="radiogroup" aria-label={field.label}>
      {opts.map((o) => {
        const on = value === o.key;
        return (
          <button key={o.key} type="button" role="radio" aria-checked={on} className={`sa-tile${on ? ' is-on' : ''}`} disabled={disabled} onClick={() => onChange(on ? undefined : o.key)}>
            {on && !o.label.startsWith('✓') && !o.label.startsWith('✗') ? '✓ ' : ''}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** One large box that must be ticked; "I can't confirm this" is the way out (stored as 'cant'). */
export function Confirm({ field, value, onChange, disabled }: { field: Field; value: unknown; onChange: SetValue; disabled?: boolean }) {
  const on = value === true;
  return (
    <div className="sa-confirm-wrap">
      <button type="button" role="checkbox" aria-checked={on} className={`sa-confirm${on ? ' is-on' : ''}`} disabled={disabled} onClick={() => onChange(on ? undefined : true)}>
        <span className="sa-confirm-box" aria-hidden="true">
          {on ? '✓' : ''}
        </span>
        <span>{on ? 'Confirmed' : 'Tap to confirm'}</span>
      </button>
      {field.cant && (
        <button type="button" className={`sa-link sa-cant${value === 'cant' ? ' is-on' : ''}`} disabled={disabled} onClick={() => onChange(value === 'cant' ? undefined : 'cant')}>
          {value === 'cant' ? `✓ ${field.cant}` : field.cant}
        </button>
      )}
    </div>
  );
}

const toNumber = (s: string): number | string | undefined => {
  const t = s.trim().replace(',', '.');
  if (!t) return undefined;
  if (/^>\s*\d+(\.\d+)?$/.test(t)) return `>${t.replace(/^>\s*/, '')}`;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
};
const shown = (v: unknown) => (v === undefined || v === null ? '' : String(v));

/** A number: decimal keypad, the unit inside the box, quick chips underneath, the ">" toggle for meters that show "greater than". */
export function NumberBox({
  field,
  value,
  onChange,
  disabled,
  label,
}: {
  field: Field;
  value: unknown;
  onChange: SetValue;
  disabled?: boolean;
  label?: string;
}) {
  const [text, setText] = useState(shown(value));
  const [focused, setFocused] = useState(false);
  // Follow the answer when it changes elsewhere (a chip, another phone), never while typing.
  const outside = shown(value);
  const display = focused ? text : outside;
  const gt = typeof display === 'string' && display.startsWith('>');
  const commit = (s: string) => {
    setText(s);
    const n = toNumber(s);
    if (s.trim() === '') onChange(undefined);
    else if (n !== undefined) onChange(n);
  };
  const bad = display.trim() !== '' && toNumber(display) === undefined;
  const range = typeof toNumber(display) === 'number' && ((field.min !== undefined && (toNumber(display) as number) < field.min) || (field.max !== undefined && (toNumber(display) as number) > field.max));
  return (
    <div className="sa-numwrap">
      <div className={`sa-num${bad ? ' is-bad' : ''}`}>
        {field.gt && (
          <button type="button" className={`sa-gt${gt ? ' is-on' : ''}`} aria-pressed={gt} aria-label="Greater than" disabled={disabled} onClick={() => commit(gt ? display.slice(1) : `>${display}`)}>
            &gt;
          </button>
        )}
        <input
          type="text"
          inputMode="decimal"
          enterKeyHint="next"
          autoComplete="off"
          aria-label={label ?? field.label}
          value={display}
          disabled={disabled}
          onFocus={() => {
            setText(outside);
            setFocused(true);
          }}
          onBlur={() => setFocused(false)}
          onChange={(e) => commit(e.target.value)}
        />
        {field.unit && <span className="sa-unit">{field.unit}</span>}
      </div>
      {bad && <p className="sa-err">Numbers only, please.</p>}
      {range && <p className="sa-hint-warn">Is that right? It’s outside what we’d expect.</p>}
      {!!field.chips?.length && (
        <div className="sa-chips">
          {field.chips.map((c) => (
            <button key={c} type="button" className={`sa-chip${value === c ? ' is-on' : ''}`} disabled={disabled} onClick={() => commit(String(c))}>
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** One line or several. Kept on the phone as it's typed. */
export function TextBox({ field, value, onChange, disabled }: { field: Field; value: unknown; onChange: SetValue; disabled?: boolean }) {
  const [text, setText] = useState(shown(value));
  const [focused, setFocused] = useState(false);
  const display = focused ? text : shown(value);
  const props = {
    'aria-label': field.label,
    value: display,
    disabled,
    onFocus: () => {
      setText(shown(value));
      setFocused(true);
    },
    onBlur: () => setFocused(false),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setText(e.target.value);
      onChange(e.target.value.trim() ? e.target.value : undefined);
    },
  };
  const box = field.type === 'LONG' ? <textarea className="sa-text sa-long" rows={4} {...props} /> : <input className="sa-text" type="text" autoComplete="off" {...props} />;
  if (!field.picks?.length) return box;
  // Common answers as chips under the box: one tap fills it, and it can still be typed over.
  return (
    <>
      {box}
      <div className="sa-chips">
        {field.picks.map((p) => (
          <button key={p} type="button" className={`sa-chip${value === p ? ' is-on' : ''}`} disabled={disabled} onClick={() => onChange(value === p ? undefined : p)}>
            {p}
          </button>
        ))}
      </div>
    </>
  );
}

/** One choice (SEL) or several (MULTI) from chips. */
export function Chips({ field, value, onChange, disabled }: { field: Field; value: unknown; onChange: SetValue; disabled?: boolean }) {
  const multi = field.type === 'MULTI';
  const list = Array.isArray(value) ? (value as string[]) : [];
  return (
    <div className="sa-chips sa-chips-big" role={multi ? 'group' : 'radiogroup'} aria-label={field.label}>
      {(field.options ?? []).map((o) => {
        const on = multi ? list.includes(o.key) : value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            role={multi ? 'checkbox' : 'radio'}
            aria-checked={on}
            className={`sa-chip${on ? ' is-on' : ''}`}
            disabled={disabled}
            onClick={() => (multi ? onChange(on ? list.filter((k) => k !== o.key) : [...list, o.key]) : onChange(on ? undefined : o.key))}
          >
            {on ? '✓ ' : ''}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** One number per PV string, as cards; strings 2 onwards can be "Same as string 1". */
export function PerString({ field, ctx, value, onChange, disabled }: { field: Field; ctx: FormCtx; value: unknown; onChange: SetValue; disabled?: boolean }) {
  const n = stringsOf(field, ctx);
  const list = Array.from({ length: n }, (_, i) => (Array.isArray(value) ? (value as unknown[])[i] : undefined) ?? null);
  const set = (i: number, v: unknown) => {
    const next = [...list];
    next[i] = v ?? null;
    onChange(next.every((x) => x === null) ? undefined : next);
  };
  return (
    <div className="sa-strings">
      {list.map((v, i) => (
        <div key={i} className="sa-string">
          <div className="sa-string-head">
            <b>String {i + 1}</b>
            {i > 0 && list[0] !== null && (
              <button type="button" className={`sa-small${v === list[0] ? ' is-on' : ''}`} disabled={disabled} onClick={() => set(i, list[0])}>
                {v === list[0] ? '✓ Same as string 1' : 'Same as string 1'}
              </button>
            )}
          </div>
          <NumberBox field={{ ...field, chips: undefined }} label={`${field.label}: string ${i + 1}`} value={v ?? undefined} onChange={(x) => set(i, x)} disabled={disabled} />
        </div>
      ))}
    </div>
  );
}

/** A value offered from elsewhere ("From the design: 2"): one tap to take it. Never filled in by itself. */
export function SuggestChip({ s, onTake, disabled }: { s: Suggestion; onTake: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="sa-suggest" disabled={disabled} onClick={onTake}>
      <span className="sa-suggest-src">{SOURCE_LABEL[s.src]}</span>
      <span className="sa-suggest-val">{s.text}</span>
      <span className="sa-suggest-tick" aria-hidden="true">
        ✓
      </span>
      <span className="sa-sr">Use this</span>
    </button>
  );
}

/** Where an answer came from, when it wasn't typed ("From the design"). */
export function SourceTag({ answer }: { answer: Answer | undefined }) {
  if (!answer?.src || answer.src === 'typed') return null;
  return <span className="sa-src">{SOURCE_LABEL[answer.src]}</span>;
}
