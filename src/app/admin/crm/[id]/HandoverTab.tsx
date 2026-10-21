'use client';

import { Battery, Check, CircleAlert, Clock, Fan, Minus, Plug, RefreshCw, Sun } from 'lucide-react';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import type { HandoverView, ViewDoc } from '@/lib/handover/server';
import { GROUPS, SITE_SLOTS, STATE_LABEL, TECH_LABEL, type Fix, type SlotCode, type SlotView, type State, type Tech } from '@/lib/handover/slots';
import { hasPrintVersion, PRINT_LABEL, PRINT_TITLE, printHref } from '@/lib/documents/print-shared';
import { useLiveRefresh } from '@/lib/use-live-refresh';
import { shortDate, ukDayOf, ukTime } from '../crm-shared';
import { useMedia } from '../use-stored';
import { CopySheet, InvoiceSheet, LibrarySheet, NotNeededSheet, OutstandingSheet, SendSheet, SignDesignSheet, UploadSheet, ValuesSheet } from './HandoverSheets';
import { PlainSheet } from './RecordSheets';
import { send, type Tab } from './record-shared';
import './handover.css';

/**
 * The job record's Handover tab (screen D6): everything the customer's handover pack needs, as the
 * owner's compliance system lists it, with each item's state (Complete, Missing, Waiting, Not
 * needed, Out of date) and what's needed next in plain words. At the top: the headline, the target,
 * Build handover pack, Send to customer and + Add a document (straight into their portal, ask [8]).
 * After it's sent, the final invoice. On a phone each item is a two-line card; tapping it opens its
 * actions. Reads /api/crm/projects/{id}/handover, live while the tab is open, and asks the server to
 * catch up (make documents, attach manuals, rebuild) whenever it's behind.
 */

type Sheet =
  | null
  | { kind: 'row'; code: SlotCode }
  | { kind: 'upload'; slot: SlotCode | null; replace?: ViewDoc | null }
  | { kind: 'na'; code: SlotCode }
  | { kind: 'sign' }
  | { kind: 'values'; slot: 'F49A' | 'CC4' | 'F78' | 'F47' }
  | { kind: 'outstanding' }
  | { kind: 'mid' }
  | { kind: 'bc' }
  | { kind: 'send' }
  | { kind: 'invoice' }
  | { kind: 'library'; model: string };

const ICON: Record<State, ReactNode> = {
  complete: <Check size={16} strokeWidth={3} aria-hidden="true" />,
  missing: <CircleAlert size={16} strokeWidth={2.5} aria-hidden="true" />,
  waiting: <Clock size={16} strokeWidth={2.5} aria-hidden="true" />,
  na: <Minus size={16} strokeWidth={2.5} aria-hidden="true" />,
  stale: <RefreshCw size={15} strokeWidth={2.5} aria-hidden="true" />,
};
const TECH_ICON: Record<Tech, ReactNode> = {
  solar: <Sun size={15} aria-hidden="true" />,
  battery: <Battery size={15} aria-hidden="true" />,
  ev: <Plug size={15} aria-hidden="true" />,
  heatpump: <Fan size={15} aria-hidden="true" />,
};
const FIX_LABEL: Record<Fix, string> = {
  job: 'Job details',
  paperwork: 'Choose the DNO route',
  settings: 'Open settings',
  'sign-design': 'Sign the design part',
  switches: 'Where the switches are',
  values: 'Fill it in',
  outstanding: 'Still to put right',
  upload: 'Upload',
  site: 'Open the Site tab',
  library: 'Add to the library',
  'notify-bc': 'Notify building control',
  mid: 'Copy for MID',
  invoice: 'Final invoice',
  'dno-sent': 'Mark it sent to the DNO',
};
const SITE_KEYS = ['F43', 'F44', 'F44A', 'F74', 'F75', 'EIC', 'CERT_OWN', 'EV_REC', 'HP_REC'];

