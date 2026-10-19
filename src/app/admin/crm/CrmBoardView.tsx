'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { money, SALES_STAGES, stageLabel } from '@/lib/crm/stages';
import { CrmCard, MoveSheet } from './CrmCard';
import { useBoardHeight } from './board-height';
import { wonRecently, type PipelineProject } from './crm-shared';
import type { ActiveChat } from './dock-link';

const STEP = 50;
const MOVE_TO = [...SALES_STAGES, 'won', 'lost'] as const;

/**
 * The CRM board: a column per sales stage plus "Won (last 30 days)". Columns share the width (200 to
 * 320px each), empty ones fold to a thin rail, and each scrolls on its own inside a box that ends at
 * the bottom of the window, so the sideways scrollbar is always on screen. 50 cards a column, then
 * "Show 50 more". Drag a card, or use its Move button.
 */
export function CrmBoardView({
  projects,
  now,
  today,
  chats,
  focus,
  onMove,
}: {
  projects: PipelineProject[];
  now: number;
  today: string;
  chats: ActiveChat[] | null;
  /** A stage picked in the stage strip: scroll to it (n changes each time). */
  focus: { key: string; n: number } | null;
  onMove: (id: string, stage: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  useBoardHeight(box);
  const [shown, setShown] = useState<Record<string, number>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [moving, setMoving] = useState<PipelineProject | null>(null);
  const chatOf = useMemo(() => {
    const m = new Map<string, ActiveChat>();
    for (const c of chats ?? []) for (const id of c.enquiryIds) if (c.unread > 0) m.set(id, c);
    return m;
  }, [chats]);

  const columns = [
    ...SALES_STAGES.map((k) => ({ key: k as string, label: stageLabel(k), cards: projects.filter((p) => p.stage === k) })),
    { key: 'won30', label: 'Won (last 30 days)', cards: projects.filter((p) => wonRecently(p, now)) },
  ];

  // The stage strip asked for a column: bring it into view (the board scrolls sideways at narrower widths).
  useEffect(() => {
    if (!focus) return;
    const col = box.current?.querySelector<HTMLElement>(`[data-col="${focus.key}"]`);
    if (!col) return;
    col.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    col.classList.add('is-flash');
    const t = setTimeout(() => col.classList.remove('is-flash'), 1600);
    return () => clearTimeout(t);
  }, [focus]);

  return (
    <>
      <div className="crmb" ref={box} role="region" aria-label="Board" tabIndex={0}>
        {columns.map((c) => {
          const total = c.cards.reduce((n, p) => n + (Number(p.value) || 0), 0);
          const limit = shown[c.key] ?? STEP;
          const droppable = c.key !== 'won30';
          if (!c.cards.length) {
            return (
              <div
                key={c.key}
                data-col={c.key}
                className={`crmb-rail${over === c.key ? ' is-over' : ''}`}
                title={`${c.label}: nothing here`}
                onDragOver={(e) => {
                  if (!droppable || !dragId) return;
                  e.preventDefault();
                  setOver(c.key);
                }}
                onDragLeave={() => setOver(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(null);
                  const id = e.dataTransfer.getData('text/plain');
                  setDragId(null);
                  if (id && droppable) onMove(id, c.key);
                }}
              >
                <span>{c.label}</span>
                <b>0</b>
              </div>
            );
          }
          return (
            <section
              key={c.key}
              data-col={c.key}
              className={`crmb-col${over === c.key ? ' is-over' : ''}`}
              aria-label={c.label}
              onDragOver={(e) => {
                if (!droppable || !dragId) return;
                e.preventDefault();
                setOver(c.key);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const id = e.dataTransfer.getData('text/plain');
                setDragId(null);
                if (id && droppable) onMove(id, c.key);
              }}
            >
              <header className="crmb-col__h">
                <b>{c.label}</b>
                <span>
                  {c.cards.length}
                  {total ? ` · ${money(total)}` : ''}
                </span>
              </header>
              <div className="crmb-col__cards">
                {c.cards.slice(0, limit).map((p) => (
                  <CrmCard
                    key={p.id}
                    p={p}
                    now={now}
                    today={today}
                    chat={chatOf.get(p.enquiry_id)}
                    compact
                    onMove={setMoving}
                    dragging={dragId === p.id}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', p.id);
                      e.dataTransfer.effectAllowed = 'move';
                      setDragId(p.id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOver(null);
                    }}
                  />
                ))}
                {c.cards.length > limit && (
                  <button type="button" className="crmb-more" onClick={() => setShown((s) => ({ ...s, [c.key]: limit + STEP }))}>
                    Show {Math.min(STEP, c.cards.length - limit)} more
                  </button>
                )}
                {c.key === 'won30' && (
                  <Link href="/admin/projects" className="crmb-more">
                    Open in Projects →
                  </Link>
                )}
              </div>
            </section>
          );
        })}
      </div>
      {moving && <MoveSheet p={moving} stages={MOVE_TO} onMove={onMove} onClose={() => setMoving(null)} />}
    </>
  );
}
