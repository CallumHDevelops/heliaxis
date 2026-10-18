'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addPhotos, queued, QUEUE_CHANGED, uploadQueued, watchQueue } from '@/lib/crm/photo-queue';
import {
  ACTIVITY_KINDS,
  ACTIVITY_LABEL,
  money,
  PHOTO_CATEGORIES,
  photoLabel,
  PRODUCTS,
  STAGES,
  stageLabel,
} from '@/lib/crm/stages';
import '../crm.css';

type Project = {
  id: string;
  enquiry_id: string;
  title: string;
  stage: string;
  products: string[];
  value: number | null;
  owner_id: string | null;
  address: string | null;
  postcode: string | null;
  survey_at: string | null;
  install_at: string | null;
  simpliheat_url: string | null;
  opensolar_url: string | null;
  lost_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};
type Customer = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  postcode: string | null;
  interest: string | null;
  source: string;
  wa_id: string | null;
  wa_unread: number;
};
type Entry = { id: string; kind: string; body: string | null; meta: Record<string, unknown> | null; by: string | null; at: string };
type Photo = { id: string; category: string; caption: string | null; url: string | null; thumb: string | null; by: string; created_at: string };

const ICON: Record<string, string> = {
  note: '📝',
  call: '📞',
  visit: '🏠',
  email: '✉️',
  stage: '➜',
  photo: '📷',
  system: '•',
  whatsapp: '💬',
};

