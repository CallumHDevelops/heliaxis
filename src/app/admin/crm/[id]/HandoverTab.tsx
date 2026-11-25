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
import { Mark } from './PackPanel';
import { PlainSheet } from './RecordSheets';
import { OpenSolarSheet } from './OpenSolarSheet';
import { OfficeFill, RequestSheet, requestWords, useRequests } from './RequestInstaller';
import { docNumber } from '@/lib/docs/packs';
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
  | { kind: 'values'; form: ValuesForm }
  | { kind: 'outstanding' }
  | { kind: 'mid' }
  | { kind: 'bc' }
  | { kind: 'send' }
  | { kind: 'invoice' }
  | { kind: 'library'; model: string }
  | { kind: 'quick'; what: 'commissioned' | 'estimate' }
  | { kind: 'opensolar' }
  | { kind: 'note'; code: SlotCode; title: string }
  | { kind: 'request'; code: SlotCode; title: string }
  | { kind: 'fill'; code: SlotCode };

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
  commissioned: 'Add switch-on date',
  estimate: 'Add the estimate figures',
  opensolar: 'Upload the OpenSolar proposal',
};
/** The electrician's own records (their step-by-step site app): asking for them means putting them on the job. */
const SITE_ITEMS = ['HX-HO-04'];
const SITE_KEYS = ['HX-PV-01', 'HX-PV-02', 'HX-PV-03', 'HX-BAT-01', 'HX-BAT-02', 'EIC', 'CERT_OWN', 'HX-EV-01', 'HX-EV-03', 'HX-HP-01'];

