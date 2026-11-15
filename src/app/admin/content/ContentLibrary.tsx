'use client';

import { useCallback, useEffect, useState } from 'react';
import { AssignPicker, type Picked } from '@/components/admin/AssignPicker';
import { addPhotos } from '@/lib/crm/photo-queue';
import { CONTENT_CATEGORIES, CONTENT_LABEL, type ContentPhoto } from '@/lib/content/shared';
import { FileButton, Sheet } from '../crm/CrmUi';
import '../crm/crm.css';
import './content.css';

const PRODUCTS: [string, string][] = [['solar', 'Solar'], ['battery', 'Battery'], ['heatpump', 'Heat pump'], ['ev', 'EV charger']];
const productWords = (p: string[]) => p.map((x) => PRODUCTS.find(([k]) => k === x)?.[1] ?? x).join(' + ');

/** The photos of our work the content team can use. They see the job's reference, what was installed, the size and the postcode district: never the customer. */
export function ContentLibrary({ manage }: { manage: boolean }) {
  const [photos, setPhotos] = useState<ContentPhoto[] | null>(null);
  const [cat, setCat] = useState('');
  const [product, setProduct] = useState('');
  const [more, setMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<ContentPhoto | null>(null);
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState('');

  const load = useCallback(
    async (reset: boolean, before?: string) => {
      setLoading(true);
      const q = new URLSearchParams();
      if (cat) q.set('category', cat);
      if (product) q.set('product', product);
      if (before) q.set('before', before);
      const r = await fetch(`/api/content/photos?${q}`, { cache: 'no-store' });
      const d = await r.json().catch(() => ({}));
      setLoading(false);
      if (!r.ok) return;
      const got = (d.photos ?? []) as ContentPhoto[];
      setMore(got.length >= 60);
      setPhotos((p) => (reset || !p ? got : [...p, ...got]));
    },
    [cat, product]
  );
  useEffect(() => {
    let live = true;
    const q = new URLSearchParams();
    if (cat) q.set('category', cat);
    if (product) q.set('product', product);
    fetch(`/api/content/photos?${q}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!live || !d) return;
        const got = (d.photos ?? []) as ContentPhoto[];
        setMore(got.length >= 60);
        setPhotos(got);
      })
      .catch(() => null);
    return () => {
      live = false;
    };
  }, [cat, product]);

  async function hide(p: ContentPhoto) {
    await fetch(`/api/content/photos/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hidden: true }) });
    setPhotos((l) => (l ?? []).filter((x) => x.id !== p.id));
    setOpen(null);
  }
  async function stop(p: ContentPhoto) {
    if (!window.confirm(`Stop sharing all of ${p.ref ?? 'this project'}’s photos with the content team?`)) return;
    await fetch(`/api/content/projects/${p.project_id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content_ok: false }) });
    setPhotos((l) => (l ?? []).filter((x) => x.project_id !== p.project_id));
    setOpen(null);
  }
  async function copy(p: ContentPhoto) {
    try {
      await navigator.clipboard.writeText(p.url ?? '');
      setNote('Link copied. It works for an hour.');
    } catch {
      window.prompt('Copy this link', p.url ?? '');
    }
  }

  return (
    <div className="cl-page">
      <header className="cl-head">
        <div>
          <h1>Content library</h1>
          <p className="crm-muted">Photos of our work for social media and the website. Every project’s site, progress and finished photos are here as soon as they are uploaded. Survey photos are never shared, and you only see the job reference, what was installed and the area, not the customer.</p>
        </div>
        {manage && (
          <button type="button" className="crm-btn crm-btn--solar" onClick={() => setAdding(true)}>
            + Add photos to a project
          </button>
        )}
      </header>
      <div className="cl-filters">
        <div className="cl-seg" role="group" aria-label="Type">
          <button type="button" className={!cat ? 'on' : ''} onClick={() => setCat('')}>All</button>
          {CONTENT_CATEGORIES.map((c) => (
            <button key={c} type="button" className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>
              {CONTENT_LABEL[c]}
            </button>
          ))}
        </div>
        <div className="cl-seg" role="group" aria-label="What was installed">
          <button type="button" className={!product ? 'on' : ''} onClick={() => setProduct('')}>Everything</button>
          {PRODUCTS.map(([k, l]) => (
            <button key={k} type="button" className={product === k ? 'on' : ''} onClick={() => setProduct(k)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {note && <p className="crm-banner" role="status">{note}</p>}
      {photos && photos.length === 0 && <p className="cl-empty">No photos here yet. Photos taken on site and uploaded to a project appear here automatically.</p>}
      {photos && photos.length > 0 && (
        <ul className="cl-grid">
          {photos.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => setOpen(p)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.thumb ? <img src={p.thumb} alt={`${p.ref ?? 'Project'} ${CONTENT_LABEL[p.category] ?? ''}`} loading="lazy" /> : <span className="cl-nopic">No preview</span>}
                <span className="cl-tag">
                  {p.ref ?? 'Project'}
                  {p.kwp ? ` · ${p.kwp} kWp` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {photos && more && photos.length > 0 && (
        <button type="button" className="crm-btn crm-btn--ghost" disabled={loading} onClick={() => void load(false, photos[photos.length - 1].created_at)}>
          {loading ? 'Loading…' : 'Show more'}
        </button>
      )}
      {open && (
        <Sheet title={`${open.ref ?? 'Project'}${open.area ? ` · ${open.area}` : ''}`} onClose={() => setOpen(null)}>
          <div className="cl-view">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {open.url && <img src={open.url} alt={open.caption || `${open.ref ?? 'Project'} ${CONTENT_LABEL[open.category] ?? ''}`} />}
            <p className="cl-meta">
              {[CONTENT_LABEL[open.category], productWords(open.products), open.kwp ? `${open.kwp} kWp` : '', open.area, open.taken_at ? new Date(open.taken_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''].filter(Boolean).join(' · ')}
            </p>
            {open.caption && <p>{open.caption}</p>}
            <div className="crm-actions" style={{ flexWrap: 'wrap' }}>
              {open.url && (
                <a className="crm-btn crm-btn--solar" href={open.url} download target="_blank" rel="noreferrer">
                  Download
                </a>
              )}
              <button type="button" className="crm-btn crm-btn--ghost" onClick={() => void copy(open)}>
                Copy link
              </button>
              {manage && (
                <>
                  <button type="button" className="crm-link" onClick={() => void hide(open)}>
                    Hide this photo
                  </button>
                  <button type="button" className="crm-link" onClick={() => void stop(open)}>
                    Stop sharing this project
                  </button>
                </>
              )}
            </div>
            <small className="crm-muted">Use these to show our work. Check there is no customer name, house number or number plate showing before you post.</small>
          </div>
        </Sheet>
      )}
      {adding && <AddPhotos onClose={() => setAdding(false)} onDone={() => { setAdding(false); setNote('Uploading. The photos appear here once they are up.'); setTimeout(() => void load(true), 5000); }} />}
    </div>
  );
}

/** Add photos to a project from here: pick the job, the type, then the files. They are filed on the project like any other photo, and shared by default. */
function AddPhotos({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [who, setWho] = useState<Picked | null>(null);
  const [cat, setCat] = useState<string>('completion');
  const [busy, setBusy] = useState(false);
  async function go(files: File[]) {
    if (!who?.project_id || !files.length) return;
    setBusy(true);
    try {
      const dt = new DataTransfer();
      files.forEach((f) => dt.items.add(f));
      await addPhotos(who.project_id, cat, dt.files);
      onDone();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet title="Add photos to a project" onClose={onClose}>
      <div className="cl-add">
        <div className="cl-lab">Which job?</div>
        {who ? (
          <div className="cl-who">
            <b>{who.label}</b>
            <button type="button" className="crm-link" onClick={() => setWho(null)}>
              Change
            </button>
          </div>
        ) : (
          <AssignPicker onPick={setWho} />
        )}
        {who && !who.project_id && <p className="crm-banner crm-banner--err">That is a customer, not a job. Pick one of their jobs (the indented lines).</p>}
        <div className="cl-lab">What are they?</div>
        <select className="crm-input" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Photo type">
          {CONTENT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CONTENT_LABEL[c]}
            </option>
          ))}
        </select>
        <div className="crm-actions">
          <FileButton label={busy ? 'Adding…' : 'Choose photos'} accept="image/*" multiple busy={busy} disabled={!who?.project_id} onFiles={(f) => void go(f)} variant="solar" />
        </div>
        <small className="crm-muted">They are filed on the project’s Photos tab and shared with the content team.</small>
      </div>
    </Sheet>
  );
}
