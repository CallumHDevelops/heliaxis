'use client';

import Link from 'next/link';
import { Fragment, useRef, useState, type ReactNode } from 'react';
import type { SetupPerson, SetupTodo } from '@/lib/setup-checks';
import { CopyButton } from './CopyButton';
import './from-claude.css';

export type FromClaudeProps = {
  /** What this person should do. */
  todos: SetupTodo[];
  /** Admins only: the to-dos passed only to other people, and everyone who can be picked. */
  admin?: { others: SetupTodo[]; people: SetupPerson[]; meId: string };
};

/**
 * Setup jobs Claude has left, each with step-by-step instructions. Admins see them all unless one
 * has been passed to particular people ("Who sees this"); members see only what's passed to them.
 * Most tick themselves off once done (the app checks the database / Vercel keys on each visit);
 * one-offs have a Done button.
 */
export function FromClaude({ todos, admin }: FromClaudeProps) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [showOptional, setShowOptional] = useState(false);
  const [showOthers, setShowOthers] = useState(false);
  // Ticks made on this visit (the server's view comes in as t.ticked).
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  // "Who sees this" picks made on this visit (the server's view comes in as t.assignees).
  const [picks, setPicks] = useState<Record<string, string[]>>({});
  const [saveFailed, setSaveFailed] = useState<string | null>(null);
  // Saves go one at a time; `saved` is what the server has, `latest` which tap was last per to-do.
  const saving = useRef<Promise<unknown>>(Promise.resolve());
  const saved = useRef<Record<string, string[]>>({});
  const latest = useRef<Record<string, number>>({});
  const isTicked = (t: SetupTodo) => ticks[t.id] ?? !!t.ticked;
  const pickedFor = (t: SetupTodo) => picks[t.id] ?? t.assignees ?? [];
  const left = todos.filter((t) => !hidden.has(t.id));
  const others = (admin?.others ?? []).filter((t) => !hidden.has(t.id));
  if (!left.length && !others.length) return null;
  const main = left.filter((t) => !t.optional);
  const optional = left.filter((t) => t.optional);
  const shown = showOptional ? left : main;
  const remaining = main.filter((t) => !isTicked(t)).length;

  async function tick(t: SetupTodo) {
    const on = !isTicked(t);
    // One-offs the app can't check go as soon as they're ticked; the rest wait to be confirmed.
    if (on && t.manual) setHidden((s) => new Set(s).add(t.id));
    else setTicks((m) => ({ ...m, [t.id]: on }));
    await fetch('/api/setup', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(on ? { done: t.id } : { undone: t.id }),
    }).catch(() => null);
  }

  /** Saved straight away, in order. If the last tap fails, the chips go back to what's saved. */
  function choose(t: SetupTodo, ids: string[]) {
    setPicks((m) => ({ ...m, [t.id]: ids }));
    setSaveFailed(null);
    const n = (latest.current[t.id] = (latest.current[t.id] ?? 0) + 1);
    saving.current = saving.current
      .then(async () => {
        const r = await fetch('/api/setup', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assign: { id: t.id, userIds: ids } }),
        }).catch(() => null);
        const d = r?.ok ? await r.json().catch(() => null) : null;
        if (Array.isArray(d?.assignees)) saved.current[t.id] = d.assignees;
        else if (n === latest.current[t.id]) {
          setPicks((m) => ({ ...m, [t.id]: saved.current[t.id] ?? t.assignees ?? [] }));
          setSaveFailed(t.id);
        }
      })
      .catch(() => null);
  }

  /** "Shared with Fabiana and Esther" (or "Only you") on to-dos passed to particular people. */
  function sharedLabel(t: SetupTodo) {
    const ids = pickedFor(t);
    if (!admin || !ids.length) return null;
    const names = ids
      .filter((id) => id !== admin.meId)
      .map((id) => (admin.people.find((p) => p.id === id)?.name ?? 'someone').split(' ')[0]);
    if (!names.length) return 'Only you';
    return `Shared with ${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]}`;
  }

  const row = (t: SetupTodo, inOthers = false) => {
    const shared = sharedLabel(t);
    return (
      <li key={t.id} className={`${open === t.id ? 'is-open' : ''}${isTicked(t) ? ' is-ticked' : ''}`}>
        <div className="fc-rowwrap">
          <button
            type="button"
            className="fc-tick"
            role="checkbox"
            aria-checked={isTicked(t)}
            aria-label={`${isTicked(t) ? 'Untick' : 'Tick'}: ${t.title}`}
            onClick={() => tick(t)}
          >
            {isTicked(t) ? '✓' : ''}
          </button>
          <button type="button" className="fc-row" onClick={() => setOpen(open === t.id ? null : t.id)} aria-expanded={open === t.id}>
            <span className="fc-title">
              {t.title}
              {isTicked(t) && <small className="fc-waiting">Ticked. Waiting to confirm</small>}
              {shared && <small className="fc-shared">{shared}</small>}
            </span>
            {t.kind === 'question' && <span className="fc-tag is-question">Question for you</span>}
            {t.kind === 'tip' && <span className="fc-tag">Recommended</span>}
            {t.optional && t.kind !== 'tip' && <span className="fc-tag">Optional</span>}
            <span className="fc-chev" aria-hidden="true">›</span>
          </button>
        </div>
        {open === t.id && (
          <Steps t={t} ticked={isTicked(t)} onTick={() => tick(t)} isAdmin={!!admin}>
            {admin && (
              <WhoSees
                people={admin.people}
                meId={admin.meId}
                picked={pickedFor(t)}
                inOthers={inOthers}
                failed={saveFailed === t.id}
                onChange={(ids) => choose(t, ids)}
              />
            )}
          </Steps>
        )}
      </li>
    );
  };

  return (
    <section className="fc" aria-label="Setup to-dos from Claude">
      <header className="fc-head">
        <span className="fc-badge" aria-hidden="true">✳</span>
        <div>
          <h2>From Claude</h2>
          <p>
            {remaining
              ? `${remaining} setup job${remaining === 1 ? '' : 's'} left. Tap one for step-by-step instructions, and tick the circle when you’ve done it.`
              : main.length
                ? 'All ticked. Each disappears once the app can see it’s working.'
                : optional.length
                  ? 'The essentials are done. Optional extras below.'
                  : 'Nothing left for you. The rest are with other people.'}
          </p>
          {admin && (
            <Link href="/admin/setup/env" className="fc-envlink">
              Check Vercel keys →
            </Link>
          )}
        </div>
      </header>
      {shown.length > 0 && <ol className="fc-list">{shown.map((t) => row(t))}</ol>}
      {optional.length > 0 && (
        <button type="button" className="fc-more" onClick={() => setShowOptional((v) => !v)}>
          {showOptional ? 'Hide optional' : `+ ${optional.length} optional`}
        </button>
      )}
      {others.length > 0 && (
        <div className="fc-others">
          <button type="button" className="fc-others-toggle" onClick={() => setShowOthers((v) => !v)} aria-expanded={showOthers}>
            <span>Shared with others ({others.length})</span>
            <span className="fc-chev" aria-hidden="true">›</span>
          </button>
          {showOthers && (
            <>
              <p className="fc-others-note">Only the people picked see these. You can still tick them or change who sees them.</p>
              <ol className="fc-list">{others.map((t) => row(t, true))}</ol>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function Steps({
  t,
  ticked,
  onTick,
  isAdmin,
  children,
}: {
  t: SetupTodo;
  ticked: boolean;
  onTick: () => void;
  isAdmin: boolean;
  /** Shown at the bottom (the admin's "Who sees this"). */
  children?: ReactNode;
}) {
  const external = t.href && !t.href.startsWith('/');
  return (
    <div className="fc-body">
      {ticked && (
        <p className="fc-warn">
          You’ve ticked this. It disappears once the app can see it working. Keys added in Vercel only show up after the redeploy finishes. If it’s
          still here after that, check the names match exactly.
        </p>
      )}
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

      {t.vapid &&
        (isAdmin ? (
          <VapidKeys />
        ) : (
          <div className="fc-vapid">
            <p className="fc-warn">
              Only an admin can generate these keys. Ask one to tap <b>Generate keys</b> on this to-do and send you the three values.
            </p>
          </div>
        ))}

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

      <button type="button" className="fc-done" onClick={onTick}>
        {ticked ? 'Untick' : '✓ I’ve done this'}
      </button>

      {children}
    </div>
  );
}

/** Admins: who this to-do shows for. Nobody picked = every admin (the default). */
function WhoSees({
  people,
  meId,
  picked,
  inOthers,
  failed,
  onChange,
}: {
  people: SetupPerson[];
  meId: string;
  picked: string[];
  /** It's in "Shared with others" on this visit. */
  inOthers: boolean;
  failed: boolean;
  onChange: (ids: string[]) => void;
}) {
  const toggle = (id: string) => onChange(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);
  const forMe = !picked.length || picked.includes(meId);
  // It stays where it is until the next visit, so say where it's going.
  const move = forMe && inOthers ? ' It’ll be back in your list next time.' : !forMe && !inOthers ? ' Next time it’ll be under Shared with others.' : '';
  return (
    <div className="fc-whobox" role="group" aria-label="Who sees this">
      <p className="fc-whobox-h">Who sees this</p>
      <div className="fc-chips">
        <button type="button" className="fc-chip" aria-pressed={!picked.length} onClick={() => picked.length > 0 && onChange([])}>
          Admins (default)
        </button>
        {people.map((p) => (
          <button key={p.id} type="button" className="fc-chip" aria-pressed={picked.includes(p.id)} onClick={() => toggle(p.id)}>
            {p.id === meId ? `${p.name} (you)` : p.name}
          </button>
        ))}
      </div>
      <p className="fc-whonote">
        {picked.length ? 'Only the people picked see it, and they can tick it off.' : 'Every admin sees it. Pick people to show it only to them.'}
        {move}
      </p>
      {failed && <p className="fc-err">Couldn’t save that. Check your connection and try again.</p>}
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
