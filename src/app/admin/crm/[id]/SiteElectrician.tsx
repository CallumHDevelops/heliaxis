'use client';

import { useState } from 'react';
import { certRouteReady } from '@/lib/site/forms/electrician/cert';

/**
 * The electrician's extras on their Site tab card: a word when their certificate route isn't one the
 * app knows (forms/electrician/cert.ts), and the photo record PDF, made when it's asked for (it can be big).
 */
export function ElectricianExtras({ a, onEdit }: { a: { id: string; trade: string; cert_route: string; photos: number; status: string }; onEdit: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (a.trade !== 'electrician') return null;
  const waiting = !certRouteReady(a.cert_route) && a.status !== 'cancelled';
  const record = async () => {
    setBusy(true);
    setErr(null);
    // Opened before the wait, so the phone's browser doesn't block it as a pop-up.
    const tab = window.open('', '_blank');
    try {
      const r = await fetch(`/api/crm/site-assignments/${a.id}/photo-record`, { method: 'POST' });
      const b = (await r.json().catch(() => ({}))) as { url?: string | null; error?: string };
      if (!r.ok || !b.url) {
        tab?.close();
        setErr(b.error ?? 'The photo record couldn’t be made. Try again.');
      } else if (tab) tab.location.href = b.url;
      else window.location.href = b.url;
    } catch {
      tab?.close();
      setErr('No connection. Try again.');
    }
    setBusy(false);
  };
  return (
    <>
      {waiting && (
        <p className="crm-banner">
          Their certificate isn’t set to one the app knows, so they can’t finish. Choose which certificate they’re doing.{' '}
          <button type="button" className="crm-link" onClick={onEdit}>
            Change it
          </button>
        </p>
      )}
      {a.photos > 0 && (
        <button type="button" className="crm-chipbtn sx-record" disabled={busy} onClick={() => void record()}>
          {busy ? 'Making the photo record…' : 'Photo record (PDF)'}
        </button>
      )}
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
    </>
  );
}
