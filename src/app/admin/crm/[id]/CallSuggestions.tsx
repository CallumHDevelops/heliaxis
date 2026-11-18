'use client';

import { useEffect, useState } from 'react';
import type { CallSuggestion } from '@/lib/crm/call-suggest';

/**
 * "Brandon has asked for a call at 12:00 today. You're free then. Add to diary?": found in their email or WhatsApp, checked against
 * your diary (src/lib/crm/call-suggest.ts), with a reply ready to send (quick replies offer free times from your diary). Nothing goes in
 * the diary and nothing is sent until you say so.
 */
const hm = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });

export function CallSuggestions({ projectId, onChanged }: { projectId: string; onChanged: () => void }) {
  const [items, setItems] = useState<CallSuggestion[]>([]);
  const [texts, setTexts] = useState<Record<string, string>>({});
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

  async function act(id: string, action: 'add' | 'dismiss' | 'reply', text?: string) {
    setBusy(`${id}:${action}`);
    setErr('');
    const r = await fetch(`/api/crm/projects/${projectId}/call-suggestions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action, text }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy('');
    if (!r || !r.ok) return setErr(d.error || 'That didn’t work. Try again.');
    const s = items.find((x) => x.id === id);
    if (action === 'reply' && s?.kind === 'time') setItems((l) => l.map((x) => (x.id === id ? { ...x, replied: true } : x)));
    else setItems((l) => l.filter((x) => x.id !== id));
    if (action !== 'dismiss') onChanged();
  }

  if (!items.length) return null;
  return (
    <div className="crmr-callreqs" role="region" aria-label="Calls they asked for">
      {items.map((s) => {
        const first = s.name.trim().split(/\s+/)[0] || 'They';
        const text = texts[s.id] ?? s.reply;
        const how = s.via === 'email' ? 'email' : 'WhatsApp';
        return (
          <div key={s.id} className={`crmr-callreq${s.clash.length ? ' has-clash' : ''}`}>
            <p className="crmr-callreq__t">
              {s.kind === 'ask' ? (
                <>
                  <b>{first} wants a call{s.label.includes(',') ? ` ${s.label.split(',')[0]}` : ''}</b>, but didn’t say a time.{' '}
                  {s.times.length ? `You’re free at ${s.times.join(', ')}.` : ''}
                </>
              ) : (
                <>
                  <b>{first} has asked for a call {s.label}.</b>{' '}
                  {s.clash.length ? (
                    <>
                      You have <b>{s.clash[0]}</b>
                      {s.clash.length > 1 ? ` and ${s.clash.length - 1} more` : ''} then.{s.nextFree ? ` You’re free from ${hm(s.nextFree)}.` : ''}
                    </>
                  ) : (
                    'You’re free then.'
                  )}
                </>
              )}
            </p>
            <p className="crmr-callreq__q">“{s.snippet}” ({how})</p>
            {!s.replied && (
              <>
                {s.replies.length > 1 && (
                  <div className="crmr-callreq__chips" role="group" aria-label="Quick replies">
                    {s.replies.map((q) => (
                      <button key={q.label} type="button" className={`crm-chipbtn${text === q.text ? ' on' : ''}`} onClick={() => setTexts((t) => ({ ...t, [s.id]: q.text }))}>
                        {q.label}
                      </button>
                    ))}
                  </div>
                )}
                <textarea className="crm-input" rows={s.via === 'email' ? 6 : 3} value={text} aria-label={`Reply to ${first} by ${how}`} onChange={(e) => setTexts((t) => ({ ...t, [s.id]: e.target.value }))} />
              </>
            )}
            <div className="crm-actions" style={{ flexWrap: 'wrap' }}>
              {!s.replied && (
                <button type="button" className="crm-btn crm-btn--solar crm-btn--small" disabled={!!busy || !text.trim()} onClick={() => void act(s.id, 'reply', text)}>
                  {busy === `${s.id}:reply` ? 'Sending…' : `Send reply by ${how}`}
                </button>
              )}
              {s.kind === 'time' && (
                <button type="button" className={`crm-btn crm-btn--small ${s.replied ? 'crm-btn--solar' : 'crm-btn--ghost'}`} disabled={!!busy} onClick={() => void act(s.id, 'add')}>
                  {busy === `${s.id}:add` ? 'Adding…' : s.clash.length ? 'Add to diary anyway' : 'Add to diary'}
                </button>
              )}
              <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={!!busy} onClick={() => void act(s.id, 'dismiss')}>
                {s.replied ? 'Done' : 'Not now'}
              </button>
            </div>
            {s.replied && <p className="crmr-callreq__q">Replied by {how}.</p>}
          </div>
        );
      })}
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
    </div>
  );
}
