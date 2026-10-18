'use client';

import { useState } from 'react';

/** Copies `value` (or what `load()` returns) to the clipboard, with a ✓ for a moment. */
export function CopyButton({
  value,
  load,
  label = 'Copy',
  className,
}: {
  value?: string;
  load?: () => Promise<string>;
  label?: string;
  className?: string;
}) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  async function copy() {
    setState('busy');
    try {
      const text = value ?? (load ? await load() : '');
      await navigator.clipboard.writeText(text);
      setState('done');
    } catch {
      setState('error');
    }
    setTimeout(() => setState('idle'), 1800);
  }
  return (
    <button type="button" className={className} onClick={copy} disabled={state === 'busy'}>
      {state === 'done' ? 'Copied ✓' : state === 'error' ? 'Couldn’t copy' : state === 'busy' ? '…' : label}
    </button>
  );
}
