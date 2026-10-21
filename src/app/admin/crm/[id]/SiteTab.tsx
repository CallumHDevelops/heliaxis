'use client';

import { useCallback, useState } from 'react';
import { KIND_LABEL, sendTimeWords, type MessageKind } from '@/lib/site/messages';
import { formatPence } from '@/lib/site/money';
import type { SendResult } from '@/lib/site/send';
import { HELD_WORDS, OVERRIDABLE } from '@/lib/site/po-shared';
import type { AssignmentView, PoView, SiteMessageView, SiteTabData } from '@/lib/site/server';
import type { StripStep } from '@/lib/site/strip';
import { TRADE_LABEL, type Trade } from '@/lib/site/types';
import { useLiveRefresh } from '@/lib/use-live-refresh';
import { agoShort, shortDate } from '../crm-shared';
import { AssignmentSheet } from './AssignmentSheet';
import { ReviewDrawer } from './ReviewDrawer';
import { SiteEic } from './SiteEic';
import { copyText, send } from './record-shared';
import { ElectricianExtras } from './SiteElectrician';
import './site.css';

/**
 * The job record's Site tab (screen D2): the job strip across the top (Scaffold up ✓ → Roof ✓ →
 * Electrics → Handover), one card per trade on the job (person, status, rate, VAT, CIS, the PO
 * preview, photos, flags, PO) with its actions, and on the right the job's labour POs, open flags
 * and Add a trade. Reads /api/crm/projects/{id}/site, live while the tab is open.
 */
