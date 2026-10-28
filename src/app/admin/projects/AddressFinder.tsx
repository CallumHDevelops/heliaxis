'use client';

import { useEffect, useState } from 'react';

type Sug = { id: string; address: string };

/**
 * "Find the address": type part of it, pick the match, and the address and postcode are filled in. Without a lookup service
 * (no key set up) it says nothing and the boxes beside it are typed as before.
 */
export function AddressFinder({ onPick }: { onPick: (a: { address: string; postcode: string; lat?: number | null; lng?: number | null }) => void }) {
  const [q, setQ] = useState('');
  const [sugs, setSugs] = useState<Sug[]>([]);
  const [on, setOn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const t = q.trim();

  useEffect(() => {
    if (t.length < 3) return;
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/crm/address?q=${encodeURIComponent(t)}`, { cache: 'no-store', signal: ctl.signal });
        const d = (await r.json().catch(() => ({}))) as { configured?: boolean; suggestions?: Sug[] };
        if (d.configured === false) return setOn(false);
        setSugs(d.suggestions ?? []);
      } catch {
        // Still typing, or offline.
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [t]);

  async function pick(s: Sug) {
    setBusy(true);
    setErr('');
    const r = await fetch(`/api/crm/address?id=${encodeURIComponent(s.id)}`, { cache: 'no-store' });
    const d = (await r.json().catch(() => ({}))) as { address?: string; postcode?: string; lat?: number | null; lng?: number | null; error?: string };
    setBusy(false);
    if (!r.ok || !d.address) return setErr(d.error || 'Couldn’t get that address. Type it in instead.');
    onPick({ address: d.address, postcode: d.postcode ?? '', lat: d.lat, lng: d.lng });
    setSugs([]);
    setQ('');
  }

  if (!on) return null;
  return (
    <div className="crmh-picker">
      <label className="crm-label" htmlFor="af-q">
        Find the address
      </label>
      <input id="af-q" className="crm-input" value={q} onChange={(e) => { setQ(e.target.value); setSugs([]); }} placeholder="Start typing the house number and street or postcode" autoComplete="off" role="combobox" aria-controls="af-list" aria-expanded={sugs.length > 0} />
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
      {t.length >= 3 && sugs.length > 0 && (
        <ul id="af-list" className="crmh-picker__list" role="listbox">
          {sugs.map((s) => (
            <li key={s.id}>
              <button type="button" disabled={busy} onClick={() => void pick(s)}>
                <span>
                  <b>{s.address}</b>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
