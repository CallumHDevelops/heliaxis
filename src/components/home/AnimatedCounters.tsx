'use client';

import { useEffect } from 'react';

export function AnimatedCounters() {
  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function runCount(el: HTMLElement) {
      const target = parseFloat(el.dataset.target || el.dataset.count || '0');
      const dp = parseInt(el.dataset.dp || '0');

      if (prefersReduced) {
        el.textContent = target.toLocaleString('en-GB', {
          minimumFractionDigits: dp,
          maximumFractionDigits: dp,
        });
        return;
      }

      const dur = 1500;
      let t0: number | null = null;

      function step(t: number) {
        if (!t0) t0 = t;
        const k = Math.min(1, (t - t0) / dur);
        const e = 1 - Math.pow(1 - k, 3);
        el.textContent = (target * e).toLocaleString('en-GB', {
          minimumFractionDigits: dp,
          maximumFractionDigits: dp,
        });
        if (k < 1) requestAnimationFrame(step);
      }

      requestAnimationFrame(step);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            runCount(entry.target as HTMLElement);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.6 }
    );

    document.querySelectorAll('[data-count]').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return null;
}
