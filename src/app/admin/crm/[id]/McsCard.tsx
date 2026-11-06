'use client';

import { useEffect, useState } from 'react';
import type { PackHeadline } from '@/lib/inhouse/pack';
import './handover.css';

/**
 * The Overview's MCS pack card: "9 of 14 complete · 2 waiting · 3 missing", tapping through to Docs → MCS pack.
 * Reads the headline once per change of the job.
 */
export function McsCard({ projectId, version, onOpen }: { projectId: string; version: string; onOpen: () => void }) {
  const [s, setS] = useState<PackHeadline | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/crm/projects/${projectId}/mcs?summary=1`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (live && d) setS(d as PackHeadline);
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
      <span className="hv-card__lab">MCS pack</span>
      <b>{s.words || 'Nothing to do yet'}</b>
      <span className="hv-card__bar">
        <span style={{ width: `${pct}%` }} />
      </span>
      <span className="hv-card__next">Open the MCS pack →</span>
    </button>
  );
}
