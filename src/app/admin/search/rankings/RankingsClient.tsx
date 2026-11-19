'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { addKeywords, liveCheckAction } from '../actions';

/** A table row that opens the search's drawer. */
export function RowLink({ href, children }: { href: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <tr className="link" tabIndex={0} onClick={() => router.push(href, { scroll: false })} onKeyDown={(e) => e.key === 'Enter' && router.push(href, { scroll: false })}>
      {children}
    </tr>
  );
}

export function TrackButton({ phrase }: { phrase: string }) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'busy' | 'done' | string>('idle');
  return (
    <button
      type="button"
      className="crm-btn crm-btn--ghost crm-btn--small"
      disabled={state === 'busy' || state === 'done'}
      onClick={async () => {
        setState('busy');
        const r = await addKeywords(phrase, { source: 'untracked_win' });
        setState(r.ok ? 'done' : r.error);
        if (r.ok) router.refresh();
      }}
    >
      {state === 'busy' ? 'Adding…' : state === 'done' ? 'Tracked' : state === 'idle' ? 'Track' : 'Try again'}
    </button>
  );
}

/** Check this one search now, live (about 2 US cents; once a day). */
export function CheckNow({ keywordId }: { keywordId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="sx-row">
      <button
        type="button"
        className="crm-btn crm-btn--solar crm-btn--small"
        disabled={busy}
        title="Live check, about $0.02 (up to a minute)"
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          const r = await liveCheckAction(keywordId);
          setBusy(false);
          setMsg(r.ok ? null : r.error);
          if (r.ok) router.refresh();
        }}
      >
        {busy ? 'Checking…' : 'Check now, about $0.02'}
      </button>
      {msg && <small style={{ color: '#ffcb45' }}>{msg}</small>}
    </span>
  );
}
