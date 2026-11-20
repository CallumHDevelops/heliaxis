'use client';

import { useState } from 'react';

/** Surname and postcode → their portal. */
export function PortalLogin() {
  const [surname, setSurname] = useState('');
  const [postcode, setPostcode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const r = await fetch('/api/my/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ surname, postcode }) });
      const d = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
      if (r.ok && d.url) {
        window.location.assign(d.url);
        return;
      }
      setErr(d.error || 'That didn’t work. Try again.');
    } catch {
      setErr('No connection. Check your signal and try again.');
    }
    setBusy(false);
  }

  return (
    <form className="pt-card pt-login" onSubmit={go}>
      <h2>Open your project</h2>
      <p>Enter the surname and postcode we have for your home.</p>
      <label className="pt-login__field">
        <span>Surname</span>
        <input className="pt-input" value={surname} onChange={(e) => setSurname(e.target.value)} autoComplete="family-name" autoCapitalize="words" required maxLength={80} />
      </label>
      <label className="pt-login__field">
        <span>Postcode</span>
        <input className="pt-input" value={postcode} onChange={(e) => setPostcode(e.target.value.toUpperCase())} autoComplete="postal-code" autoCapitalize="characters" required maxLength={10} />
      </label>
      {err && (
        <p className="pt-login__err" role="alert">
          {err}
        </p>
      )}
      <button type="submit" className="pt-btn" disabled={busy || !surname.trim() || !postcode.trim()}>
        {busy ? 'Opening…' : 'Open my project'}
      </button>
      <p className="pt-login__small">Or use the link we sent you by WhatsApp or email.</p>
    </form>
  );
}
