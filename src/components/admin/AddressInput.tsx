'use client';

import { useEffect, useState } from 'react';

type Sug = { id: string; address: string };
type Got = { address: string; postcode: string };

/**
 * One address box that is also the lookup: type, and matching addresses are offered under it; pick one and it is filled in (house, street,
 * town and postcode). Anything typed by hand is kept as typed. Without a lookup service it is just a box. `onCommit` gets the whole address as
 * one line, when it is picked or when the box is left; `onPick` also gets the address and postcode apart when one was picked.
 */
export function AddressInput({ value, onCommit, onPick, disabled, id = 'ai', placeholder = 'Start typing the house number and street, or the postcode' }: { value: string; onCommit: (address: string) => void; onPick?: (a: Got) => void; disabled?: boolean; id?: string; placeholder?: string }) {
  const [text, setText] = useState(value);
  const [sugs, setSugs] = useState<Sug[]>([]);
  const [on, setOn] = useState(true);
  const [typed, setTyped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [seen, setSeen] = useState(value);
  const t = text.trim();

  // What the page holds changed from outside (another address chosen): show it.
  if (value !== seen) {
    setSeen(value);
    setText(value);
  }

  useEffect(() => {
    if (!typed || !on || t.length < 3) return;
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
  }, [t, typed, on]);

  const commit = (v: string) => {
    if (v.trim() !== value.trim()) onCommit(v);
  };

  async function pick(s: Sug) {
    setBusy(true);
    setErr('');
    const r = await fetch(`/api/crm/address?id=${encodeURIComponent(s.id)}`, { cache: 'no-store' });
    const d = (await r.json().catch(() => ({}))) as { address?: string; postcode?: string; error?: string };
    setBusy(false);
    if (!r.ok || !d.address) return setErr(d.error || 'Couldn’t get that address. Type it in instead.');
    const whole = [d.address, d.postcode].filter(Boolean).join(', ');
    setText(whole);
    setSugs([]);
    setTyped(false);
    commit(whole);
    onPick?.({ address: d.address, postcode: d.postcode ?? '' });
  }

  return (
    <div className="ai-box">
      <input
        id={id}
        className="crm-input"
        value={text}
        disabled={disabled || busy}
        placeholder={placeholder}
        autoComplete="off"
        role={on ? 'combobox' : undefined}
        aria-expanded={sugs.length > 0}
        onChange={(e) => {
          setText(e.target.value);
          setTyped(true);
          setSugs([]);
        }}
        // A moment after leaving, so a click on a suggestion lands first.
        onBlur={() => setTimeout(() => { setSugs([]); setTyped(false); commit(text); }, 180)}
      />
      {err && <small className="em-err">{err}</small>}
      {typed && sugs.length > 0 && (
        <ul className="ai-list" role="listbox">
          {sugs.map((s) => (
            <li key={s.id}>
              <button type="button" role="option" aria-selected="false" onMouseDown={(e) => e.preventDefault()} onClick={() => void pick(s)}>
                {s.address}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
