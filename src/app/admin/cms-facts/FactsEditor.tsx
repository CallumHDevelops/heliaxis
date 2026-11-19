'use client';

import { useMemo, useState } from 'react';
import { factsGaps, type Facts } from '@/lib/cms/facts';

type Row = Record<string, unknown>;

/** CMS › Facts sheet: the only place the builder and the page checks get their facts about Heliaxis. Anyone with CMS access reads it; only an admin saves. */
export function FactsEditor({ initial, saved, admin }: { initial: Facts; saved: boolean; admin: boolean }) {
  const [f, setF] = useState<Facts>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const gaps = useMemo(() => factsGaps(f), [f]);

  const set = <K extends keyof Facts>(k: K, v: Facts[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    setDirty(true);
  };
  const lines = (xs: string[]) => xs.join('\n');
  const fromLines = (t: string) => t.split('\n').map((x) => x.trim()).filter(Boolean);
  const ro = !admin;

  function listEditor<T extends Row>(key: keyof Facts, rows: T[], fields: { k: string; label: string; type?: 'text' | 'number' | 'date' | 'area' | 'check' | 'audience'; wide?: boolean }[], blank: T, addLabel: string) {
    const upd = (i: number, k: string, v: unknown) => set(key, rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)) as never);
    return (
      <div className="fx-list">
        {rows.map((r, i) => (
          <div className="fx-row" key={i}>
            {fields.map((fd) => (
              <label key={fd.k} className={fd.wide ? 'fx-wide' : ''}>
                <span>{fd.label}</span>
                {fd.type === 'area' ? (
                  <textarea disabled={ro} rows={3} value={String(r[fd.k] ?? '')} onChange={(e) => upd(i, fd.k, e.target.value)} />
                ) : fd.type === 'check' ? (
                  <input disabled={ro} type="checkbox" checked={r[fd.k] === true} onChange={(e) => upd(i, fd.k, e.target.checked)} />
                ) : fd.type === 'audience' ? (
                  <select disabled={ro} value={String(r[fd.k] ?? 'homes')} onChange={(e) => upd(i, fd.k, e.target.value)}>
                    <option value="homes">Homes</option>
                    <option value="business">Business</option>
                    <option value="both">Both</option>
                  </select>
                ) : (
                  <input disabled={ro} type={fd.type === 'number' ? 'number' : fd.type === 'date' ? 'date' : 'text'} value={String(r[fd.k] ?? '')} onChange={(e) => upd(i, fd.k, fd.type === 'number' ? Number(e.target.value) : e.target.value)} />
                )}
              </label>
            ))}
            {!ro && (
              <button type="button" className="fx-x" onClick={() => set(key, rows.filter((_, j) => j !== i) as never)}>
                Remove
              </button>
            )}
          </div>
        ))}
        {!ro && (
          <button type="button" className="fx-add" onClick={() => set(key, [...rows, blank] as never)}>
            + {addLabel}
          </button>
        )}
      </div>
    );
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch('/api/cms/facts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ facts: f }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not save.');
      setF(d.facts);
      setDirty(false);
      setMsg({ ok: true, text: 'Saved. The builder and page checks use this from now on.' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not save.' });
    } finally {
      setBusy(false);
    }
  }

  const text = (k: 'businessName' | 'legalName' | 'serviceArea' | 'phone' | 'whatsapp' | 'hours' | 'responsePromise' | 'experience' | 'installCount', label: string, hint?: string) => (
    <label>
      <span>{label}</span>
      <input disabled={ro} value={f[k]} onChange={(e) => set(k, e.target.value)} />
      {hint && <small>{hint}</small>}
    </label>
  );

  return (
    <div className="fx">
      <div className="fx-head">
        <h1>Facts sheet</h1>
        <p>
          Everything a page is allowed to say about Heliaxis. The page builder only uses what is here, and the page checks stop a page publishing if it claims something that is not. {saved ? '' : 'Nothing has been saved yet, so this shows the starting facts.'}
          {ro && ' You can read this; only an admin can change it.'}
        </p>
        {f.updatedAt && <p className="fx-muted">Last saved {new Date(f.updatedAt).toLocaleString('en-GB')} by {f.updatedBy}.</p>}
      </div>

      {gaps.length > 0 && (
        <div className="fx-gaps">
          <b>Still to fill in</b>
          <ul>{gaps.map((g) => <li key={g}>{g}</li>)}</ul>
        </div>
      )}

      <section>
        <h2>The business</h2>
        <div className="fx-grid">
          {text('businessName', 'Business name')}
          {text('legalName', 'Legal name')}
          {text('serviceArea', 'Where we work', 'The wording pages use, for example “South Wales and the South West”.')}
          {text('phone', 'Phone')}
          {text('whatsapp', 'WhatsApp link', 'A wa.me link. Leave blank until it is set up.')}
          {text('hours', 'Opening hours')}
          {text('responsePromise', 'Response promise', 'What we promise after an enquiry. Only promise what the team can keep.')}
          {text('experience', 'Experience wording', 'Used until there is an exact install count.')}
          {text('installCount', 'Exact install count', 'Leave blank unless it has been checked. Then pages may print it.')}
        </div>
        <label className="fx-block">
          <span>Towns we cover (one per line)</span>
          <textarea disabled={ro} rows={5} value={lines(f.towns)} onChange={(e) => set('towns', fromLines(e.target.value))} />
        </label>
      </section>

      <section>
        <h2>Review rating</h2>
        <p className="fx-muted">Hidden on every page until it is ticked as verified and a value and platform are filled in.</p>
        <div className="fx-grid">
          <label><span>Rating (for example 4.8)</span><input disabled={ro} value={f.rating.value} onChange={(e) => set('rating', { ...f.rating, value: e.target.value })} /></label>
          <label><span>Number of reviews</span><input disabled={ro} value={f.rating.count} onChange={(e) => set('rating', { ...f.rating, count: e.target.value })} /></label>
          <label><span>Platform (for example Google)</span><input disabled={ro} value={f.rating.platform} onChange={(e) => set('rating', { ...f.rating, platform: e.target.value })} /></label>
          <label className="fx-check"><input disabled={ro} type="checkbox" checked={f.rating.verified} onChange={(e) => set('rating', { ...f.rating, verified: e.target.checked })} /><span>A person has checked this against the platform</span></label>
        </div>
      </section>

      <section>
        <h2>Accreditations</h2>
        {listEditor('accreditations', f.accreditations as unknown as Row[], [{ k: 'name', label: 'Name' }, { k: 'what', label: 'What it means, in plain words', type: 'area', wide: true }], { name: '', what: '' }, 'Add an accreditation')}
      </section>

      <section>
        <h2>Warranties</h2>
        <p className="fx-muted">Always say whose warranty it is. Years from, and to (the same number if it does not vary).</p>
        {listEditor('warranties', f.warranties as unknown as Row[], [{ k: 'label', label: 'Warranty' }, { k: 'years', label: 'Years', type: 'number' }, { k: 'yearsMax', label: 'Up to years', type: 'number' }, { k: 'by', label: 'Whose it is', wide: true }], { label: '', years: 0, yearsMax: 0, by: '' }, 'Add a warranty')}
      </section>

      <section>
        <h2>Funding and offers</h2>
        <p className="fx-muted">Pages may only mention an offer that is here, in date, and checked by a person. An ended offer is flagged on every page that still mentions it.</p>
        {listEditor(
          'funding',
          f.funding as unknown as Row[],
          [
            { k: 'name', label: 'Name' },
            { k: 'audience', label: 'Who it is for', type: 'audience' },
            { k: 'until', label: 'Ends on', type: 'date' },
            { k: 'checkedOn', label: 'Last checked on', type: 'date' },
            { k: 'text', label: 'The sentence pages may use', type: 'area', wide: true },
          ],
          { id: '', name: '', text: '', audience: 'homes', until: '', checkedOn: '', figures: [] },
          'Add an offer',
        )}
      </section>

      <section>
        <h2>Approved testimonials</h2>
        <p className="fx-muted">Only a real customer, with their permission. Testimonials sections show these and nothing else.</p>
        {listEditor(
          'testimonials',
          f.testimonials as unknown as Row[],
          [
            { k: 'name', label: 'Name (as they agreed)' },
            { k: 'town', label: 'Town' },
            { k: 'product', label: 'What we fitted' },
            { k: 'date', label: 'Date', type: 'date' },
            { k: 'source', label: 'Where it came from (email, review link)', wide: true },
            { k: 'quote', label: 'Their words', type: 'area', wide: true },
          ],
          { id: '', name: '', town: '', product: '', quote: '', date: '', source: '' },
          'Add a testimonial',
        )}
      </section>

      <section>
        <h2>Approved case studies</h2>
        <p className="fx-muted">Tick “permission” only once the customer has agreed to be featured.</p>
        {listEditor(
          'caseStudies',
          f.caseStudies as unknown as Row[],
          [
            { k: 'title', label: 'Title' },
            { k: 'town', label: 'Town' },
            { k: 'systemSize', label: 'System size (for example 6.4 kWp)' },
            { k: 'permission', label: 'Customer has agreed', type: 'check' },
            { k: 'summary', label: 'Summary', type: 'area', wide: true },
          ],
          { id: '', title: '', town: '', systemSize: '', summary: '', imageIds: [], permission: false },
          'Add a case study',
        )}
      </section>

      <section>
        <h2>Other</h2>
        <label className="fx-block">
          <span>Other figures pages may print (one per line)</span>
          <textarea disabled={ro} rows={3} value={lines(f.allowedFigures)} onChange={(e) => set('allowedFigures', fromLines(e.target.value))} />
          <small>Any £ amount or percentage that is not part of an offer above.</small>
        </label>
        <label className="fx-block">
          <span>People who approve AI images (email addresses, one per line)</span>
          <textarea disabled={ro} rows={3} value={lines(f.imageApprovers)} onChange={(e) => set('imageApprovers', fromLines(e.target.value))} />
        </label>
      </section>

      {admin && (
        <div className="fx-bar">
          <button type="button" className="fx-save" disabled={busy || !dirty} onClick={save}>{busy ? 'Saving…' : dirty ? 'Save the facts' : 'Saved'}</button>
          {msg && <span role="status" className={msg.ok ? 'fx-ok' : 'fx-bad'}>{msg.text}</span>}
        </div>
      )}
    </div>
  );
}