const when = (iso: string) => `${shortDate(ukDayOf(iso))} ${ukTime(iso)}`;
/** "From the electrician, 3 Nov 17:42" / "Uploaded by Sarah, 3 Nov" / "From the library" / "Made 3 Nov 17:42". */
function sourceWords(d: ViewDoc): string {
  if (d.source === 'library') return 'From the library';
  if (d.source === 'site' || (d.source === 'generated' && d.key && (SITE_KEYS.includes(d.key) || /^MEIWC|^EIC/.test(d.key)))) return `From the electrician, ${when(d.at)}`;
  if (d.source === 'generated') return `Made ${when(d.at)}${d.version > 1 ? ` (v${d.version})` : ''}`;
  return `Uploaded${d.by ? ` by ${d.by}` : ''}, ${shortDate(ukDayOf(d.at))}`;
}
const portalWords = (d: ViewDoc) => (d.visible ? 'In their portal' : d.release === 'with_pack' ? 'Goes with the pack' : 'Hidden from them');

export function HandoverTab({
  projectId,
  now,
  me,
  isAdmin,
  onChanged,
  openTab,
}: {
  projectId: string;
  now: number;
  me: string;
  isAdmin: boolean;
  onChanged: () => void;
  openTab: (t: Tab) => void;
}) {
  const [view, setView] = useState<HandoverView | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [mcsRead, setMcsRead] = useState<string | null>(null);
  const catching = useRef(false);
  const wide = useMedia('(min-width: 761px)');
  const today = now ? ukDayOf(now) : '';

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/crm/projects/${projectId}/handover`, { cache: 'no-store' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Couldn’t load the handover pack.');
      setView(d as HandoverView);
      setError('');
      // Behind (a document to make, a manual to attach, the pack to rebuild): catch up, once at a time.
      if ((d as HandoverView).dirty && !catching.current) {
        catching.current = true;
        send<HandoverView>(`/api/crm/projects/${projectId}/handover`, 'POST', { action: 'refresh' })
          .then((v) => setView(v))
          .catch(() => null)
          .finally(() => {
            catching.current = false;
          });
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t load the handover pack.');
      return false;
    }
  }, [projectId]);
  const { reload } = useLiveRefresh(load, 30_000);

  const done = (v: HandoverView & { notes?: string[] }, msg?: string) => {
    setView(v);
    setSheet(null);
    setNotice([msg, ...(v.notes ?? [])].filter(Boolean).join(' '));
    onChanged();
  };
  async function post(body: Record<string, unknown>, msg?: string) {
    setBusy(String(body.action));
    setError('');
    try {
      done(await send<HandoverView & { notes?: string[] }>(`/api/crm/projects/${projectId}/handover`, 'POST', body), msg);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Not done. Try again.');
    }
    setBusy(null);
  }

  if (!view) return <p className={error ? 'crm-banner crm-banner--err' : 'crm-muted'}>{error || 'Loading…'}</p>;
  const v = view;
  const shown = v.slots.filter((s) => !s.hidden);
  const hidden = v.slots.filter((s) => s.hidden);
  const pct = v.headline.total ? Math.round((v.headline.complete / v.headline.total) * 100) : 0;
  const sent = !!v.pack?.sent_at;
  const groups = [{ key: 'cover', title: 'Cover letter' }, ...GROUPS].map((g) => ({ ...g, items: shown.filter((s) => s.group === g.key) })).filter((g) => g.items.length);
  const rowOf = (code: SlotCode) => v.slots.find((s) => s.code === code)!;

  /** What a row's main button does: its fix, else open the document. */
  function fix(s: SlotView, f: Fix) {
    switch (f) {
      case 'job':
      case 'paperwork':
        return openTab('overview');
      case 'settings':
        window.location.href = '/admin/crm/settings#handover';
        return;
      case 'site':
        return openTab('site');
      case 'sign-design':
        return setSheet({ kind: 'sign' });
      case 'switches':
        return setSheet({ kind: 'values', slot: 'CC4' });
      case 'values':
        return setSheet({ kind: 'values', slot: s.code === 'F49A' ? 'F49A' : 'F78' });
      case 'outstanding':
        return setSheet({ kind: 'outstanding' });
      case 'library':
        return setSheet({ kind: 'library', model: v.gaps[0] ?? '' });
      case 'notify-bc':
        return setSheet({ kind: 'bc' });
      case 'mid':
        return setSheet({ kind: 'mid' });
      case 'invoice':
        return setSheet({ kind: 'invoice' });
      case 'dno-sent':
        if (window.confirm('Has the G98 Form B gone to the DNO? This ticks “G98 notice sent” on the checklist.')) void post({ action: 'dno-sent' }, 'Marked as sent to the DNO.');
        return;
      case 'upload':
      default:
        return setSheet({ kind: 'upload', slot: s.code });
    }
  }

  /** Every action for an item (beside it on a computer, in its sheet on a phone). */
  function actions(s: SlotView, inSheet = false) {
    // A helper that does what the item's fix button does is left out while that button shows.
    const shownFix = s.fix && s.state !== 'complete' ? s.fix : null;
    const helpers: { label: string; run: () => void; fix?: Fix }[] = [];
    if (s.code === 'CC17') helpers.push({ label: 'Copy for MID', run: () => setSheet({ kind: 'mid' }), fix: 'mid' });
    if (s.code === 'CC14') helpers.push({ label: 'Notify building control', run: () => setSheet({ kind: 'bc' }), fix: 'notify-bc' });
    if ((s.code === 'CC10' || s.code === 'CC15') && v.designDocs.length && s.state !== 'complete')
      for (const d of v.designDocs) helpers.push({ label: `Use “${d.name}”`, run: () => void post({ action: 'move', doc: d.id, slot: s.code }, `“${d.name}” is now in the pack.`) });
    if (s.code === 'F16E') helpers.push({ label: 'Still to put right', run: () => setSheet({ kind: 'outstanding' }), fix: 'outstanding' });
    if (s.code === 'F78') {
      // Not while the EIC's design part is to sign on the Site tab (fix 'site'): that one signature signs F78's too.
      if (!v.f78Design && s.fix !== 'site') helpers.push({ label: 'Sign the design part', run: () => setSheet({ kind: 'sign' }), fix: 'sign-design' });
      helpers.push({ label: 'F78 details', run: () => setSheet({ kind: 'values', slot: 'F78' }), fix: 'values' });
    }
    if (s.code === 'CC4') helpers.push({ label: 'Where the switches are', run: () => setSheet({ kind: 'values', slot: 'CC4' }), fix: 'switches' });
    if (s.code === 'F49A' && s.state !== 'na') helpers.push({ label: 'The plan as agreed', run: () => setSheet({ kind: 'values', slot: 'F49A' }), fix: 'values' });
    if (s.code === 'F47' && s.state !== 'na') helpers.push({ label: 'Isolation switch location', run: () => setSheet({ kind: 'values', slot: 'F47' }) });
    // The office's data sheets for filling in the DNO's forms (never in the pack).
    const sheetId = s.code === 'F47' ? v.helpers.f47Sheet : s.code === 'F76' ? v.helpers.f76Sheet : null;
    if (sheetId && s.state !== 'na') helpers.push({ label: s.code === 'F47' ? 'G98 data sheet' : 'G99 data sheet', run: () => void window.open(`/api/crm/documents/${sheetId}`, '_blank', 'noopener') });
    if (s.code === 'CC13') helpers.push({ label: 'Final invoice and payments', run: () => setSheet({ kind: 'invoice' }), fix: 'invoice' });
    // Ours, or the electrician's (F43…: made again from their sign-off, after a correction once the customer
    // has it), and any made document that's Out of date (their EV or heat pump record, their certificate).
    const regen = ((s.maker === 'pack' || s.maker === 'site') && s.kind !== 'C' && s.docs.some((d) => d.source === 'generated')) || s.docs.some((d) => d.source === 'generated' && d.stale);
    return (
      <div className={inSheet ? 'hv-acts hv-acts--sheet' : 'hv-acts'}>
        {s.docs.map((d) => (
          <div key={d.id} className="hv-doc">
            <a className="hv-doc__name" href={`/api/crm/documents/${d.id}`} target="_blank" rel="noreferrer">
              {d.name}
            </a>
            <small>
              {sourceWords(d)} · {portalWords(d)}
            </small>
            <span className="hv-doc__btns">
              <a className="crm-chipbtn" href={`/api/crm/documents/${d.id}?download=1`}>
                Download
              </a>
              {d.source === 'generated' && hasPrintVersion(d.key) && (
                <a className="crm-chipbtn" href={printHref(`/api/crm/documents/${d.id}`)} target="_blank" rel="noreferrer" title={PRINT_TITLE}>
                  {PRINT_LABEL}
                </a>
              )}
              <button type="button" className={`crm-chipbtn${d.visible ? ' on' : ''}`} onClick={() => void post({ action: 'visible', doc: d.id, visible: !d.visible })}>
                {d.visible ? 'Hide from portal' : 'Show in portal'}
              </button>
              {d.source !== 'generated' && (
                <button type="button" className="crm-chipbtn" onClick={() => setSheet({ kind: 'upload', slot: s.code, replace: d })}>
                  Replace
                </button>
              )}
              {s.code === 'F76' && (
                <select className="crm-chipbtn" value={d.part ?? ''} onChange={(e) => void post({ action: 'part', doc: d.id, part: e.target.value })} aria-label="Which G99 paper">
                  <option value="">Which paper?</option>
                  <option value="application">Application</option>
                  <option value="acceptance">DNO acceptance</option>
                  <option value="installation">Installation document</option>
                  <option value="g100">G100 Form C</option>
                </select>
              )}
              <button
                type="button"
                className="crm-chipbtn"
                onClick={() => window.confirm(`Archive “${d.name}”? It’s kept, but the customer won’t see it.`) && void post({ action: 'archive', doc: d.id }, 'Archived.')}
              >
                Archive
              </button>
            </span>
          </div>
        ))}
        <div className="hv-acts__row">
          {shownFix && (
            <button type="button" className="crm-btn crm-btn--solar crm-btn--small" onClick={() => fix(s, shownFix)}>
              {FIX_LABEL[shownFix]}
            </button>
          )}
          {s.state !== 'na' && !(shownFix === 'upload' && !s.docs.length) && (
            <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => setSheet({ kind: 'upload', slot: s.code })}>
              {s.docs.length ? '+ Upload another' : 'Upload'}
            </button>
          )}
          {regen && (
            <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={busy === 'regenerate'} onClick={() => void post({ action: 'regenerate', slot: s.code })}>
              Regenerate
            </button>
          )}
          {helpers
            .filter((h) => !h.fix || h.fix !== shownFix)
            .map((h) => (
            <button key={h.label} type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={h.run}>
              {h.label}
            </button>
          ))}
          {s.code !== 'CCMH' &&
            (s.office ? (
              <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => void post({ action: 'restore', slot: s.code })}>
                Needed after all
              </button>
            ) : (
              // One Send waits for: an admin's call, like sending without it.
              s.state !== 'na' &&
              (isAdmin || !SITE_SLOTS.includes(s.code)) && (
                <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => setSheet({ kind: 'na', code: s.code })}>
                  Not needed
                </button>
              )
            ))}
        </div>
      </div>
    );
  }

  function row(s: SlotView) {
    const latest = [...s.docs].sort((a, b) => (a.at < b.at ? 1 : -1))[0];
    const said = s.state === 'complete' && latest ? sourceWords(latest) : s.why;
    // On a phone the state's word goes on the second line (the pill keeps just its icon).
    const line = wide ? said : [STATE_LABEL[s.state], said].filter(Boolean).join(' · ');
    const head = (
      <>
        <span className={`hv-state hv-state--${s.state}`} title={STATE_LABEL[s.state]}>
          {ICON[s.state]}
          <span className="hv-state__w">{STATE_LABEL[s.state]}</span>
        </span>
        <span className="hv-row__main">
          <span className="hv-row__title">
            <b>{s.title}</b> <code>{s.code}</code>
          </span>
          <small className="hv-row__cust">{s.customer}</small>
          {line && <small className={`hv-row__why${s.state === 'missing' || s.state === 'stale' ? ' is-act' : ''}`}>{line}</small>}
        </span>
        <span className="hv-tech" aria-label={s.tech.length ? s.tech.map((t) => TECH_LABEL[t]).join(', ') : 'Every job'}>
          {s.tech.map((t) => (
            <span key={t} title={TECH_LABEL[t]}>
              {TECH_ICON[t]}
            </span>
          ))}
        </span>
      </>
    );
    if (!wide)
      return (
        <li key={s.code} className={`hv-row hv-row--${s.state}`}>
          <button type="button" className="hv-row__tap" onClick={() => setSheet({ kind: 'row', code: s.code })}>
            {head}
          </button>
        </li>
      );
    return (
      <li key={s.code} className={`hv-row hv-row--${s.state}`}>
        <div className="hv-row__head">{head}</div>
        {actions(s)}
      </li>
    );
  }

  const packLine = !v.pack?.version
    ? 'Not built yet. Build it to check the contents, or Send builds it for you.'
    : `Version ${v.pack.version}${v.pack.built_at ? `, built ${when(v.pack.built_at)}` : ''}${v.pack.pages ? ` · ${v.pack.pages} pages` : ''}${v.pack.separate.length ? ` · ${v.pack.separate.length} separate file${v.pack.separate.length === 1 ? '' : 's'}` : ''}${v.pack.behind ? ' · new documents since: build again' : ''}`;
  const sentLine = sent ? `Sent ${when(v.pack!.sent_at!)}${v.pack!.sent_via.length ? ` by ${v.pack!.sent_via.map((x) => (x === 'whatsapp' ? 'WhatsApp' : 'email')).join(' and ')}` : ''}.${v.pack!.queued ? ` Message waiting to send at ${v.pack!.queued.words}.` : ''}` : null;

  return (
    <div className="hv">
      <section className="hv-top" aria-label="Handover pack">
        <div className="hv-top__main">
          <h3>Handover pack</h3>
          <p className="hv-head">{v.headline.words}</p>
          <div className="hv-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Complete">
            <span style={{ width: `${pct}%` }} />
          </div>
          <p className="hv-target">{v.target}</p>
          <p className="hv-packline">
            {packLine}
            {v.pack?.document_id && (
              <>
                {' '}
                <a className="crm-link" href={`/api/crm/documents/${v.pack.document_id}`} target="_blank" rel="noreferrer">
                  Download
                </a>
                {' · '}
                <a className="crm-link" href={printHref(`/api/crm/documents/${v.pack.document_id}`)} target="_blank" rel="noreferrer" title={PRINT_TITLE}>
                  {PRINT_LABEL}
                </a>
              </>
            )}
          </p>
          {sentLine && <p className="hv-sent">✓ {sentLine}</p>}
        </div>
        <div className="hv-top__btns">
          <button type="button" className="crm-btn crm-btn--solar hv-big" onClick={() => setSheet({ kind: 'send' })}>
            {sent ? 'Send again' : 'Send to customer'}
          </button>
          <button
            type="button"
            className="crm-btn crm-btn--ghost hv-big"
            disabled={busy === 'build'}
            onClick={() => void post({ action: 'build' }, 'Handover pack built.')}
          >
            {busy === 'build' ? 'Building…' : v.pack?.version ? 'Build again' : 'Build handover pack'}
          </button>
          <button type="button" className="crm-btn crm-btn--ghost hv-big" onClick={() => setSheet({ kind: 'upload', slot: null })}>
            + Add a document
          </button>
        </div>
      </section>

      {!v.send.ok && !sent && (
        <p className="hv-hold">
          <b>Can be sent once these are in:</b> {v.send.blocking.map((b) => b.title).join(', ')}.
        </p>
      )}
      {error && <p className="crm-banner crm-banner--err">{error}</p>}
      {notice && (
        <p className="crm-banner" role="status">
          {notice}{' '}
          <button type="button" className="crm-link" onClick={() => setNotice('')}>
            OK
          </button>
        </p>
      )}
      {mcsRead && (
        <p className="crm-banner hv-read" role="status">
          Read from the certificate: <b>{mcsRead}</b>. Save it as the MCS certificate number?{' '}
          <button
            type="button"
            className="crm-btn crm-btn--solar crm-btn--small"
            onClick={async () => {
              try {
                await send(`/api/crm/projects/${projectId}`, 'PATCH', { paperwork: { mcs_cert_no: mcsRead } });
                setMcsRead(null);
                setNotice(`MCS certificate number ${mcsRead} saved.`);
                onChanged();
                void reload();
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Not saved');
              }
            }}
          >
            Save it
          </button>
          <button type="button" className="crm-link" onClick={() => setMcsRead(null)}>
            No
          </button>
        </p>
      )}

      {sent && (
        <section className="hv-next" aria-label="Next">
          <h4>Next: the final invoice</h4>
          {v.money && <p className="hv-money">{v.money}</p>}
          <p className="crm-small">
            {v.invoice.uploaded && v.invoice.paid
              ? '✓ Invoice in their pack, final payment recorded.'
              : v.invoice.uploaded
                ? 'Invoice in their pack. Record the payment when it arrives.'
                : `Upload it now: it goes into their portal and the pack.${v.invoice.paid ? ' (Final payment already recorded.)' : ''}`}
          </p>
          <div className="hv-acts__row">
            {!v.invoice.uploaded && (
              <button type="button" className="crm-btn crm-btn--solar crm-btn--small" onClick={() => setSheet({ kind: 'upload', slot: 'CC13' })}>
                Upload the final invoice
              </button>
            )}
            <button type="button" className={`crm-btn ${v.invoice.uploaded && !v.invoice.paid ? 'crm-btn--solar' : 'crm-btn--ghost'} crm-btn--small`} onClick={() => setSheet({ kind: 'invoice' })}>
              Record a payment
            </button>
          </div>
        </section>
      )}

      {!sent && ['won', 'design', 'ready', 'install_booked'].includes(v.stage) && (
        <section className="hv-prep" aria-label="Handover prep">
          <h4>Before the install day</h4>
          <ul>
            {v.prep.map((p) => (
              <li key={p.label} className={p.done ? 'is-done' : ''}>
                {p.done ? '✓' : '○'} {p.label}
              </li>
            ))}
          </ul>
        </section>
      )}

      {groups.map((g) => (
        <section key={g.key} className="hv-group" aria-label={g.title}>
          <h4>{g.title}</h4>
          <ul className="hv-rows">
            {g.items.map((s) => row(s))}
          </ul>
        </section>
      ))}
      {hidden.length > 0 && (
        <details className="hv-hidden">
          <summary>Not for this job ({hidden.length})</summary>
          <ul>
            {hidden.map((s) => (
              <li key={s.code}>
                <code>{s.code}</code> {s.title} <small>· {s.why}</small>
              </li>
            ))}
          </ul>
        </details>
      )}

      {sheet?.kind === 'row' && (
        <PlainSheet label={rowOf(sheet.code).title} onClose={() => setSheet(null)}>
          <h2>
            {rowOf(sheet.code).title} <code className="hv-code">{sheet.code}</code>
          </h2>
          <p className={`hv-state hv-state--${rowOf(sheet.code).state} hv-state--inline`}>
            {ICON[rowOf(sheet.code).state]} {STATE_LABEL[rowOf(sheet.code).state]}
          </p>
          {rowOf(sheet.code).why && <p className="hv-sheetwhy">{rowOf(sheet.code).why}</p>}
          <p className="crm-muted crm-small">For the customer: {rowOf(sheet.code).customer}</p>
          {actions(rowOf(sheet.code), true)}
        </PlainSheet>
      )}
      {sheet?.kind === 'upload' && (
        <UploadSheet
          projectId={projectId}
          preset={sheet.slot}
          replace={sheet.replace ? { id: sheet.replace.id, name: sheet.replace.name } : null}
          tellDefault={v.tellDefault}
          customer={v.customer}
          onClose={() => setSheet(null)}
          onDone={(msg, read) => {
            setSheet(null);
            setNotice(msg);
            if (read) setMcsRead(read);
            onChanged();
            // The pack catches up on the server after the upload; look again shortly.
            void reload();
            setTimeout(() => void reload(), 2500);
          }}
        />
      )}
      {sheet?.kind === 'na' && <NotNeededSheet projectId={projectId} slot={sheet.code} reasons={rowOf(sheet.code).reasons} onClose={() => setSheet(null)} onDone={(x) => done(x, 'Marked not needed.')} />}
      {sheet?.kind === 'sign' && <SignDesignSheet projectId={projectId} me={me} onClose={() => setSheet(null)} onDone={(x) => done(x, 'Design part signed.')} />}
      {sheet?.kind === 'values' && (
        <ValuesSheet
          projectId={projectId}
          slot={sheet.slot}
          title={{ F49A: 'The maintenance plan, as agreed', CC4: 'Where the switches are', F78: 'F78 details', F47: 'G98: where the isolation switch is' }[sheet.slot]}
          intro={
            {
              F49A: 'Type each exactly as it was quoted. It prints with your agreement wording.',
              CC4: 'For the “How to switch your system off” page. From what the electrician told you, or their photos.',
              F78: 'Only what the job doesn’t already say. Empty boxes use the job’s own details.',
              F47: 'Where the lockable isolation switch is, as Form B asks.',
            }[sheet.slot]
          }
          fields={sheet.slot === 'F49A' ? v.forms.F49A : sheet.slot === 'CC4' ? v.forms.CC4 : sheet.slot === 'F78' ? v.forms.F78 : v.forms.F47}
          onClose={() => setSheet(null)}
          onDone={(x) => done(x, 'Saved.')}
        />
      )}
      {sheet?.kind === 'outstanding' && <OutstandingSheet projectId={projectId} items={v.forms.F16E} flags={v.flags} onClose={() => setSheet(null)} onDone={(x) => done(x, 'Saved.')} />}
      {sheet?.kind === 'mid' && (
        <CopySheet
          title="Copy for the MCS database"
          intro="Everything the MCS Installation Database asks for, in its order. Copy each one in, then upload the certificate here."
          fields={v.copy.mid}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === 'bc' && (
        <CopySheet
          title="Notify building control"
          intro="The values the scheme’s form asks for. When it’s done, save the date and reference: the to-do closes and the certificate shows as on its way."
          fields={v.copy.bc}
          download={(() => {
            const d = rowOf('CC21').docs[0];
            return d ? { href: `/api/crm/documents/${d.id}`, label: 'Download the electrical certificate' } : null;
          })()}
          record={{
            projectId,
            onSaved: () => {
              setSheet(null);
              setNotice('Building control saved.');
              onChanged();
              void reload();
            },
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === 'send' && (
        <SendSheet
          projectId={projectId}
          view={v}
          isAdmin={isAdmin}
          actions={Object.fromEntries(
            v.send.blocking
              .filter((b) => b.from === 'office')
              .map((b) => {
                const f = b.fix ?? 'upload';
                return [b.code, { label: FIX_LABEL[f], run: () => fix(rowOf(b.code as SlotCode), f) }];
              })
          )}
          onClose={() => setSheet(null)}
          onDone={(x) => done(x, 'Handover pack sent: it’s in their portal.')}
        />
      )}
      {sheet?.kind === 'invoice' && (
        <InvoiceSheet
          projectId={projectId}
          view={v}
          isAdmin={isAdmin}
          today={today}
          onUpload={() => setSheet({ kind: 'upload', slot: 'CC13' })}
          onClose={() => setSheet(null)}
          onDone={(x) => done(x, 'Payment recorded.')}
        />
      )}
      {sheet?.kind === 'library' && (
        <LibrarySheet
          model={sheet.model}
          tech={[]}
          onClose={() => setSheet(null)}
          onDone={() => {
            setSheet(null);
            setNotice('In the library: every job with that model gets it.');
            void post({ action: 'refresh' });
          }}
        />
      )}
    </div>
  );
}
