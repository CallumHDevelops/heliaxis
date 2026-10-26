'use client';

import { useState } from 'react';

/** The minimum margin wanted on a job. Quotes under it are flagged in the builder and in the report. */
export function TargetForm({ initial }: { initial: number }) {
  const [v, setV] = useState(initial ? String(initial) : '');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    setMsg('');
    const r = await fetch('/api/crm/quote-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ minMarginPct: Number(v) || 0 }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    setMsg(r.ok ? 'Saved. Refresh to see which quotes fall below it.' : d.error || 'Not saved');
  }
  return (
    <div className="mr-target">
      <label htmlFor="mr-target-in">Minimum margin wanted on a job</label>
      <input id="mr-target-in" className="crm-input" inputMode="decimal" placeholder="e.g. 20" value={v} onChange={(e) => setV(e.target.value.replace(/[^0-9.]/g, ''))} />
      <span>%</span>
      <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={busy} onClick={() => void save()}>
        {busy ? 'Saving…' : 'Save'}
      </button>
      {msg && <small className="crm-muted">{msg}</small>}
    </div>
  );
}
