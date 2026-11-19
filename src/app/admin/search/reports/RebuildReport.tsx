'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BrandIcon } from '@/app/admin/crm/CrmUi';
import { buildNow, deleteCustomReport, emailReport, rebuildReport } from './actions';

type Res = { ok: true; message?: string; id?: number } | { ok: false; error: string };

function useRun() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (key: string, fn: () => Promise<Res>, go = false) => {
    setBusy(key);
    setMsg(null);
    const r = await fn();
    setBusy(null);
    setMsg(r.ok ? (r.message ? { ok: true, text: r.message } : null) : { ok: false, text: r.error });
    if (r.ok) {
      if (go && r.id) router.push(`?id=${r.id}`, { scroll: false });
      router.refresh();
    }
  };
  return { busy, msg, run };
}

/** Build last week's report or last month's Growth Report now (admins). */
export function RebuildReport() {
  const { busy, msg, run } = useRun();
  return (
    <div className="sx-row">
      <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={!!busy} onClick={() => run('weekly', () => buildNow('weekly'), true)}>
        {busy === 'weekly' ? 'Building…' : 'Build last week’s report now'}
      </button>
      <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={!!busy} onClick={() => run('monthly', () => buildNow('monthly'), true)}>
        {busy === 'monthly' ? 'Building…' : 'Build last month’s Growth Report now'}
      </button>
      {msg && <small className={msg.ok ? 'sx-up' : 'sx-down'}>{msg.text}</small>}
    </div>
  );
}

/** PDF, CSV, email and rebuild for one report. */
export function ReportActions({ id, kind, status, canSpend, canDraft, sentAt }: { id: number; kind: string; status: string; canSpend: boolean; canDraft: boolean; sentAt: string | null }) {
  const { busy, msg, run } = useRun();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canRebuild = kind === 'custom' ? canDraft : canSpend && status !== 'final';
  return (
    <div className="sx-row" style={{ flexWrap: 'wrap', gap: 8 }}>
      <a className="crm-btn crm-btn--ghost crm-btn--small" href={`/api/search/reports/${id}/pdf`}>
        <BrandIcon k="download" size={16} /> PDF
      </a>
      <a className="crm-btn crm-btn--ghost crm-btn--small" href={`/api/search/reports/${id}/csv`}>
        <BrandIcon k="document" size={16} /> CSV of every table
      </a>
      {canSpend && (
        <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={!!busy} title={sentAt ? `Last emailed ${sentAt.slice(0, 10)}` : 'Not emailed yet'} onClick={() => run('email', () => emailReport(id))}>
          <BrandIcon k="mail" size={16} /> {busy === 'email' ? 'Sending…' : sentAt ? 'Email again' : 'Email to recipients'}
        </button>
      )}
      {canRebuild && (
        <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={!!busy} onClick={() => run('rebuild', () => rebuildReport(id), true)}>
          {busy === 'rebuild' ? 'Rebuilding…' : 'Rebuild with today’s data'}
        </button>
      )}
      {kind === 'custom' && canDraft && (
        <button
          type="button"
          className="crm-btn crm-btn--ghost crm-btn--small"
          disabled={!!busy}
          onClick={() => {
            if (!confirmDelete) return setConfirmDelete(true);
            run('delete', () => deleteCustomReport(id)).then(() => setConfirmDelete(false));
          }}
        >
          {busy === 'delete' ? 'Removing…' : confirmDelete ? 'Press again to remove this view' : 'Remove view'}
        </button>
      )}
      {msg && <small className={msg.ok ? 'sx-up' : 'sx-down'}>{msg.text}</small>}
    </div>
  );
}
