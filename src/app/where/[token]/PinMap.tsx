'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import { distanceM, metresWords } from '@/lib/booking/location';
import './where.css';

type Pt = { lat: number; lng: number };

/* eslint-disable @typescript-eslint/no-explicit-any */
let googleLoading: Promise<any> | null = null;
/** Google Maps' script, once (Maps JavaScript API, a browser key limited to this website). */
function loadGoogle(key: string): Promise<any> {
  const w = window as any;
  if (w.google?.maps?.Map) return Promise.resolve(w.google);
  googleLoading ??= new Promise((resolve, reject) => {
    w.__hxMapsReady = () => resolve(w.google);
    const el = document.createElement('script');
    el.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&callback=__hxMapsReady`;
    el.async = true;
    el.onerror = () => reject(new Error('Google Maps did not load'));
    document.head.appendChild(el);
    setTimeout(() => reject(new Error('Google Maps timed out')), 12000);
  });
  return googleLoading;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * A map with a pin the customer can drag (or tap the map to put it down again). Pressing the button confirms where we should
 * come. If they have moved the pin the button lights up and says so; if not it simply confirms that it was right.
 */
export function PinMap({ token, firstName, lat, lng, exact, address, surveyAt, confirmedAt, phone, googleKey }: { token: string; firstName: string; lat: number; lng: number; exact: boolean; address: string; surveyAt: string | null; confirmedAt: string | null; phone: string; googleKey: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [pin, setPin] = useState<Pt>({ lat, lng });
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<null | number>(confirmedAt ? 0 : null);
  const moved = distanceM({ lat, lng }, pin);
  const changed = touched && moved > 3;

  useEffect(() => {
    let cleanup = () => undefined as void;
    let gone = false;
    const put = (p: Pt) => {
      setPin(p);
      setTouched(true);
    };
    // Google's satellite map with a pin to drag (the same pictures as the roof reports); the free street map if Google isn't set up.
    const startGoogle = async (): Promise<boolean> => {
      if (!googleKey || !box.current) return false;
      try {
        const g = await loadGoogle(googleKey);
        if (gone || !box.current) return true;
        const map = new g.maps.Map(box.current, { center: { lat, lng }, zoom: exact ? 20 : 19, mapTypeId: 'hybrid', tilt: 0, gestureHandling: 'greedy', streetViewControl: false, fullscreenControl: false, rotateControl: false, mapTypeControl: true, mapTypeControlOptions: { mapTypeIds: ['hybrid', 'roadmap'] }, clickableIcons: false });
        const marker = new g.maps.Marker({ position: { lat, lng }, map, draggable: true, title: 'Drag me to your front door', icon: { path: 'M12 0C7.6 0 4 3.6 4 8c0 6 8 16 8 16s8-10 8-16c0-4.4-3.6-8-8-8zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6z', fillColor: '#F8BC1E', fillOpacity: 1, strokeColor: '#211F18', strokeWeight: 2, scale: 2, anchor: new g.maps.Point(12, 24) } });
        marker.addListener('dragend', () => {
          const p = marker.getPosition();
          put({ lat: p.lat(), lng: p.lng() });
        });
        map.addListener('click', (e: { latLng: { lat: () => number; lng: () => number } }) => {
          marker.setPosition(e.latLng);
          put({ lat: e.latLng.lat(), lng: e.latLng.lng() });
        });
        return true;
      } catch {
        return false;
      }
    };
    const startLeaflet = async () => {
      const L = (await import('leaflet')).default;
      if (gone || !box.current) return;
      const map = L.map(box.current, { zoomControl: true, attributionControl: true }).setView([lat, lng], exact ? 19 : 18);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map);
      const icon = L.divIcon({ className: 'wh-pin', html: '<span></span>', iconSize: [34, 44], iconAnchor: [17, 44] });
      const marker = L.marker([lat, lng], { draggable: true, icon, keyboard: true, title: 'Drag me to your front door' }).addTo(map);
      marker.on('dragend', () => {
        const p = marker.getLatLng();
        put({ lat: p.lat, lng: p.lng });
      });
      map.on('click', (e: import('leaflet').LeafletMouseEvent) => {
        marker.setLatLng(e.latlng);
        put({ lat: e.latlng.lat, lng: e.latlng.lng });
      });
      cleanup = () => map.remove();
    };
    (async () => {
      // Google refusing the key after the script loaded (a wrong referrer, the API not switched on) lands here too.
      (window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
        if (box.current) box.current.innerHTML = '';
        void startLeaflet();
      };
      if (!(await startGoogle())) await startLeaflet();
    })();
    return () => {
      gone = true;
      cleanup();
    };
  }, [lat, lng, exact, googleKey]);

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
      {err && <p className="wh-err" role="alert">{err}</p>}
      <div className="wh-bar">
        <button type="button" className={`wh-btn${changed ? ' is-moved' : ''}`} disabled={busy} onClick={() => void confirm()}>
          {busy ? 'Sending…' : changed ? 'Confirm new location' : 'That’s right: confirm location'}
        </button>
        {changed && <span className="wh-moved">You’ve moved the pin {metresWords(moved)}</span>}
      </div>
      <p className="wh-hint">Wrong place? Drag the pin, or tap the map, to where we should park or knock. Use the Map / Satellite switch on the map to see your house.</p>
    </div>
  );
}
