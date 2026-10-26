'use client';

import { QUICK_LINKS, quickLinkText } from '@/lib/quick-links';

/** One-tap booking links for a message: each button adds the link (with a lead-in line) to what is being written. */
export function QuickLinks({ via, postcode, onPick }: { via: 'whatsapp' | 'email'; postcode?: string | null; onPick: (text: string) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', margin: '4px 0' }} aria-label="Quick links">
      <span className="wa-muted" style={{ fontSize: '0.78rem' }}>
        🔗 Add a link:
      </span>
      {QUICK_LINKS.map((l) => (
        <button key={l.id} type="button" className="wsl-link" onClick={() => onPick(quickLinkText(l, { via, postcode }))}>
          {l.label}
        </button>
      ))}
    </div>
  );
}
