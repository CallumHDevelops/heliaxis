'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { GeoCheck, GeoOverview, GeoSuggestion } from '@/lib/geo/run';
import { engineLabel, pct } from '@/lib/geo/shared';

type Faq = { q: string; a: string };

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

async function post(body: Record<string, unknown>) {
  const res = await fetch('/api/geo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

export function GeoView({ initial, blogWriter }: { initial: GeoOverview; blogWriter: boolean }) {
  const [o, setO] = useState(initial);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    const res = await fetch('/api/geo', { cache: 'no-store' });
    if (res.ok) setO(await res.json());
  }, []);

  const act = async (key: string, body: Record<string, unknown>) => {
    setBusy(key);
    setError('');
    try {
      await post(body);
      await reload();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      return false;
    } finally {
      setBusy('');
    }
  };

  const latest = o.runs[0];
  const running = latest && (latest.status === 'checking' || latest.status === 'analysing');

  // While a check is running and this page is open, keep it moving one step at a time.
  useEffect(() => {
    if (!running) return;
    let stop = false;
    (async () => {
      while (!stop) {
        if (document.visibilityState === 'visible') await post({ action: 'step' }).catch(() => null);
        if (stop) break;
        const res = await fetch('/api/geo', { cache: 'no-store' }).catch(() => null);
        const next: GeoOverview | null = res?.ok ? await res.json() : null;
        if (next && !stop) setO(next);
        const r = next?.runs[0];
        if (!r || (r.status !== 'checking' && r.status !== 'analysing')) break;
        await new Promise((ok) => setTimeout(ok, 4000));
      }
    })();
    return () => {
      stop = true;
    };
  }, [running]);

  if (!o.ready) {
    return (
      <div className="geo">
        <Head />
        <section className="geo__card">
          <h2>One step to switch this on</h2>
          <p>
            Run <code>supabase/geo.sql</code> in Supabase. It’s on the “From Claude” list on the <Link href="/admin">dashboard</Link>, with a Copy SQL button.
          </p>
        </section>
      </div>
    );
  }

  const shownRun = o.runs.find((r) => r.id === o.checks[0]?.run_id) ?? latest;
  const done = shownRun?.tally;
  const prev = o.runs.find((r) => r.status === 'done' && r.id !== shownRun?.id)?.tally;
  const pending = o.suggestions.filter((s) => s.status === 'pending' || s.status === 'failed');
  const decided = o.suggestions.filter((s) => s.status === 'applied' || s.status === 'dismissed');
  const left = o.checks.filter((c) => c.status === 'pending' || c.status === 'running').length;

  return (
    <div className="geo">
      <Head>
        <button
          type="button"
          className="geo__btn geo__btn--primary"
          disabled={!!running || !!busy || !o.engines.length}
          onClick={() => act('run', { action: 'run' })}
        >
          {busy === 'run' ? 'Starting…' : running ? 'Checking…' : 'Run a check now'}
        </button>
      </Head>

      {error && (
        <p className="geo__error" role="alert">
          {error}
        </p>
      )}

      {!o.engines.length && (
        <section className="geo__card">
          <h2>No AI engine set up</h2>
          <p>
            Add <code>ANTHROPIC_API_KEY</code> in Vercel to ask Claude. Add <code>OPENROUTER_API_KEY</code> too to ask Perplexity and ChatGPT search
            (change which with <code>GEO_OPENROUTER_MODELS</code>).
          </p>
        </section>
      )}

      {running && (
        <section className="geo__card geo__progress" aria-live="polite">
          <div className="geo__bar">
            <span style={{ width: `${o.checks.length ? pct(o.checks.length - left, o.checks.length) : 0}%` }} />
          </div>
          <p>
            {latest.status === 'analysing' || !left
              ? 'All answers in. Reading them and writing suggestions… (a minute or two)'
              : `Asking the AI assistants: ${o.checks.length - left} of ${o.checks.length} answers in. Keep this page open to finish sooner.`}
          </p>
        </section>
      )}

      {latest?.status === 'failed' && (
        <section className="geo__card geo__card--warn">
          <p>
            The last check (started {when(latest.started_at)}) didn’t finish: {latest.error || 'unknown problem'}
          </p>
          <button type="button" className="geo__btn" disabled={!!busy} onClick={() => act('retry', { action: 'retry', id: latest.id })}>
            {busy === 'retry' ? 'Trying…' : 'Try the analysis again'}
          </button>
        </section>
      )}

      {done && done.all.total > 0 && (
        <section className="geo__scores" aria-label="Scores">
          <Score label="Named in" value={pct(done.all.mentioned, done.all.total)} was={prev?.all.total ? pct(prev.all.mentioned, prev.all.total) : null} />
          <Score label="Linked to heliaxis.co.uk in" value={pct(done.all.cited, done.all.total)} was={prev?.all.total ? pct(prev.all.cited, prev.all.total) : null} />
          <div className="geo__engines">
            {Object.entries(done.byEngine).map(([engine, t]) => (
              <div key={engine} className="geo__engine">
                <span>{engineLabel(engine)}</span>
                <b>
                  {t.mentioned}/{t.total} named · {t.cited}/{t.total} linked
                </b>
              </div>
            ))}
          </div>
        </section>
      )}

      {shownRun?.summary && (
        <section className="geo__card">
          <h2>What the bot found</h2>
          <p className="geo__summary">{shownRun.summary}</p>
          <p className="geo__meta">From the check on {when(shownRun.finished_at || shownRun.started_at)}.</p>
        </section>
      )}

      <section className="geo__section">
        <h2>Suggested website changes {pending.length > 0 && <span className="geo__count">{pending.length}</span>}</h2>
        {!pending.length && <p className="geo__meta">Nothing waiting. New suggestions arrive after each check.</p>}
        {pending.map((s) => (
          <Suggestion key={s.id} s={s} busy={busy} blogWriter={blogWriter} act={act} />
        ))}
      </section>

      {o.checks.length > 0 && <Answers checks={o.checks} />}

      <Prompts o={o} busy={busy} act={act} />

      <section className="geo__section">
        <h2>Settings</h2>
        <div className="geo__card geo__settings">
          <label>
            Check automatically{' '}
            <select
              value={o.settings.everyDays}
              disabled={!!busy}
              onChange={(e) => act('settings', { action: 'settings', settings: { everyDays: Number(e.target.value) } })}
            >
              <option value={0}>Never (only Run a check now)</option>
              <option value={1}>Every day</option>
              <option value={7}>Every week</option>
              <option value={14}>Every two weeks</option>
              <option value={30}>Every month</option>
            </select>
          </label>
          <label className="geo__check">
            <input
              type="checkbox"
              checked={o.settings.autoMeta}
              disabled={!!busy}
              onChange={(e) => act('settings', { action: 'settings', settings: { autoMeta: e.target.checked } })}
            />
            Put page title and description suggestions live without asking
          </label>
          <p className="geo__meta">
            FAQ answers and new articles always wait for you: they go into the CMS draft for a person to check and publish. Each check costs roughly
            10–20p per question per AI engine.
          </p>
        </div>
      </section>

      {decided.length > 0 && (
        <section className="geo__section">
          <h2>Done</h2>
          <ul className="geo__history">
            {decided.map((s) => (
              <li key={s.id}>
                <span className={`geo__pill geo__pill--${s.status}`}>{s.status === 'applied' ? 'Applied' : 'Dismissed'}</span> {s.title}
                {s.page_slug && <span className="geo__meta"> · {s.page_slug}</span>}
                <span className="geo__meta">
                  {' '}
                  · {s.decided_by} · {when(s.decided_at)}
                </span>
                {s.status === 'applied' && s.result && <div className="geo__meta">{s.result}</div>}
                {s.status === 'applied' && s.link && (
                  <a className="geo__link" href={s.link}>
                    Open
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {o.runs.filter((r) => r.status === 'done').length > 1 && (
        <section className="geo__section">
          <h2>Past checks</h2>
          <ul className="geo__history">
            {o.runs
              .filter((r) => r.status === 'done')
              .map((r) => (
                <li key={r.id}>
                  {when(r.started_at)} · named in <b>{pct(r.tally.all.mentioned, r.tally.all.total)}%</b> · linked in{' '}
                  <b>{pct(r.tally.all.cited, r.tally.all.total)}%</b> of {r.tally.all.total} answers
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Head({ children }: { children?: React.ReactNode }) {
  return (
    <header className="geo__head">
      <div>
        <h1>AI search visibility</h1>
        <p className="geo__lede">
          The GEO bot asks AI assistants the questions your customers ask, checks whether they name Heliaxis and link to the website, and
          suggests changes to the site so they do.
        </p>
      </div>
      {children}
    </header>
  );
}

function Score({ label, value, was }: { label: string; value: number; was: number | null }) {
  const diff = was == null ? null : value - was;
  return (
    <div className="geo__score">
      <span className="geo__meta">{label}</span>
      <b>{value}%</b>
      <span className="geo__meta">
        of answers
        {diff != null && diff !== 0 && (
          <span className={diff > 0 ? 'geo__up' : 'geo__down'}>
            {' '}
            {diff > 0 ? '▲' : '▼'} {Math.abs(diff)} since last time
          </span>
        )}
      </span>
    </div>
  );
}

const KIND: Record<GeoSuggestion['kind'], string> = { meta: 'Search title', faq: 'FAQ answers', article: 'New article' };

function Suggestion({
  s,
  busy,
  blogWriter,
  act,
}: {
  s: GeoSuggestion;
  busy: string;
  blogWriter: boolean;
  act: (key: string, body: Record<string, unknown>) => void;
}) {
  const p = s.payload as { title?: string; description?: string; was?: { title?: string; description?: string }; faqs?: Faq[]; brief?: string };
  const noWriter = s.kind === 'article' && !blogWriter;
  return (
    <article className="geo__card geo__sugg">
      <div className="geo__sugg-head">
        <span className="geo__pill">{KIND[s.kind]}</span>
        {s.page_slug && (
          <a className="geo__link" href={s.page_slug} target="_blank" rel="noopener noreferrer">
            {s.page_slug}
          </a>
        )}
      </div>
      <h3>{s.title}</h3>
      <p className="geo__reason">{s.reason}</p>

      {s.kind === 'meta' && (
        <dl className="geo__diff">
          {p.title && (
            <>
              <dt>Title</dt>
              <dd>
                {p.was?.title && <del>{p.was.title}</del>}
                <ins>{p.title}</ins>
              </dd>
            </>
          )}
          {p.description && (
            <>
              <dt>Description</dt>
              <dd>
                {p.was?.description && <del>{p.was.description}</del>}
                <ins>{p.description}</ins>
              </dd>
            </>
          )}
        </dl>
      )}
      {s.kind === 'faq' && (
        <dl className="geo__faqs">
          {(p.faqs ?? []).map((f, i) => (
            <div key={i}>
              <dt>{f.q}</dt>
              <dd>{f.a}</dd>
            </div>
          ))}
        </dl>
      )}
      {s.kind === 'article' && <p className="geo__brief">{p.brief}</p>}

      {s.status === 'failed' && <p className="geo__error">Couldn’t apply it: {s.result}</p>}
      {noWriter && <p className="geo__meta">The blog writer needs OPENROUTER_API_KEY in Vercel.</p>}

      <div className="geo__actions">
        <button
          type="button"
          className="geo__btn geo__btn--primary"
          disabled={!!busy || noWriter}
          onClick={() => act(`apply-${s.id}`, { action: 'apply', id: s.id })}
        >
          {busy === `apply-${s.id}`
            ? s.kind === 'article'
              ? 'Writing the article…'
              : 'Applying…'
            : s.kind === 'meta'
              ? 'Put it live'
              : s.kind === 'faq'
                ? 'Add to the page draft'
                : 'Write a draft article'}
        </button>
        <button type="button" className="geo__btn" disabled={!!busy} onClick={() => act(`dismiss-${s.id}`, { action: 'dismiss', id: s.id })}>
          Dismiss
        </button>
      </div>
    </article>
  );
}

function Answers({ checks }: { checks: GeoCheck[] }) {
  const engines = [...new Set(checks.map((c) => c.engine))];
  const prompts = [...new Set(checks.map((c) => c.prompt))];
  const [open, setOpen] = useState<string | null>(null);
  const shown = checks.find((c) => c.id === open);
  return (
    <section className="geo__section">
      <h2>The answers</h2>
      <div className="geo__table-wrap">
        <table className="geo__table">
          <thead>
            <tr>
              <th scope="col">Question</th>
              {engines.map((e) => (
                <th key={e} scope="col">
                  {engineLabel(e)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {prompts.map((q) => (
              <tr key={q}>
                <th scope="row">{q}</th>
                {engines.map((e) => {
                  const c = checks.find((x) => x.prompt === q && x.engine === e);
                  if (!c) return <td key={e} />;
                  const state =
                    c.status === 'failed' ? 'failed' : c.status !== 'done' ? 'waiting' : c.cited ? 'cited' : c.mentioned ? 'named' : 'missing';
                  const text = {
                    failed: 'Failed',
                    waiting: '…',
                    cited: c.rank ? `Named #${c.rank} + linked` : 'Named + linked',
                    named: c.rank ? `Named #${c.rank}` : 'Named',
                    missing: 'Not named',
                  }[state];
                  return (
                    <td key={e}>
                      <button
                        type="button"
                        className={`geo__chip geo__chip--${state}`}
                        aria-expanded={open === c.id}
                        disabled={state === 'waiting'}
                        onClick={() => setOpen(open === c.id ? null : c.id)}
                      >
                        {text}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {shown && (
        <div className="geo__card geo__answer">
          <p className="geo__meta">
            {engineLabel(shown.engine)} · “{shown.prompt}”
          </p>
          {shown.status === 'failed' ? (
            <p className="geo__error">{shown.error}</p>
          ) : (
            <>
              {shown.businesses.length > 0 && (
                <p>
                  <b>Businesses named:</b> {shown.businesses.join(', ')}
                </p>
              )}
              <div className="geo__answer-text">{shown.answer}</div>
              {shown.sources.length > 0 && (
                <>
                  <p>
                    <b>Sources</b>
                  </p>
                  <ul className="geo__sources">
                    {shown.sources.slice(0, 15).map((s) => (
                      <li key={s.url}>
                        <a href={s.url} target="_blank" rel="noopener noreferrer">
                          {s.title || s.url}
                        </a>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function Prompts({ o, busy, act }: { o: GeoOverview; busy: string; act: (key: string, body: Record<string, unknown>) => Promise<boolean> }) {
  const [text, setText] = useState('');
  return (
    <section className="geo__section">
      <h2>Questions tracked</h2>
      <ul className="geo__prompts">
        {o.prompts.map((p) => (
          <li key={p.id} className={p.active ? '' : 'is-off'}>
            <span>{p.prompt}</span>
            <button
              type="button"
              className="geo__btn geo__btn--small"
              disabled={!!busy}
              onClick={() => act(`p-${p.id}`, { action: 'toggle-prompt', id: p.id, active: !p.active })}
            >
              {p.active ? 'Pause' : 'Resume'}
            </button>
            <button
              type="button"
              className="geo__btn geo__btn--small"
              disabled={!!busy}
              onClick={() => confirm('Stop tracking this question?') && act(`p-${p.id}`, { action: 'delete-prompt', id: p.id })}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <form
        className="geo__add"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await act('add', { action: 'add-prompt', prompt: text })) setText('');
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a question, as a customer would ask it"
          aria-label="New question"
          maxLength={300}
        />
        <button type="submit" className="geo__btn" disabled={!!busy || text.trim().length < 8}>
          Add
        </button>
      </form>
    </section>
  );
}
