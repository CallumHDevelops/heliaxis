'use client';

import { useMemo, useState } from 'react';
import { Badge, Button, Card, EmptyState, Input, Panel } from '@/components/ui';
import { daysUntil, expiryLabel, expiryState } from '@/lib/content/certifications';
import { formatDate } from '@/lib/format';
import { createClient } from '@/lib/supabase/client';
import type { Certification, Profile } from '@/lib/types';
import { deleteCertification } from './actions';
import { CertificationForm } from './CertificationForm';

export function CertificationsClient({
  certifications,
  staff,
  currentUserId,
  canManageOthers,
}: {
  certifications: Certification[];
  staff: Profile[];
  currentUserId: string;
  canManageOthers: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Certification | null>(null);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return certifications;
    return certifications.filter((c) =>
      [c.title, c.holder_name, c.issuing_body, c.reference, c.category]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q))
    );
  }, [certifications, query]);

  const company = filtered.filter((c) => c.owner_type === 'company');

  const byPerson = useMemo(() => {
    const map = new Map<string, Certification[]>();
    for (const c of filtered.filter((c) => c.owner_type === 'user')) {
      const key = c.holder_name || 'Unassigned';
      map.set(key, [...(map.get(key) ?? []), c]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search certificates, people, issuing bodies…"
          className="max-w-sm"
        />
        <Button
          variant="solar"
          className="ml-auto"
          onClick={() => {
            setEditing(null);
            setAdding((a) => !a);
          }}
        >
          {adding ? 'Close' : 'Add certificate'}
        </Button>
      </div>

      {(adding || editing) && (
        <CertificationForm
          key={editing?.id ?? 'new'}
          staff={staff}
          currentUserId={currentUserId}
          canManageOthers={canManageOthers}
          editing={editing}
          onDone={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      )}

      {certifications.length === 0 ? (
        <EmptyState
          title="No certificates yet"
          description="Record company accreditations and individual competencies here — they can then be attached to any RAMS."
          action={
            <Button variant="solar" size="sm" onClick={() => setAdding(true)}>
              Add certificate
            </Button>
          }
        />
      ) : (
        <>
          {company.length > 0 && (
            <Panel title="Company accreditations" eyebrow="Company">
              <CertList certs={company} onEdit={setEditing} />
            </Panel>
          )}

          {byPerson.map(([person, certs]) => (
            <Panel
              key={person}
              title={person}
              eyebrow="Individual"
              action={<ExpirySummary certs={certs} />}
            >
              <CertList certs={certs} onEdit={setEditing} />
            </Panel>
          ))}

          {filtered.length === 0 && (
            <Card className="px-6 py-10 text-center text-[0.88rem] text-muted">
              Nothing matches “{query}”.
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function ExpirySummary({ certs }: { certs: Certification[] }) {
  const expired = certs.filter((c) => expiryState(c.expiry_date) === 'expired').length;
  const expiring = certs.filter((c) => expiryState(c.expiry_date) === 'expiring').length;
  if (expired === 0 && expiring === 0) return <Badge tone="ok">All in date</Badge>;
  return (
    <span className="flex gap-1.5">
      {expired > 0 && <Badge tone="danger">{expired} expired</Badge>}
      {expiring > 0 && <Badge tone="warn">{expiring} expiring</Badge>}
    </span>
  );
}

function CertList({
  certs,
  onEdit,
}: {
  certs: Certification[];
  onEdit: (c: Certification) => void;
}) {
  return (
    <ul className="divide-y divide-[color:var(--line)]">
      {certs.map((c) => {
        const state = expiryState(c.expiry_date);
        const days = daysUntil(c.expiry_date);
        return (
          <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.9rem] font-semibold">{c.title}</p>
              <p className="mono truncate text-[0.72rem] text-muted">
                {[c.issuing_body, c.reference, c.category].filter(Boolean).join(' · ') || '—'}
              </p>
            </div>

            <span className="mono text-[0.74rem] text-muted">
              {c.issue_date ? `Issued ${formatDate(c.issue_date)}` : ''}
            </span>

            <Badge
              tone={
                state === 'expired'
                  ? 'danger'
                  : state === 'expiring'
                    ? 'warn'
                    : state === 'valid'
                      ? 'ok'
                      : 'neutral'
              }
            >
              {state === 'none'
                ? 'No expiry'
                : `${formatDate(c.expiry_date)}${days !== null && days >= 0 && days <= 60 ? ` · ${days}d` : ''}`}
            </Badge>

            {c.file_path ? (
              <ViewCertButton path={c.file_path} name={c.file_name ?? 'certificate'} />
            ) : (
              <Badge tone="neutral">No PDF</Badge>
            )}

            <Button variant="quiet" size="sm" onClick={() => onEdit(c)}>
              Edit
            </Button>

            <form action={deleteCertification}>
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="file_path" value={c.file_path ?? ''} />
              <Button type="submit" variant="quiet" size="sm">
                Delete
              </Button>
            </form>

            <span className="sr-only">{expiryLabel(c.expiry_date)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function ViewCertButton({ path, name }: { path: string; name: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const { data } = await createClient()
          .storage.from('certifications')
          .createSignedUrl(path, 120, { download: name });
        if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener');
        setBusy(false);
      }}
    >
      {busy ? 'Opening…' : 'View PDF'}
    </Button>
  );
}
