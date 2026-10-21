'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { DELIVERY_STAGES, isProjectStage, money, SALES_STAGES, stageLabel } from '@/lib/crm/stages';
import type { ActionKey, PrimaryAction } from '@/lib/projects/primary-action';
import { Icon, StageChip } from '../CrmUi';
import { firstName, jobLabel, phaseOf, productsShort } from '../crm-shared';
import { dayWord, daysSince, directionsHref, phoneShown, type Area, type Customer, type Duplicate, type OtherJob, type Project } from './record-shared';

/**
 * The record page's header (research 2.3): Row A (back, name, badges, stage, the stage's main button,
 * ⋯) stays pinned to the top once you scroll, with the ref and next date added; Row B (ref, products,
 * postcode, value, owner, next date, other jobs), Row C (Call, Directions, Email) and Row D (the stage
 * path) scroll away. On phones Row A is the 56px bar and the stage path becomes one line with the main
 * action.
 */
export function RecordHeader({
  project,
  customer,
  waNumber,
  others,
  duplicates,
  area,
  now,
  progress,
  primary,
  nextDate,
  jobRef,
  isAdmin,
  site,
  onStage,
  onMoveTo,
  onPrimary,
  onEmail,
  onCall,
  onName,
  onNewProject,
  onDelete,
  onMerge,
  onJoinJobs,
  onNotSame,
}: {
  project: Project;
  customer: Customer;
  waNumber: string | null;
  others: OtherJob[];
  duplicates: Duplicate[];
  area: Area;
  now: number;
  progress: { done: number; total: number } | null;
  primary: PrimaryAction;
  nextDate: string;
  jobRef: string | null;
  isAdmin: boolean;
  site: string;
  onStage: () => void;
  onMoveTo: (stage: string) => void;
  onPrimary: (action: ActionKey, to?: string, confirmText?: string) => void;
  onEmail: () => void;
  onCall: () => void;
  onName: () => void;
  onNewProject: () => void;
  onDelete: () => void;
  /** Merge with another customer: the possible duplicate's id, or null to find one. */
  onMerge: (other: string | null) => void;
  onJoinJobs: () => void;
  onNotSame: (other: string) => void;
}) {
  const sentinel = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const base = area === 'projects' ? '/admin/projects' : '/admin/crm';
  const phone = phoneShown(customer, waNumber);
  const days = daysSince(project.stage_changed_at || project.created_at, now);
  const customerRef = customer.customer_ref || null;
  const dupe = duplicates[0] ?? null;
  const badges = (
    <>
      {project.on_hold && <span className="crmr-badge crmr-badge--hold">On hold{project.hold_reason ? `: ${project.hold_reason}` : ''}</span>}
      {project.stage === 'lost' && <span className="crmr-badge crmr-badge--lost">Lost</span>}
      {dupe && (
        <span className="crmr-badge crmr-badge--dupe">
          <Link href={dupe.project_id ? `/admin/crm/${dupe.project_id}` : '/admin/crm'}>
            Looks like the same person as {dupe.name}
            {dupe.project_ref ? ` (${dupe.project_ref})` : ''}
          </Link>
          {dupe.why && <span className="crmr-badge__why"> · {DUPE_WHY[dupe.why]}</span>}
          <button type="button" className="crmr-badge__act" onClick={() => onMerge(dupe.enquiry_id)}>
            Merge…
          </button>
        </span>
      )}
    </>
  );
  const hasBadges = !!(project.on_hold || project.stage === 'lost' || dupe);
  // The job's own name, when it says more than the name, products and postcode already shown.
  const rest = jobLabel({ customer: customer.name, title: project.title, postcode: project.postcode || customer.postcode, customer_projects: 2 })
    .slice(customer.name.length)
    .replace(/^\s*·\s*/, '');
  const plain = [productsShort(project.products), project.postcode || customer.postcode].filter(Boolean).join(' · ');
  const ownTitle = rest && rest.toLowerCase() !== plain.toLowerCase() ? rest : '';

  return (
    <>
      <div ref={sentinel} className="crmr-sentinel" aria-hidden="true" />
      <div className="crmr-bar" data-stuck={stuck ? '1' : undefined}>
        <Link href={base} className="crmr-back" aria-label={area === 'projects' ? 'Back to Projects' : 'Back to the CRM'}>
          <span aria-hidden="true">←</span>
          <span className="crmr-back__w">{area === 'projects' ? 'Projects' : 'CRM'}</span>
        </Link>
        <h1 className="crmr-name">
          <button type="button" onClick={onName} title="Customer details">
            {customer.name}
          </button>
        </h1>
        {stuck && (jobRef || nextDate) && (
          <span className="crmr-barmeta">
            {jobRef && <span className="crmr-ref">{jobRef}</span>}
            <b>{nextDate}</b>
          </span>
        )}
        {hasBadges && <span className="crmr-badges crmr-badges--a">{badges}</span>}
        <div className="crmr-bar__r">
          <button type="button" className={`crmr-stagebtn ph-${phaseOf(project.stage)}`} onClick={onStage} aria-haspopup="dialog">
            {stageLabel(project.stage)} <span aria-hidden="true">▾</span>
          </button>
          {primary.action !== 'reopen' && (
            // The short wording here ("Move to Complete anyway"), so the name keeps its room; the checklist
            // card's button, this tooltip and the confirm still say how many key items aren't done.
            <button type="button" className="crm-btn crmr-primary" title={primary.label} onClick={() => onPrimary(primary.action, primary.to, primary.confirm)}>
              <span className="crmr-primary__t">{primary.label.replace(/ · .*$/, '')}</span>
            </button>
          )}
          <MoreMenu
            items={[
              ...primary.menu.map((m) => ({ label: m.label, run: () => onPrimary(m.action) })),
              { label: `New project for ${firstName(customer.name) || 'them'}`, run: onNewProject },
              { label: 'Merge with another customer…', run: () => onMerge(null) },
              ...(others.length ? [{ label: `Join this job with another of ${firstName(customer.name) || 'their'}’s jobs…`, run: onJoinJobs }] : []),
              ...(dupe ? [{ label: `Not the same person as ${dupe.name}`, run: () => onNotSame(dupe.enquiry_id) }] : []),
              {
                label: 'Copy link to this job',
                run: () => {
                  const url = `${window.location.origin}${base}/${project.id}`;
                  void navigator.clipboard?.writeText(url).catch(() => window.prompt('Copy the link', url));
                },
              },
              ...(isAdmin ? [{ label: 'Delete this job', run: onDelete, danger: true }] : []),
            ]}
          />
        </div>
      </div>

      <div className="crmr-head">
        <div className="crmr-meta">
          {jobRef && <span className="crmr-ref">{jobRef}</span>}
          {customerRef && customerRef !== jobRef && <span className="crmr-ref crmr-ref--cust">Customer {customerRef}</span>}
          {project.products.length > 0 && <span>{productsShort(project.products)}</span>}
          {(project.postcode || customer.postcode) && <span>{project.postcode || customer.postcode}</span>}
          <span className="crmr-meta__wide">{project.value ? money(project.value) : 'No value yet'}</span>
          {ownTitle && <span className="crmr-meta__wide crmr-meta__title">{ownTitle}</span>}
          <b className="crmr-meta__next">{nextDate}</b>
          {others.length > 0 && (
            <details className="crmr-others">
              <summary>
                Other projects ({others.length}) <span aria-hidden="true">▾</span>
              </summary>
              <ul>
                {others.map((o) => (
                  <li key={o.id}>
                    <Link href={`${base}/${o.id}`}>
                      {o.project_ref && <span className="crmr-ref">{o.project_ref}</span>}
                      <span>{o.title}</span>
                      <StageChip stage={o.stage} />
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
        {hasBadges && <p className="crmr-badges crmr-badges--b">{badges}</p>}

        <div className="crmr-contact">
          {phone ? (
            <a className="crm-btn crm-btn--ghost" href={`tel:${phone.replace(/[^\d+]/g, '')}`} onClick={onCall}>
              <PhoneIcon />
              <span>
                Call<span className="crmr-contact__num"> {phone}</span>
              </span>
            </a>
          ) : (
            <button type="button" className="crm-btn crm-btn--ghost" disabled title="No phone number yet">
              <PhoneIcon />
              Call
            </button>
          )}
          {site ? (
            <a className="crm-btn crm-btn--ghost" href={directionsHref(site)} target="_blank" rel="noreferrer">
              <Icon k="pin" size={16} />
              Directions
            </a>
          ) : (
            <button type="button" className="crm-btn crm-btn--ghost" disabled title="No address yet">
              <Icon k="pin" size={16} />
              Directions
            </button>
          )}
          <button type="button" className="crm-btn crm-btn--ghost" onClick={onEmail}>
            <MailIcon />
            Email
          </button>
        </div>

        <StagePath stage={project.stage} days={days} progress={progress} onMoveTo={onMoveTo} name={customer.name} />

        {/* Phones: the stage, how long it's been there and its main action, on one line. */}
        <div className="crmr-stageline">
          <StageChip stage={project.stage} />
          {days !== null && <span className="crm-muted crm-small">{dayWord(days)}</span>}
          {primary.action !== 'reopen' ? (
            <button type="button" className="crm-btn crm-btn--small crmr-stageline__go" onClick={() => onPrimary(primary.action, primary.to, primary.confirm)}>
              {primary.label.replace(/ →$/, '')} →
            </button>
          ) : (
            <button type="button" className="crm-btn crm-btn--ghost crm-btn--small crmr-stageline__go" onClick={onStage}>
              Reopen →
            </button>
          )}
        </div>
      </div>
    </>
  );
}

/** The stage path: the phase the job is in shown in full, the other folded. Clicking a step moves the job there, after asking. */
function StagePath({
  stage,
  days,
  progress,
  onMoveTo,
  name,
}: {
  stage: string;
  days: number | null;
  progress: { done: number; total: number } | null;
  onMoveTo: (stage: string) => void;
  name: string;
}) {
  const delivery = isProjectStage(stage);
  const [open, setOpen] = useState(false);
  const order = [...SALES_STAGES, ...DELIVERY_STAGES, 'complete'] as string[];
  const at = order.indexOf(stage);
  const step = (k: string) => {
    const i = order.indexOf(k);
    const cur = k === stage;
    const done = stage !== 'lost' && i < at;
    const extra = cur ? [delivery && progress?.total ? `${progress.done} of ${progress.total}` : '', days !== null ? dayWord(days) : ''].filter(Boolean).join(' · ') : '';
    return (
      <li key={k} className={cur ? 'cur' : done ? 'done' : ''}>
        <button
          type="button"
          aria-current={cur ? 'step' : undefined}
          disabled={cur}
          onClick={() => {
            if (window.confirm(`Move ${name} to ${stageLabel(k)}?`)) onMoveTo(k);
          }}
        >
          <span>
            {stageLabel(k)}
            {done && ' ✓'}
            {extra && <span className="crmr-path__x"> · {extra}</span>}
          </span>
        </button>
      </li>
    );
  };
  const salesSteps = SALES_STAGES.map(step);
  const deliverySteps = [...DELIVERY_STAGES, 'complete'].map(step);
  return (
    <nav className="crmr-path" aria-label="Stage">
      <ol>
        {delivery ? (
          <>
            {open ? (
              salesSteps
            ) : (
              <li className="done crmr-path__fold">
                <button type="button" onClick={() => setOpen(true)} aria-expanded={false}>
                  Sold ✓
                </button>
              </li>
            )}
            {deliverySteps}
          </>
        ) : (
          <>
            {salesSteps}
            {stage === 'lost' && (
              <li className="cur lost">
                <button type="button" disabled aria-current="step">
                  <span>
                    Lost{days !== null ? <span className="crmr-path__x"> · {dayWord(days)}</span> : null}
                  </span>
                </button>
              </li>
            )}
            {open ? (
              deliverySteps
            ) : (
              <li className="crmr-path__fold crmr-path__more">
                <button type="button" onClick={() => setOpen(true)} aria-expanded={false}>
                  Delivery ({DELIVERY_STAGES.length}) ▸
                </button>
              </li>
            )}
          </>
        )}
      </ol>
    </nav>
  );
}

/** Why two records look like one person (src/lib/projects/duplicates.ts). */
const DUPE_WHY: Record<NonNullable<Duplicate['why']>, string> = {
  email: 'same email',
  number: 'same number',
  booking: 'booked online with the same details',
};

/** ⋯: a small menu of the rarer actions. Esc or a click elsewhere closes it. */
function MoreMenu({ items }: { items: { label: string; run: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  return (
    <div className="crmr-more" ref={box}>
      <button type="button" className="crm-btn crm-btn--ghost crmr-more__btn" aria-label="More" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon k="more" size={18} />
      </button>
      {open && (
        <ul className="crmr-more__list" role="menu">
          {items.map((i) => (
            <li key={i.label} role="none">
              <button
                type="button"
                role="menuitem"
                className={i.danger ? 'danger' : ''}
                onClick={() => {
                  setOpen(false);
                  i.run();
                }}
              >
                {i.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PhoneIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" aria-hidden="true">
      <path d="M6.6 3.5h2.6l1.3 4-1.8 1.3a11 11 0 0 0 6.5 6.5l1.3-1.8 4 1.3v2.6a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2Z" />
    </svg>
  );
}

function MailIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}
