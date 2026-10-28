'use client';

import { useEffect, useState } from 'react';

export type Notify = { email: boolean; whatsapp: boolean; sms: boolean };
export type Channels = { email: boolean; whatsapp: boolean; sms: boolean };

/** What the "Appointment arranged" screens need: who can go, and which ways of telling the customer are set up. */
export function useBookingPeople(enabled = true) {
  const [d, setD] = useState<{ surveyors: { key: string; name: string }[]; channels: Channels } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let gone = false;
    fetch('/api/crm/booking/people', { cache: 'no-store' })
      .then((r) => r.json())
      .then((x) => !gone && x.channels && setD(x))
      .catch(() => undefined);
    return () => {
      gone = true;
    };
  }, [enabled]);
  return d;
}

/**
 * "Tell them" tick boxes: Email, WhatsApp, Text. A way that is not set up (or has no address or number to go to) is greyed out
 * and says why. Every message carries a link to a map with a pin they can move.
 */
export function TellThem({ value, onChange, channels, hasEmail, hasMobile }: { value: Notify; onChange: (n: Notify) => void; channels: Channels | null; hasEmail: boolean; hasMobile: boolean }) {
  const rows: { key: keyof Notify; label: string; ok: boolean; why: string }[] = [
    { key: 'email', label: 'Email', ok: !!channels?.email && hasEmail, why: !channels?.email ? 'Microsoft 365 isn’t connected' : 'no email address' },
    { key: 'whatsapp', label: 'WhatsApp', ok: !!channels?.whatsapp && hasMobile, why: !channels?.whatsapp ? 'WhatsApp isn’t connected' : 'no mobile number' },
    { key: 'sms', label: 'Text message', ok: !!channels?.sms && hasMobile, why: !channels?.sms ? 'not set up yet' : 'no mobile number' },
  ];
  return (
    <fieldset className="nps-tell">
      <legend className="crm-label">Tell them</legend>
      <div className="crm-checks">
        {rows.map((r) => (
          <label key={r.key} className={value[r.key] && r.ok ? 'on' : ''} title={r.ok ? undefined : r.why}>
            <input type="checkbox" checked={value[r.key] && r.ok} disabled={!r.ok} onChange={(e) => onChange({ ...value, [r.key]: e.target.checked })} />
            {r.label}
            {!r.ok && <small> ({r.why})</small>}
          </label>
        ))}
      </div>
      <p className="crm-muted">Each message has a link to a map with a pin they can move, so you find them first time. WhatsApp only goes to people who are happy to be messaged there.</p>
    </fieldset>
  );
}
