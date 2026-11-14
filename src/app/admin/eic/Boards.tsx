'use client';

import { useState } from 'react';
import { COPIED, boardKey, circuitKey, newId, nextNumber, type Board, type Circuit } from '@/lib/site/forms/electrician/eic-model';
import type { BoardsView, PropView, RecView } from '@/lib/eic-manual/server';
import { Control } from './Controls';

type Rec = Record<string, unknown>;
type Patch = { set?: Record<string, unknown>; unset?: string[] };

/**
 * The boards and their circuits (the Schedules of Circuit Details and Test Results). One card per board, its circuits under it; a circuit opens
 * to its details (columns 1–16) and its test results (17–31). Edits to a record go through `change` (saved a moment after typing);
 * adding, copying and removing go through `send` straight away, so what is drawn is always what the server has.
 */
export function EicBoards({ data, change, send, locked }: { data: BoardsView; change: (key: string, v: unknown) => void; send: (p: Patch) => Promise<void>; locked: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const strip = (r: Rec) => {
    const { id: _id, ...rest } = r;
    void _id;
    return rest;
  };
  const allCircuits = data.boards.flatMap((b) => b.circuits.map((c) => ({ ...c.rec, id: c.id, board: b.id, o: Number(c.rec.o) || 0 }) as Circuit));

  async function addBoard() {
    const id = newId();
    const o = Math.max(0, ...data.boards.map((b) => Number(b.rec.o) || 0)) + 1;
    await send({ set: { [boardKey(id)]: { o, ref: data.boards.length ? `DB${data.boards.length + 1}` : 'DB1' } } });
  }
  async function addCircuit(b: RecView, copy?: RecView) {
    const id = newId();
    const o = Math.max(0, ...allCircuits.map((x) => x.o)) + 1;
    const board = { ...b.rec, id: b.id, o: Number(b.rec.o) || 0 } as Board;
    const n = nextNumber(board, allCircuits, data.pc);
    const copied = copy ? Object.fromEntries(COPIED.filter((k) => k in copy.rec).map((k) => [k, copy.rec[k]])) : {};
    await send({ set: { [circuitKey(id)]: { ...copied, board: b.id, o, ...(n ? { n } : {}) } } });
    setOpen(id);
  }
  const remove = async (key: string, what: string) => {
    if (window.confirm(`Remove ${what}?`)) await send({ unset: [key] });
  };
  const setProp = (key: string, rec: RecView, k: string, v: unknown, also?: Rec) => {
    const next: Rec = { ...strip(rec.rec), ...(also ?? {}) };
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) delete next[k];
    else next[k] = typeof v === 'string' ? v.slice(0, 400) : v;
    change(key, next);
  };

  const Props = ({ props, rec, keyOf }: { props: PropView[]; rec: RecView; keyOf: string }) => (
    <div className="em-props">
      {props
        .filter((p) => rec.shown.includes(p.k))
        .map((p) => {
          const sug = rec.suggest[p.k];
          return (
            <div key={p.k} className={`em-prop${p.test ? ' is-test' : ''}`}>
              <label>
                {p.col ? <i>{p.col}</i> : null}
                {p.label}
                {p.level === 'must' ? <b title="Needed"> *</b> : null}
              </label>
              <Control c={p} value={rec.rec[p.k]} onChange={(v) => !locked && setProp(keyOf, rec, p.k, v)} />
              {sug && rec.rec[p.k] === undefined && !locked && (
                <button type="button" className="em-suggest" onClick={() => setProp(keyOf, rec, p.k, sug.v, sug.also)}>
                  Use {sug.text}
                </button>
              )}
              {p.hint && <small>{p.hint}</small>}
            </div>
          );
        })}
    </div>
  );

  return (
    <div className="em-boards">
      {data.boards.length === 0 && <p className="em-empty">No boards yet. Add the consumer unit or distribution board, then its circuits.</p>}
      {data.boards.map((b) => (
        <section key={b.id} className="em-board">
          <header>
            <h4>
              {b.name} {b.done && b.circuits.length > 0 ? <span className="em-ok">complete</span> : null}
            </h4>
            {!locked && (
              <button type="button" className="crm-link" onClick={() => void remove(boardKey(b.id), `${b.name} and its ${b.circuits.length} circuit${b.circuits.length === 1 ? '' : 's'}`)}>
                Remove board
              </button>
            )}
          </header>
          <Props props={data.props.board} rec={b} keyOf={boardKey(b.id)} />
          <div className="em-circuits">
            <h5>Circuits</h5>
            {b.circuits.length === 0 && <p className="em-empty">No circuits on this board yet.</p>}
            {b.circuits.map((c) => (
              <div key={c.id} className={`em-circuit${open === c.id ? ' is-open' : ''}`}>
                <button type="button" className="em-circuit__bar" aria-expanded={open === c.id} onClick={() => setOpen(open === c.id ? null : c.id)}>
                  <b>{String(c.rec.n ?? '?')}</b>
                  <span>{String(c.rec.desc ?? '') || 'No description yet'}</span>
                  {c.done ? <span className="em-ok">complete</span> : <span className="em-todo">not finished</span>}
                  <i aria-hidden="true">{open === c.id ? '–' : '+'}</i>
                </button>
                {open === c.id && (
                  <div className="em-circuit__body">
                    <h6>Circuit details (columns 1 to 16)</h6>
                    <Props props={data.props.details} rec={c} keyOf={circuitKey(c.id)} />
                    <h6>Test results (columns 17 to 31)</h6>
                    <Props props={data.props.tests} rec={c} keyOf={circuitKey(c.id)} />
                    {!locked && (
                      <div className="em-row-actions">
                        <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => void addCircuit(b, c)}>
                          Copy this circuit’s details to a new circuit
                        </button>
                        <button type="button" className="crm-link" onClick={() => void remove(circuitKey(c.id), `circuit ${String(c.rec.n ?? '')}`)}>
                          Remove circuit
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {!locked && (
              <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => void addCircuit(b)}>
                + Add a circuit
              </button>
            )}
          </div>
        </section>
      ))}
      {!locked && (
        <button type="button" className="crm-btn crm-btn--solar crm-btn--small" onClick={() => void addBoard()}>
          + Add a board
        </button>
      )}
    </div>
  );
}
