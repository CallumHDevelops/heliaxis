'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { WritingSpark } from '@/app/admin/sales/quotes/[id]/WritingSpark';
import { estimateTeardownAction, rebuildTeardownAction } from './actions';

const usd = (v: number) => (v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`);

/** Rebuild one search's teardown: shows the cost first, then spends only on a second press. */
export function RebuildTeardown({ keywordId }: { keywordId: number }) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'pricing' | 'confirm' | 'busy'>('idle');
  const [quote, setQuote] = useState<{ pages: number; dataforseoUsd: number; aiUsd: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  if (state === 'busy') return <WritingSpark label="Reading the pages and writing the teardown" />;

  if (state === 'confirm' && quote) {
    return (
      <div className="tdn-confirm">
        <span>
          {quote.pages ? `Reads ${quote.pages} page${quote.pages === 1 ? '' : 's'} (about ${usd(quote.dataforseoUsd)} at DataForSEO)` : 'Every page is already read'}, then writes the summary (up to about {usd(quote.aiUsd)}).
        </span>
        <span className="sx-row">
          <button
            type="button"
            className="crm-btn crm-btn--solar crm-btn--small"
            onClick={async () => {
              setState('busy');
              setMsg(null);
              const r = await rebuildTeardownAction(keywordId);
              setState('idle');
              setMsg(r.ok ? (r.message ?? null) : r.error);
              if (r.ok) router.refresh();
            }}
          >
            Rebuild now
          </button>
          <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => setState('idle')}>
            Cancel
          </button>
        </span>
      </div>
    );
  }

  return (
    <span className="sx-row">
      <button
        type="button"
        className="crm-btn crm-btn--ghost crm-btn--small"
        disabled={state === 'pricing'}
        onClick={async () => {
          setState('pricing');
          setMsg(null);
          const r = await estimateTeardownAction(keywordId);
          if (r.ok && r.data) {
            setQuote(r.data);
            setState('confirm');
          } else {
            setState('idle');
            setMsg(r.ok ? 'Could not price it.' : r.error);
          }
        }}
      >
        {state === 'pricing' ? 'Pricing…' : 'Rebuild teardown'}
      </button>
      {msg && <small className="sx-note">{msg}</small>}
    </span>
  );
}
