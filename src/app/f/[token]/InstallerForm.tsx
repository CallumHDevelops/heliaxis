'use client';

import { useEffect, useState } from 'react';
import { FormFlow, type FlowView } from '@/components/forms/FormFlow';
import type { Answers } from '@/lib/templates/types';

async function call(token: string, body?: Record<string, unknown>): Promise<FlowView> {
  const r = await fetch(`/api/f/${token}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Something went wrong. Try again.');
  return d as FlowView;
}

export function InstallerForm({ token }: { token: string }) {
  const [view, setView] = useState<FlowView | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    call(token).then(setView, (e) => setErr(e instanceof Error ? e.message : 'This link didn’t open.'));
  }, [token]);
  if (!view)
    return (
      <div className="ff">
        <main className="ff-stage">
          <section className="ff-card">
            <p className="ff-eyebrow">Heliaxis</p>
            <h2 className="ff-q">{err ? 'This link didn’t open' : 'Opening…'}</h2>
            {err && <p className="ff-lede">{err}</p>}
          </section>
        </main>
      </div>
    );
  return (
    <FormFlow
      view={view}
      who={view.who}
      save={(answers: Answers) => call(token, { answers })}
      finish={(sign) => call(token, { finish: true, ...(sign ?? {}) })}
    />
  );
}