export function SiteTab({ projectId, now, onChanged }: { projectId: string; now: number; onChanged: () => void }) {
  const [data, setData] = useState<SiteTabData | null>(null);
  const [error, setError] = useState('');
  const [sheet, setSheet] = useState<{ edit: AssignmentView | null; trade: Trade | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [reviewing, setReviewing] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/crm/projects/${projectId}/site`, { cache: 'no-store' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Couldn’t load the trades on this job.');
      setData(d as SiteTabData);
      setError('');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t load the trades on this job.');
      return false;
    }
  }, [projectId]);
  const { reload } = useLiveRefresh(load, 30_000);

  const changed = (d: SiteTabData) => {
    setData(d);
    onChanged();
  };

  /** Send (by email, WhatsApp or both), copy the link, or open WhatsApp on this phone with the words. */
  async function message(a: AssignmentView, opts: { via: 'email' | 'whatsapp' | 'both' | 'link'; kind?: MessageKind; rotate?: boolean; chat?: boolean }) {
    // A window opened straight from the tap (a phone blocks one opened after the network round trip).
    const win = opts.chat ? window.open('about:blank', '_blank') : null;
    setBusy(a.id);
    setError('');
    try {
      const r = await send<SendResult & { data: SiteTabData }>(`/api/crm/site-assignments/${a.id}/send`, 'POST', { via: opts.via, kind: opts.kind ?? 'job_pack', rotate: !!opts.rotate });
      changed(r.data);
      if (opts.chat) {
        if (r.waHref && win) win.location.href = r.waHref;
        else win?.close();
        if (!r.waHref) setNotice(`${a.contact.name} has no mobile to WhatsApp.`);
      } else if (opts.via === 'link') {
        await copyText(r.link);
        setNotice(opts.rotate ? 'New link copied. The old one has stopped working.' : 'Link copied.');
      } else {
        const queued = r.messages.filter((m) => m.status === 'queued');
        const sent = r.messages.filter((m) => m.status === 'sent');
        setNotice(
          [
            sent.length ? `Sent by ${[...new Set(sent.map((m) => (m.channel === 'email' ? 'email' : 'WhatsApp')))].join(' and ')}.` : '',
            queued.length ? `Waiting to send at ${sendTimeWords(queued[0].send_after)}.` : '',
            !r.messages.length ? 'Nothing new to send: it went already.' : '',
            ...r.notes,
          ]
            .filter(Boolean)
            .join(' ')
        );
      }
    } catch (e) {
      win?.close();
      setError(e instanceof Error ? e.message : 'Not sent. Try again.');
    }
    setBusy(null);
  }

  /** Issue the PO (a held one, or again after a change). `override`: past the owner's own holds. */
  async function issuePo(a: AssignmentView, override = false) {
    const po = a.po;
    if (!po) return;
    const again = po.version > 0;
    if (again && !window.confirm(`Issue ${po.po_number} again to ${a.contact.name}? It says it replaces the version sent on ${po.issued ? shortDate(po.issued) : 'before'}.`)) return;
    setBusy(a.id);
    setError('');
    try {
      const r = await send<{ ok: true; po: { po_number: string }; data: SiteTabData }>(`/api/crm/site-assignments/${a.id}/issue-po`, 'POST', { override });
      changed(r.data);
      const queued = r.data.assignments.find((x) => x.id === a.id)?.messages.find((m) => m.kind === 'po' && m.status === 'queued');
      setNotice(`${r.po.po_number} ${again ? 'issued again' : 'issued'}.${queued ? ` It goes to ${a.contact.name.split(/\s+/)[0]} at ${sendTimeWords(queued.send_after)}.` : ''}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Not issued. Try again.');
    }
    setBusy(null);
  }

  async function reopen(a: AssignmentView) {
    if (!window.confirm(`Reopen ${a.contact.name}’s sign-off? They can change their answers and sign again from the same link. The PO stays; if the money changes you can issue it again.`)) return;
    setBusy(a.id);
    setError('');
    try {
      const r = await send<{ ok: true; data: SiteTabData }>(`/api/crm/site-assignments/${a.id}/reopen`, 'POST', {});
      changed(r.data);
      setNotice(`Reopened. ${a.contact.name.split(/\s+/)[0]} can sign again.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Not reopened. Try again.');
    }
    setBusy(null);
  }

  async function cancel(a: AssignmentView) {
    if (!window.confirm(`Take ${a.contact.name} (${a.title.toLowerCase()}) off this job? Their link stops working straight away.`)) return;
    setBusy(a.id);
    try {
      changed(await send<SiteTabData>(`/api/crm/site-assignments/${a.id}`, 'DELETE', {}));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Not done. Try again.');
    }
    setBusy(null);
  }

  if (!data) return <p className={error ? 'crm-banner crm-banner--err' : 'crm-muted'}>{error || 'Loading…'}</p>;
  const live = data.assignments.filter((a) => a.status !== 'cancelled');
  const gone = data.assignments.filter((a) => a.status === 'cancelled');
  const flags = live.flatMap((a) => a.flags.filter((f) => !f.resolved_at).map((f) => ({ a, f })));
  const pos = live.filter((a) => a.po);
  // The scaffold once it's up: tagged (the roofer and electrician can be told to start) or not. "Not
  // tagged" counts as soon as the scaffolder says so, before the sign-off, so the hold can go at once.
  const up = live.find((a) => a.trade === 'scaffolder' && (a.status === 'signed' || a.status === 'done' || a.tagged === false));
  const scaffold: 'tagged' | 'untagged' | null = up ? (up.tagged === false ? 'untagged' : 'tagged') : null;

  return (
    <div className="sx">
      <JobStrip steps={data.strip} />
      {error && <p className="crm-banner crm-banner--err">{error}</p>}
      {notice && (
        <p className="crm-banner" role="status">
          {notice}{' '}
          <button type="button" className="crm-link" onClick={() => setNotice('')}>
            OK
          </button>
        </p>
      )}
      <div className="sx-cols">
        <div className="sx-main">
          {live.length === 0 && (
            <div className="sx-empty">
              <p>
                <b>No trades on this job yet.</b> Add the scaffolder, roofer and electrician with their agreed rates. Each gets a job pack on their phone, signs off
                when they’re done, and their PO is raised by itself.
              </p>
            </div>
          )}
          {live.map((a) => (
            <AssignmentCard
              key={a.id}
              a={a}
              now={now}
              busy={busy === a.id}
              scaffold={scaffold}
              onEdit={() => setSheet({ edit: a, trade: null })}
              onCancel={() => void cancel(a)}
              onMessage={(o) => void message(a, o)}
              onIssue={(override) => void issuePo(a, override)}
              onReopen={() => void reopen(a)}
              onReview={() => setReviewing(a.id)}
              onHoldAll={() => {
                for (const t of live.filter((x) => (x.trade === 'roofer' || x.trade === 'electrician') && x.status !== 'signed' && x.status !== 'done')) void message(t, { via: 'both', kind: 'scaffold_hold' });
              }}
            >
              {a.trade === 'electrician' && a.status !== 'draft' && <SiteEic assignmentId={a.id} projectId={projectId} onChanged={onChanged} />}
            </AssignmentCard>
          ))}
          {gone.length > 0 && (
            <details className="sx-gone">
              <summary>
                {gone.length} taken off the job
              </summary>
              <ul>
                {gone.map((a) => (
                  <li key={a.id}>
                    {a.contact.name} · {a.title}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <aside className="sx-side">
          <section className="sx-panel">
            <h4>Add a trade</h4>
            <div className="sx-addrow">
              {data.suggested.map((t) => (
                <button key={t} type="button" className="crm-btn crm-btn--solar crm-btn--small" onClick={() => setSheet({ edit: null, trade: t })}>
                  + {TRADE_LABEL[t]}
                </button>
              ))}
              <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => setSheet({ edit: null, trade: data.suggested[0] ?? 'electrician' })}>
                + Add a trade
              </button>
            </div>
          </section>
          <section className="sx-panel">
            <h4>Labour POs</h4>
            {pos.length === 0 ? (
              <p className="crm-muted crm-small">Raised when each trade signs off.</p>
            ) : (
              <ul className="sx-list">
                {pos.map((a) => (
                  <li key={a.id}>
                    <b>{a.po!.po_number}</b> {a.contact.name}
                    <small>
                      {poWords(a.po!)}
                      {a.po!.payable_pence != null ? ` · ${formatPence(a.po!.payable_pence)} to pay` : ''}
                    </small>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="sx-panel">
            <h4>Open flags</h4>
            {flags.length === 0 ? (
              <p className="crm-muted crm-small">Nothing flagged.</p>
            ) : (
              <ul className="sx-list">
                {flags.map(({ a, f }) => (
                  <li key={`${a.id}-${f.code}-${f.key}`} className={`sx-flag sx-flag--${f.severity}`}>
                    <button type="button" className="sx-flaglink" onClick={() => setReviewing(a.id)}>
                      {f.text}
                      <small>{a.contact.name} · Review</small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
      {reviewing && data.assignments.some((x) => x.id === reviewing) && (
        <ReviewDrawer
          a={data.assignments.find((x) => x.id === reviewing)!}
          onClose={() => setReviewing(null)}
          onChanged={changed}
          onIssue={(override) => void issuePo(data.assignments.find((x) => x.id === reviewing)!, override)}
          onReopen={() => void reopen(data.assignments.find((x) => x.id === reviewing)!)}
        />
      )}
      {sheet && (
        <AssignmentSheet
          data={data}
          existing={sheet.edit}
          preset={sheet.trade}
          onClose={() => setSheet(null)}
          onSaved={(d) => {
            changed(d);
            void reload();
          }}
        />
      )}
    </div>
  );
}

/** A labour PO's state for the office: "Held: Add the agreed rate…", "Issued 3 Nov", "Changed since it was sent". */
function poWords(po: PoView): string {
  if (po.status === 'draft') return po.held.length ? `Held: ${po.held.map((h) => HELD_WORDS[h]).join('. ')}` : po.version ? 'Issued, waiting to send' : 'Being issued';
  if (po.changed_since_sent) return 'Changed since it was sent: issue it again';
  return `${po.status === 'sent' ? 'Issued' : po.status[0].toUpperCase() + po.status.slice(1)}${po.issued ? ` ${shortDate(po.issued)}` : ''}${po.sent_at ? '' : ' (not delivered yet)'}`;
}

/** Scaffold up ✓ → Roof ✓ → Electrics in progress → Handover. */
export function JobStrip({ steps }: { steps: StripStep[] }) {
  return (
    <ol className="sx-strip" aria-label="Who has done what">
      {steps.map((s) => (
        <li key={s.key} className={`is-${s.state}`}>
          {s.label}
        </li>
      ))}
    </ol>
  );
}

/** "Emailed 10:42", "WhatsApp waiting to send at 07:00", "Email didn't go: …" for the latest of each. */
function messageWords(list: SiteMessageView[]): { text: string; bad: boolean }[] {
  const seen = new Set<string>();
  const out: { text: string; bad: boolean }[] = [];
  for (const m of list) {
    const k = `${m.kind}:${m.channel}`;
    if (seen.has(k) || m.status === 'cancelled') continue;
    seen.add(k);
    const how = m.channel === 'email' ? 'email' : 'WhatsApp';
    const what = KIND_LABEL[m.kind as MessageKind] ?? m.kind;
    if (m.status === 'queued') out.push({ text: `${what} by ${how}: waiting to send at ${sendTimeWords(m.send_after)}`, bad: false });
    else if (m.status === 'sent') out.push({ text: `${what} sent by ${how} ${m.sent_at ? sendTimeWords(m.sent_at) : ''}`.trim(), bad: false });
    else if (m.status === 'failed') out.push({ text: `${what} by ${how} didn’t go: ${m.error ?? 'try again'}`, bad: true });
  }
  return out.slice(0, 4);
}

function AssignmentCard({
  a,
  now,
  busy,
  scaffold,
  onEdit,
  onCancel,
  onMessage,
  onHoldAll,
  onIssue,
  onReopen,
  onReview,
  children,
}: {
  a: AssignmentView;
  now: number;
  busy: boolean;
  scaffold: 'tagged' | 'untagged' | null;
  onEdit: () => void;
  onCancel: () => void;
  onMessage: (o: { via: 'email' | 'whatsapp' | 'both' | 'link'; kind?: MessageKind; rotate?: boolean; chat?: boolean }) => void;
  onHoldAll: () => void;
  onIssue: (override: boolean) => void;
  onReopen: () => void;
  onReview: () => void;
  /** More for this trade (the electrician's certificate). */
  children?: React.ReactNode;
}) {
  const open = a.flags.filter((f) => !f.resolved_at);
  const signed = a.status === 'signed' || a.status === 'done';
  const msgs = messageWords(a.messages);
  const working = !signed && (a.trade === 'roofer' || a.trade === 'electrician');
  const first = a.contact.name.split(/\s+/)[0];
  return (
    <article className={`sx-card sx-card--${a.status}`} aria-label={`${a.title}: ${a.contact.name}`}>
      <header>
        <div>
          <span className="sx-trade">{a.title}</span>
          <h4>{a.contact.name}</h4>
          <small>{[a.contact.company, a.contact.mobile, a.contact.whatsapp_ok ? 'WhatsApp OK' : null].filter(Boolean).join(' · ')}</small>
        </div>
        <span className={`sx-pill sx-pill--${a.status}`}>{a.status_label}</span>
      </header>
      <dl className="sx-facts">
        {a.scope && (
          <>
            <dt>Work</dt>
            <dd>{a.scope}</dd>
          </>
        )}
        {(a.starts_on || a.days) && (
          <>
            <dt>When</dt>
            <dd>{[a.starts_on ? shortDate(a.starts_on) : null, a.days ? `${a.days} day${a.days === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ')}</dd>
          </>
        )}
        <dt>Rate</dt>
        <dd>{a.money.rate ? [a.money.rate, a.money.qty].filter(Boolean).join(' · ') : <span className="sx-warnline">{a.money.missing ?? 'No rate yet'}</span>}</dd>
        <dt>VAT</dt>
        <dd>{a.money.vat}</dd>
        <dt>CIS</dt>
        <dd>{a.money.cis.replace(/^CIS: /, '')}</dd>
      </dl>
      {a.money.preview && <p className="sx-preview">{a.money.preview}</p>}
      {a.forms_missing.length > 0 && (
        <p className="crm-banner">
          This job now includes more technologies. Add their checks to the electrician’s paperwork? <button type="button" className="crm-link" onClick={onEdit}>Choose</button>
        </p>
      )}
      <p className="sx-meta">
        {[
          a.last_synced ? `Last synced ${agoShort(a.last_synced, now)}` : null,
          a.photos ? `${a.photos} photo${a.photos === 1 ? '' : 's'}` : null,
          a.po ? `${a.po.po_number}${a.po.payable_pence != null ? ` · ${formatPence(a.po.payable_pence)} to pay` : ''}` : null,
          a.signed_at ? `Signed off ${agoShort(a.signed_at, now)}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {a.po && <PoLine po={a.po} busy={busy} onIssue={onIssue} />}
      {children}
      {open.length > 0 && (
        <ul className="sx-flags">
          {open.map((f) => (
            <li key={`${f.code}-${f.key}`} className={`sx-flag sx-flag--${f.severity}`}>
              {f.text}
            </li>
          ))}
        </ul>
      )}
      {msgs.length > 0 && (
        <ul className="sx-msgs">
          {msgs.map((m) => (
            <li key={m.text} className={m.bad ? 'is-bad' : undefined}>
              {m.text}
            </li>
          ))}
        </ul>
      )}
      {a.link.phones > 0 && <p className="sx-meta">{a.link.phones === 1 ? '1 phone has opened this link' : `${a.link.phones} phones opened this link`}</p>}
      <ElectricianExtras a={a} onEdit={onEdit} />
      {working && scaffold === 'tagged' && (
        <button type="button" className="crm-btn crm-btn--ghost crm-btn--small sx-tell" disabled={busy} onClick={() => onMessage({ via: 'both', kind: 'clear_to_start' })}>
          Tell {first} ({a.title.toLowerCase()}) they’re clear to start
        </button>
      )}
      {a.trade === 'scaffolder' && scaffold === 'untagged' && (
        <button type="button" className="crm-btn crm-btn--ghost crm-btn--small sx-tell" disabled={busy} onClick={onHoldAll}>
          Tell the roofer and electrician not to use it
        </button>
      )}
      <div className="sx-actions">
        {!signed && (
          <>
            <button type="button" className="crm-btn crm-btn--solar crm-btn--small" disabled={busy} onClick={() => onMessage({ via: 'both' })}>
              {a.sent_at ? 'Send the job pack again' : 'Send the job pack'}
            </button>
            <button type="button" className="crm-chipbtn" disabled={busy} onClick={() => onMessage({ via: 'link' })}>
              Copy link
            </button>
            <button type="button" className="crm-chipbtn" disabled={busy || !a.contact.wa_id} onClick={() => onMessage({ via: 'link', chat: true })}>
              WhatsApp from my phone
            </button>
          </>
        )}
        {(a.sent_at || a.photos > 0 || signed) && (
          <button type="button" className={signed || open.length ? 'crm-btn crm-btn--small' : 'crm-chipbtn'} onClick={onReview} disabled={busy}>
            Review{open.length ? ` (${open.length} flag${open.length === 1 ? '' : 's'})` : ''}
          </button>
        )}
        <button type="button" className="crm-chipbtn" onClick={onEdit} disabled={busy}>
          {signed ? 'Details' : 'Edit'}
        </button>
        {!signed && a.link.generation > 0 && (
          <button
            type="button"
            className="crm-chipbtn"
            disabled={busy}
            onClick={() => {
              if (window.confirm('Make a new link? The old one stops working straight away, on every phone that has it.')) onMessage({ via: 'link', rotate: true });
            }}
          >
            New link
          </button>
        )}
        {signed && (
          <button type="button" className="crm-chipbtn" onClick={onReopen} disabled={busy}>
            Reopen sign-off
          </button>
        )}
        {!signed && (
          <button type="button" className="crm-chipbtn" onClick={onCancel} disabled={busy}>
            Take off the job
          </button>
        )}
      </div>
    </article>
  );
}

/**
 * The PO on a trade's card: held (what it needs, and Issue once only the owner's own holds are left:
 * "Issue anyway"), being issued, changed since it was sent (Issue again), or issued.
 */
function PoLine({ po, busy, onIssue }: { po: PoView; busy: boolean; onIssue: (override: boolean) => void }) {
  const blocking = po.held.filter((h) => !OVERRIDABLE.includes(h));
  const own = po.held.filter((h) => OVERRIDABLE.includes(h));
  const draft = po.status === 'draft';
  return (
    <div className={`sx-po${draft && po.held.length ? ' is-held' : ''}`}>
      <p>
        <b>{po.po_number}</b> · {poWords(po)}
      </p>
      {draft && !blocking.length && (
        <button type="button" className="crm-btn crm-btn--solar crm-btn--small" disabled={busy} onClick={() => onIssue(own.length > 0)}>
          {own.length ? 'Issue anyway' : 'Issue PO'}
        </button>
      )}
      {!draft && po.status !== 'cancelled' && (
        <button type="button" className={`crm-btn crm-btn--small ${po.changed_since_sent ? 'crm-btn--solar' : 'crm-btn--ghost'}`} disabled={busy} onClick={() => onIssue(true)}>
          Issue again
        </button>
      )}
    </div>
  );
}
