'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { TourStep } from '@/lib/updates';
import { Spark } from './Spark';
import styles from './GuideTour.module.css';

const SPOT_PAD = 6;

export default function GuideTour({
  steps,
  onClose,
  onStep,
}: {
  steps: TourStep[];
  onClose: () => void;
  onStep?: (step: TourStep, index: number) => void;
}) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [tip, setTip] = useState<{ left: number; top: number; placement: string }>({
    left: 0,
    top: 0,
    placement: 'center',
  });
  const tipRef = useRef<HTMLDivElement>(null);
  const lastRect = useRef<string>('');
  const step = steps[i];
  const last = i === steps.length - 1;

  const measure = useCallback(() => {
    if (!step?.target) {
      if (lastRect.current !== 'none') {
        lastRect.current = 'none';
        setRect(null);
      }
      return;
    }
    const el = document.querySelector(step.target) as HTMLElement | null;
    const r = el?.getBoundingClientRect();
    if (!r || (r.width === 0 && r.height === 0)) {
      if (lastRect.current !== 'none') {
        lastRect.current = 'none';
        setRect(null);
      }
      return;
    }
    // skip re-render when nothing moved
    const key = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(
      r.height
    )}`;
    if (key === lastRect.current) return;
    lastRect.current = key;
    setRect(r);
  }, [step]);

  // on step change: tell the parent (e.g. switch mobile tab), scroll target
  // into view, then measure once layout has settled
  useEffect(() => {
    onStep?.(step, i);
    const t = setTimeout(() => {
      if (step?.target) {
        const el = document.querySelector(step.target) as HTMLElement | null;
        el?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
      }
      measure();
    }, 90);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  // keep the spotlight glued to the target as things move
  useEffect(() => {
    const h = () => measure();
    window.addEventListener('resize', h);
    window.addEventListener('scroll', h, true);
    const id = window.setInterval(h, 250); // catch async layout / font shifts
    return () => {
      window.removeEventListener('resize', h);
      window.removeEventListener('scroll', h, true);
      window.clearInterval(id);
    };
  }, [measure]);

  // place the tooltip relative to the target (or centre it if none)
  useLayoutEffect(() => {
    const el = tipRef.current;
    const tw = el?.offsetWidth ?? 320;
    const th = el?.offsetHeight ?? 170;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 16;
    const m = 12;
    if (!rect) {
      setTip({ left: (vw - tw) / 2, top: (vh - th) / 2, placement: 'center' });
      return;
    }
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let placement = step?.placement && step.placement !== 'center' ? step.placement : '';
    if (!placement) {
      if (vh - rect.bottom >= th + gap) placement = 'bottom';
      else if (rect.top >= th + gap) placement = 'top';
      else if (vw - rect.right >= tw + gap) placement = 'right';
      else if (rect.left >= tw + gap) placement = 'left';
      else placement = 'bottom';
    }
    let left = 0;
    let top = 0;
    if (placement === 'bottom') {
      left = cx - tw / 2;
      top = rect.bottom + gap;
    } else if (placement === 'top') {
      left = cx - tw / 2;
      top = rect.top - th - gap;
    } else if (placement === 'right') {
      left = rect.right + gap;
      top = cy - th / 2;
    } else {
      left = rect.left - tw - gap;
      top = cy - th / 2;
    }
    left = Math.max(m, Math.min(left, vw - tw - m));
    top = Math.max(m, Math.min(top, vh - th - m));
    setTip({ left, top, placement });
  }, [rect, step, i]);

  const next = useCallback(() => {
    if (i < steps.length - 1) setI(i + 1);
    else onClose();
  }, [i, steps.length, onClose]);
  const back = useCallback(() => {
    if (i > 0) setI(i - 1);
  }, [i]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      else if (e.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [next, back, onClose]);

  return (
    <div className={styles.root} aria-live="polite">
      {rect ? (
        <div
          className={styles.spot}
          style={{
            left: rect.left - SPOT_PAD,
            top: rect.top - SPOT_PAD,
            width: rect.width + SPOT_PAD * 2,
            height: rect.height + SPOT_PAD * 2,
          }}
        />
      ) : (
        <div className={styles.dim} onClick={next} />
      )}
      <div
        ref={tipRef}
        className={`${styles.tip} ${styles['p_' + tip.placement] || ''}`}
        style={{ left: tip.left, top: tip.top }}
      >
        <div className={styles.head}>
          <Spark size={13} />
          <span className={styles.count}>
            Step {i + 1} of {steps.length}
          </span>
          <button className={styles.skip} onClick={onClose}>
            Skip tour
          </button>
        </div>
        <div className={styles.title}>{step.title}</div>
        <div className={styles.body}>{step.body}</div>
        <div className={styles.dots}>
          {steps.map((_, k) => (
            <button
              key={k}
              className={k === i ? styles.dotOn : styles.dot}
              onClick={() => setI(k)}
              aria-label={`Go to step ${k + 1}`}
            />
          ))}
        </div>
        <div className={styles.row}>
          <button className={styles.tBtn} onClick={back} disabled={i === 0}>
            Back
          </button>
          <button className={`${styles.tBtn} ${styles.primary}`} onClick={next}>
            {last ? 'Done' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  );
}
