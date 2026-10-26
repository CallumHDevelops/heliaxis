'use client';

import { useEffect, useRef } from 'react';
import { StepQuoteForm } from '@/components/quote/StepQuoteForm';

/** The one-question-at-a-time survey form in a dialog over the estimate. Esc, the cross or a click outside closes it. */
export function SurveyModal({ open, onClose, who, postcode, picks, message }: { open: boolean; onClose: () => void; who: 'home' | 'business'; postcode: string; picks: string[]; message: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="est-modal" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="est-modal__box" role="dialog" aria-modal="true" aria-label="Book your free survey" ref={box}>
        <button type="button" className="est-modal__x" aria-label="Close" onClick={onClose}>
          ×
        </button>
        <p className="est-modal__lab">Your estimate is saved with this request</p>
        <StepQuoteForm variant="card" initialWho={who} initialPostcode={postcode} initialPicks={picks} message={message} source="solar-estimator" />
      </div>
    </div>
  );
}
