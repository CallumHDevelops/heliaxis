'use client';

import Link from 'next/link';
import { PushBanner } from '@/components/admin/PushBanner';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CrmLead } from '@/lib/enquiries';
import { ENQUIRY_STATUS_LABEL, INTEREST_KEYS, shownLeads, statusFromParam } from '@/lib/enquiries';
import { inSource, leadSourceLabel, metaAdLabel, SOURCE_GROUPS, sourceCounts, sourceFromParam, type SourceGroup } from '@/lib/lead-source';
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

/**
 * The filters live in the address bar (?status=new&source=meta&q=smith, and ?open=<id> for the lead
 * that's open), so a refresh keeps them and the dashboard can link straight to them. null removes one.
 */
function keepInUrl(changes: Record<string, string | null>) {
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(changes)) {
    if (v) url.searchParams.set(k, v);
    else url.searchParams.delete(k);
  }
  // Next keeps useSearchParams in step with replaceState, so the list follows.
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

/** How a source reads in a sentence: "New Meta leads", "website leads", "leads from other places". */
const SOURCE_WORD: Record<SourceGroup, string> = { meta: 'Meta', website: 'website', whatsapp: 'WhatsApp', other: '' };
function whichLeads(status: string, source: SourceGroup | '') {
  const kind = [status, source ? SOURCE_WORD[source] : ''].filter(Boolean).join(' ');
  return `${kind ? `${kind} ` : ''}leads${source === 'other' ? ' from other places' : ''}`;
}
/** The subtitle's "(New, from Meta)". */
function filterWords(status: string, source: SourceGroup | '') {
  const from = source === 'other' ? 'from other places' : source === 'website' ? 'from the website' : source ? `from ${SOURCE_WORD[source]}` : '';
  return [status, from].filter(Boolean).join(', ');
}

