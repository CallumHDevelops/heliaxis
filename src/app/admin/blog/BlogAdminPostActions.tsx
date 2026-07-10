'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { brand } from '@/components/auth/authStyles';
import type { BlogPostStatus } from '@/lib/blog/types';

type Props = {
  id: string;
  slug: string;
  status: BlogPostStatus;
  canWrite: boolean;
};

export function BlogAdminPostActions({ id, slug, status, canWrite }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function setStatus(next: BlogPostStatus, publishAt?: string) {
    if (!canWrite || busy) return;
    setErr(null);
    setBusy(true);
    try {
      const r = await fetch('/api/blog', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          id,
          slug,
          status: next,
          publishAt: publishAt || undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Update failed');
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!canWrite || busy) return;
    const ok = window.confirm(
      `Permanently delete “${slug}”? This cannot be undone.\n\nTip: Archive hides it from the site without deleting.`,
    );
    if (!ok) return;
    setErr(null);
    setBusy(true);
    try {
      const r = await fetch('/api/blog', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ id, slug }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Delete failed');
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  const btn: React.CSSProperties = {
    padding: '5px 10px',
    borderRadius: 4,
    fontSize: '0.78rem',
    fontWeight: 700,
    cursor: busy || !canWrite ? 'not-allowed' : 'pointer',
    opacity: busy || !canWrite ? 0.55 : 1,
    border: `1px solid ${brand.line}`,
    background: brand.paper,
    color: brand.ink,
  };

  const primary: React.CSSProperties = {
    ...btn,
    background: brand.ink,
    color: brand.paper,
    borderColor: brand.ink,
  };

  const danger: React.CSSProperties = {
    ...btn,
    color: '#9b1c1c',
    borderColor: 'rgba(155,28,28,.35)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <a
          href={`/admin/blog/preview/${encodeURIComponent(slug)}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            ...btn,
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            opacity: 1,
            cursor: 'pointer',
            background: brand.solar,
            borderColor: brand.solar,
          }}
        >
          Preview
        </a>
        <a
          href={`/blog/${slug}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            ...btn,
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            opacity: 1,
            cursor: 'pointer',
          }}
          title="Public URL — only works when published or schedule is due"
        >
          Live
        </a>
        {canWrite && status !== 'published' && status !== 'archived' && (
          <button
            type="button"
            style={primary}
            disabled={busy}
            onClick={() => setStatus('published', new Date().toISOString())}
          >
            Publish
          </button>
        )}
        {canWrite && status === 'archived' && (
          <button
            type="button"
            style={primary}
            disabled={busy}
            onClick={() => setStatus('published', new Date().toISOString())}
          >
            Restore
          </button>
        )}
        {canWrite && status !== 'archived' && (
          <button
            type="button"
            style={btn}
            disabled={busy}
            onClick={() => setStatus('archived')}
          >
            Archive
          </button>
        )}
        {canWrite && status === 'published' && (
          <button
            type="button"
            style={btn}
            disabled={busy}
            onClick={() => setStatus('draft')}
          >
            Unpublish
          </button>
        )}
        {canWrite && (
          <button type="button" style={danger} disabled={busy} onClick={onDelete}>
            Delete
          </button>
        )}
      </div>
      {err && (
        <span style={{ fontSize: '0.72rem', color: '#b33', fontWeight: 600, maxWidth: 180, textAlign: 'right' }}>
          {err}
        </span>
      )}
    </div>
  );
}
