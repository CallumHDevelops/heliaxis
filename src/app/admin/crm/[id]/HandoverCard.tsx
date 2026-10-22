'use client';

import { useEffect, useState } from 'react';
import './handover.css';

type Summary = { words: string; next: string; complete: number; total: number; sent: boolean };

/**
 * The Overview's handover card (screen D13): "Handover: 18 of 23 complete · Send the pack to the
 * customer", tapping through to the Handover tab. Reads the summary once per change of the job.
 */
export function HandoverCard({ projectId, version, onOpen }: { projectId: string; version: string; onOpen: () => void }) {
  const [s, setS] = useState<Summary | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/crm/projects/${projectId}/handover?summary=1`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (live && d) setS(d as Summary);
      })
      .catch(() => null);
    return () => {
      live = false;
    };
  }, [projectId, version]);
  if (!s) return null;
  const pct = s.total ? Math.round((s.complete / s.total) * 100) : 0;
  return (
    <button type="button" className="hv-card" onClick={onOpen}>
      <span className="hv-card__lab">Handover pack</span>
      <b>{s.words}</b>
      <span className="hv-card__bar">
        <span style={{ width: `${pct}%` }} />
      </span>
      <span className="hv-card__next">
        {s.sent ? '✓ Sent · ' : ''}
        {s.next} →
      </span>
    </button>
  );
}
