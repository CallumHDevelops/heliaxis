'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Proposal } from '@/lib/seo/server';
import { withoutBrand } from '@/lib/seo/title';
import { approveProposal, dismissMeta, runAuditNow, runFreeChecksNow } from './actions';

/** Run the site audit or the free checks now (admins). Neither spends money. */
export function RunChecks() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const go = async (key: string, fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>) => {
    setBusy(key);
    const r = await fn();
    setBusy(null);
    setMsg(r.ok ? { ok: true, text: r.message ?? 'Started.' } : { ok: false, text: r.error });
    router.refresh();
  };
  return (
    <div className="sx-row" style={{ flexWrap: 'wrap' }}>
      <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={!!busy} onClick={() => go('audit', runAuditNow)}>
        {busy === 'audit' ? 'Starting…' : 'Run the site audit now'}
      </button>
      <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={!!busy} title="Sitemap, orphans, canonicals, schema, crawlers, llms.txt and the index check. Lighthouse is left to the monthly run." onClick={() => go('free', runFreeChecksNow)}>
        {busy === 'free' ? 'Starting…' : 'Run the free checks now'}
      </button>
      {msg && <small className={msg.ok ? 'sx-up' : 'sx-down'}>{msg.text}</small>}
    </div>
  );
}

const TITLE_MAX = 60;
const DESC_MIN = 120;
const DESC_MAX = 158;
const BRAND = ' | Heliaxis';

/** One suggested title and description: edit if you like, then approve (live on the page now) or dismiss. */
export function ProposalCard({ p, canPublish, canDraft }: { p: Proposal; canPublish: boolean; canDraft: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState(withoutBrand(p.title));
  const [description, setDescription] = useState(p.description);
  const [busy, setBusy] = useState<'' | 'approve' | 'dismiss'>('');
  const [err, setErr] = useState('');
  const shown = title.trim() + BRAND;
  const edited = title !== withoutBrand(p.title) || description !== p.description;
  const go = async (what: 'approve' | 'dismiss') => {
    setBusy(what);
    setErr('');
    const r = what === 'approve' ? await approveProposal(p.id, { title, description }) : await dismissMeta(p.id);
    setBusy('');
    if (!r.ok) return setErr(r.error);
    router.refresh();
  };
  return (
    <li style={{ display: 'grid', gap: 8, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div>
        <b>{p.path}</b> <small className="sx-note">{p.reason}</small>
      </div>
      <div className="sx-grid2">
        <div>
          <small className="sx-note">Now</small>
          <p style={{ margin: '2px 0' }}>{p.oldTitle || <i>No title</i>}</p>
          <p className="sx-note" style={{ margin: 0 }}>{p.oldDescription || <i>No description</i>}</p>
        </div>
        <div className="sx-form" style={{ gap: 6 }}>
          <small className="sx-note">{edited ? 'Your version' : 'Suggested'}</small>
          {canPublish ? (
            <>
              <label>
                <span>
                  Title <small className={shown.length > TITLE_MAX ? 'sx-down' : 'sx-note'}>{shown.length}/{TITLE_MAX} with “{BRAND.trim()}”</small>
                </span>
                <input className="crm-input" value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <label>
                <span>
                  Description <small className={description.length < DESC_MIN || description.length > DESC_MAX ? 'sx-down' : 'sx-note'}>{description.length} ({DESC_MIN} to {DESC_MAX})</small>
                </span>
                <textarea className="crm-input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
              </label>
            </>
          ) : (
            <>
              <p style={{ margin: 0 }}>{shown}</p>
              <p className="sx-note" style={{ margin: 0 }}>{p.description}</p>
            </>
          )}
        </div>
      </div>
      {err && <small className="sx-down">{err}</small>}
      {(canPublish || canDraft) && (
        <div className="sx-row">
          {canPublish && (
            <button type="button" className="crm-btn crm-btn--solar crm-btn--small" disabled={!!busy || !title.trim() || !description.trim()} onClick={() => void go('approve')}>
              {busy === 'approve' ? 'Publishing…' : 'Approve change'}
            </button>
          )}
          <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={!!busy} onClick={() => void go('dismiss')}>
            {busy === 'dismiss' ? 'Dismissing…' : 'Dismiss'}
          </button>
          {edited && canPublish && (
            <button
              type="button"
              className="crm-link"
              disabled={!!busy}
              onClick={() => {
                setTitle(withoutBrand(p.title));
                setDescription(p.description);
              }}
            >
              Back to the suggestion
            </button>
          )}
        </div>
      )}
    </li>
  );
}
