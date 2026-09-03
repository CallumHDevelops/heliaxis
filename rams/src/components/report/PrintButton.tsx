'use client';

import { Button } from '@/components/ui';

/**
 * Export is the browser's own print-to-PDF. It renders the same component the
 * share page shows, honours the @page rules in globals.css, and needs no
 * server-side Chromium.
 */
export function PrintButton({
  label = 'Download PDF',
  variant = 'solar',
}: {
  label?: string;
  variant?: 'solar' | 'dark' | 'ghost';
}) {
  return (
    <Button type="button" variant={variant} onClick={() => window.print()}>
      {label}
    </Button>
  );
}
