'use client';

import { useState } from 'react';

/** "Tell us privately": an equal choice beside the public sites, never a place people are sent to instead of them. */
export function PrivateFeedback({ token, done }: { token: string; done: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(done);
  const [err, setErr] = useState('');
  async function send() {
    setBusy(true);
    setErr('');
    const r = await fetch(`/api/review/${token}/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r || !r.ok) return setErr(d.error || 'That didn’t send. Please try again.');
    setSent(true);
  }
  if (sent) return <p className="rv-thanks">Thank you. We have your message and we will read it.</p>;
  return (
    <div className="rv-private">
      {!open ? (
        <button type="button" className="rv-btn rv-btn--ghost" onClick={() => setOpen(true)}>
          Tell us privately
        </button>
      ) : (
        <>
          <label htmlFor="rv-msg">What would you like us to know?</label>
          <textarea id="rv-msg" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="Anything at all: what went well, or what we could do better." />
          {err && <p className="rv-err">{err}</p>}
          <button type="button" className="rv-btn" disabled={busy || text.trim().length < 3} onClick={() => void send()}>
            {busy ? 'Sending…' : 'Send to Heliaxis'}
          </button>
        </>
      )}
    </div>
  );
}
