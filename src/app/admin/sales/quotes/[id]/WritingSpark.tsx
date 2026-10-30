'use client';

import { useEffect, useState } from 'react';

const STEPS = ['Reading your items', 'Choosing the wording', 'Putting it together', 'Checking it reads right'];

/**
 * The estimator's spark, for while the quote is being written: its top arm lights first, then the right, the bottom and
 * the left, and round again until the text arrives. Sits over the box being written.
 */
export function WritingSpark({ label = 'Writing' }: { label?: string }) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setNow((n) => (n + 1) % (STEPS.length + 1)), 900);
    return () => clearInterval(t);
  }, []);
  const step = Math.min(now, STEPS.length - 1);
  return (
    <div className="qb-spark" role="status" aria-live="polite" aria-label={`${label}…`}>
      <svg className="qb-spark__svg" viewBox="0 0 24 24" aria-hidden="true">
        {[0, 90, 180, 270].map((a, i) => (
          <g key={a} transform={`rotate(${a} 12 12)`} className={i < now ? 'is-done' : i === now ? 'is-now' : ''}>
            <path d="M11 9.6 L13 9.6 L13 0.8 L11 3 Z" />
          </g>
        ))}
      </svg>
      <b key={step}>{STEPS[step]}…</b>
    </div>
  );
}
