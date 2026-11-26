'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './parts';

type Turn = { role: 'user' | 'assistant'; content: string };

/**
 * Metis, the portal's helper (api/my/[token]/metis): quick answers about their own project from what
 * the portal shows, and plain guidance on solar, batteries, the SEG and MCS. Anything that needs a
 * person goes to Messages: `onHandoff` opens it with the question started for them.
 */
export function Metis({ token, suggestions, onHandoff }: { token: string; suggestions: string[]; onHandoff: (text: string) => void }) {
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
    const r = await fetch(`/api/my/${token}/metis`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question, history }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    setTurns((t) => [...t, { role: 'assistant', content: d.answer || d.error || 'Sorry, I can’t answer just now. Try Messages instead.' }]);
  }
  const lastQuestion = [...turns].reverse().find((t) => t.role === 'user')?.content ?? '';

  return (
    <section className="pt-card pt-metis" aria-label="Ask Metis" id="pt-metis">
      <div className="pt-metis-head">
        <span className="pt-metis-av" aria-hidden="true">
          <Icon name="spark" size={20} />
        </span>
        <div>
          <h2>Ask Metis</h2>
          <p className="pt-muted">Your project helper. Instant answers about your dates, system, documents and payments.</p>
        </div>
      </div>
      {turns.length > 0 && (
        <div className="pt-metis-log" ref={list} aria-live="polite">
          {turns.map((t, i) => (
            <p key={i} className={t.role === 'user' ? 'me' : 'her'}>
              {t.content}
            </p>
          ))}
          {busy && <p className="her pt-typing">Metis is typing…</p>}
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
        className="pt-metis-ask"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(text);
        }}
      >
        <input className="pt-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask a question" aria-label="Your question for Metis" maxLength={600} enterKeyHint="send" />
        <button type="submit" className="pt-btn" disabled={busy || !text.trim()} aria-label="Ask">
          <Icon name="arrow" size={18} />
        </button>
      </form>
      {turns.length > 1 && (
        <button type="button" className="pt-linkbtn" onClick={() => onHandoff(lastQuestion)}>
          Not answered? Ask the team instead
        </button>
      )}
      <p className="pt-fine">Metis is an AI helper and can make mistakes. For anything important, check with the team.</p>
    </section>
  );
}
