'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

// Hide the marketing nav/footer on the admin auth screens.
const HIDDEN_PREFIXES = ['/login', '/register', '/pending', '/admin'];

export function ConditionalChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hidden = HIDDEN_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
  if (hidden) return null;
  return <>{children}</>;
}
