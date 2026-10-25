'use client';

import { useEffect, useState } from 'react';
import { THEME_EVENT } from '@/lib/theme/shared';

/*
 * What this browser does to a light page. A browser that darkens websites leaves computed colours
 * alone, but the system colour Canvas follows the colour scheme it actually paints with, so a hidden
 * probe per scheme shows whether it darkens, and whether `only light` (what Light uses) stops it.
 */
type Reading = {
  ua: string;
  prefersDark: boolean;
  light: string;
  onlyLight: string;
  dark: string;
  theme: string;
  pref: string;
  meta: string;
  root: string;
};

function canvasFor(scheme: string) {
  const d = document.createElement('div');
  d.style.cssText = `display:none;background-color:canvas;color-scheme:${scheme}`;
  document.body.appendChild(d);
  const v = getComputedStyle(d).backgroundColor;
  d.remove();
  return v;
}

function read(): Reading {
  const html = document.documentElement;
  return {
    ua: navigator.userAgent,
    prefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
    light: canvasFor('light'),
    onlyLight: canvasFor('only light'),
    dark: canvasFor('dark'),
    theme: html.getAttribute('data-theme') || '–',
    pref: html.getAttribute('data-theme-pref') || '–',
    meta: document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]')?.content || '–',
    root: getComputedStyle(html).colorScheme,
  };
}

function isDark(rgb: string) {
  const [r, g, b] = (rgb.match(/\d+(\.\d+)?/g) ?? []).map(Number);
  return r !== undefined && 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
}

function browserOf(ua: string) {
  if (/SamsungBrowser/.test(ua)) return 'Samsung Internet';
  if (/EdgA\//.test(ua)) return 'Edge';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/OPR\//.test(ua)) return 'Opera';
  if (/; wv\)/.test(ua)) return 'an in-app browser';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'this browser';
}

function verdict(r: Reading) {
  const browser = browserOf(r.ua);
  if (!isDark(r.light)) return { tone: 'ok', text: `${browser} isn’t darkening pages on this phone.` };
  if (!isDark(r.onlyLight))
    return { tone: 'ok', text: `${browser} darkens websites, but lets a page ask to stay light. Light should look light.` };
  return {
    tone: 'bad',
    text: `${browser} darkens every page, whatever the page asks for, so Light can’t stay light while that setting is on.`,
  };
}

export function CheckView() {
  const [r, setR] = useState<Reading | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let frame = 0;
    const run = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setR(read()));
    };
    run();
    const mq = matchMedia('(prefers-color-scheme: dark)');
    window.addEventListener(THEME_EVENT, run);
    mq.addEventListener('change', run);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener(THEME_EVENT, run);
      mq.removeEventListener('change', run);
    };
  }, []);

  if (!r) return <p className="tc-wait">Checking…</p>;
  const v = verdict(r);
  const lines = [
    `Browser: ${browserOf(r.ua)}`,
    `Phone in dark mode: ${r.prefersDark ? 'yes' : 'no'}`,
    `Light page painted: ${r.light}`,
    `Light page that asks to stay light: ${r.onlyLight}`,
    `Dark page: ${r.dark}`,
    `Chosen: ${r.pref} (showing ${r.theme}), meta ${r.meta}, page ${r.root}`,
    r.ua,
  ];

  async function copy() {
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
    } catch {
      /* no clipboard: the screenshot does the same job */
    }
  }

  return (
    <>
      <p className={`tc-verdict tc-verdict--${v.tone}`}>{v.text}</p>
      <div className="tc-swatch">
        <span>This box should be cream with dark writing when Light is chosen.</span>
      </div>
      <ul className="tc-lines">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <button type="button" className="tc-copy" onClick={copy}>
        {copied ? 'Copied' : 'Copy the results'}
      </button>
    </>
  );
}
