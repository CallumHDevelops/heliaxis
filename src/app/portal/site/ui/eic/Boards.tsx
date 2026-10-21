'use client';

import { useState } from 'react';
import { addBoard, addCircuit, removeRecord, setProp, skipSuggestion } from '@/lib/site/eic-client';
import {
  BOARD,
  boardDone,
  boardKey,
  boardName,
  boardsOf,
  circuitDone,
  circuitKey,
  DETAILS,
  isGt,
  missingProps,
  nextNumber,
  propCtx,
  readingOf,
  routeOf,
  shownProps,
  suggestionsFor,
  TESTS,
  zsLimit,
  type Board,
  type Circuit,
  type Prop,
  type PropCtx,
} from '@/lib/site/forms/electrician/eic-model';
import { IR_TABLE_64, irMinimumAt } from '@/lib/site/fixed/bs7671-ir';
import { isCalculatedSource, maxZsFor, zsCalculated } from '@/lib/site/fixed/bs7671-zs';
import type { CustomProps } from '../custom';
import { TopBar } from '../bits';
import { back, go, usePath } from '../nav';
import { PropRow } from './Prop';

/**
 * P16: the boards and their circuits. One card per board (its details, then its circuits as cards
 * with Add circuit, and the circuits the job's technologies suggest, greyed, "Add this circuit?").
 * Tapping a circuit opens it full screen with two tabs, Details (columns 1–16) and Test results
 * (17–31), each a short column of number boxes; Next goes on to the next circuit. The address
 * changes as it opens (…/eic-boards/c-<id>), so the phone's Back closes it.
 */
export function EicBoards({ rec, jf, locked }: CustomProps) {
  const job = rec.id;
  const ctx = jf.ctx;
  const { boards, circuits } = boardsOf(ctx.values);
  const pc = propCtx(ctx);
  const path = usePath();
  const open = path.split('/')[6] ?? '';
  const base = `/portal/site/job/${job}/eic-boards`;
  const meiwc = routeOf(ctx) === 'meiwc';
  const [busy, setBusy] = useState(false);

  const openBoard = (id: string) => go(`${base}/b-${id}`);
  const openCircuit = (id: string) => go(`${base}/c-${id}`);
  const newBoard = async () => {
    setBusy(true);
    const id = await addBoard(job, boards);
    setBusy(false);
    openBoard(id);
  };
  const newCircuit = async (b: Board, from: { desc?: string; sug?: string } = {}) => {
    setBusy(true);
    const id = await addCircuit(job, b, circuits, pc, from);
    setBusy(false);
    openCircuit(id);
  };

  const editing = open.startsWith('c-') ? circuits.find((x) => x.id === open.slice(2)) : null;
  const editingBoard = open.startsWith('b-') ? boards.find((x) => x.id === open.slice(2)) : null;
  const suggestions = suggestionsFor(ctx, boards, circuits);

  return (
    <div className="sa-eic">
      {!boards.length && (
        <p className="sa-q-hint">{meiwc ? 'Add the board, then each circuit you worked on. Each gets its own Minor Works.' : 'Start with the consumer unit: add it, then each new circuit on it.'}</p>
      )}
      {boards.map((b, i) => {
        const mine = circuits.filter((x) => x.board === b.id);
        const gaps = missingProps(BOARD, b, pc);
        return (
          <section key={b.id} className="sa-eic-board">
            <button type="button" className="sa-eic-boardhead" onClick={() => openBoard(b.id)}>
              <span className="sa-eic-boardname">{boardName(b)}</span>
              <span className="sa-eic-boardloc">{typeof b.loc === 'string' && b.loc ? b.loc : 'Where is it?'}</span>
              <span className={`sa-eic-state${gaps.length ? '' : ' is-done'}`}>{gaps.length ? `Board details: ${gaps.length} to do` : 'Board details ✓'}</span>
            </button>
            <ul className="sa-eic-circuits">
              {mine.map((x) => (
                <li key={x.id}>
                  <CircuitRow x={x} pc={pc} onOpen={() => openCircuit(x.id)} />
                </li>
              ))}
            </ul>
            {i === 0 &&
              !locked &&
              suggestions.map((s) => (
                <div key={s.sug} className="sa-eic-suggest">
                  <div>
                    <span className="sa-suggest-src">From the job</span>
                    <b>{s.desc}</b>
                    <span className="sa-muted">Add this circuit?</span>
                  </div>
                  <div className="sa-eic-suggest-actions">
                    <button type="button" className="sa-small" disabled={busy} onClick={() => void newCircuit(b, { desc: s.desc, sug: s.sug })}>
                      Add it
                    </button>
                    <button type="button" className="sa-link" disabled={busy} onClick={() => void skipSuggestion(job, b, s.sug)}>
                      Not needed
                    </button>
                  </div>
                </div>
              ))}
            {!locked && (
              <button type="button" className="sa-btn sa-btn-2 sa-eic-add" disabled={busy} onClick={() => void newCircuit(b)}>
                + Add circuit
              </button>
            )}
          </section>
        );
      })}
      {!locked && (
        <button type="button" className={`sa-btn ${boards.length ? 'sa-btn-2' : 'sa-btn-1'} sa-eic-add`} disabled={busy} onClick={() => void newBoard()}>
          {boards.length ? '+ Add another board' : '+ Add the board'}
        </button>
      )}
      {editing && <CircuitEditor key={editing.id} job={job} x={editing} boards={boards} circuits={circuits} pc={pc} locked={locked} base={base} carried={ctx.carried ?? {}} />}
      {editingBoard && <BoardEditor key={editingBoard.id} job={job} b={editingBoard} boards={boards} circuits={circuits} pc={pc} locked={locked} base={base} />}
    </div>
  );
}

