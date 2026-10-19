'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { stageLabel } from '@/lib/crm/stages';
import { shownRef } from '@/lib/projects/refs';
import { matchesSearch, phaseOf, type PipelineProject } from './crm-shared';

/** Small pieces shared by the CRM home, Board, List and the Projects pages. */

/** Sales | Projects: two links, so the page below never changes silently. */
export function SalesProjects({ on, className = '' }: { on: 'sales' | 'projects'; className?: string }) {
  return (
    <nav className={`crmh-seg crmh-seg--sp ${className}`} aria-label="Sales or projects">
      <Link href="/admin/crm" className={on === 'sales' ? 'on' : ''} aria-current={on === 'sales' ? 'page' : undefined}>
        Sales
      </Link>
      <Link href="/admin/projects" className={on === 'projects' ? 'on' : ''} aria-current={on === 'projects' ? 'page' : undefined}>
        Projects
      </Link>
    </nav>
  );
}

/** A stage chip in its phase colour (Won and Lost by name, as everywhere on staff screens). */
export function StageChip({ stage, className = '' }: { stage: string; className?: string }) {
  return <span className={`crmh-stage ph-${phaseOf(stage)} ${className}`}>{stageLabel(stage)}</span>;
}

export function StageDot({ stage }: { stage: string }) {
  return <i className={`crmh-dot ph-${phaseOf(stage)}`} aria-hidden="true" />;
}

export function WaIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.2a9.7 9.7 0 0 0-8.3 14.8L2.3 21.8l4.9-1.3A9.7 9.7 0 1 0 12 2.2zm0 17.7a8 8 0 0 1-4.1-1.1l-.3-.2-2.9.8.8-2.8-.2-.3A8 8 0 1 1 12 19.9zm4.4-6c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.5.1l-.8 1c-.1.2-.3.2-.5.1a6.5 6.5 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.5-.4h-.5a.9.9 0 0 0-.7.3 2.8 2.8 0 0 0-.9 2.1 4.9 4.9 0 0 0 1 2.6 11.2 11.2 0 0 0 4.3 3.8c1.6.7 2.2.7 3 .6a2.6 2.6 0 0 0 1.7-1.2 2.1 2.1 0 0 0 .1-1.2c0-.1-.2-.2-.4-.3z" />
    </svg>
  );
}

export function Icon({ k, size = 16 }: { k: 'search' | 'gear' | 'clock' | 'open' | 'pin' | 'plus' | 'more' | 'check'; size?: number }) {
  const paths: Record<typeof k, ReactNode> = {
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </>
    ),
    gear: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    open: <path d="M14 5h5v5M19 5l-8 8M10 5H5v14h14v-5" />,
    pin: (
      <>
        <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
        <circle cx="12" cy="9.5" r="2.5" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    more: (
      <>
        <circle cx="5" cy="12" r="1.3" />
        <circle cx="12" cy="12" r="1.3" />
        <circle cx="19" cy="12" r="1.3" />
      </>
    ),
    check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[k]}
    </svg>
  );
}

/**
 * A sheet over the page (a bottom sheet on phones): Esc or a click outside closes it, and focus goes
 * into it when it opens and back to where it was when it closes.
 */
export function Sheet({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  const titleId = useId();
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const el = box.current;
    if (el && !el.contains(document.activeElement)) (el.querySelector<HTMLElement>('[autofocus], input, select, textarea, button') ?? el).focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      before?.focus?.();
    };
  }, []);
  return (
    <div className="crm-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={onClose}>
      <div className={`crm-sheet-box${wide ? ' crm-sheet-box--wide' : ''}`} ref={box} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="crmh-sheethead">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="crmh-x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Pick a job by typing a name, postcode, phone number or HX-ref (from the jobs already on the page).
 * Open jobs first.
 */
export function JobPicker({
  projects,
  value,
  onChange,
  placeholder = 'Customer name, postcode or HX-ref',
  autoFocus,
}: {
  projects: PipelineProject[];
  value: PipelineProject | null;
  onChange: (p: PipelineProject | null) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState('');
  const listId = useId();
  if (value) {
    return (
      <div className="crmh-picked">
        <StageDot stage={value.stage} />
        <span>
          <b>{value.customer || value.title}</b>
          {(shownRef(value) || value.title) && <small> · {shownRef(value) || value.title}</small>}
        </span>
        <button type="button" className="crm-link" onClick={() => onChange(null)}>
          Change
        </button>
      </div>
    );
  }
  const t = q.trim();
  const hits = t.length < 2 ? [] : projects.filter((p) => matchesSearch(p, t)).sort((a, b) => Number(b.stage !== 'lost' && b.stage !== 'complete') - Number(a.stage !== 'lost' && a.stage !== 'complete')).slice(0, 8);
  return (
    <div className="crmh-picker">
      <input
        className="crm-input"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-controls={listId}
        aria-label="Find the customer"
      />
      {t.length >= 2 && (
        <ul id={listId} className="crmh-picker__list">
          {hits.length === 0 && <li className="crm-muted">No job matches “{t}”.</li>}
          {hits.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onChange(p)}>
                <StageDot stage={p.stage} />
                <span>
                  <b>{p.customer || p.title}</b>
                  <small>{[shownRef(p), p.customer_projects > 1 ? p.title : null, stageLabel(p.stage)].filter(Boolean).join(' · ')}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
