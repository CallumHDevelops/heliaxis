'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

async function post(url: string, body: unknown) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.ok === false) throw new Error(d.error || 'Something went wrong — please try again.');
}

/** Email → 6-digit code → session. */
export function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function request(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await post('/api/portal/login/request', { email });
      setSent(true);
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await post('/api/portal/login/verify', { email, code });
      router.replace('/portal/app');
    } catch (e2) {
      setErr((e2 as Error).message);
      setBusy(false);
    }
  }

  return sent ? (
    <form className="pt-signin" onSubmit={verify}>
      <p>If <strong>{email}</strong> is registered with us, we&apos;ve emailed it a 6-digit code. It expires in 10 minutes.</p>
      <label className="pt-field">
        <span className="pt-label">Code</span>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          autoFocus
        />
      </label>
      {err && <p className="pt-msg is-err">{err}</p>}
      <div className="pt-row">
        <button className="pt-btn" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Sign in'}</button>
        <button type="button" className="pt-btn-ghost" onClick={() => { setSent(false); setCode(''); setErr(''); }}>
          Use a different email
        </button>
      </div>
    </form>
  ) : (
    <form className="pt-signin" onSubmit={request}>
      <label className="pt-field">
        <span className="pt-label">Email address</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required autoFocus />
      </label>
      {err && <p className="pt-msg is-err">{err}</p>}
      <button className="pt-btn" disabled={busy}>{busy ? 'Sending…' : 'Email me a sign-in code'}</button>
    </form>
  );
}
