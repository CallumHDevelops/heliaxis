'use client';

import { useState } from 'react';
import { COPIED, boardKey, circuitKey, newId, nextNumber, type Board, type Circuit } from '@/lib/site/forms/electrician/eic-model';
import type { BoardsView, PropView, RecView } from '@/lib/eic-manual/server';
import { WritingSpark } from '../sales/quotes/[id]/WritingSpark';
import '../sales/quotes/quotes.css';
import { FileButton } from '../crm/CrmUi';
import { Control } from './Controls';

type Rec = Record<string, unknown>;
type Patch = { set?: Record<string, unknown>; unset?: string[] };

/**
 * The boards and their circuits (the Schedules of Circuit Details and Test Results). One card per board, its circuits under it; a circuit opens
 * to its details (columns 1–16) and its test results (17–31). Edits to a record go through `change` (saved a moment after typing);
 * adding, copying and removing go through `send` straight away, so what is drawn is always what the server has.
 */
export function EicBoards({ data, change, send, locked, scanUrl }: { data: BoardsView; change: (key: string, v: unknown) => void; send: (p: Patch) => Promise<void>; locked: boolean; /** Where a photo is posted to be read into circuits. */ scanUrl: string }) {
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
  /** Circuits read from a photo, added to a board (or a new one) in one go. */
  async function addRead(target: string, meta: { ref: string | null; location: string | null }, rows: Suggested[]) {
    const set: Record<string, unknown> = {};
    let boardId = target;
    let o = Math.max(0, ...allCircuits.map((x) => x.o));
    if (target === 'new') {
      boardId = newId();
      set[boardKey(boardId)] = { o: Math.max(0, ...data.boards.map((b) => Number(b.rec.o) || 0)) + 1, ref: meta.ref || `DB${data.boards.length + 1}`, ...(meta.location ? { loc: meta.location } : {}) };
    }
    for (const r of rows) set[circuitKey(newId())] = { ...r.fields, board: boardId, o: ++o };
    await send({ set });
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
      {!locked && <ScanBox url={scanUrl} boards={data.boards.map((b) => ({ id: b.id, name: b.name }))} onAdd={addRead} />}
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

type Suggested = { id: string; fields: Record<string, unknown>; unsure: string[] };
type Read = { ok: true; kind: string; board: { ref: string | null; location: string | null } | null; circuits: Suggested[]; left_out: number };

/** The photo, shrunk in the browser (the host refuses bodies over about 4.5 MB): 2000 px on the long side, JPEG. */
async function shrink(file: File): Promise<File> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.85));
  if (!blob) throw new Error('Couldn’t read that photo.');
  return new File([blob], 'photo.jpg', { type: 'image/jpeg' });
}

const device = (f: Record<string, unknown>) => [f.ocpd_type, f.ocpd_a ? `${f.ocpd_a} A` : null, f.ocpd_bs ? `BS ${f.ocpd_bs}` : null].filter(Boolean).join(' ');
const readings = (f: Record<string, unknown>) => [f.zs !== undefined ? `Zs ${f.zs}` : null, f.ir_le !== undefined ? `IR ${f.ir_le}` : null, f.r12 !== undefined ? `R1+R2 ${f.r12}` : null].filter(Boolean).join(' · ');

/**
 * "Read from a photo": a photo of the board, or of a paper test sheet, read into circuits. Nothing is added until it has been looked over
 * here: tick the ones that are right, pick the board, press Add. Anything the reader wasn't sure of is left out, to be typed.
 */
