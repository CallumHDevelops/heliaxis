'use client';

import type { ReactNode } from 'react';
import { PRINT_LABEL, PRINT_TITLE, printHref } from '@/lib/documents/print-shared';

/**
 * Small shared pieces of the customer portal: icons, the document row (View and Download on every
 * document) and the "when" helpers. Dates are spelt here, never by toLocaleString: Node and the
 * browser disagree on "Sep" / "Sept", which breaks hydration.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ukParts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'numeric', year: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

function parts(iso: string) {
  // A bare date (YYYY-MM-DD) is that UK day: read at midday so no time zone moves it.
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  const p = Object.fromEntries(ukParts.formatToParts(d).map((x) => [x.type, x.value]));
  const wd = DAYS[new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day))).getUTCDay()];
  return { day: Number(p.day), month: MONTHS[Number(p.month) - 1], year: Number(p.year), wd, time: `${p.hour}:${p.minute}` };
}
/** "3 Nov 2026". */
export const dayText = (iso: string) => {
  const p = parts(iso);
  return `${p.day} ${p.month} ${p.year}`;
};
/** "Tue 3 Nov", or "Tue 3 Nov, 08:00" with the time. */
export const whenText = (iso: string, withTime = false) => {
  const p = parts(iso);
  return `${p.wd} ${p.day} ${p.month}${withTime && iso.length > 10 ? `, ${p.time}` : ''}`;
};
export const dayParts = parts;

export const money = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const P: Record<string, ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  docs: (
    <>
      <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" />
      <path d="M14 3v5h5M8.5 13h7M8.5 17h5" />
    </>
  ),
  system: (
    <>
      <rect x="3" y="4" width="18" height="11" rx="1" />
      <path d="M3 9.5h18M9 4v11M15 4v11M12 15v5M8 20h8" />
    </>
  ),
  money: (
    <>
      <rect x="2.5" y="6" width="19" height="13" rx="2" />
      <path d="M2.5 10h19M6.5 15h4" />
    </>
  ),
  help: (
    <>
      <path d="M4 5h16v11H9l-5 4z" />
      <path d="M9.5 9a2.5 2.5 0 1 1 3.3 2.4c-.5.2-.8.6-.8 1.1M12 14.2v.1" />
    </>
  ),
  view: (
    <>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  download: <path d="M12 3v12m0 0-5-5m5 5 5-5M4 20h16" />,
  phone: <path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z" />,
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  chat: <path d="M20 12a8 8 0 0 1-11.6 7.1L3 20l1.1-4.9A8 8 0 1 1 20 12z" />,
  flag: <path d="M5 21V4m0 0h11l-2 4 2 4H5" />,
  spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
    </>
  ),
  shield: <path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z" />,
  share: <path d="M12 15V3m0 0L8 7m4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  arrow: <path d="M5 12h14m0 0-5-5m5 5-5 5" />,
  pen: <path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" />,
  thumbup: <path d="M7 11v9H4v-9zM7 11l4-8a2 2 0 0 1 2 2v4h5.5a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 17.3 20H7" />,
  thumbdown: <path d="M7 13V4H4v9zM7 13l4 8a2 2 0 0 0 2-2v-4h5.5a2 2 0 0 0 2-2.3l-1.2-6A2 2 0 0 0 17.3 4H7" />,
};

export function Icon({ name, size = 20 }: { name: keyof typeof P | string; size?: number }) {
  return (
    <svg className="pt-ic" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {P[name]}
    </svg>
  );
}

export type FileLite = { id: string; name: string; at?: string; print?: boolean };

/** One document: its name and line, with View (opens it) and Download (saves it) side by side. */
export function DocRow({ token, doc, line, label }: { token: string; doc: FileLite; line?: string; label?: string }) {
  const href = `/api/my/${token}/doc/${doc.id}`;
  return (
    <li className="pt-doc">
      <span className="pt-doc-ic" aria-hidden="true">
        <Icon name="docs" />
      </span>
      <span className="pt-doc-main">
        <b>{label || doc.name}</b>
        {(line || doc.at) && <small>{[line, doc.at ? dayText(doc.at) : ''].filter(Boolean).join(' · ')}</small>}
        {doc.print && (
          <a className="pt-doc-print" href={printHref(href)} target="_blank" rel="noreferrer" title={PRINT_TITLE}>
            {PRINT_LABEL}
          </a>
        )}
      </span>
      <span className="pt-doc-btns">
        <a className="pt-mini" href={href} target="_blank" rel="noreferrer" aria-label={`View ${label || doc.name}`}>
          <Icon name="view" size={16} />
          <span>View</span>
        </a>
        <a className="pt-mini ghost" href={`${href}?download=1`} aria-label={`Download ${label || doc.name}`}>
          <Icon name="download" size={16} />
          <span className="pt-hide-sm">Download</span>
        </a>
      </span>
    </li>
  );
}

/** A titled group of documents. */
export function DocGroup({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return (
    <div className="pt-docgroup">
      <h3>{title}</h3>
      {note && <p className="pt-muted pt-docgroup-note">{note}</p>}
      <ul className="pt-docs">{children}</ul>
    </div>
  );
}

/** A document that's still being prepared: listed, so they know it's coming. */
export function ComingRow({ title, line }: { title: string; line?: string }) {
  return (
    <li className="pt-doc is-coming">
      <span className="pt-doc-ic" aria-hidden="true">
        <Icon name="docs" />
      </span>
      <span className="pt-doc-main">
        <b>{title}</b>
        {line && <small>{line}</small>}
      </span>
      <span className="pt-coming">On its way</span>
    </li>
  );
}
