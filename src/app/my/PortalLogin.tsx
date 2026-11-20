'use client';

import { useEffect, useRef, useState } from 'react';
import { portalPathHere } from '@/lib/crm/portal-url';
import { forgetProject, registerPortalWorker, rememberedProject } from './InstallApp';

/** Their project number, surname or inverter serial (last 6), and the postcode → their portal. */
export function PortalLogin({ forget = false }: { forget?: boolean }) {
  const [serial, setSerial] = useState('');
  const [postcode, setPostcode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState<Sent | null>(null);

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
      const d = (await r.json().catch(() => ({}))) as Sent & { url?: string; error?: string };
      if (r.ok && d.step === 'code') {
        setSent(d);
        setBusy(false);
        return;
      }
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

  if (sent) return <CodeStep sent={sent} onRestart={() => setSent(null)} />;

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

type Sent = { step: 'code'; channel: 'sms' | 'email'; to: string; channels: { kind: 'sms' | 'email'; to: string }[]; minutes: number };

/**
 * Step two: the 6-digit code we just sent to the mobile or email on their job (api/my/login/code). The box
 * takes the phone's own code suggestion (one-time-code: iPhone from the text, Android fills it in).
 */
function CodeStep({ sent: first, onRestart }: { sent: Sent; onRestart: () => void }) {
  const [sent, setSent] = useState(first);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const box = useRef<HTMLInputElement>(null);
  const tried = useRef('');

  async function verify(value: string) {
    if (value.length !== 6 || busy || tried.current === value) return;
    tried.current = value;
    setBusy(true);
    setErr('');
    const r = await fetch('/api/my/login/code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: value }) }).catch(() => null);
    const d = r ? ((await r.json().catch(() => ({}))) as { url?: string; error?: string; restart?: boolean }) : {};
    if (r?.ok && d.url) {
      window.location.assign(portalPathHere(d.url));
      return;
    }
    if (d.restart) return onRestart();
    setErr(r ? d.error || 'That didn’t work. Try again.' : 'No connection. Check your signal and try again.');
    setBusy(false);
    setCode('');
    box.current?.focus();
  }

  async function resend(channel: 'sms' | 'email') {
    setBusy(true);
    setErr('');
    setNote('');
    const r = await fetch('/api/my/login/code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resend: channel }) }).catch(() => null);
    const d = r ? ((await r.json().catch(() => ({}))) as Partial<Sent> & { error?: string; restart?: boolean }) : null;
    setBusy(false);
    if (r?.ok && d?.step === 'code') {
      setSent(d as Sent);
      setCode('');
      tried.current = '';
      setNote(`New code sent to ${d.to}. The last one no longer works.`);
      box.current?.focus();
      return;
    }
    if (d?.restart) return onRestart();
    setErr(d?.error || 'Couldn’t send a new code. Try again.');
  }

  // Web OTP (Android Chrome): reads the code from the text by itself.
  useEffect(() => {
    if (sent.channel !== 'sms' || !('OTPCredential' in window)) return;
    const ac = new AbortController();
    (navigator.credentials as unknown as { get: (o: unknown) => Promise<{ code?: string } | null> })
      .get({ otp: { transport: ['sms'] }, signal: ac.signal })
      .then((c) => {
        if (c?.code) {
          setCode(c.code);
          void verify(c.code);
        }
      })
      .catch(() => null);
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sent.channel, sent.to]);

  const other = sent.channels.find((c) => c.kind !== sent.channel);
  return (
    <form
      className="pt-card pt-login pt-action"
      onSubmit={(e) => {
        e.preventDefault();
        void verify(code);
      }}
    >
      <span className="pt-badge">Check your {sent.channel === 'sms' ? 'texts' : 'email'}</span>
      <h2>Enter your 6-digit code</h2>
      <p>
        We’ve sent a code to <b>{sent.to}</b>. It lasts {sent.minutes} minutes.
      </p>
      <label className="pt-login__field">
        <span>Code</span>
        <input
          ref={box}
          className="pt-input pt-login__code"
          value={code}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '').slice(0, 6);
            setCode(v);
            if (v.length === 6) void verify(v);
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          placeholder="••••••"
          autoFocus
        />
      </label>
      {err && (
        <p className="pt-login__err" role="alert">
          {err}
        </p>
      )}
      {note && !err && <p className="pt-banner ok">{note}</p>}
      <button type="submit" className="pt-btn" disabled={busy || code.length !== 6}>
        {busy ? 'One moment…' : 'Open my project'}
      </button>
      <div className="pt-row pt-quiet">
        <button type="button" className="pt-linkbtn" disabled={busy} onClick={() => void resend(sent.channel)}>
          Send a new code
        </button>
        {other && (
          <button type="button" className="pt-linkbtn" disabled={busy} onClick={() => void resend(other.kind)}>
            {other.kind === 'sms' ? `Text it to ${other.to}` : `Email it to ${other.to}`}
          </button>
        )}
      </div>
      <p className="pt-login__small">
        Not your number or email any more? Call us on 01633 965205, or{' '}
        <button type="button" className="pt-linkbtn pt-inline" onClick={onRestart}>
          start again
        </button>
        .
      </p>
    </form>
  );
}
