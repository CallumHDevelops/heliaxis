'use client';

import Link from 'next/link';
import type { DragEvent } from 'react';
import { isProjectStage, money, productLabel } from '@/lib/crm/stages';
import { Sheet, StageChip } from './CrmUi';
import { dueWords, initials, isLive, isSales, jobLabel, quietDays, ukDayOf, ukTime, type PipelineProject } from './crm-shared';
import type { ActiveChat } from './dock-link';

const QUIET_DAYS = 7;

/** An opportunity or job on the Board or in the List. The whole card opens it; "Move to…" moves it without dragging. */
export function CrmCard({
  p,
  now,
  today,
  chat,
  compact,
  onMove,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  p: PipelineProject;
  now: number;
  today: string;
  /** Their WhatsApp chat, when it has unread messages. */
  chat?: ActiveChat | null;
  compact?: boolean;
  onMove: (p: PipelineProject) => void;
  dragging?: boolean;
  onDragStart?: (e: DragEvent) => void;
  onDragEnd?: () => void;
}) {
  const quiet = isLive(p) && isSales(p.stage) ? quietDays(p, now) : 0;
  const ref = p.project_ref || p.customer_ref;
  const name = jobLabel(p);
  const href = isProjectStage(p.stage) ? `/admin/projects/${p.id}` : `/admin/crm/${p.id}`;
  const unread = chat?.unread || p.wa_unread || 0;
  const lastIn = chat && chat.unread > 0 && chat.last?.direction === 'in' ? chat.last.body || 'Photo' : null;
  return (
    <div
      className={`crm-card crmh-card2${compact ? ' compact' : ''}${dragging ? ' is-dragging' : ''}`}
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="crm-card-top">
        <Link href={href} className="crmh-card2__link" draggable={false}>
          {name}
        </Link>
        {p.value ? <span className="crm-value">{money(p.value)}</span> : null}
      </div>
      <div className="crm-card-sub">{[p.postcode, p.products.map(productLabel).join(', ')].filter(Boolean).join(' · ') || p.title}</div>
      <NextStepLine p={p} today={today} />
      {lastIn && (
        <div className="crmh-card2__wa" title={lastIn}>
          <i className="crmh-wadot" aria-hidden="true" />
          <span>{lastIn}</span>
        </div>
      )}
      <div className="crm-card-mid">
        {!compact && <StageChip stage={p.stage} />}
        {ref && <span className="crmh-refchip">{ref}</span>}
        {p.on_hold && <span className="crm-chip crmh-chip--hold">On hold</span>}
        {p.possible_duplicate && (
          <span className="crm-chip crmh-chip--dup" title={`Possible duplicate of ${p.possible_duplicate.name}${p.possible_duplicate.project_ref ? ` (${p.possible_duplicate.project_ref})` : ''}`}>
            Possible duplicate
          </span>
        )}
        {unread > 0 && !lastIn && <span className="crm-chip crm-chip--wa">💬 {unread}</span>}
        {quiet >= QUIET_DAYS && <span className="crm-chip crm-chip--quiet">Quiet {quiet}d</span>}
        <span className="crmh-card2__end">
          {p.owner && (
            <span className="crm-owner" title={p.owner}>
              {initials(p.owner)}
            </span>
          )}
          <button type="button" className="crmh-movebtn" onClick={() => onMove(p)} aria-label={`Move ${p.customer || p.title} to another stage`} title="Move to…">
            Move
          </button>
        </span>
      </div>
    </div>
  );
}

function NextStepLine({ p, today }: { p: PipelineProject; today: string }) {
  if (!isLive(p)) return null;
  if (!p.next_step && p.next_task) {
    const late = !!p.next_task.due_date && p.next_task.due_date < today;
    return (
      <span className={`crm-next${late ? ' late' : ''}`}>
        ✅ {p.next_task.title}
        {p.next_task.due_date ? ` · ${dueWords(p.next_task.due_date, today)}` : ''}
      </span>
    );
  }
  if (!p.next_step) return <span className="crm-next none">No next step</span>;
  const day = p.next_step_at ? ukDayOf(p.next_step_at) : null;
  const tone = day && day < today ? 'late' : day === today ? 'today' : '';
  return (
    <span className={`crm-next ${tone}`}>
      ▸ {p.next_step}
      {day ? ` · ${day === today ? `Today ${ukTime(p.next_step_at!)}` : dueWords(day, today)}` : ''}
    </span>
  );
}

/** "Move to…": the stages as big buttons (works by keyboard and touch, no dragging). */
export function MoveSheet({
  p,
  stages,
  onMove,
  onClose,
}: {
  p: { id: string; stage: string; customer?: string | null; title: string };
  stages: readonly string[];
  onMove: (id: string, stage: string) => void;
  onClose: () => void;
}) {
  return (
    <Sheet title={`Move ${p.customer || p.title}`} onClose={onClose}>
      <div className="crm-stage-list">
        {stages.map((k) => (
          <button
            key={k}
            type="button"
            disabled={k === p.stage}
            onClick={() => {
              onClose();
              onMove(p.id, k);
            }}
          >
            <StageChip stage={k} /> {k === p.stage ? <small className="crm-muted">(now)</small> : null}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
