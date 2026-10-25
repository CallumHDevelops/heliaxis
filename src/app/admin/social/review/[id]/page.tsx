import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requirePortal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { schemaReady } from '@/lib/schema-ready';
import { AdminShell } from '@/components/admin/AdminShell';
import { addNote, approveDraft, dismissMention, markPosted, regenerateDraft } from '../../actions';
import { CopyDraft } from '../../CopyDraft';
import { ago, PLATFORM_LABEL, SEVERITY_LABEL, STATUS_LABEL, TYPE_LABEL } from '../../labels';
import '../../social.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Review · Social monitoring · Heliaxis', robots: { index: false, follow: false } };

const RULE_TEXT: Record<string, string> = {
  G1: 'Contains a banned phrase',
  G2: 'Uses an absolute or reassuring safety word',
  G3: 'Makes a claim we have not approved',
  G4: 'Mentions a price or offer',
  G5: 'Reads like an admission of fault',
  G6: 'Contains personal details',
  G7: 'Mentions a competitor',
  G8: 'Contains a link we have not approved',
  G9: 'Sounds defensive',
  G10: 'Does not end with a next step',
  G11: 'Too long',
  G12: 'Copies the comment back',
  G13: 'Has an emoji where it should not',
  G14: 'US spelling',
};

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePortal('social_monitoring');
  if (!session) redirect('/admin');
  const ready = await schemaReady();
  if (!ready.social) redirect('/admin/social');
  const { id } = await params;
  const isAdmin = session.profile.role === 'admin';
  const db = createAdminClient();

  const { data: m } = await db.from('social_mention').select('*').eq('id', id).maybeSingle();
  if (!m) notFound();
  const [{ data: cls }, { data: draft }, { data: notes }, { data: parent }] = await Promise.all([
    db.from('social_classification').select('*').eq('mention_id', id).order('id', { ascending: false }).limit(1).maybeSingle(),
    db.from('social_draft').select('*').eq('mention_id', id).not('status', 'in', '(superseded)').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('social_note').select('id, text, created_at').eq('mention_id', id).order('created_at', { ascending: true }),
    m.parent_id ? db.from('social_mention').select('text, author_display_name, author_is_own').eq('id', m.parent_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const closed = m.status === 'posted' || m.status === 'dismissed';
  const sev = (m.severity ?? 'medium') as string;
  const failures = ((draft?.guardrail_result as { failures?: { rule: string; detail: string }[] } | null)?.failures ?? []) as { rule: string; detail: string }[];
  const needsApproval = !!draft?.requires_approval && draft.status === 'ready';
  const canCopy = !!draft && !!draft.guardrail_pass && !!draft.text && (!draft.requires_approval || draft.status === 'approved' || draft.status === 'copied');
  const why = !draft?.guardrail_pass ? 'This reply has not passed the checks.' : needsApproval ? (isAdmin ? 'Approve it first.' : 'An admin needs to approve this reply first.') : undefined;

  return (
    <AdminShell active="social">
      <div className="sm-page">
        <p className="sm-back">
          <Link href="/admin/social">← Inbox</Link>
        </p>

        <header className="sm-review-head">
          <span className={`sm-sev is-${sev}`}>{SEVERITY_LABEL[sev]}</span>
          {cls?.safety_related && <span className="sm-tag is-safety">Safety</span>}
          {m.comment_type && <span className="sm-tag">{TYPE_LABEL[m.comment_type]}</span>}
          <span className="sm-sub">
            {PLATFORM_LABEL[m.platform]} {m.kind} · {m.author_display_name ?? 'Unknown'} · {ago(m.created_at)} · {STATUS_LABEL[m.status]}
            {m.removed_at_source ? ' · removed at source' : ''}
          </span>
          {m.comment_permalink && (
            <a href={m.comment_permalink} target="_blank" rel="noopener noreferrer" className="sm-link">
              Open on {PLATFORM_LABEL[m.platform]} ↗
            </a>
          )}
        </header>

        <div className="sm-grid">
          <section className="sm-card">
            <h2>The comment</h2>
            {parent && (
              <p className="sm-parent">
                In reply to {parent.author_is_own ? 'Heliaxis' : (parent.author_display_name ?? 'someone')}: “{parent.text.slice(0, 200)}”
              </p>
            )}
            <blockquote className="sm-quote">{m.text || '(no text)'}</blockquote>
            {m.version > 1 && <p className="sm-sub">Edited {m.version - 1} time{m.version > 2 ? 's' : ''}. Showing the latest text.</p>}
            {cls && (
              <dl className="sm-facts">
                <dt>Why</dt>
                <dd>{cls.reason ?? (cls.model_status === 'ok' ? '—' : 'The AI check has not finished. The keyword check has already run.')}</dd>
                {cls.topics?.length > 0 && (
                  <>
                    <dt>Topics</dt>
                    <dd>{(cls.topics as string[]).join(', ')}</dd>
                  </>
                )}
                {cls.keyword_severity && (
                  <>
                    <dt>Keywords</dt>
                    <dd>Matched a {cls.keyword_severity} keyword</dd>
                  </>
                )}
                {cls.injection_suspected && (
                  <>
                    <dt>Careful</dt>
                    <dd>This comment looks like it is trying to instruct the system. It was classified on its real content.</dd>
                  </>
                )}
              </dl>
            )}
          </section>

          <section className="sm-card">
            <h2>Suggested reply</h2>
            {!draft ? (
              <p className="sm-sub">No draft yet. One is made automatically a minute or so after the comment arrives.</p>
            ) : draft.status === 'no_script' ? (
              <p className="sm-sub">No approved script fits this one. Reply by hand if it needs an answer.</p>
            ) : (
              <>
                <pre className="sm-draft">{draft.text}</pre>
                {draft.reviewer_note && <p className="sm-note">Check before posting: {draft.reviewer_note}</p>}
                {failures.length > 0 && (
                  <ul className="sm-fails">
                    {failures.map((f, i) => (
                      <li key={i}>
                        {RULE_TEXT[f.rule] ?? f.rule}: {f.detail}
                      </li>
                    ))}
                  </ul>
                )}
                {draft.requires_approval && (
                  <p className="sm-sub">{draft.status === 'approved' || draft.status === 'copied' ? 'Approved by an admin.' : 'This reply needs an admin to approve it before it can be copied.'}</p>
                )}
                {!closed && (
                  <div className="sm-actions">
                    {needsApproval && isAdmin && draft.guardrail_pass && (
                      <form action={approveDraft}>
                        <input type="hidden" name="id" value={draft.id} />
                        <button className="sm-btn is-primary">Approve this reply</button>
                      </form>
                    )}
                    <CopyDraft draftId={draft.id} text={draft.text ?? ''} disabled={!canCopy} why={why} />
                  </div>
                )}
              </>
            )}
            {!closed && (
              <form action={regenerateDraft} className="sm-inline">
                <input type="hidden" name="mentionId" value={m.id} />
                <button className="sm-btn">Make a new draft</button>
              </form>
            )}
          </section>
        </div>

        {!closed && (
          <section className="sm-card">
            <h2>When you are done</h2>
            <div className="sm-actions">
              <form action={markPosted} className="sm-inline">
                <input type="hidden" name="mentionId" value={m.id} />
                <input name="link" placeholder="Link to your reply (optional)" className="sm-input" />
                <button className="sm-btn is-primary">I have posted it</button>
              </form>
              {(isAdmin || sev !== 'critical') && (
                <form action={dismissMention} className="sm-inline">
                  <input type="hidden" name="mentionId" value={m.id} />
                  <input name="reason" placeholder="Why no reply is needed" className="sm-input" />
                  <button className="sm-btn">No reply needed</button>
                </form>
              )}
            </div>
            {sev === 'critical' && !isAdmin && <p className="sm-sub">Only an admin can dismiss a Critical comment.</p>}
          </section>
        )}

        <section className="sm-card">
          <h2>Notes</h2>
          {(notes ?? []).length === 0 ? <p className="sm-sub">No notes yet.</p> : <ul className="sm-notes">{(notes ?? []).map((n) => <li key={n.id}>{n.text} <small>{ago(n.created_at)}</small></li>)}</ul>}
          <form action={addNote} className="sm-inline">
            <input type="hidden" name="mentionId" value={m.id} />
            <input name="text" placeholder="Add a note" className="sm-input" required />
            <button className="sm-btn">Add note</button>
          </form>
        </section>
      </div>
    </AdminShell>
  );
}
