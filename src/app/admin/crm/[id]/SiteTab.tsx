'use client';

import { useCallback, useState } from 'react';
import { formatPence } from '@/lib/site/money';
import type { AssignmentView, SiteTabData } from '@/lib/site/server';
import type { StripStep } from '@/lib/site/strip';
import { TRADE_LABEL, type Trade } from '@/lib/site/types';
import { useLiveRefresh } from '@/lib/use-live-refresh';
import { agoShort, shortDate } from '../crm-shared';
import { AssignmentSheet } from './AssignmentSheet';
import { send } from './record-shared';
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

  return (
    <div className="sx">
      <JobStrip steps={data.strip} />
      {error && <p className="crm-banner crm-banner--err">{error}</p>}
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
            <AssignmentCard key={a.id} a={a} now={now} busy={busy === a.id} onEdit={() => setSheet({ edit: a, trade: null })} onCancel={() => void cancel(a)} />
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
                      {a.po!.status === 'draft' ? 'Held: the office to check' : a.po!.status}
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
                    {f.text}
                    <small>{a.contact.name}</small>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
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

function AssignmentCard({ a, now, busy, onEdit, onCancel }: { a: AssignmentView; now: number; busy: boolean; onEdit: () => void; onCancel: () => void }) {
  const open = a.flags.filter((f) => !f.resolved_at);
  const signed = a.status === 'signed' || a.status === 'done';
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
        <dd>{a.money.cis}</dd>
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
      {open.length > 0 && (
        <ul className="sx-flags">
          {open.map((f) => (
            <li key={`${f.code}-${f.key}`} className={`sx-flag sx-flag--${f.severity}`}>
              {f.text}
            </li>
          ))}
        </ul>
      )}
      <div className="sx-actions">
        <button type="button" className="crm-chipbtn" onClick={onEdit} disabled={busy}>
          {signed ? 'Details' : 'Edit'}
        </button>
        {!signed && (
          <button type="button" className="crm-chipbtn" onClick={onCancel} disabled={busy}>
            Take off the job
          </button>
        )}
      </div>
    </article>
  );
}
