'use client';

import { useEffect, useRef, useState } from 'react';
import { StepQuoteForm } from '@/components/quote/StepQuoteForm';
import './quote-drawer.css';

/**
 * The quote form in a drawer, for CMS pages that have "#quote" buttons but no form of their own. CmsBody gives those buttons the
 * quote page as their link (so they still work without JavaScript) plus a data-quote-drawer marker; a click on one opens this
 * instead, so the visitor stays on the page they were reading. Mounts only on pages that need it.
 */
export function QuoteDrawer() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      // Let new-tab and modified clicks go to the quote page as normal.
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const t = e.target;
      if (!(t instanceof Element) || !t.closest('a[data-quote-drawer]')) return;
      e.preventDefault();
      setOpen(true);
    }
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  // showModal gives focus handling, Escape to close and the dimmed backdrop without any extra code.
  useEffect(() => {
    const d = box.current;
    if (open && d && !d.open) d.showModal();
  }, [open]);

  if (!open) return null;
  return (
    <dialog
      ref={box}
      className="qd"
      aria-label="Get your free quote"
      onClose={() => setOpen(false)}
      onClick={(e) => {
        // A click on the dimmed area (the dialog itself, outside its box) closes it.
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
    >
      <div className="qd-box">
        <div className="qd-head">
          <b>Get your free quote</b>
          <button type="button" className="pv-btn dark" onClick={() => box.current?.close()}>
            Close
          </button>
        </div>
        <StepQuoteForm variant="card" source="cms-drawer" />
      </div>
    </dialog>
  );
}
