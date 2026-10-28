'use client';

import { useEffect, useState } from 'react';

type Sug = { id: string; address: string };
export type NewCustomer = { id: string; customer: string; postcode: string | null };

const PRODUCT_FOR: Record<string, string[]> = { solar: ['solar'], ashp: ['heatpump'], solar_ashp: ['solar', 'heatpump'] };

/**
 * "+ Add Andy as a new customer" from Find a time: their details (name, mobile, email, address with
 * lookup), saved as a new opportunity marked as spoken to. Then back to the appointment with them chosen.
 */
export function NewCustomerSheet({ name: initial, type, onClose, onCreated }: { name: string; type: string | null; onClose: () => void; onCreated: (c: NewCustomer) => void }) {
  const [name, setName] = useState(initial);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [postcode, setPostcode] = useState('');
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [q, setQ] = useState('');
  const [sugs, setSugs] = useState<Sug[]>([]);
  const [lookup, setLookup] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const t = q.trim();

  useEffect(() => {
    if (t.length < 3 || !lookup) return;
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/crm/address?q=${encodeURIComponent(t)}`, { cache: 'no-store', signal: ctl.signal });
        const d = (await r.json().catch(() => ({}))) as { configured?: boolean; suggestions?: Sug[] };
        if (d.configured === false) return setLookup(false);
        setSugs(d.suggestions ?? []);
      } catch {
        // Still typing, or offline.
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [t, lookup]);

  async function pick(s: Sug) {
    setBusy(true);
    setErr('');
    const r = await fetch(`/api/crm/address?id=${encodeURIComponent(s.id)}`, { cache: 'no-store' });
    const d = (await r.json().catch(() => ({}))) as { address?: string; postcode?: string; lat?: number | null; lng?: number | null; error?: string };
    setBusy(false);
    if (!r.ok || !d.address) return setErr(d.error || 'Couldn’t get that address. Type it in instead.');
    setAddress(d.address);
    setPostcode(d.postcode ?? '');
    setPin(typeof d.lat === 'number' && typeof d.lng === 'number' ? { lat: d.lat, lng: d.lng } : null);
    setSugs([]);
    setQ('');
  }

  async function save() {
    if (!name.trim()) return setErr('Add their name.');
    if (postcode.replace(/\s/g, '').length < 5) return setErr('Add the address or postcode: the appointment needs it.');
    setBusy(true);
    setErr('');
    const r = await fetch('/api/crm/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        postcode: postcode.trim().toUpperCase(),
        address: address.trim(),
        products: (type && PRODUCT_FOR[type]) || [],
        start_stage: 'lead',
        source: 'Phone call',
        spoken: true,
        ...(pin ? { site_lat: pin.lat, site_lng: pin.lng } : {}),
      }),
    });
    const d = (await r.json().catch(() => ({}))) as { id?: string; error?: string };
    setBusy(false);
    if (!r.ok || !d.id) return setErr(d.error || 'Not added. Try again.');
    onCreated({ id: d.id, customer: name.trim(), postcode: postcode.trim().toUpperCase() || null });
  }

  return (
    <div className="dy-sheet" role="dialog" aria-modal="true" aria-labelledby="dy-newcust-title" onClick={onClose}>
      <div className="dy-sheet-box" onClick={(e) => e.stopPropagation()}>
        <div className="dy-sheet-top">
          <h2 id="dy-newcust-title">New customer</h2>
          <button type="button" className="dy-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <label className="dy-label" htmlFor="nc-name">
          Name
        </label>
        <input id="nc-name" className="dy-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        <label className="dy-label" htmlFor="nc-phone">
          Mobile
        </label>
        <input id="nc-phone" className="dy-input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" />
        <label className="dy-label" htmlFor="nc-email">
          Email
        </label>
        <input id="nc-email" className="dy-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        {lookup && (
          <>
            <label className="dy-label" htmlFor="nc-find">
              Find the address
            </label>
            <input
              id="nc-find"
              className="dy-input"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setSugs([]);
              }}
              placeholder="House number and street, or postcode"
              autoComplete="off"
            />
            {t.length >= 3 && sugs.length > 0 && (
              <ul className="dy-results">
                {sugs.map((s) => (
                  <li key={s.id}>
                    <button type="button" disabled={busy} onClick={() => void pick(s)}>
                      {s.address}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <label className="dy-label" htmlFor="nc-address">
          Address
        </label>
        <input
          id="nc-address"
          className="dy-input"
          value={address}
          onChange={(e) => {
            setAddress(e.target.value);
            setPin(null);
          }}
          autoComplete="off"
        />
        <label className="dy-label" htmlFor="nc-pc">
          Postcode
        </label>
        <input
          id="nc-pc"
          className="dy-input"
          value={postcode}
          onChange={(e) => {
            setPostcode(e.target.value);
            setPin(null);
          }}
          autoComplete="off"
        />
        {err && (
          <p className="dy-error" role="alert">
            {err}
          </p>
        )}
        <div className="dy-actions">
          <button type="button" className="dy-btn dy-btn--solar" disabled={busy} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save and find a time'}
          </button>
          <button type="button" className="dy-btn dy-btn--ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
