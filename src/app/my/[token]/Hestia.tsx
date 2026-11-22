'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './parts';

type Turn = { role: 'user' | 'assistant'; content: string; id?: string | null; rating?: 1 | -1 };

/**
 * Hestia, the portal's helper (api/my/[token]/hestia): quick answers about their own project from what
 * the portal shows, and plain guidance on solar, batteries, the SEG and MCS. Anything that needs a
 * person goes to Messages: `onHandoff` opens it with the question started for them.
 */
export function Hestia({ token, suggestions, onHandoff }: { token: string; suggestions: string[]; onHandoff: (text: string) => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [turns, busy]);

  async function ask(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    const history = turns;
    setTurns([...history, { role: 'user', content: question }]);
    setText('');
    setBusy(true);
    const r = await fetch(`/api/my/${token}/hestia`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question, history }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    setTurns((t) => [...t, { role: 'assistant', content: d.answer || d.error || 'Sorry, I can’t answer just now. Try Messages instead.', id: typeof d.id === 'string' ? d.id : null }]);
  }
  /** Thumbs up or down on one answer. Shown as chosen straight away; put back if it couldn't be saved. */
  async function rate(i: number, rating: 1 | -1) {
    const id = turns[i]?.id;
    if (!id || rating === turns[i].rating) return;
    const before = turns[i].rating;
    setTurns((t) => t.map((x, j) => (j === i ? { ...x, rating } : x)));
    const r = await fetch(`/api/my/${token}/hestia/rate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, rating }) }).catch(() => null);
    if (!r?.ok) setTurns((t) => t.map((x, j) => (j === i ? { ...x, rating: before } : x)));
  }
  const lastQuestion = [...turns].reverse().find((t) => t.role === 'user')?.content ?? '';

  return (
    <section className="pt-card pt-hestia" aria-label="Ask Hestia" id="pt-hestia">
      <div className="pt-hestia-head">
        <span className="pt-hestia-av" aria-hidden="true">
          <Icon name="spark" size={20} />
        </span>
        <div>
          <h2>Ask Hestia</h2>
          <p className="pt-muted">Your project helper. Instant answers about your dates, system, documents and payments.</p>
        </div>
      </div>
      {turns.length > 0 && (
        <div className="pt-hestia-log" ref={list} aria-live="polite">
          {turns.map((t, i) => (
            <div key={i} className={`pt-turn ${t.role === 'user' ? 'me' : 'her'}`}>
              <p>{t.content}</p>
              {t.role === 'assistant' && t.id && (
                <div className="pt-rate" role="group" aria-label="Was this answer helpful?">
                  <span className="pt-fine">{t.rating ? 'Thanks, that helps me get better.' : 'Was that helpful?'}</span>
                  <button type="button" className="pt-rate-btn" aria-pressed={t.rating === 1} aria-label="Helpful answer" title="Helpful" onClick={() => void rate(i, 1)}>
                    <Icon name="thumbup" size={16} />
                  </button>
                  <button type="button" className="pt-rate-btn" aria-pressed={t.rating === -1} aria-label="Not helpful" title="Not helpful" onClick={() => void rate(i, -1)}>
                    <Icon name="thumbdown" size={16} />
                  </button>
                </div>
              )}
            </div>
          ))}
          {busy && <p className="her pt-typing">Hestia is typing…</p>}
        </div>
      )}
      {turns.length === 0 && (
        <div className="pt-chips">
          {suggestions.map((s) => (
            <button key={s} type="button" className="pt-chip" onClick={() => void ask(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      <form
        className="pt-hestia-ask"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(text);
        }}
      >
        <input className="pt-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask a question" aria-label="Your question for Hestia" maxLength={600} enterKeyHint="send" />
        <button type="submit" className="pt-btn" disabled={busy || !text.trim()} aria-label="Ask">
          <Icon name="arrow" size={18} />
        </button>
      </form>
      {turns.length > 1 && (
        <button type="button" className="pt-linkbtn" onClick={() => onHandoff(lastQuestion)}>
          Not answered? Ask the team instead
        </button>
      )}
      <p className="pt-fine">Hestia is an AI helper and can make mistakes. For anything important, check with the team.</p>
    </section>
  );
}
