'use client';

import { track } from '@/lib/estimator/analytics';

export type AddWhat = 'battery' | 'heatpump' | 'ev';

/** "Add to my quote": tells the estimator (SolarEstimatorApp listens for 'hx-est-add') to tick that extra, then scrolls up to it. */
export function AddToQuote({ what, children }: { what: AddWhat; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="btn est-btn-line"
      onClick={() => {
        track('est_add_extra', { what });
        window.dispatchEvent(new CustomEvent('hx-est-add', { detail: what }));
        document.getElementById('estimator')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }}
    >
      {children}
    </button>
  );
}

/** A button that scrolls to the estimator. */
export function ToEstimator({ children, from }: { children: React.ReactNode; from: string }) {
  return (
    <button
      type="button"
      className="btn btn-solar"
      onClick={() => {
        track('est_cta_click', { from });
        document.getElementById('estimator')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }}
    >
      {children}
    </button>
  );
}
