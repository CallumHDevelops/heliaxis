'use client';

import Link from 'next/link';
import { PushBanner } from '@/components/admin/PushBanner';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CrmLead } from '@/lib/enquiries';
import { ENQUIRY_STATUS_LABEL, INTEREST_KEYS, refMatches } from '@/lib/enquiries';
import { osmEmbedUrl } from '@/lib/geocode-postcode';
import { DeleteCustomers, type DeleteDone } from './DeleteCustomers';
import './enquiries.css';

const STATUSES = Object.values(ENQUIRY_STATUS_LABEL);

const ICONS: Record<string, string> = {
  solar:
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="3.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8"/></svg>',
  battery:
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="7" width="14" height="10" rx="1.5"/><path d="M18 10h2v4h-2M8 10v4M12 10v4"/></svg>',
  heatpump:
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 8h16v10H4zM8 8V6h8v2M9 12h6M9 15h4"/></svg>',
  led: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 18h6M10 21h4M12 3a5 5 0 0 1 5 5c0 2-1 3.5-2.5 4.5V15h-5v-2.5C8 11.5 7 10 7 8a5 5 0 0 1 5-5z"/></svg>',
  users:
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="9" cy="8" r="3"/><path d="M3 19c0-3 2.5-5 6-5s6 2 6 5"/><circle cx="17" cy="9" r="2.5"/><path d="M21 19c0-2.2-1.5-3.8-4-4.2"/></svg>',
  coin:
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="8"/><path d="M12 7v10M9.5 9.5c.8-1 2-1.5 2.5-1.5s1.8.4 2.5 1.5M9.5 14.5c.8 1 2 1.5 2.5 1.5s1.8-.4 2.5-1.5"/></svg>',
};

/** Name, email, phone, postcode or customer reference (HX-0042, hx42, 0042). */
function matches(l: CrmLead, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (`${l.name} ${l.org} ${l.email} ${l.postcode}`.toLowerCase().includes(q)) return true;
  const squashed = q.replace(/\s+/g, '');
  if (l.postcode.replace(/\s+/g, '').toLowerCase().includes(squashed)) return true;
  const digits = q.replace(/\D/g, '');
  if (digits.length >= 3 && /^[\d\s()+-]+$/.test(q)) {
    const phone = l.phone.replace(/\D/g, '');
    const national = (d: string) => d.replace(/^(?:44|0)/, ''); // 07700 900123 finds +44 7700 900123
    if (phone.includes(digits) || (digits.length >= 6 && national(phone).includes(national(digits)))) return true;
  }
  return refMatches(l.ref, q);
}

function IconRow({ keys }: { keys: string[] }) {
  return (
    <div className="enq-icons">
      {keys.map((k) => (
        <span
          key={k}
          className="enq-icon"
          title={INTEREST_KEYS.find((x) => x[0] === k)?.[1] || k}
          dangerouslySetInnerHTML={{ __html: ICONS[k] || '' }}
        />
      ))}
    </div>
  );
}

