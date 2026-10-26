'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { QuoteRow } from '@/lib/quotes/server';
import { defaultQuoteMessage } from '@/lib/quotes/message';
import { createClient } from '@/lib/supabase/client';
import '../../../crm/crm.css';
import '../quotes.css';
import type { SavedItem } from '@/lib/quotes/items';
import { emptyLine, lineNet, lineProfit, money, newId, pct, penceFromText, priced, profitOf, textFromPence, totalsOf, VAT_RATES, type PriceMode, type QuoteBlock, type QuoteContent, type QuoteLine } from '@/lib/quotes/types';

type Customer = { name: string; email: string | null; phone: string | null };
type Channel = { ok: true; to?: string; via?: string } | { ok: false; error: string };
type Sent = { url: string; whatsappText: string; emailSubject: string; emailText: string; email: string | null; projectId: string; enquiryId: string; sentVia: { email?: Channel; whatsapp?: Channel } };

/** Shrink a picture in the browser (max 1600 px, JPEG) so it uploads quickly and keeps the PDF small. */
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

/** A pounds box: what is typed is kept as typed while it has focus, and tidied when you leave it. */
function MoneyInput({ pence, onChange, label, disabled, placeholder }: { pence: number; onChange: (p: number) => void; label: string; disabled?: boolean; placeholder?: string }) {
  // While it has focus the box shows exactly what was typed; otherwise it shows the saved amount.
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      className="crm-input"
      inputMode="decimal"
      aria-label={label}
      placeholder={placeholder}
      disabled={disabled}
      value={draft ?? textFromPence(pence)}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange(penceFromText(e.target.value));
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

export function QuoteBuilder({ initial, customer, library: libraryIn, imageUrls, savedItems: savedIn }: { initial: QuoteRow; customer: Customer; library: { id: string; name: string }[]; imageUrls: Record<string, string>; savedItems: SavedItem[] }) {
  const [saved, setSaved] = useState(savedIn);
  const [library, setLibrary] = useState(libraryIn);
  const [title, setTitle] = useState(initial.title);
  const [content, setContent] = useState<QuoteContent>(initial.content);
  const [validUntil, setValidUntil] = useState(initial.valid_until ?? '');
  const [deposit, setDeposit] = useState(textFromPence(initial.deposit_pence ?? 0));
  const [urls, setUrls] = useState(imageUrls);
  const [state, setState] = useState<'saved' | 'saving' | 'dirty' | 'error'>('saved');
  const [status, setStatus] = useState(initial.status);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [sent, setSent] = useState<Sent | null>(null);
  const [note, setNote] = useState('');
  const [composing, setComposing] = useState(false);
  const [viaEmail, setViaEmail] = useState(!!customer.email);
  const [viaWa, setViaWa] = useState(!!customer.phone);
  const [message, setMessage] = useState(() => defaultQuoteMessage(customer.name, initial.title));
  const first = useRef(true);
  const payload = useRef({ title, content, validUntil, deposit });
  payload.current = { title, content, validUntil, deposit };

  const save = useCallback(async () => {
    setState('saving');
    const p = payload.current;
    const r = await fetch(`/api/crm/quotes/${initial.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: p.title, content: p.content, valid_until: p.validUntil || null, deposit_pence: penceFromText(p.deposit) }),
    }).catch(() => null);
    setState(r?.ok ? 'saved' : 'error');
    return !!r?.ok;
  }, [initial.id]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setState('dirty');
    const t = setTimeout(() => void save(), 1200);
    return () => clearTimeout(t);
  }, [title, content, validUntil, deposit, save]);

  const totals = totalsOf(content);
  const prof = profitOf(content);
  const edit = (fn: (c: QuoteContent) => QuoteContent) => setContent((c) => fn(c));
  const setBlock = (id: string, patch: Partial<QuoteBlock>) => edit((c) => ({ ...c, blocks: c.blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as QuoteBlock) : b)) }));
  const move = (id: string, d: -1 | 1) =>
    edit((c) => {
      const i = c.blocks.findIndex((b) => b.id === id);
      const j = i + d;
      if (i < 0 || j < 0 || j >= c.blocks.length) return c;
      const blocks = [...c.blocks];
      [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
      return { ...c, blocks };
    });
  const remove = (id: string) => edit((c) => ({ ...c, blocks: c.blocks.filter((b) => b.id !== id) }));
  const add = (type: QuoteBlock['type']) =>
    edit((c) => ({
      ...c,
      blocks: [
        ...c.blocks,
        type === 'items'
          ? { id: newId(), type, heading: 'Price', lines: [emptyLine()] }
          : type === 'text'
            ? { id: newId(), type, heading: '', body: '' }
            : type === 'images'
              ? { id: newId(), type, heading: 'Photos and diagrams', images: [] }
              : { id: newId(), type, heading: 'Datasheets', files: [] },
      ],
    }));
  const setLine = (bid: string, lid: string, patch: Partial<QuoteLine>) =>
    edit((c) => ({ ...c, blocks: c.blocks.map((b) => (b.id === bid && b.type === 'items' ? { ...b, lines: b.lines.map((l) => (l.id === lid ? priced({ ...l, ...patch }) : l)) } : b)) }));

  async function upload(bid: string, files: FileList | null) {
    if (!files?.length) return;
    setErr('');
    for (const f of Array.from(files).slice(0, 6)) {
      try {
        const small = await shrink(f);
        const fd = new FormData();
        fd.append('file', small);
        const r = await fetch(`/api/crm/quotes/${initial.id}/image`, { method: 'POST', body: fd });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'Upload failed');
        setUrls((u) => ({ ...u, [d.path]: d.url }));
        edit((c) => ({ ...c, blocks: c.blocks.map((b) => (b.id === bid && b.type === 'images' ? { ...b, images: [...b.images, { path: d.path, caption: '' }] } : b)) }));
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Upload failed');
      }
    }
  }

  /** Upload PDF datasheets: saved to the document library (so they can be used on other quotes) and added here. */
  async function uploadSheets(bid: string, files: FileList | null) {
    if (!files?.length) return;
    setErr('');
    setBusy('sheet');
    try {
      for (const f of Array.from(files).slice(0, 6)) {
        if (f.type !== 'application/pdf') throw new Error(`${f.name} isn’t a PDF. Datasheets must be PDFs.`);
        const prep = await fetch('/api/crm/library', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'prepare', name: f.name, mime: f.type, size: f.size }) });
        const p = await prep.json().catch(() => ({}));
        if (!prep.ok) throw new Error(p.error || 'Upload failed');
        const up = await createClient().storage.from(p.bucket).uploadToSignedUrl(p.path, p.token, f, { contentType: f.type });
        if (up.error) throw new Error(up.error.message);
        const name = f.name.replace(/\.[a-z0-9]+$/i, '');
        const saved = await fetch('/api/crm/library', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save', path: p.path, name, mime: f.type, size: f.size }) });
        const d = await saved.json().catch(() => ({}));
        if (!saved.ok || !d.item?.id) throw new Error(d.error || 'Couldn’t save the datasheet');
        setLibrary((l) => [...l, { id: d.item.id as string, name }].sort((a, b) => a.name.localeCompare(b.name)));
        edit((c) => ({ ...c, blocks: c.blocks.map((b) => (b.id === bid && b.type === 'datasheets' ? { ...b, files: [...b.files, { library_id: d.item.id as string, name }] } : b)) }));
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed');
    }
    setBusy('');
  }

  async function putSaved(items: SavedItem[]) {
    const r = await fetch('/api/crm/quote-items', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setErr(d.error || 'Couldn’t save the item.');
    setSaved(d.items);
    setNote('Saved items updated ✓');
  }
  const saveLineAsItem = (l: QuoteLine) => {
    if (!l.description.trim()) return setErr('Give the line a description first.');
    void putSaved([...saved, { id: newId(), description: l.description, detail: l.detail ?? '', unit_pence: l.unit_pence, vat_rate: l.vat_rate, cost_pence: l.cost_pence, mode: l.mode, markup: l.markup }]);
  };

  async function preview() {
    setBusy('preview');
    setErr('');
    if (!(await save())) {
      setBusy('');
      return setErr('Couldn’t save, so the preview would be out of date. Try again.');
    }
    window.open(`/api/crm/quotes/${initial.id}/pdf`, '_blank');
    setBusy('');
  }
  function openSend() {
    if (totals.gross <= 0) return setErr('Add at least one priced item first.');
    setErr('');
    setComposing(true);
  }
  async function send() {
    setBusy('send');
    setErr('');
    if (!(await save())) {
      setBusy('');
      return setErr('Couldn’t save, so it wasn’t sent. Try again.');
    }
    const r = await fetch(`/api/crm/quotes/${initial.id}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: viaEmail, whatsapp: viaWa, message }) });
    const d = await r.json().catch(() => ({}));
    setBusy('');
    if (!r.ok) return setErr(d.error || 'Not sent');
    setSent(d);
    setComposing(false);
    setStatus('sent');
  }
  async function emailIt() {
    if (!sent) return;
    if (!window.confirm(`Email the link to ${sent.email}?`)) return;
    setBusy('email');
    const r = await fetch(`/api/crm/projects/${sent.projectId}/email`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject: sent.emailSubject, text: sent.emailText }) });
    const d = await r.json().catch(() => ({}));
    setBusy('');
    setNote(r.ok ? `Emailed to ${sent.email} ✓` : d.error || 'Email not sent');
  }
  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNote(`${what} copied ✓`);
    } catch {
      window.prompt('Copy this', text);
    }
  }

  const locked = status === 'accepted';
  return (
    <div className="crm crmh qb-page qb-build">
      <div className="qb-head">
        <div>
          <Link href="/admin/sales/quotes" className="crm-back">
            ← Quotes
          </Link>
          <h1 className="crmh-h1">
            {initial.number} <span className={`qb-status qb-status--${status}`}>{status}</span>
          </h1>
          <p className="crm-muted crm-small">
            For <b>{customer.name}</b> · <Link href={`/admin/crm/${initial.project_id}`}>open the opportunity</Link>
          </p>
        </div>
        <div className="qb-actions">
          <span className="crm-muted crm-small" aria-live="polite">
            {state === 'saved' ? 'Saved ✓' : state === 'saving' ? 'Saving…' : state === 'dirty' ? 'Unsaved changes' : 'Couldn’t save, retrying on your next change'}
          </span>
          <button type="button" className="crm-btn crm-btn--ghost" disabled={!!busy} onClick={() => void preview()}>
            {busy === 'preview' ? 'Opening…' : 'Preview PDF'}
          </button>
          <button type="button" className="crm-btn crm-btn--solar" disabled={!!busy || locked} onClick={openSend} title={locked ? 'They have signed this quote' : undefined}>
            {status === 'sent' ? 'Update and send again' : 'Send to customer'}
          </button>
        </div>
      </div>
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
      {locked && <p className="crm-banner">The customer has signed this quote, so it is locked.</p>}

      {composing && (
        <div className="qb-sheet" role="dialog" aria-label="Send the quote">
          <b>Send {initial.number} to {customer.name}</b>
          <p className="crm-small crm-muted">They get a link to their private portal, where they can view the quote, accept it, or raise a query. Nothing is sent until you press Send quote.</p>
          <label className="crm-check">
            <input type="checkbox" checked={viaEmail} disabled={!customer.email} onChange={(e) => setViaEmail(e.target.checked)} /> Branded email{customer.email ? ` to ${customer.email}` : ' (no email address on file)'}
          </label>
          <label className="crm-check">
            <input type="checkbox" checked={viaWa} disabled={!customer.phone} onChange={(e) => setViaWa(e.target.checked)} /> WhatsApp{customer.phone ? ` to ${customer.phone}` : ' (no mobile number on file)'}
          </label>
          <label className="qb-lab">Message (the portal link and button are added for you)</label>
          <textarea className="crm-input" rows={9} value={message} onChange={(e) => setMessage(e.target.value)} />
          {viaWa && <p className="crm-small crm-muted">If their 24-hour WhatsApp window is closed, the approved “Quote ready” template goes instead, with its own fixed wording.</p>}
          <div className="crm-actions">
            <button type="button" className="crm-btn crm-btn--solar" disabled={!!busy} onClick={() => void send()}>
              {busy === 'send' ? 'Sending…' : viaEmail || viaWa ? 'Send quote' : 'Make the link only'}
            </button>
            <button type="button" className="crm-btn crm-btn--ghost" onClick={() => setComposing(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {sent && (
        <div className="qb-sent">
          <b>{sent.sentVia.email || sent.sentVia.whatsapp ? 'Quote sent' : 'Link ready'} ✓</b>
          <p className="crm-small">The job is now at Quote sent. Their link opens the quote to view, accept or query.</p>
          {sent.sentVia.email && <p className="crm-small">{sent.sentVia.email.ok ? `✓ Email sent to ${sent.sentVia.email.to}` : `✗ Email not sent: ${sent.sentVia.email.error}`}</p>}
          {sent.sentVia.whatsapp && <p className="crm-small">{sent.sentVia.whatsapp.ok ? `✓ WhatsApp sent${sent.sentVia.whatsapp.via === 'template' ? ' (as the Quote ready template)' : ''}` : `✗ WhatsApp not sent: ${sent.sentVia.whatsapp.error}`}</p>}
          <code className="qb-link">{sent.url}</code>
          <div className="crm-actions">
            <button type="button" className="crm-btn crm-btn--ghost" onClick={() => void copy(sent.url, 'Link')}>
              Copy link
            </button>
            <button type="button" className="crm-btn crm-btn--ghost" onClick={() => void copy(sent.whatsappText, 'WhatsApp message')}>
              Copy WhatsApp message
            </button>
            <Link className="crm-btn crm-btn--wa" href={`/admin/crm/chats/${sent.enquiryId}`}>
              Open WhatsApp chat
            </Link>
            <button type="button" className="crm-btn crm-btn--ghost" disabled={!sent.email || busy === 'email'} title={sent.email ? undefined : 'No email address on file'} onClick={() => void emailIt()}>
              Email it
            </button>
          </div>
          {note && <p className="crm-small">{note}</p>}
        </div>
      )}
      {!sent && note && <p className="crm-small" aria-live="polite">{note}</p>}

      <div className="qb-grid" aria-disabled={locked}>
        <div className="qb-col">
          <section className="qb-card">
            <label className="qb-lab">Quote title</label>
            <input className="crm-input" value={title} onChange={(e) => setTitle(e.target.value)} disabled={locked} />
            <label className="qb-lab">Introduction</label>
            <textarea className="crm-input" rows={4} value={content.intro} onChange={(e) => edit((c) => ({ ...c, intro: e.target.value }))} disabled={locked} />
          </section>

          {content.blocks.map((b, i) => (
            <section key={b.id} className="qb-card">
              <div className="qb-bhead">
                <input className="crm-input qb-heading" placeholder="Section heading" value={b.heading} onChange={(e) => setBlock(b.id, { heading: e.target.value })} disabled={locked} />
                <span className="qb-type">{b.type === 'items' ? 'Items' : b.type === 'text' ? 'Text' : b.type === 'images' ? 'Images' : 'Datasheets'}</span>
                <button type="button" className="qb-icon" aria-label="Move up" disabled={i === 0 || locked} onClick={() => move(b.id, -1)}>
                  ↑
                </button>
                <button type="button" className="qb-icon" aria-label="Move down" disabled={i === content.blocks.length - 1 || locked} onClick={() => move(b.id, 1)}>
                  ↓
                </button>
                <button type="button" className="qb-icon" aria-label="Remove section" disabled={locked} onClick={() => window.confirm('Remove this section?') && remove(b.id)}>
                  ✕
                </button>
              </div>

              {b.type === 'text' && <textarea className="crm-input" rows={6} placeholder="Write the text. A blank line starts a new paragraph." value={b.body} onChange={(e) => setBlock(b.id, { body: e.target.value })} disabled={locked} />}

              {b.type === 'items' && (
                <>
                  <div className="qb-lines">
                    <div className="qb-line qb-line--head">
                      <span>Item</span>
                      <span>Qty</span>
                      <span>Cost £ each</span>
                      <span>Pricing</span>
                      <span>Markup / price</span>
                      <span>VAT</span>
                      <span>Sell total</span>
                      <span />
                    </div>
                    {b.lines.map((l) => {
                      const profit = lineProfit(l);
                      const sell = lineNet(l);
                      return (
                        <div key={l.id} className={`qb-line${l.internal ? ' is-internal' : ''}`}>
                          <div className="qb-desc">
                            <input className="crm-input" placeholder="e.g. 12 × 450W solar panels" value={l.description} onChange={(e) => setLine(b.id, l.id, { description: e.target.value })} disabled={locked} aria-label="Description" />
                            <input className="crm-input qb-detail" placeholder="Optional detail" value={l.detail ?? ''} onChange={(e) => setLine(b.id, l.id, { detail: e.target.value })} disabled={locked} aria-label="Detail" />
                            <div className="qb-linemeta">
                              <label className="crm-check qb-internal">
                                <input type="checkbox" checked={!!l.internal} disabled={locked} onChange={(e) => setLine(b.id, l.id, { internal: e.target.checked })} /> Not on the quote (our cost only)
                              </label>
                              {(l.cost_pence > 0 || sell > 0) && !l.internal && (
                                <span className={`qb-profit${profit < 0 ? ' neg' : ''}`} title="Profit on this line (internal)">
                                  Profit {money(profit)}{sell > 0 ? ` · ${pct((profit / sell) * 100)}` : ''}
                                </span>
                              )}
                              {l.description.trim() && !saved.some((x) => x.description === l.description && x.unit_pence === l.unit_pence && x.cost_pence === l.cost_pence) && (
                                <button type="button" className="crm-link qb-saveitem" disabled={locked} onClick={() => saveLineAsItem(l)}>
                                  Save as a saved item
                                </button>
                              )}
                            </div>
                          </div>
                          <input className="crm-input" inputMode="decimal" value={String(l.qty)} onChange={(e) => setLine(b.id, l.id, { qty: Number(e.target.value.replace(/[^0-9.]/g, '')) || 0 })} disabled={locked} aria-label="Quantity" />
                          <MoneyInput pence={l.cost_pence} onChange={(p) => setLine(b.id, l.id, { cost_pence: p })} label="Cost each in pounds (not shown to the customer)" disabled={locked} placeholder="Cost" />
                          <select className="crm-input" value={l.mode} disabled={locked} aria-label="How this line is priced" onChange={(e) => setLine(b.id, l.id, { mode: e.target.value as PriceMode })}>
                            <option value="pct">Markup %</option>
                            <option value="gbp">Markup £</option>
                            <option value="manual">Manual</option>
                          </select>
                          <div className="qb-val">
                            {l.mode === 'pct' && (
                              <input className="crm-input" inputMode="decimal" aria-label="Markup percent" placeholder="%" disabled={locked} value={l.markup ? String(l.markup) : ''} onChange={(e) => setLine(b.id, l.id, { markup: Number(e.target.value.replace(/[^0-9.-]/g, '')) || 0 })} />
                            )}
                            {l.mode === 'gbp' && <MoneyInput pence={l.markup} onChange={(p) => setLine(b.id, l.id, { markup: p })} label="Markup in pounds each" disabled={locked} placeholder="£ each" />}
                            {l.mode === 'manual' && <MoneyInput pence={l.unit_pence} onChange={(p) => setLine(b.id, l.id, { unit_pence: p })} label="Sell price each in pounds" disabled={locked} placeholder="Sell £ each" />}
                            {l.mode !== 'manual' && <small className="qb-sellunit">Sells at {money(l.unit_pence)} each</small>}
                          </div>
                          <select className="crm-input" value={l.vat_rate} onChange={(e) => setLine(b.id, l.id, { vat_rate: Number(e.target.value) })} disabled={locked} aria-label="VAT rate">
                            {VAT_RATES.map((r) => (
                              <option key={r} value={r}>
                                {r}%
                              </option>
                            ))}
                          </select>
                          <span className="qb-amt">{l.internal ? '–' : money(sell)}</span>
                          <button type="button" className="qb-icon" aria-label="Remove line" disabled={locked} onClick={() => edit((c) => ({ ...c, blocks: c.blocks.map((x) => (x.id === b.id && x.type === 'items' ? { ...x, lines: x.lines.filter((y) => y.id !== l.id) } : x)) }))}>
                            ✕
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="qb-addrow">
                    <button type="button" className="crm-link" disabled={locked} onClick={() => edit((c) => ({ ...c, blocks: c.blocks.map((x) => (x.id === b.id && x.type === 'items' ? { ...x, lines: [...x.lines, emptyLine(x.lines.at(-1))] } : x)) }))}>
                      + Add a line
                    </button>
                    {saved.length > 0 && (
                      <select
                        className="crm-input qb-saved"
                        value=""
                        disabled={locked}
                        aria-label="Add a saved item"
                        onChange={(e) => {
                          const it = saved.find((x) => x.id === e.target.value);
                          if (it) edit((c) => ({ ...c, blocks: c.blocks.map((x) => (x.id === b.id && x.type === 'items' ? { ...x, lines: [...x.lines.filter((l) => l.description.trim() || l.unit_pence), priced({ id: newId(), description: it.description, detail: it.detail || undefined, qty: 1, unit_pence: it.unit_pence, vat_rate: it.vat_rate, cost_pence: it.cost_pence, mode: it.mode, markup: it.markup })] } : x)) }));
                        }}
                      >
                        <option value="">+ Add a saved item…</option>
                        {saved.map((it) => (
                          <option key={it.id} value={it.id}>
                            {it.description}{it.unit_pence ? ` · ${money(it.unit_pence)}` : ''}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <p className="crm-muted crm-small">Your cost and markup are for you only: the customer sees just the sell price. A discount is a manual-price line with a minus price, e.g. -500.</p>
                </>
              )}

              {b.type === 'images' && (
                <>
                  <div className="qb-imgs">
                    {b.images.map((im, k) => (
                      <figure key={im.path} className="qb-img">
                        {urls[im.path] ? <img src={urls[im.path]} alt={im.caption || 'Picture'} /> : <div className="qb-ph">Picture</div>}
                        <input className="crm-input" placeholder="Caption (optional)" value={im.caption} onChange={(e) => setBlock(b.id, { images: b.images.map((x, n) => (n === k ? { ...x, caption: e.target.value } : x)) })} disabled={locked} />
                        <button type="button" className="crm-link" disabled={locked} onClick={() => setBlock(b.id, { images: b.images.filter((_, n) => n !== k) })}>
                          Remove
                        </button>
                      </figure>
                    ))}
                  </div>
                  <label className="crm-btn crm-btn--ghost qb-upload">
                    + Add pictures
                    <input type="file" accept="image/jpeg,image/png" multiple hidden disabled={locked} onChange={(e) => void upload(b.id, e.target.files)} />
                  </label>
                </>
              )}

              {b.type === 'datasheets' && (
                <>
                  {b.files.map((f) => (
                    <p key={f.library_id} className="qb-file">
                      📄 {f.name}
                      <button type="button" className="crm-link" disabled={locked} onClick={() => setBlock(b.id, { files: b.files.filter((x) => x.library_id !== f.library_id) })}>
                        Remove
                      </button>
                    </p>
                  ))}
                  <label className="crm-btn crm-btn--ghost qb-upload">
                    {busy === 'sheet' ? 'Uploading…' : '+ Upload a datasheet (PDF)'}
                    <input type="file" accept="application/pdf" multiple hidden disabled={locked || busy === 'sheet'} onChange={(e) => { void uploadSheets(b.id, e.target.files); e.target.value = ''; }} />
                  </label>
                  {library.length > 0 && (
                    <select
                      className="crm-input"
                      value=""
                      disabled={locked}
                      onChange={(e) => {
                        const l = library.find((x) => x.id === e.target.value);
                        if (l && !b.files.some((x) => x.library_id === l.id)) setBlock(b.id, { files: [...b.files, { library_id: l.id, name: l.name }] });
                      }}
                    >
                      <option value="">Or pick one already in the library…</option>
                      {library.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <p className="crm-muted crm-small">Each datasheet is added to the end of the quote PDF, and kept in the document library for other quotes.</p>
                </>
              )}
            </section>
          ))}

          <div className="qb-add">
            <b>Add a section:</b>
            <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={locked} onClick={() => add('items')}>
              Items and prices
            </button>
            <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={locked} onClick={() => add('text')}>
              Text
            </button>
            <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={locked} onClick={() => add('images')}>
              Images
            </button>
            <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={locked} onClick={() => add('datasheets')}>
              Datasheets
            </button>
          </div>

          <section className="qb-card">
            <label className="qb-lab">Terms (printed at the bottom of the quote, just before the acceptance)</label>
            <textarea className="crm-input" rows={6} value={content.terms} onChange={(e) => edit((c) => ({ ...c, terms: e.target.value }))} disabled={locked} />
          </section>
        </div>

        <aside className="qb-side">
          <section className="qb-card">
            <b>Total</b>
            <div className="qb-sum">
              <span>Before VAT</span>
              <span>{money(totals.net)}</span>
            </div>
            {totals.byRate.filter((r) => r.vat).map((r) => (
              <div key={r.rate} className="qb-sum">
                <span>VAT at {r.rate}%</span>
                <span>{money(r.vat)}</span>
              </div>
            ))}
            <div className="qb-sum qb-sum--total">
              <span>Total to pay</span>
              <span>{money(totals.gross)}</span>
            </div>
            <label className="qb-lab">Deposit once they accept (£, optional)</label>
            <input className="crm-input" inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} disabled={locked} placeholder="e.g. 500" />
            <label className="qb-lab">Valid until</label>
            <input className="crm-input" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} disabled={locked} />
          </section>
          <section className="qb-card qb-profitcard" aria-label="Profit, for us only">
            <b>Profit <span className="qb-internal-tag">internal</span></b>
            <div className="qb-sum">
              <span>Sell before VAT</span>
              <span>{money(prof.sell)}</span>
            </div>
            <div className="qb-sum">
              <span>Our cost</span>
              <span>{money(prof.cost)}</span>
            </div>
            <div className={`qb-sum qb-sum--total${prof.profit < 0 ? ' neg' : ' pos'}`}>
              <span>Profit</span>
              <span>{money(prof.profit)}</span>
            </div>
            <div className="qb-sum">
              <span>Margin</span>
              <span>{pct(prof.marginPct)}</span>
            </div>
            <div className="qb-sum">
              <span>Markup on cost</span>
              <span>{pct(prof.markupPct)}</span>
            </div>
            {prof.uncosted > 0 && <p className="crm-small qb-warn">{prof.uncosted} priced line{prof.uncosted === 1 ? ' has' : 's have'} no cost yet, so the profit shown is too high.</p>}
            <p className="crm-small crm-muted">Never printed on the quote or shown in the customer’s portal. VAT is passed on, so it is not counted.</p>
          </section>
          {saved.length > 0 && (
            <section className="qb-card">
              <b>Saved items</b>
              <ul className="qb-savedlist">
                {saved.map((it) => (
                  <li key={it.id}>
                    <span>{it.description}</span>
                    <small>{it.unit_pence ? money(it.unit_pence) : ''}</small>
                    <button type="button" className="crm-link" aria-label={`Remove ${it.description}`} onClick={() => void putSaved(saved.filter((x) => x.id !== it.id))}>
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="qb-card qb-help">
            <b>How it goes</b>
            <ol>
              <li>Build the quote, then Preview PDF.</li>
              <li>Send to customer makes their private link and moves the job to Quote sent.</li>
              <li>They read it, sign on their phone and can pay the deposit. The job then moves to Won.</li>
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