function CircuitRow({ x, pc, onOpen }: { x: Circuit; pc: PropCtx; onOpen: () => void }) {
  const d = missingProps(DETAILS, x, pc).length;
  const t = missingProps(TESTS, x, pc).length;
  const device = [x.ocpd_type, x.ocpd_a].filter((v) => v !== undefined && v !== '').join('');
  const state = !d && !t ? '✓ Done' : d ? `Details: ${d} to do` : `Test results: ${t} to do`;
  return (
    <button type="button" className={`sa-eic-circuit${!d && !t ? ' is-done' : ''}`} onClick={onOpen}>
      <span className="sa-eic-num">{String(x.n ?? '?')}</span>
      <span className="sa-eic-desc">
        <b>{typeof x.desc === 'string' && x.desc ? x.desc : 'New circuit'}</b>
        <span className="sa-muted">{[device && `${device} A`, x.csa_live ? `${x.csa_live} mm²` : null, x.rcd === 'yes' ? 'RCD' : null].filter(Boolean).join(' · ') || 'No details yet'}</span>
      </span>
      <span className={`sa-eic-state${!d && !t ? ' is-done' : ''}`}>{state}</span>
    </button>
  );
}

/** The limit beside a reading and a warning when it's outside (never a reading itself). */
function limits(p: Prop, x: Circuit, pc: PropCtx): { note: string | null; warn: string | null } {
  if (p.k === 'zs') {
    const max = zsLimit(x);
    const zs = readingOf(x.zs);
    return {
      note: max !== null ? `Maximum permitted: ${max} Ω (column 12)` : 'Type the maximum permitted Zs on Details (column 12) to check it here.',
      warn: max !== null && zs !== null && !isGt(x.zs) && zs > max ? 'That’s over the maximum permitted. Put it right, or check both figures.' : null,
    };
  }
  if (p.k === 'ir_ll' || p.k === 'ir_le') {
    const v = readingOf(x.ir_v);
    const min = irMinimumAt(v);
    const r = readingOf(x[p.k]);
    return {
      note: min !== null ? `BS 7671 Table 64: at least ${min} MΩ at ${v} V${IR_TABLE_64.verified ? '' : ' (check it against your copy)'}` : null,
      warn: min !== null && r !== null && !isGt(x[p.k]) && r < min ? 'That’s below the Table 64 figure. The office will look at it.' : null,
    };
  }
  if (p.k === 'zs_max') {
    // Once the Chapter 41 tables are copied in (fixed/bs7671-zs.ts), the figure for this device.
    const t = maxZsFor(String(x.ocpd_bs ?? ''), String(x.ocpd_type ?? ''), readingOf(x.ocpd_a));
    const calc = zsCalculated(x, { tt: pc.tt });
    const typed = readingOf(x.zs_max);
    const stale = isCalculatedSource(x.zs_src) && typed !== null && (!calc || calc.ohms !== typed);
    return {
      note: t !== null ? `BS 7671 Chapter 41 gives ${t} Ω for this device.` : calc ? null : 'Type it from BS 7671 Chapter 41 (a fuse’s figure isn’t worked out here).',
      warn: stale ? 'This was worked out for a different device. Take the new figure, or type yours and say where it’s from.' : null,
    };
  }
  if ((p.k === 'rcd_btn' || p.k === 'afdd_btn') && x[p.k] === 'fail') return { note: null, warn: 'Put it right before you sign: a certificate can’t show a failed test button.' };
  return { note: null, warn: null };
}

