'use client';

import { Button } from '@/components/ui';

/** Editable list of strings — used for controls, PPE, legislation and permits. */
export function ListEditor({
  items,
  onChange,
  placeholder,
  addLabel = 'Add',
  rows = 2,
}: {
  items: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  addLabel?: string;
  rows?: number;
}) {
  function update(index: number, value: string) {
    onChange(items.map((it, i) => (i === index ? value : it)));
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-1.5">
          <span className="mono mt-2 w-5 shrink-0 text-right text-[0.68rem] text-muted">
            {i + 1}
          </span>
          <textarea
            className="field text-[0.83rem]"
            rows={rows}
            value={item}
            placeholder={placeholder}
            onChange={(e) => update(i, e.target.value)}
          />
          <div className="flex shrink-0 flex-col gap-0.5">
            <button
              type="button"
              aria-label="Move up"
              className="rounded-[2px] px-1.5 text-[0.7rem] text-muted hover:bg-paper-2 hover:text-ink disabled:opacity-30"
              disabled={i === 0}
              onClick={() => move(i, -1)}
            >
              ▲
            </button>
            <button
              type="button"
              aria-label="Move down"
              className="rounded-[2px] px-1.5 text-[0.7rem] text-muted hover:bg-paper-2 hover:text-ink disabled:opacity-30"
              disabled={i === items.length - 1}
              onClick={() => move(i, 1)}
            >
              ▼
            </button>
            <button
              type="button"
              aria-label="Remove"
              className="rounded-[2px] px-1.5 text-[0.72rem] text-muted hover:bg-paper-2 hover:text-danger"
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}
            >
              ✕
            </button>
          </div>
        </div>
      ))}
      <Button type="button" variant="ghost" size="sm" onClick={() => onChange([...items, ''])}>
        + {addLabel}
      </Button>
    </div>
  );
}

/** Multi-select rendered as toggle chips, backed by a fixed option list. */
export function ChipSelect({
  options,
  selected,
  onChange,
}: {
  options: readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const on = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() =>
              onChange(on ? selected.filter((s) => s !== opt) : [...selected, opt])
            }
            className={`rounded-[2px] border px-2.5 py-1 text-left text-[0.78rem] transition-colors ${
              on
                ? 'border-amber-2 bg-solar/20 font-semibold text-ink'
                : 'border-[color:var(--line)] bg-card text-muted hover:border-[color:var(--line-strong)] hover:text-ink'
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