function when(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `Today ${time}`;
  if (d.toDateString() === new Date(Date.now() - 86_400_000).toDateString()) return `Yesterday ${time}`;
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' })} ${time}`;
}
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export function ProjectView({ id, isAdmin }: { id: string; isAdmin: boolean }) {
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [timeline, setTimeline] = useState<Entry[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [team, setTeam] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'timeline' | 'photos' | 'details'>('timeline');

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/crm/projects/${id}`, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not load this project');
      setProject(d.project);
      setCustomer(d.customer);
      setTimeline(d.timeline);
      setPhotos(d.photos);
      setTeam(d.team);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this project');
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  async function patch(body: Partial<Project>) {
    setError('');
    const r = await fetch(`/api/crm/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(d.error || 'Not saved');
      return false;
    }
    await load();
    return true;
  }

  if (!project || !customer) {
    return (
      <div className="crm">
        <Link href="/admin/crm" className="crm-back">
          ← Projects
        </Link>
        <p className={error ? 'crm-banner crm-banner--err' : 'crm-muted'}>{error || 'Loading…'}</p>
      </div>
    );
  }

  const phone = customer.phone?.replace(/\s/g, '');
  const where = project.address || project.postcode || customer.postcode;

  return (
    <div className="crm crm-project">
      <Link href="/admin/crm" className="crm-back">
        ← Projects
      </Link>
      <div className="crm-ptitle">
        <h1>{project.title}</h1>
        <p>
          {customer.name}
          {where ? ` · ${where}` : ''}
          {project.value ? ` · ${money(project.value)}` : ''}
        </p>
      </div>

      <label className="crm-stage-pick">
        <span>Stage</span>
        <select value={project.stage} onChange={(e) => patch({ stage: e.target.value })} className={`st-${project.stage}`}>
          {STAGES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <div className="crm-quick">
        {phone && (
          <a href={`tel:${phone}`}>
            <span aria-hidden="true">📞</span>Call
          </a>
        )}
        {phone && (
          <Link href={`/admin/enquiries/inbox/${customer.id}`}>
            <span aria-hidden="true">💬</span>WhatsApp
            {customer.wa_unread ? <i className="crm-quick-badge">{customer.wa_unread}</i> : null}
          </Link>
        )}
        {customer.email && (
          <a href={`mailto:${customer.email}`}>
            <span aria-hidden="true">✉️</span>Email
          </a>
        )}
        {where && (
          <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(where)}`} target="_blank" rel="noreferrer">
            <span aria-hidden="true">📍</span>Map
          </a>
        )}
      </div>

      {error && <p className="crm-banner crm-banner--err">{error}</p>}

      <div className="crm-tabs" role="tablist">
        {(
          [
            ['timeline', 'Timeline'],
            ['photos', `Photos${photos.length ? ` (${photos.length})` : ''}`],
            ['details', 'Details'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'timeline' && <Timeline id={id} entries={timeline} onSaved={load} />}
      {tab === 'photos' && <Photos id={id} photos={photos} onChanged={load} />}
      {tab === 'details' && (
        <Details
          key={project.id}
          project={project}
          customer={customer}
          team={team}
          onSave={patch}
          isAdmin={isAdmin}
          onDelete={async () => {
            if (!confirm('Delete this project, its timeline entries and photos? This can’t be undone.')) return;
            const r = await fetch(`/api/crm/projects/${id}`, { method: 'DELETE' });
            if (r.ok) router.push('/admin/crm');
            else setError((await r.json().catch(() => ({}))).error || 'Not deleted');
          }}
        />
      )}
    </div>
  );
}

function Timeline({ id, entries, onSaved }: { id: string; entries: Entry[]; onSaved: () => Promise<void> }) {
  const [kind, setKind] = useState<(typeof ACTIVITY_KINDS)[number]>('note');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function save() {
    setBusy(true);
    setErr('');
    const r = await fetch(`/api/crm/projects/${id}/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, body }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(d.error || 'Not saved');
    setBody('');
    await onSaved();
  }
  const placeholder: Record<string, string> = {
    note: 'Add a note…',
    call: 'What was said on the call?',
    visit: 'How did the visit go?',
    email: 'What was the email about?',
  };
  return (
    <div>
      <div className="crm-compose">
        <div className="crm-seg">
          {ACTIVITY_KINDS.map((k) => (
            <button key={k} type="button" className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
              {ICON[k]} {ACTIVITY_LABEL[k]}
            </button>
          ))}
        </div>
        <textarea className="crm-input" rows={3} placeholder={placeholder[kind]} value={body} onChange={(e) => setBody(e.target.value)} />
        {err && <p className="crm-banner crm-banner--err">{err}</p>}
        <button type="button" className="crm-btn crm-btn--solar" disabled={busy || !body.trim()} onClick={save}>
          {busy ? 'Saving…' : `Log ${ACTIVITY_LABEL[kind].toLowerCase()}`}
        </button>
      </div>
      {entries.length === 0 ? (
        <p className="crm-muted">Nothing logged yet.</p>
      ) : (
        <ol className="crm-timeline">
          {entries.map((e) => (
            <li key={e.id} className={`k-${e.kind}${e.kind === 'whatsapp' && e.meta?.direction === 'in' ? ' in' : ''}`}>
              <span className="crm-tl-icon" aria-hidden="true">
                {ICON[e.kind] || '•'}
              </span>
              <div className="crm-tl-body">
                <div className="crm-tl-meta">
                  <b>{ACTIVITY_LABEL[e.kind] || e.kind}</b>
                  {e.by ? ` · ${e.by}` : ''} · {when(e.at)}
                </div>
                {e.body && <p>{e.body}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Photos({ id, photos, onChanged }: { id: string; photos: Photo[]; onChanged: () => Promise<void> }) {
  const [cat, setCat] = useState<string>('all');
  const [waiting, setWaiting] = useState(0);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Photo | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLInputElement>(null);
  const target = cat === 'all' ? 'site' : cat;

  const refreshQueue = useCallback(async () => {
    const q = await queued().catch(() => []);
    setWaiting(q.filter((p) => p.projectId === id).length);
  }, [id]);

  useEffect(() => {
    const stop = watchQueue();
    let before = -1;
    const onQ = async () => {
      const q = await queued().catch(() => []);
      const n = q.filter((p) => p.projectId === id).length;
      setWaiting(n);
      if (before > n) void onChanged(); // something finished uploading
      before = n;
    };
    window.addEventListener(QUEUE_CHANGED, onQ);
    void onQ();
    return () => {
      stop();
      window.removeEventListener(QUEUE_CHANGED, onQ);
    };
  }, [id, onChanged]);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      await addPhotos(id, target, files);
    } finally {
      setBusy(false);
      await refreshQueue();
      await onChanged();
    }
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of photos) c[p.category] = (c[p.category] || 0) + 1;
    return c;
  }, [photos]);
  const shown = cat === 'all' ? photos : photos.filter((p) => p.category === cat);

  return (
    <div>
      <div className="crm-stages crm-stages--tight">
        <button type="button" className={cat === 'all' ? 'on' : ''} onClick={() => setCat('all')}>
          All <span>{photos.length}</span>
        </button>
        {PHOTO_CATEGORIES.map((c) => (
          <button key={c.key} type="button" className={cat === c.key ? 'on' : ''} onClick={() => setCat(c.key)}>
            {c.label} <span>{counts[c.key] || 0}</span>
          </button>
        ))}
      </div>

      <div className="crm-photo-actions">
        <button type="button" className="crm-btn crm-btn--solar crm-btn--big" disabled={busy} onClick={() => cameraRef.current?.click()}>
          📷 Take {photoLabel(target).toLowerCase()} photo
        </button>
        <button type="button" className="crm-btn crm-btn--ghost" disabled={busy} onClick={() => pickRef.current?.click()}>
          🖼 From gallery
        </button>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFiles(e.target.files).then(() => (e.target.value = ''))} />
        <input ref={pickRef} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files).then(() => (e.target.value = ''))} />
      </div>
      {cat === 'all' && <p className="crm-muted crm-small">Pick a type above first — photos taken from “All” are filed under Site.</p>}
      {(busy || waiting > 0) && (
        <p className="crm-banner">
          {busy ? 'Preparing photos…' : `${waiting} photo${waiting === 1 ? '' : 's'} waiting to upload`}
          {!busy && (typeof navigator !== 'undefined' && !navigator.onLine ? ' — no signal, they’ll go up when it’s back.' : '…')}
          {!busy && (
            <button type="button" className="crm-link" onClick={() => void uploadQueued()}>
              Retry now
            </button>
          )}
        </p>
      )}

      {shown.length === 0 ? (
        <p className="crm-muted">No {cat === 'all' ? '' : `${photoLabel(cat).toLowerCase()} `}photos yet.</p>
      ) : (
        <div className="crm-photos">
          {shown.map((p) => (
            <button key={p.id} type="button" className="crm-photo" onClick={() => setOpen(p)}>
              {/* Signed storage links — next/image can't optimise them. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.thumb ? <img src={p.thumb} alt={p.caption || photoLabel(p.category)} loading="lazy" /> : <span>📷</span>}
              {cat === 'all' && <span className="crm-photo-tag">{photoLabel(p.category)}</span>}
            </button>
          ))}
        </div>
      )}

      {open && (
        <PhotoViewer
          photo={open}
          onClose={() => setOpen(null)}
          onChanged={async () => {
            setOpen(null);
            await onChanged();
          }}
        />
      )}
    </div>
  );
}

function PhotoViewer({ photo, onClose, onChanged }: { photo: Photo; onClose: () => void; onChanged: () => Promise<void> }) {
  const [caption, setCaption] = useState(photo.caption || '');
  const [category, setCategory] = useState(photo.category);
  const dirty = caption !== (photo.caption || '') || category !== photo.category;
  async function save() {
    await fetch(`/api/crm/photos/${photo.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caption, category }),
    });
    await onChanged();
  }
  async function remove() {
    if (!confirm('Delete this photo?')) return;
    await fetch(`/api/crm/photos/${photo.id}`, { method: 'DELETE' });
    await onChanged();
  }
  return (
    <div className="crm-viewer" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="crm-viewer-box" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {photo.url ? <img src={photo.url} alt={photo.caption || ''} /> : <p className="crm-muted">Image unavailable</p>}
        <div className="crm-viewer-meta">
          <span className="crm-muted crm-small">
            {photo.by ? `${photo.by} · ` : ''}
            {when(photo.created_at)}
          </span>
          <input className="crm-input" placeholder="Caption (e.g. consumer unit, roof south face)" value={caption} onChange={(e) => setCaption(e.target.value)} />
          <select className="crm-input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {PHOTO_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <div className="crm-actions">
            {dirty && (
              <button type="button" className="crm-btn crm-btn--solar" onClick={save}>
                Save
              </button>
            )}
            {photo.url && (
              <a className="crm-btn crm-btn--ghost" href={photo.url} target="_blank" rel="noreferrer">
                Full size
              </a>
            )}
            <button type="button" className="crm-btn crm-btn--ghost" onClick={remove}>
              Delete
            </button>
            <button type="button" className="crm-btn crm-btn--ghost" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Details({
  project,
  customer,
  team,
  onSave,
  isAdmin,
  onDelete,
}: {
  project: Project;
  customer: Customer;
  team: { id: string; name: string }[];
  onSave: (b: Partial<Project>) => Promise<boolean>;
  isAdmin: boolean;
  onDelete: () => void;
}) {
  const initial = useMemo(
    () => ({
      title: project.title,
      products: project.products,
      value: project.value == null ? '' : String(project.value),
      owner_id: project.owner_id || '',
      address: project.address || '',
      postcode: project.postcode || '',
      survey_at: toLocalInput(project.survey_at),
      install_at: toLocalInput(project.install_at),
      simpliheat_url: project.simpliheat_url || '',
      opensolar_url: project.opensolar_url || '',
      lost_reason: project.lost_reason || '',
      notes: project.notes || '',
    }),
    [project]
  );
  const [f, setF] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setSaved(false);
    setF({ ...f, [k]: e.target.value });
  };

  async function save() {
    setSaving(true);
    const ok = await onSave({
      ...f,
      value: f.value === '' ? null : Number(f.value),
      owner_id: f.owner_id || null,
      survey_at: f.survey_at ? new Date(f.survey_at).toISOString() : null,
      install_at: f.install_at ? new Date(f.install_at).toISOString() : null,
    } as unknown as Partial<Project>);
    setSaving(false);
    setSaved(ok);
  }

  return (
    <div className="crm-details">
      <label className="crm-label">Project name</label>
      <input className="crm-input" value={f.title} onChange={set('title')} />

      <label className="crm-label">Products</label>
      <div className="crm-checks">
        {PRODUCTS.map((p) => (
          <label key={p.key} className={f.products.includes(p.key) ? 'on' : ''}>
            <input
              type="checkbox"
              checked={f.products.includes(p.key)}
              onChange={(e) => {
                setSaved(false);
                setF({ ...f, products: e.target.checked ? [...f.products, p.key] : f.products.filter((x) => x !== p.key) });
              }}
            />
            {p.label}
          </label>
        ))}
      </div>

      <div className="crm-grid2">
        <div>
          <label className="crm-label">Value £ (inc. VAT)</label>
          <input className="crm-input" inputMode="decimal" value={f.value} onChange={set('value')} />
        </div>
        <div>
          <label className="crm-label">Owner</label>
          <select className="crm-input" value={f.owner_id} onChange={set('owner_id')}>
            <option value="">—</option>
            {team.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="crm-label">Site address</label>
      <input className="crm-input" value={f.address} onChange={set('address')} placeholder="If different from the customer’s" />
      <div className="crm-grid2">
        <div>
          <label className="crm-label">Postcode</label>
          <input className="crm-input" value={f.postcode} onChange={set('postcode')} />
        </div>
        <div />
      </div>

      <div className="crm-grid2">
        <div>
          <label className="crm-label">Survey</label>
          <input className="crm-input" type="datetime-local" value={f.survey_at} onChange={set('survey_at')} />
        </div>
        <div>
          <label className="crm-label">Install</label>
          <input className="crm-input" type="datetime-local" value={f.install_at} onChange={set('install_at')} />
        </div>
      </div>

      <label className="crm-label">SimpliHeat project link</label>
      <div className="crm-linkrow">
        <input className="crm-input" type="url" value={f.simpliheat_url} onChange={set('simpliheat_url')} placeholder="https://…" />
        {initial.simpliheat_url && (
          <a className="crm-btn crm-btn--ghost" href={initial.simpliheat_url} target="_blank" rel="noreferrer">
            Open
          </a>
        )}
      </div>
      <label className="crm-label">OpenSolar project link</label>
      <div className="crm-linkrow">
        <input className="crm-input" type="url" value={f.opensolar_url} onChange={set('opensolar_url')} placeholder="https://…" />
        {initial.opensolar_url && (
          <a className="crm-btn crm-btn--ghost" href={initial.opensolar_url} target="_blank" rel="noreferrer">
            Open
          </a>
        )}
      </div>

      {project.stage === 'lost' && (
        <>
          <label className="crm-label">Why was it lost?</label>
          <input className="crm-input" value={f.lost_reason} onChange={set('lost_reason')} placeholder="Price, timing, went elsewhere…" />
        </>
      )}

      <label className="crm-label">Notes</label>
      <textarea className="crm-input" rows={5} value={f.notes} onChange={set('notes')} />

      <div className="crm-savebar">
        <button type="button" className="crm-btn crm-btn--solar" disabled={!dirty || saving} onClick={save}>
          {saving ? 'Saving…' : saved && !dirty ? 'Saved ✓' : 'Save changes'}
        </button>
        {dirty && (
          <button type="button" className="crm-btn crm-btn--ghost" onClick={() => setF(initial)}>
            Undo
          </button>
        )}
      </div>

      <div className="crm-customer">
        <h3>Customer</h3>
        <p>
          <b>{customer.name}</b>
          <br />
          {[customer.phone, customer.email, customer.postcode].filter(Boolean).join(' · ')}
          <br />
          <span className="crm-muted crm-small">
            Source: {customer.source}
            {customer.interest ? ` · ${customer.interest}` : ''}
          </span>
        </p>
        <Link href="/admin/enquiries" className="crm-link">
          Edit in Enquiries
        </Link>
      </div>

      {isAdmin && (
        <button type="button" className="crm-link crm-danger" onClick={onDelete}>
          Delete project
        </button>
      )}
      <p className="crm-muted crm-small">Created {when(project.created_at)} · stage {stageLabel(project.stage)}</p>
    </div>
  );
}
