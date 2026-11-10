'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BLOCK_LABEL, newBlock, type Block, type BlockType, type WriteupContent } from '@/lib/writeups/types';
import { FileButton } from '../../../crm/CrmUi';
import '../../../crm/crm.css';
import '../documents.css';

type Who = { kind: 'customer' | 'organisation' | null; id: string | null; name: string; address: string; ref: string | null };
type QuoteOpt = { id: string; number: string; title: string; status: string };
type Doc = { id: string; number: string; title: string; enquiry_id: string | null; organisation_id: string | null; project_id: string | null; content: WriteupContent };
type Found = { id: string; name: string; postcode: string | null; phone: string | null; customer_ref: string | null; organisation?: boolean; contact?: boolean };

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

const ADD: { label: string; type: BlockType; side?: 'left' | 'right' | 'full' }[] = [
  { label: 'Section', type: 'section' },
  { label: 'Title', type: 'title' },
  { label: 'Text', type: 'text' },
  { label: 'Picture left', type: 'image', side: 'left' },
  { label: 'Picture right', type: 'image', side: 'right' },
  { label: 'Picture full width', type: 'image', side: 'full' },
  { label: 'Table', type: 'table' },
  { label: 'Quote table', type: 'quote' },
  { label: 'Page break', type: 'break' },
];

