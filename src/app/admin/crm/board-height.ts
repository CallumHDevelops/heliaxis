'use client';

import { useEffect, type RefObject } from 'react';

/**
 * A board box that ends at the bottom of the window, so its sideways scrollbar is on screen without
 * scrolling down (each column scrolls by itself inside it). The CSS has a fair guess for the first
 * paint (`--crmb-top`, how far down the page the box starts); this measures it once the page is up
 * and again whenever the page above it changes height.
 */
export function useBoardHeight(box: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let frame = 0;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const top = Math.round(el.getBoundingClientRect().top + window.scrollY);
        if (el.style.getPropertyValue('--crmb-top') !== `${top}px`) el.style.setProperty('--crmb-top', `${top}px`);
      });
    };
    fit();
    const ro = new ResizeObserver(fit);
    const above = el.parentElement;
    if (above) ro.observe(above);
    window.addEventListener('resize', fit);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, [box]);
}
