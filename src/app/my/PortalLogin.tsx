'use client';

import { useEffect, useState } from 'react';
import { forgetProject, registerPortalWorker, rememberedProject } from './InstallApp';

/** The last 6 of the inverter's serial number, and the postcode → their portal. */
export function PortalLogin({ forget = false }: { forget?: boolean }) {
  const [serial, setSerial] = useState('');
  const [postcode, setPostcode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // "Forget it on this device", or a project this phone remembers (the home-screen app on an iPhone keeps its own storage).
  useEffect(() => {
    registerPortalWorker();
    if (forget) return forgetProject();
    const t = rememberedProject();
    if (!t || !/^[A-Za-z0-9_-]{16,64}$/.test(t)) return;
    // Only if that project still opens (a closed one would land on "not found" every time).
    void fetch(`/my/${t}`, { method: 'HEAD', cache: 'no-store' })
      .then((r) => (r.ok ? window.location.replace(`/my/${t}`) : forgetProject()))
      .catch(() => null);
  }, [forget]);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const r = await fetch('/api/my/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ serial, postcode }) });
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
    <form className="pt-card pt-login pt-action" onSubmit={go}>
      <h2>Open your project</h2>
      <p>Enter the last 6 characters of your inverter’s serial number, and your postcode.</p>
      <label className="pt-login__field">
        <span>Inverter serial number: last 6</span>
        <input
          className="pt-input pt-login__serial"
          value={serial}
          onChange={(e) => setSerial(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-6))}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="e.g. 4A7B21"
          required
          maxLength={6}
        />
        <small>It’s on the label on the side of your inverter, after “SN” or “S/N”.</small>
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
      <button type="submit" className="pt-btn" disabled={busy || serial.length !== 6 || !postcode.trim()}>
        {busy ? 'Opening…' : 'Open my project'}
      </button>
      <p className="pt-login__small">Or use the link we sent you by WhatsApp or email.</p>
    </form>
  );
}
