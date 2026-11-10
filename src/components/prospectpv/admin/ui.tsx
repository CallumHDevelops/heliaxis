'use client';
/** Small form pieces shared by the admin screens. */
import { cloneElement, useEffect, useId, useRef, useState, type ReactElement } from 'react';

/**
 * A labelled control. The label names the control; help and error text sit
 * outside the label and are linked with aria-describedby, so screen readers
 * hear a short name first and the detail after.
 */
export function Field({ label, help, error, unit, children, className }: { label: string; help?: string; error?: string; unit?: string; children: ReactElement; className?: string }) {
  const id = useId();
  const described = [unit ? `${id}-u` : null, help ? `${id}-h` : null, error ? `${id}-e` : null].filter(Boolean).join(' ') || undefined;
  const control = cloneElement(children as ReactElement<Record<string, unknown>>, { id, 'aria-describedby': described });
  return (
    <div className={`pva-field ${className ?? ''}`}>
      <label htmlFor={id}>{label}</label>
      {unit ? <span className="pva-inwrap">{control}<span className="pva-unit" id={`${id}-u`}>{unit}</span></span> : control}
      {help ? <small id={`${id}-h`}>{help}</small> : null}
      {error ? <span className="pva-err" id={`${id}-e`} role="alert">{error}</span> : null}
    </div>
  );
}

export function Toggle({ label, help, checked, onChange, disabled }: { label: string; help?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <div>
      <label className="pva-toggle">
        <input type="checkbox" checked={checked} disabled={disabled} aria-describedby={help ? `${id}-h` : undefined} onChange={(e) => onChange(e.target.checked)} />
        <span>{label}</span>
      </label>
      {help ? <small className="pva-toggle-help" id={`${id}-h`}>{help}</small> : null}
    </div>
  );
}

/**
 * Shows an HTML document (a letter) scaled to fit its box. The iframe keeps the
 * letter's real page width (794 px for one A4 page) so what you see is what prints.
 */
export function ScaledFrame({ html, width = 794, height = 1123, title }: { html: string; width?: number; height?: number; title: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, el.clientWidth / width));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="pva-frame" ref={box} style={{ height: height * scale }}>
      <iframe title={title} srcDoc={html} sandbox="" width={width} height={height} style={{ transform: `scale(${scale})` }} />
    </div>
  );
}

export const asNum = (s: string): number => (s.trim() === '' ? Number.NaN : Number(s.replace(/[£,\s]/g, '')));
