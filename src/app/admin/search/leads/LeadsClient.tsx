'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { applyBackfill, previewBackfill } from './actions';
import type { BackfillChange } from '@/lib/search/leads/aggregate';
import { CHANNEL_LABEL } from '@/lib/search/channel';

const channelLabel = (c: string) => (CHANNEL_LABEL as Record<string, string>)[c] ?? c;

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });

/** Admins: label older enquiries whose source names a channel, after seeing exactly which rows change. */
export function BackfillPanel() {
  const router = useRouter();
  const [rows, setRows] = useState<BackfillChange[] | null>(null);
  const [busy, setBusy] = useState<'preview' | 'apply' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const counts = new Map<string, number>();
  for (const r of rows ?? []) counts.set(r.channel, (counts.get(r.channel) ?? 0) + 1);

  return (
    <div>
      <div className="sx-row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="crm-btn crm-btn--ghost crm-btn--small"
          disabled={busy !== null}
          onClick={async () => {
            setBusy('preview');
            setMsg(null);
            const r = await previewBackfill();
            setBusy(null);
            if (r.ok) setRows(r.data);
            else setMsg(r.error);
          }}
        >
          {busy === 'preview' ? 'Checking…' : rows ? 'Check again' : 'Preview the changes'}
        </button>
        {rows && rows.length > 0 && (
          <button
            type="button"
            className="crm-btn crm-btn--solar crm-btn--small"
            disabled={busy !== null}
            onClick={async () => {
              setBusy('apply');
              setMsg(null);
              const r = await applyBackfill(rows.map((x) => ({ table: x.table, id: x.id, channel: x.channel })));
              setBusy(null);
              if (r.ok) {
                setMsg(`Labelled ${r.data.updated}${r.data.skipped ? `; ${r.data.skipped} had changed since the preview and were left alone` : ''}.`);
                setRows(null);
                router.refresh();
              } else setMsg(r.error);
            }}
          >
            {busy === 'apply' ? 'Labelling…' : `Label these ${rows.length}`}
          </button>
        )}
        {msg && <small className="sx-note">{msg}</small>}
      </div>
      {rows && rows.length === 0 && <p className="sx-note">Nothing to label: every unlabelled row has a source that does not name a channel.</p>}
      {rows && rows.length > 0 && (
        <>
          <p className="sx-note">
            {[...counts.entries()].map(([c, k]) => `${k} to ${channelLabel(c)}`).join(', ')}. Only rows with no channel are changed.
          </p>
          <div className="sx-tablewrap" style={{ maxHeight: 360, overflow: 'auto' }}>
            <table className="sx-table">
              <thead>
                <tr>
                  <th>Came in</th>
                  <th>Who</th>
                  <th>Source label</th>
                  <th>Will be labelled</th>
                  <th>Because</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.table}:${r.id}`}>
                    <td>{day(r.at)}</td>
                    <td>{r.name ?? <span className="sx-note">Lead kept by a merge</span>}</td>
                    <td className="sx-note">{r.source}</td>
                    <td>{channelLabel(r.channel)}</td>
                    <td className="sx-note">{r.rule}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
