'use client';

import Link from 'next/link';
import { WritingSpark } from './WritingSpark';
import { FileButton, Sheet } from '../../../crm/CrmUi';
import { SignaturePad } from '@/components/subcontractors/SignaturePad';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { QuoteRow } from '@/lib/quotes/server';
import { defaultQuoteMessage } from '@/lib/quotes/message';
import { createClient } from '@/lib/supabase/client';
import '../../../crm/crm.css';
import '../quotes.css';
import type { SavedItem } from '@/lib/quotes/items';
import { greetingName } from '@/lib/greeting-name';
import { DEFAULT_TERMS, emptyLine, emptyText, lineNet, lineProfit, money, newId, pct, penceFromText, priced, profitOf, textFromPence, totalsOf, VAT_RATES, type PriceMode, type ProposalOption, type QuoteBlock, type QuoteContent, type QuoteLine } from '@/lib/quotes/types';

type Customer = { name: string; email: string | null; phone: string | null };
type Channel = { ok: true; to?: string; via?: string } | { ok: false; error: string };
type Sent = { url: string; whatsappText: string; emailSubject: string; emailText: string; email: string | null; projectId: string; enquiryId: string; sentVia: { email?: Channel; whatsapp?: Channel; sms?: Channel } };

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

export function QuoteBuilder({ initial, customer, library: libraryIn, imageUrls, savedItems: savedIn, minMarginPct }: { initial: QuoteRow; customer: Customer; library: { id: string; name: string }[]; imageUrls: Record<string, string>; savedItems: SavedItem[]; minMarginPct: number }) {
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
  const [viaSms, setViaSms] = useState(false);
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
  const lowMargin = minMarginPct > 0 && prof.marginPct !== null && prof.marginPct < minMarginPct;
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

  // Dragging lines (by the ⠿ handle) within a list or between lists: dropped on a line, it goes just above it; on the end of a list, it goes last.
  const drag = useRef<{ bid: string; lid: string } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState<Set<string>>(new Set());
  const moveLine = (toBid: string, beforeLid: string | null) => {
    const from = drag.current;
    drag.current = null;
    setOver(null);
    if (!from || from.lid === beforeLid) return;
    edit((c) => {
      let moving: QuoteLine | undefined;
      const without = c.blocks.map((b) => {
        if (b.id !== from.bid || b.type !== 'items') return b;
        moving = b.lines.find((l) => l.id === from.lid);
        return { ...b, lines: b.lines.filter((l) => l.id !== from.lid) };
      });
      const line = moving;
      if (!line) return c;
      return {
        ...c,
        blocks: without.map((b) => {
          if (b.id !== toBid || b.type !== 'items') return b;
          const at = beforeLid ? b.lines.findIndex((l) => l.id === beforeLid) : -1;
          const lines = [...b.lines];
          lines.splice(at < 0 ? lines.length : at, 0, line);
          return { ...b, lines };
        }),
      };
    });
  };
  const addTo = (bid: string, line: (last: QuoteLine | undefined) => QuoteLine) =>
    edit((c) => ({ ...c, blocks: c.blocks.map((x) => (x.id === bid && x.type === 'items' ? { ...x, lines: [...x.lines, line(x.lines.filter((l) => !l.text).at(-1))] } : x)) }));

  const [writing, setWriting] = useState('');
  const [asking, setAsking] = useState('');
  const [ask, setAsk] = useState({ ancillaries: true, access: true, handover: true, compliance: true, keyPoints: '' });
  /** Write "What is included" from the items on screen. */
  async function writeIncluded(bid: string, force = false): Promise<boolean> {
    const cur = content.blocks.find((x) => x.id === bid);
    if (!force && cur?.type === 'text' && cur.body.trim().length > 40 && !window.confirm('Replace what is written here?')) return false;
    setWriting(bid);
    setAsking('');
    setErr('');
    try {
      const r = await fetch(`/api/crm/quotes/${initial.id}/included`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, options: ask }) });
      const d = (await r.json().catch(() => ({}))) as { text?: string; via?: string; error?: string };
      if (!r.ok || !d.text) throw new Error(d.error || 'Couldn’t write it. Try again.');
      setBlock(bid, { body: d.text });
      setNote(d.via === 'ai' ? 'Written from your items. Have a read and change anything you like.' : 'Made from your item names (the writing assistant isn’t switched on). Have a read and tidy it.');
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Couldn’t write it. Try again.');
      return false;
    } finally {
      setWriting('');
    }
  }

  // Whose signature goes under the introduction: yours (drawn once), or one a colleague has shared with the CRM.
  type Sig = { name: string; role: string; png: string; shared: boolean };
  const [sigs, setSigs] = useState<{ meId: string; mine: Sig | null; shared: (Sig & { userId: string })[] } | null>(null);
  const [signing, setSigning] = useState(false);
  const [sigDraft, setSigDraft] = useState({ name: '', role: '', png: null as string | null, shared: false });
  useEffect(() => {
    let gone = false;
    fetch('/api/crm/quote-signatory', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { meId?: string; mine?: Sig | null; shared?: (Sig & { userId: string })[] }) => !gone && d.meId && setSigs({ meId: d.meId, mine: d.mine ?? null, shared: d.shared ?? [] }))
      .catch(() => undefined);
    return () => {
      gone = true;
    };
  }, []);
  const signer: Sig | null = !sigs || !content.signerId ? null : content.signerId === sigs.meId ? sigs.mine : (sigs.shared.find((x) => x.userId === content.signerId) ?? null);
  async function saveSignatory() {
    setErr('');
    const r = await fetch('/api/crm/quote-signatory', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sigDraft) });
    const d = (await r.json().catch(() => ({}))) as { signatory?: Sig; error?: string };
    if (!r.ok || !d.signatory) return setErr(d.error || 'Couldn’t save the signature. Try again.');
    setSigs((cur) => (cur ? { ...cur, mine: d.signatory! } : cur));
    edit((c) => ({ ...c, signerId: sigs?.meId }));
    setSigning(false);
    setNote('Signature saved against your profile. It prints under the introduction on your quotes.');
  }

  /** The cover letter, written from the items on screen. */
  async function writeIntro(force = false): Promise<boolean> {
    if (!force && content.intro.trim().length > 60 && !window.confirm('Replace the introduction?')) return false;
    setWriting('intro');
    setErr('');
    try {
      const r = await fetch(`/api/crm/quotes/${initial.id}/included`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, intro: { first: greetingName(customer.name) } }) });
      const d = (await r.json().catch(() => ({}))) as { text?: string; via?: string; error?: string };
      if (!r.ok || !d.text) throw new Error(d.error || 'Couldn’t write it. Try again.');
      edit((c) => ({ ...c, intro: d.text! }));
      setNote(d.via === 'ai' ? 'Introduction written from your items. Have a read and change anything you like.' : 'Introduction made from a standard form (the writing assistant isn’t switched on). Have a read and tidy it.');
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Couldn’t write it. Try again.');
      return false;
    } finally {
      setWriting('');
    }
  }

  const [reading, setReading] = useState(false);
  /** Read an OpenSolar proposal for the figures the cover and the writing use. */
  async function readProposal(file: File | undefined) {
    if (!file) return;
    setReading(true);
    setErr('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch(`/api/crm/quotes/${initial.id}/proposal`, { method: 'POST', body: fd });
      const d = (await r.json().catch(() => ({}))) as { options?: ProposalOption[]; file?: string; error?: string };
      if (!r.ok || !d.options?.length) throw new Error(d.error || 'It couldn’t read that file. Try again.');
      edit((c) => ({ ...c, proposal: { file: d.file ?? file.name, options: d.options!, chosen: 0, showFinancials: false } }));
      setNote(`Read ${d.options.length} system option${d.options.length === 1 ? '' : 's'} from the proposal. Check the figures, then use Write the introduction and Write from the quote.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'It couldn’t read that file. Try again.');
    } finally {
      setReading(false);
    }
  }

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

  /** Is the introduction still the starter text, and is What is included empty: the two things Generate quote fills in. */
  const introUnwritten = !content.intro.trim() || /^Hi .*thank you for the chance to quote/i.test(content.intro.trim());
  const includedBlock = content.blocks.find((b) => b.type === 'text' && /includ/i.test(b.heading));
  const includedUnwritten = !includedBlock || (includedBlock.type === 'text' && !includedBlock.body.trim());
  const [finishing, setFinishing] = useState(false);
  const [askFinish, setAskFinish] = useState(false);

  /** Write the introduction and What is included in one go (each with its spark). Only what is still unwritten, unless `all`. */
  async function generateQuote(all = false) {
    if (totals.gross <= 0) return setErr('Add at least one priced item first, then it can write the quote.');
    if (all && !introUnwritten && !includedUnwritten && !window.confirm('Replace the introduction and What is included with new text?')) return;
    setFinishing(true);
    setErr('');
    try {
      if (all || introUnwritten) await writeIntro(true);
      if (all || includedUnwritten) {
        let bid = includedBlock?.id;
        if (!bid) {
          bid = newId();
          const id = bid;
          edit((c) => {
            const at = Math.max(0, c.blocks.findIndex((b) => b.type === 'items') + 1);
            const blocks = [...c.blocks];
            blocks.splice(at, 0, { id, type: 'text', heading: 'What is included', body: '' });
            return { ...c, blocks };
          });
        }
        await writeIncluded(bid, true);
      }
    } finally {
      setFinishing(false);
    }
  }

  // "Send me a copy": the email and text the customer will get, to you.
  type CopyChannel = { ok: true; to: string } | { ok: false; error: string };
  const [copyResult, setCopyResult] = useState<{ email: CopyChannel; sms: CopyChannel; needMobile?: boolean; live: boolean } | null>(null);
  const [askMobile, setAskMobile] = useState(false);
  const [mobileDraft, setMobileDraft] = useState('');
  const [copying, setCopying] = useState(false);
  async function sendCopy(mobile?: string) {
    if (totals.gross <= 0) return setErr('Add at least one priced item first.');
    setCopying(true);
    setErr('');
    if (!(await save())) {
      setCopying(false);
      return setErr('Couldn’t save, so the copy would be out of date. Try again.');
    }
    const r = await fetch(`/api/crm/quotes/${initial.id}/send-copy`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, mobile }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setCopying(false);
    if (!r?.ok) return setErr(d.error || 'The copy wasn’t sent. Try again.');
    setCopyResult(d);
    setAskMobile(!!d.needMobile);
    if (!d.needMobile) setMobileDraft('');
  }

  // Where the customer has got to with the quote they were sent.
  type Activity = { sentAt: string | null; track: { opens: number; firstOpenedAt?: string; lastOpenedAt?: string; pdfViewedAt?: string; signStartedAt?: string; declineStartedAt?: string; datesStartedAt?: string; declined?: { at: string; reason: string } }; acceptedAt: string | null; acceptedName: string | null; installPref: { dates?: string[]; provisional?: boolean; at?: string } | null };
  const [activity, setActivity] = useState<Activity | null>(null);
  useEffect(() => {
    if (status === 'draft') return;
    let gone = false;
    fetch(`/api/crm/quotes/${initial.id}/activity`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Activity | null) => !gone && d && setActivity(d))
      .catch(() => undefined);
    return () => {
      gone = true;
    };
  }, [initial.id, status, sent]);

  async function preview(skipAsk = false) {
    if (!skipAsk && totals.gross > 0 && (introUnwritten || includedUnwritten)) return setAskFinish(true);
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
    const r = await fetch(`/api/crm/quotes/${initial.id}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: viaEmail, whatsapp: viaWa, sms: viaSms, message }) });
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
  // A quote without a signer takes your own signature as soon as you have one.
  useEffect(() => {
    if (sigs?.mine && !content.signerId && !locked) edit((c) => (c.signerId ? c : { ...c, signerId: sigs.meId }));
  }, [sigs, content.signerId, locked]);
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
          <button type="button" className="crm-btn crm-btn--ghost" disabled={!!busy || finishing || copying} onClick={() => void sendCopy()} title="Emails and texts you what the customer will receive. Nothing goes to them.">
            {copying ? 'Sending…' : 'Send me a copy'}
          </button>
          <button type="button" className="crm-btn crm-btn--ghost" disabled={!!busy || finishing || locked} onClick={() => void generateQuote(!introUnwritten && !includedUnwritten)} title="Writes the introduction and What is included from your items">
            {finishing ? 'Generating…' : 'Generate quote'}
          </button>
          <button type="button" className="crm-btn crm-btn--ghost" disabled={!!busy || finishing} onClick={() => void preview()}>
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
          {lowMargin && <p className="crm-banner crm-banner--err">This quote’s margin is {pct(prof.marginPct)}, below your {minMarginPct}% target. You can still send it.</p>}
          <label className="crm-check">
            <input type="checkbox" checked={viaEmail} disabled={!customer.email} onChange={(e) => setViaEmail(e.target.checked)} /> Branded email{customer.email ? ` to ${customer.email}` : ' (no email address on file)'}
          </label>
          <label className="crm-check">
            <input type="checkbox" checked={viaWa} disabled={!customer.phone} onChange={(e) => setViaWa(e.target.checked)} /> WhatsApp{customer.phone ? ` to ${customer.phone}` : ' (no mobile number on file)'}
          </label>
          <label className="qb-lab">Message (the portal link and button are added for you)</label>
          <textarea className="crm-input" rows={9} value={message} onChange={(e) => setMessage(e.target.value)} />
          <label className="crm-check">
            <input type="checkbox" checked={viaSms} disabled={!customer.phone} onChange={(e) => setViaSms(e.target.checked)} /> Text message with the link{customer.phone ? ` to ${customer.phone}` : ' (no mobile number on file)'}
          </label>
          {viaWa && <p className="crm-small crm-muted">If their 24-hour WhatsApp window is closed, the approved “Quote ready” template goes instead, with its own fixed wording.</p>}
          <div className="crm-actions">
            <button type="button" className="crm-btn crm-btn--solar" disabled={!!busy} onClick={() => void send()}>
              {busy === 'send' ? 'Sending…' : viaEmail || viaWa || viaSms ? 'Send quote' : 'Make the link only'}
            </button>
            <button type="button" className="crm-btn crm-btn--ghost" onClick={() => setComposing(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {sent && (
        <div className="qb-sent">
          <b>{sent.sentVia.email || sent.sentVia.whatsapp || sent.sentVia.sms ? 'Quote sent' : 'Link ready'} ✓</b>
          <p className="crm-small">The job is now at Quote sent. Their link opens the quote to view, accept or query.</p>
          {sent.sentVia.email && <p className="crm-small">{sent.sentVia.email.ok ? `✓ Email sent to ${sent.sentVia.email.to}` : `✗ Email not sent: ${sent.sentVia.email.error}`}</p>}
          {sent.sentVia.whatsapp && <p className="crm-small">{sent.sentVia.whatsapp.ok ? `✓ WhatsApp sent${sent.sentVia.whatsapp.via === 'template' ? ' (as the Quote ready template)' : ''}` : `✗ WhatsApp not sent: ${sent.sentVia.whatsapp.error}`}</p>}
          {sent.sentVia.sms && <p className="crm-small">{sent.sentVia.sms.ok ? `✓ Text sent to ${sent.sentVia.sms.to}` : `✗ Text not sent: ${sent.sentVia.sms.error}`}</p>}
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

      {copyResult && (
        <div className="qb-sent" role="status">
          <b>Copy sent to you{copyResult.live ? '' : ' (the quote hasn’t been sent to the customer yet, so the link opens the PDF preview)'}</b>
          <p className="crm-small">{copyResult.email.ok ? `✓ Email sent to ${copyResult.email.to}` : `✗ Email not sent: ${copyResult.email.error}`}</p>
          <p className="crm-small">{copyResult.sms.ok ? `✓ Text sent to ${copyResult.sms.to}` : `✗ Text not sent: ${copyResult.sms.error}`}</p>
        </div>
      )}
      {askMobile && (
        <Sheet title="Your mobile number" onClose={() => setAskMobile(false)}>
          <p className="crm-small crm-muted">Where should the text copy go? It’s kept against your account, so you’re only asked once.</p>
          <label className="crm-label" htmlFor="qb-mob">
            Mobile
          </label>
          <input id="qb-mob" className="crm-input" type="tel" value={mobileDraft} onChange={(e) => setMobileDraft(e.target.value)} placeholder="07…" autoComplete="tel" autoFocus />
          <div className="crm-actions">
            <button type="button" className="crm-btn crm-btn--solar" disabled={!mobileDraft.trim() || copying} onClick={() => { setAskMobile(false); void sendCopy(mobileDraft); }}>
              Save and send the text
            </button>
            <button type="button" className="crm-btn crm-btn--ghost" onClick={() => setAskMobile(false)}>
              Not now
            </button>
          </div>
        </Sheet>
      )}
      {activity && status !== 'draft' && (
        <section className="qb-card qb-activity" aria-label="What the customer has done">
          <b>Customer activity</b>
          <ul>
            {(() => {
              const t = activity.track;
              const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
              const rows: { done: boolean; label: string; at?: string | null }[] = [
                { done: !!activity.sentAt, label: 'Quote sent', at: activity.sentAt },
                { done: !!t.firstOpenedAt, label: t.firstOpenedAt ? `Opened ${t.opens > 1 ? `(${t.opens} visits, last ${when(t.lastOpenedAt)})` : ''}`.trim() : 'Not opened yet', at: t.firstOpenedAt },
                { done: !!t.pdfViewedAt, label: 'Looked at the quote PDF', at: t.pdfViewedAt },
                { done: !!t.signStartedAt || !!activity.acceptedAt, label: 'Started to accept', at: t.signStartedAt },
                ...(t.declined ? [{ done: true, label: `Declined${t.declined.reason ? `: “${t.declined.reason}”` : ' (no comment)'}`, at: t.declined.at }] : []),
                { done: !!activity.acceptedAt, label: activity.acceptedName ? `Accepted by ${activity.acceptedName}` : 'Accepted', at: activity.acceptedAt },
                { done: !!activity.installPref?.dates?.length, label: activity.installPref?.dates?.length ? `${activity.installPref.provisional ? 'Provisionally booked' : 'Asked for'} installation on ${activity.installPref.dates.map((d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })).join(', ')}` : 'Installation date', at: activity.installPref?.at },
              ];
              return rows.map((r) => (
                <li key={r.label} className={r.done ? 'done' : ''}>
                  <span aria-hidden="true">{r.done ? '✓' : '○'}</span>
                  <span>{r.label}</span>
                  <small>{when(r.at)}</small>
                </li>
              ));
            })()}
          </ul>
        </section>
      )}

      {askFinish && (
        <Sheet title="Finish the quote first?" onClose={() => setAskFinish(false)}>
          <p>
            {introUnwritten && includedUnwritten ? 'The introduction and What is included have not been written yet.' : introUnwritten ? 'The introduction has not been written yet.' : 'What is included has not been written yet.'} Shall I write {introUnwritten && includedUnwritten ? 'them' : 'it'} from your items now?
          </p>
          <div className="crm-actions">
            <button
              type="button"
              className="crm-btn crm-btn--solar"
              onClick={() => {
                setAskFinish(false);
                void generateQuote(false)
                  .then(() => new Promise((r) => setTimeout(r, 120)))
                  .then(() => preview(true));
              }}
            >
              Write it, then preview
            </button>
            <button
              type="button"
              className="crm-btn crm-btn--ghost"
              onClick={() => {
                setAskFinish(false);
                void preview(true);
              }}
            >
              Preview as it is
            </button>
            <button type="button" className="crm-btn crm-btn--ghost" onClick={() => setAskFinish(false)}>
              Cancel
            </button>
          </div>
        </Sheet>
      )}

      {signing && (
        <Sheet title="Your signature" onClose={() => setSigning(false)}>
          <p className="crm-small crm-muted">Drawn once and kept against your profile. It prints under the introduction on your quotes, with your name and role beneath.</p>
          <label className="crm-label" htmlFor="sg-name">
            Name
          </label>
          <input id="sg-name" className="crm-input" value={sigDraft.name} onChange={(e) => setSigDraft({ ...sigDraft, name: e.target.value })} autoComplete="off" />
          <label className="crm-label" htmlFor="sg-role">
            Role (optional)
          </label>
          <input id="sg-role" className="crm-input" value={sigDraft.role} onChange={(e) => setSigDraft({ ...sigDraft, role: e.target.value })} placeholder="e.g. Director" autoComplete="off" />
          <label className="crm-label">Sign here with your finger or mouse</label>
          <SignaturePad onChange={(png) => setSigDraft((d) => ({ ...d, png }))} height={150} />
          <label className="crm-check">
            <input type="checkbox" checked={sigDraft.shared} onChange={(e) => setSigDraft({ ...sigDraft, shared: e.target.checked })} /> Any user with CRM access can sign with my name and signature
          </label>
          <div className="crm-actions">
            <button type="button" className="crm-btn crm-btn--solar" disabled={!sigDraft.name.trim() || !sigDraft.png} onClick={() => void saveSignatory()}>
              Save signature
            </button>
            <button type="button" className="crm-btn crm-btn--ghost" onClick={() => setSigning(false)}>
              Cancel
            </button>
          </div>
        </Sheet>
      )}

      <div className="qb-grid" aria-disabled={locked}>
        <div className="qb-col">
          <section className="qb-card">
            <label className="qb-lab">Quote title</label>
            <input className="crm-input" value={title} onChange={(e) => setTitle(e.target.value)} disabled={locked} />
            <div className="qb-writeit">
              <label className="qb-lab" htmlFor="qb-intro">
                Introduction
              </label>
              <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={locked || writing === 'intro'} onClick={() => void writeIntro()}>
                {writing === 'intro' ? 'Writing…' : 'Write the introduction'}
              </button>
            </div>
            <div className="qb-writewrap">
              <textarea id="qb-intro" className="crm-input" rows={8} value={content.intro} onChange={(e) => edit((c) => ({ ...c, intro: e.target.value }))} disabled={locked} />
              {writing === 'intro' && <WritingSpark />}
            </div>
            <div className="qb-sigrow">
              {sigs && (sigs.mine || sigs.shared.length > 0) && (
                <>
                  {signer && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={signer.png} alt={`Signature of ${signer.name}`} className="qb-sigimg" />
                  )}
                  <label className="qb-sigsel">
                    <span className="crm-small crm-muted">Signed by</span>
                    <select className="crm-input" value={content.signerId ?? ''} disabled={locked} onChange={(e) => edit((c) => ({ ...c, signerId: e.target.value || undefined }))} aria-label="Who signs the introduction">
                      <option value="">No signature</option>
                      {sigs.mine && <option value={sigs.meId}>{sigs.mine.name} (you)</option>}
                      {sigs.shared.map((x) => (
                        <option key={x.userId} value={x.userId}>
                          {x.name}
                          {x.role ? `, ${x.role}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="crm-check">
                    <input type="checkbox" checked={content.signOff !== false} disabled={locked} onChange={(e) => edit((c) => ({ ...c, signOff: e.target.checked ? undefined : false }))} /> Sign the introduction
                  </label>
                </>
              )}
              {sigs && (
                <button
                  type="button"
                  className="crm-btn crm-btn--ghost crm-btn--small"
                  onClick={() => {
                    setSigDraft({ name: sigs.mine?.name ?? '', role: sigs.mine?.role ?? '', png: null, shared: sigs.mine?.shared ?? false });
                    setSigning(true);
                  }}
                >
                  {sigs.mine ? 'Change my signature' : 'Add my signature'}
                </button>
              )}
            </div>
          </section>

          <section className="qb-card qb-proposal">
            <label className="qb-lab">Design proposal (optional)</label>
            {content.proposal ? (
              <>
                <p className="crm-small crm-muted">
                  Read from <b>{content.proposal.file}</b>. The cover shows these figures as System at a glance, and the writing uses them.
                </p>
                {content.proposal.options.map((o, k) => (
                  <label key={k} className={`crm-check qb-opt${content.proposal!.chosen === k ? ' on' : ''}`}>
                    <input type="radio" name="qb-opt" checked={content.proposal!.chosen === k} disabled={locked} onChange={() => edit((c) => (c.proposal ? { ...c, proposal: { ...c.proposal, chosen: k } } : c))} />
                    <span>
                      <b>{o.name || `Option ${k + 1}`}</b>
                      <small>
                        {[o.systemKwp ? `${o.systemKwp} kWp` : '', o.panelCount ? `${o.panelCount} panels` : '', o.inverterModel, o.batteryUsableKwh ? `${o.batteryUsableKwh} kWh battery` : '', o.annualGenerationKwh ? `${o.annualGenerationKwh.toLocaleString('en-GB')} kWh a year` : ''].filter(Boolean).join(' · ')}
                      </small>
                    </span>
                  </label>
                ))}
                <label className="crm-check">
                  <input type="checkbox" checked={content.proposal.showFinancials} disabled={locked} onChange={(e) => edit((c) => (c.proposal ? { ...c, proposal: { ...c.proposal, showFinancials: e.target.checked } } : c))} /> Show the estimated annual saving and payback on the cover (these are the proposal’s own assumptions)
                </label>
                <div className="crm-actions">
                  <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={locked} onClick={() => edit((c) => ({ ...c, proposal: undefined }))}>
                    Remove the proposal
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="crm-small crm-muted">Upload the OpenSolar proposal (PDF) and the cover gets a System at a glance box, and the introduction and What is included are written from its figures and warranties.</p>
                <div>
                  <FileButton label={reading ? 'Reading the proposal…' : 'Upload the OpenSolar proposal (PDF)'} accept="application/pdf" disabled={locked} busy={reading} onFiles={(f) => void readProposal(f[0])} />
                </div>
              </>
            )}
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

              {b.type === 'text' && (
                <>
                  {/includ/i.test(b.heading) && (
                    <>
                    <div className="qb-writeit">
                      <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={locked || writing === b.id} onClick={() => setAsking(asking === b.id ? '' : b.id)}>
                        {writing === b.id ? 'Writing…' : 'Write from the quote'}
                      </button>
                      <small className="crm-muted">Reads your items and writes this section in formal wording.</small>
                    </div>
                    {asking === b.id && (
                      <div className="qb-ask">
                        <b>A few questions first</b>
                        <label className="crm-check">
                          <input type="checkbox" checked={ask.ancillaries} onChange={(e) => setAsk({ ...ask, ancillaries: e.target.checked })} /> Includes the supply and installation of all electrical ancillaries
                        </label>
                        <label className="crm-check">
                          <input type="checkbox" checked={ask.access} onChange={(e) => setAsk({ ...ask, access: e.target.checked })} /> Includes access equipment to complete the works (scaffold, towers)
                        </label>
                        <label className="crm-check">
                          <input type="checkbox" checked={ask.handover} onChange={(e) => setAsk({ ...ask, handover: e.target.checked })} /> Includes all handover documentation
                        </label>
                        <label className="crm-check">
                          <input type="checkbox" checked={ask.compliance} onChange={(e) => setAsk({ ...ask, compliance: e.target.checked })} /> States the works comply with BS 7671 and any other applicable standards
                        </label>
                        <label className="qb-lab" htmlFor="qb-keypts">
                          Key selling points to mention (optional)
                        </label>
                        <textarea id="qb-keypts" className="crm-input" rows={3} value={ask.keyPoints} onChange={(e) => setAsk({ ...ask, keyPoints: e.target.value })} placeholder="e.g. battery: 10-year warranty, backup power in a cut. Inverter: IP66, 98% efficient. Only what you can stand behind: nothing is added that isn’t here or in an item’s detail." />
                        <div className="crm-actions">
                          <button type="button" className="crm-btn crm-btn--solar crm-btn--small" onClick={() => void writeIncluded(b.id)}>
                            Write it
                          </button>
                          <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => setAsking('')}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                    </>
                  )}
                  <div className="qb-writewrap">
                    <textarea className="crm-input" rows={6} placeholder="Write the text. A blank line starts a new paragraph." value={b.body} onChange={(e) => setBlock(b.id, { body: e.target.value })} disabled={locked} />
                    {writing === b.id && <WritingSpark />}
                  </div>
                </>
              )}

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
                      const handle = (
                        <span
                          className="qb-grip"
                          draggable={!locked}
                          role="img"
                          aria-label="Drag to move this line"
                          title="Drag to move"
                          onDragStart={(e) => {
                            drag.current = { bid: b.id, lid: l.id };
                            e.dataTransfer.effectAllowed = 'move';
                            e.dataTransfer.setData('text/plain', l.id);
                            const row = (e.currentTarget as HTMLElement).closest('.qb-line');
                            if (row) e.dataTransfer.setDragImage(row, 12, 12);
                          }}
                          onDragEnd={() => {
                            drag.current = null;
                            setOver(null);
                          }}
                        >
                          ⠿
                        </span>
                      );
                      const dropProps = {
                        onDragOver: (e: React.DragEvent) => {
                          if (!drag.current) return;
                          e.preventDefault();
                          setOver(l.id);
                        },
                        onDrop: (e: React.DragEvent) => {
                          e.preventDefault();
                          moveLine(b.id, l.id);
                        },
                      };
                      if (l.text) {
                        return (
                          <div key={l.id} className={`qb-line qb-line--text${over === l.id ? ' is-over' : ''}`} {...dropProps}>
                            {handle}
                            <textarea className="crm-input qb-textline" rows={1} placeholder="Text between items, e.g. Battery storage" value={l.description} onChange={(e) => setLine(b.id, l.id, { description: e.target.value })} disabled={locked} aria-label="Text" />
                            <button type="button" className="qb-icon" aria-label="Remove text" disabled={locked} onClick={() => edit((c) => ({ ...c, blocks: c.blocks.map((x) => (x.id === b.id && x.type === 'items' ? { ...x, lines: x.lines.filter((y) => y.id !== l.id) } : x)) }))}>
                              ✕
                            </button>
                          </div>
                        );
                      }
                      const profit = lineProfit(l);
                      const sell = lineNet(l);
                      const showMore = !!l.detail || moreOpen.has(l.id);
                      return (
                        <div key={l.id} className={`qb-line${l.internal ? ' is-internal' : ''}${over === l.id ? ' is-over' : ''}`} {...dropProps}>
                          {handle}
                          <div className="qb-desc">
                            <input className="crm-input" placeholder="e.g. 12 × 450W solar panels" value={l.description} onChange={(e) => setLine(b.id, l.id, { description: e.target.value })} disabled={locked} aria-label="Description" />
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
                          <div className="qb-sub">
                            {showMore && <textarea className="crm-input qb-detail" rows={2} placeholder="Detail: shown as a smaller paragraph under the item name" value={l.detail ?? ''} onChange={(e) => setLine(b.id, l.id, { detail: e.target.value })} disabled={locked} aria-label="Detail" />}
                            <div className="qb-linemeta">
                              {!showMore && (
                                <button type="button" className="crm-link qb-saveitem qb-more" disabled={locked} onClick={() => setMoreOpen((m) => new Set(m).add(l.id))}>
                                  + detail
                                </button>
                              )}
                              <label className="crm-check qb-internal" title="Not shown on the quote: our cost only">
                                <input type="checkbox" checked={!!l.internal} disabled={locked} onChange={(e) => setLine(b.id, l.id, { internal: e.target.checked })} /> Internal only
                              </label>
                              {(l.cost_pence > 0 || sell > 0) && !l.internal && (
                                <span className={`qb-profit${profit < 0 || (minMarginPct > 0 && sell > 0 && (profit / sell) * 100 < minMarginPct) ? ' neg' : ''}`} title={minMarginPct > 0 && sell > 0 && (profit / sell) * 100 < minMarginPct ? `Below your ${minMarginPct}% margin target` : 'Profit on this line (internal)'}>
                                  Profit {money(profit)}{sell > 0 ? ` · ${pct((profit / sell) * 100)}` : ''}
                                </span>
                              )}
                              {l.description.trim() && !saved.some((x) => x.description === l.description && x.unit_pence === l.unit_pence && x.cost_pence === l.cost_pence) && (
                                <button type="button" className="crm-link qb-saveitem" title="Save as a saved item" disabled={locked} onClick={() => saveLineAsItem(l)}>
                                  Save item
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {/* Drop here to put a dragged line last. */}
                    <div
                      className={`qb-droptail${over === `tail-${b.id}` ? ' is-over' : ''}`}
                      onDragOver={(e) => {
                        if (!drag.current) return;
                        e.preventDefault();
                        setOver(`tail-${b.id}`);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        moveLine(b.id, null);
                      }}
                    />
                  </div>
                  <div className="qb-addrow">
                    <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={locked} onClick={() => addTo(b.id, (last) => emptyLine(last))}>
                      + Add a line
                    </button>
                    <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={locked} onClick={() => addTo(b.id, () => emptyText())}>
                      + Add text
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
            <label className="qb-lab">Terms and conditions (printed at the end of the quote, just before the acceptance)</label>
            <textarea className="crm-input" rows={14} value={content.terms} onChange={(e) => edit((c) => ({ ...c, terms: e.target.value }))} disabled={locked} />
            <div className="qb-writeit">
              <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={locked} onClick={() => (!content.terms.trim() || window.confirm('Replace the terms with the standard Heliaxis terms and conditions?')) && edit((c) => ({ ...c, terms: DEFAULT_TERMS }))}>
                Use the standard terms
              </button>
              <small className="crm-muted">Covers positions and fire routes, pre-existing faults, maintenance, access, regulations, estimates, payment, cancellation, warranties and liability. Edit freely.</small>
            </div>
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
            {lowMargin && <p className="crm-small qb-warn">Margin is {pct(prof.marginPct)}, below your {minMarginPct}% target.</p>}
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
