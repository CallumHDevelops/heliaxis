'use client';

import type { Prop, PropSuggestion } from '@/lib/site/forms/electrician/eic-model';
import type { Field, FieldType } from '@/lib/site/forms/types';
import { Chips, Confirm, NumberBox, TextBox, Tiles, type SetValue } from '../widgets';

const TYPE: Record<Prop['type'], FieldType> = { NUM: 'NUM', TEXT: 'TEXT', SEL: 'SEL', MULTI: 'MULTI', YN: 'YN', PF: 'PF', PFN: 'PFN', CONFIRM: 'CONFIRM' };

/** A board or circuit column as the site app's own widgets see it. */
export const asField = (p: Prop, key: string): Field => ({
  key,
  type: TYPE[p.type],
  label: p.label,
  level: p.level,
  unit: p.unit,
  dp: p.dp,
  chips: p.chips,
  picks: p.picks,
  options: p.options,
  gt: p.gt,
  hint: p.hint,
});

/**
 * One question on a board or circuit card: the same tiles, number boxes (decimal keypad, unit inside),
 * chips and confirm boxes as every other screen, with the model form's column number beside it so it
 * reads like the paper schedule, a limit beside a reading where there is one (never a reading), and a
 * warning when a reading is outside it.
 */
export function PropRow({
  p,
  id,
  value,
  onChange,
  disabled,
  note,
  warn,
  suggest,
  onTake,
  carried,
}: {
  p: Prop;
  id: string;
  value: unknown;
  onChange: SetValue;
  disabled: boolean;
  note?: string | null;
  warn?: string | null;
  /** A worked-out figure offered above the box (never filled in): one tap takes it. */
  suggest?: PropSuggestion | null;
  onTake?: () => void;
  /** Carried across from earlier on this job (where from): the value shows in the box, and typing over it changes it here. */
  carried?: string | null;
}) {
  const f = asField(p, id);
  let widget: React.ReactNode;
  switch (p.type) {
    case 'NUM':
      widget = <NumberBox field={f} value={value} onChange={onChange} disabled={disabled} />;
      break;
    case 'TEXT':
      widget = <TextBox field={f} value={value} onChange={onChange} disabled={disabled} />;
      break;
    case 'SEL':
    case 'MULTI':
      widget = <Chips field={f} value={value} onChange={onChange} disabled={disabled} />;
      break;
    case 'CONFIRM':
      widget = <Confirm field={f} value={value} onChange={onChange} disabled={disabled} />;
      break;
    default:
      widget = <Tiles field={f} value={value} onChange={onChange} disabled={disabled} />;
  }
  return (
    <div className="sa-q" data-key={id}>
      <div className="sa-q-head">
        <h3 className="sa-q-label">
          {p.label}
          {p.level === 'optional' && <span className="sa-muted"> (if you can)</span>}
        </h3>
        {p.col && <span className="sa-col">col {p.col}</span>}
      </div>
      {p.hint && <p className="sa-q-hint">{p.hint}</p>}
      {note && <p className="sa-q-note">{note}</p>}
      {carried && <p className="sa-autotag">From earlier on this job ({carried}) ✓</p>}
      {suggest && onTake && !disabled && (
        <button type="button" className="sa-suggest" onClick={onTake}>
          <span className="sa-suggest-src">Worked out</span>
          <span className="sa-suggest-val">{suggest.text}</span>
          <span className="sa-suggest-tick" aria-hidden="true">
            ✓
          </span>
          <span className="sa-sr">Use this</span>
        </button>
      )}
      {widget}
      {warn && <p className="sa-fix">{warn}</p>}
    </div>
  );
}
