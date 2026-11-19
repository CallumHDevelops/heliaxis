'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { actionStatus } from '../actions';

export function ActionButtons({ id }: { id: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const act = async (status: 'done' | 'snoozed' | 'not_relevant') => {
    setBusy(status);
    setErr(null);
    const r = await actionStatus(id, status, { reason });
    setBusy(null);
    if (!r.ok) return setErr(r.error);
    router.refresh();
  };
  if (asking)
    return (
      <span className="sx-row">
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why not relevant?" aria-label="Why it is not relevant" style={{ minWidth: 160 }} />
        <button type="button" className="crm-btn crm-btn--solar crm-btn--small" disabled={!!busy || !reason.trim()} onClick={() => act('not_relevant')}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => setAsking(false)}>
          Cancel
        </button>
        {err && <small className="sx-down">{err}</small>}
      </span>
    );
  return (
    <span className="sx-row" style={{ flexWrap: 'nowrap' }}>
      <button type="button" className="crm-btn crm-btn--solar crm-btn--small" disabled={!!busy} onClick={() => act('done')}>
        {busy === 'done' ? 'Saving…' : 'Done'}
      </button>
      <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={!!busy} onClick={() => act('snoozed')} title="Snooze for a week">
        {busy === 'snoozed' ? 'Saving…' : 'Snooze'}
      </button>
      <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={!!busy} onClick={() => setAsking(true)}>
        Not relevant
      </button>
      {err && <small className="sx-down">{err}</small>}
    </span>
  );
}
