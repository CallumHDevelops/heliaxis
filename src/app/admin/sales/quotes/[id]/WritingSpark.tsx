'use client';

import { useEffect, useState } from 'react';

const WRITING_STEPS = ['Reading your items', 'Choosing the wording', 'Putting it together', 'Checking it reads right'];

/**
 * The estimator's spark, for while the quote is being written: its top arm lights first, then the right, the bottom and
 * the left, and round again until the text arrives. Sits over the box being written.
 */
export function WritingSpark({ label = 'Writing', steps = WRITING_STEPS, stepMs = 900, screen = false }: { label?: string; steps?: string[]; stepMs?: number; screen?: boolean }) {
  const [now, setNow] = useState(0);
  const [ticks, setTicks] = useState(0);
  useEffect(() => {
    const t = setInterval(() => {
      setNow((n) => (n + 1) % 5);
      setTicks((k) => k + 1);
    }, 900);
    return () => clearInterval(t);
  }, []);
  // The arms keep circling; the words move on every stepMs and rest on the last one.
  const step = Math.min(Math.floor((ticks * 900) / stepMs), steps.length - 1);
  return (
    <div className={screen ? 'qb-spark qb-spark--screen' : 'qb-spark'} role="status" aria-live="polite" aria-label={`${label}…`}>
      <svg className="qb-spark__svg" viewBox="0 0 24 24" aria-hidden="true">
        {[0, 90, 180, 270].map((a, i) => (
          <g key={a} transform={`rotate(${a} 12 12)`} className={i < now ? 'is-done' : i === now ? 'is-now' : ''}>
            <path d="M11 9.6 L13 9.6 L13 0.8 L11 3 Z" />
          </g>
        ))}
      </svg>
      <b key={step}>{steps[step]}…</b>
    </div>
  );
}
