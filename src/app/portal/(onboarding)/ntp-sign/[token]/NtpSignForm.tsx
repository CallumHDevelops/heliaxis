'use client';

import { useState } from 'react';
import { SignaturePad } from '@/components/subcontractors/SignaturePad';

export function NtpSignForm({ token, hash, defaultName }: { token: string; hash: string; defaultName: string }) {
  const [name, setName] = useState(defaultName);
  const [title, setTitle] = useState('Nominated Technical Person');
  const [agree, setAgree] = useState(false);
  const [sig, setSig] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  async function sign() {
    setBusy(true);
    setErr('');
    try {
      const r = await fetch('/api/portal/ntp-sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name, title, signature: sig, agree, hash }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) throw new Error(d.error || 'Something went wrong — please try again.');
      setDone(true);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p className="pt-banner is-ok">
        Thank you — your signature is recorded. Heliaxis will countersign it and email you once your appointment is in force.
      </p>
    );
  }

  return (
    <div className="pt-sign">
      <h3>Sign as the NTP</h3>
      <div className="pt-grid">
        <label className="pt-field">
          <span className="pt-label">Full name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </label>
        <label className="pt-field">
          <span className="pt-label">Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
      </div>
      <SignaturePad onChange={setSig} />
      <label className="pt-check">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>
          I have read this NTP agreement, I am the person named as NTP, I am authorised to sign for the Subcontractor, and I
          agree that my electronic signature is legally binding.
        </span>
      </label>
      {err && <p className="pt-msg is-err">{err}</p>}
      <button className="pt-btn" type="button" disabled={busy || !agree || !sig || name.trim().length < 2} onClick={sign}>
        {busy ? 'Signing…' : 'Sign NTP agreement'}
      </button>
    </div>
  );
}
