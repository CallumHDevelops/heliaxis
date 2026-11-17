'use client';

import { useState } from 'react';
import { Sheet } from '../crm/CrmUi';
import '../crm/crm.css';
import { BUILD_AREAS, BUILD_STATUSES, buildPrompt, cleanBuild, progress, promptFileName, STARTER_BRIEFS, type BuildArea, type BuildItem, type BuildStatus } from '@/lib/builds';
import { remove, save } from './actions';

const when = (iso: string) => {
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 14 ? `${d} days ago` : new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

const blank = (status: BuildStatus = 'next'): Partial<BuildItem> => ({ title: '', area: 'HAP', status, summary: '', next: '', waitingOn: '', checklist: [], links: [], brief: '' });

/** Columns by status; click a card to see and change everything about it. */
export function BuildBoard({ initial }: { initial: BuildItem[] }) {
  const [items, setItems] = useState(initial);
  const [area, setArea] = useState<'' | BuildArea>('');
  const [editing, setEditing] = useState<Partial<BuildItem> | null>(null);
  const [showDone, setShowDone] = useState(false);
  const list = items.filter((i) => !area || i.area === area);

  function saved(item: BuildItem) {
    setItems((xs) => [item, ...xs.filter((x) => x.id !== item.id)]);
    setEditing(null);
  }

  return (
    <>
      <div className="bt-bar">
        <button type="button" className="crm-btn crm-btn--solar" onClick={() => setEditing(blank())}>
          Add a piece of work
        </button>
        <label className="bt-filter">
          <span>Area</span>
          <select className="crm-input" value={area} onChange={(e) => setArea(e.target.value as '' | BuildArea)}>
            <option value="">Everything</option>
            {BUILD_AREAS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="bt-board">
        {BUILD_STATUSES.map((s) => {
          const col = list.filter((i) => i.status === s.key);
          const hidden = s.key === 'done' && !showDone;
          return (
            <section key={s.key} className={`bt-col bt-col--${s.key}`} aria-labelledby={`bt-${s.key}`}>
              <header>
                <h2 id={`bt-${s.key}`}>{s.label}</h2>
                <span className="bt-count">{col.length}</span>
              </header>
              {hidden ? (
                col.length > 0 && (
                  <button type="button" className="crm-link" onClick={() => setShowDone(true)}>
                    Show {col.length} finished
                  </button>
                )
              ) : col.length === 0 ? (
                <p className="bt-empty">Nothing here.</p>
              ) : (
                col.map((i) => <Card key={i.id} item={i} onOpen={() => setEditing(i)} />)
              )}
            </section>
          );
        })}
      </div>

      {editing && <Editor item={editing} onClose={() => setEditing(null)} onSaved={saved} onDeleted={(id) => { setItems((xs) => xs.filter((x) => x.id !== id)); setEditing(null); }} />}
    </>
  );
}

function Card({ item, onOpen }: { item: BuildItem; onOpen: () => void }) {
  const pct = progress(item);
  return (
    <button type="button" className="bt-card" onClick={onOpen}>
      <span className="bt-area">{item.area}</span>
      <b>{item.title}</b>
      {item.next && (
        <span className="bt-next">
          <small>Next</small> {item.next}
        </span>
      )}
      {item.waitingOn && (
        <span className="bt-wait">
          <small>Waiting on</small> {item.waitingOn}
        </span>
      )}
      {pct !== null && (
        <span className="bt-prog" aria-label={`${pct}% of the checklist done`}>
          <span style={{ width: `${pct}%` }} />
        </span>
      )}
      <small className="bt-when">Updated {when(item.updatedAt)}</small>
    </button>
  );
}

function Editor({ item, onClose, onSaved, onDeleted }: { item: Partial<BuildItem>; onClose: () => void; onSaved: (b: BuildItem) => void; onDeleted: (id: string) => void }) {
  const [v, setV] = useState<Partial<BuildItem>>(() => ({ ...item, brief: item.brief || (item.id ? STARTER_BRIEFS[item.id] : '') || '' }));
  const [copied, setCopied] = useState(false);
  const [newCheck, setNewCheck] = useState('');
  const [newLink, setNewLink] = useState({ label: '', href: '' });
  const [busy, setBusy] = useState<'' | 'save' | 'delete'>('');
  const [err, setErr] = useState('');
  const set = <K extends keyof BuildItem>(k: K, val: BuildItem[K]) => setV((x) => ({ ...x, [k]: val }));
  const checklist = v.checklist ?? [];
  const links = v.links ?? [];

  async function doSave() {
    if (!v.title?.trim()) return setErr('Give it a name.');
    setBusy('save');
    setErr('');
    // A checklist line or link typed but not added yet is kept.
    const extraCheck = newCheck.trim() ? [{ text: newCheck.trim(), done: false }] : [];
    const extraLink = newLink.href.trim() ? [{ label: newLink.label.trim() || newLink.href.trim(), href: newLink.href.trim() }] : [];
    const r = await save({ ...v, checklist: [...checklist, ...extraCheck], links: [...links, ...extraLink] });
    setBusy('');
    if (!r.ok) return setErr(r.error);
    onSaved(r.item);
  }

  /** The prompt as the item stands on screen now (including changes not saved yet). */
  const prompt = () => buildPrompt(cleanBuild({ ...v, id: v.id || 'new' }));

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setErr('Your browser blocked copying: use Download prompt instead.');
    }
  }

  function downloadPrompt() {
    const blob = new Blob([prompt()], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = promptFileName(cleanBuild({ ...v, id: v.id || 'new' }));
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function doDelete() {
    if (!v.id || !window.confirm(`Delete “${v.title}” from the tracker? This can’t be undone.`)) return;
    setBusy('delete');
    const r = await remove(v.id);
    setBusy('');
    if (!r.ok) return setErr(r.error || 'Couldn’t delete it.');
    onDeleted(v.id);
  }

  return (
    <Sheet title={v.id ? 'Piece of work' : 'Add a piece of work'} onClose={onClose} wide>
      <div className="bt-form">
        <label className="bt-full">
          <span>Name</span>
          <input className="crm-input" value={v.title ?? ''} onChange={(e) => set('title', e.target.value)} placeholder="SEO dashboard" autoFocus={!v.id} />
        </label>
        <label>
          <span>Status</span>
          <select className="crm-input" value={v.status} onChange={(e) => set('status', e.target.value as BuildStatus)}>
            {BUILD_STATUSES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Area</span>
          <select className="crm-input" value={v.area} onChange={(e) => set('area', e.target.value as BuildArea)}>
            {BUILD_AREAS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
        <label className="bt-full">
          <span>Where it stands</span>
          <textarea className="crm-input" rows={3} value={v.summary ?? ''} onChange={(e) => set('summary', e.target.value)} />
        </label>
        <label className="bt-full">
          <span>Next step</span>
          <input className="crm-input" value={v.next ?? ''} onChange={(e) => set('next', e.target.value)} placeholder="The very next thing to do when you pick it up" />
        </label>
        <label className="bt-full">
          <span>Waiting on</span>
          <input className="crm-input" value={v.waitingOn ?? ''} onChange={(e) => set('waitingOn', e.target.value)} placeholder="A decision, a person, a fact (leave empty if nothing)" />
        </label>

        <label className="bt-full">
          <span>Background for whoever picks it up (goes into its prompt)</span>
          <textarea className="crm-input" rows={4} value={v.brief ?? ''} onChange={(e) => set('brief', e.target.value)} placeholder="Key files, facts, decisions made so far" />
        </label>

        <fieldset className="bt-full bt-check">
          <legend>Checklist</legend>
          {checklist.map((c, i) => (
            <div key={i} className="bt-checkrow">
              <label>
                <input type="checkbox" checked={c.done} onChange={(e) => set('checklist', checklist.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)))} />
                <span className={c.done ? 'is-done' : ''}>{c.text}</span>
              </label>
              <button type="button" className="crm-link" onClick={() => set('checklist', checklist.filter((_, j) => j !== i))} aria-label={`Remove “${c.text}”`}>
                Remove
              </button>
            </div>
          ))}
          <div className="bt-add">
            <input
              className="crm-input"
              value={newCheck}
              onChange={(e) => setNewCheck(e.target.value)}
              placeholder="Add a step"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newCheck.trim()) {
                  e.preventDefault();
                  set('checklist', [...checklist, { text: newCheck.trim(), done: false }]);
                  setNewCheck('');
                }
              }}
            />
            <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={!newCheck.trim()} onClick={() => { set('checklist', [...checklist, { text: newCheck.trim(), done: false }]); setNewCheck(''); }}>
              Add
            </button>
          </div>
        </fieldset>

        <fieldset className="bt-full bt-check">
          <legend>Links</legend>
          {links.map((l, i) => (
            <div key={i} className="bt-checkrow">
              <a href={l.href} target={l.href.startsWith('/') ? undefined : '_blank'} rel="noreferrer" className="crm-link">
                {l.label || l.href}
              </a>
              <button type="button" className="crm-link" onClick={() => set('links', links.filter((_, j) => j !== i))} aria-label={`Remove link ${l.label}`}>
                Remove
              </button>
            </div>
          ))}
          <div className="bt-add bt-add--link">
            <input className="crm-input" value={newLink.label} onChange={(e) => setNewLink((x) => ({ ...x, label: e.target.value }))} placeholder="Label" />
            <input className="crm-input" value={newLink.href} onChange={(e) => setNewLink((x) => ({ ...x, href: e.target.value }))} placeholder="/admin/… or https://…" />
            <button
              type="button"
              className="crm-btn crm-btn--ghost crm-btn--small"
              disabled={!newLink.href.trim()}
              onClick={() => { set('links', [...links, { label: newLink.label.trim() || newLink.href.trim(), href: newLink.href.trim() }]); setNewLink({ label: '', href: '' }); }}
            >
              Add
            </button>
          </div>
        </fieldset>

        {err && <p className="crm-banner crm-banner--err bt-full">{err}</p>}
        <div className="crm-actions bt-full">
          <button type="button" className="crm-btn crm-btn--solar" disabled={!!busy} onClick={() => void doSave()}>
            {busy === 'save' ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="crm-btn crm-btn--ghost" disabled={!!busy} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="crm-btn crm-btn--ghost" disabled={!v.title?.trim()} onClick={() => void copyPrompt()}>
            {copied ? 'Copied' : 'Copy prompt'}
          </button>
          <button type="button" className="crm-btn crm-btn--ghost" disabled={!v.title?.trim()} onClick={downloadPrompt}>
            Download prompt
          </button>
          {v.id && (
            <button type="button" className="crm-btn crm-btn--ghost bt-del" disabled={!!busy} onClick={() => void doDelete()}>
              {busy === 'delete' ? 'Deleting…' : 'Delete'}
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