/** A Meta lead's ad (or "Organic") under the name: small, so the table gets no wider on phones. */
function AdLine({ src }: { src: string }) {
  const ad = metaAdLabel(src);
  if (!ad) return null;
  return (
    <span className="enq-ad" title={leadSourceLabel(src)}>
      <i>Meta</i>
      <span>{ad}</span>
    </span>
  );
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
  const [saving, setSaving] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [deleting, setDeleting] = useState<{ ids: string[]; name?: string } | null>(null);
  const [notice, setNotice] = useState<{ text: string; errors: string[] } | null>(null);
  const params = useSearchParams();
  const [q, setQ] = useState(() => params?.get('q') ?? '');
  // Click a status card, or a source, to see only those leads; the address bar holds both (unknown values mean everyone).
  const only = statusFromParam(params?.get('status'));
  const source = sourceFromParam(params?.get('source'));
  // The lead whose details are open (?open=<id>, so the dashboard can link to it); one not on the list is ignored.
  const openId = params?.get('open') ?? '';
  const active = openId ? (leads.find((l) => l.id === openId) ?? null) : null;
  const openLead = (l: CrmLead) => keepInUrl({ open: l.id });
  const closeLead = () => keepInUrl({ open: null });
  // Leads whose status you change while filtered stay on screen until you pick another card.
  const [kept, setKept] = useState<{ status: string; ids: ReadonlySet<string> }>({ status: '', ids: new Set() });

  /** One card at a time: clicking the lit one again shows everyone. */
  function pickStatus(s: string) {
    setKept({ status: '', ids: new Set() });
    keepInUrl({ status: only === s ? null : s.toLowerCase() });
  }
  /** One source at a time, like the cards: All, or the lit one again, is every source. */
  function pickSource(g: SourceGroup | '') {
    setKept({ status: '', ids: new Set() });
    keepInUrl({ source: g && source !== g ? g : null });
  }
  function search(v: string) {
    setQ(v);
    keepInUrl({ q: v.trim() ? v : null });
  }
  function clearFilters() {
    setQ('');
    setKept({ status: '', ids: new Set() });
    keepInUrl({ status: null, source: null, q: null });
  }

  const refresh = useCallback(async () => {
    const r = await fetch('/api/enquiries', { cache: 'no-store' });
    if (!r.ok) return;
    const d = await r.json();
    setLeads(d.leads || []);
  }, []);

  useEffect(() => {
    setLeads(initialLeads);
  }, [initialLeads]);

  // The leads from the picked source. The status cards count these, so Meta + New is the new Meta leads...
  const pool = useMemo(() => inSource(leads, source), [leads, source]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    STATUSES.forEach((s) => {
      c[s] = 0;
    });
    pool.forEach((l) => {
      c[l.status] = (c[l.status] || 0) + 1;
    });
    return c;
  }, [pool]);
  // ...and the source buttons count the picked card's leads.
  const forSources = only ? leads.filter((l) => l.status === only) : leads;
  const bySource = sourceCounts(forSources);

  const shown = shownLeads(pool, q, only, kept.status === only ? kept.ids : undefined);
  const filtered = Boolean(only || source || q.trim());
  const narrowed = Boolean(only || source);
  // Only people still on the list count (a refresh may have dropped some). Ticks stay while you search or filter.
  const pickedIds = leads.filter((l) => picked.has(l.id)).map((l) => l.id);
  // "Select all" means everyone the search, source and status card show, but not leads only still on screen because
  // you just moved them out of that status: "delete the rest of New" mustn't take the ones you just contacted.
  const selectable = shownLeads(pool, q, only);
  const allPicked = selectable.length > 0 && selectable.every((l) => picked.has(l.id));
  const pickAll = () =>
    setPicked((prev) => {
      const next = new Set(prev);
      for (const l of selectable) {
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
    if (only) setKept((k) => ({ status: only, ids: new Set(k.status === only ? k.ids : []).add(id) }));
    // Moved off the picked card: untick it too, or "Select all" then marking the good ones would delete them.
    if (only && status !== only && picked.has(id)) {
      setPicked((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
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
            {filtered ? (
              <>
                {shown.length} of {leads.length} leads{narrowed ? ` (${filterWords(only, source)})` : ''} ·{' '}
                <button type="button" className="enq-showall" onClick={clearFilters}>
                  Show all
                </button>
              </>
            ) : (
              `${leads.length} leads · give each a status and track it through the pipeline.`
            )}
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
                setKept({ status: '', ids: new Set() }); // the rows then match the card's count
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
      <div className={only ? 'enq-stat-ov has-pick' : 'enq-stat-ov'} role="group" aria-label="Show leads by status">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            className={`enq-so so-${s}`}
            aria-pressed={only === s}
            title={only === s ? 'Show all leads' : `Show only ${s} leads`}
            onClick={() => pickStatus(s)}
          >
            <span className="n">{counts[s] || 0}</span>
            <span className="k">
              <span className={`stpill st-${s}`}>{s}</span>
            </span>
          </button>
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

      <div className={source ? 'enq-src-row has-pick' : 'enq-src-row'} role="group" aria-label="Show leads by where they came from">
        <span className="enq-src-k" aria-hidden="true">
          From
        </span>
        <button type="button" className="enq-src" aria-pressed={!source} onClick={() => pickSource('')}>
          All <span className="c">{forSources.length}</span>
        </button>
        {/* Other only when there's someone in it (or it's picked). */}
        {SOURCE_GROUPS.filter((g) => g.key !== 'other' || bySource.other > 0 || source === 'other').map((g) => (
          <button
            key={g.key}
            type="button"
            className={`enq-src src-${g.key}`}
            aria-pressed={source === g.key}
            title={source === g.key ? 'Show leads from everywhere' : `Show only ${whichLeads('', g.key)}`}
            onClick={() => pickSource(g.key)}
          >
            {g.label} <span className="c">{bySource[g.key]}</span>
          </button>
        ))}
      </div>

      <input
        className="enq-search"
        type="search"
        placeholder={leads.some((l) => l.ref) ? 'Search name, phone or HX-0042' : 'Search name, email or phone'}
        aria-label="Search enquiries"
        value={q}
        onChange={(e) => search(e.target.value)}
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
                  {narrowed && q.trim()
                    ? `No ${whichLeads(only, source)} match “${q.trim()}”.`
                    : narrowed
                      ? `No ${whichLeads(only, source)} at the moment.`
                      : `Nobody matches “${q.trim()}”.`}{' '}
                  <button type="button" className="enq-showall" onClick={clearFilters}>
                    {narrowed && q.trim() ? 'Clear filters' : narrowed ? 'Show all leads' : 'Clear search'}
                  </button>
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
                        <AdLine src={l.src} />
                      </span>
                    </label>
                  ) : (
                    <>
                      <b>{l.name}</b>
                      {l.ref && <span className="enq-ref">{l.ref}</span>}
                      <div className="enq-email">{l.email}</div>
                      <AdLine src={l.src} />
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
                  <button type="button" className="enq-view" onClick={() => openLead(l)}>
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
            <input type="checkbox" checked={allPicked} disabled={!selectable.length} onChange={pickAll} />
            Select all ({selectable.length})
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
        <div className="enq-modal" role="dialog" aria-modal="true" onClick={closeLead}>
          <div className="enq-modalbox" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="enq-close" aria-label="Close" onClick={closeLead}>
              ×
            </button>
            <h2>{active.name}</h2>
            <p className="enq-sub">
              {active.ref ? `${active.ref} · ` : ''}
              {active.sector}
              {active.org ? ` · ${active.org}` : ''} · via {leadSourceLabel(active.src)} · {active.time}
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
                {leadSourceLabel(active.src)}
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
                    closeLead();
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
