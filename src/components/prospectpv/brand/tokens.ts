/**
 * Heliaxis brand tokens (spec section 11; source of truth: BRAND.md).
 * Shared by the letter templates, the landing page and admin screens.
 *
 * --display lists Hanken Grotesk after Ezra so headings keep the right weight
 * and width until the self-hosted Ezra files are supplied ([TBC]).
 */
export const TOKENS = {
  ink: '#211F18',
  ink2: '#2c2820',
  solar: '#F8BC1E',
  amber: '#E39A0C',
  amber2: '#C77F04',
  paper: '#F7F2E7',
  paper2: '#EFE8D8',
  card: '#FFFDF8',
  muted: '#6E6A5E',
  mutedD: '#A69F8E',
  line: 'rgba(33,31,24,.14)',
  lineD: 'rgba(247,242,231,.16)',
} as const;

/** The same tokens limited to one wrapper, for screens that sit inside another app's page (the Heliaxis admin) and must not change its colours. */
export function scopedTokens(selector: string, overrides = ''): string {
  const body = TOKENS_CSS.replace(/^\s*:root\{/, '').replace(/\}\s*@media print[\s\S]*$/, '');
  return `${selector}{${body}${overrides}}`;
}

export const TOKENS_CSS = `
:root{
  --ink:${TOKENS.ink}; --ink-2:${TOKENS.ink2};
  --solar:${TOKENS.solar}; --amber:${TOKENS.amber}; --amber-2:${TOKENS.amber2};
  --paper:${TOKENS.paper}; --paper-2:${TOKENS.paper2}; --card:${TOKENS.card};
  --muted:${TOKENS.muted}; --muted-d:${TOKENS.mutedD};
  --line:${TOKENS.line}; --line-d:${TOKENS.lineD};
  --display:'Ezra','Hanken Grotesk',system-ui,sans-serif;
  --body:'Hanken Grotesk',system-ui,sans-serif;
  --mono:'JetBrains Mono',ui-monospace,monospace;
  --radius:2px;
  --xh-size:60px; --xh-ink:rgba(33,31,24,.05); --xh-paper:rgba(247,242,231,.05);
}
@media print{ :root{ --xh-ink:rgba(33,31,24,.10); --xh-paper:rgba(247,242,231,.10); } }
`;

/**
 * Cross-hatch: grid lines faded with a 150° linear mask, plus a warm gold
 * radial glow top-right on dark panels. 60 px on web, 30 px on letters;
 * 5% line opacity on screen, ~10% in print.
 * Usage: className="pv-xh" (on gold/light) or "pv-xh pv-xh--dark".
 */
export const CROSSHATCH_CSS = `
.pv-xh{position:relative;isolation:isolate;overflow:hidden}
.pv-xh::before{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;
  background-image:linear-gradient(to right,var(--xh-line,var(--xh-ink)) 1px,transparent 1px),
                   linear-gradient(to bottom,var(--xh-line,var(--xh-ink)) 1px,transparent 1px);
  background-size:var(--xh-size) var(--xh-size);
  -webkit-mask-image:linear-gradient(150deg,#000 0%,transparent 85%);
          mask-image:linear-gradient(150deg,#000 0%,transparent 85%)}
.pv-xh--dark{--xh-line:var(--xh-paper)}
.pv-xh--dark::after{content:"";position:absolute;inset:0;z-index:-2;pointer-events:none;
  background:radial-gradient(75% 75% at 95% -5%,rgba(248,188,30,.22),rgba(248,188,30,0) 60%)}
`;
