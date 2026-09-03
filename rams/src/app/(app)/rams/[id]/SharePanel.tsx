'use client';

import { useActionState, useState } from 'react';
import { Alert, Badge, Button, Field, Input, Select } from '@/components/ui';
import { EXPIRY_PRESETS, linkStatus } from '@/lib/share-ui';
import type { ShareLink } from '@/lib/types';
import { formatDateTime, relativeTime } from '@/lib/format';
import { createShareLink, revokeShareLink, type ShareState } from '../actions';

export function SharePanel({
  ramsId,
  links,
  canShare,
}: {
  ramsId: string;
  links: ShareLink[];
  canShare: boolean;
}) {
  const [state, formAction, pending] = useActionState<ShareState, FormData>(createShareLink, {});
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-4">
      {!canShare && (
        <Alert tone="neutral">
          Share links become available once the document is approved. A draft is not a controlled
          document.
        </Alert>
      )}

      {state.error && <Alert tone="danger">{state.error}</Alert>}

      {state.url && (
        <div className="rounded-[2px] border border-[#B6D3BC] bg-[#DCEBDF]/60 p-3">
          <p className="text-[0.8rem] font-semibold text-[#1F4A2B]">
            Link created. Copy it now — it is not stored and cannot be shown again.
          </p>
          <div className="mt-2 flex gap-2">
            <Input readOnly value={state.url} className="mono text-[0.78rem]" />
            <Button
              type="button"
              variant="dark"
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(state.url!);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>
      )}

      {canShare && (
        <form action={formAction} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="rams_id" value={ramsId} />
          <Field label="Label" hint="Who this link is for — shown in the list below.">
            <Input name="label" placeholder="Client — J. Morgan" />
          </Field>
          <Field label="Recipient email" hint="Recorded for the audit trail only.">
            <Input type="email" name="recipient_email" placeholder="client@example.co.uk" />
          </Field>
          <Field label="Expires after" required>
            <Select name="hours" defaultValue="168">
              {EXPIRY_PRESETS.map((p) => (
                <option key={p.hours} value={p.hours}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="View limit" hint="Optional. Leave blank for unlimited views.">
            <Input type="number" name="max_views" min={1} max={1000} placeholder="No limit" />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" variant="solar" disabled={pending}>
              {pending ? 'Creating…' : 'Create share link'}
            </Button>
          </div>
        </form>
      )}

      {links.length > 0 && (
        <ul className="divide-y divide-[color:var(--line)] border-t border-[color:var(--line)]">
          {links.map((link) => {
            const status = linkStatus(link);
            return (
              <li key={link.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <Badge
                  tone={status.tone === 'live' ? 'ok' : status.tone === 'revoked' ? 'danger' : 'neutral'}
                >
                  {status.label}
                </Badge>
                <span className="min-w-0 flex-1 truncate text-[0.85rem] font-semibold">
                  {link.label || link.recipient_email || 'Unlabelled link'}
                </span>
                <span className="mono text-[0.72rem] text-muted">
                  {link.view_count} view{link.view_count === 1 ? '' : 's'}
                  {link.max_views ? ` / ${link.max_views}` : ''} · expires{' '}
                  {relativeTime(link.expires_at)}
                </span>
                <span className="mono hidden text-[0.7rem] text-muted lg:inline">
                  {formatDateTime(link.expires_at)}
                </span>
                {status.tone === 'live' && (
                  <form action={revokeShareLink}>
                    <input type="hidden" name="id" value={link.id} />
                    <input type="hidden" name="rams_id" value={ramsId} />
                    <Button type="submit" variant="quiet" size="sm">
                      Revoke
                    </Button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
