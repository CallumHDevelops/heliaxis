'use client';

import { useEffect, useState } from 'react';
import { BrandIcon } from '@/app/admin/crm/CrmUi';
import type { Pack } from '@/lib/docs/packs';
import type { DocsView } from './DocsHub';
import './docs.css';

/**
 * The Overview's documents card: the three packs and where each stands ("Handover: 18 of 23 complete · 5 still needed"), a tick
 * or an orange warning beside each. Tapping one opens it in Docs. Reads once per change of the job.
 */
export function DocsCard({ projectId, version, onOpen }: { projectId: string; version: string; onOpen: (view: DocsView) => void }) {
  const [packs, setPacks] = useState<Pack[] | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/crm/projects/${projectId}/packs`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (live && d) setPacks((d as { packs: Pack[] }).packs);
      })
      .catch(() => null);
    return () => {
      live = false;
    };
  }, [projectId, version]);
  if (!packs) return null;
  return (
    <section className="dk-card" aria-label="Documents">
      <h3>Documents</h3>
      <ul>
        {packs.map((p) => (
          <li key={p.key}>
            <button type="button" onClick={() => onOpen(p.key)}>
              <span className="dk-mark" role="img" aria-label={p.headline.total && p.headline.open === 0 ? 'Complete' : 'Still needed'}>
                {p.headline.total > 0 && p.headline.open === 0 ? <span className="dk-mark--ok"><BrandIcon k="check" size={20} /></span> : p.headline.total > 0 ? <span className="dk-mark--warn"><BrandIcon k="warning" size={20} /></span> : <span className="dk-mark--na"><i /></span>}
              </span>
              <span className="dk-card__t">
                <b>{p.title}</b>
                <small>{p.headline.words}</small>
              </span>
              <span className="dk-card__go" aria-hidden="true">
                Open
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
