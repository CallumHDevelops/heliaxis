'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DuplicateGroup } from '@/lib/projects/duplicates';
import '../crm.css';

const WHY = { email: 'Same email', number: 'Same phone number', name: 'Same name' } as const;
const when = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** Each set of possible duplicates: who they are, what they share, and Merge (opens the merge screen on the older one) or Not the same person. */
export function DuplicateCards({ groups }: { groups: DuplicateGroup[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  async function notSame(a: string, b: string) {
    setBusy(`${a}|${b}`);
    setErr('');
    const r = await fetch('/api/crm/merge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'distinct', a, b }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy('');
    if (!r || !r.ok) return setErr(d.error || 'That didn’t save. Try again.');
    router.refresh();
  }

  return (
    <div className="dp-list">
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
      {groups.map((g) => {
        const [first, ...rest] = g.people;
        return (
          <section key={g.people.map((p) => p.id).join('|')} className="dp-card">
            <header>
              <span className={`dp-why is-${g.why}`}>{WHY[g.why]}</span>
              <small>{g.people.length} customers</small>
            </header>
            <ul>
              {g.people.map((p) => (
                <li key={p.id}>
                  <div>
                    <b>{p.name}</b> {p.project_ref && <span className="dp-ref">{p.project_ref}</span>}
                    <small>{[p.phone, p.email, p.postcode, p.source, `came in ${when(p.created_at)}`].filter(Boolean).join(' · ')}</small>
                  </div>
                  {p.project_id && (
                    <Link className="crm-btn crm-btn--ghost crm-btn--small" href={`/admin/crm/${p.project_id}`}>
                      Open
                    </Link>
                  )}
                </li>
              ))}
            </ul>
            <div className="crm-actions" style={{ flexWrap: 'wrap' }}>
              {rest.map((o) =>
                first.project_id ? (
                  <Link key={o.id} className="crm-btn crm-btn--solar crm-btn--small" href={`/admin/crm/${first.project_id}?merge=${o.id}`}>
                    {g.people.length > 2 ? `Merge ${o.name} (${o.project_ref ?? 'no job'})…` : 'Review and merge…'}
                  </Link>
                ) : null
              )}
              {g.people.length === 2 && (
                <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={busy === `${first.id}|${rest[0].id}` || !!busy} onClick={() => void notSame(first.id, rest[0].id)}>
                  Not the same person
                </button>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
