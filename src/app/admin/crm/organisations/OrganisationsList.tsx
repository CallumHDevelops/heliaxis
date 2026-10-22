'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useRef, useState } from 'react';
import { countByType, countsLine, matchesOrg, ORG_TYPES, sortOrgs, type OrgListRow, type OrgType } from '@/lib/organisations/shared';
import { fold } from '@/lib/search-words';
import { useLiveRefresh } from '@/lib/use-live-refresh';
import { Icon, Sheet } from '../CrmUi';
import { initials, orgApi, OrgForm, TypePill } from './OrgForms';
import '../crm.css';
import './orgs.css';

type Filter = OrgType | 'all';

/**
 * CRM › Organisations: commercial customers, landlords, schools, partners and suppliers. A search (name,
 * postcode, phone, email, company number, or any of their people), chips by type with how many each has,
 * and a row per organisation with its primary contact and its contacts' and jobs' counts. + Add opens the
 * Add sheet; a row opens the organisation.
 */
export function OrganisationsList({ ready, initial }: { ready: boolean; initial: OrgListRow[] | null }) {
  const router = useRouter();
  const [rows, setRows] = useState<OrgListRow[] | null>(initial);
  const [error, setError] = useState(initial ? '' : 'Couldn’t load the organisations. Trying again…');
  const [q, setQ] = useState('');
  const [type, setType] = useState<Filter>('all');
  const [adding, setAdding] = useState(false);

  const skipFirst = useRef(initial !== null);
  const load = useCallback(async () => {
    if (!ready) return true;
    if (skipFirst.current) {
      skipFirst.current = false;
      return true;
    }
    try {
      const d = await orgApi<{ organisations: OrgListRow[] }>('/api/crm/organisations');
      setRows(d.organisations);
      setError('');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t load the organisations.');
      return false;
    }
  }, [ready]);
  useLiveRefresh(load, 60_000);

  const all = useMemo(() => rows ?? [], [rows]);
  const found = useMemo(() => all.filter((o) => matchesOrg(o, q)), [all, q]);
  const counts = countByType(found);
  const shown = sortOrgs(type === 'all' ? found : found.filter((o) => o.type === type), q);
  const contacts = all.reduce((n, o) => n + o.contacts, 0);
  const sameName = (name: string) => {
    const n = fold(name.trim());
    const hit = n ? all.find((o) => fold(o.name.trim()) === n) : null;
    return hit ? { id: hit.id, name: hit.name } : null;
  };

  return (
    <div className="crm crmh org-page">
      <Link href="/admin/crm" className="crm-back">
        ← CRM
      </Link>
      <div className="crmh-head org-head">
        <div className="crmh-head__l">
          <h1 className="crmh-h1">Organisations</h1>
          {ready && rows && (
            <span className="crmh-sum">
              {all.length} organisation{all.length === 1 ? '' : 's'} · {contacts} contact{contacts === 1 ? '' : 's'}
            </span>
          )}
        </div>
        {ready && (
          <div className="crmh-head__r">
            <button type="button" className="crm-btn crm-btn--solar org-add" onClick={() => setAdding(true)}>
              <Icon k="plus" /> Add organisation
            </button>
          </div>
        )}
      </div>

      {!ready ? (
        <div className="crm-emptystate org-empty">
          <b>Organisations are switched on once organisations.sql has been run</b>
          <p>
            It’s on your <Link href="/admin/setup">to-do list</Link>: copy it into Supabase and press Run. Then add the businesses you work with (landlords,
            schools, builders, suppliers) and the people there, and link their jobs.
          </p>
        </div>
      ) : (
        <>
          {all.length > 0 && (
            <div className="org-tools">
              <label className="crmh-searchbox org-search">
                <span className="crmh-searchbox__field">
                  <Icon k="search" />
                  <input
                    type="search"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Name, person, postcode, phone or email"
                    aria-label="Search the organisations"
                    autoComplete="off"
                    enterKeyHint="search"
                  />
                </span>
              </label>
              <div className="crm-stages org-chips" role="group" aria-label="Type">
                {[{ key: 'all' as const, short: 'All', label: 'Every type' }, ...ORG_TYPES].map((t) => (
                  <button key={t.key} type="button" title={t.label} className={type === t.key ? 'on' : ''} aria-pressed={type === t.key} onClick={() => setType(t.key)}>
                    {t.short}
                    <span>{counts[t.key]}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <p className="crm-banner crm-banner--err">{error}</p>}

          {!rows ? null : !all.length ? (
            <div className="crm-emptystate org-empty">
              <b>No organisations yet</b>
              <p>Add the businesses you work with: commercial customers, landlords and housing associations, schools, the builders and letting agents who send you work, and suppliers. Then add the people there.</p>
              <button type="button" className="crm-btn crm-btn--solar" onClick={() => setAdding(true)}>
                <Icon k="plus" /> Add your first organisation
              </button>
            </div>
          ) : !shown.length ? (
            <div className="crm-emptystate org-empty">
              <b>{q.trim() ? `Nothing matches “${q.trim()}”` : 'None of this type yet'}</b>
              <p>
                {type !== 'all' && found.length ? (
                  <button type="button" className="crm-link" onClick={() => setType('all')}>
                    Show every type ({found.length})
                  </button>
                ) : (
                  'Try a name, a person there, a postcode or a phone number.'
                )}
              </p>
            </div>
          ) : (
            <ul className="org-list" aria-label="Organisations">
              {shown.map((o) => (
                <li key={o.id}>
                  <Link href={`/admin/crm/organisations/${o.id}`} className="org-row">
                    <span className={`org-badge org-badge--${o.type}`} aria-hidden="true">
                      {initials(o.name)}
                    </span>
                    <span className="org-row__main">
                      <b className="org-row__name">{o.name}</b>
                      <small className="org-row__who">
                        {o.primary ? (
                          <>
                            {o.primary.name}
                            {o.primary.role ? ` · ${o.primary.role}` : ''}
                          </>
                        ) : (
                          <span className="crm-muted">No contacts yet</span>
                        )}
                      </small>
                    </span>
                    <span className="org-row__type">
                      <TypePill type={o.type} />
                    </span>
                    <span className="org-row__counts">{countsLine(o)}</span>
                    <span className="org-row__pc">{o.postcode}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {adding && (
        <Sheet title="Add an organisation" onClose={() => setAdding(false)} wide>
          <OrgForm
            initialName={shown.length ? '' : q.trim()}
            sameName={sameName}
            onCancel={() => setAdding(false)}
            onSaved={(o) => {
              setAdding(false);
              router.push(`/admin/crm/organisations/${o.id}`);
            }}
          />
        </Sheet>
      )}
    </div>
  );
}