function ScanBox({ url, boards, onAdd }: { url: string; boards: { id: string; name: string }[]; onAdd: (target: string, meta: { ref: string | null; location: string | null }, rows: Suggested[]) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [read, setRead] = useState<Read | null>(null);
  const [on, setOn] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState('new');
  const [adding, setAdding] = useState(false);
  async function scan(files: File[]) {
    if (!files[0]) return;
    setBusy(true);
    setErr('');
    setRead(null);
    try {
      const fd = new FormData();
      fd.append('file', await shrink(files[0]));
      const r = await fetch(url, { method: 'POST', body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || 'It couldn’t read that photo. Try again.');
      const got = d as Read;
      setRead(got);
      setOn(new Set(got.circuits.map((c) => c.id)));
      setTarget(boards.length === 1 && !got.board?.ref ? boards[0].id : got.board?.ref && boards.find((b) => b.name === got.board!.ref) ? boards.find((b) => b.name === got.board!.ref)!.id : 'new');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'It couldn’t read that photo.');
    } finally {
      setBusy(false);
    }
  }
  async function add() {
    if (!read) return;
    setAdding(true);
    await onAdd(target, read.board ?? { ref: null, location: null }, read.circuits.filter((c) => on.has(c.id)));
    setAdding(false);
    setRead(null);
  }
  return (
    <section className="em-scan">
      <div className="em-scan__head">
        <div>
          <b>Read from a photo</b>
          <small>A photo of the board, or of a paper test sheet or an old certificate’s schedule. The circuits are read for you to check; nothing is added until you say.</small>
        </div>
        <FileButton label={busy ? 'Reading…' : 'Choose a photo'} accept="image/jpeg,image/png,image/webp" busy={busy} onFiles={(f) => void scan(f)} variant="solar" />
      </div>
      {busy && <WritingSpark label="Reading the photo" steps={['Looking at the photo', 'Finding the circuits', 'Reading each one', 'Checking what is certain']} stepMs={2500} />}
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
      {read && (
        <div className="em-scan__review">
          <p className="em-scan__note">
            {read.circuits.length} circuit{read.circuits.length === 1 ? '' : 's'} read{read.kind === 'test_sheet' ? ' from a test sheet (with their readings)' : ' from the board'}.
            {read.left_out > 0 ? ` ${read.left_out} value${read.left_out === 1 ? ' was' : 's were'} too unclear to use and ${read.left_out === 1 ? 'is' : 'are'} left for you to type.` : ''} Check each against the photo.
          </p>
          <table className="em-scan__table">
            <thead>
              <tr>
                <th />
                <th>No.</th>
                <th>Circuit</th>
                <th>Device</th>
                <th>RCD</th>
                <th>Readings</th>
              </tr>
            </thead>
            <tbody>
              {read.circuits.map((c) => (
                <tr key={c.id} className={c.unsure.length ? 'is-doubt' : ''}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Add circuit ${String(c.fields.n ?? '')}`}
                      checked={on.has(c.id)}
                      onChange={(e) => setOn((x) => (e.target.checked ? new Set([...x, c.id]) : new Set([...x].filter((y) => y !== c.id))))}
                    />
                  </td>
                  <td>{String(c.fields.n ?? '')}</td>
                  <td>
                    {String(c.fields.desc ?? '') || <i>not read</i>}
                    {c.unsure.length > 0 && <small className="em-scan__unsure"> unsure: {c.unsure.join(', ')}</small>}
                  </td>
                  <td>{device(c.fields)}</td>
                  <td>{c.fields.rcd === 'yes' ? `RCD${c.fields.rcd_idn ? ` ${c.fields.rcd_idn} mA` : ''}` : c.fields.rcd === 'no' ? 'No' : ''}</td>
                  <td>{readings(c.fields)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="em-scan__foot">
            <label>
              Add to{' '}
              <select className="crm-input" value={target} onChange={(e) => setTarget(e.target.value)}>
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
                <option value="new">A new board{read.board?.ref ? ` (${read.board.ref})` : ''}</option>
              </select>
            </label>
            <button type="button" className="crm-btn crm-btn--solar crm-btn--small" disabled={adding || on.size === 0} onClick={() => void add()}>
              {adding ? 'Adding…' : `Add ${on.size} circuit${on.size === 1 ? '' : 's'}`}
            </button>
            <button type="button" className="crm-link" onClick={() => setRead(null)}>
              Throw this away
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
