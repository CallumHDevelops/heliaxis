'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { StepQuoteForm } from '@/components/quote/StepQuoteForm';

/**
 * The one-question-at-a-time survey form over the estimate. It is drawn at the top level of the page, above the site header
 * and the WhatsApp button, with a close button that is always in reach: Esc, the cross or a tap outside closes it.
 * What we already know from the estimate (type of property, address, what they want) is not asked again.
 */
export function SurveyModal({ open, onClose, who, postcode, address, picks, message }: { open: boolean; onClose: () => void; who: 'home' | 'business'; postcode: string; address: string; picks: string[]; message: string }) {
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
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div className="est-modal" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="est-modal__box" role="dialog" aria-modal="true" aria-label="Book your free survey">
        <div className="est-modal__bar">
          <span className="est-modal__lab">Free survey request</span>
          <button type="button" className="est-modal__x" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
            <span>Close</span>
          </button>
        </div>
        <div className="est-modal__body">
          {address && (
            <p className="est-modal__for">
              Survey for <b>{address}</b>. Your estimate comes with it.
            </p>
          )}
          <StepQuoteForm variant="card" initialWho={who} initialPostcode={postcode} initialPicks={picks} message={message} source="solar-estimator" />
        </div>
      </div>
    </div>,
    // Inside the site wrapper (it carries the colours and fonts), at the top of the page, above the header.
    document.querySelector('.site') ?? document.body,
  );
}
