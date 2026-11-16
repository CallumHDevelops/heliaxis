'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Proposal } from '@/lib/seo/server';
import '../../crm/crm.css';
import { withoutBrand } from '@/lib/seo/title';
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

/** Suggested titles and descriptions: read, edit if you like, then approve (it goes live on the page now) or dismiss. */
export function Proposals({ waiting, admin }: { waiting: Proposal[]; admin: boolean }) {
  return (
    <section className="seo-sec" aria-label="Suggested fixes">
      <h2>Waiting for you ({waiting.length})</h2>
      {waiting.length === 0 ? (
        <p className="seo-muted">No suggestions waiting. When a page’s title or description is missing, too short or too long, a better one is written here for you to approve.</p>
      ) : (
        <ul className="seo-props">
          {waiting.map((p) => (
            <ProposalCard key={p.id} p={p} admin={admin} />
          ))}
        </ul>
      )}
    </section>
  );
}

const TITLE_MAX = 60;
const DESC_MIN = 120;
const DESC_MAX = 158;
const BRAND = ' | Heliaxis';

function ProposalCard({ p, admin }: { p: Proposal; admin: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState(withoutBrand(p.title));
  const [description, setDescription] = useState(p.description);
  const [busy, setBusy] = useState<'' | 'approve' | 'dismiss'>('');
  const [err, setErr] = useState('');
  const shown = title.trim() + BRAND;
  const edited = title !== withoutBrand(p.title) || description !== p.description;
  async function go(what: 'approve' | 'dismiss') {
    setBusy(what);
    setErr('');
    const r = what === 'approve' ? await approve(p.id, { title, description }) : await dismiss(p.id).then(() => ({ ok: true as boolean, error: undefined as string | undefined }));
    setBusy('');
    if (!r.ok) return setErr(r.error || 'That didn’t work.');
    router.refresh();
  }
  const tId = `seo-t-${p.id}`;
  const dId = `seo-d-${p.id}`;
  return (
    <li>
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
          <span>{edited ? 'Your version' : 'Suggested'}</span>
          {admin ? (
            <>
              <label className="seo-edit" htmlFor={tId}>
                Title <small className={shown.length > TITLE_MAX ? 'bad' : ''}>{shown.length}/{TITLE_MAX} with “{BRAND.trim()}”</small>
              </label>
              <input id={tId} className="crm-input" value={title} onChange={(e) => setTitle(e.target.value)} />
              <label className="seo-edit" htmlFor={dId}>
                Description{' '}
                <small className={description.length < DESC_MIN || description.length > DESC_MAX ? 'bad' : ''}>
                  {description.length} ({DESC_MIN} to {DESC_MAX})
                </small>
              </label>
              <textarea id={dId} className="crm-input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
              <p className="seo-preview" aria-label="How it shows in Google">
                <b>{shown}</b>
                <span>{description}</span>
              </p>
            </>
          ) : (
            <>
              <p>{shown}</p>
              <p className="seo-d">{p.description}</p>
            </>
          )}
        </div>
      </div>
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
      {admin && (
        <div className="crm-actions">
          <button type="button" className="crm-btn crm-btn--solar crm-btn--small" disabled={!!busy || !title.trim() || !description.trim()} onClick={() => void go('approve')}>
            {busy === 'approve' ? 'Publishing…' : 'Approve change'}
          </button>
          <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={!!busy} onClick={() => void go('dismiss')}>
            {busy === 'dismiss' ? 'Dismissing…' : 'Dismiss'}
          </button>
          {edited && (
            <button type="button" className="crm-link" disabled={!!busy} onClick={() => { setTitle(withoutBrand(p.title)); setDescription(p.description); }}>
              Back to the suggestion
            </button>
          )}
        </div>
      )}
    </li>
  );
}
