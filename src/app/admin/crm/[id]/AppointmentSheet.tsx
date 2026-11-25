'use client';

import { useState } from 'react';
import { FindTimeSheet } from '../../surveys/FindTimeSheet';
import { useBookingPeople } from '../../projects/AutoNotice';
import { Sheet } from '../CrmUi';
import '../../surveys/diary.css';

/**
 * "Appointment" from the + menu: put something in your diary for this customer. A survey opens Find a time (it checks the diary and the
 * driving); a call, site visit, meeting or anything else is a short form. Saved through /api/crm/diary-entries on this job, and copied to
 * Outlook by the diary's sync.
 */
type Kind = 'survey' | 'call' | 'visit' | 'meeting' | 'other';
type Where = 'address' | 'online' | 'home';

const OPTIONS: { key: Kind; label: string; hint: string }[] = [
  { key: 'survey', label: 'Survey', hint: 'Finds a time that fits your diary' },
  { key: 'call', label: 'Phone call', hint: '15 minutes, by phone' },
  { key: 'visit', label: 'Site visit', hint: 'At their address' },
  { key: 'meeting', label: 'Meeting', hint: 'In person or online' },
  { key: 'other', label: 'Something else', hint: 'Any other appointment' },
];
const LENGTHS = [15, 30, 45, 60, 90, 120];
const QUICK = ['09:00', '10:00', '12:00', '14:00', '16:00'];

const plusDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const toMins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function AppointmentSheet({ projectId, customer, postcode, address, needsSurvey, today, onClose, onDone }: { projectId: string; customer: string; postcode: string | null; address: string | null; needsSurvey: boolean; today: string; onClose: () => void; onDone: (message: string) => void }) {
  const people = useBookingPeople();
  const [kind, setKind] = useState<Kind | null>(null);
  const [title, setTitle] = useState('');
  const [day, setDay] = useState(today);
  const [start, setStart] = useState('');
  const [mins, setMins] = useState(15);
  const [where, setWhere] = useState<Where>('online');
  const [pc, setPc] = useState(postcode ?? '');
  const [who, setWho] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const first = customer.trim().split(/\s+/).slice(-2).join(' ') || customer;
  const surveyors = people?.surveyors ?? [];

  if (kind === 'survey') {
    return <FindTimeSheet projectId={projectId} today={today} surveyors={surveyors} onClose={onClose} onBooked={(m) => onDone(m)} />;
  }

  function pick(k: Kind) {
    setKind(k);
    setErr('');
    if (k === 'call') {
      setTitle(`Call ${customer}`);
      setMins(15);
      setWhere('online');
    } else if (k === 'visit') {
      setTitle(`Site visit: ${customer}`);
      setMins(60);
      setWhere('address');
    } else if (k === 'meeting') {
      setTitle(`Meeting: ${customer}`);
      setMins(60);
      setWhere('address');
    } else {
      setTitle(`${customer}`);
      setMins(30);
      setWhere('online');
    }
  }

  async function save() {
    if (!/^\d{2}:\d{2}$/.test(start)) return setErr('Pick the time it starts.');
    if (!day) return setErr('Pick the day.');
    if (where === 'address' && !pc.trim()) return setErr('Add the postcode, so the driving can be worked out.');
    setBusy(true);
    setErr('');
    const body = {
      surveyor_key: who || surveyors[0]?.key,
      kind: kind === 'visit' ? 'site_visit' : kind === 'meeting' ? 'meeting' : 'other',
      title: title.trim() || `Appointment: ${customer}`,
      where_kind: where,
      day,
      start,
      end: hhmm(toMins(start) + mins),
      project_id: projectId,
      ...(where === 'address' ? { postcode: pc.trim(), address: address || undefined } : {}),
    };
    const r = await fetch('/api/crm/diary-entries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r || !r.ok) return setErr(d.error || 'That didn’t save. Try again.');
    const when = day === today ? 'today' : day === plusDays(today, 1) ? 'tomorrow' : new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
    onDone(`Added to your diary: ${body.title}, ${when} at ${start}.`);
  }

  return (
    <Sheet title={kind ? OPTIONS.find((o) => o.key === kind)!.label : `Appointment with ${first}`} onClose={onClose}>
      {!kind ? (
        <div className="crm-menu">
          {OPTIONS.filter((o) => o.key !== 'survey' || needsSurvey).map((o) => (
            <button key={o.key} type="button" onClick={() => pick(o.key)}>
              <span>{o.label}</span>
              <small>{o.hint}</small>
            </button>
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          <label className="crm-label" htmlFor="ap-title">
            What
          </label>
          <input id="ap-title" className="crm-input" value={title} onChange={(e) => setTitle(e.target.value)} />
          <label className="crm-label" htmlFor="ap-day">
            Day
          </label>
          <div className="crm-quickpicks">
            <button type="button" onClick={() => setDay(today)}>
              Today
            </button>
            <button type="button" onClick={() => setDay(plusDays(today, 1))}>
              Tomorrow
            </button>
            <button type="button" onClick={() => setDay(plusDays(today, 7))}>
              Next week
            </button>
          </div>
          <input id="ap-day" className="crm-input" type="date" min={today} value={day} onChange={(e) => setDay(e.target.value)} />
          <label className="crm-label" htmlFor="ap-start">
            Starts
          </label>
          <div className="crm-quickpicks">
            {QUICK.map((q) => (
              <button key={q} type="button" className={start === q ? 'on' : ''} onClick={() => setStart(q)}>
                {q}
              </button>
            ))}
          </div>
          <div className="crm-grid2">
            <input id="ap-start" className="crm-input" type="time" step={300} value={start} onChange={(e) => setStart(e.target.value)} aria-label="Start time" />
            <select className="crm-input" value={mins} onChange={(e) => setMins(Number(e.target.value))} aria-label="How long">
              {LENGTHS.map((m) => (
                <option key={m} value={m}>
                  {m < 60 ? `${m} minutes` : m === 60 ? '1 hour' : `${m / 60} hours`}
                </option>
              ))}
            </select>
          </div>
          <label className="crm-label" htmlFor="ap-where">
            Where
          </label>
          <select id="ap-where" className="crm-input" value={where} onChange={(e) => setWhere(e.target.value as Where)}>
            <option value="address">At their address</option>
            <option value="online">Phone or online</option>
            <option value="home">At my base</option>
          </select>
          {where === 'address' && (
            <input className="crm-input" value={pc} onChange={(e) => setPc(e.target.value)} placeholder="Postcode" aria-label="Postcode" />
          )}
          {surveyors.length > 1 && (
            <select className="crm-input" value={who || surveyors[0].key} onChange={(e) => setWho(e.target.value)} aria-label="Whose diary">
              {surveyors.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.name}’s diary
                </option>
              ))}
            </select>
          )}
          {err && <p className="crm-banner crm-banner--err">{err}</p>}
          <div className="crm-actions">
            <button type="button" className="crm-btn crm-btn--solar" disabled={busy} onClick={() => void save()}>
              {busy ? 'Adding…' : 'Add to my diary'}
            </button>
            <button type="button" className="crm-btn crm-btn--ghost" disabled={busy} onClick={() => setKind(null)}>
              Back
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
