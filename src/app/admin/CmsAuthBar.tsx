'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { signOut } from '@/lib/auth-actions';
import type { Profile } from '@/lib/auth';

function initials(email?: string | null) {
  if (!email) return '?';
  const local = email.split('@')[0] || '';
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase() || '?';
}

export function CmsAuthBar({ profile }: { profile: Profile | null }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    setSlot(document.getElementById('toolbarAuth'));
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, [open]);

  if (!slot) return null;

  return createPortal(
    <div className={`cms-user-menu${open ? ' open' : ''}`} ref={menuRef}>
      <button
        type="button"
        className="cms-user-btn"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-haspopup="menu"
        title={profile?.email || 'Account'}
      >
        <span className="cms-user-avatar" aria-hidden="true">
          {initials(profile?.email)}
        </span>
        {profile?.email && <span className="cms-user-email">{profile.email}</span>}
        <svg className="cms-user-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <div className="cms-user-dropdown" role="menu">
        <Link href="/" className="cms-user-link" target="_blank" rel="noopener" role="menuitem" onClick={() => setOpen(false)}>
          View site
        </Link>
        <Link href="/admin/enquiries" className="cms-user-link" role="menuitem" onClick={() => setOpen(false)}>
          Enquiries
        </Link>
        {isAdmin && (
          <Link href="/admin/approvals" className="cms-user-link" role="menuitem" onClick={() => setOpen(false)}>
            Approvals
          </Link>
        )}
        <div className="menu-divider" role="separator" />
        <form action={signOut} style={{ margin: 0 }}>
          <button type="submit" className="cms-user-link" role="menuitem">
            Sign out
          </button>
        </form>
      </div>
    </div>,
    slot
  );
}
