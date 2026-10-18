'use client';

import Link from 'next/link';
import { Fragment, useState, type ReactNode } from 'react';
import type { SetupTodo } from '@/lib/setup-checks';
import { CopyButton } from './CopyButton';
import './from-claude.css';

/**
 * Setup jobs Claude has left for an admin, each with step-by-step instructions. Most tick
 * themselves off once done (the app checks the database / Vercel keys on each visit); one-offs
 * have a Done button.
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
              ? `${main.length} setup job${main.length === 1 ? '' : 's'} left. Tap one for step-by-step instructions. Each ticks itself off once it’s done.`
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
            {open === t.id && <Steps t={t} onDone={() => done(t.id)} />}
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

function Steps({ t, onDone }: { t: SetupTodo; onDone: () => void }) {
  const external = t.href && !t.href.startsWith('/');
  return (
    <div className="fc-body">
      <p className="fc-detail">{t.detail}</p>

      <div className="fc-actions">
        {t.sql && (
          <>
            <CopyButton
              className="fc-go"
              label="Copy SQL"
              load={() =>
                fetch(`/api/setup/file?name=${encodeURIComponent(t.sql!)}`).then((r) => {
                  if (!r.ok) throw new Error('not loaded');
                  return r.text();
                })
              }
            />
            <Link href={`/admin/setup/sql/${t.sql}`} className="fc-ghost">
              View SQL
            </Link>
          </>
        )}
        {t.href &&
          (external ? (
            <a href={t.href} target="_blank" rel="noopener noreferrer" className={t.sql ? 'fc-ghost' : 'fc-go'}>
              {t.hrefLabel || 'Open'} ↗
            </a>
          ) : (
            <Link href={t.href} className="fc-go">
              {t.hrefLabel || 'Open'}
            </Link>
          ))}
        {t.guide && (
          <Link href={`/admin/setup/guide/${t.guide}`} className="fc-ghost">
            Open the guide
          </Link>
        )}
      </div>

      {t.vapid && <VapidKeys />}

      <ol className="fc-steps">
        {t.steps.map((s, i) => (
          <li key={i}>{rich(s)}</li>
        ))}
      </ol>

      {t.copies && t.copies.length > 0 && (
        <ul className="fc-copies">
          {t.copies.map((c, i) => (
            <li key={i}>
              <span className="fc-copy-label">{c.label}</span>
              <code>{c.value}</code>
              <CopyButton value={c.value} className="fc-copy" />
            </li>
          ))}
        </ul>
      )}

      {t.manual && (
        <button type="button" className="fc-done" onClick={onDone}>
          ✓ I’ve done this
        </button>
      )}
    </div>
  );
}

/** "Generate keys" for phone notifications: three name/value pairs to paste into Vercel. */
function VapidKeys() {
  const [keys, setKeys] = useState<{ name: string; value: string }[] | null>(null);
  const [error, setError] = useState('');
  async function generate() {
    setError('');
    const r = await fetch('/api/setup/vapid', { method: 'POST' }).catch(() => null);
    const d = await r?.json().catch(() => ({}));
    if (r?.ok && d.keys) setKeys(d.keys);
    else setError(d?.error || 'Couldn’t generate them — try again.');
  }
  if (!keys)
    return (
      <div className="fc-vapid">
        <button type="button" className="fc-go" onClick={generate}>
          Generate keys
        </button>
        {error && <p className="fc-err">{error}</p>}
      </div>
    );
  return (
    <div className="fc-vapid">
      <p className="fc-warn">Copy all three into Vercel now. They aren’t saved here, and the middle one is secret.</p>
      <ul className="fc-copies">
        {keys.map((k) => (
          <li key={k.name}>
            <span className="fc-copy-label">Key</span>
            <code>{k.name}</code>
            <CopyButton value={k.name} className="fc-copy" label="Copy name" />
            <span className="fc-copy-label">Value</span>
            <code className="fc-secret">{k.value}</code>
            <CopyButton value={k.value} className="fc-copy" label="Copy value" />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** **bold**, `code` and [text](https://link) inside a step. */
function rich(s: string): ReactNode {
  const parts = s.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <b key={i}>{p.slice(2, -2)}</b>;
    if (p.startsWith('`') && p.endsWith('`')) return <code key={i}>{p.slice(1, -1)}</code>;
    const link = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link)
      return (
        <a key={i} href={link[2]} target="_blank" rel="noopener noreferrer">
          {link[1]}
        </a>
      );
    return <Fragment key={i}>{p}</Fragment>;
  });
}
