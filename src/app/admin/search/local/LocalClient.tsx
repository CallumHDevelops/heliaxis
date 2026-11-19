'use client';

import { Fragment, useState } from 'react';
import { useRouter } from 'next/navigation';
import { compareNap, type BusinessFacts, type NapCheck } from '@/lib/search/local/nap';
import { addCitation, importGbpNow, runGridNow, saveCitation } from './actions';

type Msg = { ok: boolean; text: string } | null;

function Note({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return <small style={{ color: msg.ok ? '#2f7d32' : '#b3261e' }}>{msg.text}</small>;
}

/** Post this month's grids now, with the pre-flight estimate on the button. */
export function RunGridButton({ usd, tasks, overCap, canSpend, canOverride }: { usd: number; tasks: number; overCap: boolean; canSpend: boolean; canOverride: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [override, setOverride] = useState(false);
  if (!canSpend) return <span className="sx-note">Only an admin or the owner can run the grid.</span>;
  const blocked = !tasks || (overCap && !override);
  return (
    <span className="sx-row">
      <button
        type="button"
        className="crm-btn crm-btn--solar crm-btn--small"
        disabled={busy || blocked}
        title={overCap ? 'This would pass the monthly cap' : `${tasks} Maps searches`}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          const r = await runGridNow({ override });
          setBusy(false);
          setMsg(r.ok ? { ok: true, text: r.message ?? 'Posted.' } : { ok: false, text: r.error });
          if (r.ok) router.refresh();
        }}
      >
        {busy ? 'Posting…' : `Run the grid now, about $${usd.toFixed(2)}`}
      </button>
      {overCap && canOverride ? (
        <label className="sx-note">
          <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} /> Pass the cap this once
        </label>
      ) : null}
      <Note msg={msg} />
    </span>
  );
}

export function ImportGbpButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <span className="sx-row">
      <button
        type="button"
        className="crm-btn crm-btn--ghost crm-btn--small"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          const r = await importGbpNow();
          setBusy(false);
          setMsg(r.ok ? { ok: true, text: r.message ?? 'Imported.' } : { ok: false, text: r.error });
          if (r.ok) router.refresh();
        }}
      >
        {busy ? 'Importing…' : 'Import now'}
      </button>
      <Note msg={msg} />
    </span>
  );
}

export type CitationView = {
  id: number;
  directory: string;
  url: string | null;
  status: string;
  name_shown: string | null;
  address_shown: string | null;
  phone_shown: string | null;
  checked_at: string | null;
  notes: string | null;
};

const STATUS_LABEL: Record<string, string> = { listed: 'Listed', missing: 'Not listed', pending: 'Applied, waiting', unknown: 'Not checked' };
const STATUS_CLASS: Record<string, string> = { listed: 'done', missing: 'action', pending: 'manual', unknown: 'manual' };

function Flag({ c }: { c: NapCheck }) {
  if (c.state === 'match') return <span className="sx-state done">Matches</span>;
  if (c.state === 'mismatch') return <span className="sx-state action" title={`Business facts: ${c.fact}`}>Doesn’t match</span>;
  if (c.state === 'no_fact') return <span className="sx-state manual" title="Fill this in under Settings › Business facts">No fact to check</span>;
  return null;
}

