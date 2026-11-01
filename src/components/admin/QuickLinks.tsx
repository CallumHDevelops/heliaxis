'use client';

import { QUICK_LINKS, quickLinkText } from '@/lib/quick-links';

/** The booking links for a message, in one list: choosing one adds the link (with a lead-in line) to what is being written. */
export function QuickLinks({ via, postcode, onPick }: { via: 'whatsapp' | 'email'; postcode?: string | null; onPick: (text: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '4px 0' }} aria-label="Quick links">
      <label htmlFor={`ql-${via}`} className="wa-muted" style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
        Add a link:
      </label>
      <select
        id={`ql-${via}`}
        value=""
        onChange={(e) => {
          const l = QUICK_LINKS.find((x) => x.id === e.target.value);
          if (l) onPick(quickLinkText(l, { via, postcode }));
        }}
        style={{ flex: '1 1 auto', minWidth: 0, maxWidth: 260, font: 'inherit', fontSize: '0.88rem', padding: '6px 8px', border: '1px solid var(--border-strong, #bbb)', borderRadius: 6, background: 'var(--field, #fff)', color: 'inherit' }}
      >
        <option value="">Choose a link…</option>
        {QUICK_LINKS.map((l) => (
          <option key={l.id} value={l.id}>
            {l.label}
          </option>
        ))}
      </select>
    </div>
  );
}
