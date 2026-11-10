'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment, useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { BrandLogo } from '@/components/theme/BrandLogo';
import { BLOCK_LABEL, newBlock, newId, parasOf, type Block, type BlockType, type Run, type WriteupContent } from '@/lib/writeups/types';
import { FileButton } from '../../../crm/CrmUi';
import '../../../crm/crm.css';
import '../documents.css';

type Who = { kind: 'customer' | 'organisation' | null; id: string | null; name: string; address: string; ref: string | null };
type QuoteOpt = { id: string; number: string; title: string; status: string };
type Doc = { id: string; number: string; title: string; enquiry_id: string | null; organisation_id: string | null; project_id: string | null; content: WriteupContent };
type Found = { id: string; name: string; postcode: string | null; phone: string | null; customer_ref: string | null; organisation?: boolean; contact?: boolean };
type QuoteTable = { number: string; title: string; headers: string[]; rows: string[][]; totals: [string, string][] };
type Drag = { kind: 'move'; id: string } | { kind: 'new'; type: BlockType; side?: 'left' | 'right' | 'full' } | { kind: 'lib'; blocks: Block[] } | null;
type LibItem = { id?: string; key?: string; name: string; note?: string; blocks: Block[] };
/** A picture of the site's own is shown from the website; the others from the link the server made. */
const srcOf = (path: string, urls: Record<string, string>) => (path.startsWith('assets/') ? `/${path}` : urls[path]);
/** Fresh copies of library blocks (their own ids), so the same section can be used twice in a document. */
const fresh = (bs: Block[]): Block[] => bs.map((b) => ({ ...b, id: newId() }) as Block);

/** Shrink a picture in the browser (max 1600 px, JPEG) so it uploads quickly and keeps the document small. */
async function shrink(file: File): Promise<File> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.82));
  if (!blob) throw new Error('Couldn’t read that picture.');
  return new File([blob], 'picture.jpg', { type: 'image/jpeg' });
}

const PALETTE: { label: string; hint: string; type: BlockType; side?: 'left' | 'right' | 'full' }[] = [
  { label: 'Section', hint: 'A big heading', type: 'section' },
  { label: 'Title', hint: 'A smaller heading', type: 'title' },
  { label: 'Text', hint: 'Paragraphs and lists', type: 'text' },
  { label: 'Picture left', hint: 'Picture with text beside it', type: 'image', side: 'left' },
  { label: 'Picture right', hint: 'Text, then the picture', type: 'image', side: 'right' },
  { label: 'Picture full width', hint: 'A wide picture', type: 'image', side: 'full' },
  { label: 'Table', hint: 'You fill it in', type: 'table' },
  { label: 'Quote table', hint: 'From the customer’s quote', type: 'quote' },
  { label: 'Page break', hint: 'Start a new page', type: 'break' },
];

const summary = (b: Block): string => {
  switch (b.type) {
    case 'section':
    case 'title':
      return b.text || 'Empty';
    case 'text':
      return b.body.trim().split('\n')[0] || 'Empty';
    case 'image':
      return b.caption || b.body.trim().split('\n')[0] || (b.path ? 'Picture' : 'No picture yet');
    case 'table':
      return b.caption || `${b.headers.filter(Boolean).join(', ') || 'Table'}`;
    case 'quote':
      return b.caption || (b.quote_id ? 'Quote chosen' : 'Choose a quote');
    default:
      return 'New page starts here';
  }
};

