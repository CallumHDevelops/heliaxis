'use client';

import { useEffect, useRef } from 'react';

type Props = { html: string };

type Handler = { el: Element; fn: EventListener; event: string };

const SOCIAL_GLYPHS = [
  'linkedin',
  'whatsapp',
  'facebook',
  'instagram',
  'x',
  'youtube',
  'google',
] as const;

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function buildSocialGlyphSvg(iconSvg: SVGSVGElement): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 48 48">
  <circle cx="24" cy="24" r="24" fill="#211F18"/>
  <svg x="13" y="13" width="22" height="22" viewBox="0 0 24 24" fill="#F8BC1E">${iconSvg.innerHTML}</svg>
</svg>`;
}

async function renderSvgToPng(
  svgMarkup: string,
  width: number,
  height: number,
): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svgMarkup], { type: 'image/svg+xml' }));

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');

    ctx.drawImage(image, 0, 0, width, height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('PNG export failed'));
      }, 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function renderSocialGlyphPng(iconSvg: SVGSVGElement, size: number): Promise<Blob> {
  return renderSvgToPng(buildSocialGlyphSvg(iconSvg), size, size);
}

/** Hover chip with a real thumbnail of the file that will download. */
function attachPreviewChip(
  el: Element,
  opts: {
    previewSrc?: string;
    previewHtml?: string;
    label: string;
    dark?: boolean;
  },
) {
  if (el.querySelector(':scope > .brand-dl-chip')) return;

  el.classList.add('brand-dl');
  if (el instanceof HTMLElement) {
    const pos = getComputedStyle(el).position;
    if (pos === 'static') el.style.position = 'relative';
  }

  const chip = document.createElement('span');
  chip.className = `brand-dl-chip${opts.dark ? ' is-dark' : ''}`;
  chip.setAttribute('aria-hidden', 'true');

  const thumb = document.createElement('span');
  thumb.className = 'brand-dl-thumb';

  if (opts.previewHtml) {
    thumb.innerHTML = opts.previewHtml;
  } else if (opts.previewSrc) {
    const img = document.createElement('img');
    img.src = opts.previewSrc;
    img.alt = '';
    img.draggable = false;
    thumb.appendChild(img);
  }

  const meta = document.createElement('span');
  meta.className = 'brand-dl-meta';
  meta.innerHTML = `<strong>Download</strong><em>${opts.label}</em>`;

  chip.appendChild(thumb);
  chip.appendChild(meta);
  el.appendChild(chip);
}

function wireClick(el: Element, fn: EventListener, handlers: Handler[]) {
  el.addEventListener('click', fn);
  handlers.push({ el, fn, event: 'click' });
}

export function BrandContent({ html }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const handlers: Handler[] = [];

    // Social / lockup / post previews served via /api/brand/view
    root.querySelectorAll<HTMLImageElement>('img[src*="/api/brand/view/"]').forEach((img) => {
      const name = img.getAttribute('src')?.split('/').pop();
      if (!name) return;

      const host =
        (img.closest('.prev, .avatar, .wideprev') as Element | null) || img;

      attachPreviewChip(host, {
        previewSrc: `/api/brand/view/${name}`,
        label: name.replace(/^heliaxis-/, ''),
        dark: Boolean(
          host.classList?.contains?.('wideprev') ||
            host.closest?.('.fill-dark, .dark'),
        ),
      });

      wireClick(
        host,
        () => {
          window.location.href = `/api/brand/asset/${name}`;
        },
        handlers,
      );
    });

    // Spark mark in "The idea"
    root.querySelectorAll('.idea .mark').forEach((mark) => {
      const spark = mark.querySelector('svg');
      attachPreviewChip(mark, {
        previewHtml: spark
          ? `<span class="brand-dl-spark">${spark.outerHTML}</span>`
          : undefined,
        previewSrc: spark ? undefined : '/api/brand/view/heliaxis-spark.svg',
        label: 'spark.svg',
        dark: true,
      });
      wireClick(
        mark,
        () => {
          window.location.href = '/api/brand/asset/heliaxis-spark.svg';
        },
        handlers,
      );
    });

    // Logo wordmarks (embedded base64 in page — preview uses those images)
    root.querySelectorAll('.logobox').forEach((box) => {
      const isDark = box.classList.contains('dark');
      const filename = isDark ? 'heliaxis-logo-light.png' : 'heliaxis-logo.png';
      const img = box.querySelector('img');
      attachPreviewChip(box, {
        previewSrc: img?.getAttribute('src') || `/api/brand/view/${filename}`,
        label: filename.replace(/^heliaxis-/, ''),
        dark: isDark,
      });
      wireClick(
        box,
        () => {
          window.location.href = `/api/brand/asset/${filename}`;
        },
        handlers,
      );
    });

    // Duotone icon tiles
    root.querySelectorAll('.ic-card').forEach((card) => {
      const svg = card.querySelector('.ic-tile svg');
      const label =
        card.querySelector(':scope > span:last-child')?.textContent?.trim() || 'icon';
      if (!svg) return;

      const clone = svg.cloneNode(true) as SVGSVGElement;
      clone.setAttribute('width', '28');
      clone.setAttribute('height', '28');
      attachPreviewChip(card, {
        previewHtml: clone.outerHTML,
        label: `${label}.svg`,
      });

      wireClick(
        card,
        () => {
          const markup = new XMLSerializer().serializeToString(svg);
          triggerDownload(
            new Blob([markup], { type: 'image/svg+xml' }),
            `heliaxis-icon-${label}.svg`,
          );
        },
        handlers,
      );
    });

    // Platform glyphs — high-res PNG
    root.querySelectorAll('.socrow .soc').forEach((soc, index) => {
      const name = SOCIAL_GLYPHS[index];
      if (!name) return;
      const iconSvg = soc.querySelector('svg');
      if (!iconSvg) return;

      const previewUrl = URL.createObjectURL(
        new Blob([buildSocialGlyphSvg(iconSvg)], { type: 'image/svg+xml' }),
      );
      attachPreviewChip(soc, {
        previewSrc: previewUrl,
        label: `${name}.png · 1024px`,
        dark: true,
      });

      wireClick(
        soc,
        async () => {
          try {
            const png = await renderSocialGlyphPng(iconSvg, 1024);
            triggerDownload(png, `heliaxis-glyph-${name}.png`);
          } catch {
            triggerDownload(
              new Blob([buildSocialGlyphSvg(iconSvg)], { type: 'image/svg+xml' }),
              `heliaxis-glyph-${name}.svg`,
            );
          }
        },
        handlers,
      );
    });

    // Cross-hatch card fills — 2400×1600 PNG
    root.querySelectorAll('.fill.dark').forEach((fill) => {
      attachPreviewChip(fill, {
        previewSrc: '/api/brand/view/heliaxis-card-fill-dark.svg',
        label: 'card-fill-dark.png · 2400×1600',
        dark: true,
      });
      wireClick(
        fill,
        async () => {
          try {
            const res = await fetch('/api/brand/view/heliaxis-card-fill-dark.svg', {
              credentials: 'same-origin',
            });
            if (!res.ok) throw new Error('fetch failed');
            const png = await renderSvgToPng(await res.text(), 2400, 1600);
            triggerDownload(png, 'heliaxis-card-fill-dark.png');
          } catch {
            window.location.href = '/api/brand/asset/heliaxis-card-fill-dark.svg';
          }
        },
        handlers,
      );
    });

    root.querySelectorAll('.fill.light').forEach((fill) => {
      attachPreviewChip(fill, {
        previewSrc: '/api/brand/view/heliaxis-card-fill-light.svg',
        label: 'card-fill-light.png · 2400×1600',
      });
      wireClick(
        fill,
        async () => {
          try {
            const res = await fetch('/api/brand/view/heliaxis-card-fill-light.svg', {
              credentials: 'same-origin',
            });
            if (!res.ok) throw new Error('fetch failed');
            const png = await renderSvgToPng(await res.text(), 2400, 1600);
            triggerDownload(png, 'heliaxis-card-fill-light.png');
          } catch {
            window.location.href = '/api/brand/asset/heliaxis-card-fill-light.svg';
          }
        },
        handlers,
      );
    });

    // Assets download cards — replace PNG/SVG text badges with real thumbnails
    root.querySelectorAll<HTMLAnchorElement>('a.dl[href*="/api/brand/asset/"]').forEach((link) => {
      const filename = link.getAttribute('href')?.split('/').pop();
      if (!filename) return;

      const dico = link.querySelector('.dico');
      if (!dico) return;

      const ext = filename.split('.').pop()?.toLowerCase();
      // Icon sheet is a symbol library (display:none) — keep type badge
      const canPreview =
        (ext === 'png' || ext === 'svg' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp') &&
        !filename.includes('icons.svg') &&
        !filename.includes('card-fills.css');
      if (!canPreview) return;

      dico.classList.add('has-thumb');
      if (
        filename.includes('logo-light') ||
        filename.includes('spark') ||
        filename.includes('fill-dark') ||
        filename.includes('lockup-dark') ||
        filename.includes('profile-dark') ||
        filename.includes('linkedin') ||
        filename.includes('post-') ||
        filename.includes('social-square')
      ) {
        dico.classList.add('thumb-dark');
      } else {
        dico.classList.add('thumb-light');
      }

      dico.replaceChildren();
      const img = document.createElement('img');
      img.src = `/api/brand/view/${filename}`;
      img.alt = '';
      img.draggable = false;
      dico.appendChild(img);
    });

    return () => {
      handlers.forEach(({ el, fn, event }) => el.removeEventListener(event, fn));
    };
  }, [html]);

  return (
    <div
      ref={rootRef}
      className="brand-kit-page"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
