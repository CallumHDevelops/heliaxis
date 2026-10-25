'use client';

import { useState } from 'react';
import { markCopied } from './actions';

/** Copies the reply to the clipboard and records that it was copied. Disabled until it may be copied. */
export function CopyDraft({ draftId, text, disabled, why }: { draftId: string; text: string; disabled: boolean; why?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [error, setError] = useState('');
  async function copy() {
    const r = await markCopied(draftId).catch(() => ({ ok: false, error: 'Something went wrong' }));
    if (!r.ok) {
      setState('error');
      setError(r.error ?? 'Not allowed');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard blocked: the text is on screen to select.
    }
    setState('copied');
  }
  return (
    <div className="sm-copy">
      <button type="button" className="sm-btn is-primary" disabled={disabled} onClick={copy}>
        {state === 'copied' ? 'Copied' : 'Copy reply'}
      </button>
      {disabled && why && <small>{why}</small>}
      {state === 'error' && <small className="sm-bad">{error}</small>}
    </div>
  );
}
