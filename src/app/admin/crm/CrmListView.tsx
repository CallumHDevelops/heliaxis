'use client';

import { useMemo, useState } from 'react';
import { SALES_STAGES } from '@/lib/crm/stages';
import { CrmCard, MoveSheet } from './CrmCard';
import { isDue, ukDayOf, type PipelineProject } from './crm-shared';
import type { ActiveChat } from './dock-link';
import type { ListSort } from './CrmBoard';

const STEP = 60;
const MOVE_TO = [...SALES_STAGES, 'won', 'lost'] as const;

/**
 * The CRM list: cards in a grid (one column on phones). The usual order is a work queue: due and
 * overdue first, then unread WhatsApp, then the most recently touched. "Not contacted" and "No next
 * step" go oldest first; surveys by their date.
 */
export function CrmListView({
  projects,
  now,
  today,
  chats,
  sort,
  onMove,
}: {
  projects: PipelineProject[];
  now: number;
  today: string;
  chats: ActiveChat[] | null;
  sort: ListSort;
  onMove: (id: string, stage: string) => void;
}) {
  const [limit, setLimit] = useState(STEP);
  const [moving, setMoving] = useState<PipelineProject | null>(null);
  const chatOf = useMemo(() => {
    const m = new Map<string, ActiveChat>();
    for (const c of chats ?? []) for (const id of c.enquiryIds) if (c.unread > 0) m.set(id, c);
    return m;
  }, [chats]);

  const due = (p: PipelineProject) => (p.next_step && p.next_step_at ? ukDayOf(p.next_step_at) : (p.next_task?.due_date ?? '9999'));
  const list = [...projects].sort((a, b) => {
    if (sort === 'oldest') return a.created_at.localeCompare(b.created_at);
    if (sort === 'survey') return (a.survey_at ?? '9999').localeCompare(b.survey_at ?? '9999');
    const ad = isDue(a, today);
    const bd = isDue(b, today);
    if (ad || bd) return ad !== bd ? (ad ? -1 : 1) : due(a).localeCompare(due(b)) || (a.next_step_at ?? '').localeCompare(b.next_step_at ?? '');
    const au = a.wa_unread > 0 || chatOf.has(a.enquiry_id);
    const bu = b.wa_unread > 0 || chatOf.has(b.enquiry_id);
    if (au !== bu) return au ? -1 : 1;
    return b.updated_at.localeCompare(a.updated_at);
  });

  if (!list.length) return <p className="crm-muted crm-emptystate">Nothing here.</p>;
  return (
    <>
      <p className="crm-muted crm-small crmh-listcount">
        {list.length} {list.length === 1 ? 'opportunity' : 'opportunities'}
      </p>
      <div className="crm-list crmh-list">
        {list.slice(0, limit).map((p) => (
          <CrmCard key={p.id} p={p} now={now} today={today} chat={chatOf.get(p.enquiry_id)} onMove={setMoving} />
        ))}
      </div>
      {list.length > limit && (
        <button type="button" className="crmh-loadmore crmh-listmore" onClick={() => setLimit((n) => n + STEP)}>
          Show {Math.min(STEP, list.length - limit)} more
        </button>
      )}
      {moving && <MoveSheet p={moving} stages={MOVE_TO} onMove={onMove} onClose={() => setMoving(null)} />}
    </>
  );
}
