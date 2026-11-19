'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { rebuildWeeklyReport } from '../actions';

export function RebuildReport() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="sx-row">
      <button
        type="button"
        className="crm-btn crm-btn--ghost crm-btn--small"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await rebuildWeeklyReport();
          setBusy(false);
          setMsg(r.ok ? null : r.error);
          if (r.ok) router.refresh();
        }}
      >
        {busy ? 'Building…' : 'Build last week’s report now'}
      </button>
      {msg && <small className="sx-down">{msg}</small>}
    </div>
  );
}
