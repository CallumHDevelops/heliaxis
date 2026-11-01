'use client';

import { marked } from 'marked';
import { useMemo, useState } from 'react';
import { APPROVAL_CHECKLIST, KINDS, SECTIONS, STATUS_LABEL, type DocKind } from '@/lib/qms/types';
import type { QmsDetail } from '@/lib/qms/server';
import { Sheet } from '../crm/CrmUi';
import { WritingSpark } from '../sales/quotes/[id]/WritingSpark';
import { addComment, archiveDoc, reviewDoc, saveDoc, setCommentStatus, startRevision, submitForReview, writeWithClaudeAction, type DocPatch } from './actions';

type Tab = 'document' | 'checks' | 'comments' | 'history';
type Res = { ok: true; detail: QmsDetail } | { ok: false; error: string } | ({ ok: true; detail: QmsDetail } & { answered: number });

const render = (md: string) => marked.parse(md.replace(/</g, '&lt;'), { async: false }) as string;
const when = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function StatusChip({ status }: { status: keyof typeof STATUS_LABEL }) {
  return <span className={`qms-chip qms-chip--${status}`}>{STATUS_LABEL[status]}</span>;
}

/**
 * One controlled document: its text, the checker's results, the comments (which Claude answers) and its history,
 * with the approver's panel underneath. Every change comes back as the whole document (QmsDetail), so the checks,
 * the comment counts and the buttons always agree with the database.
 */