function CircuitEditor({
  job,
  x,
  boards,
  circuits,
  pc,
  locked,
  base,
  carried,
}: {
  job: string;
  x: Circuit;
  boards: Board[];
  circuits: Circuit[];
  pc: PropCtx;
  locked: boolean;
  base: string;
  carried: Record<string, { from: string }>;
}) {
  const [tab, setTab] = useState<'details' | 'tests'>(missingProps(DETAILS, x, pc).length ? 'details' : 'tests');
  const key = circuitKey(x.id);
  const board = boards.find((b) => b.id === x.board);
  const list = shownProps(tab === 'details' ? DETAILS : TESTS, x, pc);
  const dLeft = missingProps(DETAILS, x, pc).length;
  const tLeft = missingProps(TESTS, x, pc).length;
  const order = circuits;
  const next = order[order.findIndex((c) => c.id === x.id) + 1];
  const title = `${board ? boardName(board) : 'Board'} · circuit ${String(x.n ?? '?')}`;
  const show = (t: 'details' | 'tests') => {
    setTab(t);
    document.querySelector('.sa-eic-sheet')?.scrollTo(0, 0);
  };
  return (
    <div className="sa-eic-sheet" role="dialog" aria-modal="true" aria-label={title}>
      <TopBar title={title} onBack={() => back(base)} />
      <div className="sa-eic-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'details'} className={tab === 'details' ? 'is-on' : ''} onClick={() => show('details')}>
          Details {dLeft ? <span className="sa-eic-left">{dLeft}</span> : <span aria-label="done">✓</span>}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'tests'} className={tab === 'tests' ? 'is-on' : ''} onClick={() => show('tests')}>
          Test results {tLeft ? <span className="sa-eic-left">{tLeft}</span> : <span aria-label="done">✓</span>}
        </button>
      </div>
      <main className="sa-main sa-step">
        {tab === 'tests' && <p className="sa-intro">Type each reading as your tester shows it. Nothing here is filled in for you.</p>}
        {list.map((p) => {
          const l = limits(p, x, pc);
          // A worked-out figure (max Zs) is offered until a value is there; taking it records its source for Remarks.
          // A circuit added before its board's first free way was given: the next free way, offered.
          const way = p.k === 'n' && board && !String(x.n ?? '').trim() ? nextNumber(board, circuits, pc) : '';
          const sug = way ? { v: way, text: `${way}, the next free way on ${boardName(board!)}` } : x[p.k] === undefined ? (p.suggest?.(x, pc) ?? null) : null;
          const take = sug
            ? async () => {
                await setProp(job, key, p.k, sug.v);
                for (const [k, val] of Object.entries(sug.also ?? {})) await setProp(job, key, k, val);
              }
            : undefined;
          const change = (v: unknown) => {
            void setProp(job, key, p.k, v);
            // Typed over the worked-out figure: its "calculated" note no longer says where the figure came from.
            if (p.k === 'zs_max' && isCalculatedSource(x.zs_src) && readingOf(v) !== readingOf(x.zs_max)) void setProp(job, key, 'zs_src', undefined);
          };
          return (
            <PropRow key={p.k} p={p} id={`${key}.${p.k}`} value={x[p.k]} onChange={change} disabled={locked} note={l.note} warn={l.warn} suggest={sug} onTake={take} carried={carried[`${key}.${p.k}`]?.from ?? null} />
          );
        })}
        {!locked && tab === 'details' && (
          <div className="sa-eic-more">
            <button
              type="button"
              className="sa-btn sa-btn-2"
              onClick={async () => {
                if (!board) return;
                const id = await addCircuit(job, board, circuits, pc, { copy: x });
                go(`${base}/c-${id}`, { replace: true });
              }}
            >
              Duplicate: same details, new circuit
            </button>
            <button
              type="button"
              className="sa-link sa-eic-remove"
              onClick={async () => {
                if (!window.confirm(`Take circuit ${String(x.n ?? '')} off the certificate?`)) return;
                await removeRecord(job, key);
                back(base);
              }}
            >
              Remove this circuit
            </button>
          </div>
        )}
      </main>
      <nav className="sa-bottom">
        <button type="button" className="sa-btn sa-btn-2" onClick={() => back(base)}>
          Board
        </button>
        {tab === 'details' ? (
          <button type="button" className="sa-btn sa-btn-1" onClick={() => show('tests')}>
            Test results
          </button>
        ) : next ? (
          <button type="button" className="sa-btn sa-btn-1" onClick={() => go(`${base}/c-${next.id}`, { replace: true })}>
            Next: circuit {String(next.n ?? '')}
          </button>
        ) : (
          <button type="button" className="sa-btn sa-btn-1" onClick={() => back(base)}>
            {circuitDone(x, pc) ? 'Done ✓' : 'Done for now'}
          </button>
        )}
      </nav>
    </div>
  );
}

