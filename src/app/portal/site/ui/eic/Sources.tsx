'use client';

import { useState } from 'react';
import { updateAnswer } from '@/lib/site/eic-client';
import { sourceSuggestions } from '@/lib/site/forms/electrician/eic';
import type { CustomProps } from '../custom';
import { SuggestChip } from '../widgets';

const listOf = (v: unknown): string[] => (Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === 'string' && !!x.trim()) : []);
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The other sources of supply (the schedule attached to the EIC): offered from the job, one tap each; anything else typed. */
export function EicSources({ f, rec, jf, locked }: CustomProps) {
  const job = rec.id;
  const list = listOf(jf.ctx.values[f.key]);
  const offers = sourceSuggestions(jf.ctx).filter((s) => !list.some((x) => same(x, s)));
  const [text, setText] = useState('');
  const set = (next: string[]) => void updateAnswer(job, f.key, () => (next.length ? next : undefined));
  return (
    <div className="sa-eic-list">
      {list.length > 0 && (
        <ol className="sa-serials">
          {list.map((s, i) => (
            <li key={`${s}-${i}`} className="sa-serial">
              <span>
                {i + 1}. {s}
              </span>
              {!locked && (
                <button type="button" className="sa-x" aria-label={`Remove ${s}`} onClick={() => set(list.filter((_, j) => j !== i))}>
                  ×
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
      {!locked &&
        offers.map((s) => <SuggestChip key={s} s={{ v: s, src: 'job', text: s }} onTake={() => set([...list, s])} />)}
      {!locked && (
        <div className="sa-typeit">
          <input className="sa-text" type="text" aria-label="Another source" placeholder="Another source (e.g. a generator)" value={text} onChange={(e) => setText(e.target.value)} />
          <button
            type="button"
            className="sa-small"
            disabled={!text.trim()}
            onClick={() => {
              set([...list, text.trim()]);
              setText('');
            }}
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}
