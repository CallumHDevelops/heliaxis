/**
 * Roof plan from the OS footprint (north up) with the indicative panel layout.
 * Shared by the letters and the landing page. No QR or server dependencies.
 */
import { useId } from 'react';
import { ROOF_VIEWBOX } from '@/lib/prospectpv/roofSvg';
import type { LetterData } from '@/lib/prospectpv/types';

export const SAFE_PANEL_SVG = /^(?:<(?:line|polygon) class="pv-roof-(?:ridge|panel)"(?: [a-z0-9]+="[-0-9., ]+")+\/>)*$/;

/** Plan view from the OS footprint, north up, with the indicative panel layout. */
export function RoofPlan({
  roof,
  tone = 'light',
  grid = false,
  className,
}: {
  roof: LetterData['roof'];
  tone?: 'light' | 'ink-panels' | 'dark';
  grid?: boolean;
  className?: string;
}) {
  const gid = `pvg${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  // panelAreaSvg is generated server-side from numbers only; checked again here
  // before injecting because it round-trips through the database.
  const panels = SAFE_PANEL_SVG.test(roof.panelAreaSvg) ? roof.panelAreaSvg : '';
  const { width: W, height: H } = ROOF_VIEWBOX;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={`pv-roof pv-roof--${tone} ${className ?? ''}`}
      role="img"
      aria-label={`Plan view of your roof, facing ${roof.mainAspect.toLowerCase()}, with an indicative panel layout`}
    >
      {grid ? (
        <>
          <defs>
            <pattern id={gid} width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M10 0H0V10" fill="none" className="pv-roof-gridline" />
            </pattern>
          </defs>
          <rect width={W} height={H} fill={`url(#${gid})`} />
        </>
      ) : null}
      <path className="pv-roof-outline" d={roof.footprintSvgPath} fillRule="evenodd" />
      <g dangerouslySetInnerHTML={{ __html: panels }} />
      <g className="pv-roof-north">
        <path d="M285 12 l6 14 h-12 z" />
        <text x="285" y="40" textAnchor="middle">
          N
        </text>
      </g>
    </svg>
  );
}


export const ROOF_CSS = `
/* Roof plan */
.pv-roof{display:block;width:100%;height:auto}
.pv-roof-north path{fill:var(--ink)} .pv-roof-north text{font-family:var(--mono);font-size:11px;fill:var(--ink)}
.pv-roof-ridge{stroke:var(--ink);stroke-width:1.5;stroke-dasharray:5 4}
.pv-roof-gridline{stroke:rgba(33,31,24,.08);stroke-width:1}
.pv-roof--light .pv-roof-outline{fill:var(--card);stroke:var(--ink);stroke-width:2}
.pv-roof--light .pv-roof-panel{fill:var(--solar);stroke:var(--ink);stroke-width:1.1}
.pv-roof--ink-panels .pv-roof-outline{fill:var(--card);stroke:var(--ink);stroke-width:2.5}
.pv-roof--ink-panels .pv-roof-panel{fill:var(--ink);stroke:var(--solar);stroke-width:1.1}
.pv-roof--dark .pv-roof-outline{fill:none;stroke:var(--solar);stroke-width:2}
.pv-roof--dark .pv-roof-ridge{stroke:var(--solar)}
.pv-roof--dark .pv-roof-panel{fill:var(--solar);stroke:var(--ink);stroke-width:1.1}
.pv-roof--dark .pv-roof-north path{fill:var(--solar)} .pv-roof--dark .pv-roof-north text{fill:var(--solar)}
`;
