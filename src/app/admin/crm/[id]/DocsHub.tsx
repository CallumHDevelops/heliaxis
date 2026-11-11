'use client';

import { useCallback, useEffect, useState } from 'react';
import { BrandIcon } from '@/app/admin/crm/CrmUi';
import type { Pack, PackKey } from '@/lib/docs/packs';
import { AssignedDocuments } from './AssignedDocuments';
import { FormEditor } from './FormEditor';
import { HandoverTab } from './HandoverTab';
import { PackPanel } from './PackPanel';
import { DocumentsTab } from './ProjectExtras';
import type { Tab } from './record-shared';
import './docs.css';
import './mcs.css';

import type { DocsView } from './docs-views';
export type { DocsView };
type DocsProps = Parameters<typeof DocumentsTab>[0];

/** The pack Docs opens on when nothing asks for another: the customer's handover once it is open, the In-House file for a job under way, the proposal before that. */
export function defaultDocsView(projectStage: boolean, handoverStage: boolean): DocsView {
  return handoverStage ? 'handover' : projectStage ? 'inhouse' : 'proposal';
}
type Packs = { ref: string | null; stage: string; packs: Pack[]; general: number };

/** Keep the address in step, so a pack (or one form in it) can be linked to and survives a refresh. */
function remember(view: DocsView, form: string | null) {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('view', view);
    if (form) url.searchParams.set('form', form);
    else url.searchParams.delete('form');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // The view still changes; only a refresh won't remember it.
  }
}

type Props = {
  projectId: string;
  docs: DocsProps['docs'];
  onChanged: DocsProps['onChanged'];
  siteDocs: boolean;
  handover: boolean;
  isAdmin: boolean;
  me: string;
  now: number;
  version: string;
  /** Where to open: what the address said, or the stage's own pack. */
  start: DocsView;
  startForm: string | null;
  /** A request from elsewhere on the page (the Overview's card, an old Handover link) to open a pack, or a form in one. */
  jump: { view: DocsView; form: string | null; key: number } | null;
  openTab: (t: Tab) => void;
  /** The deal is made (Won or later): the In-House (MCS) pack opens. Before that it stays out of the way. */
  won: boolean;
  enquiryId: string;
};

/**
 * The Docs tab, and the only place documents live: a menu of the three packs (Proposal, In-House, Handover) and General files
 * down the left, and the chosen one on the right: line items of what is needed, each with a green tick or an orange warning, and
 * a Download ZIP. The Handover pack is the screen it has always had (it sends, builds and signs); the other packs are line items.
 */