/** The citations checklist: status, link and the name, address and phone each directory shows, checked against the facts. */
export function Citations({ rows, facts, canEdit }: { rows: CitationView[]; facts: BusinessFacts; canEdit: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState<number | null>(null);
  const [draft, setDraft] = useState<CitationView | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [adding, setAdding] = useState('');

  const edit = (r: CitationView) => {
    setOpen(r.id);
    setDraft({ ...r });
    setMsg(null);
  };
  const live = draft ? compareNap(facts, draft) : null;

  return (
    <>
      <div className="sx-tablewrap">
        <table className="sx-table lcl-cit">
          <thead>
            <tr>
              <th>Directory</th>
              <th>Status</th>
              <th>Name shown</th>
              <th>Address shown</th>
              <th>Phone shown</th>
              <th>Checked</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const checks = compareNap(facts, r);
              const [name, address, phone] = checks;
              return (
                <Fragment key={r.id}>
                  <tr className={checks.some((c) => c.state === 'mismatch') ? 'lcl-bad' : ''}>
                    <td>
                      {r.url ? (
                        <a href={r.url} target="_blank" rel="noreferrer" className="crm-link">
                          {r.directory}
                        </a>
                      ) : (
                        r.directory
                      )}
                    </td>
                    <td>
                      <span className={`sx-state ${STATUS_CLASS[r.status] ?? 'manual'}`}>{STATUS_LABEL[r.status] ?? r.status}</span>
                    </td>
                    <td>
                      {r.name_shown || <span className="sx-note">–</span>} <Flag c={name} />
                    </td>
                    <td>
                      {r.address_shown || <span className="sx-note">–</span>} <Flag c={address} />
                    </td>
                    <td>
                      {r.phone_shown || <span className="sx-note">–</span>} <Flag c={phone} />
                    </td>
                    <td className="sx-note">{r.checked_at ? new Date(r.checked_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Never'}</td>
                    <td>
                      {canEdit ? (
                        <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => (open === r.id ? setOpen(null) : edit(r))}>
                          {open === r.id ? 'Close' : 'Edit'}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                  {open === r.id && draft ? (
                    <tr>
                      <td colSpan={7}>
                        <div className="lcl-edit">
                          <label>
                            Status
                            <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                              {Object.entries(STATUS_LABEL).map(([v, l]) => (
                                <option key={v} value={v}>
                                  {l}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Link to our listing
                            <input type="url" value={draft.url ?? ''} placeholder="https://" onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
                          </label>
                          <label>
                            Name shown {live ? <Flag c={live[0]} /> : null}
                            <input value={draft.name_shown ?? ''} onChange={(e) => setDraft({ ...draft, name_shown: e.target.value })} />
                          </label>
                          <label>
                            Address shown {live ? <Flag c={live[1]} /> : null}
                            <input value={draft.address_shown ?? ''} onChange={(e) => setDraft({ ...draft, address_shown: e.target.value })} />
                          </label>
                          <label>
                            Phone shown {live ? <Flag c={live[2]} /> : null}
                            <input value={draft.phone_shown ?? ''} onChange={(e) => setDraft({ ...draft, phone_shown: e.target.value })} />
                          </label>
                          <label>
                            Notes
                            <input value={draft.notes ?? ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
                          </label>
                          <div className="sx-row">
                            <button
                              type="button"
                              className="crm-btn crm-btn--solar crm-btn--small"
                              disabled={busy}
                              onClick={async () => {
                                setBusy(true);
                                const res = await saveCitation(draft.id, {
                                  status: draft.status,
                                  url: draft.url ?? '',
                                  name_shown: draft.name_shown ?? '',
                                  address_shown: draft.address_shown ?? '',
                                  phone_shown: draft.phone_shown ?? '',
                                  notes: draft.notes ?? '',
                                });
                                setBusy(false);
                                setMsg(res.ok ? { ok: true, text: 'Saved.' } : { ok: false, text: res.error });
                                if (res.ok) {
                                  setOpen(null);
                                  router.refresh();
                                }
                              }}
                            >
                              {busy ? 'Saving…' : 'Save'}
                            </button>
                            <Note msg={msg} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {canEdit ? (
        <div className="sx-row">
          <input aria-label="Directory name" placeholder="Another directory we belong to" value={adding} onChange={(e) => setAdding(e.target.value)} />
          <button
            type="button"
            className="crm-btn crm-btn--ghost crm-btn--small"
            disabled={busy || !adding.trim()}
            onClick={async () => {
              setBusy(true);
              const r = await addCitation(adding);
              setBusy(false);
              setMsg(r.ok ? { ok: true, text: 'Added.' } : { ok: false, text: r.error });
              if (r.ok) {
                setAdding('');
                router.refresh();
              }
            }}
          >
            Add directory
          </button>
          {open === null ? <Note msg={msg} /> : null}
        </div>
      ) : null}
    </>
  );
}
