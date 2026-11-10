/** Admin styles, scoped under .pva. Same brand tokens as letters and the landing page. */
import { ROOF_CSS } from '@/components/prospectpv/brand/RoofPlan';
import { CROSSHATCH_CSS, scopedTokens } from '@/components/prospectpv/brand/tokens';

export const ADMIN_CSS = `
${scopedTokens('.pva', '--display:inherit;--body:inherit;')}
${CROSSHATCH_CSS}
${ROOF_CSS}
.pva{background:var(--paper);color:var(--ink);font-family:var(--body);font-size:15px;line-height:1.5;border-radius:6px;overflow:hidden}
.pva *,.pva *::before,.pva *::after{box-sizing:border-box}
.pva a{color:inherit}
.pva :focus-visible{outline:3px solid var(--amber);outline-offset:2px}
.pva h1,.pva h2,.pva h3{font-family:var(--display);font-weight:900;letter-spacing:-0.015em;margin:0}
.pva-nav{display:flex;gap:2px;flex-wrap:wrap;padding:0 24px;border-bottom:1px solid var(--line);background:var(--card)}
.pva-nav a{padding:14px 14px 11px;text-decoration:none;font-size:14px;font-weight:600;color:var(--muted);border-bottom:3px solid transparent}
.pva-nav a:hover{color:var(--ink)}
.pva-nav a[aria-current=page]{color:var(--ink);border-bottom-color:var(--solar)}
.pva-main{padding:24px 24px 48px}
.pva-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-bottom:20px}
.pva-head h1{font-size:30px;line-height:1.1}
.pva-head p{margin:6px 0 0;color:var(--muted);max-width:640px}
.pva-card{background:var(--card);border:1px solid var(--line);border-radius:4px;padding:20px}
.pva-card+.pva-card{margin-top:16px}
.pva-card h2{font-size:19px;margin-bottom:4px}
.pva-card>p.pva-blurb{margin:0 0 16px;color:var(--muted);font-size:14px;max-width:720px}
  border:1px solid var(--ink);background:var(--card);color:var(--ink);cursor:pointer;text-decoration:none;white-space:nowrap}
.pv-danger{color:#B3261E!important;border-color:#B3261E!important}
.pva-chip{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;padding:2px 9px;border-radius:99px;border:1px solid var(--line);background:var(--card);white-space:nowrap}
.pva-chip--live{background:var(--solar);border-color:var(--ink)}
.pva-chip--warn{color:#8A5A00;border-color:var(--amber);background:rgba(248,188,30,.12)}
.pva-chip--ok{border-color:var(--ink)}
.pva-muted{color:var(--muted)}
.pva-mono{font-family:var(--mono);font-size:13px}

/* forms */
.pva-form{display:flex;flex-direction:column;gap:18px}
.pva-fs{border:0;padding:0;margin:0;min-width:0}
.pva-fs>legend{font-family:var(--display);font-weight:900;font-size:17px;padding:0;margin-bottom:10px}
/* a fieldset that is also a card: keep its border and padding, and let the legend sit inside as a heading */
.pva-fs.pva-card{border:1px solid var(--line);padding:20px;margin:0}
.pva-fs.pva-card>legend{float:left;width:100%;margin:0 0 14px}
.pva-fs.pva-card>legend+*{clear:both}
.pva-form>.pva-card+.pva-card{margin-top:0}
.pva-grid{display:grid;gap:14px;grid-template-columns:repeat(var(--cols,2),minmax(0,1fr))}
.pva-span2{grid-column:span 2}
.pva-grid--3{--cols:3}.pva-grid--4{--cols:4}.pva-grid--1{--cols:1}
.pva-field{display:flex;flex-direction:column;gap:5px;font-size:14px;font-weight:600;min-width:0}
.pva-field small{font-weight:400;font-size:12.5px;color:var(--muted);line-height:1.4}
.pva-field .pva-err{font-weight:600}
.pva-inwrap{display:flex;align-items:stretch}
.pva-inwrap input{border-radius:2px 0 0 2px;min-width:0}
.pva-inwrap input:only-child{border-radius:2px}
.pva-unit{display:flex;align-items:center;padding:0 10px;border:1px solid rgba(33,31,24,.3);border-left:0;border-radius:0 2px 2px 0;background:var(--paper-2);font-size:13px;font-weight:600;color:var(--muted);white-space:nowrap}
.pva input[type=text],.pva input[type=number],.pva input[type=search],.pva input[type=tel],.pva select,.pva textarea{
  font:inherit;font-weight:400;color:var(--ink);background:#fff;border:1px solid rgba(33,31,24,.3);border-radius:2px;padding:9px 11px;min-height:42px;width:100%}
.pva textarea{min-height:84px;resize:vertical}
.pva input[aria-invalid=true],.pva select[aria-invalid=true],.pva textarea[aria-invalid=true]{border-color:#B3261E;border-width:2px}
.pva-err{color:#B3261E;font-size:13px}
.pva-toggle{display:flex;gap:10px;align-items:flex-start;font-size:14px;font-weight:600;cursor:pointer}
.pva-toggle input{width:20px;height:20px;margin:1px 0 0;accent-color:var(--ink);flex-shrink:0}
.pva-toggle-help{display:block;margin:2px 0 0 30px;font-weight:400;color:var(--muted);font-size:12.5px;line-height:1.4}
.pva-checks{display:flex;flex-wrap:wrap;gap:8px 18px}
.pva-checks label{display:flex;gap:8px;align-items:center;font-size:14px;cursor:pointer}
.pva-checks input{width:18px;height:18px;accent-color:var(--ink)}
.pva-actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.pva-note{font-size:13px;color:var(--muted);line-height:1.5}
.pva-alert{border:1px solid var(--amber);background:rgba(248,188,30,.12);border-radius:4px;padding:12px 16px;font-size:14px}
.pva-alert ul{margin:6px 0 0;padding-left:20px}
.pva-alert--err{border-color:#B3261E;background:rgba(179,38,30,.06)}
.pva-ok{color:#1C6B34;font-weight:700;font-size:14px}

/* tables */
.pva-tablewrap{overflow-x:auto;border:1px solid var(--line);border-radius:4px;background:var(--card)}
.pva-table{width:100%;border-collapse:collapse;font-size:14px}
.pva-table th{text-align:left;font-size:12.5px;font-weight:700;color:var(--muted);padding:11px 14px;border-bottom:1px solid var(--line);background:var(--paper);white-space:nowrap}
.pva-table td{padding:12px 14px;border-bottom:1px solid var(--line);vertical-align:middle}
.pva-table tr:last-child td{border-bottom:0}
.pva-table tbody tr:hover{background:rgba(248,188,30,.07)}
.pva-table td.num,.pva-table th.num{text-align:right}
.pva-addr{font-weight:700;text-decoration:none}
.pva-addr:hover{text-decoration:underline}
.pva-filters{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:14px}
.pva-filters .pva-field{font-size:13px}
.pva-filters input[type=search]{min-width:260px}
.pva-empty{text-align:center;padding:56px 20px;border:1px dashed rgba(33,31,24,.35);border-radius:4px;background:var(--card)}
.pva-empty h2{font-size:22px;margin-bottom:6px}
.pva-empty p{margin:0 auto 18px;max-width:440px;color:var(--muted)}
.pva-pager{display:flex;justify-content:space-between;align-items:center;margin-top:14px;font-size:14px;color:var(--muted)}

/* two-column workbench */
.pva-bench{display:grid;gap:24px;grid-template-columns:minmax(0,1fr) 400px;align-items:start}
.pva-side{position:sticky;top:16px;display:flex;flex-direction:column;gap:16px}
.pva-sum{display:grid;gap:0}
.pva-sum>div{display:flex;justify-content:space-between;gap:14px;padding:9px 0;border-bottom:1px solid var(--line);font-size:14px}
.pva-sum>div:last-child{border-bottom:0}
.pva-sum strong{text-align:right}
.pva-big{font-family:var(--display);font-weight:900;font-size:30px;line-height:1.1}
.pva-dark{background:var(--ink);color:var(--paper);border-radius:4px;padding:18px 20px}
.pva-dark .pva-eyebrow{color:var(--solar)}
.pva-dark .pva-muted{color:var(--muted-d)}
.pva-eyebrow{font-family:var(--mono);font-size:12px;letter-spacing:.1em;color:var(--amber-2);display:flex;gap:6px;align-items:center}
.pva-figs{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:10px}
.pva-figs div{font-size:12.5px;color:var(--muted-d)}
.pva-figs b{display:block;font-family:var(--display);font-size:26px;font-weight:900;color:var(--card);line-height:1.15}
.pva-figs b.gold{color:var(--solar)}
.pva-fit{display:flex;gap:8px;align-items:center;font-size:13.5px;font-weight:600}
.pva-fit--bad{color:#B3261E}

/* packages */
.pva-pkgs{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(330px,1fr))}
.pva-pkg{background:var(--card);border:1px solid var(--line);border-radius:4px;padding:18px;display:flex;flex-direction:column;gap:12px}
.pva-pkg--off{background:transparent;border-style:dashed}
.pva-pkg-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
.pva-pkg h3{font-size:22px;line-height:1.1}
.pva-pkg .band{font-family:var(--mono);font-size:12.5px;color:var(--muted)}
.pva-kit{margin:0;padding:0;list-style:none;font-size:14px;display:grid;gap:3px}
.pva-kit li{display:flex;gap:8px}
.pva-kit li span:first-child{color:var(--muted);min-width:96px}
.pva-price{font-family:var(--display);font-weight:900;font-size:26px}
.pva-pkg-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:auto}
.pva-editor{border:2px solid var(--ink);margin-bottom:20px}
.pva-xrow{display:grid;gap:10px;grid-template-columns:minmax(150px,1fr) minmax(200px,2fr) 130px 90px auto;align-items:start;padding:12px 0;border-bottom:1px solid var(--line)}
.pva-xrow:last-child{border-bottom:0}

/* settings + images */
.pva-assets{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(250px,1fr))}
.pva-asset{border:1px solid var(--line);border-radius:4px;padding:14px;background:var(--card);display:flex;flex-direction:column;gap:10px}
.pva-asset h3{font-size:15px;font-family:var(--body);font-weight:800;letter-spacing:0}
.pva-thumb{height:90px;border:1px dashed rgba(33,31,24,.35);border-radius:2px;display:flex;align-items:center;justify-content:center;background:
  repeating-conic-gradient(#efe8d8 0 25%,#fffdf8 0 50%) 0 0/16px 16px;overflow:hidden;font-size:13px;color:var(--muted);text-align:center;padding:6px}
.pva-thumb img{max-width:100%;max-height:100%;object-fit:contain}
.pva-thumb--dark{background:var(--ink)}
.pva-sections{display:flex;flex-direction:column;gap:16px}
.pva-section{scroll-margin-top:16px}

/* letter detail */
.pva-frames{display:grid;gap:18px;grid-template-columns:1fr 1fr}
.pva-frame{border:1px solid var(--line);border-radius:2px;background:#fff;overflow:hidden;position:relative}
.pva-frame iframe{border:0;display:block;transform-origin:top left;pointer-events:none}
.pva-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}
.pva-tabs a{padding:7px 14px;border:1px solid var(--line);border-radius:2px;text-decoration:none;font-size:13.5px;font-weight:600;background:var(--card)}
.pva-tabs a[aria-current=true]{background:var(--ink);color:var(--card);border-color:var(--ink)}
.pva-timeline{list-style:none;margin:0;padding:0;display:grid;gap:0}
.pva-timeline li{display:flex;gap:14px;padding:10px 0;border-bottom:1px solid var(--line);font-size:14px}
.pva-timeline li:last-child{border-bottom:0}
.pva-timeline time{color:var(--muted);min-width:132px;font-size:13px}
.pva-dl{display:grid;grid-template-columns:auto 1fr;gap:8px 18px;font-size:14px;margin:0}
.pva-dl dt{color:var(--muted)}
.pva-dl dd{margin:0;font-weight:600}

@media (max-width:1000px){
  .pva-bench{grid-template-columns:1fr}
  .pva-side{position:static}
  .pva-frames{grid-template-columns:1fr}
  .pva-xrow{grid-template-columns:1fr 1fr}
}
@media (max-width:640px){
  .pva-grid,.pva-grid--3,.pva-grid--4{--cols:1}
  .pva-span2{grid-column:auto}
  .pva-nav a{padding:12px 10px 10px}
  .pva-main{padding:20px 16px 48px}
}
`;
