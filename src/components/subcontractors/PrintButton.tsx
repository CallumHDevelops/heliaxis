'use client';

export function PrintButton({ label = 'Print / save as PDF' }: { label?: string }) {
  return (
    <button type="button" className="pt-btn-ghost sc-btn-ghost" onClick={() => window.print()}>
      {label}
    </button>
  );
}