/** The sheets of values the office types, and the pack item each is kept on. */
type ValuesForm = 'plan' | 'switches' | 'summary' | 'g98';
const FORM_SLOT: Record<ValuesForm, SlotCode> = { plan: 'HX-HO-12', switches: 'HX-HO-09', summary: 'HX-HO-02', g98: 'HX-HO-15' };
const FORM_TITLE: Record<ValuesForm, string> = { plan: 'The maintenance plan, as agreed', switches: 'Where the switches are', summary: 'Summary details', g98: 'G98: where the isolation switch is' };
const FORM_INTRO: Record<ValuesForm, string> = {
  plan: 'Type each exactly as it was quoted. It prints with your plan wording.',
  switches: 'For the “How to switch your system off” page. From what the electrician told you, or their photos.',
  summary: 'Only what the job doesn’t already say. Empty boxes use the job’s own details.',
  g98: 'Where the lockable isolation switch is, as Form B asks.',
};

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
  jobRef = null,
}: {
  projectId: string;
  now: number;
  me: string;
  isAdmin: boolean;
  /** The job's reference (HX-0126): document numbers are built from it. */
  jobRef?: string | null;
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
  const req = useRequests(projectId);
  // Complete items fold to one line (less scrolling); opened ones stay open until folded again.
  const [opened, setOpened] = useState<Set<string>>(() => new Set());
  const toggle = (code: string) => setOpened((o) => { const n = new Set(o); if (n.has(code)) n.delete(code); else n.add(code); return n; });

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
        return setSheet({ kind: 'values', form: 'switches' });
      case 'values':
        return setSheet({ kind: 'values', form: s.code === 'HX-HO-12' ? 'plan' : 'summary' });
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
      case 'opensolar':
        return setSheet({ kind: 'opensolar' });
      case 'commissioned':
      case 'estimate':
        return setSheet({ kind: 'quick', what: f });
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
    if (s.code === 'HX-HO-03') helpers.push({ label: 'Copy for MID', run: () => setSheet({ kind: 'mid' }), fix: 'mid' });
    if (s.code === 'HX-HO-05') helpers.push({ label: 'Notify building control', run: () => setSheet({ kind: 'bc' }), fix: 'notify-bc' });
    if ((s.code === 'HX-HO-13' || s.code === 'HX-HO-14') && v.designDocs.length && s.state !== 'complete')
      for (const d of v.designDocs) helpers.push({ label: `Use “${d.name}”`, run: () => void post({ action: 'move', doc: d.id, slot: s.code }, `“${d.name}” is now in the pack.`) });
    if (s.code === 'HX-HO-08') helpers.push({ label: 'Still to put right', run: () => setSheet({ kind: 'outstanding' }), fix: 'outstanding' });
    if (s.code === 'HX-HO-02') {
      // Not while the EIC's design part is to sign on the Site tab (fix 'site'): that one signature signs the summary's too.
      if (!v.summaryDesign && s.fix !== 'site') helpers.push({ label: 'Sign the design part', run: () => setSheet({ kind: 'sign' }), fix: 'sign-design' });
      helpers.push({ label: 'Summary details', run: () => setSheet({ kind: 'values', form: 'summary' }), fix: 'values' });
    }
    if (s.code === 'HX-HO-09') helpers.push({ label: 'Where the switches are', run: () => setSheet({ kind: 'values', form: 'switches' }), fix: 'switches' });
    if (s.code === 'HX-HO-12' && s.state !== 'na') helpers.push({ label: 'The plan as agreed', run: () => setSheet({ kind: 'values', form: 'plan' }), fix: 'values' });
    if (s.code === 'HX-HO-15' && s.state !== 'na') helpers.push({ label: 'Isolation switch location', run: () => setSheet({ kind: 'values', form: 'g98' }) });
    // The office's data sheets for filling in the DNO's forms (never in the pack).
    const sheetId = s.code === 'HX-HO-15' ? v.helpers.g98Sheet : s.code === 'HX-HO-16' ? v.helpers.g99Sheet : null;
    if (sheetId && s.state !== 'na') helpers.push({ label: s.code === 'HX-HO-15' ? 'G98 data sheet' : 'G99 data sheet', run: () => void window.open(`/api/crm/documents/${sheetId}`, '_blank', 'noopener') });
    if ((s.code === 'HX-HO-10' || s.code === 'HX-HO-14') && s.state !== 'na') helpers.push({ label: s.state === 'complete' ? 'Use a different OpenSolar proposal' : 'Upload the OpenSolar proposal', run: () => setSheet({ kind: 'opensolar' }), fix: 'opensolar' });
    helpers.push({ label: v.notes[s.code] ? 'Edit the customer note' : 'Note for the customer', run: () => setSheet({ kind: 'note', code: s.code, title: s.title }) });
    if (s.code === 'HX-HO-18') helpers.push({ label: 'Final invoice and payments', run: () => setSheet({ kind: 'invoice' }), fix: 'invoice' });
    // Ours, or the electrician's (HX-PV-02…: made again from their sign-off, after a correction once the customer
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
              {s.code === 'HX-HO-16' && (
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
        {v.notes[s.code] && (
          <p className="hv-note">
            <b>Note for the customer:</b> {v.notes[s.code]}
          </p>
        )}
        {requestWords(req.data?.requests.find((r) => r.target === s.code && !r.cancelled_at)) && (
          <p className="hv-asked">{requestWords(req.data?.requests.find((r) => r.target === s.code && !r.cancelled_at))}</p>
        )}
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
          {/* Ask the installer for it (a private link, one question at a time), or answer it here the same way. */}
          {s.state !== 'na' && (v.requestable.includes(s.code) || (SITE_ITEMS.includes(s.code) && s.state !== 'complete')) && (
            <button
              type="button"
              className="crm-btn crm-btn--ghost crm-btn--small"
              onClick={() => (v.requestable.includes(s.code) ? setSheet({ kind: 'request', code: s.code, title: s.title }) : openTab('site'))}
              title={v.requestable.includes(s.code) ? 'Send an installer a link to answer it on their phone' : 'The electrician fills this in on their site app: put them on the job on the Site tab'}
            >
              Request installer information
            </button>
          )}
          {s.state !== 'na' && v.requestable.includes(s.code) && (
            <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => setSheet({ kind: 'fill', code: s.code })}>
              {s.state === 'complete' ? 'Change the answers' : 'Complete it myself'}
            </button>
          )}
          {s.code !== 'HX-HO-19' &&
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
        <Mark state={s.state === 'stale' ? 'stale' : s.state} />
        <span className="hv-row__main">
          <span className="hv-row__title">
            <b>{s.title}</b> <code>{s.code}</code>
            {latest && <code className="hv-docno">{docNumber(jobRef, s.code, latest.version)}</code>}
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
    if (s.state === 'complete' && !opened.has(s.code))
      return (
        <li key={s.code} className={`hv-row hv-row--${s.state} hv-row--compact`}>
          <button type="button" className="hv-row__fold" onClick={() => toggle(s.code)} aria-expanded={false}>
            <Mark state="complete" />
            <b>{s.title}</b>
            <code>{s.code}</code>
            <small>{said}</small>
          </button>
          {latest && (
            <a className="crm-chipbtn" href={`/api/crm/documents/${latest.id}`} target="_blank" rel="noreferrer">
              View
            </a>
          )}
          <button type="button" className="crm-chipbtn" onClick={() => toggle(s.code)}>
            More ▾
          </button>
        </li>
      );
    return (
      <li key={s.code} className={`hv-row hv-row--${s.state}`}>
        <div className="hv-row__head">{head}</div>
        {s.state === 'complete' && (
          <button type="button" className="crm-chipbtn hv-row__less" onClick={() => toggle(s.code)}>
            Less ▴
          </button>
        )}
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
          <a className="crm-btn crm-btn--ghost hv-big" href={`/api/crm/projects/${projectId}/packs/handover/zip`}>
            Download ZIP
          </a>
        </div>
      </section>

      {!v.products.some((x) => x in TECH_ICON) && <TechPicker projectId={projectId} onSaved={() => { onChanged(); void reload(); }} />}

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
              <button type="button" className="crm-btn crm-btn--solar crm-btn--small" onClick={() => setSheet({ kind: 'upload', slot: 'HX-HO-18' })}>
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

      {sheet?.kind === 'request' && (
        <RequestSheet projectId={projectId} code={sheet.code} title={sheet.title} data={req.data} onClose={() => setSheet(null)} onSent={() => void req.reload()} />
      )}
      {sheet?.kind === 'fill' && (
        <OfficeFill
          projectId={projectId}
          code={sheet.code}
          me={me}
          onClose={() => {
            setSheet(null);
            onChanged();
            void reload();
          }}
        />
      )}
      {sheet?.kind === 'note' && (
        <NoteSheet
          title={sheet.title}
          first={v.customer.first}
          note={v.notes[sheet.code] ?? ''}
          onClose={() => setSheet(null)}
          onSave={(note) => post({ action: 'note', slot: sheet.code, note }, note ? 'Note saved: it shows in their portal.' : 'Note removed.')}
        />
      )}
      {sheet?.kind === 'opensolar' && (
        <OpenSolarSheet
          projectId={projectId}
          onClose={() => setSheet(null)}
          onDone={() => {
            setSheet(null);
            setNotice('OpenSolar figures in: the design calculations and the solar estimate page are made from them.');
            onChanged();
            void reload();
          }}
        />
      )}
      {sheet?.kind === 'quick' && (
        <QuickSheet
          projectId={projectId}
          what={sheet.what}
          today={today}
          onClose={() => setSheet(null)}
          onOpenSolar={() => setSheet({ kind: 'opensolar' })}
          onSaved={(msg) => {
            setSheet(null);
            setNotice(msg);
            onChanged();
            void post({ action: 'refresh' });
          }}
        />
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
      {sheet?.kind === 'sign' && <SignDesignSheet projectId={projectId} me={me} declaration={v.summaryDeclaration} onClose={() => setSheet(null)} onDone={(x) => done(x, 'Design part signed.')} />}
      {sheet?.kind === 'values' && (
        <ValuesSheet
          projectId={projectId}
          slot={FORM_SLOT[sheet.form]}
          title={FORM_TITLE[sheet.form]}
          intro={FORM_INTRO[sheet.form]}
          fields={v.forms[sheet.form]}
          onClose={() => setSheet(null)}
          onDone={(x) => done(x, 'Saved.')}
        />
      )}
      {sheet?.kind === 'outstanding' && <OutstandingSheet projectId={projectId} items={v.forms.outstanding} flags={v.flags} onClose={() => setSheet(null)} onDone={(x) => done(x, 'Saved.')} />}
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
            const d = rowOf('HX-HO-04').docs[0];
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
          onUpload={() => setSheet({ kind: 'upload', slot: 'HX-HO-18' })}
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

/**
 * A job with no technologies ticked can't say which items it needs: every solar, battery and heat
 * pump item would sit under "Not for this job" (and documents filed in them with it). Ask first.
 */
function TechPicker({ projectId, onSaved }: { projectId: string; onSaved: () => void }) {
  const [pick, setPick] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const TECHS: [string, string][] = [
    ['solar', 'Solar PV'],
    ['battery', 'Battery'],
    ['heatpump', 'Heat pump'],
    ['ev', 'EV charger'],
  ];
  return (
    <section className="crm-banner crm-banner--err hv-techpick" aria-label="What we installed">
      <p>
        <b>What did we install on this job?</b> No technologies are ticked on Job details, so the pack can’t tell which documents it needs: the
        solar, battery and heat pump items are all hidden until you choose.
      </p>
      <div className="hv-acts__row">
        {TECHS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={`crm-chipbtn${pick.includes(k) ? ' on' : ''}`}
            aria-pressed={pick.includes(k)}
            onClick={() => setPick((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]))}
          >
            {TECH_ICON[k as Tech]} {label}
          </button>
        ))}
        <button
          type="button"
          className="crm-btn crm-btn--solar crm-btn--small"
          disabled={!pick.length || busy}
          onClick={async () => {
            setBusy(true);
            setErr('');
            try {
              await send(`/api/crm/projects/${projectId}`, 'PATCH', { products: pick });
              onSaved();
            } catch (e) {
              setErr(e instanceof Error ? e.message : 'Not saved');
            }
            setBusy(false);
          }}
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
      {err && <p className="crm-small">{err}</p>}
    </section>
  );
}

/**
 * When all an item lacks is one detail (the switch-on date; the design's estimate figures), it's typed
 * here on the row instead of a trip to Job details. Saved on the job, so everything else that waits for it moves too.
 */
function QuickSheet({ projectId, what, today, onClose, onSaved, onOpenSolar }: { projectId: string; what: 'commissioned' | 'estimate'; today: string; onClose: () => void; onSaved: (msg: string) => void; onOpenSolar: () => void }) {
  const [day, setDay] = useState(today);
  const [kwh, setKwh] = useState('');
  const [shade, setShade] = useState('1');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const title = what === 'commissioned' ? 'Switch-on (commissioning) date' : 'The design’s estimate figures';
  async function save() {
    setBusy(true);
    setErr('');
    try {
      if (what === 'commissioned') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Choose the date.');
        await send(`/api/crm/projects/${projectId}`, 'PATCH', { commissioned_at: `${day}T12:00:00.000Z` });
        onSaved(`Switch-on date saved: ${shortDate(day)}.`);
      } else {
        const k = Number(kwh);
        const sf = Number(shade);
        if (!(k > 0)) throw new Error('Type the estimated generation in kWh a year.');
        if (!(sf > 0 && sf <= 1)) throw new Error('The shade factor is between 0 and 1.');
        await send(`/api/crm/projects/${projectId}`, 'PATCH', { system: { est_kwh_year: k, shade_factor: sf } });
        onSaved('Estimate figures saved.');
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Not saved');
      setBusy(false);
    }
  }
  return (
    <PlainSheet label={title} onClose={onClose}>
      <h2>{title}</h2>
      {what === 'commissioned' ? (
        <>
          <p className="crm-muted crm-small">The day the system was switched on. The warranty, the MCS certificate’s deadline and the G98 notice all count from it.</p>
          <label className="crm-label" htmlFor="hv-q-day">
            Switched on
          </label>
          <input id="hv-q-day" className="crm-input" type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)} />
        </>
      ) : (
        <>
          <p className="crm-muted crm-small">From the MCS performance estimate in the design. The handover never works these out itself.</p>
          <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={onOpenSolar}>
            Read them from the OpenSolar proposal instead
          </button>
          <label className="crm-label" htmlFor="hv-q-kwh">
            Estimated generation (kWh a year)
          </label>
          <input id="hv-q-kwh" className="crm-input" inputMode="decimal" value={kwh} onChange={(e) => setKwh(e.target.value)} />
          <label className="crm-label" htmlFor="hv-q-sf">
            Shade factor (0 to 1)
          </label>
          <input id="hv-q-sf" className="crm-input" inputMode="decimal" value={shade} onChange={(e) => setShade(e.target.value)} />
        </>
      )}
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
      <div className="crm-actions">
        <button type="button" className="crm-btn crm-btn--solar" disabled={busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="crm-btn crm-btn--ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </PlainSheet>
  );
}

/** A note the customer sees under the item in their portal: what's happening with it. */
function NoteSheet({ title, first, note, onClose, onSave }: { title: string; first: string; note: string; onClose: () => void; onSave: (note: string) => Promise<void> }) {
  const [text, setText] = useState(note);
  const [busy, setBusy] = useState(false);
  return (
    <PlainSheet label="Note for the customer" onClose={onClose}>
      <h2>Note for the customer</h2>
      <p className="crm-muted crm-small">
        Shown under <b>{title}</b> in {first || 'the customer'}’s portal, so they know what’s happening with it.
      </p>
      <textarea
        className="crm-input"
        rows={4}
        maxLength={600}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`Hi ${first || 'there'}, we’re still waiting for this document from the insurance provider and will upload it as soon as it arrives.`}
      />
      <div className="crm-actions">
        <button
          type="button"
          className="crm-btn crm-btn--solar"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onSave(text.trim());
            setBusy(false);
          }}
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        {note && (
          <button
            type="button"
            className="crm-btn crm-btn--ghost"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onSave('');
              setBusy(false);
            }}
          >
            Remove it
          </button>
        )}
        <button type="button" className="crm-btn crm-btn--ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </PlainSheet>
  );
}
