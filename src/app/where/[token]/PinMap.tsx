'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import { distanceM, metresWords } from '@/lib/booking/location';
import './where.css';

type Pt = { lat: number; lng: number };

/**
 * A map with a pin the customer can drag (or tap the map to put it down again). Pressing the button confirms where we should
 * come. If they have moved the pin the button lights up and says so; if not it simply confirms that it was right.
 */
export function PinMap({ token, firstName, lat, lng, exact, address, surveyAt, confirmedAt, phone }: { token: string; firstName: string; lat: number; lng: number; exact: boolean; address: string; surveyAt: string | null; confirmedAt: string | null; phone: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [pin, setPin] = useState<Pt>({ lat, lng });
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<null | number>(confirmedAt ? 0 : null);
  const moved = distanceM({ lat, lng }, pin);
  const changed = touched && moved > 3;

  useEffect(() => {
    let map: import('leaflet').Map | null = null;
    let gone = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (gone || !box.current) return;
      map = L.map(box.current, { zoomControl: true, attributionControl: true }).setView([lat, lng], exact ? 19 : 18);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map);
      const icon = L.divIcon({ className: 'wh-pin', html: '<span></span>', iconSize: [34, 44], iconAnchor: [17, 44] });
      const marker = L.marker([lat, lng], { draggable: true, icon, keyboard: true, title: 'Drag me to your front door' }).addTo(map);
      const put = (p: Pt) => {
        setPin(p);
        setTouched(true);
      };
      marker.on('dragend', () => {
        const p = marker.getLatLng();
        put({ lat: p.lat, lng: p.lng });
      });
      map.on('click', (e: import('leaflet').LeafletMouseEvent) => {
        marker.setLatLng(e.latlng);
        put({ lat: e.latlng.lat, lng: e.latlng.lng });
      });
    })();
    return () => {
      gone = true;
      map?.remove();
    };
  }, [lat, lng, exact]);

  async function confirm() {
    setBusy(true);
    setErr('');
    try {
      const r = await fetch(`/api/where/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lat: pin.lat, lng: pin.lng }) });
      const d = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (r.ok && d.ok) setDone(moved);
      else setErr(d.error || `Something went wrong. Please call us on ${phone}.`);
    } catch {
      setErr(`That didn’t send. Check your signal and try again, or call us on ${phone}.`);
    }
    setBusy(false);
  }

  const when = surveyAt ? new Date(surveyAt).toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }) : '';
  if (done !== null) {
    return (
      <section className="bk-card bk-card--done wh-done">
        <h1 className="bk-h">Thank you{firstName ? `, ${firstName}` : ''}</h1>
        <p>We have your location{done > 10 ? ' (thanks for moving the pin)' : ''}.{when ? ` See you on ${when}.` : ''}</p>
        <p>Need to change anything? Call us on <a href={`tel:${phone.replace(/\s/g, '')}`}>{phone}</a>.</p>
      </section>
    );
  }
  return (
    <div className="wh">
      <h1 className="bk-title">{firstName ? `Hi ${firstName}, is the pin in the right place?` : 'Is the pin in the right place?'}</h1>
      <p className="bk-lead">
        {address ? <b>{address}. </b> : null}
        {exact ? 'Please check it, so we find you first time.' : 'This is the middle of your postcode, so please drag the pin to your front door.'}
        {when ? ` We’ll see you on ${when}.` : ''}
      </p>
      <div className="wh-map" ref={box} role="application" aria-label="Map with a pin you can move" />
      <p className="wh-hint">Wrong place? Drag the pin, or tap the map, to where we should park or knock.</p>
      {err && <p className="wh-err" role="alert">{err}</p>}
      <div className="wh-bar">
        <button type="button" className={`wh-btn${changed ? ' is-moved' : ''}`} disabled={busy} onClick={() => void confirm()}>
          {busy ? 'Sending…' : changed ? 'Confirm new location' : 'That’s right: confirm location'}
        </button>
        {changed && <span className="wh-moved">You’ve moved the pin {metresWords(moved)}</span>}
      </div>
    </div>
  );
}