export function DocumentEditor({ id, admin }: { id: string; admin: boolean }) {
  const router = useRouter();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [who, setWho] = useState<Who | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [quotes, setQuotes] = useState<QuoteOpt[]>([]);
  const [qtables, setQtables] = useState<Record<string, QuoteTable>>({});
  const [err, setErr] = useState('');
  const [state, setState] = useState<'' | 'saving' | 'saved'>('');
  const [picking, setPicking] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag>(null);
  const [over, setOver] = useState<number | null>(null);
  const [lib, setLib] = useState<{ standard: LibItem[]; saved: LibItem[] }>({ standard: [], saved: [] });
  const [libQ, setLibQ] = useState('');
  const [saveFor, setSaveFor] = useState<string | null>(null);
  const [saveName, setSaveName] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    const r = await fetch(`/api/crm/writeups/${id}`, { cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setErr(d.error || 'Couldn’t open the document.');
    setDoc(d.document as Doc);
    setWho(d.who as Who);
    setUrls(d.urls ?? {});
    setQuotes(d.quotes ?? []);
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  const loadLib = useCallback(async () => {
    const r = await fetch('/api/crm/writeups/library', { cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (r.ok) setLib({ standard: d.standard ?? [], saved: d.saved ?? [] });
  }, []);
  useEffect(() => {
    void loadLib();
  }, [loadLib]);

  // Saved a moment after typing stops.
  const latest = useRef<Doc | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const first = useRef(true);
  useEffect(() => {
    latest.current = doc;
    if (!doc) return;
    if (first.current) {
      first.current = false;
      return;
    }
    clearTimeout(timer.current);
    setState('saving');
    timer.current = setTimeout(async () => {
      const d = latest.current;
      if (!d) return;
      const r = await fetch(`/api/crm/writeups/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: d.title, content: d.content, enquiry_id: d.enquiry_id, organisation_id: d.organisation_id, project_id: d.project_id }),
      }).catch(() => null);
      if (!r || !r.ok) {
        setState('');
        return setErr('Couldn’t save. Check your connection; your changes are still on this page.');
      }
      setErr('');
      setState('saved');
    }, 800);
    return () => clearTimeout(timer.current);
  }, [doc, id]);

  // A chosen quote's lines for the page preview.
  const wanted = (doc?.content.blocks ?? []).flatMap((b) => (b.type === 'quote' && b.quote_id && !qtables[b.quote_id] ? [b.quote_id] : []));
  const wantedKey = [...new Set(wanted)].join(',');
  useEffect(() => {
    for (const q of wantedKey ? wantedKey.split(',') : []) {
      void fetch(`/api/crm/writeups/${id}/quote?q=${q}`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => d.table && setQtables((t) => ({ ...t, [q]: d.table as QuoteTable })))
        .catch(() => null);
    }
  }, [wantedKey, id]);

  const edit = (fn: (d: Doc) => Doc) => setDoc((d) => (d ? fn(d) : d));
  const setBlocks = (fn: (b: Block[]) => Block[]) => edit((d) => ({ ...d, content: { ...d.content, blocks: fn(d.content.blocks) } }));
  const patchBlock = (bid: string, patch: Record<string, unknown>) => setBlocks((bs) => bs.map((b) => (b.id === bid ? ({ ...b, ...patch } as Block) : b)));
  const blocks = doc?.content.blocks ?? [];

  function nudge(bid: string, by: number) {
    setBlocks((bs) => {
      const i = bs.findIndex((b) => b.id === bid);
      const j = i + by;
      if (i < 0 || j < 0 || j >= bs.length) return bs;
      const next = [...bs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  /** Put what is being dragged (a block, or a new one from the palette) at a place in the list. */
  function dropAt(index: number) {
    if (!drag) return;
    if (drag.kind === 'new') {
      const b = newBlock(drag.type, drag.side);
      setBlocks((bs) => [...bs.slice(0, index), b, ...bs.slice(index)]);
      setSel(b.id);
    } else if (drag.kind === 'lib') {
      const add = fresh(drag.blocks);
      setBlocks((bs) => [...bs.slice(0, index), ...add, ...bs.slice(index)]);
      setSel(add[0]?.id ?? null);
    } else {
      setBlocks((bs) => {
        const from = bs.findIndex((b) => b.id === drag.id);
        if (from < 0) return bs;
        const moved = bs[from];
        const rest = bs.filter((b) => b.id !== drag.id);
        const at = index > from ? index - 1 : index;
        return [...rest.slice(0, at), moved, ...rest.slice(at)];
      });
    }
    setDrag(null);
    setOver(null);
  }

  /** Where in the list the pointer is: before or after the block it is over. */
  function overIndex(e: DragEvent<HTMLElement>, i: number) {
    e.preventDefault();
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    setOver(e.clientY < r.top + r.height / 2 ? i : i + 1);
  }
  const startDrag = (d: Drag) => (e: DragEvent<HTMLElement>) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', 'block');
    setDrag(d);
  };
  const endDrag = () => {
    setDrag(null);
    setOver(null);
  };

  function pickBlock(bid: string, fromOutline = false) {
    setSel(bid);
    if (fromOutline) document.getElementById(`blk-${bid}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function addBlock(type: BlockType, side?: 'left' | 'right' | 'full') {
    const b = newBlock(type, side);
    setBlocks((bs) => [...bs, b]);
    setSel(b.id);
    setTimeout(() => document.getElementById(`blk-${b.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
  }

  /** A library section onto the end of the page. */
  function insertLib(item: LibItem) {
    const add = fresh(item.blocks);
    setBlocks((bs) => [...bs, ...add]);
    setSel(add[0]?.id ?? null);
    setNote(`Added “${item.name}”.`);
    setTimeout(() => document.getElementById(`blk-${add[0]?.id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60);
  }

  /** What "Save to library" would take: a heading and everything after it up to the next heading, or the one block. */
  function savePart(bid: string): Block[] {
    const i = blocks.findIndex((b) => b.id === bid);
    if (i < 0) return [];
    if (blocks[i].type !== 'section') return [blocks[i]];
    let j = i + 1;
    while (j < blocks.length && blocks[j].type !== 'section') j++;
    return blocks.slice(i, j);
  }

  function startSave(bid: string) {
    const b = blocks.find((x) => x.id === bid);
    setSaveFor(bid);
    setSaveName(b && (b.type === 'section' || b.type === 'title') && b.text.trim() ? b.text.trim() : b ? BLOCK_LABEL[b.type] : '');
    setNote('');
  }

  async function saveToLibrary() {
    if (!saveFor) return;
    const r = await fetch('/api/crm/writeups/library', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: saveName, blocks: savePart(saveFor) }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setErr(d.error || 'Couldn’t save it to the library.');
    setErr('');
    setSaveFor(null);
    setNote(`Saved “${saveName.trim()}” to the library.`);
    void loadLib();
  }

  async function deleteSaved(item: LibItem) {
    if (!item.id || !window.confirm(`Remove “${item.name}” from the library? Documents already using it keep their copy.`)) return;
    await fetch(`/api/crm/writeups/library/${item.id}`, { method: 'DELETE' });
    void loadLib();
  }

  async function assign(p: { enquiry_id?: string | null; organisation_id?: string | null }) {
    edit((d) => ({ ...d, enquiry_id: p.enquiry_id ?? null, organisation_id: p.organisation_id ?? null, project_id: null }));
    setPicking(false);
    await fetch(`/api/crm/writeups/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enquiry_id: p.enquiry_id ?? null, organisation_id: p.organisation_id ?? null, project_id: null }) });
    const r = await fetch(`/api/crm/writeups/${id}`, { cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (r.ok) {
      setWho(d.who as Who);
      setQuotes(d.quotes ?? []);
    }
  }

  async function upload(bid: string, files: File[]) {
    setErr('');
    try {
      const small = await shrink(files[0]);
      const fd = new FormData();
      fd.append('file', small);
      const r = await fetch(`/api/crm/writeups/${id}/image`, { method: 'POST', body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Upload failed');
      setUrls((u) => ({ ...u, [d.path]: d.url }));
      patchBlock(bid, { path: d.path });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed');
    }
  }

  async function remove() {
    if (!window.confirm(`Delete ${doc?.number}? This can’t be undone.`)) return;
    const r = await fetch(`/api/crm/writeups/${id}`, { method: 'DELETE' });
    if (r.ok) router.push('/admin/sales/documents');
    else setErr((await r.json().catch(() => ({}))).error || 'Couldn’t delete it.');
  }

  if (!doc) return <div className="dw-editor">{err ? <p className="crm-banner crm-banner--err">{err}</p> : <p className="crm-muted">Opening…</p>}</div>;

  const dropEnd = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dropAt(over ?? blocks.length);
  };

  return (
    <div className="crm dw-app" onDragEnd={endDrag}>
      <div className="dw-top">
        <Link href="/admin/sales/documents" className="dw-back">
          ← Documents
        </Link>
        <b className="dw-topnum">{doc.number}</b>
        <span className="dw-grow" />
        <span className="dw-saved" role="status">
          {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : ''}
        </span>
        <a className="crm-btn crm-btn--ghost crm-btn--small" href={`/api/crm/writeups/${id}/download?format=pdf&inline=1`} target="_blank" rel="noreferrer">
          Preview PDF
        </a>
        <a className="crm-btn crm-btn--solar crm-btn--small" href={`/api/crm/writeups/${id}/download?format=pdf`}>
          Download PDF
        </a>
        <a className="crm-btn crm-btn--solar crm-btn--small" href={`/api/crm/writeups/${id}/download?format=docx`}>
          Download Word
        </a>
      </div>
      {err && <p className="crm-banner crm-banner--err">{err}</p>}

      <div className="dw-split">
        {/* ── Left: the document's details, its sections (drag to reorder) and what can be added ── */}
        <aside className="dw-side" aria-label="Sections">
          <div className="dw-panel">
            <div className="dw-lab">Assigned to</div>
            {who?.name ? (
              <div className="dw-who">
                <b>{who.name}</b>
                <small>
                  {who.kind === 'organisation' ? 'Organisation' : 'Customer'}
                  {who.ref ? ` · ${who.ref}` : ''}
                </small>
              </div>
            ) : (
              <p className="crm-muted crm-small" style={{ margin: 0 }}>
                Not assigned yet. Their name and address print on the first page.
              </p>
            )}
            <div className="dw-tools">
              <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => setPicking((p) => !p)}>
                {who?.name ? 'Change' : 'Assign to a customer'}
              </button>
              {who?.name && (
                <button type="button" className="crm-link" onClick={() => void assign({})}>
                  Clear
                </button>
              )}
            </div>
            {picking && <CustomerPicker onPick={(f) => void assign(f.organisation ? { organisation_id: f.id } : { enquiry_id: f.id })} />}
          </div>

          <div className="dw-panel">
            <div className="dw-lab">Sections</div>
            <div
              className={`dw-outline${drag ? ' is-dragging' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (over === null) setOver(blocks.length);
              }}
              onDrop={dropEnd}
            >
              {blocks.length === 0 && <p className="dw-empty-note">Drag a section here from below, or click one to add it.</p>}
              {blocks.map((b, i) => (
                <Fragment key={b.id}>
                  {over === i && drag && <div className="dw-dropline" />}
                  <div
                    className={`dw-row${sel === b.id ? ' is-sel' : ''}${drag?.kind === 'move' && drag.id === b.id ? ' is-drag' : ''}`}
                    draggable
                    onDragStart={startDrag({ kind: 'move', id: b.id })}
                    onDragOver={(e) => overIndex(e, i)}
                    onDrop={dropEnd}
                    onClick={() => pickBlock(b.id, true)}
                  >
                    <span className="dw-grip" aria-hidden="true">
                      ⠿
                    </span>
                    <span className="dw-rowmain">
                      <b>{b.type === 'image' ? `Picture ${b.side === 'full' ? 'full width' : b.side}` : BLOCK_LABEL[b.type]}</b>
                      <small>{summary(b)}</small>
                    </span>
                    <button
                      type="button"
                      className="dw-x"
                      aria-label={`Delete ${BLOCK_LABEL[b.type]}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setBlocks((bs) => bs.filter((x) => x.id !== b.id));
                        if (sel === b.id) setSel(null);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </Fragment>
              ))}
              {over === blocks.length && drag && <div className="dw-dropline" />}
            </div>
          </div>

          <div className="dw-panel">
            <div className="dw-lab">Add a section</div>
            <div className="dw-palette">
              {PALETTE.map((p) => (
                <button key={p.label} type="button" className="dw-chip" draggable onDragStart={startDrag({ kind: 'new', type: p.type, side: p.side })} onClick={() => addBlock(p.type, p.side)} title={`${p.hint}. Click to add at the end, or drag it into place.`}>
                  <span aria-hidden="true">+</span> {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="dw-panel">
            <div className="dw-lab">Section library</div>
            {saveFor && (
              <div className="dw-savebox">
                <b>Save to the library</b>
                <small>
                  {(() => {
                    const part = savePart(saveFor);
                    return part.length > 1 ? `This heading and the ${part.length - 1} block${part.length === 2 ? '' : 's'} after it.` : 'This one block.';
                  })()}
                </small>
                <input className="crm-input" value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Name, e.g. Our approach" aria-label="Library name" autoFocus />
                <div className="dw-tools">
                  <button type="button" className="crm-btn crm-btn--solar crm-btn--small" disabled={!saveName.trim()} onClick={() => void saveToLibrary()}>
                    Save
                  </button>
                  <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => setSaveFor(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {note && !saveFor && (
              <p className="crm-small" style={{ margin: 0 }} role="status">
                {note}
              </p>
            )}
            <input className="crm-input" value={libQ} onChange={(e) => setLibQ(e.target.value)} placeholder="Search the library" aria-label="Search the library" />
            {([['Heliaxis standard sections', lib.standard], ['Saved by us', lib.saved]] as const).map(([title, items]) => {
              const shown = items.filter((x) => !libQ.trim() || `${x.name} ${x.note ?? ''}`.toLowerCase().includes(libQ.trim().toLowerCase()));
              return (
                <div key={title} className="dw-libgroup">
                  <div className="dw-libh">{title}</div>
                  {shown.length === 0 && <p className="dw-empty-note">{title === 'Saved by us' ? 'Nothing saved yet. Select a section on the page and choose Save to library.' : 'No match.'}</p>}
                  {shown.map((x) => (
                    <div key={x.id ?? x.key} className="dw-lib" draggable onDragStart={startDrag({ kind: 'lib', blocks: x.blocks })} title="Drag it onto the page, or press Insert">
                      <span className="dw-libmain">
                        <b>{x.name}</b>
                        <small>{x.note || `${x.blocks.length} block${x.blocks.length === 1 ? '' : 's'}`}</small>
                      </span>
                      <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => insertLib(x)}>
                        Insert
                      </button>
                      {x.id && (
                        <button type="button" className="dw-x" aria-label={`Remove ${x.name} from the library`} onClick={() => void deleteSaved(x)}>
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {admin && (
            <button type="button" className="crm-link dw-del" onClick={() => void remove()}>
              Delete this document
            </button>
          )}
        </aside>

        {/* ── Right: the page itself; click anything to type on it ── */}
        <main className="dw-stage" onClick={() => setSel(null)}>
          <div className="dw-paper" onClick={(e) => e.stopPropagation()}>
            <header className="dw-pagehead">
              <div className="dw-ph-top">
                <BrandLogo width={110} />
                <span className="dw-ph-meta">
                  {doc.number} · {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              </div>
              <EditableLine className="dw-h-doc" value={doc.title} placeholder="Document title" onChange={(v) => edit((d) => ({ ...d, title: v }))} />
            </header>
            <div className="dw-pagebody">
              {who?.name && (
                <div className="dw-for-box">
                  <div>
                    <small>Prepared for</small>
                    <b>{who.name}</b>
                  </div>
                  {who.address && (
                    <div>
                      <small>Address</small>
                      <b>{who.address}</b>
                    </div>
                  )}
                </div>
              )}
              <EditableLine className="dw-h-sub" value={doc.content.subtitle} placeholder="Words under the title (optional)" onChange={(v) => edit((d) => ({ ...d, content: { ...d.content, subtitle: v } }))} />

              <div
                className="dw-flow"
                onDragOver={(e) => {
                  e.preventDefault();
                  if (over === null) setOver(blocks.length);
                }}
                onDrop={dropEnd}
              >
                {blocks.length === 0 && <div className="dw-blank">An empty page. Drag a section in from the left, or click one to add it.</div>}
                {blocks.map((b, i) => (
                  <Fragment key={b.id}>
                    {over === i && drag && <div className="dw-dropline dw-dropline--page" />}
                    <div
                      id={`blk-${b.id}`}
                      className={`dw-pblock dw-pblock--${b.type}${sel === b.id ? ' is-sel' : ''}${drag?.kind === 'move' && drag.id === b.id ? ' is-drag' : ''}`}
                      onClick={() => setSel(b.id)}
                      onDragOver={(e) => overIndex(e, i)}
                      onDrop={dropEnd}
                    >
                      {sel === b.id && (
                        <div className="dw-btool" onClick={(e) => e.stopPropagation()}>
                          <span className="dw-handle" draggable onDragStart={startDrag({ kind: 'move', id: b.id })} title="Drag to move">
                            ⠿ {b.type === 'image' ? `Picture ${b.side === 'full' ? 'full width' : b.side}` : BLOCK_LABEL[b.type]}
                          </span>
                          <button type="button" onClick={() => startSave(b.id)} title={b.type === 'section' ? 'Save this heading and what follows it to the library' : 'Save this block to the library'}>
                            Save to library
                          </button>
                          <button type="button" onClick={() => nudge(b.id, -1)} disabled={i === 0} aria-label="Move up">
                            Up
                          </button>
                          <button type="button" onClick={() => nudge(b.id, 1)} disabled={i === blocks.length - 1} aria-label="Move down">
                            Down
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setBlocks((bs) => bs.filter((x) => x.id !== b.id));
                              setSel(null);
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                      <PageBlock b={b} selected={sel === b.id} urls={urls} quotes={quotes} qtable={b.type === 'quote' ? qtables[b.quote_id] : undefined} hasWho={!!who?.name} patch={(p) => patchBlock(b.id, p)} onUpload={(files) => void upload(b.id, files)} />
                    </div>
                  </Fragment>
                ))}
                {over === blocks.length && drag && <div className="dw-dropline dw-dropline--page" />}
              </div>
            </div>
          </div>
          <p className="dw-note">This is a preview of the layout. Use Preview PDF for the exact printed page, and Download Word to edit it in Word.</p>
        </main>
      </div>
    </div>
  );
}

/* ── Typing on the page ───────────────────────────────────────────────────────────────────────── */

/** One line of text edited in place (a heading, the title). Uncontrolled, so the cursor never jumps; Enter moves on instead of adding a line. */
function EditableLine({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // The words are put in by hand (not as React children), so typing never makes the cursor jump back to the start.
  useEffect(() => {
    const el = ref.current;
    if (el && el.textContent !== value && document.activeElement !== el) el.textContent = value;
  }, [value]);
  return (
    <div
      ref={ref}
      className={`dw-line ${className ?? ''}`}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label={placeholder}
      data-placeholder={placeholder}
      spellCheck
      onInput={(e) => onChange((e.currentTarget.textContent ?? '').replace(/\n/g, ' '))}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.currentTarget as HTMLElement).blur();
        }
      }}
      onPaste={(e) => {
        e.preventDefault();
        document.execCommand('insertText', false, e.clipboardData.getData('text/plain').replace(/\s*\n\s*/g, ' '));
      }}
    />
  );
}

const Runs = ({ runs }: { runs: Run[] }) => (
  <>
    {runs.map((r, i) => (r.bold ? <strong key={i}>{r.italic ? <em>{r.text}</em> : r.text}</strong> : r.italic ? <em key={i}>{r.text}</em> : <Fragment key={i}>{r.text}</Fragment>))}
  </>
);

/** The text as it will print: paragraphs, bullets and numbered points with bold and italic. */
function Rich({ body, empty }: { body: string; empty: string }) {
  const paras = parasOf(body);
  if (!paras.length) return <p className="dw-ph">{empty}</p>;
  const out: React.ReactNode[] = [];
  for (let i = 0; i < paras.length; ) {
    const p = paras[i];
    if (p.kind === 'p') {
      out.push(
        <p key={i}>
          <Runs runs={p.runs} />
        </p>
      );
      i++;
      continue;
    }
    const kind = p.kind;
    const items: React.ReactNode[] = [];
    while (i < paras.length && paras[i].kind === kind) {
      items.push(
        <li key={i}>
          <Runs runs={paras[i].runs} />
        </li>
      );
      i++;
    }
    out.push(kind === 'bullet' ? <ul key={`u${i}`}>{items}</ul> : <ol key={`o${i}`}>{items}</ol>);
  }
  return <>{out}</>;
}

/** Text you type on the page: shown as it will print; click it (the block is selected) and it becomes a box with Bold, Italic and list buttons. */
function TextArea({ value, onChange, selected, placeholder }: { value: string; onChange: (v: string) => void; selected: boolean; placeholder: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value, selected]);
  useEffect(() => {
    if (selected) ref.current?.focus({ preventScroll: true });
  }, [selected]);
  if (!selected) return <div className="dw-rich" onClick={undefined}><Rich body={value} empty={placeholder} /></div>;
  function wrap(before: string, after = before) {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: z } = el;
    const sel = value.slice(a, z) || 'text';
    onChange(`${value.slice(0, a)}${before}${sel}${after}${value.slice(z)}`);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + before.length, a + before.length + sel.length);
    });
  }
  function lines(prefix: (n: number) => string) {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: z } = el;
    const start = value.lastIndexOf('\n', a - 1) + 1;
    const nl = value.indexOf('\n', z);
    const end = nl === -1 ? value.length : nl;
    const block = value.slice(start, end).split('\n').map((l, i) => `${prefix(i + 1)}${l.replace(/^\s*(?:[-•]|\d{1,3}[.)])\s+/, '')}`).join('\n');
    onChange(`${value.slice(0, start)}${block}${value.slice(end)}`);
  }
  return (
    <div className="dw-edit" onClick={(e) => e.stopPropagation()}>
      <div className="dw-fmt" role="toolbar" aria-label="Formatting">
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => wrap('**')}>
          <b>Bold</b>
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => wrap('*')}>
          <i>Italic</i>
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => lines(() => '- ')}>
          Bullets
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => lines((n) => `${n}. `)}>
          Numbers
        </button>
      </div>
      <textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} placeholder={`${placeholder} A blank line starts a new paragraph.`} aria-label="Text" />
    </div>
  );
}

function PageBlock({ b, selected, urls, quotes, qtable, hasWho, patch, onUpload }: { b: Block; selected: boolean; urls: Record<string, string>; quotes: QuoteOpt[]; qtable?: QuoteTable; hasWho: boolean; patch: (p: Record<string, unknown>) => void; onUpload: (files: File[]) => void }) {
  switch (b.type) {
    case 'section':
      return <EditableLine className="dw-h-section" value={b.text} placeholder="Section heading" onChange={(text) => patch({ text })} />;
    case 'title':
      return <EditableLine className="dw-h-title" value={b.text} placeholder="Title" onChange={(text) => patch({ text })} />;
    case 'text':
      return <TextArea value={b.body} selected={selected} onChange={(body) => patch({ body })} placeholder="Click to write." />;
    case 'image': {
      const pic = (
        <figure className="dw-fig">
          {b.path && srcOf(b.path, urls) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={srcOf(b.path, urls)} alt={b.caption || 'Picture'} />
          ) : (
            <div className="dw-nopic">No picture yet</div>
          )}
          {selected ? <input className="dw-capin" value={b.caption} onChange={(e) => patch({ caption: e.target.value })} placeholder="Caption (optional)" aria-label="Caption" onClick={(e) => e.stopPropagation()} /> : b.caption ? <figcaption>{b.caption}</figcaption> : null}
          {selected && (
            <div className="dw-picbar" onClick={(e) => e.stopPropagation()}>
              <FileButton label={b.path ? 'Change picture' : 'Choose a picture'} accept="image/jpeg,image/png" onFiles={onUpload} variant="solar" />
              {(['left', 'right', 'full'] as const).map((s) => (
                <button key={s} type="button" className={`crm-btn crm-btn--small ${b.side === s ? 'crm-btn--solar' : 'crm-btn--ghost'}`} aria-pressed={b.side === s} onClick={() => patch({ side: s })}>
                  {s === 'full' ? 'Full width' : s === 'left' ? 'Left' : 'Right'}
                </button>
              ))}
            </div>
          )}
        </figure>
      );
      const text = <TextArea value={b.body} selected={selected} onChange={(body) => patch({ body })} placeholder={b.side === 'full' ? 'Text under the picture (optional).' : 'Click to write the text beside the picture.'} />;
      if (b.side === 'full')
        return (
          <div className="dw-imgfull">
            {pic}
            {(b.body.trim() || selected) && text}
          </div>
        );
      return (
        <div className={`dw-imgside is-${b.side}`}>
          {b.side === 'left' ? pic : null}
          <div className="dw-imgtext">{text}</div>
          {b.side === 'right' ? pic : null}
        </div>
      );
    }
    case 'table':
      return <PageTable b={b} selected={selected} patch={patch} />;
    case 'quote':
      return (
        <div className="dw-quote">
          {selected && (
            <div className="dw-quotebar" onClick={(e) => e.stopPropagation()}>
              {quotes.length === 0 ? (
                <span className="crm-muted crm-small">{hasWho ? 'This customer has no quotes yet.' : 'Assign the document to a customer first, then choose one of their quotes.'}</span>
              ) : (
                <select className="crm-input" value={b.quote_id} onChange={(e) => patch({ quote_id: e.target.value })} aria-label="Quote">
                  <option value="">Choose a quote…</option>
                  {quotes.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.number} · {q.title} ({q.status})
                    </option>
                  ))}
                </select>
              )}
              <input className="crm-input" value={b.caption} onChange={(e) => patch({ caption: e.target.value })} placeholder="Heading above the table (optional)" aria-label="Heading above the table" />
            </div>
          )}
          {qtable ? (
            <>
              <div className="dw-cap">{b.caption.trim() || `Quote ${qtable.number}: ${qtable.title}`}</div>
              <table className="dw-tbl">
                <thead>
                  <tr>
                    {qtable.headers.map((h, i) => (
                      <th key={h} className={i ? 'r' : ''}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {qtable.rows.map((r, i) => (
                    <tr key={i}>
                      {r.map((c, k) => (
                        <td key={k} className={k ? 'r' : ''}>
                          {c.split('\n').map((l, n) => (
                            <div key={n} className={n ? 'sub' : ''}>
                              {l}
                            </div>
                          ))}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {qtable.totals.map(([l, v], i) => (
                    <tr key={l} className={i === qtable.totals.length - 1 ? 'tot' : 'sum'}>
                      <td colSpan={3} className="r">
                        {l}
                      </td>
                      <td className="r">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <div className="dw-blank">{b.quote_id ? 'Loading the quote…' : 'Quote table: click here, then choose one of the customer’s quotes.'}</div>
          )}
        </div>
      );
    default:
      return (
        <div className="dw-break">
          <span>Page break</span>
        </div>
      );
  }
}

function PageTable({ b, selected, patch }: { b: Extract<Block, { type: 'table' }>; selected: boolean; patch: (p: Record<string, unknown>) => void }) {
  const cols = b.headers.length;
  const setHead = (c: number, v: string) => patch({ headers: b.headers.map((h, i) => (i === c ? v : h)) });
  const setCell = (r: number, c: number, v: string) => patch({ rows: b.rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)) });
  return (
    <div className="dw-tablebox">
      {(selected || b.caption) && <input className="dw-capin dw-capin--table" value={b.caption} onChange={(e) => patch({ caption: e.target.value })} placeholder="Heading above the table (optional)" aria-label="Table heading" onClick={(e) => e.stopPropagation()} />}
      <table className="dw-tbl dw-tbl--edit">
        <thead>
          <tr>
            {b.headers.map((h, c) => (
              <th key={c}>
                <input value={h} onChange={(e) => setHead(c, e.target.value)} placeholder={`Column ${c + 1}`} aria-label={`Column ${c + 1} heading`} />
              </th>
            ))}
            {selected && <th className="dw-tx" />}
          </tr>
        </thead>
        <tbody>
          {b.rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => (
                <td key={c}>
                  <input value={cell} onChange={(e) => setCell(r, c, e.target.value)} aria-label={`Row ${r + 1}, ${b.headers[c] || `column ${c + 1}`}`} />
                </td>
              ))}
              {selected && (
                <td className="dw-tx">
                  <button type="button" onClick={() => patch({ rows: b.rows.filter((_, i) => i !== r) })} aria-label={`Remove row ${r + 1}`}>
                    Remove
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {selected && (
        <div className="dw-tbar" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => patch({ rows: [...b.rows, Array(cols).fill('')] })}>
            + Row
          </button>
          <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={cols >= 6} onClick={() => patch({ headers: [...b.headers, ''], rows: b.rows.map((r) => [...r, '']) })}>
            + Column
          </button>
          <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={cols <= 1} onClick={() => patch({ headers: b.headers.slice(0, -1), rows: b.rows.map((r) => r.slice(0, -1)) })}>
            Remove last column
          </button>
        </div>
      )}
    </div>
  );
}

function CustomerPicker({ onPick }: { onPick: (f: Found) => void }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ q: string; rows: Found[] }>({ q: '', rows: [] });
  const t = q.trim();
  useEffect(() => {
    if (t.length < 2) return;
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/crm/customers?contacts=1&q=${encodeURIComponent(t)}`, { cache: 'no-store', signal: ctl.signal });
        const d = await r.json().catch(() => ({}));
        // A person under Contacts has no customer record yet, so only customers and organisations can be picked.
        if (r.ok) setFound({ q: t, rows: ((d.customers ?? []) as Found[]).filter((c) => !c.contact) });
      } catch {
        // Still typing.
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [t]);
  const rows = found.q === t ? found.rows : null;
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <input className="crm-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone, email or postcode" aria-label="Find a customer or organisation" autoFocus />
      {t.length >= 2 && (
        <ul className="dw-pick">
          {rows === null && <li className="crm-muted" style={{ padding: 10 }}>Looking…</li>}
          {rows?.length === 0 && <li className="crm-muted" style={{ padding: 10 }}>Nobody found for “{t}”.</li>}
          {rows?.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onPick(c)}>
                <b>{c.name}</b>
                <small>{[c.organisation ? 'Organisation' : c.customer_ref, c.postcode, c.phone].filter(Boolean).join(' · ')}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
