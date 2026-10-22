'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { conversionForHref, trackConversion } from '@/lib/conversion-events';

/**
 * Small behaviours for public pages, mounted once in the site layout:
 * - conversion events for phone / email / WhatsApp / case-study link clicks, and case-study page views;
 * - `--hx-hdr` (the sticky header's height) so a CMS section nav sticks just below the header and
 *   anchor jumps land below both;
 * - highlights the section-nav link for the section in view.
 */
export function SiteEnhancements() {
  const pathname = usePathname();

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a) return;
      const hit = conversionForHref(a.getAttribute('href') || '');
      if (hit) trackConversion(hit.name, hit.data);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  useEffect(() => {
    const header = document.querySelector<HTMLElement>('.site > header');
    if (!header) return;
    const set = () => document.documentElement.style.setProperty('--hx-hdr', `${header.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(header);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (document.querySelector('.pv-live[data-page-type="casestudy"]')) trackConversion('case-study-view');

    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('.pv-anav-links a[href^="#"]'));
    const targets = links
      .map((a) => {
        const id = decodeURIComponent((a.getAttribute('href') || '').slice(1));
        const el = id ? document.getElementById(id) : null;
        return el ? { a, el } : null;
      })
      .filter((x): x is { a: HTMLAnchorElement; el: HTMLElement } => x !== null);
    if (!targets.length) return;

    const mark = () => {
      const line = window.innerHeight * 0.35;
      let current: HTMLAnchorElement | null = null;
      for (const t of targets) {
        if (t.el.getBoundingClientRect().top <= line) current = t.a;
      }
      for (const t of targets) {
        if (t.a === current) t.a.setAttribute('aria-current', 'true');
        else t.a.removeAttribute('aria-current');
      }
      // Keep the active link visible in the horizontally scrolling bar (mobile) without moving the page.
      const bar = current?.parentElement;
      if (current && bar && bar.scrollWidth > bar.clientWidth) {
        bar.scrollLeft = current.offsetLeft - bar.offsetLeft - (bar.clientWidth - current.offsetWidth) / 2;
      }
    };
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(mark);
    };
    mark();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
    };
  }, [pathname]);

  return null;
}
