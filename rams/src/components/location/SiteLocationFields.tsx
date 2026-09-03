'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Alert, Badge, Button, Field, Input, Textarea } from '@/components/ui';
import type { HospitalCandidate } from '@/lib/location/hospitals';
import type { Project } from '@/lib/types';

type Suggestion = { id: string; label: string };

const CLASSIFICATION = {
  full_ae: { label: 'A&E', tone: 'ok' as const, help: 'Tagged as an emergency department' },
  unknown: { label: 'Unconfirmed', tone: 'warn' as const, help: 'Emergency provision unclear — check before relying on it' },
  minor_only: { label: 'Minor injuries only', tone: 'danger' as const, help: 'Urgent treatment or minor injuries unit — cannot receive major trauma' },
};

/**
 * The site block of the project form. Address search, postcode geocoding,
 * what3words and the nearest-A&E picker all write into the same named inputs
 * the server action already reads, so this stays a plain progressively-enhanced
 * form — every field can still be typed by hand if a lookup is unavailable.
 */
export function SiteLocationFields({ project }: { project?: Project }) {
  const listId = useId();

  const [address, setAddress] = useState(project?.site_address ?? '');
  const [postcode, setPostcode] = useState(project?.site_postcode ?? '');
  const [w3w, setW3w] = useState(project?.what3words ?? '');
  const [hospital, setHospital] = useState(project?.nearest_hospital ?? '');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    project?.site_lat != null && project?.site_lng != null
      ? { lat: project.site_lat, lng: project.site_lng }
      : null
  );

  const [term, setTerm] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [lookupEnabled, setLookupEnabled] = useState(true);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [hospitals, setHospitals] = useState<HospitalCandidate[] | null>(null);
  const [findingAe, setFindingAe] = useState(false);

  const boxRef = useRef<HTMLDivElement>(null);
  // Guards against a slow early response overwriting a later, more specific one.
  const requestSeq = useRef(0);

  useEffect(() => {
    const t = setTimeout(async () => {
      const q = term.trim();
      if (q.length < 3) {
        setSuggestions([]);
        return;
      }
      const seq = ++requestSeq.current;
      setSearching(true);
      try {
        const res = await fetch(`/api/location/autocomplete?q=${encodeURIComponent(q)}`);
        const body = await res.json();
        if (seq !== requestSeq.current) return;
        if (body.enabled === false) {
          setLookupEnabled(false);
          setSuggestions([]);
          return;
        }
        setSuggestions(body.suggestions ?? []);
        setOpen(true);
        setActive(-1);
      } catch {
        if (seq === requestSeq.current) setSuggestions([]);
      } finally {
        if (seq === requestSeq.current) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [term]);

  useEffect(() => {
    function onClickAway(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, []);

  const choose = useCallback(async (s: Suggestion) => {
    setOpen(false);
    setTerm(s.label);
    setError(null);
    try {
      const res = await fetch(`/api/location/address?id=${encodeURIComponent(s.id)}`);
      if (!res.ok) {
        setError('That address could not be resolved. Type it in below instead.');
        return;
      }
      const body = await res.json();
      const a = body.address;
      setAddress(a.lines.filter(Boolean).join('\n'));
      setPostcode(a.postcode ?? '');
      if (a.lat != null && a.lng != null) setCoords({ lat: a.lat, lng: a.lng });
      if (body.what3words) setW3w(body.what3words);
      // A new site invalidates whichever hospital was picked for the old one.
      setHospitals(null);
    } catch {
      setError('Address lookup failed. Type the address in below instead.');
    }
  }, []);

  async function lookupPostcode() {
    setError(null);
    try {
      const res = await fetch(`/api/location/postcode?pc=${encodeURIComponent(postcode)}`);
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? 'Postcode not found.');
        return;
      }
      setCoords({ lat: body.postcode.lat, lng: body.postcode.lng });
      if (body.what3words) setW3w(body.what3words);
      setHospitals(null);
    } catch {
      setError('Postcode lookup failed.');
    }
  }

  async function findHospitals() {
    setError(null);
    setFindingAe(true);
    try {
      const query = coords
        ? `lat=${coords.lat}&lng=${coords.lng}`
        : `pc=${encodeURIComponent(postcode)}`;
      const res = await fetch(`/api/location/hospitals?${query}`);
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? 'Could not search for hospitals.');
        return;
      }
      setHospitals(body.candidates ?? []);
    } catch {
      setError('Hospital search failed. Enter the nearest A&E by hand.');
    } finally {
      setFindingAe(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      choose(suggestions[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <>
      {/* Coordinates ride along so the report and any later lookup can use them. */}
      <input type="hidden" name="site_lat" value={coords?.lat ?? ''} />
      <input type="hidden" name="site_lng" value={coords?.lng ?? ''} />

      {error && (
        <div className="sm:col-span-2">
          <Alert tone="warn">{error}</Alert>
        </div>
      )}

      {lookupEnabled && (
        <div className="sm:col-span-2" ref={boxRef}>
          <Field
            label="Find the address"
            hint="Start typing a postcode or street — powered by Royal Mail PAF data."
          >
            <div className="relative">
              <Input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                onKeyDown={onKeyDown}
                onFocus={() => suggestions.length > 0 && setOpen(true)}
                placeholder="NP44 3TG, or 12 Ffordd Ganol"
                role="combobox"
                aria-expanded={open}
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
                autoComplete="off"
              />
              {searching && (
                <span className="mono absolute right-3 top-1/2 -translate-y-1/2 text-[0.7rem] text-muted">
                  searching…
                </span>
              )}

              {open && suggestions.length > 0 && (
                <ul
                  id={listId}
                  role="listbox"
                  className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-[2px] border border-[color:var(--line-strong)] bg-card shadow-sm"
                >
                  {suggestions.map((s, i) => (
                    <li key={s.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
                      <button
                        type="button"
                        onMouseEnter={() => setActive(i)}
                        onClick={() => choose(s)}
                        className={`block w-full px-3 py-2 text-left text-[0.84rem] ${
                          i === active ? 'bg-solar/20' : 'hover:bg-paper-2'
                        }`}
                      >
                        {s.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Field>
        </div>
      )}

      <Field label="Site address" className="sm:col-span-2">
        <Textarea
          name="site_address"
          rows={3}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      </Field>

      <Field label="Postcode">
        <div className="flex gap-2">
          <Input
            name="site_postcode"
            value={postcode}
            onChange={(e) => setPostcode(e.target.value)}
          />
          <Button type="button" variant="ghost" size="sm" onClick={lookupPostcode} disabled={!postcode}>
            Locate
          </Button>
        </div>
      </Field>

      <Field
        label="what3words"
        hint={
          coords
            ? 'Derived from the site coordinates. Adjust if the working position differs.'
            : 'Locate the postcode to fill this automatically.'
        }
      >
        <Input
          name="what3words"
          value={w3w}
          onChange={(e) => setW3w(e.target.value)}
          placeholder="///filled.count.soap"
        />
      </Field>

      <div className="sm:col-span-2">
        <Field
          label="Nearest A&E"
          hint="Printed on the report cover so an operative can be taken to the right place."
        >
          <div className="flex gap-2">
            <Input
              name="nearest_hospital"
              value={hospital}
              onChange={(e) => setHospital(e.target.value)}
              placeholder="Royal Gwent Hospital, Cardiff Rd, Newport NP20 2UB"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={findHospitals}
              disabled={findingAe || (!coords && !postcode)}
            >
              {findingAe ? 'Searching…' : 'Find nearest'}
            </Button>
          </div>
        </Field>

        {hospitals !== null && (
          <div className="mt-3 rounded-[2px] border border-[color:var(--line)] bg-paper-2/50 p-3">
            {hospitals.length === 0 ? (
              <p className="text-[0.84rem] text-muted">
                Nothing found within 40 km. Enter the nearest A&E by hand.
              </p>
            ) : (
              <>
                <p className="mb-2 text-[0.8rem] text-muted">
                  OpenStreetMap suggestions, nearest first.{' '}
                  <strong className="text-ink">
                    Confirm the department actually receives major trauma
                  </strong>{' '}
                  — a minor injuries unit is not a substitute.
                </p>
                <ul className="space-y-1.5">
                  {hospitals.map((h) => {
                    const c = CLASSIFICATION[h.classification];
                    return (
                      <li key={h.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setHospital(
                              [h.name, h.address, h.phone].filter(Boolean).join(', ') +
                                ` — ${h.distanceKm} km`
                            );
                            setHospitals(null);
                          }}
                          className="flex w-full items-center gap-2.5 rounded-[2px] border border-[color:var(--line)] bg-card px-3 py-2 text-left hover:border-[color:var(--line-strong)]"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[0.85rem] font-semibold">
                              {h.name}
                            </span>
                            <span className="block truncate text-[0.75rem] text-muted">
                              {h.address ?? 'No address recorded'}
                            </span>
                          </span>
                          <Badge tone={c.tone} className="shrink-0">
                            {c.label}
                          </Badge>
                          <span className="mono shrink-0 text-[0.75rem] text-muted">
                            {h.distanceKm} km
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
