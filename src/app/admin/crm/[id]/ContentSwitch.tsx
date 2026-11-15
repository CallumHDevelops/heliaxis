'use client';

import { useEffect, useState } from 'react';

/** "Share with the content team": on for every new project. Turn it off for a customer who has asked us not to use photos of their home. */
export function ContentSwitch({ id }: { id: string }) {
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void fetch(`/api/content/projects/${id}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setOn(d.content_ok !== false))
      .catch(() => null);
  }, [id]);
  if (on === null) return null;
  async function toggle() {
    setBusy(true);
    const next = !on;
    const r = await fetch(`/api/content/projects/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content_ok: next }) });
    if (r.ok) setOn(next);
    setBusy(false);
  }
  return (
    <p className="crm-small" style={{ margin: '0 0 8px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <span>{on ? 'Site, progress and finished photos are shared with the content team.' : 'Photos from this project are not shared with the content team.'}</span>
      <button type="button" className="crm-link" disabled={busy} onClick={() => void toggle()}>
        {on ? 'Stop sharing' : 'Share them'}
      </button>
    </p>
  );
}
