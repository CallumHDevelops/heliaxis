/**
 * Print stylesheet for the letter templates. A4 at 96 px/in (794 × 1123 px),
 * matching the design references. Injected as a <style> block so the same
 * markup renders in the admin preview and in headless Chromium for PDFs.
 *
 * Page variables (overridable per render from settings):
 *   --bleed      0mm or 3mm. Full-width bands run into the bleed.
 *   --addr-*     DL window zone for "The Homeowner" address block. Envelope
 *                format is [TBC]; defaults follow common DL window guidance
 *                (20 mm from the left, 45 mm from the top, 90 × 30 mm).
 *                Confirm with a test print from the chosen provider.
 */
import { ROOF_CSS } from '@/components/prospectpv/brand/RoofPlan';
import { CROSSHATCH_CSS, TOKENS_CSS } from '@/components/prospectpv/brand/tokens';

export const LETTER_CSS = `
${TOKENS_CSS}
${CROSSHATCH_CSS}
@page{size:A4;margin:0}
html,body{margin:0;padding:0}
.pv-page{
  --bleed:0mm; --xh-size:30px; --xh-ink:rgba(33,31,24,.10); --xh-paper:rgba(247,242,231,.08);
  --px:calc(20mm + var(--bleed));
  --addr-left:20mm; --addr-top:45mm; --addr-w:90mm; --addr-h:30mm;
  position:relative; width:calc(210mm + 2*var(--bleed)); height:calc(297mm + 2*var(--bleed));
  box-sizing:border-box; overflow:hidden; background:var(--card); color:var(--ink);
  font-family:var(--body); font-size:15px; line-height:1.5;
  display:flex; flex-direction:column; break-after:page; page-break-after:always;
  -webkit-print-color-adjust:exact; print-color-adjust:exact; text-rendering:geometricPrecision;
}
.pv-page.pv-bleed{--bleed:3mm}
.pv-page>*,.t3-main>*{flex-shrink:0}
.pv-page *,.pv-page *::before,.pv-page *::after{box-sizing:border-box}
.pv-page p{margin:0}
.pv-page p+p{margin-top:10px}
.pv-page h1,.pv-page h2,.pv-page h3{margin:0;font-family:var(--display);font-weight:900;letter-spacing:-0.015em;text-wrap:balance}
.pv-page strong{font-weight:800}

/* Address window + header reserve */
.pv-address{position:absolute;z-index:3;left:calc(var(--addr-left) + var(--bleed));top:calc(var(--addr-top) + var(--bleed));
  width:var(--addr-w);height:var(--addr-h);font-size:14px;line-height:1.5;overflow:hidden}
.pv-top{position:relative;min-height:calc(var(--addr-top) + var(--addr-h) + 5mm + var(--bleed));flex-shrink:0}
.pv-top-right{position:absolute;right:var(--px);top:calc(36px + var(--bleed));text-align:right}
.pv-meta{font-family:var(--mono);font-size:12px;color:var(--muted);line-height:1.6;margin-top:8px}

/* Common */
.pv-eyebrow{font-family:var(--mono);font-size:12px;letter-spacing:.14em;text-transform:uppercase;display:flex;align-items:center;gap:8px}
.pv-label{font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.pv-indicative{font-family:var(--mono);font-size:11px;letter-spacing:.06em;color:var(--muted);margin-top:8px}
.pv-img{display:block;width:100%;height:100%;object-fit:cover;border-radius:var(--radius)}
.pv-img--empty{background:var(--paper-2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;
  text-align:center;font-size:13px;color:var(--muted);padding:12px}
.pv-img--empty.pv-img--dark{background:var(--ink-2);border-color:var(--line-d);color:var(--muted-d)}
.pv-img--empty span{position:relative}
.pv-qr{display:block;border-radius:var(--radius)}
.pv-icon{stroke:var(--ink);stroke-width:1.8;fill:none;flex-shrink:0}
.pv-icon .pv-duo{fill:rgba(248,188,30,.3)}
.pv-iconbox{width:34px;height:34px;background:var(--paper-2);border:1px solid var(--line);border-radius:var(--radius);
  display:flex;align-items:center;justify-content:center}
.pv-footer{margin-top:auto;padding:12px var(--px) calc(24px + var(--bleed));font-size:12px;line-height:1.45;color:var(--muted)}
.pv-footer::before{content:"";display:block;border-top:1px solid var(--line);margin-bottom:12px}
.pv-footer--back{display:flex;flex-wrap:wrap;gap:14px;align-items:center}
.pv-footer--back::before{flex:0 0 100%;margin-bottom:0}
.pv-footer-text{flex:1}
.pv-accreditations{width:140px;height:40px;object-fit:contain}
.pv-accreditations--empty{border:1px dashed rgba(33,31,24,.35);display:flex;align-items:center;justify-content:center;font-size:11px}
.pv-finance-example{margin-top:6px;font-weight:700}
.pv-signature{height:40px;width:170px;margin:6px 0;object-fit:contain;object-position:left}
.pv-signature--empty{border:1px dashed rgba(33,31,24,.3);display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--muted)}
.pv-price-num{font-family:var(--display);font-weight:900;line-height:1.05;letter-spacing:-0.01em}
.pv-rows>div{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--line)}
.pv-rows>div:last-child{border-bottom:0}
.pv-rows>div>span:first-child{white-space:nowrap}
.pv-rows strong{text-align:right}

${ROOF_CSS}
/* ===================== 1 · Classic ===================== */
.t1-band{background:var(--ink);color:var(--card);padding:calc(26px + var(--bleed)) var(--px) 26px;display:flex;align-items:center;justify-content:space-between}
.t1-band-meta{text-align:right;font-size:13px;line-height:1.5;color:var(--muted-d)}
.t1 .pv-top-right{top:calc(110px + var(--bleed))}
.t1-intro{padding:0 var(--px)}
.t1-intro h1{font-size:36px;line-height:1.12}
.t1-hl{background:var(--solar);padding:0 6px;box-decoration-break:clone;-webkit-box-decoration-break:clone}
.t1-intro p{margin-top:14px;font-size:16px;line-height:1.55;max-width:620px}
.t1-grid{padding:22px var(--px) 0;display:grid;grid-template-columns:1fr 1fr;gap:18px}
.t1-roofcard{background:var(--paper);border:1px solid var(--line);border-radius:4px;padding:16px 18px}
.t1-roofcard .pv-roof{margin-top:8px}
.t1-caption{font-size:12px;color:var(--muted);margin-top:4px}
.t1-est{border:1px solid var(--line);border-radius:4px;padding:6px 18px 12px}
.t1-est .pv-label{padding:10px 0 4px}
.t1-strip{margin:20px var(--px) 0;background:var(--solar);border-radius:4px;padding:18px 22px;display:flex;gap:20px;align-items:center}
.t1-strip h3{font-size:21px;line-height:1.15;min-width:200px}
.t1-strip p{font-size:14.5px;line-height:1.5}
.t1-sign{padding:20px var(--px) 0;display:flex;justify-content:space-between;align-items:flex-end}
.t1-cta{display:flex;gap:14px;align-items:center;text-align:right;font-size:14px;line-height:1.45}
.t1-backband{background:var(--ink);color:var(--card);padding:calc(14px + var(--bleed)) var(--px) 14px;display:flex;align-items:center;justify-content:space-between}
.t1-backband span{font-family:var(--mono);font-size:11px;letter-spacing:.08em;color:var(--muted-d)}
.t1-backhead{padding:22px var(--px) 0}
.t1-backhead h2{font-size:32px;line-height:1.1}
.t1-backhead p{margin-top:6px;font-size:16px;color:var(--muted)}
.t1-pkg{padding:16px var(--px) 0;display:grid;grid-template-columns:200px 1fr;gap:22px;align-items:start}
.t1-pkg .pv-img{height:250px}
.t1-pkg-right{display:flex;flex-direction:column;gap:10px;font-size:14px}
.t1-price{background:var(--ink);color:var(--card);border-radius:4px;padding:16px 20px}
.t1-price .pv-label{color:var(--muted-d)}
.t1-price .pv-price-num{font-size:40px;color:var(--solar);margin-top:2px}
.t1-price small{display:block;font-size:12.5px;color:var(--muted-d);margin-top:2px}
.t1-why{padding:20px var(--px) 0}
.t1-why .pv-label{margin-bottom:12px}
.t1-why-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px 20px;font-size:13px;line-height:1.45}
.t1-why-grid strong{display:flex;align-items:center;gap:8px;font-size:14px;margin-bottom:3px}
.t1-bottom{padding:20px var(--px) 0;display:grid;grid-template-columns:1fr 1fr;gap:20px}
.t1-fin{background:var(--solar);border-radius:4px;padding:14px 18px;font-size:12.5px;line-height:1.5}
.t1-fin h3,.t1-next h3{font-size:18px;margin-bottom:6px}
.t1-next{font-size:14px;line-height:1.6}
.t1-next ol{margin:0;padding-left:20px}
.t1-next .pv-call{margin-top:8px;font-weight:700}

/* ===================== 2 · Bold Dark ===================== */
.t2-band{background:var(--ink);color:var(--card);padding:24px var(--px) 24px;display:grid;grid-template-columns:1fr 230px;gap:24px;align-items:center}
.t2-band .pv-eyebrow{color:var(--solar)}
.t2-num{font-family:var(--display);font-size:124px;font-weight:900;line-height:.92;color:var(--solar);margin-top:10px;letter-spacing:-0.02em}
.t2-caption{font-family:var(--display);font-size:30px;font-weight:800;line-height:1.12;margin-top:8px;text-wrap:balance}
.t2-sub{font-size:16px;color:var(--muted-d);margin-top:8px}
.t2-stats{padding:16px var(--px) 0;display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.t2-stats>div{border-top:3px solid var(--solar);padding-top:10px}
.t2-stats .pv-label{font-size:10.5px}
.t2-stats strong{display:block;font-family:var(--display);font-size:22px;font-weight:800;margin-top:4px}
.t2-stats-note{padding:0 var(--px)}
.t2-body{padding:14px var(--px) 0;font-size:15px;line-height:1.55}
.t2-cta{margin:16px var(--px) 0;display:flex;align-items:center;gap:18px;border:1px solid var(--ink);border-radius:4px;padding:12px 18px}
.t2-cta strong{font-size:19px;display:block}
.t2-backband{background:var(--ink);color:var(--card);padding:calc(32px + var(--bleed)) var(--px) 28px;display:grid;grid-template-columns:1fr 220px;gap:28px;align-items:center}
.t2-backband .pv-eyebrow{color:var(--solar)}
.t2-backband h2{font-size:46px;line-height:1.02;margin-top:8px}
.t2-backband .t2-line{font-size:16px;color:var(--muted-d);margin-top:10px}
.t2-backband .pv-label{color:var(--muted-d);margin-top:16px;display:block}
.t2-backband .pv-price-num{font-size:56px;color:var(--solar)}
.t2-backband small{display:block;font-size:13px;color:var(--muted-d);margin-top:6px}
.t2-backband .pv-img{height:240px}
.t2-cols{padding:20px var(--px) 0;display:grid;grid-template-columns:1fr 1fr;gap:32px}
.t2-cols h3{font-size:18px;margin-bottom:8px}
.t2-list>div{padding:5px 0;border-bottom:1px solid var(--line);font-size:14px}
.t2-list>div:last-child{border-bottom:0}
.t2-why{display:flex;flex-direction:column;gap:6px;font-size:13.5px;line-height:1.4}
.t2-fin{margin-top:20px;background:var(--solar);padding:18px var(--px);display:grid;grid-template-columns:230px 1fr;gap:24px;align-items:center}
.t2-fin h3{font-size:28px;line-height:1.05}
.t2-fin div{font-size:13.5px;line-height:1.45}
.t2-steps{padding:18px var(--px) 0}
.t2-steps h3{font-size:18px;margin-bottom:8px}
.t2-steps-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;font-size:13px;line-height:1.45}
.t2-steps-grid b{display:block;font-family:var(--display);font-size:28px;font-weight:900;line-height:1.1}

/* ===================== 3 · Personal Letter ===================== */
.t3{flex-direction:row}
.t3-strip{width:calc(14px + var(--bleed));background:var(--solar);flex-shrink:0}
.t3-main{flex:1;display:flex;flex-direction:column;position:relative}
.t3 .pv-footer{padding-left:58px}
.t3-main{--px:58px}
.t3 .pv-address{left:calc(var(--addr-left) + var(--bleed))}
.t3-letterhead{font-size:12px;color:var(--muted);line-height:1.55;margin-top:8px}
.t3-content{padding:0 64px 0 58px;font-size:15.5px;line-height:1.6}
.t3-date{font-size:14px;color:var(--muted)}
.t3-content h1{font-size:25px;line-height:1.25;font-weight:800;margin-top:14px}
.t3-content .t3-p{margin-top:14px}
.t3-est{margin-top:14px;display:grid;grid-template-columns:1fr 1fr;border:1px solid var(--line);border-radius:4px;font-size:14.5px}
.t3-est>div{padding:10px 16px;border-bottom:1px solid var(--line)}
.t3-est>div:nth-child(odd){border-right:1px solid var(--line)}
.t3-est>div:nth-last-child(-n+2){border-bottom:0}
.t3-est strong{display:block;font-size:16px}
.t3-sign{margin-top:18px;display:flex;justify-content:space-between;align-items:flex-end}
.t3-sign-left{display:flex;gap:14px;align-items:center}
.t3-photo{width:76px;height:76px;border-radius:50%;object-fit:cover;flex-shrink:0}
.t3-photo--empty{border:1px solid var(--line);background:var(--paper-2);display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--muted)}
.t3-qr{text-align:center;font-size:12px;font-weight:600}
.t3-qr .pv-qr{margin-bottom:4px}
.t3-back{padding:calc(44px + var(--bleed)) 64px 0 58px;font-size:14px}
.t3-back-head{display:flex;justify-content:space-between;align-items:baseline}
.t3-back-head h2{font-size:28px}
.t3-back-head span{font-size:12px;color:var(--muted)}
.t3-imgs{margin-top:18px;display:grid;grid-template-columns:1fr 1fr;gap:16px}
.t3-imgs .pv-img{height:190px}
.t3-cols{margin-top:20px;display:grid;grid-template-columns:1fr 1fr;gap:28px}
.t3-cols h3{font-size:16px;font-weight:800;margin-bottom:6px}
.t3-cols .pv-rows>div{padding:6px 0}
.t3-price{margin-top:14px;border:1px solid var(--ink);border-radius:4px;padding:12px 16px}
.t3-price .pv-price-num{font-size:34px}
.t3-price small{font-size:12px;color:var(--muted)}
.t3-ticks{display:flex;flex-direction:column;gap:8px;line-height:1.45}
.t3-ticks>div{display:flex;gap:8px}
.t3-ticks svg{flex-shrink:0;margin-top:2px;stroke:var(--amber-2);stroke-width:2.5;fill:none}
.t3-box{margin-top:22px;background:var(--paper);border:1px solid var(--line);border-radius:4px;padding:16px 20px;line-height:1.5}
.t3-box h3{font-size:16px;font-weight:800;margin-bottom:4px}
.t3-next{margin-top:18px;line-height:1.55}

/* ===================== 4 · Roof Report ===================== */
.t4-bar{margin:0 var(--px);border-top:3px solid var(--ink);border-bottom:1px solid var(--ink);padding:12px 0;display:flex;justify-content:space-between;align-items:center}
.t4-bar h1,.t4-bar h2{font-size:25px;font-weight:800;letter-spacing:0}
.t4-bar .t4-ref{font-family:var(--mono);font-size:12px;text-align:right;line-height:1.5}
.t4-grid{padding:20px var(--px) 0;display:grid;grid-template-columns:1.2fr 1fr;gap:22px}
.t4-roof{border:1px solid var(--line);border-radius:4px;padding:12px}
.t4-legend{display:flex;gap:16px;font-size:12px;margin-top:8px;color:var(--muted)}
.t4-legend span{display:flex;align-items:center;gap:6px}
.t4-swatch{width:14px;height:10px;background:var(--solar);border:1px solid var(--ink)}
.t4-dash{width:16px;border-top:2px dashed var(--ink)}
.t4-assess{font-size:14px}
.t4-assess .pv-label{margin-bottom:4px;display:block}
.t4-pill{background:var(--solar);padding:0 8px;border-radius:2px}
.t4-tiles{padding:20px var(--px) 0;display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.t4-tiles>div{background:var(--ink);color:var(--card);border-radius:4px;padding:12px 14px}
.t4-tiles .pv-label{color:var(--muted-d);font-size:10.5px}
.t4-tiles b{display:block;font-family:var(--display);font-size:30px;font-weight:800;color:var(--solar);line-height:1.2}
.t4-tiles b small{font-size:14px;font-weight:700}
.t4-tiles-note{padding:0 var(--px)}
.t4-rec{padding:18px var(--px) 0;font-size:15.5px;line-height:1.55}
.t4-cta{margin:18px var(--px) 0;display:flex;align-items:center;gap:18px;background:var(--solar);border-radius:4px;padding:14px 18px;font-size:15px;line-height:1.45}
.t4-cta strong{font-size:18px}
.t4-back{padding-top:calc(44px + var(--bleed))}
.t4-equip{padding:20px var(--px) 0;display:grid;grid-template-columns:1fr 180px;gap:22px}
.t4-equip table{width:100%;border-collapse:collapse;font-size:13.5px}
.t4-equip th{text-align:left;padding:6px 0;font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;border-bottom:2px solid var(--ink)}
.t4-equip td{padding:8px 8px 8px 0;border-bottom:1px solid var(--line)}
.t4-equip tr:last-child td{border-bottom:0}
.t4-equip .num{text-align:right;padding-right:0}
.t4-equip .pv-img{height:230px}
.t4-feat{padding:20px var(--px) 0}
.t4-feat-grid{display:grid;grid-template-columns:1fr 1fr;column-gap:28px;font-size:14px;line-height:1.45;margin-top:6px}
.t4-feat-grid>div{display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--line)}
.t4-feat-grid>div span:first-child{font-family:var(--mono);font-weight:700;color:var(--amber-2)}
.t4-pricing{padding:20px var(--px) 0;display:grid;grid-template-columns:1fr 1.3fr;gap:16px}
.t4-pricebox{background:var(--ink);color:var(--card);border-radius:4px;padding:16px 18px}
.t4-pricebox .pv-label{color:var(--muted-d)}
.t4-pricebox .pv-price-num{font-size:38px;color:var(--solar);margin-top:4px}
.t4-pricebox small{font-size:12px;color:var(--muted-d)}
.t4-finbox{border:1px solid var(--ink);border-radius:4px;padding:14px 18px;font-size:13px;line-height:1.5}
.t4-finbox h3{font-size:16px;font-weight:800;letter-spacing:0;margin-bottom:2px}
.t4-steps{padding:20px var(--px) 0}
.t4-steps-grid{display:grid;grid-template-columns:repeat(4,1fr);font-size:13px;line-height:1.4;margin-top:8px}
.t4-steps-grid>div{border-top:3px solid var(--solar);padding:8px 10px 0 0}

/* ===================== 5 · Brand Hero ===================== */
.t5-hero{background:var(--solar);padding:30px var(--px) 28px}
.t5-hero-grid{display:grid;grid-template-columns:1fr 230px;gap:24px;align-items:center}
.t5-hero h1{margin-top:12px;font-size:52px;line-height:1.02}
.t5-lead{font-size:17px;line-height:1.5;margin-top:12px;font-weight:500}
.t5-chips{display:flex;gap:8px;margin-top:20px;flex-wrap:wrap}
.t5-chips>div{background:var(--card);border:1px solid var(--line);border-radius:2px;padding:7px 13px;font-size:14px}
.t5-hero .pv-indicative{color:var(--ink);opacity:.7}
.t5-body{padding:24px var(--px) 0;display:grid;grid-template-columns:1fr 210px;gap:24px;font-size:15.5px;line-height:1.55}
.t5-body .pv-img{height:180px}
.t5-qr{margin:22px var(--px) 0;background:var(--ink);color:var(--paper);border-radius:2px;padding:18px 22px;display:flex;align-items:center;gap:20px;font-size:15px;line-height:1.45}
.t5-qr .pv-eyebrow{color:var(--solar)}
.t5-qr h3{font-family:var(--display);font-size:21px;font-weight:800;margin:4px 0 2px;color:var(--card);letter-spacing:-0.01em}
.t5-back-top{padding:calc(36px + var(--bleed)) var(--px) 0;display:grid;grid-template-columns:200px 1fr;gap:26px;align-items:start}
.t5-back-top .pv-img{height:270px}
.t5-back-top .pv-eyebrow{color:var(--amber-2)}
.t5-back-top h2{font-size:42px;line-height:1.02;margin-top:6px}
.t5-spec{font-size:14.5px;line-height:1.55;margin-top:8px}
.t5-pricetag{margin-top:12px;display:inline-block;background:var(--solar);border-radius:2px;padding:12px 18px}
.t5-pricetag .pv-label{color:var(--ink);font-size:12px;letter-spacing:.14em}
.t5-pricetag .pv-price-num{font-size:38px}
.t5-pricetag small{font-size:12px}
.t5-benefits{padding:22px var(--px) 0}
.t5-benefits h3{font-size:21px;margin-bottom:10px}
.t5-bgrid{display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid var(--line);border-left:1px solid var(--line)}
.t5-bgrid>div{padding:10px 12px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);font-size:13px;line-height:1.45}
.t5-bgrid .t5-bhead{display:flex;justify-content:space-between;align-items:flex-start}
.t5-bgrid .t5-bnum{font-family:var(--mono);font-size:12px;color:var(--muted)}
.t5-bgrid strong{display:block;font-size:14px;margin:6px 0 1px}
.t5-fin{margin-top:20px;background:var(--ink);color:var(--paper);padding:18px var(--px);display:grid;grid-template-columns:220px 1fr;gap:24px;align-items:center}
.t5-fin h3{font-size:28px;line-height:1.02;color:var(--solar)}
.t5-fin div{font-size:13.5px;line-height:1.45}
.t5-fin .pv-finance-example{color:var(--card)}
.t5-steps{padding:16px var(--px) 0;display:grid;grid-template-columns:repeat(4,1fr) 110px;gap:12px;align-items:start;font-size:13px;line-height:1.4}
.t5-steps>div:not(.t5-steps-qr){border-top:2px solid var(--solar);padding-top:8px}
.t5-steps b{display:block;font-family:var(--mono);font-size:12px;font-weight:500;color:var(--amber-2)}
.t5-steps-qr{align-self:end;text-align:center;font-family:var(--mono);font-size:12px}
.t5-steps-qr .pv-qr{margin:0 auto 4px}
.t5-goldline{height:calc(12px + var(--bleed));background:var(--solar);flex-shrink:0}
.t5 .pv-footer--back{padding-bottom:18px}
`;
