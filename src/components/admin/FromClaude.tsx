'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { SetupTodo } from '@/lib/setup-checks';
import './from-claude.css';

/**
 * Setup jobs Claude has left for an admin. Most tick themselves off once done (the app checks
 * the database / Vercel keys on each visit); one-offs have a Done button.
 */
export function FromClaude({ todos }: { todos: SetupTodo[] }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [showOptional, setShowOptional] = useState(false);
  const left = todos.filter((t) => !hidden.has(t.id));
  if (!left.length) return null;
  const main = left.filter((t) => !t.optional);
  const optional = left.filter((t) => t.optional);
  const shown = showOptional ? left : main;

  async function done(id: string) {
    setHidden((s) => new Set(s).add(id));
    await fetch('/api/setup', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: id }),
    }).catch(() => null);
  }

  return (
    <section className="fc" aria-label="Setup to-dos from Claude">
      <header className="fc-head">
        <span className="fc-badge" aria-hidden="true">✳</span>
        <div>
          <h2>From Claude</h2>
          <p>
            {main.length
              ? `${main.length} setup job${main.length === 1 ? '' : 's'} left. Each one ticks itself off once it’s done.`
              : 'The essentials are done. Optional extras below.'}
          </p>
        </div>
      </header>
      <ol className="fc-list">
        {shown.map((t) => (
          <li key={t.id} className={open === t.id ? 'is-open' : ''}>
            <button type="button" className="fc-row" onClick={() => setOpen(open === t.id ? null : t.id)} aria-expanded={open === t.id}>
              <span className="fc-dot" aria-hidden="true" />
              <span className="fc-title">{t.title}</span>
              {t.optional && <span className="fc-tag">Optional</span>}
              <span className="fc-chev" aria-hidden="true">›</span>
            </button>
            {open === t.id && (
              <div className="fc-body">
                <p>{t.detail}</p>
                <div className="fc-actions">
                  {t.href &&
                    (t.href.startsWith('/') ? (
                      <Link href={t.href} className="fc-go">Open</Link>
                    ) : (
                      <a href={t.href} target="_blank" rel="noopener noreferrer" className="fc-go">Open ↗</a>
                    ))}
                  {t.manual && (
                    <button type="button" className="fc-done" onClick={() => done(t.id)}>Mark done</button>
                  )}
                </div>
              </div>
            )}
          </li>
        ))}
      </ol>
      {optional.length > 0 && (
        <button type="button" className="fc-more" onClick={() => setShowOptional((v) => !v)}>
          {showOptional ? 'Hide optional' : `+ ${optional.length} optional`}
        </button>
      )}
    </section>
  );
}
