'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment, useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import { BrandLogo } from '@/components/theme/BrandLogo';
import { BLOCK_LABEL, newBlock, newId, parasOf, type Block, type BlockType, type Run, type WriteupContent } from '@/lib/writeups/types';
import { BrandIcon, FileButton } from '../../../crm/CrmUi';
import '../../../crm/crm.css';
import '../documents.css';

type Who = { kind: 'customer' | 'organisation' | null; id: string | null; name: string; address: string; ref: string | null };
type QuoteOpt = { id: string; number: string; title: string; status: string };
type Doc = { id: string; number: string; title: string; enquiry_id: string | null; organisation_id: string | null; project_id: string | null; content: WriteupContent };
type Found = { id: string; name: string; postcode: string | null; phone: string | null; customer_ref: string | null; organisation?: boolean; contact?: boolean };
type QuoteTable = { number: string; title: string; headers: string[]; rows: string[][]; totals: [string, string][] };
type Drag = { kind: 'move'; id: string } | { kind: 'new'; type: BlockType; side?: 'left' | 'right' | 'full' } | { kind: 'lib'; blocks: Block[] } | { kind: 'group'; id: string } | null;
type LibItem = { id?: string; key?: string; name: string; note?: string; blocks: Block[] };
/** A section is a heading and everything after it up to the next heading (its titles, text, pictures and tables). Blocks before the first heading form an unnamed opening. */
type Group = { head: Block | null; start: number; items: Block[] };
function groupsOf(bs: Block[]): Group[] {
  const out: Group[] = [];
  bs.forEach((b, i) => {
    if (b.type === 'section') out.push({ head: b, start: i, items: [] });
    else if (out.length) out[out.length - 1].items.push(b);
    else out.push({ head: null, start: 0, items: [b] });
  });
  return out;
}
const sizeOf = (g: Group) => (g.head ? 1 : 0) + g.items.length;
const groupAt = (gs: Group[], i: number) => gs.find((g) => i >= g.start && i < g.start + sizeOf(g));
const flatten = (gs: Group[]): Block[] => gs.flatMap((g) => [...(g.head ? [g.head] : []), ...g.items]);
const RAIL_TABS = [
  { key: 'details', label: 'Details', icon: 'users' },
  { key: 'sections', label: 'Sections', icon: 'document' },
  { key: 'add', label: 'Add', icon: 'plus' },
  { key: 'library', label: 'Library', icon: 'star' },
] as const;
type RailTab = (typeof RAIL_TABS)[number]['key'];

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

