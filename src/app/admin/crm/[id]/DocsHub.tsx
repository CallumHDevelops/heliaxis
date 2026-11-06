'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PackHeadline } from '@/lib/inhouse/pack';
import { FormEditor } from './FormEditor';
import { McsPack } from './McsPack';
import { DocumentsTab } from './ProjectExtras';
import './mcs.css';

export type DocsView = 'files' | 'mcs';
type DocsProps = Parameters<typeof DocumentsTab>[0];
type Props = {
  projectId: string;
  docs: DocsProps['docs'];
  onChanged: DocsProps['onChanged'];
  siteDocs: boolean;
  handover: boolean;
  /** From Won: the MCS pack exists. */
  mcsOn: boolean;
  isAdmin: boolean;
  me: string;
  version: string;
  initialView: DocsView | null;
  initialForm: string | null;
  /** A request from elsewhere on the page (the Overview card) to open the MCS pack, or a form in it. */
  jump: { form: string | null; key: number } | null;
  openHandover: () => void;
};

/** Keep the address in step, so the MCS pack (or one form in it) can be linked to and survives a refresh. */
function remember(view: DocsView, form: string | null) {
  try {
    const url = new URL(window.location.href);
    if (view === 'mcs') url.searchParams.set('view', 'mcs');
    else url.searchParams.delete('view');
    if (view === 'mcs' && form) url.searchParams.set('form', form);
    else url.searchParams.delete('form');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // The view still changes; only a refresh won't remember it.
  }
}

/**
 * The Docs tab: the job’s files, and beside them the MCS pack. A switch at the top moves between the two; the Overview card and
 * links with `?tab=docs&view=mcs` (and `&form=HX-HP-02` for one form) go straight in. The files view is the same Docs tab as ever.
 */
export function DocsHub({
  projectId,
  docs,
  onChanged,
  siteDocs,
  handover,
  mcsOn,
  isAdmin,
  me,
  version,
  initialView,
  initialForm,
  jump,
  openHandover,
}: Props) {
  // Opened by the address (?view=mcs&form=…) or by the Overview's card (jump): straight into the pack.
  const direct = mcsOn && (jump !== null || initialView === 'mcs');
  const [view, setView] = useState<DocsView>(direct ? 'mcs' : 'files');
  const [form, setForm] = useState<string | null>(direct ? (jump ? jump.form : initialForm) : null);
  const [head, setHead] = useState<PackHeadline | null>(null);
  const [tick, setTick] = useState(0);

  const go = useCallback((v: DocsView, f: string | null = null) => {
    setView(v);
    setForm(f);
  }, []);

  // The Overview card asked for the pack (each request has a new key).
  const [asked, setAsked] = useState(jump?.key ?? 0);
  if (jump && jump.key !== asked) {
    setAsked(jump.key);
    if (mcsOn) go('mcs', jump.form);
  }

  // The address follows the view, so the pack (or one form) can be linked to and survives a refresh.
  useEffect(() => {
    if (mcsOn) remember(view, form);
  }, [mcsOn, view, form]);

  // The label's count: read lightly, and again when a form or a file changes.
  useEffect(() => {
    if (!mcsOn) return;
    let live = true;
    fetch(`/api/crm/projects/${projectId}/mcs?summary=1`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && d && setHead(d as PackHeadline))
      .catch(() => null);
    return () => {
      live = false;
    };
  }, [projectId, mcsOn, version, tick]);

  if (!mcsOn)
    return <DocumentsTab id={projectId} docs={docs} onChanged={onChanged} siteDocs={siteDocs} handover={handover} />;

  return (
    <div className="mcs-hub">
      <div className="mcs-switch" role="tablist" aria-label="Documents">
        <button type="button" role="tab" aria-selected={view === 'files'} className={view === 'files' ? 'on' : ''} onClick={() => go('files')}>
          Files{docs.filter((d) => !d.archived_at).length > 0 && <i>{docs.filter((d) => !d.archived_at).length}</i>}
        </button>
        <button type="button" role="tab" aria-selected={view === 'mcs'} className={view === 'mcs' ? 'on' : ''} onClick={() => go('mcs')}>
          MCS pack{head && head.total > 0 && <i>{head.complete}/{head.total}</i>}
        </button>
      </div>
      {view === 'files' ? (
        <DocumentsTab id={projectId} docs={docs} onChanged={onChanged} siteDocs={siteDocs} handover={handover} />
      ) : form ? (
        <FormEditor key={form} projectId={projectId} code={form} isAdmin={isAdmin} me={me} onBack={() => go('mcs')} onChanged={() => setTick((n) => n + 1)} />
      ) : (
        <McsPack projectId={projectId} version={`${version}:${tick}`} onOpenForm={(c) => go('mcs', c)} onOpenHandover={openHandover} />
      )}
    </div>
  );
}