export function EnquiriesCrm({
  initialLeads,
  canCrm = false,
  canImport = false,
  canDelete = false,
}: {
  initialLeads: CrmLead[];
  canCrm?: boolean;
  /** Admins: link to Import (old Meta leads, WhatsApp chats). */
  canImport?: boolean;
  /** Admins: Select mode and Delete customer (everything about them goes; see DeleteCustomers). */
  canDelete?: boolean;
}) {
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  async function openInCrm(l: CrmLead) {
    setOpening(true);
    const keys = l.interests.map((k) => (k === 'heatpump' ? 'infrared' : k)).filter((k) => ['solar', 'battery', 'infrared', 'led'].includes(k));
    const r = await fetch('/api/crm/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enquiry_id: l.id, open_existing: true, products: keys }),
    });
    const d = await r.json().catch(() => ({}));
    setOpening(false);
    if (r.ok) router.push(`/admin/crm/${d.id}`);
    else alert(d.error || 'Could not open the CRM — has supabase/crm.sql been run?');
  }
  const [leads, setLeads] = useState(initialLeads);
  const [active, setActive] = useState<CrmLead | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [deleting, setDeleting] = useState<{ ids: string[]; name?: string } | null>(null);
  const [notice, setNotice] = useState<{ text: string; errors: string[] } | null>(null);
  const [q, setQ] = useState('');

  const refresh = useCallback(async () => {
    const r = await fetch('/api/enquiries', { cache: 'no-store' });
    if (!r.ok) return;
    const d = await r.json();
    setLeads(d.leads || []);
  }, []);

  useEffect(() => {
    setLeads(initialLeads);
  }, [initialLeads]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    STATUSES.forEach((s) => {
      c[s] = 0;
    });
    leads.forEach((l) => {
      c[l.status] = (c[l.status] || 0) + 1;
    });
    return c;
  }, [leads]);

  const shown = q.trim() ? leads.filter((l) => matches(l, q)) : leads;
  // Only people still on the list count (a refresh may have dropped some). Ticks stay while you search.
  const pickedIds = leads.filter((l) => picked.has(l.id)).map((l) => l.id);
  // "Select all" means everyone the search shows.
  const allPicked = shown.length > 0 && shown.every((l) => picked.has(l.id));
  const pickAll = () =>
    setPicked((prev) => {
      const next = new Set(prev);
      for (const l of shown) {
        if (allPicked) next.delete(l.id);
        else next.add(l.id);
      }
      return next;
    });
  const togglePick = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function deleted(r: DeleteDone) {
    setDeleting(null);
    setSelecting(false);
    setPicked(new Set());
    const n = (x: number, one: string, many = `${one}s`) => `${x.toLocaleString('en-GB')} ${x === 1 ? one : many}`;
    setNotice({
      text: [
        `Deleted ${n(r.deleted, 'customer')}.`,
        r.kept ? `Kept ${n(r.kept, 'customer')} with a signed quote or paid deposit.` : '',
        r.filesFailed ? `${n(r.filesFailed, 'file')} couldn’t be removed from storage; they’re listed in the Vercel logs.` : '',
        r.remembered ? '' : 'The deleted list couldn’t be updated, so importing from Meta or WhatsApp again could bring them back.',
      ]
        .filter(Boolean)
        .join(' '),
      errors: r.errors,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' }); // the message is above the list
    await refresh();
  }

  async function setStatus(id: string, status: string) {
    setLeads((prev) =>
      prev.map((l) => (l.id === id ? { ...l, status, isnew: status === 'New' } : l))
    );
    setSaving(id);
    try {
      const r = await fetch('/api/enquiries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      if (!r.ok) await refresh();
    } catch {
      await refresh();
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="enq-page">
      <div className="enq-head">
        <div>
          <h1>Enquiries</h1>
          <p>
            {leads.length} leads · give each a status and track it through the pipeline.
          </p>
        </div>
        <div className="enq-head-actions">
          <Link className="enq-refresh" href="/admin/enquiries/inbox">
            WhatsApp inbox
          </Link>
          <Link className="enq-refresh" href="/admin/enquiries/smart-replies">
            Smart replies
          </Link>
          {canImport && (
            <Link className="enq-refresh" href="/admin/enquiries/import">
              Import
            </Link>
          )}
          {canDelete && (
            <button
              type="button"
              className="enq-refresh"
              aria-pressed={selecting}
              onClick={() => {
                setSelecting((v) => !v);
                setPicked(new Set());
              }}
            >
              {selecting ? 'Done' : 'Select'}
            </button>
          )}
          <button type="button" className="enq-refresh" onClick={() => refresh()}>
            Refresh
          </button>
        </div>
      </div>

      <PushBanner what="new enquiries and WhatsApp messages" />
      <div className="enq-stat-ov">
        {STATUSES.map((s) => (
          <div key={s} className="enq-so">
            <div className="n">{counts[s] || 0}</div>
            <div className="k">
              <span className={`stpill st-${s}`}>{s}</span>
            </div>
          </div>
        ))}
      </div>

      {notice && (
        <div className="enq-notice" role="status">
          <div>
            {notice.text}
            {notice.errors.length > 0 && (
              <ul>
                {notice.errors.slice(0, 5).map((e) => (
                  <li key={e}>{e}</li>
                ))}
                {notice.errors.length > 5 && <li>And {notice.errors.length - 5} more.</li>}
              </ul>
            )}
          </div>
          <button type="button" className="enq-close" aria-label="Dismiss" onClick={() => setNotice(null)}>
            ×
          </button>
        </div>
      )}

      <input
        className="enq-search"
        type="search"
        placeholder={leads.some((l) => l.ref) ? 'Search name, phone or HX-0042' : 'Search name, email or phone'}
        aria-label="Search enquiries"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <div className="enq-panel">
        <table className="enq-tbl">
          <thead>
            <tr>
              <th>Name</th>
              <th>Location</th>
              <th>Sector</th>
              <th>Interested in</th>
              <th>Received</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 && (
              <tr>
                <td colSpan={7} className="enq-empty">
                  No enquiries yet. Submissions from the website contact form will appear here
                  and also email hello@heliaxis.co.uk.
                </td>
              </tr>
            )}
            {leads.length > 0 && shown.length === 0 && (
              <tr>
                <td colSpan={7} className="enq-empty">
                  Nobody matches “{q.trim()}”.
                </td>
              </tr>
            )}
            {shown.map((l) => (
              <tr key={l.id} className={selecting && picked.has(l.id) ? 'is-picked' : undefined}>
                <td>
                  {selecting ? (
                    <label className="enq-pickname">
                      <input type="checkbox" checked={picked.has(l.id)} onChange={() => togglePick(l.id)} />
                      <span>
                        <b>{l.name}</b>
                        {l.ref && <span className="enq-ref">{l.ref}</span>}
                        <span className="enq-email">{l.email}</span>
                      </span>
                    </label>
                  ) : (
                    <>
                      <b>{l.name}</b>
                      {l.ref && <span className="enq-ref">{l.ref}</span>}
                      <div className="enq-email">{l.email}</div>
                    </>
                  )}
                </td>
                <td>
                  {l.town}
                  {l.postcode && l.town !== l.postcode ? (
                    <div className="enq-email">{l.postcode}</div>
                  ) : null}
                </td>
                <td>{l.sector}</td>
                <td>
                  <IconRow keys={l.interests} />
                </td>
                <td>{l.time}</td>
                <td>
                  <select
                    value={l.status}
                    disabled={saving === l.id}
                    onChange={(e) => setStatus(l.id, e.target.value)}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <button type="button" className="enq-view" onClick={() => setActive(l)}>
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selecting && (
        <div className="enq-selbar">
          <label className="enq-pickname">
            <input type="checkbox" checked={allPicked} disabled={!shown.length} onChange={pickAll} />
            Select all ({shown.length})
          </label>
          <span className="enq-selcount">{pickedIds.length} selected</span>
          <button
            type="button"
            className="enq-btn enq-btn-danger"
            disabled={!pickedIds.length}
            onClick={() => setDeleting({ ids: pickedIds })}
          >
            Delete selected ({pickedIds.length})
          </button>
        </div>
      )}

      {active && (
        <div className="enq-modal" role="dialog" aria-modal="true" onClick={() => setActive(null)}>
          <div className="enq-modalbox" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="enq-close" onClick={() => setActive(null)}>
              ×
            </button>
            <h2>{active.name}</h2>
            <p className="enq-sub">
              {active.ref ? `${active.ref} · ` : ''}
              {active.sector}
              {active.org ? ` · ${active.org}` : ''} · via {active.src} · {active.time}
            </p>
            {typeof active.lat === 'number' && typeof active.lng === 'number' ? (
              <div className="enq-map">
                <iframe
                  title="Map"
                  src={osmEmbedUrl(active.lat, active.lng)}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
                <div className="enq-map-label">
                  {[active.town, active.postcode].filter(Boolean).join(' · ')}
                </div>
              </div>
            ) : null}
            <div className="enq-meta">
              <div>
                <span>Email</span>
                <a href={`mailto:${active.email}`}>{active.email}</a>
              </div>
              <div>
                <span>Phone</span>
                {active.phone ? <a href={`tel:${active.phone.replace(/\s/g, '')}`}>{active.phone}</a> : '—'}
              </div>
              <div>
                <span>Postcode</span>
                {active.postcode || '—'}
              </div>
              <div>
                <span>Source</span>
                {active.src}
              </div>
            </div>
            <div className="enq-label">Interested in</div>
            <div className="enq-int-grid">
              {INTEREST_KEYS.map(([key, label]) => {
                const on = active.interests.includes(key);
                return (
                  <div key={key} className={`enq-int ${on ? 'on' : 'off'}`}>
                    <span dangerouslySetInnerHTML={{ __html: ICONS[key] || '' }} />
                    {label}
                  </div>
                );
              })}
            </div>
            <div className="enq-label">Message</div>
            <p className="enq-msg">{active.msg || 'No message'}</p>
            <div className="enq-actions">
              {canCrm && (
                <button type="button" className="enq-btn solar" disabled={opening} onClick={() => openInCrm(active)}>
                  {opening ? 'Opening…' : 'Open in CRM'}
                </button>
              )}
              <a className="enq-btn solar" href={`mailto:${active.email}`}>
                Reply by email
              </a>
              {active.phone && (
                <a className="enq-btn" href={`tel:${active.phone.replace(/\s/g, '')}`}>
                  Call
                </a>
              )}
              {active.phone && (
                <Link className="enq-btn" href={`/admin/enquiries/inbox/${active.id}`}>
                  WhatsApp
                </Link>
              )}
              {canDelete && (
                <button
                  type="button"
                  className="enq-btn enq-btn-danger enq-btn-end"
                  onClick={() => {
                    setDeleting({ ids: [active.id], name: active.name });
                    setActive(null);
                  }}
                >
                  Delete customer
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {deleting && <DeleteCustomers ids={deleting.ids} name={deleting.name} onClose={() => setDeleting(null)} onDone={deleted} />}
    </div>
  );
}
