import type { ReactNode } from 'react';
import '../(site)/site.css';

/** Standalone brand kit — no site header/footer. */
export default function BrandLayout({ children }: { children: ReactNode }) {
  return children;
}