export function DocSheet({ initial, admin, onClose, onChanged }: { initial: QmsDetail; admin: boolean; onClose: () => void; onChanged: (d: QmsDetail) => void }) {
  const [d, setD] = useState(initial);
  const [tab, setTab] = useState<Tab>('document');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [text, setText] = useState(initial.doc.body_md ?? '');
  const [meta, setMeta] = useState({ title: initial.doc.title, ref: initial.doc.ref, kind: initial.doc.kind, section: initial.doc.section ?? '', owner: initial.doc.owner ?? '', summary: initial.doc.summary ?? '', source_url: initial.doc.source_url ?? '', revision_date: initial.doc.revision_date ?? '', review_months: String(initial.doc.review_months) });
  const [preview, setPreview] = useState(false);
  const [comment, setComment] = useState('');
  const [quote, setQuote] = useState('');
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const [reviewNote, setReviewNote] = useState('');
  const [revNote, setRevNote] = useState('');
  const { doc } = d;
  const locked = doc.status === 'approved';
  const isExternal = doc.kind === 'external';
  const dirty = text !== (doc.body_md ?? '') || meta.title !== doc.title || meta.ref !== doc.ref || meta.kind !== doc.kind || meta.section !== (doc.section ?? '') || meta.owner !== (doc.owner ?? '') || meta.summary !== (doc.summary ?? '') || meta.source_url !== (doc.source_url ?? '') || meta.revision_date !== (doc.revision_date ?? '') || meta.review_months !== String(doc.review_months);
  const html = useMemo(() => (preview ? render(text) : ''), [preview, text]);

  const apply = (r: Res) => {
    if (!r.ok) return setErr(r.error);
    setErr('');
    setD(r.detail);
    setText(r.detail.doc.body_md ?? '');
    setMeta({ title: r.detail.doc.title, ref: r.detail.doc.ref, kind: r.detail.doc.kind, section: r.detail.doc.section ?? '', owner: r.detail.doc.owner ?? '', summary: r.detail.doc.summary ?? '', source_url: r.detail.doc.source_url ?? '', revision_date: r.detail.doc.revision_date ?? '', review_months: String(r.detail.doc.review_months) });
    onChanged(r.detail);
  };
  const run = async (key: string, fn: () => Promise<Res>) => {
    setBusy(key);
    setErr('');
    try {
      apply(await fn());
    } finally {
      setBusy('');
    }
  };

  const patch = (): DocPatch => {
    const p: DocPatch = {};
    if (meta.title !== doc.title) p.title = meta.title;
    if (meta.ref !== doc.ref) p.ref = meta.ref;
    if (meta.kind !== doc.kind) p.kind = meta.kind as DocKind;
    if (meta.section !== (doc.section ?? '')) p.section = meta.section || null;
    if (meta.owner !== (doc.owner ?? '')) p.owner = meta.owner;
    if (meta.summary !== (doc.summary ?? '')) p.summary = meta.summary;
    if (meta.source_url !== (doc.source_url ?? '')) p.source_url = meta.source_url;
    if (meta.revision_date !== (doc.revision_date ?? '')) p.revision_date = meta.revision_date || null;
    if (meta.review_months !== String(doc.review_months)) p.review_months = Number(meta.review_months);
    if (text !== (doc.body_md ?? '')) p.body_md = text;
    return p;
  };

  const openCount = d.comments.filter((c) => c.status === 'open').length;
  const fails = d.checks.filter((c) => c.status === 'fail').length;
  const warns = d.checks.filter((c) => c.status === 'warn').length;
  const need = APPROVAL_CHECKLIST[doc.kind];
  const allTicked = need.every((c) => ticks[c.key]);
  const sections = SECTIONS[meta.kind as DocKind] ?? [];
  const thinking = busy === 'claude';

  return (
    <Sheet
      wide
      onClose={() => {
        if (!dirty || window.confirm('You have unsaved changes. Close without saving?')) onClose();
      }}
      title={`${doc.ref} · ${doc.title}`}
    >
      <div className="qms-sheet">
        <div className="qms-sheet__head">
          <StatusChip status={doc.status} />
          <span className="qms-muted">Revision {doc.revision}{doc.revision_date ? ` · ${doc.revision_date}` : ''}</span>
          {doc.approved_by && doc.status === 'approved' && <span className="qms-muted">Approved by {doc.approved_by}, {doc.approved_at ? when(doc.approved_at) : ''}</span>}
          <span className="qms-spacer" />
          <span className={`qms-score${fails ? ' is-fail' : warns ? ' is-warn' : ' is-ok'}`}>{fails ? `${fails} to fix` : warns ? `${warns} to look at` : 'All checks clear'}</span>
        </div>

        <div className="qms-tabs" role="tablist">
          {([['document', 'Document'], ['checks', `Checks${fails ? ` (${fails})` : ''}`], ['comments', `Comments${openCount ? ` (${openCount})` : ''}`], ['history', 'History']] as [Tab, string][]).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>

        {err && <p className="qms-err" role="alert">{err}</p>}

        {tab === 'document' && (
          <div className="qms-pane">
            <div className="crm-grid2">
              <div>
                <label className="crm-label" htmlFor="qms-ref">Reference</label>
                <input id="qms-ref" className="crm-input" value={meta.ref} onChange={(e) => setMeta({ ...meta, ref: e.target.value.toUpperCase() })} />
              </div>
              <div>
                <label className="crm-label" htmlFor="qms-kind">Filed under</label>
                <select id="qms-kind" className="crm-input" value={meta.kind} onChange={(e) => setMeta({ ...meta, kind: e.target.value as DocKind, section: '' })}>
                  {KINDS.map((k) => <option key={k.key} value={k.key}>{k.plural}</option>)}
                </select>
              </div>
            </div>
            <label className="crm-label" htmlFor="qms-title">Title</label>
            <input id="qms-title" className="crm-input" value={meta.title} disabled={locked} onChange={(e) => setMeta({ ...meta, title: e.target.value })} />
            <div className="crm-grid2">
              <div>
                <label className="crm-label" htmlFor="qms-owner">Looked after by</label>
                <input id="qms-owner" className="crm-input" value={meta.owner} onChange={(e) => setMeta({ ...meta, owner: e.target.value })} />
              </div>
              {sections.length > 0 && (
                <div>
                  <label className="crm-label" htmlFor="qms-sec">Section</label>
                  <select id="qms-sec" className="crm-input" value={meta.section} onChange={(e) => setMeta({ ...meta, section: e.target.value })}>
                    <option value="">Pick one…</option>
                    {sections.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="crm-grid2">
              <div>
                <label className="crm-label" htmlFor="qms-date">Revision date</label>
                <input id="qms-date" type="date" className="crm-input" value={meta.revision_date} onChange={(e) => setMeta({ ...meta, revision_date: e.target.value })} />
              </div>
              <div>
                <label className="crm-label" htmlFor="qms-months">Review every (months)</label>
                <input id="qms-months" type="number" min={1} max={60} className="crm-input" value={meta.review_months} onChange={(e) => setMeta({ ...meta, review_months: e.target.value })} />
              </div>
            </div>
            <label className="crm-label" htmlFor="qms-sum">What it is for (one line)</label>
            <input id="qms-sum" className="crm-input" value={meta.summary} onChange={(e) => setMeta({ ...meta, summary: e.target.value })} />

            {isExternal ? (
              <>
                <label className="crm-label" htmlFor="qms-url">Where the current copy is (link)</label>
                <input id="qms-url" className="crm-input" inputMode="url" placeholder="https://" value={meta.source_url} disabled={locked} onChange={(e) => setMeta({ ...meta, source_url: e.target.value })} />
                {doc.source_url && <p><a className="crm-link" href={doc.source_url} target="_blank" rel="noopener noreferrer">Open the document</a></p>}
              </>
            ) : (
              <>
                <div className="qms-edit-head">
                  <label className="crm-label" htmlFor="qms-body">The document (Markdown)</label>
                  <span className="qms-spacer" />
                  <button type="button" className="crm-link" onClick={() => setPreview((p) => !p)}>{preview ? 'Edit' : 'Preview'}</button>
                </div>
                {locked && <p className="qms-muted">Approved, so the text is locked. Start a new revision to change it.</p>}
                {preview ? (
                  <div className="qms-doc" dangerouslySetInnerHTML={{ __html: html }} />
                ) : (
                  <div className="qms-bodybox">
                    <textarea id="qms-body" className="crm-input qms-body" rows={18} value={text} disabled={locked || thinking} onChange={(e) => setText(e.target.value)} placeholder="Write it here, or use Draft with Claude." />
                    {thinking && <WritingSpark label="Writing" steps={['Reading the register', 'Reading the comments', 'Writing the changes', 'Answering each comment']} stepMs={2500} />}
                  </div>
                )}
              </>
            )}

            <div className="crm-actions">
              <button type="button" className="crm-btn crm-btn--solar" disabled={!dirty || !!busy} onClick={() => run('save', () => saveDoc(doc.id, patch()))}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
              {!isExternal && admin && !locked && (
                <button type="button" className="crm-btn crm-btn--ghost" disabled={!!busy || dirty} title={dirty ? 'Save first' : ''} onClick={() => run('claude', () => writeWithClaudeAction(doc.id))}>
                  {thinking ? 'Writing…' : text.trim() ? `Revise with Claude${openCount ? ` (${openCount} comment${openCount === 1 ? '' : 's'})` : ''}` : 'Draft with Claude'}
                </button>
              )}
              {!locked && doc.status !== 'in_review' && (
                <button type="button" className="crm-btn crm-btn--ghost" disabled={!!busy || dirty} onClick={() => run('submit', () => submitForReview(doc.id))}>{busy === 'submit' ? 'Sending…' : 'Send for review'}</button>
              )}
            </div>

            {locked && (
              <div className="qms-box">
                <label className="crm-label" htmlFor="qms-revnote">New revision: what is changing?</label>
                <input id="qms-revnote" className="crm-input" value={revNote} onChange={(e) => setRevNote(e.target.value)} />
                <div className="crm-actions">
                  <button type="button" className="crm-btn crm-btn--ghost" disabled={!!busy} onClick={() => run('rev', () => startRevision(doc.id, revNote))}>{busy === 'rev' ? 'Starting…' : `Start revision ${Number.isFinite(Number(doc.revision)) ? Number(doc.revision) + 1 : 'next'}`}</button>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'checks' && (
          <div className="qms-pane">
            <ul className="qms-checks">
              {[...d.checks].sort((a, b) => ({ fail: 0, warn: 1, pass: 2 })[a.status] - ({ fail: 0, warn: 1, pass: 2 })[b.status]).map((c) => (
                <li key={c.id} className={`qms-check qms-check--${c.status}`}>
                  <span className="qms-check__mark">{c.status === 'pass' ? 'Pass' : c.status === 'warn' ? 'Look' : 'Fix'}</span>
                  <span><strong>{c.label}</strong><br /><span className="qms-muted">{c.detail}</span></span>
                </li>
              ))}
            </ul>
            <p className="qms-muted">The checker covers what a computer can tell. The approver confirms the rest by hand below.</p>
          </div>
        )}

        {tab === 'comments' && (
          <div className="qms-pane">
            {d.comments.length === 0 && <p className="qms-muted">No comments yet.</p>}
            <ul className="qms-comments">
              {d.comments.map((c) => (
                <li key={c.id} className={`qms-comment qms-comment--${c.status}`}>
                  <div className="qms-comment__top"><strong>{c.author}</strong><span className="qms-muted">{when(c.created_at)}{c.revision ? ` · rev ${c.revision}` : ''}</span><span className="qms-spacer" /><span className={`qms-chip qms-chip--c-${c.status}`}>{c.status === 'open' ? 'Open' : c.status === 'addressed' ? 'Answered' : 'Resolved'}</span></div>
                  {c.quote && <blockquote>{c.quote}</blockquote>}
                  <p>{c.body}</p>
                  {c.response && <p className="qms-reply"><strong>{c.responded_by ?? 'Reply'}:</strong> {c.response}</p>}
                  <div className="crm-actions">
                    {c.status !== 'resolved' && <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={!!busy} onClick={() => run(`c${c.id}`, () => setCommentStatus(c.id, 'resolved'))}>{c.status === 'addressed' ? 'Fixed: resolve' : 'Resolve'}</button>}
                    {c.status !== 'open' && <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={!!busy} onClick={() => run(`c${c.id}`, () => setCommentStatus(c.id, 'open'))}>{c.status === 'addressed' ? 'Not fixed: reopen' : 'Reopen'}</button>}
                  </div>
                </li>
              ))}
            </ul>
            <label className="crm-label" htmlFor="qms-quote">The passage it is about (optional)</label>
            <input id="qms-quote" className="crm-input" value={quote} onChange={(e) => setQuote(e.target.value)} />
            <label className="crm-label" htmlFor="qms-comment">Add a comment: what should change?</label>
            <textarea id="qms-comment" className="crm-input" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
            <div className="crm-actions">
              <button type="button" className="crm-btn crm-btn--solar" disabled={!comment.trim() || !!busy} onClick={() => run('comment', async () => { const r = await addComment(doc.id, comment, quote); if (r.ok) { setComment(''); setQuote(''); } return r; })}>{busy === 'comment' ? 'Adding…' : 'Add comment'}</button>
              {admin && !isExternal && !locked && openCount > 0 && <button type="button" className="crm-btn crm-btn--ghost" disabled={!!busy || dirty} onClick={() => { setTab('document'); void run('claude', () => writeWithClaudeAction(doc.id)); }}>Revise with Claude</button>}
            </div>
          </div>
        )}

        {tab === 'history' && (
          <div className="qms-pane">
            <h3 className="qms-h">Approvals</h3>
            {d.reviews.length === 0 && <p className="qms-muted">Nobody has reviewed it yet.</p>}
            <ul className="qms-hist">
              {d.reviews.map((r) => <li key={r.id}><strong>{r.decision === 'approved' ? 'Approved' : 'Changes requested'}</strong> revision {r.revision} · {r.reviewer} · {when(r.created_at)}{r.note ? ` — ${r.note}` : ''}</li>)}
            </ul>
            <h3 className="qms-h">Earlier revisions</h3>
            {d.revisions.length === 0 && <p className="qms-muted">None yet.</p>}
            <ul className="qms-hist">
              {d.revisions.map((r) => <li key={r.id}>Revision {r.revision}{r.revision_date ? ` (${r.revision_date})` : ''} · {r.created_by ?? ''} · {when(r.created_at)}{r.note ? ` — ${r.note}` : ''}</li>)}
            </ul>
          </div>
        )}

        {doc.status === 'in_review' || doc.status === 'changes_requested' || doc.status === 'draft' ? (
          admin && (
            <div className="qms-box qms-approve">
              <h3 className="qms-h">Approver</h3>
              {need.map((c) => (
                <label key={c.key} className="qms-tick"><input type="checkbox" checked={!!ticks[c.key]} onChange={(e) => setTicks({ ...ticks, [c.key]: e.target.checked })} /> {c.label}</label>
              ))}
              <label className="crm-label" htmlFor="qms-rn">Note (needed if you ask for changes: it becomes a comment)</label>
              <textarea id="qms-rn" className="crm-input" rows={2} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} />
              <div className="crm-actions">
                <button type="button" className="crm-btn crm-btn--solar" disabled={!!busy || dirty || !d.canApprove || !allTicked} title={!d.canApprove ? 'Some checks are failing' : !allTicked ? 'Tick every box' : ''} onClick={() => run('approve', () => reviewDoc(doc.id, 'approved', ticks, reviewNote))}>{busy === 'approve' ? 'Approving…' : 'Approve'}</button>
                <button type="button" className="crm-btn crm-btn--ghost" disabled={!!busy || !reviewNote.trim()} onClick={() => run('changes', async () => { const r = await reviewDoc(doc.id, 'changes_requested', ticks, reviewNote); if (r.ok) { setReviewNote(''); setTab('comments'); } return r; })}>{busy === 'changes' ? 'Sending…' : 'Request changes'}</button>
              </div>
              {!d.canApprove && <p className="qms-muted">Approval is blocked until the {fails} failing check{fails === 1 ? '' : 's'} are fixed (see Checks).</p>}
            </div>
          )
        ) : null}

        {admin && (
          <div className="qms-foot">
            <button type="button" className="crm-link" disabled={!!busy} onClick={() => run('archive', () => archiveDoc(doc.id, doc.status !== 'archived'))}>{doc.status === 'archived' ? 'Restore from the archive' : 'Move to the archive'}</button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