export function DocumentEditor({ id, admin }: { id: string; admin: boolean }) {
  const router = useRouter();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [who, setWho] = useState<Who | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [quotes, setQuotes] = useState<QuoteOpt[]>([]);
  const [err, setErr] = useState('');
  const [state, setState] = useState<'' | 'saving' | 'saved'>('');
  const [picking, setPicking] = useState(false);

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

  const edit = (fn: (d: Doc) => Doc) => setDoc((d) => (d ? fn(d) : d));
  const setBlocks = (fn: (b: Block[]) => Block[]) => edit((d) => ({ ...d, content: { ...d.content, blocks: fn(d.content.blocks) } }));
  const patchBlock = (bid: string, patch: Record<string, unknown>) => setBlocks((bs) => bs.map((b) => (b.id === bid ? ({ ...b, ...patch } as Block) : b)));
  const move = (i: number, by: number) =>
    setBlocks((bs) => {
      const j = i + by;
      if (j < 0 || j >= bs.length) return bs;
      const next = [...bs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  async function assign(p: { enquiry_id?: string | null; organisation_id?: string | null }) {
    edit((d) => ({ ...d, enquiry_id: p.enquiry_id ?? null, organisation_id: p.organisation_id ?? null, project_id: null }));
    setPicking(false);
    // Save straight away, then read who it is for (and their quotes) again.
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

  return (
    <div className="crm dw-editor">
      <div className="dw-top">
        <Link href="/admin/sales/documents" className="dw-back">
          ← Documents
        </Link>
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

      <div>
        <div className="dw-lab">{doc.number}</div>
        <input className="crm-input dw-title" value={doc.title} onChange={(e) => edit((d) => ({ ...d, title: e.target.value }))} placeholder="Document title, e.g. Tender for Pedal Power" aria-label="Document title" />
      </div>
      <input className="crm-input" value={doc.content.subtitle} onChange={(e) => edit((d) => ({ ...d, content: { ...d.content, subtitle: e.target.value } }))} placeholder="Words under the title (optional), e.g. Solar PV and battery storage" aria-label="Subtitle" />

      <div className="dw-card">
        <div className="dw-lab">Assigned to</div>
        <div className="dw-for">
          {who?.name ? (
            <>
              <b>{who.name}</b>
              <span className="crm-muted crm-small">
                {who.kind === 'organisation' ? 'Organisation' : 'Customer'}
                {who.ref ? ` · ${who.ref}` : ''}
                {who.address ? ` · ${who.address}` : ''}
              </span>
            </>
          ) : (
            <span className="crm-muted">Not assigned to a customer yet. Its name and address print on the first page.</span>
          )}
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

      {doc.content.blocks.length === 0 && <p className="crm-muted">Nothing here yet. Add a section, some text or a picture below.</p>}

      {doc.content.blocks.map((b, i) => (
        <section key={b.id} className={`dw-block dw-block--${b.type}`}>
          <div className="dw-bhead">
            <span className="dw-btype">{b.type === 'image' ? `Picture ${b.side === 'full' ? 'full width' : b.side}` : BLOCK_LABEL[b.type]}</span>
            <div className="dw-tools">
              <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                Up
              </button>
              <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={i === doc.content.blocks.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                Down
              </button>
              <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => setBlocks((bs) => bs.filter((x) => x.id !== b.id))} aria-label="Delete this block">
                Delete
              </button>
            </div>
          </div>
          <BlockFields b={b} urls={urls} quotes={quotes} hasWho={!!who?.name} patch={(p) => patchBlock(b.id, p)} onUpload={(files) => void upload(b.id, files)} />
        </section>
      ))}

      <div className="dw-add">
        <b>Add</b>
        {ADD.map((a) => (
          <button key={a.label} type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => setBlocks((bs) => [...bs, newBlock(a.type, a.side)])}>
            + {a.label}
          </button>
        ))}
      </div>

      {admin && (
        <p>
          <button type="button" className="crm-link" onClick={() => void remove()}>
            Delete this document
          </button>
        </p>
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
      <input className="crm-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Customer or organisation: name, phone, email or postcode" aria-label="Find a customer or organisation" autoFocus />
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

function BlockFields({ b, urls, quotes, hasWho, patch, onUpload }: { b: Block; urls: Record<string, string>; quotes: QuoteOpt[]; hasWho: boolean; patch: (p: Record<string, unknown>) => void; onUpload: (files: File[]) => void }) {
  switch (b.type) {
    case 'section':
    case 'title':
      return <input className="crm-input" value={b.text} onChange={(e) => patch({ text: e.target.value })} placeholder={b.type === 'section' ? 'Section heading, e.g. Our approach' : 'Title, e.g. Why Heliaxis'} aria-label={b.type === 'section' ? 'Section heading' : 'Title'} />;
    case 'text':
      return <TextField value={b.body} onChange={(body) => patch({ body })} label="Text" />;
    case 'image':
      return (
        <div className={`dw-img is-${b.side}`}>
          <div className="dw-pic">
            {b.path && urls[b.path] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={urls[b.path]} alt={b.caption || 'Picture'} />
            ) : (
              <div className="dw-empty">{b.path ? 'Picture saved (preview unavailable)' : 'No picture yet'}</div>
            )}
            <div className="dw-seg">
              <FileButton label={b.path ? 'Change picture' : 'Choose a picture'} accept="image/jpeg,image/png" onFiles={onUpload} variant="solar" />
              {(['left', 'right', 'full'] as const).map((s) => (
                <button key={s} type="button" className={`crm-btn crm-btn--small ${b.side === s ? 'crm-btn--solar' : 'crm-btn--ghost'}`} aria-pressed={b.side === s} onClick={() => patch({ side: s })}>
                  {s === 'full' ? 'Full width' : s === 'left' ? 'Left' : 'Right'}
                </button>
              ))}
            </div>
            <input className="crm-input" value={b.caption} onChange={(e) => patch({ caption: e.target.value })} placeholder="Caption (optional)" aria-label="Caption" />
          </div>
          <TextField value={b.body} onChange={(body) => patch({ body })} label={b.side === 'full' ? 'Text under the picture (optional)' : 'Text beside the picture'} rows={6} />
        </div>
      );
    case 'table':
      return <TableFields b={b} patch={patch} />;
    case 'quote':
      return (
        <div style={{ display: 'grid', gap: 8 }}>
          {quotes.length === 0 ? (
            <p className="crm-muted crm-small">{hasWho ? 'This customer has no quotes yet.' : 'Assign the document to a customer first; then you can choose one of their quotes.'}</p>
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
          <input className="crm-input" value={b.caption} onChange={(e) => patch({ caption: e.target.value })} placeholder="Heading above the table (optional; it says the quote number if left empty)" aria-label="Heading above the table" />
          <p className="dw-hint">Shows the quote’s lines and totals as they are now. It never shows costs or internal lines.</p>
        </div>
      );
    default:
      return <p className="dw-hint">The next block starts on a new page.</p>;
  }
}

/** A text box with Bold, Italic and list buttons: they add the little markers (**bold**, *italic*, - bullet, 1. number) around the selection. */
function TextField({ value, onChange, label, rows = 8 }: { value: string; onChange: (v: string) => void; label: string; rows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
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
    const end = z === a || value[z - 1] !== '\n' ? (value.indexOf('\n', z) === -1 ? value.length : value.indexOf('\n', z)) : z;
    const block = value.slice(start, end).split('\n').map((l, i) => `${prefix(i + 1)}${l.replace(/^\s*(?:[-•]|\d{1,3}[.)])\s+/, '')}`).join('\n');
    onChange(`${value.slice(0, start)}${block}${value.slice(end)}`);
  }
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div className="dw-fmt" role="toolbar" aria-label="Formatting">
        <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => wrap('**')}>
          <b>Bold</b>
        </button>
        <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => wrap('*')}>
          <i>Italic</i>
        </button>
        <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => lines(() => '- ')}>
          Bullets
        </button>
        <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => lines((n) => `${n}. `)}>
          Numbers
        </button>
      </div>
      <textarea ref={ref} className="crm-input dw-textarea" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} placeholder={`${label}. A blank line starts a new paragraph.`} />
    </div>
  );
}

function TableFields({ b, patch }: { b: Extract<Block, { type: 'table' }>; patch: (p: Record<string, unknown>) => void }) {
  const cols = b.headers.length;
  const setHead = (c: number, v: string) => patch({ headers: b.headers.map((h, i) => (i === c ? v : h)) });
  const setCell = (r: number, c: number, v: string) => patch({ rows: b.rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)) });
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <input className="crm-input" value={b.caption} onChange={(e) => patch({ caption: e.target.value })} placeholder="Heading above the table (optional)" aria-label="Table heading" />
      <div className="dw-tablewrap">
        <table className="dw-table">
          <thead>
            <tr>
              {b.headers.map((h, c) => (
                <th key={c}>
                  <input className="crm-input" value={h} onChange={(e) => setHead(c, e.target.value)} placeholder={`Column ${c + 1}`} aria-label={`Column ${c + 1} heading`} />
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {b.rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td key={c}>
                    <input className="crm-input" value={cell} onChange={(e) => setCell(r, c, e.target.value)} aria-label={`Row ${r + 1}, ${b.headers[c] || `column ${c + 1}`}`} />
                  </td>
                ))}
                <td>
                  <button type="button" className="crm-link" onClick={() => patch({ rows: b.rows.filter((_, i) => i !== r) })} aria-label={`Remove row ${r + 1}`}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="dw-tools">
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
    </div>
  );
}