const PALETTE: { label: string; hint: string; type: BlockType; side?: 'left' | 'right' | 'full'; icon: Parameters<typeof BrandIcon>[0]['k'] }[] = [
  { label: 'Section', hint: 'A heading that holds the elements dragged into it', type: 'section', icon: 'el-section' },
  { label: 'Title', hint: 'A smaller heading', type: 'title', icon: 'el-title' },
  { label: 'Text', hint: 'Paragraphs and lists', type: 'text', icon: 'el-text' },
  { label: 'Picture left', hint: 'Picture with text beside it', type: 'image', side: 'left', icon: 'el-picl' },
  { label: 'Picture right', hint: 'Text, then the picture', type: 'image', side: 'right', icon: 'el-picr' },
  { label: 'Picture wide', hint: 'A wide picture', type: 'image', side: 'full', icon: 'el-picf' },
  { label: 'Table', hint: 'You fill it in', type: 'table', icon: 'el-table' },
  { label: 'Quote table', hint: 'From the customer’s quote', type: 'quote', icon: 'el-quote' },
  { label: 'Video left', hint: 'Video picture with a QR code to watch it', type: 'video', side: 'left', icon: 'el-vidl' },
  { label: 'Video right', hint: 'Video picture with a QR code to watch it', type: 'video', side: 'right', icon: 'el-vidr' },
  { label: 'Video wide', hint: 'A wide video picture, QR code beneath', type: 'video', side: 'full', icon: 'el-vidf' },
  { label: 'Page break', hint: 'Start a new page', type: 'break', icon: 'el-break' },
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
    case 'video':
      return b.caption || b.name || (b.path ? 'Video' : 'No video yet');
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
  const [tab, setTab] = useState<RailTab>('sections');
  const [railOpen, setRailOpen] = useState(() => {
    try {
      return window.localStorage.getItem('hx-doc-rail') !== 'closed';
    } catch {
      return true;
    }
  });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Undo and redo: snapshots of the document. Typing within a moment of itself is one step.
  const cur = useRef<Doc | null>(null);
  const past = useRef<Doc[]>([]);
  const future = useRef<Doc[]>([]);
  const lastStep = useRef(0);
  const [depth, setDepth] = useState({ undo: 0, redo: 0 });

  const load = useCallback(async () => {
    const r = await fetch(`/api/crm/writeups/${id}`, { cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setErr(d.error || 'Couldn’t open the document.');
    cur.current = d.document as Doc;
    past.current = [];
    future.current = [];
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

  const edit = (fn: (d: Doc) => Doc, typing = false) => {
    const d = cur.current;
    if (!d) return;
    const next = fn(d);
    if (next === d) return;
    const now = Date.now();
    if (!(typing && past.current.length && now - lastStep.current < 700)) {
      past.current.push(d);
      if (past.current.length > 100) past.current.shift();
    }
    lastStep.current = now;
    future.current = [];
    cur.current = next;
    setDoc(next);
    setDepth({ undo: past.current.length, redo: 0 });
  };
  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev || !cur.current) return;
    future.current.push(cur.current);
    cur.current = prev;
    setDoc(prev);
    setDepth({ undo: past.current.length, redo: future.current.length });
  }, []);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next || !cur.current) return;
    past.current.push(cur.current);
    cur.current = next;
    setDoc(next);
    setDepth({ undo: past.current.length, redo: future.current.length });
  }, []);
  // Ctrl or Command + Z, and Shift + Z or Y to redo, anywhere on the page (the browser's own undo would only know the text box).
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k !== 'z' && k !== 'y') return;
      const t = e.target as HTMLElement | null;
      if (t instanceof HTMLInputElement) return; // the library name and search boxes keep their own
      e.preventDefault();
      if (k === 'y' || e.shiftKey) redo();
      else undo();
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [undo, redo]);
  const setBlocks = (fn: (b: Block[]) => Block[]) => edit((d) => ({ ...d, content: { ...d.content, blocks: fn(d.content.blocks) } }));
  const patchBlock = (bid: string, patch: Record<string, unknown>) => edit((d) => ({ ...d, content: { ...d.content, blocks: d.content.blocks.map((b) => (b.id === bid ? ({ ...b, ...patch } as Block) : b)) } }), true);
  const blocks = doc?.content.blocks ?? [];

  /** Up or down: a heading moves with all of its section, anything else moves one place. */
  function nudge(bid: string, by: number) {
    setBlocks((bs) => {
      const gs = groupsOf(bs);
      const gi = gs.findIndex((g) => g.head?.id === bid);
      if (gi >= 0) {
        const to = gi + by;
        if (to < 0 || to >= gs.length || !gs[to].head || !gs[gi].head) return bs;
        const next = [...gs];
        [next[gi], next[to]] = [next[to], next[gi]];
        return flatten(next);
      }
      const i = bs.findIndex((b) => b.id === bid);
      const j = i + by;
      if (i < 0 || j < 0 || j >= bs.length) return bs;
      const next = [...bs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  /** Where a new block goes: at the end of the section that is selected, or the end of the page. */
  function insertAt(): number {
    if (!sel) return blocks.length;
    const g = groupAt(groupsOf(blocks), blocks.findIndex((b) => b.id === sel));
    return g ? g.start + sizeOf(g) : blocks.length;
  }

  /** Delete a section with everything in it. */
  function removeSection(bid: string) {
    const g = groupsOf(blocks).find((x) => x.head?.id === bid);
    if (!g) return;
    if (g.items.length && !window.confirm(`Delete this section and the ${g.items.length} element${g.items.length === 1 ? '' : 's'} in it?`)) return;
    setBlocks((bs) => {
      const gg = groupsOf(bs).find((x) => x.head?.id === bid);
      return gg ? [...bs.slice(0, gg.start), ...bs.slice(gg.start + sizeOf(gg))] : bs;
    });
    setSel(null);
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
    } else if (drag.kind === 'group') {
      setBlocks((bs) => {
        const gs = groupsOf(bs);
        const g = gs.find((x) => x.head?.id === drag.id);
        if (!g) return bs;
        const len = sizeOf(g);
        const rest = [...bs.slice(0, g.start), ...bs.slice(g.start + len)];
        const lead = gs[0].head ? 0 : gs[0].items.length;
        const at = Math.max(lead, index > g.start ? index - len : index);
        return [...rest.slice(0, at), ...bs.slice(g.start, g.start + len), ...rest.slice(at)];
      });
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
    const upper = e.clientY < r.top + r.height / 2;
    const g = groupAt(groupsOf(blocks), i);
    // Sections only land between sections; anything else lands inside one.
    const wholeSection = drag?.kind === 'group' || (drag?.kind === 'new' && drag.type === 'section') || (drag?.kind === 'lib' && drag.blocks[0]?.type === 'section');
    if (g) {
      if (wholeSection) return setOver(upper ? g.start : g.start + sizeOf(g));
      // Over a section's heading: into the section, at its end.
      if (g.head && g.start === i) return setOver(g.start + sizeOf(g));
    }
    setOver(upper ? i : i + 1);
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
    const at = insertAt();
    setBlocks((bs) => [...bs.slice(0, at), b, ...bs.slice(at)]);
    setSel(b.id);
    setTimeout(() => document.getElementById(`blk-${b.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
  }

  /** A library section onto the end of the page. */
  function insertLib(item: LibItem) {
    const add = fresh(item.blocks);
    const at = insertAt();
    setBlocks((bs) => [...bs.slice(0, at), ...add, ...bs.slice(at)]);
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
        <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={depth.undo === 0} onClick={undo} title="Undo (Ctrl+Z)">
          Undo
        </button>
        <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={depth.redo === 0} onClick={redo} title="Redo (Ctrl+Shift+Z)">
          Redo
        </button>
        <span className="dw-saved" role="status">
          {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : ''}
        </span>
      </div>
      {err && <p className="crm-banner crm-banner--err">{err}</p>}

      <div className="dw-split">
        {/* ── Left: the document's details, its sections (drag to reorder) and what can be added ── */}
        <aside className={`dw-rail${railOpen ? ' is-open' : ''}`} aria-label="Document tools">
          <div className="dw-rail__bar">
            <button
              type="button"
              className="dw-rail__tab dw-rail__toggle"
              aria-label={railOpen ? 'Collapse the toolbar' : 'Expand the toolbar'}
              title={railOpen ? 'Collapse' : 'Expand'}
              onClick={() => {
                setRailOpen((o) => {
                  try {
                    window.localStorage.setItem('hx-doc-rail', o ? 'closed' : 'open');
                  } catch {
                    // Not remembered.
                  }
                  return !o;
                });
              }}
            >
              <span style={{ display: 'inline-flex', transform: railOpen ? 'rotate(180deg)' : undefined }}>
                <BrandIcon k="arrow" size={20} />
              </span>
              {railOpen && <span>Collapse</span>}
            </button>
            {RAIL_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`dw-rail__tab${tab === t.key && railOpen ? ' on' : ''}`}
                title={t.label}
                aria-label={t.label}
                aria-pressed={tab === t.key && railOpen}
                onClick={() => {
                  setTab(t.key);
                  setRailOpen(true);
                }}
              >
                <BrandIcon k={t.icon} size={20} />
                {railOpen && <span>{t.label}</span>}
              </button>
            ))}
          </div>
          {railOpen && (
            <div className="dw-rail__panel">
              {tab === 'details' && (
                <>
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

          {admin && (
            <button type="button" className="crm-link dw-del" onClick={() => void remove()}>
              Delete this document
            </button>
          )}
                </>
              )}
              {tab === 'sections' && (
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
              {blocks.length === 0 && <p className="dw-empty-note">No sections yet. Add one from the Add tab. Drag a whole section to move it with everything inside.</p>}
              {groupsOf(blocks).map((g) => {
                const open = !g.head || expanded.has(g.head.id);
                const rows = g.head ? g.items : g.items;
                return (
                  <div key={g.head?.id ?? 'lead'} className={`dw-group${drag && drag.kind !== 'group' && over !== null && over > g.start && over <= g.start + sizeOf(g) ? ' is-target' : ''}${g.head && drag?.kind === 'group' && drag.id === g.head.id ? ' is-drag' : ''}`}>
                    {g.head && (
                      <Fragment>
                        {over === g.start && drag && <div className="dw-dropline" />}
                        <div
                          className={`dw-row dw-row--head${sel === g.head.id ? ' is-sel' : ''}`}
                          draggable
                          onDragStart={startDrag({ kind: 'group', id: g.head.id })}
                          onDragOver={(e) => overIndex(e, g.start)}
                          onDrop={dropEnd}
                          onClick={() => pickBlock(g.head!.id, true)}
                        >
                          <span className="dw-grip" aria-hidden="true">
                            ⠿
                          </span>
                          <span className="dw-rowmain">
                            <b>{g.head.type === 'section' && g.head.text.trim() ? g.head.text : 'Untitled section'}</b>
                            <small>{g.items.length ? `${g.items.length} element${g.items.length === 1 ? '' : 's'} inside` : 'Empty'}</small>
                          </span>
                          <button
                            type="button"
                            className="dw-x"
                            aria-label={open ? 'Hide what is inside' : 'Show what is inside'}
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpanded((x) => {
                                const n = new Set(x);
                                if (n.has(g.head!.id)) n.delete(g.head!.id);
                                else n.add(g.head!.id);
                                return n;
                              });
                            }}
                          >
                            {open ? 'Hide' : 'Show'}
                          </button>
                        </div>
                      </Fragment>
                    )}
                    {open &&
                      rows.map((b) => {
                        const i = blocks.findIndex((x) => x.id === b.id);
                        return (
                          <Fragment key={b.id}>
                            {over === i && drag && drag.kind !== 'group' && <div className="dw-dropline" />}
                            <div
                              className={`dw-row dw-row--child${sel === b.id ? ' is-sel' : ''}${drag?.kind === 'move' && drag.id === b.id ? ' is-drag' : ''}`}
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
                        );
                      })}
                  </div>
                );
              })}
              {over === blocks.length && drag && <div className="dw-dropline" />}
            </div>
          </div>
              )}
              {tab === 'add' && (
          <div className="dw-panel">
            <div className="dw-lab">Add an element</div>
            <p className="dw-hint">{sel ? 'Goes at the end of the selected section.' : 'Goes at the end of the page. Select a section first to add inside it.'}</p>
            <div className="dw-tiles">
              {PALETTE.map((p) => (
                <button key={p.label} type="button" className="dw-tile" draggable onDragStart={startDrag({ kind: 'new', type: p.type, side: p.side })} onClick={() => addBlock(p.type, p.side)} title={`${p.hint}. Click to add it, or drag it into a section.`}>
                  <BrandIcon k={p.icon} size={30} />
                  <span>{p.label}</span>
                </button>
              ))}
            </div>
          </div>
              )}
              {tab === 'library' && (
          <div className="dw-panel">
            <div className="dw-lab">Section library</div>
            {saveFor && (
              <div className="dw-savebox">
                <b>Save to the library</b>
                <small>
                  {(() => {
                    const part = savePart(saveFor);
                    return part.length > 1 ? `This heading and the ${part.length - 1} element${part.length === 2 ? '' : 's'} after it.` : 'This one element.';
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
                        <small>{x.note || `${x.blocks.length} element${x.blocks.length === 1 ? '' : 's'}`}</small>
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
              )}
            </div>
          )}
          <div className="dw-rail__acts">
            <a className={`crm-btn crm-btn--ghost crm-btn--small${railOpen ? '' : ' is-icon'}`} href={`/api/crm/writeups/${id}/download?format=pdf&inline=1`} target="_blank" rel="noreferrer" title="Preview PDF">
              <BrandIcon k="document" size={18} />
              {railOpen && <span>Preview PDF</span>}
            </a>
            <a className={`crm-btn crm-btn--solar crm-btn--small${railOpen ? '' : ' is-icon'}`} href={`/api/crm/writeups/${id}/download?format=pdf`} title="Download PDF">
              <BrandIcon k="download" size={18} />
              {railOpen && <span>Download PDF</span>}
            </a>
            <a className={`crm-btn crm-btn--solar crm-btn--small${railOpen ? '' : ' is-icon'}`} href={`/api/crm/writeups/${id}/download?format=docx`} title="Download Word">
              <BrandIcon k="download" size={18} />
              {railOpen && <span>Download Word</span>}
            </a>
          </div>
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
              <EditableLine className="dw-h-doc" value={doc.title} placeholder="Document title" onChange={(v) => edit((d) => ({ ...d, title: v }), true)} />
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
              <EditableLine className="dw-h-sub" value={doc.content.subtitle} placeholder="Words under the title (optional)" onChange={(v) => edit((d) => ({ ...d, content: { ...d.content, subtitle: v } }), true)} />

              <div
                className="dw-flow"
                onDragOver={(e) => {
                  e.preventDefault();
                  if (over === null) setOver(blocks.length);
                }}
                onDrop={dropEnd}
              >
                {blocks.length === 0 && <div className="dw-blank">An empty page. Drag a section in from the left, or click one to add it.</div>}
                {groupsOf(blocks).map((g) => (
                  <section key={g.head?.id ?? 'lead'} className={`dw-psec${drag && drag.kind !== 'group' && over !== null && over > g.start && over <= g.start + sizeOf(g) ? ' is-target' : ''}${g.head && drag?.kind === 'group' && drag.id === g.head.id ? ' is-drag' : ''}`}>
                {(g.head ? [g.head, ...g.items] : g.items).map((b) => { const i = blocks.findIndex((x) => x.id === b.id); return (
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
                          <span className="dw-handle" draggable onDragStart={startDrag(b.type === 'section' ? { kind: 'group', id: b.id } : { kind: 'move', id: b.id })} title={b.type === 'section' ? 'Drag to move the whole section' : 'Drag to move'}>
                            ⠿ {b.type === 'section' ? 'Section (moves with its contents)' : b.type === 'image' ? `Picture ${b.side === 'full' ? 'full width' : b.side}` : BLOCK_LABEL[b.type]}
                          </span>
                          <button type="button" onClick={() => startSave(b.id)} title={b.type === 'section' ? 'Save this heading and what follows it to the library' : 'Save this element to the library'}>
                            Save to library
                          </button>
                          <button type="button" onClick={() => nudge(b.id, -1)} disabled={i === 0} aria-label={b.type === 'section' ? 'Move section up' : 'Move up'}>
                            Up
                          </button>
                          <button type="button" onClick={() => nudge(b.id, 1)} disabled={i === blocks.length - 1} aria-label={b.type === 'section' ? 'Move section down' : 'Move down'}>
                            Down
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (b.type === 'section') return removeSection(b.id);
                              setBlocks((bs) => bs.filter((x) => x.id !== b.id));
                              setSel(null);
                            }}
                          >
                            {b.type === 'section' ? 'Delete section' : 'Delete'}
                          </button>
                        </div>
                      )}
                      <PageBlock docId={id} b={b} selected={sel === b.id} urls={urls} quotes={quotes} qtable={b.type === 'quote' ? qtables[b.quote_id] : undefined} hasWho={!!who?.name} patch={(p) => patchBlock(b.id, p)} onUpload={(files) => void upload(b.id, files)} />
                    </div>
                  </Fragment>
                ); })}
                  </section>
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
  const typed = useRef(value);
  // The words are put in by hand (not as React children), so typing never makes the cursor jump back to the start.
  // A change that did not come from typing here (Undo, Redo) is put in even while the cursor is in the line.
  useEffect(() => {
    const el = ref.current;
    if (!el || el.textContent === value) return;
    if (document.activeElement !== el || value !== typed.current) {
      el.textContent = value;
      typed.current = value;
      if (document.activeElement === el) {
        const sel = window.getSelection();
        sel?.selectAllChildren(el);
        sel?.collapseToEnd();
      }
    }
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
      onInput={(e) => {
        typed.current = (e.currentTarget.textContent ?? '').replace(/\n/g, ' ');
        onChange(typed.current);
      }}
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

function PageBlock({ docId, b, selected, urls, quotes, qtable, hasWho, patch, onUpload }: { docId: string; b: Block; selected: boolean; urls: Record<string, string>; quotes: QuoteOpt[]; qtable?: QuoteTable; hasWho: boolean; patch: (p: Record<string, unknown>) => void; onUpload: (files: File[]) => void }) {
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
    case 'video':
      return <VideoElement b={b} selected={selected} docId={docId} urls={urls} patch={patch} />;
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

/** A picture or video frame as a landscape 16:9 thumbnail: the middle of it, filled edge to edge. */
async function landscape(src: CanvasImageSource, w: number, h: number): Promise<File | null> {
  if (!w || !h) return null;
  const c = document.createElement('canvas');
  c.width = 1280;
  c.height = 720;
  const g = c.getContext('2d')!;
  const k = Math.max(c.width / w, c.height / h);
  const sw = c.width / k;
  const sh = c.height / k;
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(src, (w - sw) / 2, (h - sh) / 2, sw, sh, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.82));
  return blob ? new File([blob], 'thumbnail.jpg', { type: 'image/jpeg' }) : null;
}

/** The picture the video shows: a frame from near its start, taken in the browser. */
async function frameOf(file: File): Promise<File | null> {
  const src = URL.createObjectURL(file);
  try {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.src = src;
    await new Promise<void>((res, rej) => {
      v.onloadeddata = () => res();
      v.onerror = () => rej(new Error('unreadable'));
      setTimeout(() => rej(new Error('slow')), 8000);
    });
    v.currentTime = Math.min(1, (v.duration || 2) / 2);
    await new Promise<void>((res) => {
      v.onseeked = () => res();
      setTimeout(res, 3000);
    });
    return await landscape(v, v.videoWidth, v.videoHeight);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(src);
  }
}

/** A video element: its picture (left, right or full width) with a small QR code to watch it. The video goes straight to storage; the picture is taken from it, or chosen. */
function VideoElement({ b, selected, docId, urls, patch }: { b: Extract<Block, { type: 'video' }>; selected: boolean; docId: string; urls: Record<string, string>; patch: (p: Record<string, unknown>) => void }) {
  const [qr, setQr] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [local, setLocal] = useState<Record<string, string>>({});
  const link = typeof window === 'undefined' ? '' : `${window.location.origin}/watch/${docId}/${b.id}`;
  useEffect(() => {
    let live = true;
    if (!b.path || !link) return;
    void import('qrcode').then((m) => m.default.toDataURL(link, { errorCorrectionLevel: 'M', margin: 1, width: 200 })).then((u) => live && setQr(u));
    return () => {
      live = false;
    };
  }, [b.path, link]);
  async function putThumb(f: File): Promise<string | null> {
    const fd = new FormData();
    fd.append('file', f);
    const r = await fetch(`/api/crm/writeups/${docId}/image`, { method: 'POST', body: fd });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Couldn’t save the thumbnail.');
    if (d.url) setLocal((l) => ({ ...l, [d.path]: d.url }));
    return d.path as string;
  }
  async function upload(files: File[]) {
    const f = files[0];
    if (!f) return;
    setBusy('Uploading…');
    setErr('');
    try {
      const prep = await fetch(`/api/crm/writeups/${docId}/video`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mime: f.type, size: f.size }) });
      const p = await prep.json().catch(() => ({}));
      if (!prep.ok) throw new Error(p.error || 'Couldn’t start the upload.');
      const up = await createClient().storage.from(p.bucket).uploadToSignedUrl(p.path, p.token, f, { contentType: f.type });
      if (up.error) throw new Error(`Upload failed: ${up.error.message}`);
      setBusy('Making the thumbnail…');
      const frame = await frameOf(f);
      const thumb = frame ? await putThumb(frame).catch(() => null) : null;
      patch({ path: p.path, name: f.name, ...(thumb ? { thumb } : {}) });
      if (!thumb) setErr('The video is in, but a thumbnail couldn’t be taken from it. Choose a picture for it.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed. Try again.');
    } finally {
      setBusy('');
    }
  }
  async function chooseThumb(files: File[]) {
    if (!files[0]) return;
    setBusy('Saving…');
    setErr('');
    try {
      const bmp = await createImageBitmap(files[0]);
      const wide = await landscape(bmp, bmp.width, bmp.height);
      if (!wide) throw new Error('Couldn’t read that picture.');
      const thumb = await putThumb(wide);
      if (thumb) patch({ thumb });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Couldn’t save the thumbnail.');
    } finally {
      setBusy('');
    }
  }
  const src = b.thumb ? local[b.thumb] || srcOf(b.thumb, urls) : '';
  const thumb = (
    <figure className="dw-vthumb">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={b.caption || 'Video thumbnail'} />
      ) : (
        <div className="dw-nopic">{b.path ? 'No thumbnail' : 'No video yet'}</div>
      )}
      {b.path && <span className="dw-play" aria-hidden="true" />}
    </figure>
  );
  const code = b.path && qr ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="dw-vqr" src={qr} alt="QR code to watch the video" />
  ) : null;
  const info = (
    <div className="dw-vinfo">
      <b>Watch the video</b>
      {selected ? (
        <input className="dw-capin" value={b.caption} onChange={(e) => patch({ caption: e.target.value })} placeholder="Sub-title, e.g. How your heat pump is installed" aria-label="Video sub-title" onClick={(e) => e.stopPropagation()} />
      ) : (
        <span>{b.caption || 'Add a sub-title'}</span>
      )}
      <div className="dw-vcode">
        {code}
        <small>Point your phone camera at the code.</small>
      </div>
    </div>
  );
  return (
    <div className={`dw-video is-${b.side}`}>
      {b.side === 'left' && thumb}
      {b.side === 'full' ? (
        <div className="dw-vfull">
          {thumb}
          {info}
        </div>
      ) : (
        info
      )}
      {b.side === 'right' && thumb}
      {selected && (
        <div className="dw-picbar dw-vbar" onClick={(e) => e.stopPropagation()}>
          <FileButton label={busy || (b.path ? 'Change video' : 'Choose a video')} accept="video/mp4,video/quicktime,video/webm" onFiles={(fs) => void upload(fs)} variant="solar" />
          {b.path && <FileButton label="Thumbnail picture" accept="image/jpeg,image/png" onFiles={(fs) => void chooseThumb(fs)} variant="ghost" />}
          {(['left', 'right', 'full'] as const).map((sd) => (
            <button key={sd} type="button" className={`crm-btn crm-btn--small ${b.side === sd ? 'crm-btn--solar' : 'crm-btn--ghost'}`} aria-pressed={b.side === sd} onClick={() => patch({ side: sd })}>
              {sd === 'full' ? 'Full width' : sd === 'left' ? 'Left' : 'Right'}
            </button>
          ))}
          {b.name && <small>{b.name}</small>}
          {err && <small className="dw-err">{err}</small>}
        </div>
      )}
    </div>
  );
}
