'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

/** Links that need a full page load: the CMS (its own stylesheet) and anything that isn't a page here. */
const hard = (href: string) => !/^\/admin(\/|$|\?|#)/.test(href) || /^\/admin\/cms(\/|$|\?|#)/.test(href);

/**
 * An article's HTML (src/lib/help/render.ts). Links to other pages of the app move without a page load,
 * as the menus do; a picture taller than it is wide is shown narrower (a phone screenshot), in its frame.
 */
export function HelpBody({ html, className }: { html: string; className?: string }) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const mark = (img: HTMLImageElement) => {
      if (img.naturalWidth && img.naturalHeight > img.naturalWidth * 1.25) img.closest('.hp-fig')?.classList.add('is-portrait');
    };
    const waiting: HTMLImageElement[] = [];
    const onLoad = (e: Event) => mark(e.currentTarget as HTMLImageElement);
    for (const img of root.querySelectorAll<HTMLImageElement>('.hp-fig img')) {
      if (img.complete) mark(img);
      else {
        img.addEventListener('load', onLoad);
        waiting.push(img);
      }
    }
    return () => waiting.forEach((img) => img.removeEventListener('load', onLoad));
  }, [html]);

  return (
    <div
      ref={ref}
      className={className}
      // Our own Markdown from the repo (trusted, as the setup guides are).
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={(e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const a = e.target instanceof Element ? e.target.closest('a') : null;
        const href = a?.getAttribute('href') ?? '';
        if (!a || a.target || hard(href)) return;
        e.preventDefault();
        router.push(href);
      }}
    />
  );
}
