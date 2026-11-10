/**
 * Shared building blocks for the five letter templates. All colours, fonts,
 * the spark and the cross-hatch come from the brand tokens.
 */
import { Fragment, type ReactNode } from 'react';
import { Spark } from '@/components/prospectpv/brand/Spark';
import { BENEFITS } from '@/lib/prospectpv/claims';
import { qrMatrix } from '@/lib/prospectpv/qr';
import type { ClaimKey, LetterData } from '@/lib/prospectpv/types';
import type { Copy } from './copy';

export { RoofPlan } from '@/components/prospectpv/brand/RoofPlan';

export type TemplateProps = {
  data: LetterData;
  copy: Copy;
  /** Preview shows labelled placeholders for empty image slots; print shows a brand panel. */
  preview?: boolean;
};

/** Renders copy with **bold** and blank-line paragraphs. */
export function Rich({ text, as = 'p', className }: { text: string; as?: 'p' | 'span' | 'div'; className?: string }) {
  const Tag = as;
  const paras = as === 'p' ? text.split(/\n\s*\n/) : [text];
  return (
    <>
      {paras.map((para, i) => (
        <Tag key={i} className={className}>
          {para.split('**').map((part, j) => (j % 2 ? <strong key={j}>{part}</strong> : <Fragment key={j}>{part}</Fragment>))}
        </Tag>
      ))}
    </>
  );
}

/**
 * "The Homeowner" address block, positioned absolutely in the DL window zone
 * (--addr-left / --addr-top, set from settings). Templates reserve space for it.
 */
export function AddressWindow({ data }: { data: LetterData }) {
  const a = data.address;
  return (
    <div className="pv-address" aria-label="Postal address">
      The Homeowner
      <br />
      {a.line1}
      {a.line2 ? (
        <>
          <br />
          {a.line2}
        </>
      ) : null}
      <br />
      {a.town}
      <br />
      {a.postcode}
    </div>
  );
}

/** QR as a vector path on a white tile with a quiet zone. */
export function QrCode({ url, size, className }: { url: string; size: number; className?: string }) {
  const { size: n, path } = qrMatrix(url);
  const q = 2;
  return (
    <svg
      viewBox={`${-q} ${-q} ${n + 2 * q} ${n + 2 * q}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={`pv-qr ${className ?? ''}`}
      role="img"
      aria-label="QR code linking to your personal results page"
    >
      <rect x={-q} y={-q} width={n + 2 * q} height={n + 2 * q} fill="#FFFFFF" />
      <path d={path} fill="#211F18" />
    </svg>
  );
}

/** Photo slot. Empty slots show a label in preview and a quiet brand panel in print. */
export function ImageSlot({
  url,
  label,
  className,
  preview,
  dark,
}: {
  url?: string;
  label: string;
  className?: string;
  preview?: boolean;
  dark?: boolean;
}) {
  if (url) return <img src={url} alt="" className={`pv-img ${className ?? ''}`} />;
  return (
    <div className={`pv-img pv-img--empty pv-xh ${dark ? 'pv-xh--dark pv-img--dark' : ''} ${className ?? ''}`}>
      {preview ? <span>[Image: {label}]</span> : <Spark size={28} />}
    </div>
  );
}

export function Eyebrow({ children, spark = true, className }: { children: ReactNode; spark?: boolean; className?: string }) {
  return (
    <div className={`pv-eyebrow ${className ?? ''}`}>
      {spark ? <Spark size={14} color="currentColor" /> : null}
      {children}
    </div>
  );
}

/** Duotone icons: gold 30% fill behind an ink outline. */
const ICONS: Record<ClaimKey, ReactNode> = {
  ai_tariff: (
    <>
      <circle cx="12" cy="12" r="9" className="pv-duo" />
      <path d="M12 7v5l3 2" fill="none" />
    </>
  ),
  safety: <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" className="pv-duo" />,
  heating: <path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z" className="pv-duo" />,
  expandable: (
    <>
      <path d="M12 3l9 5-9 5-9-5z" className="pv-duo" />
      <path d="M3 13l9 5 9-5" fill="none" />
    </>
  ),
  backup: <path d="M13 2L4 14h7l-1 8 9-12h-7z" className="pv-duo" />,
  all_in_one: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="1.5" className="pv-duo" />
      <path d="M9 7h6M9 11h6" fill="none" />
    </>
  ),
};

export function BenefitIcon({ claim, size = 20 }: { claim: ClaimKey; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="pv-icon" aria-hidden="true">
      {ICONS[claim]}
    </svg>
  );
}

export const benefitsFor = (data: LetterData) => data.package.claims.map((k) => BENEFITS[k]);

/** The finance block. Renders nothing unless finance is enabled for this letter. */
export function FinanceExample({ data }: { data: LetterData }) {
  if (!data.finance.enabled) return null;
  return <div className="pv-finance-example">{data.finance.exampleText}</div>;
}

/** Shared back-page footer: finance/FCA line only when finance is on. */
export function BackFooter({ data, className }: { data: LetterData; className?: string }) {
  return (
    <div className={`pv-footer pv-footer--back ${className ?? ''}`}>
      <div className="pv-footer-text">
        {data.finance.enabled ? (
          <>
            Finance provided by {data.finance.lenderName}, subject to status. {data.finance.fcaWording} Warm Homes loans
            come from participating lenders; this letter is not from the government.{' '}
          </>
        ) : null}
        Heliaxis Limited, {data.company.registeredDetails}
      </div>
      {data.images.accreditations ? (
        <img className="pv-accreditations" src={data.images.accreditations} alt="MCS, RECC and NAPIT accreditations" />
      ) : (
        <div className="pv-accreditations pv-accreditations--empty">[MCS · RECC · NAPIT]</div>
      )}
    </div>
  );
}

export function FrontFooter({ copy, className }: { copy: Copy; className?: string }) {
  return <div className={`pv-footer ${className ?? ''}`}>{copy('frontFooter')}</div>;
}

export function Signature({ data, preview }: { data: LetterData; preview?: boolean }) {
  if (data.sender.signatureUrl) return <img className="pv-signature" src={data.sender.signatureUrl} alt="" />;
  return <div className="pv-signature pv-signature--empty">{preview ? '[Signature]' : ''}</div>;
}

export function steps(copy: Copy) {
  return [copy('step1'), copy('step2'), copy('step3'), copy('step4')];
}

/** Wording for the "where did this come from" notes. Only OS-scanned roofs may claim aerial data. */
export const indicativeNote = (data: LetterData) =>
  data.source === 'manual' ? 'Indicative estimate' : 'Indicative estimate from aerial data';
export const layoutNote = (data: LetterData) =>
  data.source === 'manual'
    ? 'Illustrative layout based on the roof details we hold.'
    : 'Illustrative layout from Ordnance Survey building data.';
