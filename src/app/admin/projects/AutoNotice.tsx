'use client';

import { useEffect, useState } from 'react';

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
 * "Send them the appointment automatically": email and WhatsApp together, and a text if WhatsApp can't be delivered (the rule is
 * in CRM settings). Says plainly what is missing: no email on file, no mobile, or a way that isn't connected.
 */
export function AutoNotice({ on, onChange, channels, hasEmail, hasMobile }: { on: boolean; onChange: (v: boolean) => void; channels: Channels | null; hasEmail: boolean; hasMobile: boolean }) {
  const gaps: string[] = [];
  if (channels) {
    if (!hasEmail) gaps.push('no email address, so no email');
    else if (!channels.email) gaps.push('Microsoft 365 isn’t connected, so no email');
    if (!hasMobile) gaps.push('no mobile number, so no WhatsApp or text');
    else {
      if (!channels.whatsapp) gaps.push('WhatsApp isn’t connected');
      if (!channels.sms) gaps.push('texts aren’t set up yet');
    }
  }
  return (
    <div className="nps-tell">
      <label className="crm-check">
        <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} /> Send them the appointment automatically
      </label>
      <p className="crm-muted">
        Email and WhatsApp, each with a link to a map with a pin they can move. A text goes instead if WhatsApp can’t be delivered.
        {gaps.length > 0 && on && <b> Heads up: {gaps.join('; ')}.</b>}
      </p>
    </div>
  );
}