export function DocsHub({ projectId, docs, onChanged, siteDocs, handover, isAdmin, me, now, version, start, startForm, jump, openTab, won, enquiryId }: Props) {
  const [view, setView] = useState<DocsView>(jump?.view ?? start);
  const [form, setForm] = useState<string | null>(jump ? jump.form : startForm);
  const [data, setData] = useState<Packs | null>(null);
  const [tick, setTick] = useState(0);
  // "Create MCS Pack" before the deal is won: remembered on this device for this job.
  const [made, setMade] = useState(false);
  useEffect(() => {
    try {
      setMade(window.localStorage.getItem(`hx-mcs-${projectId}`) === '1');
    } catch {
      // Not remembered; the button still works until the page is left.
    }
  }, [projectId]);
  const mcs = won || made || jump?.view === 'inhouse';
  function createMcs() {
    setMade(true);
    try {
      window.localStorage.setItem(`hx-mcs-${projectId}`, '1');
    } catch {
      // Fine.
    }
    go('inhouse');
  }

  const go = useCallback((v: DocsView, f: string | null = null) => {
    setView(v);
    setForm(f);
  }, []);

  // A request from elsewhere on the page (each has a new key).
  const [asked, setAsked] = useState(jump?.key ?? 0);
  if (jump && jump.key !== asked) {
    setAsked(jump.key);
    go(jump.view, jump.form);
  }

  // The address follows the view.
  useEffect(() => {
    remember(view, view === 'inhouse' ? form : null);
  }, [view, form]);

  useEffect(() => {
    let live = true;
    fetch(`/api/crm/projects/${projectId}/packs`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && d && setData(d as Packs))
      .catch(() => null);
    return () => {
      live = false;
    };
  }, [projectId, version, tick]);

  const changed = useCallback(() => {
    setTick((n) => n + 1);
    void onChanged();
  }, [onChanged]);

  // Asked for before the deal (an old link): show the proposal instead.
  const shownView: DocsView = view === 'inhouse' && !mcs ? 'proposal' : view;
  const pack = (k: PackKey) => data?.packs.find((p) => p.key === k) ?? null;
  const files = docs.filter((d) => !d.archived_at).length;

  const navItem = (k: PackKey) => {
    const p = pack(k);
    const h = p?.headline;
    return (
      <button key={k} type="button" className={`dk-nav__i${shownView === k ? ' on' : ''}`} aria-current={shownView === k ? 'page' : undefined} onClick={() => go(k)}>
        <span className="dk-nav__t">{{ proposal: 'Proposal', inhouse: 'In-House', handover: 'Handover' }[k]}</span>
        {h && h.total > 0 && (
          <>
            <span className="dk-nav__n">
              {h.complete}/{h.total}
            </span>
            {h.open === 0 ? (
              <span className="dk-mark dk-mark--ok" role="img" aria-label="Complete">
                <BrandIcon k="check" size={20} />
              </span>
            ) : (
              <span className="dk-mark dk-mark--warn" role="img" aria-label="Still needed">
                <BrandIcon k="warning" size={20} />
              </span>
            )}
          </>
        )}
      </button>
    );
  };

  let panel;
  if (shownView === 'general')
    panel = (
      <>
        <AssignedDocuments projectId={projectId} enquiryId={enquiryId} version={version} />
        <DocumentsTab id={projectId} docs={docs} onChanged={onChanged} siteDocs={siteDocs} handover={handover} />
      </>
    );
  else if (shownView === 'handover') {
    const p = pack('handover');
    panel = p?.ready && p.headline.total > 0 ? <HandoverTab projectId={projectId} now={now} me={me} isAdmin={isAdmin} onChanged={changed} openTab={openTab} jobRef={data?.ref ?? null} /> : (
      <div className="dk-panel">
        <header className="dk-head">
          <div className="dk-head__main">
            <h3>Handover pack</h3>
            <p className="dk-head__blurb">What the customer is given when the work is done.</p>
            <p className="dk-head__sum">{p ? (p.ready ? 'It opens when the job is Ready to book.' : 'Not set up on this system yet.') : 'Opening…'}</p>
          </div>
        </header>
      </div>
    );
  } else if (shownView === 'inhouse' && form) panel = <FormEditor key={form} projectId={projectId} code={form} isAdmin={isAdmin} me={me} onBack={() => go('inhouse')} onChanged={changed} />;
  else {
    const p = pack(shownView);
    panel = p ? <PackPanel key={shownView} projectId={projectId} pack={p} canUpload onEdit={(c) => go('inhouse', c)} onChanged={changed} /> : <p className="mcs-note">Opening…</p>;
  }

  return (
    <div className="dk">
      <nav className="dk-nav" aria-label="Documents">
        {navItem('proposal')}
        {mcs ? (
          navItem('inhouse')
        ) : (
          <button type="button" className="crm-btn crm-btn--ghost crm-btn--small dk-nav__mcs" onClick={createMcs}>
            Create MCS Pack
          </button>
        )}
        {navItem('handover')}
        <button type="button" className={`dk-nav__i${shownView === 'general' ? ' on' : ''}`} aria-current={shownView === 'general' ? 'page' : undefined} onClick={() => go('general')}>
          <span className="dk-nav__t">General</span>
          {files > 0 && <span className="dk-nav__n">{files}</span>}
        </button>
        <button
          type="button"
          className="crm-btn crm-btn--solar dk-nav__up"
          onClick={() => {
            // General's own upload: asked for before it exists, picked up when it opens.
            window.dispatchEvent(new CustomEvent('hx:add-document', { detail: { category: 'other' } }));
            go('general');
          }}
        >
          + Upload
        </button>
      </nav>
      <div className="dk-main">{panel}</div>
    </div>
  );
}