function BoardEditor({ job, b, boards, circuits, pc, locked, base }: { job: string; b: Board; boards: Board[]; circuits: Circuit[]; pc: PropCtx; locked: boolean; base: string }) {
  const key = boardKey(b.id);
  const mine = circuits.filter((x) => x.board === b.id);
  const list = shownProps(BOARD, b, pc).map((p) => (p.k === 'from' ? { ...p, picks: ['Origin', ...boards.filter((o) => o.id !== b.id).map(boardName)] } : p));
  return (
    <div className="sa-eic-sheet" role="dialog" aria-modal="true" aria-label={`${boardName(b)} details`}>
      <TopBar title={`${boardName(b)} · board details`} onBack={() => back(base)} />
      <main className="sa-main sa-step">
        {list.map((p) => (
          <PropRow key={p.k} p={p} id={`${key}.${p.k}`} value={b[p.k]} onChange={(v) => void setProp(job, key, p.k, v)} disabled={locked} />
        ))}
        {!locked && !mine.length && (
          <div className="sa-eic-more">
            <button
              type="button"
              className="sa-link sa-eic-remove"
              onClick={async () => {
                await removeRecord(job, key);
                back(base);
              }}
            >
              Remove this board
            </button>
          </div>
        )}
      </main>
      <nav className="sa-bottom">
        <button type="button" className="sa-btn sa-btn-2" onClick={() => back(base)}>
          Back
        </button>
        <button type="button" className="sa-btn sa-btn-1" onClick={() => back(base)}>
          {boardDone(b, pc) ? 'Done ✓' : 'Done for now'}
        </button>
      </nav>
    </div>
  );
}

