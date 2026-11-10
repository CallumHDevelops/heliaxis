/**
 * Landing page styles on the brand tokens. Mobile-first: one column up to 960 px,
 * then a wide layout with the estimate pinned beside the calculator.
 * Injected as a <style> block, scoped under .pvl so it can't leak into the site.
 */
import { ROOF_CSS } from '@/components/prospectpv/brand/RoofPlan';
import { CROSSHATCH_CSS, TOKENS_CSS } from '@/components/prospectpv/brand/tokens';

export const LANDING_CSS = `
${TOKENS_CSS}
${CROSSHATCH_CSS}
${ROOF_CSS}
.pvl .pv-xh{--xh-size:60px}
@media (prefers-reduced-motion:no-preference){html{scroll-behavior:smooth}}
.pvl{background:var(--paper);color:var(--ink);font-family:var(--body);min-height:100vh;-webkit-text-size-adjust:100%;font-size:16px;line-height:1.5}
.pvl *,.pvl *::before,.pvl *::after{box-sizing:border-box}
.pvl a{color:inherit}
.pvl :focus-visible{outline:3px solid var(--amber);outline-offset:2px}
.pvl h1,.pvl h2{font-family:var(--display);font-weight:900;letter-spacing:-0.015em;margin:0;text-wrap:balance}
.pvl-wrap{max-width:1160px;margin:0 auto;padding:0 20px}
.pvl-sec{padding-top:28px}
.pvl-sec:first-child{padding-top:0}
.pvl-sec h2,.pvl-how h2,.pvl-about h2,.pvl-bookintro h2{font-size:clamp(24px,3vw,34px);line-height:1.1;margin-top:4px}
.pvl-eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--amber-2);display:flex;align-items:center;gap:6px}
.pvl-note{font-size:12.5px;line-height:1.5;color:var(--muted);margin-top:10px}

/* buttons */
.pvl-btn{font:inherit;font-size:16px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;min-height:52px;padding:0 24px;border-radius:2px;
  border:1px solid var(--ink);text-decoration:none;cursor:pointer;color:var(--ink);background:var(--card)}
.pvl-btn--solar{background:var(--solar);border-color:var(--solar)}
.pvl-btn--solar:hover{background:#ffc93a}
.pvl-btn--ghost{background:transparent;color:var(--card);border-color:rgba(247,242,231,.45)}
.pvl-btn--ghost:hover{border-color:var(--card)}
.pvl-btn--block{display:flex;width:100%;margin-top:16px}

/* hero */
.pvl-hero{background:var(--ink);color:var(--paper);padding:14px 0 36px}
.pvl-bar{display:flex;justify-content:space-between;align-items:center;min-height:48px}
.pvl-bar a{color:var(--solar);font-weight:700;font-size:15px;min-height:44px;display:flex;align-items:center;text-decoration:none}
.pvl-herogrid{display:grid;gap:28px;margin-top:20px}
.pvl-hero h1{font-size:clamp(36px,10vw,44px);line-height:1.03;color:var(--card)}
.pvl-hero h1 span{color:var(--solar);display:inline-block}
.pvl-glad{margin:14px 0 0;font-size:19px;line-height:1.4;color:var(--card);font-weight:700}
.pvl-lede{margin:10px 0 0;font-size:16px;line-height:1.6;max-width:540px}
.pvl-cta{display:flex;gap:12px;flex-wrap:wrap;margin-top:22px}
.pvl-link{display:inline-flex;align-items:center;min-height:44px;margin-top:8px;color:var(--solar);font-size:14px}
.pvl-roofhero{background:rgba(247,242,231,.06);border:1px solid var(--line-d);border-radius:4px;padding:20px}
.pvl-roofhero .pvl-eyebrow{color:var(--solar)}
.pvl-roofhero h2{color:var(--card);font-size:24px;margin-top:4px}
.pvl-roofhero .pv-roof{margin-top:12px}
.pvl-roofstats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px;font-size:12px;color:var(--muted-d)}
.pvl-roofstats strong{display:block;font-size:17px;color:var(--card)}
.pvl-roofhero .pvl-note{color:var(--muted-d)}

/* trust strip */
.pvl-trust{background:var(--paper-2);border-bottom:1px solid var(--line)}
.pvl-trustin{display:flex;flex-direction:column;gap:12px;padding-top:16px;padding-bottom:16px;align-items:flex-start}
.pvl-trusttext{font-weight:700;font-size:14px}
.pvl-accred{height:44px;width:auto;max-width:100%;object-fit:contain;display:block}

/* tiles */
.pvl-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px}
.pvl-tiles--row{display:flex;gap:10px;margin:0}
.pvl-tiles div{background:var(--card);border:1px solid var(--line);border-radius:2px;padding:8px 14px;text-align:center;font-size:12px}
.pvl-tiles strong{display:block;font-size:17px}

/* how it works */
.pvl-how{padding-top:44px;padding-bottom:8px}
.pvl-steps{list-style:none;margin:20px 0 0;padding:0;display:grid;gap:12px}
.pvl-steps li{background:var(--card);border:1px solid var(--line);border-radius:4px;padding:18px}
.pvl-steps strong{display:block;font-size:17px;margin-top:10px;line-height:1.25}
.pvl-steps p{margin:6px 0 0;font-size:14px;color:var(--muted);line-height:1.5}
.pvl-stepnum{width:32px;height:32px;border-radius:50%;background:var(--solar);border:1px solid var(--ink);display:inline-flex;align-items:center;justify-content:center;font-family:var(--display);font-weight:900}

/* calculator + estimate */
.pvl-split{display:grid;gap:0;padding-top:44px;padding-bottom:12px}
.pvl-left{min-width:0}
.pvl-card{background:var(--card);border:1px solid var(--line);border-radius:4px;padding:16px;margin-top:12px}
.pvl-calc{display:flex;flex-direction:column;gap:22px;padding:20px}
.pvl-field{display:flex;flex-direction:column;gap:6px;font-size:15px;font-weight:600}
.pvl-field-head{display:flex;justify-content:space-between;gap:8px}
.pvl-field small{font-size:13px;font-weight:400;color:var(--muted)}
.pvl input[type=range]{width:100%;height:44px;margin:0;accent-color:var(--solar);background:transparent;cursor:pointer}
.pvl-pills{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:8px}
.pvl-pill{font:inherit;font-size:14px;font-weight:700;min-height:48px;border-radius:2px;cursor:pointer;color:var(--ink);background:var(--card);border:1px solid rgba(33,31,24,.3)}
.pvl-pill[aria-pressed=true]{background:var(--solar);border-color:var(--ink)}
.pvl-included{font-size:15px;line-height:1.5}
.pvl-included-head{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.pvl-included-head span,.pvl-price{font-family:var(--mono);font-size:13px;white-space:nowrap}
.pvl-included p{margin:2px 0 0;color:var(--muted)}
.pvl-stepper{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:15px;line-height:1.4}
.pvl-stepper .pvl-sub{color:var(--muted)}
.pvl-stepper-ctrl{display:flex;align-items:center;gap:6px}
.pvl-stepper button{width:48px;height:48px;border:1px solid rgba(33,31,24,.3);background:var(--card);border-radius:2px;font-size:22px;font-weight:700;cursor:pointer;color:var(--ink)}
.pvl-stepper button.pvl-plus{background:var(--solar);border-color:var(--ink)}
.pvl-stepper button:disabled{opacity:.35;cursor:not-allowed}
.pvl-stepper output{min-width:64px;text-align:center;font-weight:800;font-size:16px}
.pvl-extras{display:grid;gap:10px;margin-top:12px}
.pvl-extra{display:flex;gap:12px;align-items:flex-start;padding:14px;border-radius:2px;cursor:pointer;background:var(--card);border:1px solid var(--line);font-size:15px;line-height:1.4}
.pvl-extra:has(input:checked){background:rgba(248,188,30,.18);border-color:var(--ink)}
.pvl-extra input{width:22px;height:22px;margin:2px 0 0;accent-color:var(--ink);flex-shrink:0}
.pvl-x{flex:1}
.pvl-extra small{display:block;font-size:13px;color:var(--muted);margin-top:2px}
.pvl-right{margin-top:28px}
.pvl-est{background:var(--ink);color:var(--paper);border-radius:4px;padding:22px}
.pvl-est .pvl-eyebrow{color:var(--solar)}
.pvl-est-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:14px}
.pvl-est-grid div{font-size:12.5px;color:var(--muted-d)}
.pvl-est-grid b{display:block;font-family:var(--display);font-size:32px;font-weight:900;color:var(--card);line-height:1.15}
.pvl-est-grid b.pvl-gold{color:var(--solar)}
.pvl-est-grid b.pvl-sm{font-size:21px;font-weight:800}
.pvl-total{border-top:1px solid var(--line-d);margin-top:16px;padding-top:14px;display:flex;justify-content:space-between;align-items:baseline}
.pvl-total b{font-family:var(--display);font-size:30px;font-weight:900;color:var(--card)}
.pvl-est p{font-size:13.5px;line-height:1.5;margin:10px 0 0}
.pvl-est p strong{color:var(--card)}

/* about */
.pvl-about{display:grid;gap:24px;padding-top:44px;padding-bottom:44px;align-items:center}
.pvl-story{font-size:17px;line-height:1.6;margin:14px 0 0;max-width:560px}
.pvl-quote{margin:20px 0 0;padding:16px 20px;background:var(--card);border:1px solid var(--line);border-left:4px solid var(--solar);border-radius:2px;font-size:16px;line-height:1.5;max-width:560px}
.pvl-quote small{display:block;margin-top:8px;font-size:13px;color:var(--muted)}
.pvl-photo{display:block;width:100%;height:280px;object-fit:cover;border-radius:4px}

/* booking band */
.pvl-bookband{background:var(--solar);padding:44px 0 56px;position:relative;isolation:isolate;overflow:hidden}
.pvl-bookband::before{content:"";position:absolute;inset:0;z-index:-1;background-image:linear-gradient(to right,rgba(33,31,24,.08) 1px,transparent 1px),linear-gradient(to bottom,rgba(33,31,24,.08) 1px,transparent 1px);
  background-size:60px 60px;-webkit-mask-image:linear-gradient(150deg,#000,transparent 85%);mask-image:linear-gradient(150deg,#000,transparent 85%)}
.pvl-bookband .pvl-eyebrow{color:var(--ink)}
.pvl-bookgrid{display:grid;gap:28px}
.pvl-bookintro p{margin:12px 0 0;font-size:17px;line-height:1.5;max-width:460px}
.pvl-ticks{list-style:none;margin:18px 0 0;padding:0;display:grid;gap:10px;font-size:16px;font-weight:600}
.pvl-ticks li{display:flex;gap:10px;align-items:flex-start}
.pvl-ticks li::before{content:"";flex-shrink:0;width:20px;height:20px;margin-top:2px;border-radius:50%;background:var(--ink) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23F8BC1E' stroke-width='3'%3E%3Cpath d='M6 12.5l4 4 8-9'/%3E%3C/svg%3E") center/14px no-repeat}
.pvl-bookintro .pvl-phone{margin-top:20px;font-size:16px}
.pvl-bookintro .pvl-phone a{font-weight:800}
.pvl-formcard{background:var(--card);border:1px solid var(--ink);border-radius:4px;padding:22px}
.pvl-form{display:grid;gap:14px;font-size:15px}
.pvl-form label.pvl-in{display:flex;flex-direction:column;gap:5px;font-weight:600;min-width:0}
.pvl-form input[type=text],.pvl-form input[type=tel],.pvl-form input[type=email],.pvl-form select{
  font:inherit;font-weight:400;padding:12px;border:1px solid rgba(33,31,24,.3);border-radius:2px;background:#fff;color:var(--ink);min-height:48px;width:100%}
.pvl-form input[readonly]{background:var(--paper-2);border-color:var(--line)}
.pvl-form [aria-invalid=true]{border-color:#B3261E;border-width:2px}
.pvl-err{color:#B3261E;font-size:13px;font-weight:600}
.pvl-consent{display:flex;gap:10px;align-items:flex-start;font-size:14px;line-height:1.45;cursor:pointer}
.pvl-consent input{width:22px;height:22px;margin:0;flex-shrink:0;accent-color:var(--ink)}
.pvl-submit{font:inherit;font-size:17px;font-weight:800;background:var(--solar);color:var(--ink);border:1px solid var(--ink);border-radius:2px;min-height:56px;cursor:pointer;padding:0 16px}
.pvl-submit:hover{background:#f0b310}
.pvl-submit:disabled{opacity:.6;cursor:progress}
.pvl-hp{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}
.pvl-bookgrid .pvl-sec{padding-top:0}
.pvl-done{background:var(--card);border:1px solid var(--ink);border-radius:4px;padding:24px}
.pvl-done h2{font-size:24px}
.pvl-done p{margin:10px 0 0;font-size:16px;line-height:1.55}
.pvl-foot{padding:20px 0 44px;font-size:12.5px;line-height:1.7;color:var(--muted)}
.pvl-foot a{color:var(--muted);display:inline-flex;align-items:center;min-height:32px}
.pvl-center{max-width:520px;margin:0 auto;padding:48px 20px;font-size:16px;line-height:1.55}
.pvl-center h1{font-size:30px;margin:20px 0 10px}
.pvl-center p{margin:8px 0 0}
.pvl-center form{margin-top:20px}
@media (prefers-reduced-motion:no-preference){.pvl-done{animation:pvl-in .35s ease-out}@keyframes pvl-in{from{opacity:0;transform:translateY(6px)}}}

@media (min-width:640px){
  .pvl-wrap{padding:0 32px}
  .pvl-steps{grid-template-columns:repeat(2,minmax(0,1fr))}
  .pvl-extras{grid-template-columns:repeat(2,minmax(0,1fr))}
  .pvl-trustin{flex-direction:row;align-items:center;justify-content:space-between;gap:28px}
  .pvl-form .pvl-pair{display:grid;grid-template-columns:1fr 1fr;gap:14px}
}
@media (min-width:960px){
  .pvl-wrap{padding:0 40px}
  .pvl-hero{padding:18px 0 72px}
  .pvl-herogrid{grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:64px;align-items:center;margin-top:48px}
  .pvl-hero h1{font-size:clamp(48px,5.6vw,72px)}
  .pvl-glad{font-size:23px}
  .pvl-lede{font-size:18px}
  .pvl-roofhero{padding:28px}
  .pvl-roofhero h2{font-size:30px}
  .pvl-steps{grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin-top:24px}
  .pvl-how{padding-top:72px}
  .pvl-split{grid-template-columns:minmax(0,1fr) 400px;gap:48px;padding-top:72px;padding-bottom:20px;align-items:start}
  .pvl-right{margin-top:0}
  .pvl-sticky{position:sticky;top:24px}
  .pvl-sec+.pvl-sec{padding-top:48px}
  .pvl-about{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:64px;padding-top:72px;padding-bottom:72px}
  .pvl-photo{height:360px}
  .pvl-bookband{padding:72px 0 88px}
  .pvl-bookgrid{grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr);gap:64px;align-items:start}
  .pvl-formcard{padding:32px}
}
`;
