'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Proposal } from '@/lib/seo/server';
import '../../crm/crm.css';
import { approve, dismiss, runNow } from './actions';

export function RunNow() {
  const [busy, start] = useTransition();
  const [started, setStarted] = useState(false);
  return (
    <div className="seo-run">
      <button type="button" className="crm-btn crm-btn--ghost" disabled={busy || started} onClick={() => start(async () => { await runNow(); setStarted(true); })}>
        {busy ? 'Starting…' : started ? 'Checking…' : 'Check now'}
      </button>
      {started && <small>Running. It takes a minute or two: refresh this page.</small>}
    </div>
  );
}

/** Suggested titles and descriptions: read, then approve (it goes live on the page now) or dismiss. */
export function Proposals({ waiting, admin }: { waiting: Proposal[]; admin: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  async function go(id: string, what: 'approve' | 'dismiss') {
    setBusy(id);
    setErr('');
    const r = what === 'approve' ? await approve(id) : await dismiss(id).then(() => ({ ok: true as boolean, error: undefined as string | undefined }));
    setBusy('');
    if (!r.ok) return setErr(r.error || 'That didn’t work.');
    router.refresh();
  }
  return (
    <section className="seo-sec" aria-label="Suggested fixes">
      <h2>Waiting for you ({waiting.length})</h2>
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
      {waiting.length === 0 ? (
        <p className="seo-muted">No suggestions waiting. When a page’s title or description is missing, too short or too long, a better one is written here for you to approve.</p>
      ) : (
        <ul className="seo-props">
          {waiting.map((p) => (
            <li key={p.id}>
              <div className="seo-prop__h">
                <b>{p.path}</b>
                <small>{p.reason}</small>
              </div>
              <div className="seo-prop__cmp">
                <div>
                  <span>Now</span>
                  <p>{p.oldTitle || <i>No title</i>}</p>
                  <p className="seo-d">{p.oldDescription || <i>No description</i>}</p>
                </div>
                <div className="is-new">
                  <span>Suggested</span>
                  <p>{p.title}</p>
                  <p className="seo-d">{p.description}</p>
                </div>
              </div>
              {admin && (
                <div className="crm-actions">
                  {p.canApply ? (
                    <button type="button" className="crm-btn crm-btn--solar crm-btn--small" disabled={!!busy} onClick={() => void go(p.id, 'approve')}>
                      {busy === p.id ? 'Publishing…' : 'Approve and publish'}
                    </button>
                  ) : (
                    <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => void navigator.clipboard?.writeText(`${p.title}\n${p.description}`)}>
                      Copy the text
                    </button>
                  )}
                  <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={!!busy} onClick={() => void go(p.id, 'dismiss')}>
                    Dismiss
                  </button>
                  {!p.canApply && <small className="seo-muted">This page isn’t in the website editor: change it where the page is built.</small>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
