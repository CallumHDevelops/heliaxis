'use client';

import { useEffect, useState } from 'react';
import { portalPathHere } from '@/lib/crm/portal-url';
import { forgetProject, registerPortalWorker, rememberedProject } from './InstallApp';

/** Their project number, surname or inverter serial (last 6), and the postcode → their portal. */
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
    const at = portalPathHere(`/my/${t}`);
    void fetch(at, { method: 'HEAD', cache: 'no-store' })
      .then((r) => (r.ok ? window.location.replace(at) : forgetProject()))
      .catch(() => null);
  }, [forget]);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const r = await fetch('/api/my/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: serial, postcode }) });
      const d = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
      if (r.ok && d.url) {
        window.location.assign(portalPathHere(d.url));
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
      <p>Enter your postcode and any one of: your project number, your surname, or the last 6 characters of your inverter’s serial number.</p>
      <label className="pt-login__field">
        <span>Project number, surname or inverter serial</span>
        <input
          className="pt-input"
          value={serial}
          onChange={(e) => setSerial(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder="e.g. HX-0113, Jones or 4A7B21"
          required
          maxLength={80}
        />
        <small>Your project number is on your quote and our emails. The serial is on the label on the side of your inverter, after “SN”: just its last 6.</small>
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
      <button type="submit" className="pt-btn" disabled={busy || serial.trim().length < 2 || !postcode.trim()}>
        {busy ? 'Opening…' : 'Open my project'}
      </button>
      <p className="pt-login__small">Or use the link we sent you by WhatsApp or email.</p>
    </form>
  );
}
