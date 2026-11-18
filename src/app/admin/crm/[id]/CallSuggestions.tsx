'use client';

import { useEffect, useState } from 'react';
import type { CallSuggestion } from '@/lib/crm/call-suggest';

/**
 * "Brandon has asked for a call at 12:00 today. You're free then. Add to diary?": found in their email or WhatsApp, checked against
 * your diary (src/lib/crm/call-suggest.ts). Nothing goes in the diary until you say yes.
 */
const hm = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });

export function CallSuggestions({ projectId, onChanged }: { projectId: string; onChanged: () => void }) {
  const [items, setItems] = useState<CallSuggestion[]>([]);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    const pull = () =>
      fetch(`/api/crm/projects/${projectId}/call-suggestions`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => live && d?.suggestions && setItems(d.suggestions as CallSuggestion[]))
        .catch(() => null);
    pull();
    const t = setInterval(pull, 30_000);
    window.addEventListener('hx:project-changed', pull);
    return () => {
      live = false;
      clearInterval(t);
      window.removeEventListener('hx:project-changed', pull);
    };
  }, [projectId]);

  async function act(id: string, action: 'add' | 'dismiss') {
    setBusy(id);
    setErr('');
    const r = await fetch(`/api/crm/projects/${projectId}/call-suggestions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy('');
    if (!r || !r.ok) return setErr(d.error || 'That didn’t work. Try again.');
    setItems((l) => l.filter((x) => x.id !== id));
    if (action === 'add') onChanged();
  }

  if (!items.length) return null;
  return (
    <div className="crmr-callreqs" role="region" aria-label="Calls they asked for">
      {items.map((s) => {
        const first = s.name.trim().split(/\s+/)[0] || 'They';
        return (
          <div key={s.id} className={`crmr-callreq${s.clash.length ? ' has-clash' : ''}`}>
            <p className="crmr-callreq__t">
              <b>{first} has asked for a call {s.label}.</b>{' '}
              {s.clash.length ? (
                <>
                  You have <b>{s.clash[0]}</b>
                  {s.clash.length > 1 ? ` and ${s.clash.length - 1} more` : ''} then.{s.nextFree ? ` You’re free from ${hm(s.nextFree)}.` : ''}
                </>
              ) : (
                'You’re free then.'
              )}
            </p>
            <p className="crmr-callreq__q">“{s.snippet}” ({s.via === 'email' ? 'email' : 'WhatsApp'})</p>
            <div className="crm-actions">
              <button type="button" className="crm-btn crm-btn--solar crm-btn--small" disabled={!!busy} onClick={() => void act(s.id, 'add')}>
                {busy === s.id ? 'Adding…' : s.clash.length ? 'Add to diary anyway' : 'Add to diary'}
              </button>
              <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={!!busy} onClick={() => void act(s.id, 'dismiss')}>
                Not now
              </button>
            </div>
          </div>
        );
      })}
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
    </div>
  );
}
