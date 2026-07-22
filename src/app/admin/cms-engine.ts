/* eslint-disable */
// @ts-nocheck

/**
 * CMS Engine — extracted from public/pages/cms.html
 * All original JS logic, executed after the DOM shell mounts.
 * Functions are attached to window so onclick attributes continue working.
 */
import { CMS_FORM_RUNTIME_SCRIPT, CMS_FAQ_RUNTIME_SCRIPT, initCmsFormRuntime, initPvFaq } from '@/lib/cms-form-runtime';
import { accentText } from '@/lib/cms-accent-text';

export function initCms(options?: { initialPageSlug?: string | null }): void {
window.initCmsFormRuntime = initCmsFormRuntime;
window.initPvFaq = initPvFaq;
initCmsFormRuntime();
var CMS_INITIAL_SLUG = options?.initialPageSlug || null;
/* ---- Supabase-backed storage shim: wires the page-builder to /api/cms ---- */
window.storage = {
  async get(key){
    try {
      const r = await fetch('/api/cms?key=' + encodeURIComponent(key), { credentials:'same-origin', cache:'no-store' });
      if (!r.ok) return null;
      const d = await r.json();
      return (d && d.value != null) ? { value: d.value } : null;
    } catch (e) { return null; }
  },
  async set(key, value){
    const r = await fetch('/api/cms', {
      method:'POST', headers:{'Content-Type':'application/json'}, credentials:'same-origin',
      body: JSON.stringify({ key, value: String(value) })
    });
    if (!r.ok) {
      let msg = 'Save failed';
      try { const d = await r.json(); msg = d.error || msg; } catch (e) {}
      if (r.status === 401) throw new Error('Sign in as an approved admin to save to Supabase.');
      throw new Error(msg);
    }
    return true;
  }
};
window.publishSite = async function(){
  const r = await fetch('/api/cms/publish', { method:'POST', credentials:'same-origin' });
  if (!r.ok) { let m='Publish failed'; try { m=(await r.json()).error||m; } catch(e){} throw new Error(m); }
  return true;
};

/* ============ ICON SET ============ */
const ICONS={
 solar:{o:['M4 16l2-9h12l2 9z','M3 16h18','M9 7L8 16','M15 7l1 9','M6 11.5h12'],f:'M4 16l2-9h12l2 9z'},
 battery:{o:['M6 5h12v16H6z','M10 5V3h4v2','M13 9l-3 5h4l-3 4'],f:'M6 5h12v16H6z'},
 heatpump:{o:['M3 7h18v11H3z','M12 9a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7','M12 10.5v4','M10 12.5h4'],f:'M3 7h18v11H3z'},
 ev:{o:['M6 20V9a2.5 2.5 0 0 1 2.5-2.5h5A2.5 2.5 0 0 1 16 9v11','M4 20h14','M16 11h2.5l2 2v5a1.75 1.75 0 0 1-3.5 0v-3','M11 9l-1.5 3H12l-1.5 3'],f:'M6 20V9a2.5 2.5 0 0 1 2.5-2.5h5A2.5 2.5 0 0 1 16 9v11z'},
 led:{o:['M12 3a7 7 0 0 1 4 12.8c-.6.4-1 1-1 1.7V18H9v-.5c0-.7-.4-1.3-1-1.7A7 7 0 0 1 12 3Z','M9.5 21h5','M10 18v3','M14 18v3'],f:'M12 3a7 7 0 0 1 4 12.8c-.6.4-1 1-1 1.7V18H9v-.5c0-.7-.4-1.3-1-1.7A7 7 0 0 1 12 3Z'},
 home:{o:['M3 11l9-7 9 7','M5 10v9h14v-9','M10 19v-5h4v5'],f:'M5 10.5h14V19H5z'},
 building:{o:['M4 21V5l7-2v18','M11 21V9l7 2v10','M3 21h18'],f:'M4 5l7-2v18H4z'},
 shield:{o:['M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z','M9 12l2 2 4-4'],f:'M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z'},
 coin:{o:['M12 3v18','M8 7h6a2.5 2.5 0 0 1 0 5h-4a2.5 2.5 0 0 0 0 5h6'],f:''},
 grant:{o:['M6 3h9l3 3v15H6z','M15 3v3h3','M9 11h6M9 14h6M9 17h4'],f:'M6 3h9l3 3v15H6z'},
 warehouse:{o:['M3 21V9l9-5 9 5v12','M3 21h18M8 21v-6h8v6'],f:'M3 21V9l9-5 9 5v12z'},
 monitor:{o:['M7 3h10v18H7z','M10 18h4','M9.5 11l2 2.5 1.5-2 2 3'],f:'M7 3h10v18H7z'},
 clock:{o:['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18','M12 7v5l3 2'],f:''},
 bolt:{o:['M13 3L5 14h6l-2 7 8-11h-6z'],f:'M13 3L5 14h6l-2 7 8-11h-6z'},
 sun:{o:['M12 4a5 5 0 1 0 0 10 5 5 0 0 0 0-10','M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4'],f:'M12 4a5 5 0 1 0 0 10 5 5 0 0 0 0-10'},
 leaf:{o:['M4 20s0-10 8-14c8 0 8 0 8 0s0 8-4 12-12 2-12 2z','M8 16s4-6 10-8'],f:'M4 20s0-10 8-14c8 0 8 0 8 0s0 8-4 12-12 2-12 2z'},
 pound:{o:['M8 21h9','M8 12h6','M15 6a3.5 3.5 0 0 0-6.5 1.8V21'],f:''},
 chart:{o:['M4 20V4','M4 20h16','M8 16v-4M12 16V8M16 16v-7'],f:''},
 phone:{o:['M6.5 3h3l1.5 5-2 1.5a12 12 0 0 0 5 5l1.5-2 5 1.5v3a2 2 0 0 1-2 2A17 17 0 0 1 4.5 5a2 2 0 0 1 2-2Z'],f:''},
 mail:{o:['M3 6h18v12H3z','M3 6l9 7 9-7'],f:'M3 6h18v12H3z'},
 check:{o:['M20 6L9 17l-5-5'],f:''},
 star:{o:['M12 3l2.7 6.1 6.6.6-5 4.4 1.5 6.5L12 17.8 6.2 21l1.5-6.5-5-4.4 6.6-.6z'],f:'M12 3l2.7 6.1 6.6.6-5 4.4 1.5 6.5L12 17.8 6.2 21l1.5-6.5-5-4.4 6.6-.6z'},
 map:{o:['M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z','M9 4v14M15 6v14'],f:''},
 wrench:{o:['M14 6a4 4 0 1 0 4 4l3 3-3 3-3-3a4 4 0 0 1-8-2 4 4 0 0 1 4-4z'],f:''},
 users:{o:['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2','M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8','M22 21v-2a4 4 0 0 0-3-3.9','M16 3.1a4 4 0 0 1 0 7.8'],f:''},
 tree:{o:['M12 22v-6','M12 16l-4-3h2l-3-3h2L7 7h3L8 4h8l-2 3h3l-3 3h2l-3 3h2l-4 3z'],f:'M12 16l-4-3h2l-3-3h2L7 7h3L8 4h8l-2 3h3l-3 3h2l-3 3h2l-4 3z'},
 clock2:{o:['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18','M12 7v5l3 2'],f:''},
 award:{o:['M12 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10','M8.5 12L7 21l5-3 5 3-1.5-9'],f:'M12 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10'},
 factory:{o:['M3 21V10l6 4V10l6 4V6l6 4v11z','M3 21h18'],f:'M3 21V10l6 4V10l6 4V6l6 4v11z'},
 plug:{o:['M9 3v6M15 3v6','M7 9h10v3a5 5 0 0 1-10 0z','M12 17v4'],f:''},
 target:{o:['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18','M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10','M12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2'],f:''},
};
const ICONKEYS=Object.keys(ICONS);
function icon(k,size){size=size||24;const d=ICONS[k]||ICONS.solar;const s=d.o.map(p=>'<path d="'+p+'"/>').join('');
 const f=d.f?'<path class="f" d="'+d.f+'" fill="var(--solar)" fill-opacity="0.3" stroke="none"/>':'';
 return '<svg viewBox="0 0 24 24" width="'+size+'" height="'+size+'" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'+f+s+'</svg>';}
const RAY='<path d="M11 9.6 L13 9.6 L13 0.8 L11 3 Z"/>';
const SPARK='<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style="fill:var(--amber-2)">'+[0,90,180,270].map(a=>'<g transform="rotate('+a+' 12 12)">'+RAY+'</g>').join('')+'</svg>';
const HERO_MARK_SPARK='<svg class="bigspark" viewBox="0 0 24 24" fill="#F8BC1E" aria-hidden="true">'+[0,90,180,270].map(a=>'<g transform="rotate('+a+' 12 12)">'+RAY+'</g>').join('')+'</svg>';
const GAL_CAM='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="3.5"/><path d="M8 6l1.5-2h5L16 6"/></svg>';
function galleryFeaturedIndex(p){
 var items=Array.isArray(p.items)?p.items:[];
 if(!items.length)return 0;
 for(var i=0;i<items.length;i++){if(items[i].featured)return i;}
 var ix=typeof p.featuredIndex==='number'?p.featuredIndex:0;
 return Math.max(0,Math.min(ix,items.length-1));
}
function setGalleryFeatured(blockId,idx){
 var bl=findBlock(blockId);if(!bl)return;
 bl.p.featuredIndex=idx;
 (bl.p.items||[]).forEach(function(it,i){it.featured=i===idx;});
 renderPreview();renderBuild();save();
}
function moveGalItem(id,key,i,dir){
 var bl=findBlock(id);if(!bl||!bl.p[key])return;
 var arr=bl.p[key];var j=i+dir;if(j<0||j>=arr.length)return;
 var fi=galleryFeaturedIndex(bl.p);
 var tmp=arr[i];arr[i]=arr[j];arr[j]=tmp;
 if(fi===i)bl.p.featuredIndex=j;else if(fi===j)bl.p.featuredIndex=i;
 (arr||[]).forEach(function(it,ix){it.featured=ix===bl.p.featuredIndex;});
 renderPreview();renderBuild();save();
}
function gcardHtml(it,i,big,edit,id,featLabel){
 var m=imgResolve(it.img);
 var hasImg=!!m.src;
 var imgPath=id+'.items.'+i+'.img';
 var img=hasImg?mediaFrameHtml(it.img,edit,imgPath):'';
 var fl=(featLabel!=null&&String(featLabel).trim()!=='')?featLabel:'Featured install';
 var ph=hasImg?'':('<span class="ph gcard-pick"'+(edit?' onclick="pvGalImgClick(event,\''+imgPath+'\')" title="Click to add photo"':'')+'>'+GAL_CAM+(big?('<span class="t"'+ce(id+'.featuredLabel',edit)+'>'+esc(fl)+'</span>'):'')+'</span>');
 return '<div class="gcard'+(big?' big':'')+'">'+img+ph+'<span class="loc"'+ce(id+'.items.'+i+'.loc',edit)+'>'+esc(it.loc)+'</span></div>';
}
function pvGalImgClick(ev,path){
 ev.stopPropagation();
 var blockId=path.split('.')[0];
 if(blockId)selectBlock(blockId);
 pvGalImgFile(path);
}
function pvGalImgFile(path){
 window._galImgPath=path;
 var inp=document.getElementById('pv-gal-file');
 if(!inp){
  inp=document.createElement('input');
  inp.type='file';inp.accept='image/*';inp.id='pv-gal-file';inp.style.display='none';
  inp.onchange=function(){imgUpload(inp,window._galImgPath);window._galImgPath=null;};
  document.body.appendChild(inp);
 }
 inp.value='';
 inp.click();
}

/* ============ STATE ============ */
let STATE, SEL=null, VIEW='desk';
function uid(){return Math.random().toString(36).slice(2,8)}
function defaultSite(){return {
  images:[],
  logos:[
    {id:uid(),name:'GivEnergy',img:'',bnr:true},{id:uid(),name:'SolarEdge',img:'',bnr:true},
    {id:uid(),name:'Tesla Powerwall',img:'',bnr:true},{id:uid(),name:'JA Solar',img:'',bnr:true},
    {id:uid(),name:'myenergi',img:'',bnr:true},{id:uid(),name:'Fox ESS',img:'',bnr:false}
  ],
  menu:[
    {label:'Solar & Battery',cols:[{ey:'What we install',items:[{icon:'solar',label:'Solar panels',href:'/#services'},{icon:'battery',label:'Battery storage',href:'/#services'},{icon:'heatpump',label:'Heat pumps',href:'/#services'},{icon:'ev',label:'EV chargers',href:'/#services'}]},{ey:'Tools & funding',items:[{icon:'monitor',label:'Savings estimator',href:'/solar-estimator'},{icon:'coin',label:'Funding & 0% VAT',href:'/#quote'}]}]},
    {label:'Business',cols:[{ey:'Solutions',items:[{icon:'solar',label:'Commercial solar',href:'/#business'},{icon:'battery',label:'Battery storage',href:'/#business'},{icon:'ev',label:'EV & fleet',href:'/#business'}]},{ey:'Grants & funding',items:[{icon:'coin',label:'Funding & finance',href:'/commercial-funding'},{icon:'grant',label:'Newport Net Zero grant',href:'/newport-net-zero-grant'}]},{ey:'By sector',items:[{icon:'warehouse',label:'Warehousing',href:'/warehousing'},{icon:'building',label:'Care homes',href:'/#business'}]}]},
    {label:'Funding',href:'/commercial-funding'},
    {label:'Estimator',href:'/solar-estimator'},
    {label:'FAQs',href:'/#faq'},
    {label:'Contact',href:'/#quote'}
  ]
}}
function footerDefaults(){return {
  logoImg:'/assets/heliaxis-logo.png',
  brandText:'Heliaxis',
  about:'MCS-certified solar, battery, heat pump, EV & LED installation for homes and businesses across South Wales.',
  cols:[
    {title:'Services',links:[
      {label:'Solar panels',href:'/#services'},
      {label:'Battery storage',href:'/#services'},
      {label:'Heat pumps',href:'/#services'},
      {label:'EV chargers',href:'/#services'}]},
    {title:'Areas',links:[
      {label:'Solar Panels Cardiff',href:'/solar-panels-cardiff'},
      {label:'Solar Panels Swansea',href:'/solar-panels-swansea'},
      {label:'Solar Panels Newport',href:'/solar-panels-newport'},
      {label:'Bridgend & the Vale',href:'/solar-panels-bridgend'}]},
    {title:'More',links:[
      {label:'Funding & finance',href:'/commercial-funding'},
      {label:'Solar estimator',href:'/solar-estimator'},
      {label:'FAQs',href:'/#faq'},
      {label:'Free quote',href:'/#quote'}]}],
  copyright:'© 2026 Heliaxis. MCS · RECC · NICEIC · Covering South Wales.',
  siteUrl:'heliaxis.co.uk',
  siteHref:'https://heliaxis.co.uk'
};}
function quoteFormDefaults(){return {variant:'quote',eyebrow:'Free, no-obligation quote',title:'Ready to see what you could save?',anchor:'quote',points:[
   {title:'A real survey, not a sales pitch',text:'We assess your property and give honest figures.'},
   {title:'We call within 1 working day',text:'Quick, friendly, and only when it suits you.'},
   {title:'Your details stay private',text:'No spam, no third parties, no obligation.'}],
   callLabel:'Prefer to talk?',phone:'01633 965205',callBtn:'Call us now',callHref:'tel:01633965205',hideCall:false,
   tabHome:'For my home',tabBiz:'For my business',showTabs:true,
   fName:true,nameLabel:'Full name',namePh:'Your name',fPhone:true,phoneLabel:'Phone',phonePh:'Mobile or landline',
   fEmail:true,emailLabel:'Email',emailPh:'you@email.com',fPost:true,postLabel:'Postcode',postPh:'e.g. CF10 1AA',
   fInterest:true,interestLabel:'What are you interested in? (optional)',interestPh:'Solar, battery, heat pump, EV…',
   btn:'Get my free quote',pulse:true,footnote:'No obligation and no pushy sales — we\'ll simply arrange a free survey.',legalNote:''};}
function formVariant(p){if(p.variant==='contact')return 'contact';if(p.variant==='quote')return 'quote';if(p.fSector||p.fInterests||p.fOrg)return 'contact';return 'quote';}
var QUOTE_CHECK_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="var(--ink)" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
var QUOTE_SHIELD_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path class="f" d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" fill="var(--solar)" stroke="none"/><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/></svg>';
function homeBlocks(){return [
 {id:uid(),t:'hero',p:{eyebrow:'MCS-certified · South Wales',headline:'Cut your energy bills with **Welsh sunshine.**',sub:'Solar, battery, heat pumps & EV — one local, accredited team. No pushy sales, ever.',dark:true,ctaLabel:'Get my free quote',ctaPulse:true,cta2:'Estimate my savings'}},
 {id:uid(),t:'stats',p:{items:[{n:'1,200+',k:'Installs completed'},{n:'£1,200',k:'Avg. yearly saving'},{n:'4.9★',k:'Customer rating'},{n:'25 yr',k:'Workmanship guarantee'}]}},
 {id:uid(),t:'grid',p:{eyebrow:'What we install',title:'One team for your whole energy setup',anchor:'services',cols:3,items:[
   {icon:'solar',title:'Solar PV panels',desc:'Tier-one panels sized to your roof.'},{icon:'battery',title:'Battery storage',desc:'Store sunshine for after dark.'},{icon:'heatpump',title:'Heat pumps',desc:'Efficient low-carbon heating.'},
   {icon:'ev',title:'EV chargers',desc:'Charge from your own solar.'},{icon:'led',title:'LED lighting',desc:'Fast-payback lighting upgrades.'},{icon:'monitor',title:'Monitoring',desc:'Track savings from your phone.'}]}},
 {id:uid(),t:'banner',p:{heading:'Trusted technology we install'}},
 {id:uid(),t:'split',p:{lt:'For your home',ld:'Cut your bills, add battery backup and go greener.',lb:['Free, no-obligation home survey','0% VAT on residential solar to 2027','Finance to spread the cost'],lc:'Get my home quote',rt:'For your business',rd:'Turn your roof into lower running costs, with ROI, grants and finance.',rb:['Free commercial energy assessment','Grants, finance & PPA','Typical 3–6 year payback'],rc:'Explore business funding'}},
 {id:uid(),t:'testi',p:{eyebrow:'Real customers',title:'Trusted across South Wales',footnote:'Illustrative testimonials — replace with your real Google & Trustpilot reviews.',items:[
   {stars:5,quote:'Neat, tidy and genuinely no pressure. Our bills have dropped massively and the app makes it easy to see.',name:'Sarah M.',loc:'Cardiff · Solar + battery'},
   {stars:5,quote:'From survey to switch-on they were spot on. The team clearly knew what they were doing and cleaned up after.',name:'David R.',loc:'Swansea · Solar PV'},
   {stars:5,quote:'We use them for our commercial units. Straight answers, proper ROI figures, and a payback we\'re already hitting.',name:'Gareth L.',loc:'Newport · Commercial'}]}},
 {id:uid(),t:'gallery',p:{eyebrow:'Recent work',title:'Installs across South Wales',sub:'A few of the homes and businesses we\'ve powered up. Real drone & install photos drop straight into these frames.',featuredLabel:'Featured install',footnote:'Placeholder frames — swap in your real drone & install photography.',featuredIndex:0,items:[
   {img:'',loc:'Cardiff · 6.4 kWp + 10kWh battery',featured:true},{img:'',loc:'Swansea · 4.0 kWp',featured:false},{img:'',loc:'Newport · Commercial 55 kWp',featured:false},
   {img:'',loc:'Bridgend · 5.3 kWp + EV',featured:false},{img:'',loc:'Vale of Glamorgan · Heat pump',featured:false}]}},
 {id:uid(),t:'funding',p:{eyebrow:'Funding & finance',title:'Solar within reach, whatever your budget',sub:'Buy outright, spread the cost, or pay nothing upfront — plus the Welsh grants worth knowing about.',items:[
   {title:'0% VAT on home solar',text:'Residential installs carry 0% VAT until 31 March 2027 — a saving worth locking in.'},
   {title:'Finance & PPA options',text:'Spread the cost, or let a funder cover it entirely with Solar-as-a-Service for businesses.'},
   {title:'Welsh & local grants',text:'From the Nest scheme to Newport\'s SME decarbonisation grant — we\'ll help you find and time it.'}],
   cta:'0% VAT ends March 2027 — see all funding routes →',ctaHref:'/commercial-funding',ctaDisabled:false}},
 {id:uid(),t:'faq',p:{eyebrow:'Good to know',title:'Your questions, answered',anchor:'faq',items:[
   {q:'Do solar panels work in Wales\' cloudy weather?',a:'Yes. Panels generate from daylight, not direct sun, so they still produce power on overcast days. The UK gets more than enough solar energy each year to make a well-designed system a sound investment.'},
   {q:'How much could I save?',a:'It depends on your roof, usage and whether you add a battery — but many homes save four figures a year. The quickest way to find out is our 20-second estimator, or a free survey for exact figures.'},
   {q:'Will I need planning permission?',a:'For most homes solar is classed as permitted development, so no permission is needed. Listed buildings, conservation areas and some commercial sites are exceptions — we\'ll confirm at survey.'},
   {q:'Is there really no hard sell?',a:'Correct. We\'re engineers, not commission-driven salespeople. You\'ll get honest advice, a clear quote, and no pressure — book a survey and decide in your own time.'},
   {q:'Do you cover my area?',a:'We install right across South Wales — Cardiff, Swansea, Newport, Bridgend, the Vale of Glamorgan, RCT and surrounding areas. If you\'re nearby, just ask.'}]}},
 {id:uid(),t:'form',p:quoteFormDefaults()},
 {id:uid(),t:'cta',p:{headline:'Your lower bills start with one free survey.',sub:'Join 1,200+ South Wales homes and businesses already powering up with Heliaxis.',btn:'Get my free quote',btnHref:'#quote',pulse:true,ctaDisabled:false,btn2:'Call 01633 965205',btn2Href:'tel:01633965205',cta2Disabled:false}},
 {id:uid(),t:'footer',p:footerDefaults()}
]}
function newState(){return {pages:[{id:uid(),name:'Home',slug:'/',type:'page',blocks:homeBlocks()}],current:0,site:defaultSite()}}

/* ============ persistence ============ */
var _saveChain=Promise.resolve();
async function save(){
  // Serialize saves so an older in-flight write cannot overwrite a newer menu delete.
  var run=function(){return saveNow();};
  _saveChain=_saveChain.then(run,run);
  return _saveChain;
}
async function saveNow(){
  DIRTY=true;
  setSaved('Saving to Supabase…');
  try{
    if(!window.storage)throw new Error('Storage unavailable');
    await window.storage.set('heliaxis-cms-v1',JSON.stringify(STATE),false);
    setSaved('Saved to Supabase');
    DIRTY=false;
  }catch(e){
    setSaved(e&&e.message?e.message:'Save failed');
    throw e;
  }
}
function setSaved(t){const e=document.getElementById('savestate');if(!e)return;const label=e.querySelector('.save-label');if(label)label.textContent=t;else e.textContent=t;e.classList.toggle('is-dirty',/saving|failed|unsaved/i.test(t));e.classList.toggle('is-saving',/saving/i.test(t));e.classList.toggle('is-ok',/saved/i.test(t)&&!/failed|unsaved|saving/i.test(t));}
async function boot(){
  try{if(window.storage){const r=await window.storage.get('heliaxis-cms-v1');if(r&&r.value){STATE=JSON.parse(r.value);}}}catch(e){}
  if(!STATE)STATE=newState();
  if(!STATE.site)STATE.site=defaultSite();
  if(!Array.isArray(STATE.site.menu))STATE.site.menu=defaultSite().menu;
  if(!Array.isArray(STATE.site.logos))STATE.site.logos=defaultSite().logos;
  if(!Array.isArray(STATE.site.images))STATE.site.images=[];
  if(ensureUniquePageTitles())save();
  if(repairLegacyUntitledSlugs())save();
  if(ensureUniquePageSlugs())save();
  if(ensureBlogPublicSlugs())save();
  if(ensureHomeGallery())save();
  if(ensureGalleryCustomize())save();
  if(ensureHomeFunding())save();
  if(ensureFaqCustomize())save();
  if(ensureHomeQuoteForm())save();
  if(ensureFormCustomize())save();
  if(ensureCtaCustomize())save();
  if(ensureHeroCustomize())save();
  if(ensureHomeFooter())save();
  if(ensureFooterCustomize())save();
  if(ensureGridAnchor())save();
  if(ensureBlockTypesLowercase())save();
  var slug=CMS_INITIAL_SLUG||getSlugFromPath();
  CMS_INITIAL_SLUG=null;
  // Capture before syncCmsUrl strips ?cmsAction=…
  var pendingAction='';
  var pendingScheduleAt='';
  try{
    var bootParams=new URLSearchParams(window.location.search||'');
    pendingAction=String(bootParams.get('cmsAction')||'').toLowerCase();
    pendingScheduleAt=String(bootParams.get('at')||'');
  }catch(e){}
  try{
    var viewMode=cmsViewModeFromSlug(slug);
    if(viewMode){applyCmsView(viewMode,true);return;}
    if(slug){var idx=findPageByEditSlug(slug);if(idx>=0){
      STATE.current=idx;SEL=null;
      // Preview from blog list: keep boot overlay up, never paint the editor chrome
      if(pendingAction==='preview'){
        try{window.history.replaceState({},'',window.location.pathname);}catch(e){}
        var bootCopy=document.querySelector('#cmsBoot .cms-boot-copy');
        if(bootCopy)bootCopy.textContent='Opening preview…';
        await openPublishPreview(idx,{sameTab:true,returnUrl:'/admin/blog'});
        return;
      }
      MODE='edit';setMode();renderAll();tab('build');syncCmsUrl(true);runCmsUrlAction(pendingAction,pendingScheduleAt);return;
    }}
    MODE='dash';setMode();renderAll();
  }finally{
    // Preview replaces the whole document — only hide boot if CMS UI is still showing
    if(document.getElementById('cmsBoot')&&document.getElementById('cmsAppRoot'))hideCmsBoot();
  }
}
function runCmsUrlAction(action,scheduleAt){
  try{
    action=String(action||'').toLowerCase();
    scheduleAt=String(scheduleAt||'');
    if(!action){
      try{
        var p=new URLSearchParams(window.location.search||'');
        action=String(p.get('cmsAction')||'').toLowerCase();
        if(!scheduleAt)scheduleAt=String(p.get('at')||'');
      }catch(e){}
    }
    if(!action)return;
    try{window.history.replaceState({},'',window.location.pathname);}catch(e){}
    setTimeout(function(){
      if(action==='preview')openPublishPreview(null,{sameTab:true});
      else if(action==='publish'){openPublish();setTimeout(function(){doPublish();},120);}
      else if(action==='schedule')scheduleBlogFromEditor(scheduleAt);
    },400);
  }catch(e){}
}
function openScheduleNotice(opts){
  opts=opts||{};
  var box=document.getElementById('modalbox');
  var modal=document.getElementById('modal');
  if(!box||!modal)return;
  var title=opts.title||'Schedule publish';
  var msg=opts.message||'';
  var busy=!!opts.busy;
  var err=!!opts.error;
  box.className='modalbox';
  box.innerHTML='<button class="close" onclick="closeModal()">×</button>'
    +'<h2>'+esc(title)+'</h2>'
    +'<p id="schedmsg" style="margin:10px 0 16px;font-size:.9rem;line-height:1.45;color:'+(err?'var(--amber-2)':'var(--muted)')+'">'
    +(busy?'Scheduling…':esc(msg))
    +'</p>'
    +(busy?'':'<div style="display:flex;gap:8px;flex-wrap:wrap">'
      +'<a class="tbtn solar" style="color:var(--ink);text-decoration:none;display:inline-flex;align-items:center" href="/admin/blog">Back to articles</a>'
      +'<button type="button" class="tbtn" style="color:var(--ink);border-color:var(--line)" onclick="closeModal()">Stay in editor</button>'
      +'</div>');
  modal.classList.add('show');
}
async function scheduleBlogFromEditor(publishAt){
  try{
    if(!publishAt){
      openScheduleNotice({title:'Could not schedule',error:true,message:'Missing schedule time. Pick a date and time from Articles, then confirm again.'});
      return;
    }
    var pg=page();
    if(!pg){
      openScheduleNotice({title:'Could not schedule',error:true,message:'Page not found. Go back to Articles and try again.'});
      return;
    }
    openScheduleNotice({title:'Schedule publish',busy:true});
    await ensurePublishStyles();
    var bodyHtml='<div class="pv-page">'+pg.blocks.map(function(b){return '<div style="'+spacingStyle(b.p)+'">'+renderBlock(b)+'</div>';}).join('\n')+'</div>';
    var r=await fetch('/api/blog/schedule',{
      method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        id:pg.id,
        slug:pg.slug,
        publishAt:publishAt,
        renderedPage:{slug:pg.slug,name:pg.name,theme:pg.theme||'',seo:pg.seo||{},html:bodyHtml}
      })
    });
    var d=await r.json().catch(function(){return {};});
    if(!r.ok)throw new Error(d.error||'Could not schedule');
    location.href='/admin/blog?scheduled=1';
  }catch(e){
    var msg=(e&&e.message)||'Could not schedule blog';
    openScheduleNotice({title:'Could not schedule',error:true,message:msg});
  }
}
function hideCmsBoot(){
  document.body.classList.add('cms-ready');
  var boot=document.getElementById('cmsBoot');
  if(!boot)return;
  boot.classList.add('is-done');
  boot.setAttribute('aria-busy','false');
  setTimeout(function(){if(boot&&boot.parentNode)boot.parentNode.removeChild(boot);},420);
}
function page(){return STATE.pages[STATE.current]}

/* ============ RENDER PREVIEW ============ */
function esc(s){return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
/* Inline-edit attribute helper: only emits contenteditable wiring when edit mode
   is on (i.e. in the live preview). Publish/export call renderBlock without edit,
   so none of this leaks into the published site. */
function ce(ep,edit){return (edit&&ep)?' contenteditable="true" data-ep="'+ep+'" oninput="epInput(this)" onblur="epBlur(this)" onkeydown="epKey(event)" onclick="event.stopPropagation()"':'';}
function btn(label,cls,pulse,ic,ep,edit,href,noArrow){
 if(!label)return '';
 var inner=(ic?icon(ic,16):'')+'<span'+ce(ep,edit)+'>'+esc(label)+'</span>'+(noArrow?'':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>');
 var clsFull='pv-btn '+cls+(pulse?' pulse':'');
 if(href){
  // In edit mode, never navigate — editors type links in the sidebar.
  return '<a class="'+clsFull+'" href="'+esc(href)+'"'+(edit?' onclick="event.preventDefault()"':'')+'>'+inner+'</a>';
 }
 return '<span class="'+clsFull+'">'+inner+'</span>';
}
function eyebrow(t,ep,edit,onDark){if(!(t&&String(t).trim()))return '';return '<span class="pv-eyebrow'+(onDark?' on-dark':'')+'">'+SPARK+'<span'+ce(ep,edit)+'>'+esc(t)+'</span></span>'}
function accentHint(){return '<div class="hint">Wrap words in <b>**double asterisks**</b> for solar gold — e.g. Cut your bills with **Welsh sunshine.**</div>';}
function accentArea(label,val,path){return '<div class="fld"><label>'+label+'</label><textarea rows="2" oninput="updT(\''+path+'\',this.value)">'+esc(val)+'</textarea>'+accentHint()+'</div>';}
function sectionAnchorId(anchor){return (anchor&&String(anchor).trim())?' id="'+esc(String(anchor).trim().replace(/[^a-zA-Z0-9_-]/g,''))+'"':'';}
function renderFooterCol(col,colIdx,id,edit){
 var links=(col.links||[]).map(function(l,i){
  return '<a href="'+esc(l.href||'#')+'"'+(edit?' onclick="event.preventDefault()"':'')+'><span'+ce(id+'.cols.'+colIdx+'.links.'+i+'.label',edit)+'>'+esc(l.label)+'</span></a>';
 }).join('');
 return '<div><h4'+ce(id+'.cols.'+colIdx+'.title',edit)+'>'+esc(col.title||'')+'</h4>'+links+'</div>';
}
function heroTags(tags){
  if(!tags)return '';
  var list=String(tags).split(/[,|]/).map(function(t){return t.trim()}).filter(Boolean);
  if(!list.length)return '';
  return '<div class="pv-hero-tags">'+list.map(function(t){return '<span class="pv-hero-tag">'+esc(t)+'</span>'}).join('<span class="pv-hero-tag-sep" aria-hidden="true">|</span>')+'</div>';
}
const BLOCKNAMES={hero:'Hero',trustbar:'Trust bar',estband:'Estimator band',stats:'Stat bar',grid:'Grid section',split:'Home / Business',media:'Image + text',pricing:'Pricing plans',funding:'Funding & finance',steps:'Process steps',casestudy:'Case-study cards',gallery:'Install gallery',clientbanner:'Client banner',testi:'Testimonials',banner:'Brand banner',form:'Quote form',cta:'CTA band',footer:'Site footer',faq:'FAQ',rich:'Rich text'};
function blockTypeKey(t){return String(t||'').trim().toLowerCase();}
function blockDisplayName(t){var k=blockTypeKey(t);return BLOCKNAMES[k]||k||'Section';}
function renderBlock(b,edit){
 const t=blockTypeKey(b.t);
 const p=b.p;const id=b.id;
 if(t==='hero'){
   var wide=!!p.textWide;
   var hideMark=wide||!!p.hideMark;
   var sub=(p.sub&&String(p.sub).trim())?'<p class="lead"'+ce(id+'.sub',edit)+'>'+esc(p.sub)+'</p>':'';
   var btns='';
   if(!p.ctaDisabled) btns+='<a class="btn btn-solar'+(p.ctaPulse?' pulse':'')+'" href="'+esc(p.ctaHref||'#quote')+'"'+(edit?' onclick="event.preventDefault()"':'')+'>'+'<span'+ce(id+'.ctaLabel',edit)+'>'+esc(p.ctaLabel||'Get my free quote')+'</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>';
   if(!p.cta2Disabled&&p.cta2&&String(p.cta2).trim()) btns+='<a class="btn btn-light" href="'+esc(p.cta2Href||'')+'"'+(edit?' onclick="event.preventDefault()"':'')+'>'+'<span'+ce(id+'.cta2',edit)+'>'+esc(p.cta2)+'</span></a>';
   var btnrow=btns?'<div class="cbtns">'+btns+'</div>':'';
   var mt=p.microtrust!==undefined?p.microtrust:'Free survey · No obligation · No salespeople · Insurance-backed guarantees';
   var mthtml=(!p.hideMicrotrust&&mt&&String(mt).trim())?('<p class="microtrust"'+ce(id+'.microtrust',edit)+'>'+esc(mt)+'</p>'):'';
   var rtVal=p.ratingValue||'4.9';
   var rtInst=p.ratingInstalls||'1200';
   var rthtml=!p.hideRating?('<div class="rating"><div class="r"><span class="big"'+ce(id+'.ratingValue',edit)+'>'+esc(rtVal)+'</span><span class="stars">★★★★★</span><span>Google &amp; Trustpilot</span></div><div class="r"><span class="big"><span'+ce(id+'.ratingInstalls',edit)+'>'+esc(rtInst)+'</span>+</span><span>installs across South Wales</span></div></div>'):'';
   var eyebrowHtml = p.eyebrow ? '<span class="eyebrow on-dark"'+ce(id+'.eyebrow',edit)+'>'+SPARK.replace('<svg ','<svg class="spark-ico" ')+esc(p.eyebrow)+'</span>' : '';
   var markHtml='';
   if(!hideMark){
     if(p.markImg)markHtml='<div class="hero-mark">'+imgTag(p.markImg,'max-width:min(52%,230px);height:auto',edit,id+'.markImg')+'</div>';
     else markHtml='<div class="hero-mark">'+HERO_MARK_SPARK+'</div>';
   }
   var sunHtml=(wide||p.hideSun)?'':'<div class="sun"></div>';
   var heroCls='hero'+(wide?' wide':'')+(hideMark?' no-mark':'');
   var wrapCls='wrap'+(hideMark?' is-single':'');
   return '<section class="'+heroCls+'" id="top"><div class="glow"></div>'+sunHtml+'<div class="'+wrapCls+'"><div class="hero-copy">'+heroTags(p.tags)+eyebrowHtml+'<h1>'+accentText(p.headline)+'</h1>'+sub+btnrow+mthtml+rthtml+'</div>'+markHtml+'</div></section>';
 }
 if(t==='stats')return '<div class="pv-stats" style="grid-template-columns:repeat('+(p.items.length)+',1fr)">'+p.items.map((s,i)=>'<div class="pv-stat"><div class="n"'+ce(id+'.items.'+i+'.n',edit)+'>'+esc(s.n)+'</div><div class="k"'+ce(id+'.items.'+i+'.k',edit)+'>'+esc(s.k)+'</div></div>').join('')+'</div>';
 if(t==='grid'){const gc=(it,i)=>'<div class="pv-card"><span class="ic">'+icon(it.icon)+'</span><h3>'+accentText(it.title)+'</h3><p'+ce(id+'.items.'+i+'.desc',edit)+'>'+esc(it.desc)+'</p></div>';
   let inner;
   if(p.fill==='balance'){inner='<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:14px">'+p.items.map((it,i)=>'<div class="pv-card" style="flex:0 1 calc('+(100/p.cols)+'% - 14px);min-width:220px"><span class="ic">'+icon(it.icon)+'</span><h3>'+accentText(it.title)+'</h3><p'+ce(id+'.items.'+i+'.desc',edit)+'>'+esc(it.desc)+'</p></div>').join('')+'</div>';}
   else{let extra='';const rem=p.items.length%p.cols;if(rem!==0&&p.fill==='contact'){const gap=p.cols-rem;extra='<div class="pv-card pv-contact" style="grid-column:span '+gap+'"><h3'+ce(id+'.contactHeading',edit)+'>'+accentText(p.contactHeading||'Get in touch')+'</h3><p'+ce(id+'.contactText',edit)+'>'+esc(p.contactText||'Not sure which option fits? Tell us your setup and we\'ll point you the right way.')+'</p>'+btn(p.contactBtn||'Contact us','solar',false,null,id+'.contactBtn',edit,p.contactHref||'#quote')+'</div>';}inner='<div class="pv-grid" style="grid-template-columns:repeat('+p.cols+',1fr)">'+p.items.map(gc).join('')+extra+'</div>';}
   return '<div class="pv-sec"'+sectionAnchorId(p.anchor)+'><div class="shead'+(p.centerHeader?' center':'')+'">'+eyebrow(p.eyebrow,id+'.eyebrow',edit)+'<h2>'+accentText(p.title)+'</h2></div>'+inner+'</div>';}
 if(t==='split'){
    const lIc = p.lIcon ? '<div class="pv-sc-ic">'+icon(p.lIcon)+'</div>' : '';
    const rIc = p.rIcon ? '<div class="pv-sc-ic dark">'+icon(p.rIcon)+'</div>' : '';
    return '<div class="pv-split"><div class="pv-splitcard">'+lIc+'<h3>'+accentText(p.lt)+'</h3><p'+ce(id+'.ld',edit)+'>'+esc(p.ld)+'</p><ul>'+p.lb.map((x,i)=>'<li'+ce(id+'.lb.'+i,edit)+'>'+esc(x)+'</li>').join('')+'</ul>'+btn(p.lc,'dark',false,null,id+'.lc',edit,p.lcHref||'#quote')+'</div><div class="pv-splitcard dark">'+rIc+'<h3>'+accentText(p.rt)+'</h3><p'+ce(id+'.rd',edit)+'>'+esc(p.rd)+'</p><ul>'+p.rb.map((x,i)=>'<li'+ce(id+'.rb.'+i,edit)+'>'+esc(x)+'</li>').join('')+'</ul>'+btn(p.rc,'solar',false,null,id+'.rc',edit,p.rcHref||'/commercial-funding')+'</div></div>';
  }
 if(t==='testi'){
   var teb=(p.eyebrow!=null&&String(p.eyebrow).trim()!=='')?p.eyebrow:'Real customers';
   var ttl=p.title||'Trusted across South Wales';
   var fn=p.footnote===''?null:(p.footnote||'Illustrative testimonials — replace with your real Google & Trustpilot reviews.');
   function tq(q){var s=String(q||'');if(!s)return '""';if(/^["'“”]/.test(s))return esc(s);return '"'+esc(s)+'"';}
   const cards=p.items.map((tt,i)=>'<div class="tcard"><div class="stars">'+'★'.repeat(tt.stars||5)+'</div><blockquote'+ce(id+'.items.'+i+'.quote',edit)+'>'+tq(tt.quote)+'</blockquote><div class="who"><b'+ce(id+'.items.'+i+'.name',edit)+'>'+esc(tt.name)+'</b> <span>· <span'+ce(id+'.items.'+i+'.loc',edit)+'>'+esc(tt.loc)+'</span></span></div></div>');
   let body;
   if(p.items.length>3){body='<div class="pv-tmarquee"><div class="trk" style="animation-duration:'+(p.speed||36)+'s">'+cards.join('')+cards.join('')+'</div></div>';}
   else{body='<div class="tgrid">'+cards.join('')+'</div>';}
   var fnHtml=fn?'<p class="pv-testi-note"'+ce(id+'.footnote',edit)+'>'+esc(fn)+'</p>':'';
   return '<div class="pv-testi"><div class="wrap"><div class="shead center">'+eyebrow(teb,id+'.eyebrow',edit)+'<h2>'+accentText(ttl)+'</h2></div>'+body+fnHtml+'</div></div>';}
 if(t==='gallery'){
   var geb=(p.eyebrow!=null&&String(p.eyebrow).trim()!=='')?p.eyebrow:'Recent work';
   var gtl=(p.title!=null&&String(p.title).trim()!=='')?p.title:'Installs across South Wales';
   var gsub=p.sub===''?null:(p.sub!=null&&String(p.sub).trim()!==''?p.sub:'A few of the homes and businesses we\'ve powered up. Real drone & install photos drop straight into these frames.');
   var gfn=p.footnote===''?null:(p.footnote!=null&&String(p.footnote).trim()!==''?p.footnote:'Placeholder frames — swap in your real drone & install photography.');
   var gfl=p.featuredLabel!=null?p.featuredLabel:'Featured install';
   var items=Array.isArray(p.items)?p.items:[];
   var gfi=galleryFeaturedIndex(p);
   var cards=items.map(function(it,i){return gcardHtml(it,i,i===gfi,edit,id,gfl);}).join('');
   var subHtml=gsub?('<p'+ce(id+'.sub',edit)+'>'+esc(gsub)+'</p>'):'';
   var gfnHtml=gfn?('<p class="pv-gal-note"'+ce(id+'.footnote',edit)+'>'+esc(gfn)+'</p>'):'';
   return '<div class="pv-gallery"><div class="wrap"><div class="shead center">'+eyebrow(geb,id+'.eyebrow',edit)+'<h2>'+accentText(gtl)+'</h2>'+subHtml+'</div><div class="gallery">'+cards+'</div>'+gfnHtml+'</div></div>';}
 if(t==='funding'){
   var feb=(p.eyebrow!=null&&String(p.eyebrow).trim()!=='')?p.eyebrow:'Funding & finance';
   var ftl=(p.title!=null&&String(p.title).trim()!=='')?p.title:'Solar within reach, whatever your budget';
   var fsub=p.sub===''?null:(p.sub!=null&&String(p.sub).trim()!==''?p.sub:'Buy outright, spread the cost, or pay nothing upfront — plus the Welsh grants worth knowing about.');
   var items=Array.isArray(p.items)?p.items:[];
   var cols=Math.min(Math.max(items.length,1),3);
   var cards=items.map(function(it,i){
     return '<div class="fcard"><h3'+ce(id+'.items.'+i+'.title',edit)+'>'+accentText(it.title||'')+'</h3><p'+ce(id+'.items.'+i+'.text',edit)+'>'+esc(it.text)+'</p></div>';
   }).join('');
   var subHtml=fsub?('<p'+ce(id+'.sub',edit)+'>'+esc(fsub)+'</p>'):'';
   var ctaHtml='';
   if(!p.ctaDisabled&&p.cta&&String(p.cta).trim()){
     ctaHtml='<a class="pv-urgency" href="'+esc(p.ctaHref||'/commercial-funding')+'"'+(edit?' onclick="event.preventDefault()"':'')+'><span class="dot"></span><span'+ce(id+'.cta',edit)+'>'+esc(p.cta)+'</span></a>';
   }
   return '<div class="pv-funding"><div class="pv-funding-glow"></div><div class="wrap"><div class="shead">'+eyebrow(feb,id+'.eyebrow',edit,true)+'<h2>'+accentText(ftl)+'</h2>'+subHtml+'</div><div class="fgrid" style="grid-template-columns:repeat('+cols+',1fr)">'+cards+'</div>'+ctaHtml+'</div></div>';}
 if(t==='banner'){const ls=STATE.site.logos.filter(l=>l.bnr);const chip=l=>'<span class="pv-brand">'+(l.img?'<img src="'+l.img+'">':esc(l.name))+'</span>';
   return '<div class="pv-banner"><div class="bh">'+accentText(p.heading)+'</div><div class="pv-bmarq"><div class="trk">'+ls.map(chip).join('')+ls.map(chip).join('')+'</div></div></div>';}
 if(t==='cta'){
   var btns='';
   if(!p.ctaDisabled)btns+=btn(p.btn,'solar',p.pulse,null,id+'.btn',edit,p.btnHref||'#quote');
   if(!p.cta2Disabled&&p.btn2&&String(p.btn2).trim())btns+=btn(p.btn2,'ghost on-dark',false,null,id+'.btn2',edit,p.btn2Href||'tel:01633965205',true);
   var row=btns?'<div class="pv-btnrow pv-cta-btns">'+btns+'</div>':'';
   return '<div class="pv-cta"><div class="pv-cta-glow"></div><div class="z"><h2>'+accentText(p.headline)+'</h2><p'+ce(id+'.sub',edit)+'>'+esc(p.sub)+'</p>'+row+'</div></div>';}
 if(t==='footer'){
   var brand='';
   if(p.logoImg)brand='<img class="pv-footer-logo" src="'+esc(p.logoImg)+'" alt="'+esc(p.brandText||'Heliaxis')+'">';
   else brand='<p class="pv-footer-word"'+ce(id+'.brandText',edit)+'>'+esc(p.brandText||'Heliaxis')+'</p>';
   var cols=(Array.isArray(p.cols)?p.cols:[]).map(function(c,i){return renderFooterCol(c,i,id,edit);}).join('');
   var siteHref=p.siteHref||'https://heliaxis.co.uk';
   return '<footer class="pv-footer"><div class="wrap"><div class="cols"><div class="pv-footer-brand">'+brand+'<p class="pv-footer-about"'+ce(id+'.about',edit)+'>'+esc(p.about)+'</p></div>'+cols+'</div><div class="base"><span'+ce(id+'.copyright',edit)+'>'+esc(p.copyright)+'</span><a href="'+esc(siteHref)+'" class="pv-footer-url"'+(edit?' onclick="event.preventDefault()"':'')+'><span'+ce(id+'.siteUrl',edit)+'>'+esc(p.siteUrl||'heliaxis.co.uk')+'</span></a></div></div></footer>';
 }
 if(t==='faq'){
   var feb=(p.eyebrow!=null&&String(p.eyebrow).trim()!=='')?p.eyebrow:'Good to know';
   var ftl=(p.title!=null&&String(p.title).trim()!=='')?p.title:'Your questions, answered';
   var anchor=(p.anchor&&String(p.anchor).trim())?String(p.anchor).trim().replace(/[^a-zA-Z0-9_-]/g,''):'faq';
   var items=Array.isArray(p.items)?p.items:[];
   var qa=items.map(function(q,i){
     var num=String(i+1).padStart(2,'0');
     return '<div class="qa2'+(edit&&i===0?' open':'')+'"><button type="button" class="q"><span class="ix">Q/'+num+'</span><span'+ce(id+'.items.'+i+'.q',edit)+'>'+esc(q.q)+'</span><span class="tog"></span></button><div class="a"'+(edit&&i===0?' style="max-height:none"':'')+'><p'+ce(id+'.items.'+i+'.a',edit)+'>'+esc(q.a)+'</p></div></div>';
   }).join('');
   return '<div class="pv-faq'+(edit?' is-edit':'')+'" id="'+esc(anchor)+'"><div class="wrap"><div class="shead center">'+eyebrow(feb,id+'.eyebrow',edit)+'<h2>'+accentText(ftl)+'</h2></div><div class="faq">'+qa+'</div></div></div>';}
if(t==='media'){const im=p.img?mediaFrameHtml(p.img,edit,id+'.img'):'<div class="pv-media-frame is-empty" aria-hidden="true">IMAGE</div>';
   const ctaBtn=p.ctaDisabled?'':btn(p.cta,'solar',false,null,id+'.cta',edit,p.ctaHref||'#quote');
   const cols=p.textWide?(p.side==='left'?'0.75fr 1.25fr':'1.25fr 0.75fr'):'1fr 1fr';
   const tx='<div>'+eyebrow(p.eyebrow,id+'.eyebrow',edit)+'<h2 style="font-size:clamp(1.5rem,2.6vw,2.1rem);font-weight:700;margin-top:10px">'+accentText(p.title)+'</h2><p style="color:var(--muted);margin-top:12px;line-height:1.6"'+ce(id+'.text',edit)+'>'+esc(p.text)+'</p>'+(ctaBtn?'<div class="pv-btnrow">'+ctaBtn+'</div>':'')+'</div>';
   const blogCls=isCmsBlogPage(page())?' is-blog':'';
   return '<div class="pv-media'+blogCls+'" style="display:grid;grid-template-columns:'+cols+';gap:34px;align-items:center">'+(p.side==='left'?im+tx:tx+im)+'</div>';}
 if(t==='form'){
   if(formVariant(p)==='contact'){
   const fld=function(label,req,ph,type,name){
     const lab='<label for="pv-'+name+'">'+label+(req?' <span class="req">*</span>':'')+'</label>';
     if(type==='textarea')return '<div class="pv-field">'+lab+'<textarea id="pv-'+name+'" name="'+name+'" rows="4" placeholder="'+esc(ph)+'"'+(req?' required':'')+'></textarea></div>';
     return '<div class="pv-field">'+lab+'<input id="pv-'+name+'" name="'+name+'" type="'+(type||'text')+'" placeholder="'+esc(ph)+'"'+(req?' required':'')+'></div>';
   };
   const sectors=[['home','Residential'],['building','Commercial'],['users','Public Sector'],['warehouse','Housing Association'],['target','Other']];
   let rows='';
   const pair=[];
   if(p.fName)pair.push(fld('Name',true,'Your name','text','name'));
   if(p.fOrg)pair.push(fld('Organization Name',false,'Company or organization','text','organization'));
   if(pair.length){rows+='<div class="pv-fields-2">'+pair.join('')+'</div>';pair.length=0;}
   if(p.fEmail)pair.push(fld('Email',true,'your.email@example.com','email','email'));
   if(p.fPhone)pair.push(fld('Phone',false,'Enter phone','tel','phone'));
   if(pair.length){rows+='<div class="pv-fields-2">'+pair.join('')+'</div>';pair.length=0;}
   if(p.fPost)rows+=fld('Postcode',false,'e.g. CF10 1AA','text','postcode');
   if(p.fSector)rows+='<div class="pv-fgroup"><label>Your Sector <span class="req">*</span></label><div class="pv-tiles pv-tiles-sector" role="group" aria-label="Sector">'+sectors.map(function(s){return '<button type="button" class="pv-tile" data-value="'+esc(s[1])+'">'+icon(s[0],18)+'<span>'+s[1]+'</span></button>';}).join('')+'</div></div>';
   if(p.fInterests)rows+='<div class="pv-fgroup"><label>I am interested in <span class="req">*</span><span class="hint-inline">(Select all that apply)</span></label><div class="pv-tiles pv-tiles-interest" role="group" aria-label="Interests">'+INTERESTS.map(function(it){return '<button type="button" class="pv-tile" data-value="'+esc(it[1])+'">'+icon(it[0],18)+'<span>'+esc(it[1])+'</span></button>';}).join('')+'</div></div>';
   if(p.fMsg)rows+=fld('Message',false,'Tell us more about your project requirements…','textarea','message');
   const btnLabel=p.btn||'Send Enquiry';
   const cta='<button type="submit" class="pv-btn solar'+(p.pulse?' pulse':'')+'"><span data-btn-label>'+esc(btnLabel)+'</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>';
   return '<div class="pv-quote is-contact" id="quote"><div class="pv-quote-inner"><form class="pv-formcard pv-cms-form" action="/api/quote" method="post" novalidate><div class="pv-quote-head"><h2>'+accentText(p.heading)+'</h2><p'+ce(id+'.sub',edit)+'>'+esc(p.sub)+'</p></div>'+rows+'<div class="pv-form-msg" hidden></div><div class="pv-form-actions">'+cta+'</div><p class="pv-form-note">By submitting this form, you agree to our privacy policy and terms of service.</p></form></div></div>';}
   var anchor=(p.anchor&&String(p.anchor).trim())?String(p.anchor).trim().replace(/[^a-zA-Z0-9_-]/g,''):'quote';
   var points=Array.isArray(p.points)?p.points:[];
   var pts=points.map(function(pt,i){return '<div class="pv-pt"><span class="ic">'+QUOTE_CHECK_SVG+'</span><div><b'+ce(id+'.points.'+i+'.title',edit)+'>'+esc(pt.title)+'</b><span'+ce(id+'.points.'+i+'.text',edit)+'>'+esc(pt.text)+'</span></div></div>';}).join('');
   var callBox='';
   if(!p.hideCall){
     var telHref=p.callHref||(p.phone?'tel:'+String(p.phone).replace(/\s/g,''):'#');
     callBox='<div class="pv-callnow"><div><div class="pv-call-lbl"'+ce(id+'.callLabel',edit)+'>'+esc(p.callLabel||'Prefer to talk?')+'</div><a class="tel" href="'+esc(telHref)+'"'+(edit?' onclick="event.preventDefault()"':'')+'><span'+ce(id+'.phone',edit)+'>'+esc(p.phone||'01633 965205')+'</span></a></div><a class="pv-btn dark ghost" href="'+esc(telHref)+'"'+(edit?' onclick="event.preventDefault()"':'')+'><span'+ce(id+'.callBtn',edit)+'>'+esc(p.callBtn||'Call us now')+'</span></a></div>';
   }
   var qfld=function(label,req,ph,type,name){
     var lab='<label for="pv-'+name+'">'+label+(req?' <span class="req">*</span>':'')+'</label>';
     if(type==='textarea')return '<div class="pv-qfield">'+lab+'<textarea id="pv-'+name+'" name="'+name+'" rows="2" placeholder="'+esc(ph)+'"'+(req?' required':'')+'></textarea></div>';
     return '<div class="pv-qfield">'+lab+'<input id="pv-'+name+'" name="'+name+'" type="'+(type||'text')+'" placeholder="'+esc(ph)+'"'+(req?' required':'')+'></div>';
   };
   var rows='';
   if(p.fName!==false)rows+=qfld(p.nameLabel||'Full name',true,p.namePh||'Your name','text','name');
   if(p.fPhone!==false)rows+=qfld(p.phoneLabel||'Phone',false,p.phonePh||'Mobile or landline','tel','phone');
   if(p.fEmail!==false)rows+=qfld(p.emailLabel||'Email',true,p.emailPh||'you@email.com','email','email');
   if(p.fPost!==false)rows+=qfld(p.postLabel||'Postcode',false,p.postPh||'e.g. CF10 1AA','text','postcode');
   if(p.fInterest!==false)rows+=qfld(p.interestLabel||'What are you interested in? (optional)',false,p.interestPh||'Solar, battery, heat pump, EV…','textarea','interest');
   var seg='';
   if(p.showTabs!==false)seg='<div class="pv-seg" role="group" aria-label="Property type"><button type="button" class="on" data-value="home"><span'+ce(id+'.tabHome',edit)+'>'+esc(p.tabHome||'For my home')+'</span></button><button type="button" data-value="business"><span'+ce(id+'.tabBiz',edit)+'>'+esc(p.tabBiz||'For my business')+'</span></button></div>';
   else seg='<input type="hidden" name="propertyType" value="home">';
   var cta='<button type="submit" class="pv-btn solar'+(p.pulse?' pulse':'')+'"><span data-btn-label'+ce(id+'.btn',edit)+'>'+esc(p.btn||'Get my free quote')+'</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>';
   var foot=p.footnote?'<p class="pv-form-re">'+QUOTE_SHIELD_SVG+'<span'+ce(id+'.footnote',edit)+'>'+esc(p.footnote)+'</span></p>':'';
   var legal=p.legalNote?'<p class="pv-form-note"'+ce(id+'.legalNote',edit)+'>'+esc(p.legalNote)+'</p>':'';
   var why='<div class="pv-why">'+eyebrow(p.eyebrow||'Free, no-obligation quote',id+'.eyebrow',edit)+'<h2>'+accentText(p.title||'Ready to see what you could save?')+'</h2>'+pts+callBox+'</div>';
   var form='<form class="pv-qcard pv-cms-form" action="/api/quote" method="post" novalidate>'+seg+rows+'<div class="pv-form-msg" hidden></div><div class="pv-form-actions">'+cta+'</div>'+foot+legal+'</form>';
   return '<div class="pv-quote is-split" id="'+esc(anchor)+'"><div class="wrap"><div class="pv-qgrid">'+why+form+'</div></div></div>';}
if(t==='pricing')return '<div class="pv-sec"><div class="shead center">'+eyebrow(p.eyebrow||'Options',id+'.eyebrow',edit)+'<h2>'+accentText(p.title)+'</h2></div><div style="display:grid;grid-template-columns:repeat('+p.plans.length+',1fr);gap:14px">'+p.plans.map((pl,i)=>'<div class="pv-card'+(pl.hl?' pv-plan-hl':'')+'"><div style="font-family:var(--mono);font-size:.64rem;text-transform:uppercase;letter-spacing:.06em;color:var(--amber-2)"'+ce(id+'.plans.'+i+'.name',edit)+'>'+esc(pl.name)+'</div><div style="font-family:var(--display);font-weight:900;font-size:1.9rem;margin:6px 0"'+ce(id+'.plans.'+i+'.price',edit)+'>'+esc(pl.price)+'</div><div style="color:var(--muted);font-size:.8rem;margin-bottom:12px"'+ce(id+'.plans.'+i+'.per',edit)+'>'+esc(pl.per)+'</div>'+pl.feats.map((f,fi)=>'<div style="display:flex;gap:8px;padding:5px 0;font-size:.87rem;border-top:1px solid var(--line)"><span style="color:var(--ok)">✓</span><span'+ce(id+'.plans.'+i+'.feats.'+fi,edit)+'>'+esc(f)+'</span></div>').join('')+'<div style="margin-top:14px">'+btn(pl.cta,pl.hl?'solar':'dark ghost',false,null,id+'.plans.'+i+'.cta',edit,pl.ctaHref||'#quote')+'</div></div>').join('')+'</div></div>';
 if(t==='steps')return '<div class="pv-sec"><div class="shead">'+eyebrow(p.eyebrow||'How it works',id+'.eyebrow',edit)+'<h2'+ce(id+'.title',edit)+'>'+accentText(p.title)+'</h2></div><div class="pv-steps" style="grid-template-columns:repeat('+p.items.length+',1fr)">'+p.items.map((s,i)=>'<div class="pv-pstep"><div class="n">0'+(i+1)+'</div><h4'+ce(id+'.items.'+i+'.title',edit)+'>'+accentText(s.title)+'</h4><p'+ce(id+'.items.'+i+'.text',edit)+'>'+esc(s.text)+'</p></div>').join('')+'</div></div>';
 if(t==='casestudy')return '<div class="pv-sec"><div class="shead">'+eyebrow(p.eyebrow||'Our work',id+'.eyebrow',edit)+'<h2>'+accentText(p.title)+'</h2></div><div style="display:grid;grid-template-columns:repeat('+Math.min(p.items.length,3)+',1fr);gap:14px">'+p.items.map((cs,i)=>'<div class="pv-card" style="padding:0;overflow:hidden">'+(cs.img?imgTag(cs.img,'width:100%;height:150px;object-fit:cover;display:block',edit,id+'.items.'+i+'.img'):'<div style="height:150px;background:linear-gradient(135deg,#26324c,#171d2b)"></div>')+'<div style="padding:18px"><div style="font-family:var(--mono);font-size:.6rem;letter-spacing:.05em;text-transform:uppercase;color:var(--muted)"'+ce(id+'.items.'+i+'.loc',edit)+'>'+esc(cs.loc)+'</div><h3 style="font-size:1.02rem;font-weight:600;margin-top:4px">'+accentText(cs.title)+'</h3><div style="font-family:var(--display);font-weight:900;color:var(--amber-2);font-size:1.4rem;margin-top:10px"'+ce(id+'.items.'+i+'.stat',edit)+'>'+esc(cs.stat)+'</div><div style="font-size:.76rem;color:var(--muted)"'+ce(id+'.items.'+i+'.statlabel',edit)+'>'+esc(cs.statlabel)+'</div></div></div>').join('')+'</div></div>';
 if(t==='clientbanner'){const cs=p.clients||[];const chip=c=>'<span class="pv-brand">'+(c.img?'<img src="'+c.img+'">':esc(c.name))+'</span>';return '<div class="pv-banner"><div class="bh">'+accentText(p.heading)+'</div><div class="pv-bmarq"><div class="trk">'+cs.map(chip).join('')+cs.map(chip).join('')+'</div></div></div>';}
 if(t==='trustbar'){
    var logos = p.logos ? String(p.logos).split(',').map(function(l){return '<span class="ac"'+ce(id+'.logos',edit)+'>'+esc(l.trim())+'</span>'}).join('') : '';
    return '<div class="trustbar"><div class="wrap"><div class="acc">'+logos+'</div><div class="rev"><span class="stars">★★★★★</span> <span'+ce(id+'.rating',edit)+'>'+esc(p.rating||'')+'</span></div></div></div>';
}
if(t==='rich'){
   var richCe=edit?' contenteditable="true" data-ep="'+id+'.html" data-html="1" oninput="epInput(this)" onblur="epBlur(this)" onkeydown="epKey(event,true)" onclick="richClick(event,this,\''+id+'\')"':'';
   return '<div class="pv-rich"'+richCe+'>'+(p.html||'<p>Rich text…</p>')+'</div>';
 }
 if(t==='estband'){
   return '<div class="pv-estband"><div class="pv-estband-inner"><div><h2'+ce(id+'.headline',edit)+'>'+accentText(p.headline)+'</h2><p'+ce(id+'.sub',edit)+'>'+esc(p.sub)+'</p></div><div class="eb-btn">'+btn(p.btnLabel,'dark',false,null,id+'.btnLabel',edit,p.btnHref||'#quote')+'</div></div></div>';
 }
 return '';
}
function renderPreview(){
 const pv=document.getElementById('preview');pv.className='preview'+(VIEW==='mob'?' mob':'')+(page().theme==='dark'?' dk':'');
 pv.ondragover=function(e){pvOver(e);};pv.ondrop=function(e){pvDropEnd(e);};pv.ondragleave=function(e){pvLeaveZone(e);};
 const b=page().blocks;
 document.getElementById('pvname').textContent=page().name+' · '+page().slug;
 if(!b.length){pv.innerHTML='<div class="pv-empty" ondragover="pvOver(event)" ondrop="pvDropEnd(event)">Empty page — drag a section here, or add one from the left ↙</div>';return;}
 pv.innerHTML=b.map((bl,i)=>'<div class="pv-block'+(SEL===bl.id?' sel':'')+'" style="'+spacingStyle(bl.p)+'" data-idx="'+i+'" ondragover="pvOver(event,'+i+',this)" ondragleave="pvLeave(this)" ondrop="pvDrop(event,'+i+')" onclick="selectBlock(\''+bl.id+'\')">'+renderBlock(bl,true)+'</div>').join('');
 if(typeof window.initCmsFormRuntime==='function')window.initCmsFormRuntime();
 if(typeof window.initPvFaq==='function')window.initPvFaq(pv);
}
/* Inline edit: write contenteditable text back to the block model by data-ep path. */
function epSet(el){const ep=el.getAttribute('data-ep');if(!ep)return;const parts=ep.split('.');const bl=findBlock(parts[0]);if(!bl)return;let o=bl.p;for(let i=1;i<parts.length-1;i++){o=o[parts[i]];if(o==null)return;}o[parts[parts.length-1]]=el.getAttribute('data-html')==='1'?el.innerHTML:el.textContent;}
function epInput(el){epSet(el);debSave();}
function epBlur(el){epSet(el);renderBuild();save();}
function epKey(e,allowEnter){if(allowEnter)return;if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();e.target.blur();}}
/* Select a rich block from the preview without re-rendering (keeps caret). */
function richClick(e,el,id){e.stopPropagation();if(SEL===id)return;SEL=id;tplHide();document.querySelectorAll('.pv-block').forEach(function(n){n.classList.remove('sel');});var blk=el.closest('.pv-block');if(blk)blk.classList.add('sel');renderBuild();}
/* Drag-and-drop onto the visual preview (new sections from the add menu, or an
   existing block dragged from the left outline). Reuses dragNewType / dragIdx. */
function pvClear(){document.querySelectorAll('.pv-block.pvdropbefore,.pv-block.pvdropafter').forEach(function(el){el.classList.remove('pvdropbefore','pvdropafter');});const pv=document.getElementById('preview');if(pv)pv.classList.remove('dropzone');document.querySelectorAll('.pv-empty.dropzone').forEach(function(el){el.classList.remove('dropzone');});}
function pvActive(){return dragNewType!==null||dragIdx!==null;}
function pvOver(e,i,blk){if(!e||!pvActive())return;e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect=dragNewType?'copy':'move';
 if(blk&&i!==undefined){blk.classList.remove('pvdropbefore','pvdropafter');const r=blk.getBoundingClientRect();blk.classList.add(e.clientY>r.top+r.height/2?'pvdropafter':'pvdropbefore');}
 else{const pv=document.getElementById('preview');if(pv)pv.classList.add('dropzone');const ct=e.currentTarget;if(ct&&ct.classList&&ct.classList.contains('pv-empty'))ct.classList.add('dropzone');}}
function pvLeave(blk){if(blk)blk.classList.remove('pvdropbefore','pvdropafter');}
function pvLeaveZone(e){const pv=document.getElementById('preview');if(pv&&e&&!pv.contains(e.relatedTarget))pv.classList.remove('dropzone');}
function pvDrop(e,i){if(!pvActive()){return;}if(e){e.preventDefault();e.stopPropagation();}
 const r=e.currentTarget.getBoundingClientRect();let idx=e.clientY>r.top+r.height/2?i+1:i;
 if(dragNewType!==null){const t=dragNewType;dragNewType=null;dragIdx=null;pvClear();addBlockAt(t,idx);return;}
 if(dragIdx!==null){const b=page().blocks;let from=dragIdx;if(from<idx)idx--;if(idx!==from){const[m]=b.splice(from,1);b.splice(idx,0,m);}dragIdx=null;pvClear();renderPreview();renderBuild();save();return;}
 pvClear();}
function pvDropEnd(e){if(!pvActive()){pvClear();return;}if(e)e.preventDefault();
 if(dragNewType!==null){const t=dragNewType;dragNewType=null;dragIdx=null;pvClear();addBlockAt(t,page().blocks.length);return;}
 if(dragIdx!==null){const b=page().blocks;const[m]=b.splice(dragIdx,1);b.push(m);dragIdx=null;pvClear();renderPreview();renderBuild();save();return;}
 pvClear();}

/* ============ LEFT: BUILD PANEL ============ */
let dragIdx=null;
function renderBuild(){
 tplHide();
 const el=document.getElementById('panel-build');const b=page().blocks;
 let h='<div class="ph">'+SPARK+'Page layout — drag to reorder, or drop a new section here</div>';
 h+='<div id="outline" ondragover="dover(event)" ondrop="ddropEnd(event)" ondragleave="dleaveZone(event)">';
 if(!b.length){
   h+='<div class="outline-empty" ondragover="dover(event)" ondrop="ddropEnd(event)">Drag a section here, or click “Add section” below.</div>';
 }
 h+=b.map((bl,i)=>
   '<div class="blkrow'+(SEL===bl.id?' sel':'')+'" draggable="true" data-i="'+i+'" onmouseenter="blockRowPrev(\''+bl.id+'\',this)" onmouseleave="blockRowLeave(event)" ondragstart="dstart(event,'+i+')" ondragover="dover(event,'+i+',this)" ondragleave="dleave(this)" ondrop="ddrop(event,'+i+')" ondragend="dend()" onclick="selectBlock(\''+bl.id+'\')">'+
   '<span class="gr">⋮⋮</span><span class="nm">'+blockDisplayName(bl.t)+'</span><span class="ty">'+blockTypeKey(bl.t)+'</span><button class="x" onclick="event.stopPropagation();confirmDelBlock(\''+bl.id+'\')">×</button></div>').join('')+'</div>';
 h+='<div class="addwrap"><button class="addbtn" onclick="document.getElementById(\'addmenu\').classList.toggle(\'hide\')">+ Add section</button>'+
   '<div class="addmenu hide" id="addmenu">'+Object.keys(BLOCKNAMES).map(t=>'<button draggable="true" ondragstart="dstartNew(event,\''+t+'\')" ondragend="dend()" onmouseenter="sectionPrev(\''+t+'\',this)" onmouseleave="blockRowLeave(event)" onclick="addBlock(\''+t+'\')" title="Click to add, or drag onto the layout">'+BLOCKNAMES[t]+'</button>').join('')+'</div></div>';
 // inspector
 if(SEL){const bl=b.find(x=>x.id===SEL);if(bl)h+='<div style="margin-top:18px;border-top:1px solid var(--line);padding-top:14px"><div class="ph">'+SPARK+'Edit: '+blockDisplayName(bl.t)+'</div>'+inspector(bl)+'</div>';}
 el.innerHTML=h;
}
function txt(label,val,path){return '<div class="fld"><label>'+label+'</label><input value="'+esc(val)+'" oninput="updT(\''+path+'\',this.value)"></div>'}
function area(label,val,path){return '<div class="fld"><label>'+label+'</label><textarea rows="2" oninput="updT(\''+path+'\',this.value)">'+esc(val)+'</textarea></div>'}
function chk(label,val,path){return '<label class="chk"><input type="checkbox" '+(val?'checked':'')+' onchange="upd(\''+path+'\',this.checked)">'+label+'</label>'}
/** Button destination — site path, hash, or full URL (picker + custom path). */
function routeFld(label,val,path){
  return '<div class="fld"><label>'+(label||'Button link / route')+'</label>'
    +'<div class="link-pick-row">'
    +'<input class="link-pick-path-input" value="'+esc(val||'')+'" placeholder="e.g. /blog, #quote, tel:…" oninput="updT(\''+path+'\',this.value)" onchange="upd(\''+path+'\',this.value)">'
    +linkPickHtml(val||'',"upd('"+path+"')")
    +'</div>'
    +'<div class="hint">Pick a page or section, or type a custom path — e.g. <code>/blog</code>, <code>#quote</code>, <code>tel:…</code>, or <code>https://…</code></div></div>';
}
function iconPicker(cur,path){const uid2='ip'+Math.random().toString(36).slice(2,7);
 return '<div class="fld"><label>Icon (library — '+ICONKEYS.length+')</label><input placeholder="search icons…" style="margin-bottom:5px" oninput="filterIcons(this,\''+uid2+'\')"><div class="iconpick" id="'+uid2+'">'+ICONKEYS.map(k=>'<button data-k="'+k+'" class="'+(k===cur?'on':'')+'" onclick="upd(\''+path+'\',\''+k+'\')" title="'+k+'">'+icon(k,18)+'</button>').join('')+'</div></div>'}
function filterIcons(inp,id){const q=inp.value.toLowerCase();document.getElementById(id).querySelectorAll('button').forEach(b=>{b.style.display=b.dataset.k.includes(q)?'':'none'})}
function inspector(bl){const p=bl.p,id=bl.id;const bt=blockTypeKey(bl.t);let h='';
 if(bt==='hero'){h+=txt('Blog tags',p.tags||'',id+'.tags')+'<div class="hint">Comma or | separated — shown at the top of the hero (blog posts).</div>'+txt('Eyebrow',p.eyebrow,id+'.eyebrow')+accentArea('Headline',p.headline,id+'.headline')+area('Subheadline',p.sub,id+'.sub')+'<div class="hint">Leave subheadline empty to remove the gap under the title.</div>';
   h+=chk('Wider text',!!p.textWide,id+'.textWide')+'<div class="hint">Wider text hides the right spark/logo and lets the headline span the full width — ideal for blog heroes.</div>';
   h+=imagePicker(p.markImg||'',id+'.markImg')+'<div class="hint">Optional custom image for the right mark. Leave empty for the default gold spark. Hidden when <b>Wider text</b> or <b>Hide right logo</b> is on.</div>';
   h+=chk('Hide right logo / mark',!!p.hideMark,id+'.hideMark')+chk('Hide sun glow',!!p.hideSun,id+'.hideSun')+chk('Hide rating row',!!p.hideRating,id+'.hideRating')+chk('Hide microtrust line',!!p.hideMicrotrust,id+'.hideMicrotrust');
   h+=chk('Disable primary button',!!p.ctaDisabled,id+'.ctaDisabled')+(p.ctaDisabled?'<div class="hint">Primary button is hidden.</div>':txt('Primary button',p.ctaLabel,id+'.ctaLabel')+routeFld('Primary button link',p.ctaHref||'#quote',id+'.ctaHref')+chk('Pulse animation on button',p.ctaPulse,id+'.ctaPulse'));
   h+=chk('Disable secondary button',!!p.cta2Disabled,id+'.cta2Disabled')+(p.cta2Disabled?'<div class="hint">Secondary button is hidden.</div>':txt('Secondary button',p.cta2,id+'.cta2')+routeFld('Secondary button link',p.cta2Href||'',id+'.cta2Href'));
   h+=txt('Microtrust bar',p.microtrust!=null?p.microtrust:'Free survey · No obligation · No salespeople · Insurance-backed guarantees',id+'.microtrust')+txt('Rating value',p.ratingValue||'4.9',id+'.ratingValue')+txt('Installs count',p.ratingInstalls||'1200',id+'.ratingInstalls');}
 else if(bt==='stats'){h+='<div class="hint">Stat tiles</div>';p.items.forEach((s,i)=>{h+='<div class="sub"><div class="sh"><b>Tile '+(i+1)+'</b><button class="rm" onclick="rmItem(\''+id+'\',\'items\','+i+')">remove</button></div>'+txt('Number',s.n,id+'.items.'+i+'.n')+txt('Label',s.k,id+'.items.'+i+'.k')+'</div>';});h+='<button class="miniadd" onclick="addItem(\''+id+'\',\'items\',{n:\'0\',k:\'Label\'})">+ Add tile</button>';}
 else if(bt==='footer'){h+=imagePicker(p.logoImg||'',id+'.logoImg')+'<div class="hint">Footer logo — leave empty to show the brand name as text.</div>'+txt('Brand name (fallback)',p.brandText||'Heliaxis',id+'.brandText')+area('About text',p.about,id+'.about');
   (p.cols||[]).forEach(function(col,ci){
    h+='<div class="sub"><div class="sh"><b>Column '+(ci+1)+'</b>'+(ci>0?'<button class="rm" onclick="rmFooterCol(\''+id+'\','+ci+')">remove col</button>':'')+'</div>'+txt('Heading',col.title,id+'.cols.'+ci+'.title');
    (col.links||[]).forEach(function(lk,li){
     h+='<div class="sub" style="background:var(--paper-2)"><div class="sh"><b>Link '+(li+1)+'</b><button class="rm" onclick="rmFooterLink(\''+id+'\','+ci+','+li+')">×</button></div>'+txt('Label',lk.label,id+'.cols.'+ci+'.links.'+li+'.label')+routeFld('URL / route',lk.href||'',id+'.cols.'+ci+'.links.'+li+'.href')+'</div>';
    });
    h+='<button class="miniadd" onclick="addFooterLink(\''+id+'\','+ci+')">+ Add link</button></div>';
   });
   h+='<button class="miniadd" onclick="addItem(\''+id+'\',\'cols\',{title:\'Column\',links:[{label:\'Link\',href:\'/\'}]})">+ Add column</button>'+txt('Copyright line',p.copyright,id+'.copyright')+txt('Site URL label',p.siteUrl||'heliaxis.co.uk',id+'.siteUrl')+routeFld('Site URL link',p.siteHref||'https://heliaxis.co.uk',id+'.siteHref')+'<div class="hint">Footer links use real routes — e.g. <code>/commercial-funding</code>, <code>/#faq</code>, <code>/#quote</code>.</div>';}
 else if(bt==='grid'){h+=txt('Eyebrow',p.eyebrow,id+'.eyebrow')+accentArea('Title',p.title,id+'.title')+txt('Section anchor ID',p.anchor||'',id+'.anchor')+'<div class="hint">Optional — used by footer/nav links, e.g. <code>services</code> → <code>/#services</code>.</div>'+chk('Center header',!!p.centerHeader,id+'.centerHeader');
   h+='<div class="fld"><label>Columns (grid width)</label><div class="seg">'+[2,3,4].map(c=>'<button class="'+(p.cols===c?'on':'')+'" onclick="upd(\''+id+'.cols\','+c+')">'+c+' wide</button>').join('')+'</div></div>';
   h+='<div class="fld"><label>If a row is incomplete</label><select onchange="upd(\''+id+'.fill\',this.value)">'+'<option value="none"'+((p.fill||'none')==='none'?' selected':'')+'>Leave empty</option>'+'<option value="contact"'+(p.fill==='contact'?' selected':'')+'>Fill gap with a get-in-touch card</option>'+'<option value="balance"'+(p.fill==='balance'?' selected':'')+'>Balance / centre the last row</option>'+'</select></div>';
   if(p.fill==='contact')h+='<div class="sub" style="background:var(--paper-2)"><div class="sh"><b>Get-in-touch card</b></div>'+txt('Heading',p.contactHeading||'Get in touch',id+'.contactHeading')+area('Text',p.contactText||'',id+'.contactText')+txt('Button',p.contactBtn||'Contact us',id+'.contactBtn')+routeFld('Button link',p.contactHref||'#quote',id+'.contactHref')+'</div>';
   h+='<div class="hint">'+p.items.length+' items × '+p.cols+' wide = '+Math.ceil(p.items.length/p.cols)+' rows. Add or remove items to change the shape (e.g. 3 items = 1×3, 6 = 2×3, 4 at 2-wide = 2×2).</div>';
   p.items.forEach((it,i)=>{h+='<div class="sub"><div class="sh"><b>Item '+(i+1)+'</b><button class="rm" onclick="rmItem(\''+id+'\',\'items\','+i+')">remove</button></div>'+iconPicker(it.icon,id+'.items.'+i+'.icon')+txt('Title',it.title,id+'.items.'+i+'.title')+txt('Description',it.desc,id+'.items.'+i+'.desc')+'</div>';});
   h+='<button class="miniadd" onclick="addItem(\''+id+'\',\'items\',{icon:\'solar\',title:\'New item\',desc:\'Description\'})">+ Add item</button>'+accentHint();}
 else if(bt==='split'){h+='<div class="hint"><b>Left card</b></div>'+iconPicker(p.lIcon||'home',id+'.lIcon')+txt('Title',p.lt,id+'.lt')+area('Text',p.ld,id+'.ld')+bulletsEd(id,'lb',p.lb)+txt('Button',p.lc,id+'.lc')+routeFld('Button link',p.lcHref||'#quote',id+'.lcHref');
    h+='<div class="hint"><b>Right card (dark)</b></div>'+iconPicker(p.rIcon||'building',id+'.rIcon')+txt('Title',p.rt,id+'.rt')+area('Text',p.rd,id+'.rd')+bulletsEd(id,'rb',p.rb)+txt('Button',p.rc,id+'.rc')+routeFld('Button link',p.rcHref||'/commercial-funding',id+'.rcHref')+accentHint();}
 else if(bt==='estband'){h+=accentArea('Headline',p.headline,id+'.headline')+area('Subtext',p.sub,id+'.sub')+txt('Button label',p.btnLabel,id+'.btnLabel')+routeFld('Button link',p.btnHref||'#quote',id+'.btnHref');}
 else if(bt==='gallery'){var gfi=galleryFeaturedIndex(p);
   h+=txt('Eyebrow',p.eyebrow||'Recent work',id+'.eyebrow')+accentArea('Title',p.title||'Installs across South Wales',id+'.title')+area('Subtext (leave empty to hide)',p.sub!=null?p.sub:'A few of the homes and businesses we\'ve powered up. Real drone & install photos drop straight into these frames.',id+'.sub')+txt('Featured placeholder label',p.featuredLabel!=null?p.featuredLabel:'Featured install',id+'.featuredLabel')+area('Footnote (leave empty to hide)',p.footnote!=null?p.footnote:'Placeholder frames — swap in your real drone & install photography.',id+'.footnote')+'<div class="hint">Click the <b>camera icon</b> in the preview to upload a photo directly. One <b>featured</b> large frame + smaller frames.</div>';
   p.items.forEach(function(it,i){h+='<div class="sub"><div class="sh"><b>Frame '+(i+1)+'</b><span style="display:flex;gap:4px;align-items:center"><button type="button" class="rm" onclick="moveGalItem(\''+id+'\',\'items\','+i+',-1)"'+(i===0?' disabled style="opacity:.35"':'')+' title="Move up">↑</button><button type="button" class="rm" onclick="moveGalItem(\''+id+'\',\'items\','+i+',1)"'+(i===p.items.length-1?' disabled style="opacity:.35"':'')+' title="Move down">↓</button><button class="rm" onclick="rmItem(\''+id+'\',\'items\','+i+')">remove</button></span></div>';
   if(gfi!==i)h+='<button type="button" class="miniadd" style="margin-bottom:8px" onclick="setGalleryFeatured(\''+id+'\','+i+')">Make large featured frame</button>';
   else h+='<div class="hint" style="color:var(--ok);margin-bottom:8px">✓ Large featured frame</div>';
   h+=imagePicker(it.img,id+'.items.'+i+'.img')+'<div class="hint" style="font-size:.76rem;margin:-4px 0 8px">With an image: drag to pan, scroll to zoom in preview.</div>'+txt('Location label',it.loc,id+'.items.'+i+'.loc')+'</div>';});
   h+='<button class="miniadd" onclick="addItem(\''+id+'\',\'items\',{img:\'\',loc:\'Town · 4.0 kWp\',featured:false})">+ Add frame</button>';}
 else if(bt==='funding'){h+=txt('Eyebrow',p.eyebrow||'Funding & finance',id+'.eyebrow')+accentArea('Title',p.title||'Solar within reach, whatever your budget',id+'.title')+area('Subtext (leave empty to hide)',p.sub!=null?p.sub:'Buy outright, spread the cost, or pay nothing upfront — plus the Welsh grants worth knowing about.',id+'.sub')+'<div class="hint">Dark band with funding cards and an urgency CTA. Click text in the preview to edit.</div>';
   p.items.forEach(function(it,i){h+='<div class="sub"><div class="sh"><b>Card '+(i+1)+'</b><button class="rm" onclick="rmItem(\''+id+'\',\'items\','+i+')">remove</button></div>'+accentArea('Title',it.title,id+'.items.'+i+'.title')+area('Text',it.text,id+'.items.'+i+'.text')+'</div>';});
   h+='<button class="miniadd" onclick="addItem(\''+id+'\',\'items\',{title:\'New option\',text:\'Description.\'})">+ Add card</button>'+accentHint();
   h+=chk('Hide urgency button',!!p.ctaDisabled,id+'.ctaDisabled')+(p.ctaDisabled?'<div class="hint">Urgency button is hidden on the page.</div>':txt('Urgency button',p.cta||'0% VAT ends March 2027 — see all funding routes →',id+'.cta')+routeFld('Button link',p.ctaHref||'/commercial-funding',id+'.ctaHref'));}
 else if(bt==='testi'){h+=txt('Eyebrow',p.eyebrow||'Real customers',id+'.eyebrow')+accentArea('Title',p.title||'Trusted across South Wales',id+'.title')+area('Footnote (leave empty to hide)',p.footnote!=null?p.footnote:'Illustrative testimonials — replace with your real Google & Trustpilot reviews.',id+'.footnote')+'<div class="hint">Add testimonials. <b>More than 3 turns it into an auto-scrolling slider.</b></div>';
   h+='<div class="fld"><label>Slider speed — '+(p.speed||36)+'s per loop (lower = faster)</label><input type="range" min="12" max="80" value="'+(p.speed||36)+'" oninput="updT(\''+id+'.speed\',+this.value)"></div>';
   p.items.forEach((tt,i)=>{h+='<div class="sub"><div class="sh"><b>#'+(i+1)+'</b><button class="rm" onclick="rmItem(\''+id+'\',\'items\','+i+')">remove</button></div>'+area('Quote',tt.quote,id+'.items.'+i+'.quote')+'<div class="row2">'+txt('Name',tt.name,id+'.items.'+i+'.name')+txt('Location',tt.loc,id+'.items.'+i+'.loc')+'</div><div class="fld"><label>Stars — '+(tt.stars||5)+'</label><div class="seg">'+[1,2,3,4,5].map(s=>'<button class="'+((tt.stars||5)===s?'on':'')+'" onclick="upd(\''+id+'.items.'+i+'.stars\','+s+')">'+s+'★</button>').join('')+'</div></div></div>';});
   h+='<button class="miniadd" onclick="addItem(\''+id+'\',\'items\',{stars:5,quote:\'Great service.\',name:\'Name\',loc:\'Town · Solar\'})">+ Add testimonial</button>';
   if(p.items.length>3)h+='<div class="hint" style="color:var(--ok)">✓ Slider active ('+p.items.length+' testimonials)</div>';}
 else if(bt==='banner'){h+=accentArea('Heading',p.heading,id+'.heading')+'<div class="hint">Logos are managed in the <b>Logos</b> tab. Any logo ticked “Include in banner” shows here automatically.</div>';}
 else if(bt==='cta'){h+=accentArea('Headline',p.headline,id+'.headline')+area('Subtext',p.sub,id+'.sub');
   h+='<div class="sub"><div class="sh"><b>Primary button</b></div>'+chk('Hide primary button',!!p.ctaDisabled,id+'.ctaDisabled')+(p.ctaDisabled?'<div class="hint">Primary button is hidden.</div>':txt('Label',p.btn,id+'.btn')+routeFld('Link / route',p.btnHref||'#quote',id+'.btnHref')+chk('Pulse animation',p.pulse,id+'.pulse'))+'</div>';
   h+='<div class="sub"><div class="sh"><b>Secondary button</b></div>'+chk('Hide secondary button',!!p.cta2Disabled,id+'.cta2Disabled')+(p.cta2Disabled?'<div class="hint">Secondary button is hidden.</div>':txt('Label',p.btn2||'Call 01633 965205',id+'.btn2')+routeFld('Link / route',p.btn2Href||'tel:01633965205',id+'.btn2Href'))+'</div>';}
 else if(bt==='faq'){h+=txt('Eyebrow',p.eyebrow||'Good to know',id+'.eyebrow')+accentArea('Title',p.title||'Your questions, answered',id+'.title')+txt('Section anchor ID',p.anchor||'faq',id+'.anchor')+'<div class="hint">Accordion FAQ — click questions in the preview to expand (disabled while editing). Nav links use <code>/#'+esc(p.anchor||'faq')+'</code>.</div>';
   p.items.forEach((q,i)=>{h+='<div class="sub"><div class="sh"><b>Q'+(i+1)+'</b><button class="rm" onclick="rmItem(\''+id+'\',\'items\','+i+')">remove</button></div>'+txt('Question',q.q,id+'.items.'+i+'.q')+area('Answer',q.a,id+'.items.'+i+'.a')+'</div>';});h+='<button class="miniadd" onclick="addItem(\''+id+'\',\'items\',{q:\'Question?\',a:\'Answer.\'})">+ Add question</button>';}
 else if(bt==='rich'){h+=area('Content (HTML allowed)',p.html,id+'.html')+'<div class="hint">Or click the text in the preview to edit it directly. Enter adds a new line.</div>';}
 else if(bt==='form'){
   var fv=formVariant(p);
   h+='<div class="fld"><label>Layout</label><div class="seg"><button class="'+(fv==='quote'?'on':'')+'" onclick="upd(\''+id+'.variant\',\'quote\');renderBuild();renderPreview();save()">Quote (2-col)</button><button class="'+(fv==='contact'?'on':'')+'" onclick="upd(\''+id+'.variant\',\'contact\');renderBuild();renderPreview();save()">Contact (full)</button></div></div>';
   if(fv==='contact'){
     h+=accentArea('Heading',p.heading,id+'.heading')+area('Sub',p.sub,id+'.sub')+txt('Button',p.btn,id+'.btn')+chk('Pulse button',p.pulse,id+'.pulse')+'<div class="hint">Full-width contact form with sector tiles — for /contact style pages.</div><div class="hint">Fields</div>'+chk('Name',p.fName,id+'.fName')+chk('Organisation',p.fOrg,id+'.fOrg')+chk('Email',p.fEmail,id+'.fEmail')+chk('Phone',p.fPhone,id+'.fPhone')+chk('Postcode',p.fPost,id+'.fPost')+chk('Sector picker',p.fSector,id+'.fSector')+chk('Interest checkboxes',p.fInterests,id+'.fInterests')+chk('Message',p.fMsg,id+'.fMsg');
   } else {
     h+=txt('Eyebrow',p.eyebrow||'Free, no-obligation quote',id+'.eyebrow')+accentArea('Title',p.title||'Ready to see what you could save?',id+'.title')+txt('Section anchor ID',p.anchor||'quote',id+'.anchor')+'<div class="hint">Two-column quote section — benefits left, form right. Submits to <code>/api/quote</code>.</div>';
     (p.points||[]).forEach(function(pt,i){h+='<div class="sub"><div class="sh"><b>Point '+(i+1)+'</b><button class="rm" onclick="rmItem(\''+id+'\',\'points\','+i+')">remove</button></div>'+txt('Title',pt.title,id+'.points.'+i+'.title')+area('Text',pt.text,id+'.points.'+i+'.text')+'</div>';});
     h+='<button class="miniadd" onclick="addItem(\''+id+'\',\'points\',{title:\'Benefit title\',text:\'Short description.\'})">+ Add benefit</button>';
     h+=chk('Hide call box',!!p.hideCall,id+'.hideCall')+(p.hideCall?'':txt('Call label',p.callLabel||'Prefer to talk?',id+'.callLabel')+txt('Phone number',p.phone||'01633 965205',id+'.phone')+txt('Call button',p.callBtn||'Call us now',id+'.callBtn')+routeFld('Phone link',p.callHref||'tel:01633965205',id+'.callHref'));
     h+=chk('Home / business tabs',p.showTabs!==false,id+'.showTabs')+(p.showTabs===false?'':txt('Home tab',p.tabHome||'For my home',id+'.tabHome')+txt('Business tab',p.tabBiz||'For my business',id+'.tabBiz'));
     h+='<div class="hint">Form fields</div>';
     h+=chk('Name',p.fName!==false,id+'.fName')+(p.fName===false?'':txt('Name label',p.nameLabel||'Full name',id+'.nameLabel')+txt('Name placeholder',p.namePh||'Your name',id+'.namePh'));
     h+=chk('Phone',p.fPhone!==false,id+'.fPhone')+(p.fPhone===false?'':txt('Phone label',p.phoneLabel||'Phone',id+'.phoneLabel')+txt('Phone placeholder',p.phonePh||'Mobile or landline',id+'.phonePh'));
     h+=chk('Email',p.fEmail!==false,id+'.fEmail')+(p.fEmail===false?'':txt('Email label',p.emailLabel||'Email',id+'.emailLabel')+txt('Email placeholder',p.emailPh||'you@email.com',id+'.emailPh'));
     h+=chk('Postcode',p.fPost!==false,id+'.fPost')+(p.fPost===false?'':txt('Postcode label',p.postLabel||'Postcode',id+'.postLabel')+txt('Postcode placeholder',p.postPh||'e.g. CF10 1AA',id+'.postPh'));
     h+=chk('Interest field',p.fInterest!==false,id+'.fInterest')+(p.fInterest===false?'':txt('Interest label',p.interestLabel||'What are you interested in? (optional)',id+'.interestLabel')+txt('Interest placeholder',p.interestPh||'Solar, battery, heat pump, EV…',id+'.interestPh'));
     h+=txt('Submit button',p.btn||'Get my free quote',id+'.btn')+chk('Pulse button',p.pulse,id+'.pulse')+area('Trust footnote',p.footnote!=null?p.footnote:'No obligation and no pushy sales — we\'ll simply arrange a free survey.',id+'.footnote')+area('Legal note (optional)',p.legalNote||'',id+'.legalNote');
   }
 } else if(bt==='media'){h+=imagePicker(p.img,id+'.img')+'<div class="fld"><label>Image side</label><div class="seg"><button class="'+(p.side==='left'?'on':'')+'" onclick="upd(\''+id+'.side\',\'left\')">Left</button><button class="'+(p.side!=='left'?'on':'')+'" onclick="upd(\''+id+'.side\',\'right\')">Right</button></div></div>'+txt('Eyebrow',p.eyebrow,id+'.eyebrow')+accentArea('Title',p.title,id+'.title')+'<div class="fld"><label>Text</label><textarea rows="5" oninput="updT(\''+id+'.text\',this.value)">'+esc(p.text)+'</textarea></div>'+chk('Wider text',!!p.textWide,id+'.textWide')+chk('Disable button',!!p.ctaDisabled,id+'.ctaDisabled')+(p.ctaDisabled?'<div class="hint">Button is hidden on the page.</div>':txt('Button',p.cta,id+'.cta')+routeFld('Button link / route',p.ctaHref||'#quote',id+'.ctaHref'));}
else if(bt==='pricing'){h+=txt('Eyebrow',p.eyebrow,id+'.eyebrow')+accentArea('Title',p.title,id+'.title');p.plans.forEach((pl,i)=>{h+='<div class="sub"><div class="sh"><b>Plan '+(i+1)+'</b><button class="rm" onclick="rmItem(\''+id+'\',\'plans\','+i+')">remove</button></div>'+txt('Name',pl.name,id+'.plans.'+i+'.name')+'<div class="row2">'+txt('Price',pl.price,id+'.plans.'+i+'.price')+txt('Per',pl.per,id+'.plans.'+i+'.per')+'</div>'+bulletsEd(id,'plans.'+i+'.feats',pl.feats)+txt('Button',pl.cta,id+'.plans.'+i+'.cta')+routeFld('Button link',pl.ctaHref||'#quote',id+'.plans.'+i+'.ctaHref')+chk('Highlight this plan',pl.hl,id+'.plans.'+i+'.hl')+'</div>';});h+='<button class="miniadd" onclick="addItem(\''+id+'\',\'plans\',{name:\'Plan\',price:\'£0\',per:\'\',feats:[\'Feature\'],cta:\'Choose\',ctaHref:\'#quote\',hl:false})">+ Add plan</button>';}
 else if(bt==='steps'){h+=txt('Eyebrow',p.eyebrow,id+'.eyebrow')+accentArea('Title',p.title,id+'.title');p.items.forEach((s,i)=>{h+='<div class="sub"><div class="sh"><b>Step '+(i+1)+'</b><button class="rm" onclick="rmItem(\''+id+'\',\'items\','+i+')">remove</button></div>'+txt('Title',s.title,id+'.items.'+i+'.title')+area('Text',s.text,id+'.items.'+i+'.text')+'</div>';});h+='<button class="miniadd" onclick="addItem(\''+id+'\',\'items\',{title:\'Step\',text:\'Detail.\'})">+ Add step</button>'+accentHint();}
 else if(bt==='casestudy'){h+=txt('Eyebrow',p.eyebrow,id+'.eyebrow')+accentArea('Title',p.title,id+'.title');p.items.forEach((cs,i)=>{h+='<div class="sub"><div class="sh"><b>Card '+(i+1)+'</b><button class="rm" onclick="rmItem(\''+id+'\',\'items\','+i+')">remove</button></div>'+imagePicker(cs.img,id+'.items.'+i+'.img')+txt('Location',cs.loc,id+'.items.'+i+'.loc')+txt('Title',cs.title,id+'.items.'+i+'.title')+'<div class="row2">'+txt('Stat',cs.stat,id+'.items.'+i+'.stat')+txt('Stat label',cs.statlabel,id+'.items.'+i+'.statlabel')+'</div></div>';});h+='<button class="miniadd" onclick="addItem(\''+id+'\',\'items\',{img:\'\',loc:\'Town\',title:\'Project\',stat:\'0\',statlabel:\'Label\'})">+ Add card</button>'+accentHint();}
 else if(bt==='clientbanner'){h+=accentArea('Heading',p.heading,id+'.heading');p.clients.forEach((c,i)=>{h+='<div style="display:flex;gap:5px;margin-bottom:5px"><input value="'+esc(c.name)+'" oninput="updArr2(\''+id+'\',\'clients\','+i+',\'name\',this.value)"><button class="rm" onclick="rmItem(\''+id+'\',\'clients\','+i+')">×</button></div>';});h+='<button class="miniadd" onclick="addItem(\''+id+'\',\'clients\',{name:\'Client name\',img:\'\'})">+ Add client</button>';}
  else if(bt==='trustbar'){h+=txt('Logos',p.logos||'',id+'.logos')+'<div class="hint">Comma separated list of text logos (e.g. MCS, RECC, NICEIC).</div>'+txt('Rating text',p.rating||'',id+'.rating');}
 h+=spacingEd(id,p);
 return h;
}
function nestArr(id,key){let o=findBlock(id).p;key.split('.').forEach(k=>o=o[k]);return o;}
function bulletsEd(id,key,arr){let h='<div class="fld"><label>Bullets</label>';arr.forEach((x,i)=>{h+='<div style="display:flex;gap:5px;margin-bottom:5px"><input value="'+esc(x)+'" oninput="nestArr(\''+id+'\',\''+key+'\')['+i+']=this.value;renderPreview();save()"><button class="rm" onclick="nestArr(\''+id+'\',\''+key+'\').splice('+i+',1);renderBuild();renderPreview();save()">×</button></div>';});h+='<button class="miniadd" onclick="nestArr(\''+id+'\',\''+key+'\').push(\'New point\');renderBuild();renderPreview();save()">+ Bullet</button></div>';return h;}

/* ============ MUTATIONS ============ */
function spacingStyle(p){let s='';if(p._pt)s+='padding-top:'+p._pt+'px;';if(p._pb)s+='padding-bottom:'+p._pb+'px;';if(p._mt)s+='margin-top:'+p._mt+'px;';if(p._mb)s+='margin-bottom:'+p._mb+'px;';return s;}
function spacingEd(id,p){function n(l,k){return '<div class="fld"><label>'+l+' (px)</label><input type="number" value="'+(p[k]||'')+'" placeholder="0" oninput="updT(\''+id+'.'+k+'\',this.value===\'\'?0:+this.value)"></div>'}
 return '<div class="sub" style="background:var(--paper-2)"><div class="sh"><b>Spacing</b></div><div class="row2">'+n('Pad top','_pt')+n('Pad bottom','_pb')+'</div><div class="row2">'+n('Margin top','_mt')+n('Margin bottom','_mb')+'</div></div>'}
function findBlock(id){return page().blocks.find(b=>b.id===id)}
function upd(path,val){const parts=path.split('.');const bl=findBlock(parts[0]);if(!bl)return;let o=bl.p;for(let i=1;i<parts.length-1;i++){o=o[parts[i]]}o[parts[parts.length-1]]=val;renderPreview();renderBuild();save();}
/* Text/number/range updater: updates preview + saves WITHOUT rebuilding the
   inspector (rebuilding recreates the input and steals focus after one char). */
let _debSaveTimer;
function debSave(){clearTimeout(_debSaveTimer);_debSaveTimer=setTimeout(function(){save();},500);}
function updT(path,val){const parts=path.split('.');const bl=findBlock(parts[0]);if(!bl)return;let o=bl.p;for(let i=1;i<parts.length-1;i++){o=o[parts[i]]}o[parts[parts.length-1]]=val;renderPreview();debSave();}
function updArr(id,key,i,val){findBlock(id).p[key][i]=val;renderPreview();save();}
function updArr2(id,key,i,f,val){findBlock(id).p[key][i][f]=val;renderPreview();save();}
function addItem(id,key,obj){findBlock(id).p[key].push(typeof obj==='object'?JSON.parse(JSON.stringify(obj)):obj);renderPreview();renderBuild();save();}
function rmItem(id,key,i){findBlock(id).p[key].splice(i,1);renderPreview();renderBuild();save();}
function rmFooterLink(id,ci,li){var p=findBlock(id).p;if(!p.cols||!p.cols[ci])return;p.cols[ci].links.splice(li,1);renderPreview();renderBuild();save();}
function addFooterLink(id,ci){var p=findBlock(id).p;if(!p.cols||!p.cols[ci])return;if(!p.cols[ci].links)p.cols[ci].links=[];p.cols[ci].links.push({label:'New link',href:'/'});renderPreview();renderBuild();save();}
function rmFooterCol(id,ci){var p=findBlock(id).p;if(!p.cols)return;p.cols.splice(ci,1);renderPreview();renderBuild();save();}
function selectBlock(id){if(SEL===id)return;SEL=id;tplHide();renderPreview();renderBuild();}
function blockDefs(){const defs={
  hero:{eyebrow:'Eyebrow',headline:'Your headline here',sub:'Supporting sentence.',dark:true,ctaLabel:'Get a quote',ctaHref:'#quote',ctaPulse:false,cta2:'',cta2Href:'',ctaDisabled:false,cta2Disabled:false,textWide:false,tags:'',hideMark:false,hideSun:false,hideRating:false,hideMicrotrust:false,markImg:'',ratingValue:'4.9',ratingInstalls:'1200',microtrust:'Free survey · No obligation · No salespeople · Insurance-backed guarantees'},
  stats:{items:[{n:'100+',k:'Installs'},{n:'£1,200',k:'Saved / yr'},{n:'4.9★',k:'Rating'}]},
  grid:{eyebrow:'Section',title:'Section title',anchor:'',cols:3,fill:'none',contactHeading:'Get in touch',contactText:'Not sure which option fits? Tell us your setup and we\'ll point you the right way.',contactBtn:'Contact us',contactHref:'#quote',items:[{icon:'solar',title:'Item one',desc:'Description.'},{icon:'battery',title:'Item two',desc:'Description.'},{icon:'ev',title:'Item three',desc:'Description.'}]},
  footer:footerDefaults(),
  split:{lIcon:'home',lt:'For your home',ld:'Text.',lb:['Point one','Point two'],lc:'Home quote',lcHref:'#quote',rIcon:'building',rt:'For your business',rd:'Text.',rb:['Point one','Point two'],rc:'Business quote',rcHref:'/commercial-funding'},
  estband:{headline:'See your savings in 20 seconds.',sub:'No forms, no phone calls — just a quick estimate of system size, savings and payback.',btnLabel:'Try the free estimator',btnHref:'#quote'},
  testi:{eyebrow:'Real customers',title:'Trusted across South Wales',footnote:'Illustrative testimonials — replace with your real Google & Trustpilot reviews.',items:[{stars:5,quote:'Great service.',name:'Name',loc:'Town · Solar'}]},
  gallery:{eyebrow:'Recent work',title:'Installs across South Wales',sub:'A few of the homes and businesses we\'ve powered up. Real drone & install photos drop straight into these frames.',featuredLabel:'Featured install',footnote:'Placeholder frames — swap in your real drone & install photography.',featuredIndex:0,items:[{img:'',loc:'Cardiff · 6.4 kWp + 10kWh battery',featured:true},{img:'',loc:'Swansea · 4.0 kWp',featured:false},{img:'',loc:'Newport · Commercial 55 kWp',featured:false},{img:'',loc:'Bridgend · 5.3 kWp + EV',featured:false},{img:'',loc:'Vale of Glamorgan · Heat pump',featured:false}]},
  funding:{eyebrow:'Funding & finance',title:'Solar within reach, whatever your budget',sub:'Buy outright, spread the cost, or pay nothing upfront — plus the Welsh grants worth knowing about.',items:[{title:'0% VAT on home solar',text:'Residential installs carry 0% VAT until 31 March 2027 — a saving worth locking in.'},{title:'Finance & PPA options',text:'Spread the cost, or let a funder cover it entirely with Solar-as-a-Service for businesses.'},{title:'Welsh & local grants',text:'From the Nest scheme to Newport\'s SME decarbonisation grant — we\'ll help you find and time it.'}],cta:'0% VAT ends March 2027 — see all funding routes →',ctaHref:'/commercial-funding',ctaDisabled:false},
  banner:{heading:'Trusted technology we install'},
  cta:{headline:'Ready to start?',sub:'Book a free survey today.',btn:'Get my free quote',btnHref:'#quote',pulse:true,ctaDisabled:false,btn2:'Call us',btn2Href:'tel:01633965205',cta2Disabled:false},
  faq:{eyebrow:'Good to know',title:'Your questions, answered',anchor:'faq',items:[{q:'A question?',a:'An answer.'}]},
  rich:{html:'<p>Write anything here…</p>'},
  media:{img:'',side:'right',eyebrow:'Why choose us',title:'A section title',text:'Describe the benefit here — pair it with a real photo of your work.',cta:'Learn more',ctaHref:'#quote',ctaDisabled:false,textWide:false},
  form:quoteFormDefaults(),
  trustbar:{logos:'MCS, RECC, NICEIC, TrustMark, HIES, ECA',rating:'Rated excellent by South Wales homeowners & businesses'}
};
 Object.assign(defs,window.EXTRA_DEFAULTS||{});return defs;}
function makeBlock(t){const defs=blockDefs();return {id:uid(),t,p:JSON.parse(JSON.stringify(defs[t]))};}
function addBlock(t){const bl=makeBlock(t);page().blocks.push(bl);SEL=bl.id;
 const am=document.getElementById('addmenu');if(am)am.classList.add('hide');renderPreview();renderBuild();save();}
function addBlockAt(t,idx){const b=page().blocks;if(idx==null||idx<0||idx>b.length)idx=b.length;const bl=makeBlock(t);b.splice(idx,0,bl);SEL=bl.id;
 const am=document.getElementById('addmenu');if(am)am.classList.add('hide');renderPreview();renderBuild();save();}
function delBlock(id){page().blocks=page().blocks.filter(b=>b.id!==id);if(SEL===id)SEL=null;renderPreview();renderBuild();save();}
function confirmDelBlock(id){
  var bl=findBlock(id);
  if(!bl)return;
  var name=blockDisplayName(bl.t);
  openConfirmModal({
    title:'Delete section?',
    message:'Are you sure you want to delete this section? This cannot be undone.',
    label:'Section to remove',
    targetHtml:'<div class="modal-confirm-target"><span class="gr">⋮⋮</span><span class="nm">'+esc(name)+'</span><span class="ty">'+esc(bl.t)+'</span></div>',
    confirmLabel:'Delete section',
    action:function(){delBlock(id);}
  });
}
function doDelBlock(id){closeModal();delBlock(id);}
function confirmIconTrash(){
  return '<div class="modal-confirm-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg></div>';
}
function confirmIconInfo(){
  return '<div class="modal-confirm-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg></div>';
}
function openConfirmModal(opts){
  var box=document.getElementById('modalbox');
  var modal=document.getElementById('modal');
  if(!box||!modal)return;
  window._confirmAction=typeof opts.action==='function'?opts.action:null;
  var body=opts.targetHtml
    ?('<div class="modal-confirm-body">'
      +(opts.label?'<div class="modal-confirm-label">'+esc(opts.label)+'</div>':'')
      +opts.targetHtml
      +'</div>')
    :'';
  var danger=opts.danger!==false;
  box.className='modalbox modal-confirm';
  box.innerHTML='<button class="close" onclick="closeModal()">×</button>'
    +'<div class="modal-confirm-head">'
    +(opts.info?confirmIconInfo():confirmIconTrash())
    +'<div><h2>'+esc(opts.title||'Are you sure?')+'</h2><p>'+esc(opts.message||'')+'</p></div>'
    +'</div>'
    +body
    +'<div class="modal-confirm-foot">'
    +'<button type="button" class="mbtn mbtn-ghost" onclick="closeModal()">'+(opts.cancelLabel||'Cancel')+'</button>'
    +(opts.confirmLabel
      ?('<button type="button" class="mbtn '+(danger?'mbtn-danger':'mbtn-primary')+'" onclick="runConfirmAction()">'+esc(opts.confirmLabel)+'</button>')
      :'')
    +'</div>';
  modal.classList.add('show');
}
function openNoticeModal(opts){
  openConfirmModal({
    info:true,
    danger:false,
    title:opts.title||'Notice',
    message:opts.message||'',
    targetHtml:opts.targetHtml,
    label:opts.label,
    cancelLabel:opts.okLabel||'OK',
    confirmLabel:null,
    action:null
  });
}
function runConfirmAction(){
  var fn=window._confirmAction;
  window._confirmAction=null;
  closeModal();
  if(typeof fn==='function')fn();
}
/* drag reorder (existing blocks) + drag-to-add (new sections from the add menu) */
let dragNewType=null;
function clearDropCues(){document.querySelectorAll('.blkrow.dropbefore,.blkrow.dropafter').forEach(function(el){el.classList.remove('dropbefore','dropafter');});const o=document.getElementById('outline');if(o)o.classList.remove('dropzone');document.querySelectorAll('.outline-empty.dropzone').forEach(function(el){el.classList.remove('dropzone');});}
function dstart(e,i){dragIdx=i;dragNewType=null;if(e&&e.dataTransfer){e.dataTransfer.effectAllowed='move';}}
function dstartNew(e,t){dragNewType=t;dragIdx=null;if(e&&e.dataTransfer){e.dataTransfer.effectAllowed='copy';try{e.dataTransfer.setData('text/plain',t);}catch(_){}}}
function dover(e,i,row){if(!e)return;e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect=dragNewType?'copy':'move';
 if(row&&i!==undefined){row.classList.remove('dropbefore','dropafter');const r=row.getBoundingClientRect();row.classList.add(e.clientY>r.top+r.height/2?'dropafter':'dropbefore');}
 else{if(dragNewType!==null||dragIdx!==null){const o=document.getElementById('outline');if(o)o.classList.add('dropzone');const ct=e.currentTarget;if(ct&&ct.classList&&ct.classList.contains('outline-empty'))ct.classList.add('dropzone');}}}
function dleave(row){if(row)row.classList.remove('dropbefore','dropafter');}
function dleaveZone(e){const o=document.getElementById('outline');if(o&&e&&!o.contains(e.relatedTarget))o.classList.remove('dropzone');}
function dropIndex(e,i){const t=e&&e.currentTarget;if(!t||!t.getBoundingClientRect)return i;const r=t.getBoundingClientRect();return e.clientY>r.top+r.height/2?i+1:i;}
function ddrop(e,i){if(e){e.preventDefault();e.stopPropagation();}
 let idx=dropIndex(e,i);
 if(dragNewType!==null){const t=dragNewType;dragNewType=null;dragIdx=null;clearDropCues();addBlockAt(t,idx);return;}
 if(dragIdx===null){clearDropCues();return;}
 const b=page().blocks;const from=dragIdx;if(from<idx)idx--;if(idx!==from){const[m]=b.splice(from,1);b.splice(idx,0,m);}
 dragIdx=null;clearDropCues();renderPreview();renderBuild();save();}
function ddropEnd(e){if(e)e.preventDefault();
 if(dragNewType!==null){const t=dragNewType;dragNewType=null;dragIdx=null;clearDropCues();addBlockAt(t,page().blocks.length);return;}
 if(dragIdx!==null){const b=page().blocks;const[m]=b.splice(dragIdx,1);b.push(m);dragIdx=null;clearDropCues();renderPreview();renderBuild();save();return;}
 clearDropCues();}
function dend(){clearDropCues();pvClear();dragIdx=null;dragNewType=null;}

/* ============ PAGES ============ */
let PAGE_PICKER_SEARCH='';
function pagePickerMatches(pg,q){if(!q)return true;q=q.toLowerCase();return (pg.name||'').toLowerCase().indexOf(q)>=0||(pg.slug||'').toLowerCase().indexOf(q)>=0;}
function pagePickerIndices(){var out=[];STATE.pages.forEach(function(pg,i){if(pagePickerMatches(pg,PAGE_PICKER_SEARCH))out.push(i);});out.sort(function(a,b){var na=(STATE.pages[a].name||'').toLowerCase();var nb=(STATE.pages[b].name||'').toLowerCase();return na<nb?-1:na>nb?1:a-b;});return out;}
function renderPagePickerList(){var el=document.getElementById('pagePickerList');var countEl=document.getElementById('pagePickerCount');if(!el)return;var indices=pagePickerIndices();var cur=STATE.current;var labels={home:'Home',landing:'Landing',case:'Case study',page:'Page',blog:'AI blog'};if(countEl)countEl.textContent=PAGE_PICKER_SEARCH?indices.length+' of '+STATE.pages.length:STATE.pages.length+' pages';if(!indices.length){el.innerHTML='<div class="page-picker-empty">No pages match</div>';return;}el.innerHTML=indices.map(function(i){var pg=STATE.pages[i];var kind=dashPageBadge(pg);return '<button type="button" class="page-picker-item'+(i===cur?' on':'')+'" role="option" aria-selected="'+(i===cur)+'" onclick="pagePickerPick('+i+')"><span class="page-picker-item-name">'+esc(pg.name)+'</span><span class="page-picker-item-meta">'+esc(pg.slug||'/')+' · '+labels[kind]+'</span></button>';}).join('');}
function renderPageSel(){var lbl=document.getElementById('pagePickerLabel');if(lbl&&page())lbl.textContent=page().name;var menu=document.getElementById('pagePickerMenu');if(menu&&menu.classList.contains('open'))renderPagePickerList();}
function togglePagePicker(ev){if(ev)ev.stopPropagation();var menu=document.getElementById('pagePickerMenu');var btn=document.getElementById('pagePickerTrigger');if(!menu)return;if(menu.classList.contains('open')){closePagePicker();return;}closeToolbarMore();menu.classList.add('open');if(btn)btn.setAttribute('aria-expanded','true');PAGE_PICKER_SEARCH='';var inp=document.getElementById('pagePickerSearch');if(inp){inp.value='';inp.focus();}renderPagePickerList();}
function closePagePicker(){var menu=document.getElementById('pagePickerMenu');var btn=document.getElementById('pagePickerTrigger');if(menu)menu.classList.remove('open');if(btn)btn.setAttribute('aria-expanded','false');PAGE_PICKER_SEARCH='';}
function pagePickerSearch(q){PAGE_PICKER_SEARCH=q;renderPagePickerList();}
function pagePickerPick(i){closePagePicker();switchPage(i);}
function renderToolbarPageType(){var el=document.getElementById('toolbarPageType');if(!el)return;if(MODE!=='edit'||!page()){el.innerHTML='';return;}var kind=dashPageBadge(page());var labels={home:'Home',landing:'Landing',case:'Case study',page:'Page',blog:'AI blog'};el.innerHTML='<span class="toolbar-type-badge toolbar-type-'+kind+'">'+labels[kind]+'</span>';var lbl=document.getElementById('toolbarPageLabel');if(lbl)lbl.textContent=page().name;}
function toggleToolbarMore(ev){if(ev)ev.stopPropagation();var menu=document.getElementById('toolbarMore');var btn=document.getElementById('toolbarMoreBtn');if(!menu)return;var open=menu.classList.toggle('open');if(btn)btn.setAttribute('aria-expanded',open?'true':'false');}
function closeToolbarMore(){var menu=document.getElementById('toolbarMore');var btn=document.getElementById('toolbarMoreBtn');if(menu)menu.classList.remove('open');if(btn)btn.setAttribute('aria-expanded','false');}
function switchPage(i){STATE.current=+i;SEL=null;renderAll();save();syncCmsUrl(false);}
function addPage(){
  var box=document.getElementById('modalbox');
  box.className='modalbox';
  var defaultName=uniquePageTitle('New page');
  var defaultSlug=titleToSlug(defaultName);
  box.innerHTML='<button class="close" onclick="closeModal()">×</button>'
    +'<h2>Create new page</h2>'
    +'<p>Give your page a title. The URL slug updates automatically to match.</p>'
    +'<div class="fld"><label for="new-page-name">Page title</label>'
    +'<input id="new-page-name" type="text" value="'+esc(defaultName)+'" placeholder="e.g. Solar Panels Cardiff" oninput="newPageNameInput(this.value)" onkeydown="if(event.key===\'Enter\'){event.preventDefault();confirmNewPage()}"></div>'
    +'<div class="fld"><label for="new-page-slug">URL slug</label>'
    +'<input id="new-page-slug" type="text" value="'+esc(defaultSlug)+'" placeholder="/solar-panels-cardiff" oninput="newPageSlugInput()"></div>'
    +'<div id="new-page-err" class="modal-err" role="alert"></div>'
    +'<div class="modal-actions">'
    +'<button type="button" class="tbtn modal-btn-ghost" onclick="closeModal()">Cancel</button>'
    +'<button type="button" class="tbtn solar modal-btn-primary" onclick="confirmNewPage()">Create page</button>'
    +'</div>';
  document.getElementById('modal').classList.add('show');
  var inp=document.getElementById('new-page-name');
  if(inp){inp.focus();inp.select();}
}
function newPageNameInput(v){var slugInp=document.getElementById('new-page-slug');if(!slugInp||slugInp.dataset.manual==='1')return;slugInp.value=uniquePageSlug(titleToSlug(normTitle(v)));}
function newPageSlugInput(){var slugInp=document.getElementById('new-page-slug');if(slugInp)slugInp.dataset.manual='1';}
function slugFromInput(v,fallbackName){var slug=normTitle(v);if(!slug)slug=titleToSlug(fallbackName);return normSlug(slug);}
function confirmNewPage(){
  var inp=document.getElementById('new-page-name');
  var slugInp=document.getElementById('new-page-slug');
  var err=document.getElementById('new-page-err');
  if(!inp)return;
  var name=normTitle(inp.value);
  if(!name){if(err)err.textContent='Please enter a page name.';inp.focus();return;}
  if(pageTitleTaken(name)){if(err)err.textContent='A page titled “'+name+'” already exists. Choose a different title.';inp.focus();return;}
  var slug=slugFromInput(slugInp?slugInp.value:'',name);
  if(slug==='/'&&pageSlugTaken('/')){if(err)err.textContent='The URL slug / is already used by the homepage. Only one page can use /.';if(slugInp)slugInp.focus();return;}
  if(slug!=='/'&&pageSlugTaken(slug)){if(err)err.textContent='URL slug “'+slug+'” is already used by another page. Choose a different slug.';if(slugInp)slugInp.focus();return;}
  STATE.pages.push({id:uid(),name,slug,type:'page',blocks:[]});
  var np=STATE.pages[STATE.pages.length-1];
  np.seo={slug:np.slug};
  STATE.current=STATE.pages.length-1;
  SEL=null;
  closeModal();
  MODE='edit';
  setMode();
  renderAll();
  tab('build');
  save();
  syncCmsUrl(false);
}

/* ============ MENU TAB ============ */
function renderMenu(){const el=document.getElementById('panel-menu');let h='<div class="ph">'+SPARK+'Mega menu editor</div><div class="hint">Edit the top-level items and their columns. This drives the site nav &amp; mega panel.</div>'+megaPreview();
 STATE.site.menu.forEach((m,mi)=>{h+='<div class="sub"><div class="sh"><b>Top item '+(mi+1)+'</b><button class="rm" onclick="menuRm('+mi+')">remove</button></div><div class="fld"><input value="'+esc(m.label)+'" oninput="menuLabel('+mi+',this.value)"></div>';
   m.cols.forEach((c,ci)=>{h+='<div style="border-left:2px solid var(--line);padding-left:8px;margin-bottom:6px"><div class="fld"><label>Column '+(ci+1)+' heading</label><input value="'+esc(c.ey)+'" oninput="menuCol('+mi+','+ci+',this.value)"></div>';
     c.items.forEach((it,ii)=>{h+='<div style="display:flex;gap:5px;margin-bottom:4px"><input value="'+esc(it.label)+'" oninput="menuItem('+mi+','+ci+','+ii+',this.value)"><button class="rm" onclick="menuItemRm('+mi+','+ci+','+ii+')">×</button></div>';});
     h+='<button class="miniadd" onclick="menuItemAdd('+mi+','+ci+')">+ item</button></div>';});
   h+='<button class="miniadd" onclick="menuColAdd('+mi+')">+ column</button></div>';});
 h+='<button class="miniadd" onclick="menuAdd()">+ Top-level item</button>';el.innerHTML=h;}
function menuLabel(i,v){STATE.site.menu[i].label=v;save()}
function menuCol(i,c,v){STATE.site.menu[i].cols[c].ey=v;save()}
function menuItem(i,c,x,v){STATE.site.menu[i].cols[c].items[x].label=v;save()}
function menuItemAdd(i,c){STATE.site.menu[i].cols[c].items.push({icon:'solar',label:'New item'});renderMenu();save()}
function menuItemRm(i,c,x){STATE.site.menu[i].cols[c].items.splice(x,1);renderMenu();save()}
function menuColAdd(i){STATE.site.menu[i].cols.push({ey:'New column',items:[{icon:'solar',label:'Item'}]});renderMenu();save()}
function menuAdd(){STATE.site.menu.push({label:'New item',cols:[{ey:'Column',items:[{icon:'solar',label:'Item'}]}]});renderMenu();save()}
function menuRm(i){STATE.site.menu.splice(i,1);renderMenu();save()}

/* ============ LOGOS TAB ============ */
function renderLogos(){const el=document.getElementById('panel-logos');let h='<div class="ph">'+SPARK+'Brand logos</div><div class="hint">Tick <b>Include in banner</b> to add a logo to the scrolling Manufacturer Banner. Untick to remove it — the banner updates live.</div><div class="logolist">';
 STATE.site.logos.forEach((l,i)=>{h+='<div class="logoitem"><span class="lg">'+(l.img?'<img src="'+l.img+'">':esc(l.name.slice(0,3))) +'</span><span class="nm">'+esc(l.name)+'</span><label class="bnr"><input type="checkbox" '+(l.bnr?'checked':'')+' onchange="logoBnr('+i+',this.checked)"> In banner</label><button class="rm" onclick="logoRm('+i+')">×</button></div>';});
 h+='</div><div class="fld"><label>Add a logo — name</label><input id="newlogo" placeholder="e.g. Growatt"></div><div class="fld"><label>Logo image (optional)</label><input type="file" accept="image/*" id="logofile"></div><button class="miniadd" onclick="logoAdd()">+ Add logo</button>';
 el.innerHTML=h;}
function logoBnr(i,v){STATE.site.logos[i].bnr=v;renderPreview();save()}
function logoRm(i){STATE.site.logos.splice(i,1);renderLogos();renderPreview();save()}
function logoAdd(){const name=document.getElementById('newlogo').value.trim();if(!name)return;const f=document.getElementById('logofile').files[0];const push=(img)=>{STATE.site.logos.push({id:uid(),name,img:img||'',bnr:true});renderLogos();renderPreview();save();};
 if(f){const r=new FileReader();r.onload=()=>push(r.result);r.readAsDataURL(f);}else push('');}

/* ============ IMAGES TAB ============ */
function getAtPath(path){const parts=path.split('.');const bl=findBlock(parts[0]);if(!bl)return undefined;let o=bl.p;for(let i=1;i<parts.length;i++){if(o==null)return undefined;o=o[parts[i]];}return o;}
function suggestAltFromName(name){return String(name||'').replace(/\.webp$/i,'').replace(/[-_]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase()).trim();}
function clampFocus(n){n=Number(n);if(!isFinite(n))return 50;return Math.max(0,Math.min(100,n));}
function clampZoom(n){n=Number(n);if(!isFinite(n))return 1;return Math.max(1,Math.min(3,Math.round(n*100)/100));}
function imgMetaEmpty(){return {src:'',alt:'',title:'',desc:'',caption:'',keywords:'',loading:'lazy',decorative:false,focusX:50,focusY:50,zoom:1};}
function imgResolve(val){
 if(!val)return imgMetaEmpty();
 if(typeof val==='string')return {src:val,alt:'',title:'',desc:'',caption:'',keywords:'',loading:'lazy',decorative:false,focusX:50,focusY:50,zoom:1};
 return {src:val.src||'',alt:val.alt||'',title:val.title||'',desc:val.desc||'',caption:val.caption||'',keywords:val.keywords||'',loading:val.loading||'lazy',decorative:!!val.decorative,focusX:clampFocus(val.focusX),focusY:clampFocus(val.focusY),zoom:clampZoom(val.zoom)};
}
function imgSrc(val){return imgResolve(val).src;}
function pvImgClick(ev,path){ev.stopPropagation();const blockId=path.split('.')[0];if(blockId)selectBlock(blockId);editPlacementImgMeta(path);}
function mediaImgCss(fx,fy,zoom){
 fx=clampFocus(fx);fy=clampFocus(fy);
 // Always apply a small bleed scale so there is room to pan even at 100%
 var z=clampZoom(zoom)*1.2;
 var maxShift=((1-1/z)/2)*100;
 var tx=((50-fx)/50)*maxShift;
 var ty=((50-fy)/50)*maxShift;
 return 'object-fit:cover;object-position:50% 50%;transform:translate('+tx+'%,'+ty+'%) scale('+z+');transform-origin:center center';
}
function applyMediaImgStyle(img,fx,fy,zoom){
 if(!img)return;
 fx=clampFocus(fx);fy=clampFocus(fy);
 var z=clampZoom(zoom)*1.2;
 var maxShift=((1-1/z)/2)*100;
 var tx=((50-fx)/50)*maxShift;
 var ty=((50-fy)/50)*maxShift;
 img.style.objectFit='cover';
 img.style.objectPosition='50% 50%';
 img.style.transformOrigin='center center';
 img.style.transform='translate('+tx+'%,'+ty+'%) scale('+z+')';
}
function writeMediaImgMeta(path, partial, opts){
 opts=opts||{};
 var cur=imgResolve(getAtPath(path));
 var next={src:cur.src,alt:cur.alt,title:cur.title,desc:cur.desc,caption:cur.caption,keywords:cur.keywords,loading:cur.loading,decorative:cur.decorative,focusX:cur.focusX,focusY:cur.focusY,zoom:cur.zoom};
 if(partial){if(partial.focusX!=null)next.focusX=clampFocus(partial.focusX);if(partial.focusY!=null)next.focusY=clampFocus(partial.focusY);if(partial.zoom!=null)next.zoom=clampZoom(partial.zoom);}
 var parts=path.split('.');var bl=findBlock(parts[0]);
 if(!bl)return next;
 var o=bl.p;for(var i=1;i<parts.length-1;i++)o=o[parts[i]];
 o[parts[parts.length-1]]=next;
 debSave();
 if(!opts.silent)renderBuild();
 return next;
}
function imgTag(val,style,edit,path){
 const m=imgResolve(val);if(!m.src)return '';
 const alt=m.decorative?'':m.alt;
 const attrs='src="'+m.src+'" alt="'+esc(alt)+'"'+(m.decorative?' aria-hidden="true"':'')+(m.title?' title="'+esc(m.title)+'"':'')+' loading="'+esc(m.loading||'lazy')+'" decoding="async"'+(style?' style="'+style+'"':'');
 const img='<img '+attrs+'>';
 let out;
 if(m.caption)out='<figure style="margin:0">'+img+'<figcaption style="font-size:.82rem;color:var(--muted);margin-top:8px;text-align:center">'+esc(m.caption)+'</figcaption></figure>';
 else out=img;
 if(edit&&path)return '<div class="pv-img-hit" onclick="pvImgClick(event,\''+path+'\')" title="Click to edit image SEO">'+out+'</div>';
 return out;
}
/** Fixed 4:3 crop frame for Image + text — cover-fit with drag + zoom in edit mode. */
function mediaFrameHtml(val,edit,path){
 const m=imgResolve(val);
 if(!m.src)return '<div class="pv-media-frame is-empty" aria-hidden="true">IMAGE</div>';
 const fx=clampFocus(m.focusX);const fy=clampFocus(m.focusY);const zoom=clampZoom(m.zoom);
 const alt=m.decorative?'':m.alt;
 const img='<img class="pv-media-frame-img" src="'+m.src+'" alt="'+esc(alt)+'"'+(m.decorative?' aria-hidden="true"':'')+(m.title?' title="'+esc(m.title)+'"':'')+' loading="'+esc(m.loading||'lazy')+'" decoding="async" style="'+mediaImgCss(fx,fy,zoom)+'">';
 const cap=m.caption?'<figcaption class="pv-media-frame-cap">'+esc(m.caption)+'</figcaption>':'';
 if(edit&&path){
  const zoomPct=Math.round(zoom*100);
  return '<div class="pv-media-frame is-edit" data-img-path="'+esc(path)+'" onpointerdown="mediaFocusStart(event,\''+path+'\')" onwheel="mediaFocusWheel(event,\''+path+'\')" title="Drag to pan · scroll or +/- to zoom · click for SEO">'+
   '<span class="pv-media-frame-hint">Drag · scroll to zoom</span>'+
   '<div class="pv-media-zoom" onclick="event.stopPropagation()" onpointerdown="event.stopPropagation()">'+
    '<button type="button" class="pv-media-zoom-btn" title="Zoom out" aria-label="Zoom out" onclick="mediaZoomStep(\''+path+'\',-0.1)">−</button>'+
    '<span class="pv-media-zoom-val" data-zoom-label>'+zoomPct+'%</span>'+
    '<button type="button" class="pv-media-zoom-btn" title="Zoom in" aria-label="Zoom in" onclick="mediaZoomStep(\''+path+'\',0.1)">+</button>'+
   '</div>'+img+cap+'</div>';
 }
 return '<div class="pv-media-frame">'+img+cap+'</div>';
}
var _mediaFocus=null;
function mediaFocusStart(ev,path){
 if(ev.button!=null&&ev.button!==0)return;
 if(ev.target&&ev.target.closest&&ev.target.closest('.pv-media-zoom'))return;
 ev.preventDefault();ev.stopPropagation();
 var frame=ev.currentTarget;
 var img=frame.querySelector('.pv-media-frame-img');
 if(!img)return;
 var m=imgResolve(getAtPath(path));
 _mediaFocus={path:path,frame:frame,img:img,pointerId:ev.pointerId,startX:ev.clientX,startY:ev.clientY,focusX:clampFocus(m.focusX),focusY:clampFocus(m.focusY),zoom:clampZoom(m.zoom),moved:false,w:Math.max(1,frame.clientWidth),h:Math.max(1,frame.clientHeight),curX:null,curY:null};
 try{frame.setPointerCapture(ev.pointerId);}catch(e){}
 frame.classList.add('is-dragging');
 document.addEventListener('pointermove',mediaFocusMove,true);
 document.addEventListener('pointerup',mediaFocusEnd,true);
 document.addEventListener('pointercancel',mediaFocusEnd,true);
}
function mediaFocusMove(ev){
 if(!_mediaFocus)return;
 if(_mediaFocus.pointerId!=null&&ev.pointerId!=null&&ev.pointerId!==_mediaFocus.pointerId)return;
 ev.preventDefault();
 var d=_mediaFocus;
 var dx=ev.clientX-d.startX;var dy=ev.clientY-d.startY;
 if(Math.abs(dx)+Math.abs(dy)>3)d.moved=true;
 // Drag right → show more of the left side (lower focusX)
 var sens=160/Math.max(1,d.zoom);
 var fx=clampFocus(d.focusX-(dx/d.w)*sens);
 var fy=clampFocus(d.focusY-(dy/d.h)*sens);
 d.curX=fx;d.curY=fy;
 applyMediaImgStyle(d.img,fx,fy,d.zoom);
}
function mediaFocusEnd(ev){
 if(!_mediaFocus)return;
 if(ev&&_mediaFocus.pointerId!=null&&ev.pointerId!=null&&ev.pointerId!==_mediaFocus.pointerId)return;
 var d=_mediaFocus;
 document.removeEventListener('pointermove',mediaFocusMove,true);
 document.removeEventListener('pointerup',mediaFocusEnd,true);
 document.removeEventListener('pointercancel',mediaFocusEnd,true);
 try{if(d.pointerId!=null)d.frame.releasePointerCapture(d.pointerId);}catch(e){}
 d.frame.classList.remove('is-dragging');
 _mediaFocus=null;
 var blockId=d.path.split('.')[0];
 if(d.moved){
  writeMediaImgMeta(d.path,{focusX:d.curX!=null?d.curX:d.focusX,focusY:d.curY!=null?d.curY:d.focusY,zoom:d.zoom},{silent:true});
  if(blockId&&SEL!==blockId)selectBlock(blockId);
  else renderBuild();
 }else{
  if(blockId)selectBlock(blockId);
  editPlacementImgMeta(d.path);
 }
}
function mediaZoomStep(path,delta){
 var m=imgResolve(getAtPath(path));
 var next=clampZoom(m.zoom+delta);
 if(next===m.zoom)return;
 writeMediaImgMeta(path,{zoom:next},{silent:true});
 var frame=document.querySelector('.pv-media-frame[data-img-path="'+path.replace(/"/g,'')+'"]');
 if(frame){
  applyMediaImgStyle(frame.querySelector('.pv-media-frame-img'),m.focusX,m.focusY,next);
  var label=frame.querySelector('[data-zoom-label]');
  if(label)label.textContent=Math.round(next*100)+'%';
 }
}
function mediaFocusWheel(ev,path){
 ev.preventDefault();ev.stopPropagation();
 var delta=ev.deltaY>0?-0.1:0.1;
 mediaZoomStep(path,delta);
}
function imgMetaPreviewCode(m){
 const alt=m.decorative?'(decorative — empty alt)':(m.alt||'…');
 let h='<span class="k">&lt;img</span> <span class="a">src</span>=<span class="v">"…"</span>\n  <span class="a">alt</span>=<span class="v">"'+esc(alt)+'"</span>';
 if(m.title)h+='\n  <span class="a">title</span>=<span class="v">"'+esc(m.title)+'"</span>';
 h+='\n  <span class="a">loading</span>=<span class="v">"'+(m.loading||'lazy')+'"</span> <span class="k">/&gt;</span>';
 if(m.caption)h+='\n\n<span class="k">&lt;figcaption&gt;</span>'+esc(m.caption)+'<span class="k">&lt;/figcaption&gt;</span>';
 if(m.desc||m.keywords)h+='\n\n<span class="k">&lt;meta</span> <span class="a">name</span>=<span class="v">"description"</span> <span class="a">content</span>=<span class="v">"'+esc(m.desc||m.alt)+'"</span> <span class="k">/&gt;</span>';
 if(m.keywords)h+='\n<span class="k">&lt;meta</span> <span class="a">name</span>=<span class="v">"keywords"</span> <span class="a">content</span>=<span class="v">"'+esc(m.keywords)+'"</span> <span class="k">/&gt;</span>';
 if(!m.decorative&&m.alt)h+='\n<span class="k">&lt;meta</span> <span class="a">property</span>=<span class="v">"og:image:alt"</span> <span class="a">content</span>=<span class="v">"'+esc(m.alt)+'"</span> <span class="k">/&gt;</span>';
 return h;
}
function imgMetaReadForm(){
 const decorative=!!document.getElementById('imgmeta-decor')?.checked;
 return {
  data:window._imgMetaDraft?.data||'',
  name:window._imgMetaDraft?.name||'',
  alt:(document.getElementById('imgmeta-alt')?.value||'').trim(),
  title:(document.getElementById('imgmeta-title')?.value||'').trim(),
  desc:(document.getElementById('imgmeta-desc')?.value||'').trim(),
  caption:(document.getElementById('imgmeta-caption')?.value||'').trim(),
  keywords:(document.getElementById('imgmeta-keywords')?.value||'').trim(),
  loading:document.getElementById('imgmeta-loading')?.value||'lazy',
  decorative
 };
}
function imgMetaLivePreview(){
 const m=imgMetaReadForm();
 const prev=document.getElementById('imgmeta-preview');if(prev)prev.innerHTML=imgMetaPreviewCode(m);
 const altCt=document.getElementById('imgmeta-alt-count');
 const descCt=document.getElementById('imgmeta-desc-count');
 if(altCt){const n=m.alt.length;altCt.textContent=n+' / 125';altCt.classList.toggle('warn',n>125);}
 if(descCt){const n=m.desc.length;descCt.textContent=n+' / 160';descCt.classList.toggle('warn',n>160);}
 const altInp=document.getElementById('imgmeta-alt');if(altInp)altInp.disabled=m.decorative;
}
function imgMetaSetLoading(v){const el=document.getElementById('imgmeta-loading');if(el)el.value=v;document.querySelectorAll('[data-imgload]').forEach(b=>b.classList.toggle('on',b.dataset.imgload===v));imgMetaLivePreview();}
function sectionImgMeta(cur,path){
 const m=imgResolve(cur);
 if(!m.src)return '<div class="hint" style="margin-top:8px">Pick an image above — you\'ll add SEO &amp; meta details for <b>this section</b> when you use it.</div>';
 const tags=[];if(m.alt)tags.push('Alt');if(m.title)tags.push('Title');if(m.caption)tags.push('Caption');if(m.desc)tags.push('Meta desc');if(m.keywords)tags.push('Keywords');
 return '<div class="imgseo-card" onclick="editPlacementImgMeta(\''+path+'\')" title="Edit SEO for this section"><img src="'+m.src+'"><div class="imgseo-card-body"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span class="imgseo-pill">'+SPARK+' Section SEO</span>'+(tags.length?'<span style="font-family:var(--mono);font-size:.54rem;color:var(--muted)">'+tags.join(' · ')+'</span>':'')+'</div><div class="imgseo-card-row"><b>Alt</b> '+(m.alt?esc(m.alt):'<span style="opacity:.55">Not set</span>')+'</div>'+(m.title?'<div class="imgseo-card-row"><b>Title</b> '+esc(m.title)+'</div>':'')+(m.caption?'<div class="imgseo-card-row"><b>Caption</b> '+esc(m.caption)+'</div>':'')+'<div class="imgseo-card-hint">Drag image in preview to reposition · click here for SEO</div></div></div>';
}
function imagePicker(cur,path){const imgs=STATE.site.images||[];const src=imgSrc(cur);
 let h='<div class="fld"><label>Image</label><label class="miniadd" style="display:inline-block;cursor:pointer;margin-bottom:6px">+ Upload<input type="file" accept="image/*" multiple style="display:none" onchange="imgUpload(this,\''+path+'\')"></label>';
 if(imgs.length){
  h+='<div class="img-lib-pick">'+imgs.map(function(im,i){
   return '<div class="img-lib-thumb'+(src===im.data?' is-on':'')+'">'+
    '<button type="button" class="img-lib-pick-btn" onclick="pickImg(\''+path+'\',\''+im.id+'\')" title="'+esc(im.name||im.cat||'Image')+'">'+
     '<img src="'+im.data+'" alt="">'+
    '</button>'+
    '<button type="button" class="img-lib-rm" title="Remove from library" aria-label="Remove from library" onclick="event.stopPropagation();imgRmAsk('+i+')">×</button>'+
   '</div>';
  }).join('')+'</div>';
 }else{h+='<div class="hint">No images yet — upload one above.</div>';}
 h+=sectionImgMeta(cur,path)+'</div>';return h;}
function pickImg(path,imgId){const im=(STATE.site.images||[]).find(x=>x.id===imgId);if(!im)return;const cur=getAtPath(path);const existing=imgSrc(cur)===im.data?imgResolve(cur):{...imgMetaEmpty(),src:im.data};openPlacementImgMeta(path,im.data,im.name,existing);}
function editPlacementImgMeta(path){const cur=getAtPath(path);const m=imgResolve(cur);if(!m.src){openNoticeModal({title:'Pick an image first',message:'Choose an image for this section before editing SEO metadata.'});return;}openPlacementImgMeta(path,m.src,'',m);}
function openPlacementImgMeta(path,src,name,existing){const ex=imgResolve(existing);ex.src=src;window._imgMetaPlacementPath=path;showImgMetaModal({data:src,name:name||'',alt:ex.alt,title:ex.title,desc:ex.desc,caption:ex.caption,keywords:ex.keywords,loading:ex.loading,decorative:ex.decorative,focusX:ex.focusX,focusY:ex.focusY},{placement:true,suggestedAlt:ex.alt||suggestAltFromName(name)});}
function renderImages(){const el=document.getElementById('panel-images');const imgs=STATE.site.images||[];const cats=[...new Set(imgs.map(im=>im.cat).filter(Boolean))];
 let h='<div class="ph">'+SPARK+'Image library</div><div class="hint">Upload images here once, then reuse them in any section. <b>SEO metadata</b> (alt text, title) is added when you pick an image in the <b>Sections</b> tab — each section can have its own SEO for the same file.</div>';
 h+='<div class="fld"><label>Upload image(s)</label><input type="file" accept="image/*" multiple id="imgup" onchange="imgUpload(this)"></div>';
 h+='<div class="fld"><label>Filter by category</label><select onchange="IMGFILTER=this.value;renderImages()"><option value="">All ('+imgs.length+')</option>'+cats.map(c=>'<option value="'+esc(c)+'"'+(IMGFILTER===c?' selected':'')+'>'+esc(c)+'</option>').join('')+'</select></div>';
 const shown=imgs.map((im,i)=>({im,i})).filter(x=>!IMGFILTER||x.im.cat===IMGFILTER);
 h+=shown.length?'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'+shown.map(({im,i})=>'<div style="border:1px solid var(--line);border-radius:3px;overflow:hidden;position:relative"><img src="'+im.data+'" style="width:100%;height:68px;object-fit:cover;display:block"><button class="rm" style="position:absolute;top:2px;right:4px;background:rgba(0,0,0,.55);color:#fff;border-radius:2px;padding:1px 5px" onclick="imgRmAsk('+i+')" title="Remove from library">×</button><div style="font-size:.68rem;padding:5px 7px;color:var(--muted);border-top:1px solid var(--line);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+(im.name?esc(im.name):'Image')+(im.cat?' · '+esc(im.cat):'')+'</div></div>').join('')+'</div>':'<div class="hint">No images yet — upload one above.</div>';
 el.innerHTML=h;}
function toWebp(dataURL,cb){try{const img=new Image();img.onload=()=>{try{const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;c.getContext('2d').drawImage(img,0,0);cb(c.toDataURL('image/webp',0.82));}catch(e){cb(dataURL)}};img.onerror=()=>cb(dataURL);img.src=dataURL;}catch(e){cb(dataURL)}}
function imgUpload(inp,pickPath){const files=[...inp.files];if(!files.length)return;inp.value='';let pending=files.length;const uploaded=[];files.forEach(f=>{const r=new FileReader();r.onload=()=>{toWebp(r.result,webp=>{const name=f.name.replace(/\.[^.]+$/,'.webp');const baseName=f.name.replace(/\.[^.]+$/,'');const id=uid();(STATE.site.images=STATE.site.images||[]).push({id,name,data:webp,cat:''});uploaded.push({id,name,baseName,data:webp});pending--;if(pending===0)finishImgUpload(uploaded,pickPath);});};r.readAsDataURL(f);});}
function finishImgUpload(uploaded,pickPath){renderImages();if(MODE==='library')renderLibrary();save();
 if(pickPath&&uploaded.length===1){const u=uploaded[0];openPlacementImgMeta(pickPath,u.data,u.baseName,{...imgMetaEmpty(),src:u.data});}
 if(MODE==='edit'){renderBuild();renderPreview();}}
function showImgMetaModal(im,opts){opts=opts||{};const suggestedAlt=opts.suggestedAlt||suggestAltFromName(im.name);
 const isPlacement=!!opts.placement;const m=imgResolve(im);m.data=im.data||m.src;m.name=im.name||'';
 const load=m.loading||'lazy';
 const box=document.getElementById('modalbox');box.className='modalbox imgseo-box';
 box.innerHTML=
  '<div class="imgseo-head"><div><h2>Image SEO &amp; metadata</h2><p>'+(isPlacement?'Metadata for <b>this section only</b> — reuse the same image elsewhere with different alt text, captions and meta tags.':'Library image details.')+'</p><span class="imgseo-pill" style="margin-top:10px;display:inline-flex">'+SPARK+' Per-section placement</span></div><button class="close" onclick="closeImgMetaModal()">×</button></div>'+
  '<div class="imgseo-body">'+
   '<div class="imgseo-hero"><div class="imgseo-thumb"><img src="'+m.data+'" alt=""><div class="fn">'+esc(m.name||'Image')+'</div></div><div class="imgseo-grid">'+
    '<div class="imgseo-field full"><label>Alt text <span>Required for SEO</span></label><input id="imgmeta-alt" value="'+esc(m.alt||suggestedAlt)+'" placeholder="Describe what is in the image…" oninput="imgMetaLivePreview()"><div class="imgseo-count" id="imgmeta-alt-count">0 / 125</div></div>'+
    '<div class="imgseo-field"><label>Title attribute</label><input id="imgmeta-title" value="'+esc(m.title)+'" placeholder="Shown on hover" oninput="imgMetaLivePreview()"></div>'+
    '<div class="imgseo-field"><label>Caption</label><input id="imgmeta-caption" value="'+esc(m.caption)+'" placeholder="Visible text under image" oninput="imgMetaLivePreview()"></div>'+
   '</div></div>'+
   '<div class="imgseo-section"><h3><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M4 12h10M4 17h14"/></svg> Meta tags &amp; description</h3><div class="imgseo-grid">'+
    '<div class="imgseo-field full"><label>Meta description <span>For search &amp; social previews</span></label><textarea id="imgmeta-desc" rows="2" placeholder="Short description — used in meta description and schema markup" oninput="imgMetaLivePreview()">'+esc(m.desc)+'</textarea><div class="imgseo-count" id="imgmeta-desc-count">0 / 160</div></div>'+
    '<div class="imgseo-field full"><label>Keywords</label><input id="imgmeta-keywords" value="'+esc(m.keywords)+'" placeholder="solar panels, cardiff, commercial (comma-separated)" oninput="imgMetaLivePreview()"><div class="imgseo-tags"><span class="imgseo-tag">meta name="keywords"</span><span class="imgseo-tag">og:image:alt</span><span class="imgseo-tag">schema ImageObject</span></div></div>'+
   '</div></div>'+
   '<div class="imgseo-section"><h3><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg> Performance &amp; accessibility</h3>'+
    '<div class="imgseo-grid"><div class="imgseo-field"><label>Loading</label><input type="hidden" id="imgmeta-loading" value="'+load+'"><div class="seg"><button type="button" class="'+(load==='lazy'?'on':'')+'" data-imgload="lazy" onclick="imgMetaSetLoading(\'lazy\')">Lazy</button><button type="button" class="'+(load==='eager'?'on':'')+'" data-imgload="eager" onclick="imgMetaSetLoading(\'eager\')">Eager</button></div></div>'+
    '<div class="imgseo-field" style="display:flex;align-items:flex-end"><label class="chk" style="padding:10px 0;width:100%"><input type="checkbox" id="imgmeta-decor" '+(m.decorative?'checked':'')+' onchange="imgMetaLivePreview()"> Decorative image <span style="font-family:var(--body);font-size:.78rem;color:var(--muted);text-transform:none;letter-spacing:0"> (no alt needed)</span></label></div></div></div>'+
   '<div class="imgseo-section"><h3><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg> Generated markup preview</h3><div class="imgseo-preview" id="imgmeta-preview"></div></div>'+
  '</div>'+
  '<div class="imgseo-foot"><button class="tbtn solar" style="color:var(--ink)" onclick="confirmImgMeta()">'+(isPlacement?'Save &amp; use in section':'Save')+'</button><button class="tbtn" style="color:var(--ink);border-color:var(--line)" onclick="closeImgMetaModal()">Cancel</button></div>';
 window._imgMetaDraft=im;window._imgMetaPlacement=!!isPlacement;document.getElementById('modal').classList.add('show');imgMetaLivePreview();}
function closeImgMetaModal(){closeModal();document.getElementById('modalbox').className='modalbox';window._imgMetaDraft=null;window._imgMetaPlacement=false;window._imgMetaPlacementPath=null;}
function confirmImgMeta(){const d=window._imgMetaDraft;if(!d)return;const f=imgMetaReadForm();
 if(!f.decorative&&!f.alt){openNoticeModal({title:'Alt text required',message:'Please add alt text — it helps SEO and accessibility. Or mark the image as decorative.'});return;}
 const placementPath=window._imgMetaPlacementPath;
 const prev=placementPath?imgResolve(getAtPath(placementPath)):imgMetaEmpty();
 const sameSrc=prev.src&&prev.src===d.data;
 const placement={src:d.data,alt:f.decorative?'':f.alt,title:f.title,desc:f.desc,caption:f.caption,keywords:f.keywords,loading:f.loading||'lazy',decorative:f.decorative,focusX:sameSrc?clampFocus(prev.focusX):50,focusY:sameSrc?clampFocus(prev.focusY):50,zoom:sameSrc?clampZoom(prev.zoom):1};
 closeImgMetaModal();
 if(placementPath){upd(placementPath,placement);return;}
 save();renderImages();if(MODE==='library')renderLibrary();}
function imgMetaUpd(i,k,v){STATE.site.images[i][k]=v;save();if(k==='cat'){renderImages();if(MODE==='library')renderLibrary();}}
function scrubImgData(obj,data){
 if(!obj||typeof obj!=='object')return;
 Object.keys(obj).forEach(function(k){
  var v=obj[k];
  if(v===data){obj[k]='';return;}
  if(v&&typeof v==='object'&&!Array.isArray(v)){
   if(v.src===data){obj[k]=imgMetaEmpty();return;}
   scrubImgData(v,data);
  }else if(Array.isArray(v)){
   v.forEach(function(it){if(it&&typeof it==='object')scrubImgData(it,data);});
  }
 });
}
function imgRmAsk(i){
  var imgs=STATE.site.images||[];
  var im=imgs[i];
  if(!im)return;
  openConfirmModal({
    title:'Remove image?',
    message:'Sections using this image will clear that image. This cannot be undone.',
    label:'Image to remove',
    targetHtml:'<div class="modal-confirm-target"><span class="nm">'+esc(im.name||'Untitled image')+'</span><span class="ty">library</span></div>',
    confirmLabel:'Remove image',
    action:function(){imgRm(i);}
  });
}
function imgRm(i){
 var imgs=STATE.site.images||[];
 var im=imgs[i];
 if(!im)return;
 var data=im.data;
 imgs.splice(i,1);
 if(data){
  (STATE.pages||[]).forEach(function(pg){
   (pg.blocks||[]).forEach(function(bl){scrubImgData(bl.p,data);});
  });
 }
 renderImages();
 if(MODE==='library')renderLibrary();
 if(MODE==='edit'){renderBuild();renderPreview();}
 save();
}

/* ============ SEO TAB ============ */
function setPageTheme(t){const pg=page();pg.theme=t;renderPreview();renderSEO();save();}
function setPageType(kind){var pg=page();var slug=(pg.slug||'').replace(/\/$/,'')||'/';if(slug==='/'||slug==='')return;if(kind==='page')pg.type='page';else if(kind==='landing')pg.type='landing';else if(kind==='case')pg.type='casestudy';renderSEO();renderToolbarPageType();save();}
function pageTypePickerHtml(pg){var slug=(pg.slug||'').replace(/\/$/,'')||'/';if(slug==='/'||slug==='')return '<div class="fld"><label>Page type</label><div class="hint" style="margin:0">Homepage — set automatically because the URL slug is <code>/</code>.</div></div>';if(isCmsBlogPage(pg))return '<div class="fld"><label>Page type</label><div class="hint" style="margin:0">AI blog article — managed from <a href="/admin/blog">/admin/blog</a>, not mixed with website pages.</div></div>';var kind=dashPageBadge(pg);return '<div class="fld"><label>Page type</label><div class="seg"><button type="button" class="'+(kind==='page'?'on':'')+'" onclick="setPageType(\'page\')">Page</button><button type="button" class="'+(kind==='landing'?'on':'')+'" onclick="setPageType(\'landing\')">Landing</button><button type="button" class="'+(kind==='case'?'on':'')+'" onclick="setPageType(\'case\')">Case study</button></div><div class="hint" style="margin-top:6px;margin-bottom:0">Used for dashboard badges and filters. Create shortcuts: <b>+ Landing page</b> or <b>+ Case study</b> on the dashboard.</div></div>';}
function renderSEO(){const el=document.getElementById('panel-seo');const pg=page();pg.seo=pg.seo||{};const s=pg.seo;
 function f(l,k,ph){var val=s[k]||'';if(k==='slug'&&!val&&pg.slug)val=pg.slug;return '<div class="fld"><label>'+l+'</label><input value="'+esc(val)+'" placeholder="'+ph+'" oninput="seoUpd(\''+k+'\',this.value)"></div>'}
 var slugVal=s.slug||pg.slug||'';
 let h='<div class="ph">'+SPARK+'Page settings — '+esc(pg.name)+'</div><div class="fld"><label>Page title</label><input id="seo-page-name" value="'+esc(pg.name)+'" placeholder="Home" oninput="pageNameInput(this.value)" onchange="pageNameUpd(this.value)"><div class="hint" style="margin-top:4px">Must be unique — used in the admin URL and page list. URL slug updates to match.</div></div>'+pageTypePickerHtml(pg)+'<div class="fld"><label>Theme</label><div class="seg"><button class="'+(pg.theme!=='dark'?'on':'')+'" onclick="setPageTheme(\'light\')">Light</button><button class="'+(pg.theme==='dark'?'on':'')+'" onclick="setPageTheme(\'dark\')">Dark</button></div></div><div class="hint">Everything an agency needs to rank the page. These write into the exported page\'s &lt;head&gt;.</div>';
 h+=f('Page title (SEO)','title','Solar Panels Cardiff | Heliaxis')+'<div class="fld"><label>Meta description</label><textarea rows="3" oninput="seoUpd(\'desc\',this.value)" placeholder="150–160 characters…">'+esc(s.desc||'')+'</textarea></div><div class="fld"><label>URL slug</label><input id="seo-slug-input" value="'+esc(slugVal)+'" placeholder="/solar-panels-cardiff" onchange="seoSlugCommit(this.value)"><div id="seo-slug-err" class="seo-slug-err" role="alert" hidden></div><div class="hint" style="margin-top:4px">Must be unique — no two pages can share the same URL.</div></div>'+f('Social share image URL','ogImage','https://…')+f('Canonical URL','canonical','https://heliaxis.co.uk/…')+'<label class="chk"><input type="checkbox" '+(s.noindex?'checked':'')+' onchange="seoUpd(\'noindex\',this.checked)"> Hide from search engines (noindex)</label>';
 el.innerHTML=h;}
function seoUpd(k,v){const pg=page();pg.seo=pg.seo||{};pg.seo[k]=v;if(k==='slug')return;save();}
function showSeoSlugHomeOnlyErr(msg){
  var inp=document.getElementById('seo-slug-input');
  var err=document.getElementById('seo-slug-err');
  var pg=page();
  if(inp){inp.value=pg.slug||'/';inp.classList.add('is-invalid');inp.focus();inp.select();}
  if(err){err.hidden=false;err.textContent=msg||'The URL slug / is already used by another page. Only one page can be the homepage.';}
}
function clearSeoSlugErr(){
  var inp=document.getElementById('seo-slug-input');
  var err=document.getElementById('seo-slug-err');
  if(inp)inp.classList.remove('is-invalid');
  if(err){err.hidden=true;err.textContent='';}
}
function seoSlugCommit(v){
  var pg=page();
  var next=normSlug(v);
  clearSeoSlugErr();
  if(!next){openNoticeModal({title:'Slug required',message:'URL slug cannot be empty.'});renderSEO();return;}
  // `/` is allowed when free — that page becomes the homepage. Block only if another page already owns it.
  if(next==='/'&&pageSlugTaken('/',STATE.current)){showSeoSlugHomeOnlyErr('The URL slug / is already used by the homepage. Only one page can use /.');return;}
  if(next==='/blog'){openNoticeModal({title:'Reserved URL',message:'/blog is the journal index. Use /blog/your-article for AI articles.'});renderSEO();return;}
  if((next==='/blog'||next.indexOf('/blog/')===0)&&!isCmsBlogPage(pg)){
    openNoticeModal({title:'Reserved for blog',message:'Paths under /blog/ are for AI journal articles. Create those from /admin/blog.'});
    renderSEO();return;
  }
  if(isCmsBlogPage(pg))next=toPublicBlogSlug(next);
  if(pageSlugTaken(next,STATE.current)){openNoticeModal({title:'Slug already in use',message:'URL slug “'+next+'” is already used by another page. Choose a different slug.'});renderSEO();return;}
  pg.seo=pg.seo||{};
  pg.slug=next;
  pg.seo.slug=next;
  save();
  renderPreview();
  renderSEO();
  renderToolbarPageType();
}

/* ============ DASHBOARD TAB ============ */
const SAMPLE_SUBS=[{n:'Emily Watkins',e:'emily@…',p:'CF24',src:'Home hero',t:'2h ago'},{n:'Rhys Davies',e:'rhys@…',p:'SA1',src:'PPA landing',t:'5h ago'},{n:'Morgan Ltd',e:'ops@morgan…',p:'NP19',src:'Commercial',t:'Yesterday'},{n:'Sian Hughes',e:'sian@…',p:'CF31',src:'Estimator',t:'Yesterday'}];
function renderDash(){const el=document.getElementById('panel-dash');
 let h='<div class="ph">'+SPARK+'Dashboard</div><div class="hint">Live once connected to your backend (see <b>Publish → architecture</b>). Showing sample data.</div>';
 h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">'+
   [['Visitors (7d)','2,418'],['Leads (7d)','37'],['Conv. rate','1.5%'],['Top page','PPA LP']].map(x=>'<div style="border:1px solid var(--line);border-radius:3px;padding:12px;background:var(--paper)"><div style="font-family:var(--display);font-weight:900;font-size:1.4rem;color:var(--amber-2)">'+x[1]+'</div><div style="font-family:var(--mono);font-size:.58rem;text-transform:uppercase;color:var(--muted);margin-top:2px">'+x[0]+'</div></div>').join('')+'</div>';
 h+='<div class="ph">'+SPARK+'Recent form submissions</div>';
 h+=SAMPLE_SUBS.map(s=>'<div style="border:1px solid var(--line);border-radius:3px;padding:10px;background:var(--paper);margin-bottom:6px"><div style="display:flex;justify-content:space-between"><b style="font-family:var(--display);font-size:.9rem">'+s.n+'</b><span style="font-family:var(--mono);font-size:.62rem;color:var(--muted)">'+s.t+'</span></div><div style="font-size:.78rem;color:var(--muted);margin-top:3px">'+s.e+' · '+s.p+' · via '+s.src+'</div></div>').join('');
 h+='<div class="hint" style="margin-top:12px"><b>Users &amp; access:</b> multi-user admin, roles and 2FA login are provided by the auth layer in the architecture — I can enable an owner + team seats there.</div>';
 el.innerHTML=h;}

/* ============ LANDING TAB ============ */
const CAMPAIGNS=[
 ['Residential solar','Cut your home energy bills for good','Solar, battery & smart tech — designed around your household, installed by one local MCS team.',['Free, no-obligation home survey','0% VAT on solar until 2027','Own it or spread the cost','25-year panel warranty'],'Get my free home quote'],
 ['Commercial solar','Turn your roof into lower running costs','Commercial solar with ROI, grants and finance modelled around your site and load profile.',['Free commercial energy assessment','Typical 3–6 year payback','CapEx, finance or PPA','MCS-certified installs'],'Book a commercial assessment'],
 ['Battery storage','Store your solar, use it after dark','Add a battery and use more of your own power — with backup when the grid drops.',['Use up to ~72% of your generation','Backup power in an outage','Works with new or existing solar','Beat rising grid prices'],'Get a battery quote'],
 ['PPA / Power Purchase Agreement','Solar with zero upfront cost','A funder installs and owns the system; you simply buy the power — usually below grid price.',['No capital outlay','Immediate savings from day one','Funder carries maintenance risk','15–25 year price certainty'],'See if a PPA fits'],
 ['Solar-as-a-Service','Clean energy, billed as a service','All the benefits of on-site solar with none of the capex — one simple monthly service.',['£0 to install','Predictable energy costs','Maintenance included','Buy out any time'],'Explore Solar-as-a-Service'],
 ['Grant funding','Find the solar & energy grants you qualify for','We help South Wales homes and businesses find, time and apply for the right funding.',['Newport Net Zero — up to £30k','Welsh Government schemes','0% VAT on home solar','We prepare the technical docs'],'Check my grant options'],
 ['EV charging (home)','Charge your EV from your own solar','Smart home charging that tops up from your panels and off-peak tariffs.',['OZEV-approved installers','Charge from surplus solar','Smart scheduling & app','Tidy, certified installs'],'Get an EV charger quote'],
 ['EV & fleet (commercial)','Electrify your fleet, powered by your roof','Workplace and depot charging, sized to your vehicles and paired with solar.',['Workplace & depot charging','Solar-powered where possible','Load management built in','Grants & finance available'],'Plan my fleet charging'],
 ['Heat pumps / BUS Grant','Low-carbon heating, part-funded','Efficient air-source heat pumps — we\'ll check every grant and scheme you can claim.',['Grant eligibility checked for you','Lower running costs','MCS-certified installation','Works with solar & battery'],'Check heat pump funding'],
 ['Newport Net Zero grant','Up to £30,000 toward commercial solar','Newport SMEs can match-fund decarbonisation. We scope a grant-ready project for you.',['50% match, up to £30k','For Newport-based SMEs','UK Shared Prosperity Fund','We handle the technical detail'],'Scope my grant project'],
 ['Agriculture & farms','Turn barn roofs into cheaper energy','Big roofs and ground mounts, funding tailored to rural and agricultural sites.',['Barn-roof & ground-mount solar','Diesel & grid cost savings','Rural funding routes','Robust, low-maintenance kit'],'Get a farm solar quote'],
 ['Warehousing & industrial','Your cheapest energy is on the roof','Large-roof solar with the fastest payback of any sector — designed around daytime demand.',['3–5 year typical payback','Huge usable roof area','Battery & demand shifting','Minimal disruption to operations'],'Book a roof assessment'],
 ['LED lighting','Slash lighting costs, often in months','Commercial LED upgrades with some of the fastest paybacks in energy efficiency.',['Cut lighting energy up to 80%','Payback often under a year','Better light, less maintenance','Finance available'],'Get an LED survey'],
 ['Care homes','Reliable, lower-cost energy 24/7','Solar plus battery for round-the-clock demand, resilience and lower running costs.',['24-hour demand covered','Backup for critical loads','Lower, predictable bills','Strong sustainability story'],'Book a care-home assessment'],
 ['Hospitality & hotels','Cut energy costs, boost your green story','Steady all-day demand makes hospitality an ideal fit for on-site solar.',['All-day self-consumption','Guest-facing ESG credentials','Finance & grants','EV charging for guests'],'Get a hospitality quote']
];
function landingBlocks(c,tpl){const[name,headline,sub,benefits,cta]=c;tpl=tpl||'product';if(tpl!=='product')return altLanding(c,tpl);
 const grid=benefits.map((b,i)=>({icon:['shield','coin','solar','battery','ev','clock'][i%6],title:b,desc:''}));
 return [
  {id:uid(),t:'hero',p:{eyebrow:'MCS-certified · South Wales',headline,sub,dark:true,ctaLabel:cta,ctaPulse:true,cta2:''}},
  {id:uid(),t:'stats',p:{items:[{n:'1,200+',k:'Installs'},{n:'4.9★',k:'Rated'},{n:'25 yr',k:'Warranty'},{n:'£0',k:'Survey cost'}]}},
  {id:uid(),t:'grid',p:{eyebrow:'Why '+name.toLowerCase(),title:'What you get',cols:benefits.length===4?2:3,items:grid}},
  {id:uid(),t:'banner',p:{heading:'Trusted technology we install'}},
  {id:uid(),t:'testi',p:{eyebrow:'Real customers',title:'Trusted across South Wales',footnote:'Illustrative testimonials — replace with your real Google & Trustpilot reviews.',items:[{stars:5,quote:'Neat, tidy and genuinely no pressure. Our bills have dropped massively and the app makes it easy to see.',name:'Sarah M.',loc:'Cardiff · Solar + battery'},{stars:5,quote:'From survey to switch-on they were spot on. The team clearly knew what they were doing and cleaned up after.',name:'David R.',loc:'Swansea · Solar PV'},{stars:5,quote:'We use them for our commercial units. Straight answers, proper ROI figures, and a payback we\'re already hitting.',name:'Gareth L.',loc:'Newport · Commercial'}]}},
  {id:uid(),t:'faq',p:{items:[{q:'Is the survey really free?',a:'Yes — free, no obligation, and no pushy sales.'},{q:'How fast can you install?',a:'Most projects move within a few weeks of your survey and design sign-off.'}]}},
  {id:uid(),t:'cta',p:{headline:cta+' today',sub:'One quick step — we\'ll do the rest.',btn:cta,pulse:true}}
 ];
}
function renderLand(){const el=document.getElementById('panel-land');let h='<div class="ph">'+SPARK+'Campaign landing pages</div><div class="hint">One click builds a new, conversion-optimised landing page (hero → proof → benefits → social proof → FAQ → CTA — the structure that converts). Then edit it like any page.</div><div class="tplgrid">';
 CAMPAIGNS.forEach((c,i)=>{h+='<button class="tpl" onmouseenter="tplPrev('+i+',this)" onmouseleave="tplHide()" onclick="makeLanding('+i+')"><span><b>'+esc(c[0])+'</b><div class="d">'+esc(c[1])+'</div></span><span class="go">Create →</span></button>';});
 h+='</div>'+caseSection();el.innerHTML=h;}
function tplPrev(i,elm){const blocks=landingBlocks(CAMPAIGNS[i],TEMPLATE_MAP[i]);let pop=document.getElementById('tplpop');if(!pop){pop=document.createElement('div');pop.id='tplpop';document.body.appendChild(pop);}
 pop.style.cssText='position:fixed;z-index:200;width:300px;background:var(--paper);border:1px solid var(--ink);border-radius:4px;box-shadow:0 20px 50px -20px rgba(0,0,0,.5);overflow:hidden;pointer-events:none';
 const r=elm.getBoundingClientRect();pop.style.left=Math.min(r.right+10,window.innerWidth-320)+'px';pop.style.top=Math.max(10,Math.min(r.top-30,window.innerHeight-420))+'px';
 const inner=blocks.map(renderBlock).join('');
 pop.innerHTML='<div style="font-family:var(--mono);font-size:.56rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);padding:7px 10px;border-bottom:1px solid var(--line);background:var(--paper-2)">Preview · '+esc(CAMPAIGNS[i][0])+'</div><div style="height:360px;overflow:hidden"><div style="width:1160px;transform:scale(.259);transform-origin:top left">'+inner+'</div></div>';}
function tplHide(){const p=document.getElementById('tplpop');if(p)p.remove();window._tplHoverEl=null;}
function blockRowLeave(ev){if(ev.relatedTarget&&ev.currentTarget.contains(ev.relatedTarget))return;tplHide();}
function blockRowPrev(id,elm){if(SEL===id){tplHide();return;}window._tplHoverEl=elm;var bl=findBlock(id);if(bl)popAt(elm,'Preview · '+BLOCKNAMES[bl.t],renderBlock(bl));}
function makeLanding(i){tplHide();const c=CAMPAIGNS[i];var name=uniquePageTitle(c[0]);var slug=uniquePageSlug(titleToSlug(name));STATE.pages.push({id:uid(),name:name,slug:slug,type:'landing',seo:{slug:slug},theme:THEME_BY_TPL[TEMPLATE_MAP[i]],blocks:landingBlocks(c,TEMPLATE_MAP[i])});STATE.current=STATE.pages.length-1;SEL=null;MODE='edit';setMode();renderAll();save();syncCmsUrl(false);if(0)console.log('Landing page “'+name+'” created — now showing in the preview. Edit it in the Sections tab.');}

/* ============ TABS / VIEW ============ */
function tab(t){['build','images','seo'].forEach(x=>{document.getElementById('panel-'+x).classList.toggle('hide',x!==t);document.querySelector('.tab[data-tab="'+x+'"]').classList.toggle('on',x===t)});
 if(t==='images')renderImages();if(t==='seo')renderSEO();}
function setView(v){VIEW=v;document.getElementById('vw-desk').classList.toggle('on',v==='desk');document.getElementById('vw-mob').classList.toggle('on',v==='mob');renderPreview();}
function renderAll(){renderPageSel();renderToolbarPageType();if(MODE==='dash'){renderDashboard();}else{renderPreview();renderBuild();}}

/* ============ EXPORT / PUBLISH ============ */
let PUBLISH_STYLES={root:'',preview:''};
async function ensurePublishStyles(){
  // Always refetch so publish CSS stays in sync with cms.css (e.g. scroll fixes).
  var r=await fetch('/api/cms/publish-styles',{credentials:'same-origin',cache:'no-store'});
  if(!r.ok){var em='Could not load publish styles';try{em=(await r.json()).error||em;}catch(e){}throw new Error(em);}
  PUBLISH_STYLES=await r.json();
  if(!PUBLISH_STYLES.preview)throw new Error('Publish styles response was empty');
  return PUBLISH_STYLES;
}
async function pageHTML(pg){
 await ensurePublishStyles();
 const css=buildPublishCss();
 const body=pg.blocks.map(b=>'<div style="'+spacingStyle(b.p)+'">'+renderBlock(b)+'</div>').join('\n');
 const seo=pg.seo||{};const meta=(seo.desc?'<meta name="description" content="'+esc(seo.desc)+'">':'')+(seo.noindex?'<meta name="robots" content="noindex">':'')+(seo.canonical?'<link rel="canonical" href="'+esc(seo.canonical)+'">':'')+(seo.ogImage?'<meta property="og:image" content="'+esc(seo.ogImage)+'">':'')+'<meta property="og:title" content="'+esc(seo.title||pg.name)+'">';
 const origin=siteOrigin()||((typeof location!=='undefined'&&location.origin)||'');
 const base=origin?'<base href="'+esc(origin.replace(/\/$/,'')+'/')+'">':'';
 return '<!DOCTYPE html><html lang="en-GB"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">'+base+'<title>'+esc(seo.title||pg.name+' — Heliaxis')+'</title>'+meta+
  '<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">'+
  '<style>'+css+'</style></head><body'+(pg.theme==='dark'?' class="dk"':'')+'><div class="pv-page">'+body+'</div><script>'+CMS_FORM_RUNTIME_SCRIPT+CMS_FAQ_RUNTIME_SCRIPT+'</script></body></html>';
}
function download(name,text){const b=new Blob([text],{type:'text/html'});const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download=name;a.click();URL.revokeObjectURL(u);}
async function exportHTML(){var pg=page();var slug=(pg.slug||'/').replace(/^\//,'').replace(/[^a-z0-9]+/gi,'-').replace(/^-+|-+$/g,'')||'page';download(slug+'.html',await pageHTML(pg));}
function exportJSON(){const b=new Blob([JSON.stringify(STATE,null,2)],{type:'application/json'});const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download='heliaxis-site.json';a.click();URL.revokeObjectURL(u);}
function siteOrigin(){var env=(typeof process!=='undefined'&&process.env.NEXT_PUBLIC_SITE_URL)||'';if(env)return String(env).replace(/\/$/,'');return (location.origin||'').replace(/\/$/,'');}
function publicPageUrl(slug){var s=(slug||'/').trim()||'/';if(s==='/'||s==='')return siteOrigin()+'/';if(s.charAt(0)!=='/')s='/'+s;return siteOrigin()+s;}
function buildPublishCss(){return PUBLISH_STYLES.root+'*,*::before,*::after{box-sizing:border-box}html,body{height:auto;min-height:0;overflow:auto}body{margin:0;font-family:var(--body);background:var(--paper);color:var(--ink);line-height:1.55;-webkit-font-smoothing:antialiased;--pv-max:1160px;--pv-gutter:24px;--pv-pad:max(var(--pv-gutter),calc((100% - var(--pv-max)) / 2))}/* Dark theme = dark bands (hero/CTA/etc), not a full-page black canvas */body.dk{background:var(--paper);color:var(--ink)}.pv-page{max-width:none;margin:0;background:var(--paper);width:100%;min-height:0}body.dk .pv-page{background:var(--paper)}'+PUBLISH_STYLES.preview;}
function openPublish(){
  var box=document.getElementById('modalbox');
  box.className='modalbox';
  // Mega / library / logos are site chrome — not a single page. The toolbar
  // still remembers the last edited page (e.g. a blog), which confused the URL.
  if(MODE==='mega'||MODE==='library'||MODE==='logos'){
    var chromeLabel=MODE==='mega'?'mega menu (site header)':MODE==='library'?'image library':'brand logos';
    var homeUrl=siteOrigin()+'/';
    box.innerHTML='<button class="close" onclick="closeModal()">×</button>'
      +'<h2>Publish to your site</h2>'
      +'<p>This publishes your <b>'+esc(chromeLabel)+'</b> and the rest of the saved CMS. The top navigation on every public page will update.</p>'
      +'<div class="pub-live-url" title="Check the live header"><span>See it on</span><code>'+esc(homeUrl)+'</code></div>'
      +(MODE==='mega'?'<p style="font-size:.85rem;color:var(--muted);margin:10px 0 0">After publish, open the homepage and hover Solar &amp; Battery / Business to check the mega panels.</p>':'')
      +'<div id="pubmsg" style="margin:12px 0;font-size:.9rem"></div>'
      +'<div style="display:flex;gap:8px;flex-wrap:wrap">'
      +'<button class="tbtn solar" style="color:var(--ink)" onclick="doPublish()">Publish now</button>'
      +'<a class="tbtn" style="color:var(--ink);border-color:var(--line);text-decoration:none;display:inline-flex;align-items:center" href="/" target="_blank" rel="noopener">Open homepage</a>'
      +'<button class="tbtn" style="color:var(--ink);border-color:var(--line)" onclick="exportJSON()">Download data (JSON)</button>'
      +'</div>';
    document.getElementById('modal').classList.add('show');
    return;
  }
  var pg=page();
  var liveSlug=pg?(isCmsBlogPage(pg)?toPublicBlogSlug(pg.slug):pg.slug):'/';
  var liveUrl=publicPageUrl(liveSlug);
  box.innerHTML='<button class="close" onclick="closeModal()">×</button>'
    +'<h2>Publish to your site</h2>'
    +'<p>This makes your saved changes live on the website. Preview first to see exactly how the page will look.</p>'
    +'<div class="pub-live-url" title="Live URL after publish"><span>Will go live at</span><code>'+esc(liveUrl)+'</code></div>'
    +'<div id="pubmsg" style="margin:12px 0;font-size:.9rem"></div>'
    +'<div style="display:flex;gap:8px;flex-wrap:wrap">'
    +'<button class="tbtn" style="color:var(--ink);border-color:var(--line)" onclick="openPublishPreview()">Preview before publish</button>'
    +'<button class="tbtn solar" style="color:var(--ink)" onclick="doPublish()">Publish now</button>'
    +'<button class="tbtn" style="color:var(--ink);border-color:var(--line)" onclick="exportJSON()">Download data (JSON)</button>'
    +'</div>';
  document.getElementById('modal').classList.add('show');
}
function previewBackBarHtml(returnUrl){
  var href=esc(returnUrl||'/admin');
  var backLabel=returnUrl==='/admin/blog'?'← Back to articles':'← Back to editor';
  return '<div id="cms-preview-bar" style="position:fixed;top:0;left:0;right:0;z-index:99999;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 16px;background:#211F18;color:#F7F2E7;font-family:system-ui,sans-serif;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,.35)">'
    +'<span style="opacity:.85">Preview — not published</span>'
    +'<a href="'+href+'" style="background:#F8BC1E;color:#211F18;font-weight:700;text-decoration:none;padding:8px 14px;border-radius:4px">'+backLabel+'</a>'
    +'</div><div style="height:52px"></div>';
}
async function openPublishPreview(pageIdx,opts){
  var idx=typeof pageIdx==='number'?pageIdx:STATE.current;
  var pg=STATE.pages[idx];
  if(!pg)return;
  var msg=document.getElementById('pubmsg');
  var forceSameTab=opts&&opts.sameTab;
  var returnUrl=(opts&&opts.returnUrl)||(location.pathname+(location.search||''));
  var win=null;
  if(!forceSameTab){
    try{win=window.open('about:blank','_blank');}catch(e){win=null;}
  }
  try{
    if(msg){msg.style.color='var(--muted)';msg.textContent='Opening preview…';}
    var html=await pageHTML(pg);
    html=html.replace(/<title>[^<]*<\/title>/i,'<title>'+esc(pg.name||'Page')+' · Preview (not published)</title>');
    // Inject back bar for same-tab previews
    if(!win){
      html=html.replace(/<body([^>]*)>/i,function(m,attrs){return '<body'+attrs+'>'+previewBackBarHtml(returnUrl);});
      document.open();
      document.write(html);
      document.close();
      if(msg){msg.style.color='var(--ok)';msg.textContent='✓ Preview opened — use Back to editor when done.';}
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    if(msg){msg.style.color='var(--ok)';msg.textContent='✓ Preview opened in a new tab — not published yet.';}
  }catch(e){
    var err=e&&e.message?e.message:'Could not open preview';
    if(win){try{win.document.open();win.document.write('<!DOCTYPE html><html><body style="font-family:system-ui;padding:40px;color:#b33">⚠ '+String(err).replace(/</g,'&lt;')+'</body></html>');win.document.close();}catch(e2){}}
    if(msg){msg.style.color='var(--amber-2)';msg.textContent='⚠ '+err;}
    else console.error(err);
  }
}
async function doPublish(){
  if(!document.getElementById('modal')||!document.getElementById('modal').classList.contains('show')||!document.getElementById('pubmsg'))openPublish();
  var m=document.getElementById('pubmsg');
  if(!m)return;
  m.style.color='var(--muted)';m.textContent='Saving & publishing…';
  try{
    // AI blogs must live under /blog/{slug} and be marked published for the journal.
    var nowIso=new Date().toISOString();
    (STATE.pages||[]).forEach(function(pg,i){
      if(!isCmsBlogPage(pg))return;
      var next=uniquePageSlug(toPublicBlogSlug(pg.slug),i);
      pg.slug=next;
      pg.seo=pg.seo||{};
      pg.seo.slug=next;
      pg.blogStatus='published';
      pg.publishAt=pg.publishAt||nowIso;
      pg.scheduledRender=null;
    });
    await save();
    await ensurePublishStyles();
    var css=buildPublishCss();
    var pages=STATE.pages.map(function(pg){
      return{slug:pg.slug,name:pg.name,theme:pg.theme||'',seo:pg.seo||{},
        html:'<div class="pv-page">'+pg.blocks.map(function(b){return '<div style="'+spacingStyle(b.p)+'">'+renderBlock(b)+'</div>';}).join('\n')+'</div>'};
    });
    // Send live STATE (incl. site.menu) so publish does not re-read a stale draft.
    var r=await fetch('/api/cms/publish',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',
      body:JSON.stringify({state:STATE,rendered:{css:css,pages:pages}})});
    if(!r.ok){var em='Publish failed';try{em=(await r.json()).error||em;}catch(e){}if(r.status===401)throw new Error('You must be signed in as an approved admin to publish.');throw new Error(em);}
    var liveUrl=(MODE==='mega'||MODE==='library'||MODE==='logos')
      ? (siteOrigin()+'/')
      : publicPageUrl(page()?(isCmsBlogPage(page())?toPublicBlogSlug(page().slug):page().slug):'/');
    var viewLabel=(MODE==='mega')?'View site header →':'View live page →';
    var menuN=(STATE.site&&STATE.site.menu)?STATE.site.menu.length:0;
    m.style.color='var(--ok)';
    m.innerHTML='✓ <b>Published — live on your site</b>'
      +(MODE==='mega'?'<div style="margin-top:8px;color:var(--muted);font-size:.85rem">Header menu published with <b>'+menuN+'</b> item'+(menuN===1?'':'s')+'. Hard-refresh the homepage if you still see an old link.</div>':'')
      +'<div style="margin-top:10px"><a href="'+esc(liveUrl)+'" target="_blank" rel="noopener" style="color:var(--amber-2);font-weight:700;text-decoration:underline">'+viewLabel+'</a></div>'
      +'<div style="margin-top:6px;font-family:var(--mono);font-size:.72rem;color:var(--muted);word-break:break-all">'+esc(liveUrl)+'</div>'
      +'<div style="margin-top:10px;color:var(--muted);font-size:.82rem">No Vercel redeploy needed — content is live now (including the homepage when you publish Home).</div>';
  }catch(e){
    m.style.color='var(--amber-2)';
    m.textContent='⚠ '+(e&&e.message?e.message:'Publish failed');
  }
}
function closeModal(){
  var m=document.getElementById('modal');
  if(m)m.classList.remove('show');
  window._confirmAction=null;
}
document.getElementById('modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal()});
document.addEventListener('keydown',function(e){if(MODE!=='dash')return;if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes((document.activeElement&&document.activeElement.tagName)||'')){e.preventDefault();var el=document.getElementById('dash-page-search');if(el)el.focus();}});
document.addEventListener('click',function(e){var wrap=document.querySelector('.toolbar-more-wrap');if(wrap&&!wrap.contains(e.target))closeToolbarMore();var picker=document.getElementById('pagePicker');if(picker&&!picker.contains(e.target))closePagePicker();if(!e.target.closest||!e.target.closest('.link-pick'))closeLinkPicks();});
window.addEventListener('popstate',function(){
  var slug=getSlugFromPath();
  var viewMode=cmsViewModeFromSlug(slug);
  if(viewMode){applyCmsView(viewMode,true);return;}
  if(!slug){goDash(true);return;}
  var idx=findPageByEditSlug(slug);
  if(idx>=0){STATE.current=idx;SEL=null;MODE='edit';setMode();renderAll();tab('build');}
  else goDash(true);
});

/* ===== dashboard URL routing ===== */
var CMS_VIEW_SLUGS={library:'library',logos:'logos',mega:'mega'};
function cmsViewModeFromSlug(slug){
  if(!slug)return null;
  slug=String(slug).toLowerCase();
  if(slug==='library'||slug==='logos'||slug==='mega')return slug;
  return null;
}
function cmsPathForMode(mode){
  if(mode==='library')return '/admin/library';
  if(mode==='logos')return '/admin/logos';
  if(mode==='mega')return '/admin/mega';
  if(mode==='edit'&&page())return cmsAdminPath(pageEditSlug(page()));
  return '/admin';
}
function applyCmsView(mode,skipUrl){
  MODE=mode;
  setMode();
  if(mode==='library')renderLibrary();
  else if(mode==='logos')renderLogosLib();
  else if(mode==='mega')renderMega();
  if(!skipUrl)syncCmsUrl(false);
}
function normTitle(s){return (s||'').trim();}
function titleKey(s){return normTitle(s).toLowerCase();}
function pageTitleTaken(name,exceptIdx){var k=titleKey(name);if(!k)return false;for(var i=0;i<STATE.pages.length;i++){if(i===exceptIdx)continue;if(titleKey(STATE.pages[i].name)===k)return true;}return false;}
function uniquePageTitle(base,exceptIdx){base=normTitle(base)||'Untitled page';if(!pageTitleTaken(base,exceptIdx))return base;var n=2;while(pageTitleTaken(base+' '+n,exceptIdx))n++;return base+' '+n;}
function ensureUniquePageTitles(){var changed=false;for(var i=0;i<STATE.pages.length;i++){if(!pageTitleTaken(STATE.pages[i].name,i))continue;STATE.pages[i].name=uniquePageTitle(STATE.pages[i].name,i);changed=true;}return changed;}
function trySetPageName(idx,name){name=normTitle(name);if(!name){openNoticeModal({title:'Title required',message:'Page title cannot be empty.'});return false;}if(pageTitleTaken(name,idx)){openNoticeModal({title:'Title already in use',message:'A page titled “'+name+'” already exists. Choose a different title.'});return false;}STATE.pages[idx].name=name;syncPageSlugFromTitle(STATE.pages[idx],idx);save();renderAll();if(MODE==='edit'&&STATE.current===idx){renderSEO();syncCmsUrl(false);}return true;}
function pageNameUpd(v){if(!trySetPageName(STATE.current,v))renderSEO();}
function slugifyTitle(s){return (s||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');}
function titleToSlug(name){var base=slugifyTitle(name)||'page';return '/'+base;}
/** Normalize a slug while preserving `/` path segments (so `/blog/foo` stays `/blog/foo`, not `/blog-foo`). */
function normSlug(s){
  s=normTitle(s);
  if(!s||s==='/')return '/';
  s=String(s).replace(/^\/+/,'').replace(/\/+$/,'');
  var parts=s.split('/').map(function(p){return slugifyTitle(p);}).filter(Boolean);
  if(!parts.length)return '/page';
  return '/'+parts.join('/');
}
/** Map mistaken `/blog-foo` or `/blog/-foo` onto `/blog/foo`. */
function toPublicBlogSlug(raw){
  var s=String(raw||'').trim()||'/article';
  if(s.charAt(0)!=='/')s='/'+s;
  if(s==='/blog')return '/blog/article';
  if(s.indexOf('/blog/')===0){
    var tail=s.slice('/blog/'.length).replace(/^-+/,'')||'article';
    return normSlug('/blog/'+tail);
  }
  if(s.indexOf('/blog-')===0){
    return normSlug('/blog/'+(s.slice('/blog-'.length).replace(/^-+/,'')||'article'));
  }
  var rest=s.replace(/^\//,'');
  if(rest.indexOf('blog/')===0)rest=rest.slice('blog/'.length);
  else if(rest.indexOf('blog-')===0)rest=rest.slice('blog-'.length);
  rest=(rest||'article').replace(/^-+/,'')||'article';
  return normSlug('/blog/'+rest);
}
function pageSlugTaken(slug,exceptIdx){var k=normSlug(slug);if(!k)return false;if(k==='/blog'||k==='/admin'||k.indexOf('/admin/')===0)return true;for(var i=0;i<STATE.pages.length;i++){if(i===exceptIdx)continue;if(normSlug(STATE.pages[i].slug)===k)return true;}return false;}
function uniquePageSlug(base,exceptIdx){base=normSlug(base);if(base==='/')return '/';if(!pageSlugTaken(base,exceptIdx))return base;var n=2;while(pageSlugTaken(base+'-'+n,exceptIdx))n++;return base+'-'+n;}
function ensureUniquePageSlugs(){var changed=false;for(var i=0;i<STATE.pages.length;i++){var pg=STATE.pages[i];var cur=normSlug(pg.slug);if(cur==='/'&&!pageSlugTaken('/',i)){if(pg.slug!=='/'){pg.slug='/';pg.seo=pg.seo||{};pg.seo.slug='/';changed=true;}continue;}if(cur==='/'&&pageSlugTaken('/',i)){var next=uniquePageSlug(titleToSlug(pg.name||'page'),i);if(next==='/')next=uniquePageSlug('/page',i);pg.slug=next;pg.seo=pg.seo||{};pg.seo.slug=next;changed=true;continue;}if(!pageSlugTaken(cur,i)){if(pg.slug!==cur){pg.slug=cur;pg.seo=pg.seo||{};pg.seo.slug=cur;changed=true;}continue;}var fixed=uniquePageSlug(cur,i);pg.slug=fixed;pg.seo=pg.seo||{};pg.seo.slug=fixed;changed=true;}return changed;}
/** Repair AI-blog paths mangled to `/blog-foo` or `/blog/-foo`. */
function ensureBlogPublicSlugs(){
  var changed=false;
  (STATE.pages||[]).forEach(function(pg,i){
    if(!isCmsBlogPage(pg))return;
    var next=uniquePageSlug(toPublicBlogSlug(pg.slug),i);
    if(pg.slug!==next){
      pg.slug=next;
      pg.seo=pg.seo||{};
      pg.seo.slug=next;
      changed=true;
    }else if(pg.seo&&pg.seo.slug!==next){
      pg.seo.slug=next;
      changed=true;
    }
  });
  return changed;
}
/** Insert install gallery on Home after testimonials when missing (one-time layout upgrade). */
function ensureHomeGallery(){
  var changed=false;
  (STATE.pages||[]).forEach(function(pg){
    if(!isHomePage(pg))return;
    if((pg.blocks||[]).some(function(b){return b.t==='gallery';}))return;
    var bl=makeBlock('gallery');
    var ti=-1;
    (pg.blocks||[]).forEach(function(b,j){if(b.t==='testi')ti=j;});
    if(ti>=0)pg.blocks.splice(ti+1,0,bl);
    else pg.blocks.push(bl);
    changed=true;
  });
  return changed;
}
/** Insert funding band on Home after gallery when missing. */
function ensureHomeFunding(){
  var changed=false;
  (STATE.pages||[]).forEach(function(pg){
    if(!isHomePage(pg))return;
    if((pg.blocks||[]).some(function(b){return b.t==='funding';}))return;
    var bl=makeBlock('funding');
    var gi=-1;
    (pg.blocks||[]).forEach(function(b,j){if(b.t==='gallery')gi=j;});
    if(gi>=0)pg.blocks.splice(gi+1,0,bl);
    else pg.blocks.push(bl);
    changed=true;
  });
  return changed;
}
/** Backfill gallery editor fields on saved pages. */
function ensureGalleryCustomize(){
  var changed=false;
  (STATE.pages||[]).forEach(function(pg){
    (pg.blocks||[]).forEach(function(bl){
      if(bl.t!=='gallery')return;
      var p=bl.p;
      if(p.featuredLabel==null){p.featuredLabel='Featured install';changed=true;}
      if(typeof p.featuredIndex!=='number'){p.featuredIndex=galleryFeaturedIndex(p);changed=true;}
      (p.items||[]).forEach(function(it,i){
        if(typeof it.featured!=='boolean'){it.featured=i===p.featuredIndex;changed=true;}
      });
    });
  });
  return changed;
}
/** Backfill FAQ editor fields on saved pages. */
function ensureFaqCustomize(){
  var changed=false;
  (STATE.pages||[]).forEach(function(pg){
    (pg.blocks||[]).forEach(function(bl){
      if(bl.t!=='faq')return;
      var p=bl.p;
      if(p.eyebrow==null){p.eyebrow='Good to know';changed=true;}
      if(p.title==null){p.title='Your questions, answered';changed=true;}
      if(p.anchor==null){p.anchor='faq';changed=true;}
    });
  });
  return changed;
}
/** Insert quote form on Home after FAQ when missing. */
function ensureHomeQuoteForm(){
  var changed=false;
  (STATE.pages||[]).forEach(function(pg){
    if(!isHomePage(pg))return;
    if((pg.blocks||[]).some(function(b){return b.t==='form';}))return;
    var bl=makeBlock('form');
    var fi=-1;
    (pg.blocks||[]).forEach(function(b,j){if(b.t==='faq')fi=j;});
    if(fi>=0)pg.blocks.splice(fi+1,0,bl);
    else pg.blocks.push(bl);
    changed=true;
  });
  return changed;
}
/** Backfill quote form fields on saved pages. */
function ensureFormCustomize(){
  var changed=false;
  var defs=quoteFormDefaults();
  (STATE.pages||[]).forEach(function(pg){
    (pg.blocks||[]).forEach(function(bl){
      if(bl.t!=='form')return;
      var p=bl.p;
      if(formVariant(p)==='contact'){if(!p.variant){p.variant='contact';changed=true;}return;}
      if(!p.variant){p.variant='quote';changed=true;}
      Object.keys(defs).forEach(function(k){
        if(k==='variant')return;
        if(p[k]==null){p[k]=JSON.parse(JSON.stringify(defs[k]));changed=true;}
      });
      if(!Array.isArray(p.points)||!p.points.length){p.points=defs.points.slice();changed=true;}
    });
  });
  return changed;
}
/** Backfill CTA band fields on saved pages. */
function ensureCtaCustomize(){
  var changed=false;
  (STATE.pages||[]).forEach(function(pg){
    (pg.blocks||[]).forEach(function(bl){
      if(bl.t!=='cta')return;
      var p=bl.p;
      if(p.btnHref==null){p.btnHref='#quote';changed=true;}
      if(p.btn2==null){p.btn2='Call 01633 965205';changed=true;}
      if(p.btn2Href==null){p.btn2Href='tel:01633965205';changed=true;}
      if(p.cta2Disabled==null){p.cta2Disabled=false;changed=true;}
    });
  });
  return changed;
}
/** Insert site footer on Home after the CTA band when missing. */
function ensureHomeFooter(){
  var changed=false;
  (STATE.pages||[]).forEach(function(pg){
    if(!isHomePage(pg))return;
    if((pg.blocks||[]).some(function(b){return b.t==='footer';}))return;
    var bl=makeBlock('footer');
    var ci=-1;
    (pg.blocks||[]).forEach(function(b,j){if(b.t==='cta')ci=j;});
    if(ci>=0)pg.blocks.splice(ci+1,0,bl);
    else pg.blocks.push(bl);
    changed=true;
  });
  return changed;
}
/** Backfill footer fields on saved pages. */
function ensureFooterCustomize(){
  var changed=false;
  var defs=footerDefaults();
  (STATE.pages||[]).forEach(function(pg){
    (pg.blocks||[]).forEach(function(bl){
      if(bl.t!=='footer')return;
      var p=bl.p;
      Object.keys(defs).forEach(function(k){
        if(p[k]==null){p[k]=JSON.parse(JSON.stringify(defs[k]));changed=true;}
      });
      if(!Array.isArray(p.cols)||!p.cols.length){p.cols=JSON.parse(JSON.stringify(defs.cols));changed=true;}
    });
  });
  return changed;
}
/** Normalize legacy block type strings (e.g. TRUSTBAR → trustbar) so render + labels work everywhere. */
function ensureBlockTypesLowercase(){
  var changed=false;
  (STATE.pages||[]).forEach(function(pg){
    (pg.blocks||[]).forEach(function(bl){
      if(!bl||!bl.t)return;
      var next=blockTypeKey(bl.t);
      if(bl.t!==next){bl.t=next;changed=true;}
    });
  });
  return changed;
}
/** Set services anchor on Home grid so footer service links work. */
function ensureGridAnchor(){
  var changed=false;
  (STATE.pages||[]).forEach(function(pg){
    if(!isHomePage(pg))return;
    (pg.blocks||[]).forEach(function(bl){
      if(bl.t!=='grid')return;
      if(bl.p.anchor==null||bl.p.anchor===''){bl.p.anchor='services';changed=true;}
    });
  });
  return changed;
}
/** Backfill hero editor fields on saved pages. */
function ensureHeroCustomize(){
  var changed=false;
  (STATE.pages||[]).forEach(function(pg){
    (pg.blocks||[]).forEach(function(bl){
      if(bl.t!=='hero')return;
      var p=bl.p;
      if(p.hideMark==null){p.hideMark=false;changed=true;}
      if(p.hideSun==null){p.hideSun=false;changed=true;}
      if(p.hideRating==null){p.hideRating=false;changed=true;}
      if(p.hideMicrotrust==null){p.hideMicrotrust=false;changed=true;}
      if(p.markImg==null){p.markImg='';changed=true;}
      if(p.ratingValue==null){p.ratingValue='4.9';changed=true;}
      if(p.ratingInstalls==null){p.ratingInstalls='1200';changed=true;}
      if(p.textWide==null){p.textWide=false;changed=true;}
    });
  });
  return changed;
}
function isHomePage(pg){var cur=(pg.slug||'/').replace(/\/$/,'')||'/';return cur==='/'||cur==='';}
function slugFromPageTitle(pg){if(isHomePage(pg))return '/';if(isCmsBlogPage(pg)){var base=slugifyTitle(pg.name)||'article';return '/blog/'+base;}return titleToSlug(pg.name);}
function syncPageSlugFromTitle(pg,idx){if(isHomePage(pg)){pg.slug='/';pg.seo=pg.seo||{};pg.seo.slug='/';return;}var except=typeof idx==='number'?idx:STATE.pages.indexOf(pg);var next=uniquePageSlug(slugFromPageTitle(pg),except);if(isCmsBlogPage(pg))next=uniquePageSlug(toPublicBlogSlug(next),except);pg.slug=next;pg.seo=pg.seo||{};pg.seo.slug=next;}
function repairLegacyUntitledSlugs(){var changed=false;STATE.pages.forEach(function(pg,i){if(!pg.name||isHomePage(pg))return;if(!/^\/untitled-[a-z0-9]+$/i.test(pg.slug||''))return;syncPageSlugFromTitle(pg,i);changed=true;});return changed;}
function pageNameInput(v){var pg=page();var cur=(pg.slug||'').replace(/\/$/,'')||'/';if(cur==='/'||cur==='')return;var slugInp=document.getElementById('seo-slug-input');if(!slugInp)return;var base=isCmsBlogPage(pg)?('/blog/'+(slugifyTitle(normTitle(v))||'article')):titleToSlug(normTitle(v));slugInp.value=uniquePageSlug(base,STATE.current);}
function pageEditSlug(pg){var base=slugifyTitle(pg.name);if(!base)base=slugifyTitle((pg.slug||'/').replace(/^\//,''))||'page';return base;}
function getSlugFromPath(){var parts=location.pathname.replace(/\/+$/,'').split('/');if(parts.length<3||parts[1]!=='admin')return null;var s=decodeURIComponent(parts[2]);if(!s||s==='enquiries'||s==='approvals'||s==='blog'||s==='analytics')return null;return s;}
function findPageByEditSlug(slug){
  if(!slug)return -1;
  slug=decodeURIComponent(String(slug)).toLowerCase().replace(/^\/+/,'');
  if(cmsViewModeFromSlug(slug))return -1;
  return STATE.pages.findIndex(function(pg){
    if(pageEditSlug(pg).toLowerCase()===slug)return true;
    var urlSlug=String(pg.slug||'').replace(/^\/+/,'').toLowerCase();
    return urlSlug===slug;
  });
}
function cmsAdminPath(slug){return '/admin/'+encodeURIComponent(slug);}
function cmsDocTitle(){
  if(MODE==='edit'&&page())return page().name+' · Heliaxis CMS';
  if(MODE==='library')return 'Image library · Heliaxis CMS';
  if(MODE==='logos')return 'Brand logos · Heliaxis CMS';
  if(MODE==='mega')return 'Mega menu · Heliaxis CMS';
  return 'Heliaxis CMS';
}
function syncCmsUrl(replace){
  var path=cmsPathForMode(MODE);
  var title=cmsDocTitle();
  if(location.pathname===path){document.title=title;return;}
  var state={cmsMode:MODE,slug:MODE==='edit'&&page()?pageEditSlug(page()):(CMS_VIEW_SLUGS[MODE]||null)};
  if(replace)history.replaceState(state,'',path);else history.pushState(state,'',path);
  document.title=title;
}
/* ===== extension: template variety, case studies, section preview ===== */
let IMGFILTER='';
let DASH_PAGE_SEARCH='';
let DASH_PAGE_NUM=1;
let DASH_PAGE_SORT='az';
let DASH_PAGE_TYPE='';
const DASH_PAGE_SIZE=12;
var dashSearchTimer=null;
function sitePageCount(){var n=0;STATE.pages.forEach(function(pg){if(!isCmsBlogPage(pg))n++;});return n;}
function blogPageCount(){var n=0;STATE.pages.forEach(function(pg){if(isCmsBlogPage(pg))n++;});return n;}
function dashPageTypeMatches(pg){if(isCmsBlogPage(pg))return false;if(!DASH_PAGE_TYPE)return true;return dashPageBadge(pg)===DASH_PAGE_TYPE;}
function dashTypeCounts(){var c={all:0,home:0,landing:0,case:0,page:0,blog:0};STATE.pages.forEach(function(pg){var k=dashPageBadge(pg);if(k==='blog'){c.blog++;return;}c.all++;c[k]++;});return c;}
function dashPageMatches(pg){if(isCmsBlogPage(pg))return false;if(!DASH_PAGE_SEARCH)return true;var q=DASH_PAGE_SEARCH.toLowerCase();return (pg.name||'').toLowerCase().indexOf(q)>=0||(pg.slug||'').toLowerCase().indexOf(q)>=0;}
function dashFilteredIndices(){var out=[];STATE.pages.forEach(function(pg,i){if(dashPageMatches(pg)&&dashPageTypeMatches(pg))out.push(i);});out.sort(function(a,b){var na=(STATE.pages[a].name||'').toLowerCase();var nb=(STATE.pages[b].name||'').toLowerCase();if(na===nb)return a-b;return DASH_PAGE_SORT==='za'?(na<nb?1:-1):(na<nb?-1:1);});return out;}
function dashPageSearch(q){DASH_PAGE_SEARCH=q;DASH_PAGE_NUM=1;clearTimeout(dashSearchTimer);dashSearchTimer=setTimeout(renderDashPages,200);}
function dashPageTypeSet(v){DASH_PAGE_TYPE=v;DASH_PAGE_NUM=1;renderDashPages();}
function dashPageFilterHtml(){var tc=dashTypeCounts();return '<select class="dash-sort" id="dash-page-type" onchange="dashPageTypeSet(this.value)" title="Filter by page type"><option value="">All pages ('+tc.all+')</option><option value="home"'+(DASH_PAGE_TYPE==='home'?' selected':'')+'>Home ('+tc.home+')</option><option value="landing"'+(DASH_PAGE_TYPE==='landing'?' selected':'')+'>Landing ('+tc.landing+')</option><option value="case"'+(DASH_PAGE_TYPE==='case'?' selected':'')+'>Case study ('+tc.case+')</option><option value="page"'+(DASH_PAGE_TYPE==='page'?' selected':'')+'>Page ('+tc.page+')</option></select>';}
function dashPagesHeadCount(total){var siteN=sitePageCount();if(DASH_PAGE_SEARCH||DASH_PAGE_TYPE)return total+' of '+siteN;return ''+siteN;}
function dashClearSearch(){DASH_PAGE_SEARCH='';var el=document.getElementById('dash-page-search');if(el)el.value='';DASH_PAGE_NUM=1;renderDashPages();}
function dashPageGo(n){DASH_PAGE_NUM=Math.max(1,+n||1);renderDashPages();var sec=document.getElementById('dash-pages-sec');if(sec)sec.scrollIntoView({behavior:'smooth',block:'start'});}
function dashPageBadge(pg){var slug=(pg.slug||'').replace(/\/$/,'')||'/';if(slug==='/'||slug==='')return 'home';var t=(pg.type||'page').toLowerCase();if(t==='blog'||String(pg.origin||'').toLowerCase()==='ai-blog')return 'blog';if(t==='landing')return 'landing';if(t==='casestudy'||t==='case')return 'case';if(t==='home')return 'home';var name=(pg.name||'').toLowerCase();if(name.indexOf('landing')>=0)return 'landing';if(slug.indexOf('case-study')>=0||name.indexOf('case study')>=0)return 'case';var seq=(pg.blocks||[]).map(function(b){return b.t;}).join(',');if(slug!=='/example-blog-page'&&(seq==='hero,media,rich,cta,rich,form,split'||seq.indexOf('hero,media,rich,cta,rich,form,split')===0))return 'blog';return 'page';}
function isCmsBlogPage(pg){return dashPageBadge(pg)==='blog';}
function dashPageBadgeHtml(kind){var labels={home:'Home',landing:'Landing',case:'Case study',page:'Page',blog:'AI blog'};return '<span class="pbadge pbadge-'+kind+'">'+labels[kind]+'</span>';}
function dashPageCard(i){var pg=STATE.pages[i];var secs=(pg.blocks||[]).length;var badge=dashPageBadge(pg);return '<article class="pcard" onclick="editPage('+i+')" role="button" tabindex="0" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();editPage('+i+')}"><div class="pthumb"><div class="pthumb-frame"><div class="zi" id="thumb'+i+'"></div></div><div class="pthumb-shade"></div>'+dashPageBadgeHtml(badge)+'<span class="pthumb-open"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>Open editor</span></div><div class="pcard-body"><h3 class="pcard-name">'+esc(pg.name)+'</h3><div class="pcard-meta-row"><span class="pcard-secs">'+secs+' section'+(secs===1?'':'s')+'</span></div><div class="pcard-actions" onclick="event.stopPropagation()"><button type="button" class="pcard-btn pcard-btn-primary" onclick="editPage('+i+')">Edit page</button><button type="button" class="pcard-btn" onclick="openPublishPreview('+i+')" title="Preview how this page will look when published">Preview</button><button type="button" class="pcard-btn pcard-btn-danger" onclick="delPage('+i+')" title="Delete page">Delete</button></div></div></article>';}
function dashStatsHtml(){var total=leads().length;var L=LIVE_LEADS;var leadN=(L===null?'…':String(total));var blogs=blogPageCount();return '<div class="dash-stats"><div class="dash-stat"><span class="dash-stat-n">'+sitePageCount()+'</span><span class="dash-stat-l">Website pages</span></div><a class="dash-stat dash-stat-link" href="/admin/blog"><span class="dash-stat-n">'+blogs+'</span><span class="dash-stat-l">AI blogs</span></a><a class="dash-stat dash-stat-link" href="/admin/enquiries"><span class="dash-stat-n">'+leadN+'</span><span class="dash-stat-l">Enquiries</span></a><a class="dash-stat dash-stat-link" href="/admin/analytics"><span class="dash-stat-n dash-stat-ic">'+icon('chart',28)+'</span><span class="dash-stat-l">Analytics</span></a><a class="dash-stat dash-stat-link" href="/" target="_blank" rel="noopener"><span class="dash-stat-n">↗</span><span class="dash-stat-l">View live site</span></a></div>';}
function renderDashThumb(i){var pg=STATE.pages[i];var t=document.getElementById('thumb'+i);if(!t)return;t.className='zi'+(pg.theme==='dark'?' dk':'');t.innerHTML=pg.blocks.length?pg.blocks.map(renderBlock).join(''):'<div class="pthumb-empty">Empty page — click to add sections</div>';}
function renderDashPages(){var indices=dashFilteredIndices();var total=indices.length;var pages=Math.max(1,Math.ceil(total/DASH_PAGE_SIZE));if(DASH_PAGE_NUM>pages)DASH_PAGE_NUM=pages;var start=(DASH_PAGE_NUM-1)*DASH_PAGE_SIZE;var slice=indices.slice(start,start+DASH_PAGE_SIZE);var searchEl=document.getElementById('dash-page-search');var hadFocus=searchEl&&document.activeElement===searchEl;var selStart=hadFocus?searchEl.selectionStart:0;var selEnd=hadFocus?searchEl.selectionEnd:0;var hEl=document.getElementById('dash-pages-h');if(hEl)hEl.innerHTML=SPARK+'Your pages ('+dashPagesHeadCount(total)+')';var clr=document.getElementById('dash-search-clear');if(clr)clr.style.display=DASH_PAGE_SEARCH?'inline-flex':'none';var typeEl=document.getElementById('dash-page-type');if(typeEl){var tc=dashTypeCounts();typeEl.innerHTML='<option value="">All pages ('+tc.all+')</option><option value="home"'+(DASH_PAGE_TYPE==='home'?' selected':'')+'>Home ('+tc.home+')</option><option value="landing"'+(DASH_PAGE_TYPE==='landing'?' selected':'')+'>Landing ('+tc.landing+')</option><option value="case"'+(DASH_PAGE_TYPE==='case'?' selected':'')+'>Case study ('+tc.case+')</option><option value="page"'+(DASH_PAGE_TYPE==='page'?' selected':'')+'>Page ('+tc.page+')</option>';}var grid=document.getElementById('dash-pages-grid');if(!grid)return;var h='';if(!total)h+='<div class="dash-empty">'+(DASH_PAGE_SEARCH||DASH_PAGE_TYPE?'No pages match your filters. <button type="button" class="dash-link-btn" onclick="dashClearFilters()">Clear filters</button>':'No pages yet. Create one above.')+'</div>';else slice.forEach(function(i){h+=dashPageCard(i);});grid.innerHTML=h;var pager=document.getElementById('dash-pages-pager');if(pager){if(total<=DASH_PAGE_SIZE)pager.innerHTML='';else pager.innerHTML='<div class="dash-pager"><button type="button" class="dash-pg-btn"'+(DASH_PAGE_NUM<=1?' disabled':'')+' onclick="dashPageGo('+(DASH_PAGE_NUM-1)+')">← Previous</button><span class="dash-pg-info">Page '+DASH_PAGE_NUM+' of '+pages+' · '+total+' page'+(total===1?'':'s')+'</span><button type="button" class="dash-pg-btn"'+(DASH_PAGE_NUM>=pages?' disabled':'')+' onclick="dashPageGo('+(DASH_PAGE_NUM+1)+')">Next →</button></div>';}slice.forEach(renderDashThumb);if(hadFocus){var el2=document.getElementById('dash-page-search');if(el2){el2.focus();try{el2.setSelectionRange(selStart,selEnd);}catch(e){}}}}
function dashClearFilters(){DASH_PAGE_SEARCH='';DASH_PAGE_TYPE='';DASH_PAGE_NUM=1;var el=document.getElementById('dash-page-search');if(el)el.value='';renderDashPages();}
var TEMPLATE_MAP=['product','dark','image','finance','minimal','grant','image','sector','product','grant','image','dark','minimal','sector','image'];
var THEME_BY_TPL={product:'light',dark:'dark',image:'light',minimal:'light',finance:'light',grant:'light',sector:'light'};
var TPL_LABEL={product:'Light · classic',dark:'Dark · bold',image:'Image-led',minimal:'Minimal · typographic',finance:'Finance · pricing',grant:'Grant · steps',sector:'Sector · case studies'};
window.EXTRA_DEFAULTS={
 pricing:{eyebrow:'Ways to pay',title:'Choose how you fund it',plans:[{name:'Buy outright',price:'From £5,900',per:'one-off',feats:['Own it outright','Best lifetime return','25-year warranty'],cta:'Get a quote',ctaHref:'#quote',hl:false},{name:'Finance',price:'£0 upfront',per:'spread monthly',feats:['Spread the cost','Often bill-neutral','Flexible terms'],cta:'Check finance',ctaHref:'#quote',hl:true},{name:'PPA',price:'£0 upfront',per:'pay per unit',feats:['No capital outlay','Funder-owned & maintained','Savings from day one'],cta:'See PPA',ctaHref:'/commercial-funding',hl:false}]},
 steps:{eyebrow:'How it works',title:'From enquiry to switch-on',items:[{title:'Free survey',text:'We assess your roof, usage and goals.'},{title:'Design & quote',text:'A clear proposal with honest figures.'},{title:'Install',text:'MCS-certified, tidy and on schedule.'},{title:'Switch on',text:'Start saving — tracked from your phone.'}]},
 casestudy:{eyebrow:'Our work',title:'Recent projects',items:[{img:'',loc:'Cardiff',title:'4-bed home retrofit',stat:'£1,400/yr',statlabel:'Estimated saving'},{img:'',loc:'Newport',title:'Warehouse rooftop',stat:'55 kWp',statlabel:'System installed'},{img:'',loc:'Swansea',title:'Care home',stat:'42%',statlabel:'Grid reduction'}]},
 gallery:{eyebrow:'Recent work',title:'Installs across South Wales',sub:'A few of the homes and businesses we\'ve powered up. Real drone & install photos drop straight into these frames.',featuredLabel:'Featured install',footnote:'Placeholder frames — swap in your real drone & install photography.',featuredIndex:0,items:[{img:'',loc:'Cardiff · 6.4 kWp + 10kWh battery',featured:true},{img:'',loc:'Swansea · 4.0 kWp',featured:false},{img:'',loc:'Newport · Commercial 55 kWp',featured:false},{img:'',loc:'Bridgend · 5.3 kWp + EV',featured:false},{img:'',loc:'Vale of Glamorgan · Heat pump',featured:false}]},
 funding:{eyebrow:'Funding & finance',title:'Solar within reach, whatever your budget',sub:'Buy outright, spread the cost, or pay nothing upfront — plus the Welsh grants worth knowing about.',items:[{title:'0% VAT on home solar',text:'Residential installs carry 0% VAT until 31 March 2027 — a saving worth locking in.'},{title:'Finance & PPA options',text:'Spread the cost, or let a funder cover it entirely with Solar-as-a-Service for businesses.'},{title:'Welsh & local grants',text:'From the Nest scheme to Newport\'s SME decarbonisation grant — we\'ll help you find and time it.'}],cta:'0% VAT ends March 2027 — see all funding routes →',ctaHref:'/commercial-funding',ctaDisabled:false},
 clientbanner:{heading:'Trusted by businesses across South Wales',clients:[{name:'Morgan Ltd',img:''},{name:'Valley Foods',img:''},{name:'Cambrian Care',img:''},{name:'Severn Logistics',img:''},{name:'Tafwyl Retail',img:''}]}
};
function altLanding(c,tpl){const[name,headline,sub,benefits,cta]=c;const U=()=>uid();
 const hero={id:U(),t:'hero',p:{eyebrow:'MCS-certified · South Wales',headline,sub,dark:true,ctaLabel:cta,ctaPulse:true,cta2:''}};
 const stats={id:U(),t:'stats',p:{items:[{n:'1,200+',k:'Installs'},{n:'4.9★',k:'Rated'},{n:'25 yr',k:'Warranty'},{n:'£0',k:'Survey'}]}};
 const bgrid={id:U(),t:'grid',p:{eyebrow:'Why '+name.toLowerCase(),title:'What you get',cols:benefits.length===4?2:3,fill:'contact',items:benefits.map((b,i)=>({icon:['shield','coin','solar','battery','ev','clock'][i%6],title:b,desc:''}))}};
 const media=(side)=>({id:U(),t:'media',p:{img:'',side:side||'right',eyebrow:name,title:headline,text:sub+' Pair this with a real photo of one of your installs.',cta}});
 const testi={id:U(),t:'testi',p:{eyebrow:'Real customers',title:'Trusted across South Wales',footnote:'Illustrative testimonials — replace with your real Google & Trustpilot reviews.',speed:36,items:[{stars:5,quote:'Neat, tidy and genuinely no pressure. Our bills have dropped massively and the app makes it easy to see.',name:'Sarah M.',loc:'Cardiff · Solar + battery'},{stars:5,quote:'From survey to switch-on they were spot on. The team clearly knew what they were doing and cleaned up after.',name:'David R.',loc:'Swansea · Solar PV'},{stars:5,quote:'We use them for our commercial units. Straight answers, proper ROI figures, and a payback we\'re already hitting.',name:'Gareth L.',loc:'Newport · Commercial'}]}};
 const faq={id:U(),t:'faq',p:{items:[{q:'Is the survey really free?',a:'Yes — free, no obligation, and no pushy sales.'},{q:'How fast can you install?',a:'Most projects move within a few weeks of design sign-off.'}]}};
 const ctablk={id:U(),t:'cta',p:{headline:cta+' today',sub:'One quick step — we\'ll do the rest.',btn:cta,pulse:true}};
 const banner={id:U(),t:'banner',p:{heading:'Trusted technology we install'}};
 const pricing={id:U(),t:'pricing',p:JSON.parse(JSON.stringify(EXTRA_DEFAULTS.pricing))};
 const steps={id:U(),t:'steps',p:JSON.parse(JSON.stringify(EXTRA_DEFAULTS.steps))};
 const cases={id:U(),t:'casestudy',p:JSON.parse(JSON.stringify(EXTRA_DEFAULTS.casestudy))};
var mediaL={id:U(),t:'media',p:{img:'',side:'left',eyebrow:name,title:'Real installs, real results',text:'Pair this with a drone or install photo — image-led pages convert hardest in solar.',cta:cta}};
 var lighthero={id:U(),t:'hero',p:{eyebrow:'MCS-certified · South Wales',headline:headline,sub:sub,dark:false,ctaLabel:cta,ctaPulse:true,cta2:''}};
 if(tpl==='dark')return[hero,stats,bgrid,media('right'),testi,faq,ctablk];
 if(tpl==='image')return[hero,mediaL,media('right'),cases,testi,ctablk];
 if(tpl==='minimal')return[lighthero,steps,faq,ctablk];
 if(tpl==='finance')return[hero,media('right'),pricing,stats,testi,faq,ctablk];
 if(tpl==='grant')return[hero,bgrid,steps,banner,faq,ctablk];
 if(tpl==='sector')return[hero,stats,media('left'),bgrid,cases,ctablk];
 return[hero,stats,bgrid,media('right'),banner,testi,faq,ctablk];
}
/* section hover preview (reuses #tplpop) */
const SAMPLES={hero:{eyebrow:'Eyebrow',headline:'A punchy headline',sub:'Supporting line of copy.',dark:true,ctaLabel:'Get a quote',ctaPulse:false,cta2:'Learn more'},trustbar:{logos:'MCS, RECC, NICEIC, TrustMark, HIES, ECA',rating:'Rated excellent'},estband:{headline:'See your savings in 20 seconds.',sub:'No forms, no phone calls — just a quick estimate.',btnLabel:'Try the free estimator'},stats:{items:[{n:'1,200+',k:'Installs'},{n:'4.9★',k:'Rated'},{n:'25 yr',k:'Warranty'}]},grid:{eyebrow:'Section',title:'Grid section',cols:3,items:[{icon:'solar',title:'Item one',desc:'Description.'},{icon:'battery',title:'Item two',desc:'Description.'},{icon:'ev',title:'Item three',desc:'Description.'}]},split:{lIcon:'home',lt:'For your home',ld:'Text.',lb:['Point one','Point two'],lc:'Home quote',rIcon:'building',rt:'For your business',rd:'Text.',rb:['Point one','Point two'],rc:'Business quote'},media:{img:'',side:'right',eyebrow:'Why us',title:'Image + text',text:'A benefit paired with a photo.',cta:'Learn more',ctaDisabled:false,textWide:false},testi:{eyebrow:'Real customers',title:'Trusted across South Wales',footnote:'Illustrative testimonials — replace with your real Google & Trustpilot reviews.',speed:36,items:[{stars:5,quote:'Neat, tidy and genuinely no pressure. Our bills have dropped massively and the app makes it easy to see.',name:'Sarah M.',loc:'Cardiff · Solar + battery'},{stars:5,quote:'From survey to switch-on they were spot on.',name:'David R.',loc:'Swansea · Solar PV'},{stars:5,quote:'Straight answers, proper ROI figures.',name:'Gareth L.',loc:'Newport · Commercial'}]},banner:{heading:'Trusted technology we install'},form:{heading:'Book your free survey',sub:'No obligation.',btn:'Send',pulse:false,fName:true,fEmail:true,fPhone:true,fPost:false,fMsg:true},cta:{headline:'Ready to start?',sub:'Book a free survey.',btn:'Get a quote',pulse:false},faq:{eyebrow:'Good to know',title:'Your questions, answered',anchor:'faq',items:[{q:'A question?',a:'An answer.'},{q:'Another?',a:'Another answer.'}]},rich:{html:'<p>Rich text paragraph…</p>'},footer:footerDefaults()};
Object.assign(SAMPLES,EXTRA_DEFAULTS);
function popAt(elm,title,inner){let pop=document.getElementById('tplpop');if(!pop){pop=document.createElement('div');pop.id='tplpop';document.body.appendChild(pop);}
 pop.style.cssText='position:fixed;z-index:300;width:320px;background:var(--paper);border:1px solid var(--ink);border-radius:4px;box-shadow:0 20px 50px -20px rgba(0,0,0,.5);overflow:hidden;pointer-events:none';
 const r=elm.getBoundingClientRect();pop.style.left=Math.min(r.right+10,window.innerWidth-336)+'px';pop.style.top=Math.max(10,Math.min(r.top-20,window.innerHeight-320))+'px';
 pop.innerHTML='<div style="font-family:var(--mono);font-size:.55rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);padding:7px 10px;border-bottom:1px solid var(--line);background:var(--paper-2)">'+title+'</div><div style="height:260px;overflow:hidden"><div style="width:1160px;transform:scale(.276);transform-origin:top left">'+inner+'</div></div>';}
function sectionPrev(t,elm){popAt(elm,'Preview · '+BLOCKNAMES[t],renderBlock({t,p:SAMPLES[t]||{}}));}
/* ===== case studies ===== */
const CASE_TEMPLATES=[
 {name:'Residential case study',theme:'light',desc:'Home project — savings & story',build:()=>{const U=()=>uid();return[
   {id:U(),t:'hero',p:{eyebrow:'Case study · Cardiff',headline:'How the Jones family cut their bills by £1,400 a year',sub:'A 4-bed home fitted with 6.4 kWp of solar and a 10 kWh battery.',dark:true,ctaLabel:'Get my free quote',ctaPulse:true,cta2:''}},
   {id:U(),t:'stats',p:{items:[{n:'6.4 kWp',k:'System size'},{n:'£1,400',k:'Saved / year'},{n:'~5 yrs',k:'Payback'},{n:'72%',k:'Self-supplied'}]}},
   {id:U(),t:'media',p:{img:'',side:'right',eyebrow:'The brief',title:'A busy family home with high daytime use',text:'Describe the customer situation, goals and any constraints here.',cta:''}},
   {id:U(),t:'media',p:{img:'',side:'left',eyebrow:'The result',title:'Neat install, tidy cabling, switched on in a day',text:'Add before/after or drone photos and the outcome in the client\'s words.',cta:''}},
   {id:U(),t:'testi',p:{speed:36,items:[{stars:5,quote:'From survey to switch-on it was faultless. Bills dropped straight away.',name:'The Jones family',loc:'Cardiff'}]}},
   {id:U(),t:'cta',p:{headline:'Want results like these?',sub:'Book a free, no-obligation survey.',btn:'Get my free quote',pulse:true}}
 ];}},
 {name:'Commercial case study',theme:'dark',desc:'B2B project — ROI & scope (dark)',build:()=>{const U=()=>uid();return[
   {id:U(),t:'hero',p:{eyebrow:'Case study · Newport',headline:'55 kWp rooftop array powering a Newport warehouse',sub:'Cutting grid demand at peak hours with a 3.8-year payback.',dark:true,ctaLabel:'Book a commercial assessment',ctaPulse:true,cta2:''}},
   {id:U(),t:'stats',p:{items:[{n:'55 kWp',k:'Installed'},{n:'3.8 yrs',k:'Payback'},{n:'42 t',k:'CO₂ / yr saved'},{n:'£11k',k:'Annual saving'}]}},
   {id:U(),t:'media',p:{img:'',side:'right',eyebrow:'The site',title:'A large, south-facing warehouse roof',text:'Explain the load profile, roof survey and structural considerations.',cta:''}},
   {id:U(),t:'grid',p:{eyebrow:'What we did',title:'Scope of works',cols:3,fill:'contact',items:[{icon:'solar',title:'Design & DNO',desc:'Full MCS design and grid application.'},{icon:'wrench',title:'Install',desc:'Non-intrusive, minimal downtime.'},{icon:'monitor',title:'Monitoring',desc:'Live performance dashboard.'}]}},
   {id:U(),t:'cta',p:{headline:'Turn your roof into lower running costs',sub:'Free commercial assessment with ROI modelled for your site.',btn:'Book an assessment',pulse:true}}
 ];}},
 {name:'Before & after',theme:'light',desc:'Photo-led transformation (image)',build:()=>{const U=()=>uid();return[
   {id:U(),t:'hero',p:{eyebrow:'Case study',headline:'Before & after: a rooftop transformed',sub:'A photo-led look at one of our recent installs.',dark:true,ctaLabel:'Get my free quote',ctaPulse:true,cta2:''}},
   {id:U(),t:'media',p:{img:'',side:'left',eyebrow:'Before',title:'The starting point',text:'Add the “before” photo and the challenge.',cta:''}},
   {id:U(),t:'media',p:{img:'',side:'right',eyebrow:'After',title:'The finished install',text:'Add the “after” photo and the outcome.',cta:''}},
   {id:U(),t:'stats',p:{items:[{n:'0',k:'Days disruption'},{n:'100%',k:'Tidy finish'},{n:'5★',k:'Customer rating'}]}},
   {id:U(),t:'cta',p:{headline:'Your project could be next',sub:'Book a free survey today.',btn:'Get my free quote',pulse:true}}
 ];}}
];
function caseSection(){return '<div class="ph" style="margin-top:22px">'+SPARK+'Case studies</div><div class="hint">Press add, pick a template, then edit it like any page.</div><button class="addbtn" onclick="openCaseModal()">+ Add case study</button>';}
function openCaseModal(){document.getElementById('modalbox').innerHTML='<button class="close" onclick="closeModal()">×</button><h2>Choose a case-study template</h2><p>Pick a layout — hover to preview, click to create. Everything is editable after.</p><div class="tplgrid" style="margin-top:14px">'+CASE_TEMPLATES.map((c,i)=>'<button class="tpl" onmouseenter="casePrev('+i+',this)" onmouseleave="tplHide()" onclick="makeCase('+i+')"><span><b>'+c.name+'</b><div class="d">'+c.desc+'</div></span><span class="go">Use →</span></button>').join('')+'</div>';document.getElementById('modal').classList.add('show');}
function casePrev(i,elm){popAt(elm,'Preview · '+CASE_TEMPLATES[i].name,CASE_TEMPLATES[i].build().map(renderBlock).join(''));}
function makeCase(i){tplHide();closeModal();const b=CASE_TEMPLATES[i].build();var name=uniquePageTitle(CASE_TEMPLATES[i].name);var slug=uniquePageSlug(titleToSlug(name));STATE.pages.push({id:uid(),name:name,slug:slug,type:'casestudy',seo:{slug:slug},theme:CASE_TEMPLATES[i].theme,blocks:b});STATE.current=STATE.pages.length-1;SEL=null;MODE='edit';setMode();renderAll();save();syncCmsUrl(false);}

/* ===== dashboard / editor modes ===== */
var MODE='dash';
function setMode(){var m=MODE;
 var main=document.querySelector('.main');if(main)main.style.display=m==='edit'?'grid':'none';
 var dash=document.getElementById('dashboard');if(dash)dash.style.display=m==='dash'?'block':'none';
 var lib=document.getElementById('library');if(lib)lib.style.display=m==='library'?'block':'none';
 var an=document.getElementById('analytics');if(an)an.style.display=m==='analytics'?'block':'none';
 var eq=document.getElementById('enquiries');if(eq)eq.style.display=m==='enq'?'block':'none';
 var lg=document.getElementById('logoslib');if(lg)lg.style.display=m==='logos'?'block':'none';
 var me=document.getElementById('megaedit');if(me)me.style.display=m==='mega'?'block':'none';
 var tb=document.getElementById('cmsToolbar');if(tb)tb.classList.toggle('toolbar--edit',m==='edit');
 var et=document.getElementById('editorTools');if(et)et.style.display=m==='edit'?'flex':'none';
 var crumb=document.getElementById('toolbarCrumb');if(crumb)crumb.style.display=m==='edit'?'flex':'none';
 var pp=document.getElementById('btnPublishPreview');if(pp)pp.style.display=m==='edit'?'':'none';
 closeToolbarMore();
 renderToolbarPageType();}
function goDash(skipUrl){MODE='dash';setMode();renderDashboard();startLeadsPoll();pollLeadsOnce();if(!skipUrl)syncCmsUrl(false);}
function editPage(i){STATE.current=+i;SEL=null;MODE='edit';setMode();renderAll();tab('build');syncCmsUrl(false);}
function editTab(t){MODE='edit';setMode();renderAll();tab(t);}
function delPage(i){
  i=+i;
  var pg=STATE.pages[i];
  if(!pg)return;
  if(STATE.pages.length<=1){
    openNoticeModal({
      title:"Can't delete this page",
      message:'Your site needs at least one page. Create another page before removing this one.'
    });
    return;
  }
  var secs=(pg.blocks||[]).length;
  var slug=pg.slug||(pg.seo&&pg.seo.slug)||'';
  openConfirmModal({
    title:'Delete page?',
    message:'Are you sure you want to delete this page? This cannot be undone.',
    label:'Page to remove',
    targetHtml:'<div class="modal-confirm-target"><span class="nm">'+esc(pg.name||'Untitled')+'</span><span class="ty">'+esc(slug?'/'+String(slug).replace(/^\//,'') : secs+' sec')+'</span></div>',
    confirmLabel:'Delete page',
    action:function(){doDelPage(i);}
  });
}
function doDelPage(i){
  i=+i;
  if(STATE.pages.length<=1||!STATE.pages[i]){closeModal();return;}
  closeModal();
  STATE.pages.splice(i,1);
  if(STATE.current>=STATE.pages.length)STATE.current=STATE.pages.length-1;
  renderDashboard();
  save();
}
function dashNewPage(){var name=uniquePageTitle('Untitled page');var slug=uniquePageSlug(titleToSlug(name));STATE.pages.push({id:uid(),name:name,slug:slug,type:'page',seo:{slug:slug},blocks:[{id:uid(),t:'hero',p:{eyebrow:'New page',headline:'Your headline here',sub:'Start building — add sections from the left.',dark:true,ctaLabel:'Get a quote',ctaPulse:false,cta2:''}}]});editPage(STATE.pages.length-1);save();}
async function makeBlogArticle(){
 try{
  var r=await fetch('/api/blog/create-page',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({placeholder:true})});
  var d=await r.json().catch(function(){return {};});
  if(!r.ok)throw new Error(d.error||'Could not create blog article');
  location.href=d.editPath||('/admin'+(d.slug||''));
 }catch(e){openNoticeModal({title:'Could not create article',message:(e&&e.message)||'Could not create blog article'});}
}
function renderDashboard(){var el=document.getElementById('dashboard');if(!el)return;
 var h='<div class="dash-wrap"><div class="dash-head"><h1>Dashboard</h1><p>Your whole site at a glance. Open a page to edit it, or create something new.</p></div>';
 h+=dashStatsHtml();
 h+='<div class="dash-sec-h">'+SPARK+'Create</div><div class="dash-actions">'+
   '<button class="dact dact-icon" onclick="dashNewPage()"><span class="dact-ic">'+icon('home',22)+'</span><b>+ New page</b><span>Start from a blank canvas</span></button>'+
   '<button class="dact dact-icon" onclick="openGallery(\'landing\')"><span class="dact-ic">'+icon('target',22)+'</span><b>+ Landing page</b><span>15 campaign templates</span></button>'+
   '<button class="dact dact-icon" onclick="openGallery(\'case\')"><span class="dact-ic">'+icon('building',22)+'</span><b>+ Case study</b><span>3 layouts, scrollable previews</span></button>'+
   '<button class="dact dact-icon" onclick="openGallery(\'template\')"><span class="dact-ic">'+icon('grant',22)+'</span><b>+ From template</b><span>Your saved layouts</span></button></div>';
 h+='<div id="dash-pages-sec" class="dash-panel"><div class="dash-sec-h" id="dash-pages-h">'+SPARK+'Website pages ('+sitePageCount()+')</div>';
 h+='<div class="hint" style="margin:-6px 0 12px">AI blogs are listed on <a href="/admin/blog">/admin/blog</a> — not mixed here.</div>';
 h+='<div class="dash-pages-toolbar"><div class="dash-search"><input id="dash-page-search" type="search" placeholder="Search by title or path…" value="'+esc(DASH_PAGE_SEARCH)+'" oninput="dashPageSearch(this.value)"><button type="button" class="dash-search-clear" id="dash-search-clear" style="display:'+(DASH_PAGE_SEARCH?'inline-flex':'none')+'" onclick="dashClearSearch()" title="Clear search">×</button></div><div class="dash-toolbar-filters">'+dashPageFilterHtml()+'</div></div>';
 h+='<div class="dash-grid" id="dash-pages-grid"></div><div id="dash-pages-pager"></div></div>';
 h+=leadsCard();
 h+='<div class="dash-sec-h">'+SPARK+'Site &amp; admin</div><div class="dash-actions">'+
   '<button class="dact" onclick="showLibrary()"><b>Image library</b><span>Media, categorise &amp; filter</span></button>'+
   '<button class="dact" onclick="showLogos()"><b>Brand logos</b><span>Manufacturer banner library</span></button>'+
   '<button class="dact" onclick="showMega()"><b>Mega menu</b><span>Edit top-level items &amp; columns</span></button>'+
   '<a class="dact" href="/admin/blog" style="text-decoration:none"><b>Blog</b><span>AI fills fixed article template</span></a>'+
   '<a class="dact" href="/admin/analytics" style="text-decoration:none"><b>Analytics</b><span>Umami traffic &amp; engagement</span></a>'+
   '<a class="dact" href="/admin/analytics/heatmap" style="text-decoration:none"><b>Click heatmap</b><span>Free heatmap.js page overlay</span></a></div>';
 h+='</div>';el.innerHTML=h;
 renderDashPages();
}
/* scrollable-preview gallery for landing + case study creation */
function openGallery(kind){
 var items = kind==='landing' ? CAMPAIGNS.map(function(c,i){return {title:c[0],desc:c[1]+' · '+TPL_LABEL[TEMPLATE_MAP[i]],blocks:landingBlocks(c,TEMPLATE_MAP[i]),theme:THEME_BY_TPL[TEMPLATE_MAP[i]]};}) : kind==='template' ? (STATE.templates||[]).map(function(t){return {title:t.name,desc:'Your saved layout',blocks:t.blocks,theme:t.theme};}) : CASE_TEMPLATES.map(function(c){return {title:c.name,desc:c.desc,blocks:c.build(),theme:c.theme};});
 if(kind==='template'&&!items.length){var g0=document.getElementById('gallery');g0.innerHTML='<div class="gal-head"><h2>No saved templates yet</h2><button class="close" onclick="closeGallery()">×</button></div><div style="max-width:600px;margin:40px auto;color:var(--paper);text-align:center;font-family:var(--body)">Open any page in the editor and click <b>Save as template</b> to reuse its layout here.</div>';g0.classList.add('show');return;}
 var h='<div class="gal-head"><h2>'+(kind==='landing'?'Choose a landing template':'Choose a case-study template')+'</h2><button class="close" onclick="closeGallery()">×</button></div><div class="gal-grid">';
 items.forEach(function(it,i){h+='<div class="gal-card"><div class="gal-prev"><div class="zi'+(it.theme==='dark'?' dk':'')+'">'+it.blocks.map(renderBlock).join('')+'</div></div><div class="gal-foot"><div><b>'+esc(it.title)+'</b><span>'+esc(it.desc)+'</span></div><button class="tbtn solar" style="color:var(--ink)" onclick="galPick(\''+kind+'\','+i+')">Use this →</button></div></div>';});
 h+='</div>';var g=document.getElementById('gallery');g.innerHTML=h;g.classList.add('show');
}
function closeGallery(){document.getElementById('gallery').classList.remove('show');}
function galPick(kind,i){closeGallery();if(kind==='landing')makeLanding(i);else if(kind==='template')makeFromTemplate(i);else makeCase(i);}

/* ===== interests, leads, admin views ===== */
var INTERESTS=[['solar','Solar PV Installation'],['battery','Battery Storage'],['heatpump','Infrared Heating'],['led','LED Lighting'],['users','Consultation & Advisory'],['coin','Funding & Grants']];
var LIVE_LEADS=null;
var LIVE_LEADS_ERR='';
var LIVE_LEADS_LOADING=false;
var LIVE_LEADS_SIG='';
var LEADS_POLL=null;
function leads(){return LIVE_LEADS||[];}
function newCount(){return leads().filter(function(l){return l.isnew||l.status==='New'}).length;}
function leadsSig(list){return (list||[]).map(function(l){return l.id+':'+(l.status||'')}).join('|');}
function loadLeads(){
 if(LIVE_LEADS_LOADING)return LIVE_LEADS_LOADING;
 LIVE_LEADS_LOADING=fetch('/api/enquiries',{credentials:'same-origin',cache:'no-store'})
  .then(function(r){if(!r.ok)throw new Error(r.status===401?'Sign in required':'Failed to load enquiries');return r.json();})
  .then(function(d){LIVE_LEADS=d.leads||[];LIVE_LEADS_ERR='';return LIVE_LEADS;})
  .catch(function(e){LIVE_LEADS_ERR=(e&&e.message)||'Failed to load';LIVE_LEADS=LIVE_LEADS||[];return LIVE_LEADS;})
  .finally(function(){LIVE_LEADS_LOADING=false;});
 return LIVE_LEADS_LOADING;
}
function refreshLeadsUI(){
 if(MODE==='enq')renderEnquiries();
 if(MODE==='dash')renderDashboard();
}
function pollLeadsOnce(){
 loadLeads().then(function(list){
  var sig=leadsSig(list)+(LIVE_LEADS_ERR||'');
  if(sig===LIVE_LEADS_SIG)return;
  LIVE_LEADS_SIG=sig;
  refreshLeadsUI();
 });
}
function startLeadsPoll(){
 if(LEADS_POLL)return;
 pollLeadsOnce();
 LEADS_POLL=setInterval(function(){
  if(document.hidden)return;
  if(MODE!=='dash'&&MODE!=='enq')return;
  pollLeadsOnce();
 },8000);
}
document.addEventListener('visibilitychange',function(){if(!document.hidden&&(MODE==='dash'||MODE==='enq'))pollLeadsOnce();});
function leadsCard(){var L=leads();var nc=newCount();
 if(!LIVE_LEADS&&!LIVE_LEADS_ERR){loadLeads().then(function(){LIVE_LEADS_SIG=leadsSig(LIVE_LEADS);refreshLeadsUI();});startLeadsPoll();return '<div class="dash-sec-h">'+SPARK+'Leads &amp; form submissions</div><div class="leads-card"><div class="leads-h"><b>Recent enquiries</b><span style="font-family:var(--mono);font-size:.62rem;color:var(--muted);margin-left:auto">Loading…</span></div></div>';}
 startLeadsPoll();
 var rows=L.slice(0,3).map(function(l,i){return '<div class="lead-row" onclick="openLead('+i+')"><span class="lead-dot'+(l.isnew||l.status==='New'?' new':'')+'"></span><div class="lr-main"><b>'+esc(l.name)+'</b><span>'+esc(l.town)+' · '+esc(l.sector)+' · via '+esc(l.src)+'</span></div><div class="lr-int">'+(l.interests||[]).slice(0,4).map(function(k){return icon(k,16)}).join('')+'</div><div class="lr-t">'+esc(l.time)+'</div></div>';}).join('');
 return '<div class="dash-sec-h">'+SPARK+'Leads &amp; form submissions</div><div class="leads-card'+(nc?' hot':'')+'"><div class="leads-h"><b>Recent enquiries</b><a class="tbtn2" style="padding:4px 9px;margin-left:auto;text-decoration:none" href="/admin/enquiries">Manage all →</a>'+(LIVE_LEADS_ERR?'<span style="font-family:var(--mono);font-size:.62rem;color:#b4462f">'+esc(LIVE_LEADS_ERR)+'</span>':(nc?'<span class="newbadge">'+nc+' new</span>':'<span style="font-family:var(--mono);font-size:.62rem;color:var(--muted)">all read</span>'))+'</div>'+(rows||'<div style="padding:14px;color:var(--muted);font-size:.85rem">No enquiries yet — submissions from the contact form appear here.</div>')+'</div>';
}
function mapXY(l){if(typeof l.lat!=='number'||typeof l.lng!=='number')return null;var x=(l.lng-(-4.35))/((-2.65)-(-4.35));var y=1-((l.lat-51.30)/(51.75-51.30));return {x:Math.max(.06,Math.min(.94,x))*100,y:Math.max(.12,Math.min(.9,y))*100};}
function osmEmbed(lat,lng){var d=0.035;var left=lng-d,right=lng+d,top=lat+d*0.7,bottom=lat-d*0.7;return 'https://www.openstreetmap.org/export/embed.html?bbox='+left+'%2C'+bottom+'%2C'+right+'%2C'+top+'&layer=mapnik&marker='+lat+'%2C'+lng;}
function openLead(i){var l=leads()[i];if(!l)return;l.isnew=false;
 var hasGeo=typeof l.lat==='number'&&typeof l.lng==='number';
 var mapBlock=hasGeo
  ?('<div class="lead-map lead-map-osm"><iframe title="Map" src="'+osmEmbed(l.lat,l.lng)+'" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe><div class="lead-map-label">'+esc(l.town||'')+(l.postcode?' · '+esc(l.postcode):'')+'</div></div>')
  :('<div class="lead-meta" style="margin-top:10px"><div><span>Postcode</span>'+esc(l.postcode||l.town||'—')+'</div><div><span>Source</span>'+esc(l.src)+'</div></div>');
 var ints=INTERESTS.map(function(it){var on=(l.interests||[]).indexOf(it[0])>=0;return '<div class="lead-int '+(on?'on':'off')+'">'+icon(it[0],18)+it[1]+'</div>';}).join('');
 document.getElementById('modalbox').className='modalbox leadbox';
 document.getElementById('modalbox').innerHTML='<button class="close" onclick="closeModal()">×</button><h2>'+esc(l.name)+'</h2><p style="color:var(--muted)">'+esc(l.sector)+(l.org?' · '+esc(l.org):'')+' · via '+esc(l.src)+' · '+esc(l.time)+'</p>'+
  mapBlock+
  '<div class="lead-meta"><div><span>Email</span>'+esc(l.email)+'</div><div><span>Phone</span>'+esc(l.phone||'—')+'</div></div>'+
  '<div style="font-family:var(--mono);font-size:.6rem;letter-spacing:.05em;text-transform:uppercase;color:var(--amber-2);margin-bottom:6px">Interested in</div><div class="lead-int-grid">'+ints+'</div>'+
  '<div style="font-family:var(--mono);font-size:.6rem;letter-spacing:.05em;text-transform:uppercase;color:var(--amber-2);margin:14px 0 6px">Message</div><p style="font-size:.9rem;line-height:1.5">'+(l.msg?esc(l.msg):'<span style="color:var(--muted)">No message</span>')+'</p>'+
  '<div style="display:flex;gap:8px;margin-top:16px"><a class="tbtn solar" style="color:var(--ink);text-decoration:none" href="mailto:'+esc(l.email)+'">Reply by email</a>'+(l.phone?'<a class="tbtn" style="color:var(--ink);border-color:var(--line);text-decoration:none" href="tel:'+esc(l.phone.replace(/\s/g,''))+'">Call</a>':'')+'</div>';
 document.getElementById('modal').classList.add('show');
 if(MODE==='dash')renderDashboard();
}
/* ===== standalone image library ===== */
function showLibrary(){applyCmsView('library');}
function renderLibrary(){var el=document.getElementById('library');var imgs=STATE.site.images||[];var cats=[];imgs.forEach(function(im){if(im.cat&&cats.indexOf(im.cat)<0)cats.push(im.cat)});
 var h='<div class="adm-wrap"><div class="adm-h"><div><h1>Media library</h1><p>'+imgs.length+' items · auto-converted to WebP. Upload once, then add SEO per section when you use an image.</p></div><div><label class="tbtn2" style="cursor:pointer">+ Upload<input type="file" accept="image/*" multiple style="display:none" onchange="imgUpload(this)"></label></div></div>';
 h+='<div class="dash-actions" style="margin-bottom:16px"><select onchange="IMGFILTER=this.value;renderLibrary()" style="padding:8px 10px;border:1px solid var(--line);border-radius:3px;background:var(--card);max-width:260px"><option value="">All categories ('+imgs.length+')</option>'+cats.map(function(c){return '<option'+(IMGFILTER===c?' selected':'')+'>'+esc(c)+'</option>'}).join('')+'</select></div>';
 var shown=imgs.map(function(im,i){return {im:im,i:i}}).filter(function(x){return !IMGFILTER||x.im.cat===IMGFILTER});
 h+=shown.length?'<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px">'+shown.map(function(o){var im=o.im;return '<div style="border:1px solid var(--line);border-radius:3px;overflow:hidden"><img src="'+im.data+'" style="width:100%;height:100px;object-fit:cover;display:block"><div style="padding:5px 7px;font-size:.68rem;color:var(--muted);border-top:1px solid var(--line);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+(im.name?esc(im.name):'Image')+(im.cat?' · '+esc(im.cat):'')+'</div><button class="rm" style="margin:4px 7px 6px" onclick="imgRmAsk('+o.i+')">Remove</button></div>';}).join('')+'</div>':'<div class="honest">No images yet. Click <b>+ Upload</b> to add some.</div>';
 h+='</div>';el.innerHTML=h;
}
/* ===== analytics + SEO ===== */
var SEO_KW=[['solar panels cardiff',3,'Google',1420,118,'+2'],['battery storage wales',6,'Google',910,44,'+4'],['commercial solar newport',4,'Google',680,59,'-1'],['solar grants wales',7,'Google',540,28,'+6'],['infrared heating wales',9,'Bing',260,11,'new'],['smart export guarantee wales',5,'Google',330,19,'+3'],['led lighting upgrade cardiff',8,'Google',210,9,'+1'],['housing association solar',6,'Google',180,12,'+2']];
function showAnalytics(){MODE='analytics';setMode();renderAnalytics();syncCmsUrl(false);}
function renderAnalytics(){var el=document.getElementById('analytics');
 var days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],vals=[280,340,410,390,520,300,278];var mx=Math.max.apply(null,vals);
 var pages=[['/ (Home)',5210,'2m 14s','68%','1.9%'],['/lp/ppa-power-purchase',1840,'1m 52s','74%','3.2%'],['/commercial',1420,'2m 41s','61%','2.1%'],['/estimator',980,'3m 06s','82%','5.4%'],['/case-study/...',540,'2m 22s','70%','1.4%']];
 var h='<div class="adm-wrap"><div class="adm-h"><div><h1>Analytics &amp; SEO</h1><p>Traffic, engagement and search performance for heliaxis.co.uk.</p></div></div>';
 h+='<div class="honest"><b>Sample data.</b> Wire up <b>Plausible</b> or <b>GA4</b> for traffic &amp; engagement, and <b>Google Search Console</b> (+ Bing Webmaster) for the SEO rankings below — I can connect these on deploy.</div>';
 h+='<div class="metrics">'+
   [['24,180','Page views (30d)','up','+12%'],['9,420','Unique visitors','up','+8%'],['2m 21s','Avg. time on page','up','+6s'],['71%','Avg. scroll depth','up','+4%'],['1,940','Interactions / clicks','up','+15%'],['2.4%','Lead conversion','dn','-0.2%']].map(function(m){return '<div class="metric"><div class="n">'+m[0]+'</div><div class="k">'+m[1]+'</div><div class="d '+m[2]+'">'+m[3]+'</div></div>';}).join('')+'</div>';
 h+='<div class="panelcard"><h3>Page views · last 7 days</h3><div class="bars">'+vals.map(function(v,i){return '<div class="bar" style="height:'+(v/mx*100)+'%"><span>'+days[i]+'</span></div>';}).join('')+'</div></div>';
 h+='<div class="panelcard"><h3>Top pages — engagement</h3><table class="tbl"><thead><tr><th>Page</th><th>Views</th><th>Avg time</th><th>Scroll</th><th>Conv.</th></tr></thead><tbody>'+pages.map(function(p){return '<tr><td>'+p[0]+'</td><td>'+p[1].toLocaleString()+'</td><td>'+p[2]+'</td><td>'+p[3]+'</td><td>'+p[4]+'</td></tr>';}).join('')+'</tbody></table></div>';
 h+='<div class="panelcard"><h3>SEO — keywords you\'re ranking for</h3><table class="tbl"><thead><tr><th>Keyword</th><th>Position</th><th>Engine</th><th>Impressions</th><th>Clicks</th><th>Change</th></tr></thead><tbody>'+SEO_KW.map(function(k){var ch=k[5];var col=ch.indexOf('-')===0?'#b4462f':(ch==='new'?'var(--amber-2)':'var(--ok)');return '<tr style="cursor:pointer" onclick="openKeyword('+SEO_KW.indexOf(k)+')"><td><b>'+k[0]+'</b></td><td class="pos">#'+k[1]+'</td><td>'+k[2]+'</td><td>'+k[3].toLocaleString()+'</td><td>'+k[4]+'</td><td style="color:'+col+';font-weight:600">'+ch+' ›</td></tr>';}).join('')+'</tbody></table></div>';
 h+='<div class="metrics">'+[['48','Pages indexed'],['#5.6','Avg. Google position'],['31,400','Impressions (30d)'],['3.9%','Search CTR']].map(function(m){return '<div class="metric"><div class="n">'+m[0]+'</div><div class="k">'+m[1]+'</div></div>';}).join('')+'</div>';
 h+='</div>';el.innerHTML=h;
}

/* ===== unsaved guard ===== */
var DIRTY=false;
async function forceSave(){await save();}
window.addEventListener('beforeunload',function(e){if(DIRTY){e.preventDefault();e.returnValue='You have unsaved changes.';return e.returnValue;}});
/* ===== mega-menu live preview ===== */
var MENU_PI=0;
function selectMenuPreviewTab(i){ MENU_PI = Number(i); renderMenu(); }
function megaPreview(){var m=(STATE.site&&STATE.site.menu)||[];if(!m.length)return '';if(MENU_PI>=m.length)MENU_PI=0;var sel=m[MENU_PI];
 var nav=m.map(function(t,i){return '<button class="mp-nav'+(i===MENU_PI?' on':'')+'" onclick="selectMenuPreviewTab('+i+')">'+esc(t.label)+'</button>';}).join('');
 var panel=(sel.cols&&sel.cols.length)?sel.cols.map(function(c){return '<div class="mp-col"><div class="mp-ey">'+esc(c.ey)+'</div>'+(c.items||[]).map(function(it){return '<div class="mp-item"><span class="mp-ic">'+icon(it.icon||'solar',15)+'</span>'+esc(it.label)+'</div>';}).join('')+'</div>';}).join('') : '<div style="padding:16px 20px;font-family:var(--mono);font-size:.75rem;color:var(--muted)">Direct link → '+esc(sel.href||sel.page||'')+'</div>';
 return '<div class="mp-prevbox"><div class="mp-label">Live preview · hover a top item</div><div class="mp-bar">'+nav+'</div><div class="mp-panel">'+panel+'</div></div>';
}
/* ===== enquiries + statuses ===== */
var STATUSES=['New','Contacted','Quoted','Won','Lost'];
function setLeadStatus(id,s){
 var l=leads().filter(function(x){return x.id===id})[0];
 if(l){l.status=s;l.isnew=s==='New';}
 renderEnquiries();
 fetch('/api/enquiries',{method:'PATCH',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:id,status:s})})
  .then(function(r){if(!r.ok)throw new Error('status update failed');})
  .catch(function(){loadLeads().then(refreshLeadsUI);});
}
function showEnquiries(){location.href='/admin/enquiries';}
function renderEnquiries(){var el=document.getElementById('enquiries');if(!el)return;var L=leads();
 var counts={};STATUSES.forEach(function(s){counts[s]=0});L.forEach(function(l){counts[l.status]=(counts[l.status]||0)+1});
 var h='<div class="adm-wrap"><div class="adm-h"><div><h1>Enquiries</h1><p>'+(LIVE_LEADS===null?'Loading live leads…':(L.length+' leads · give each a status and track it through the pipeline.'))+'</p></div><button class="tbtn2" onclick="loadLeads().then(refreshLeadsUI)">Refresh</button></div>';
 if(LIVE_LEADS_ERR)h+='<div class="honest" style="margin-bottom:14px"><b>Could not load enquiries.</b> '+esc(LIVE_LEADS_ERR)+'</div>';
 h+='<div class="stat-ov">'+STATUSES.map(function(s){return '<div class="so"><div class="n">'+(counts[s]||0)+'</div><div class="k"><span class="stpill st-'+s+'">'+s+'</span></div></div>';}).join('')+'</div>';
 h+='<div class="panelcard"><table class="tbl enq-tbl"><thead><tr><th>Name</th><th>Location</th><th>Sector</th><th>Interested in</th><th>Received</th><th>Status</th><th></th></tr></thead><tbody>';
 if(LIVE_LEADS===null)h+='<tr><td colspan="7" style="color:var(--muted)">Loading…</td></tr>';
 else if(!L.length)h+='<tr><td colspan="7" style="color:var(--muted)">No enquiries yet. Submissions from the website contact form will appear here and also email hello@heliaxis.co.uk.</td></tr>';
 else h+=L.map(function(l,i){return '<tr><td><b>'+esc(l.name)+'</b><div style="font-size:.72rem;color:var(--muted)">'+esc(l.email)+'</div></td><td>'+esc(l.town)+(l.postcode&&l.postcode!==l.town?'<div style="font-size:.72rem;color:var(--muted)">'+esc(l.postcode)+'</div>':'')+'</td><td>'+esc(l.sector)+'</td><td><div style="display:flex;gap:3px">'+(l.interests||[]).map(function(k){return icon(k,15)}).join('')+'</div></td><td>'+esc(l.time)+'</td><td><select onchange="setLeadStatus(\''+l.id+'\',this.value)">'+STATUSES.map(function(s){return '<option'+(l.status===s?' selected':'')+'>'+s+'</option>'}).join('')+'</select></td><td><button class="tbtn2" style="padding:5px 10px" onclick="openLead('+i+')">View</button></td></tr>';}).join('');
 h+='</tbody></table></div></div>';el.innerHTML=h;
}
/* ===== brand-logo library (standalone, like media) ===== */
function showLogos(){applyCmsView('logos');}
function renderLogosLib(){var el=document.getElementById('logoslib');var L=STATE.site.logos||[];var inb=L.filter(function(l){return l.bnr}).length;
 var h='<div class="adm-wrap"><div class="adm-h"><div><h1>Brand logos</h1><p>'+L.length+' logos · '+inb+' in the manufacturer banner. Tick to add or remove — the banner updates live.</p></div><div><label class="tbtn2" style="cursor:pointer">+ Add logo<input type="file" accept="image/*" style="display:none" onchange="logoFileAdd(this)"></label></div></div>';
 h+='<div class="libgrid">'+L.map(function(l,i){return '<div class="libcard"><button class="lc-x" onclick="STATE.site.logos.splice('+i+',1);renderLogosLib();save()">×</button><div style="height:90px;display:grid;place-items:center;background:var(--paper-2);border-bottom:1px solid var(--line)">'+(l.img?'<img src="'+l.img+'" style="max-width:80%;max-height:70px">':'<span style="font-family:var(--display);font-weight:800;color:var(--muted)">'+esc(l.name)+'</span>')+'</div><div class="lc-b" style="display:flex;align-items:center;justify-content:space-between;gap:6px"><input value="'+esc(l.name)+'" onchange="STATE.site.logos['+i+'].name=this.value;save()"><label style="font-family:var(--mono);font-size:.54rem;display:flex;align-items:center;gap:3px;white-space:nowrap"><input type="checkbox" '+(l.bnr?'checked':'')+' onchange="STATE.site.logos['+i+'].bnr=this.checked;save()"> banner</label></div></div>';}).join('')+'</div></div>';
 el.innerHTML=h;
}
function logoFileAdd(inp){var f=inp.files[0];if(!f)return;var r=new FileReader();r.onload=function(){toWebp(r.result,function(w){STATE.site.logos.push({id:uid(),name:f.name.replace(/\.[^.]+$/,''),img:w,bnr:true});renderLogosLib();save();});};r.readAsDataURL(f);}
/* ===== keyword history ===== */
function openKeyword(i){var k=SEO_KW[i];var base=k[1];var wks=8;var series=[];var pos=base+ (k[5].indexOf('-')===0?2:(k[5]==='new'?4:3));for(var w=0;w<wks;w++){pos=Math.max(1,Math.round(pos-((pos-base)/(wks-1))+ (Math.random()*1.4-0.7)));series.push(pos);}series[wks-1]=base;
 var W=460,H=150,mx=Math.max.apply(null,series)+1,pts=series.map(function(p,ix){return [30+ix*((W-40)/(wks-1)), 10+(p-1)/(mx-1)*(H-30)];});
 var path=pts.map(function(pt,ix){return (ix?'L':'M')+pt[0].toFixed(0)+' '+pt[1].toFixed(0)}).join(' ');
 var dots=pts.map(function(pt){return '<circle cx="'+pt[0].toFixed(0)+'" cy="'+pt[1].toFixed(0)+'" r="3" fill="#F8BC1E"/>'}).join('');
 var labels=series.map(function(p,ix){return '<text x="'+pts[ix][0].toFixed(0)+'" y="'+H+'" font-family="monospace" font-size="9" fill="#6E6A5E" text-anchor="middle">'+(ix===0?'8w':ix===wks-1?'now':'')+'</text>'}).join('');
 document.getElementById('modalbox').className='modalbox';
 document.getElementById('modalbox').innerHTML='<button class="close" onclick="closeModal()">×</button><h2>'+esc(k[0])+'</h2><p style="color:var(--muted)">'+k[2]+' · currently position <b style="color:var(--ink)">#'+base+'</b> · '+k[3].toLocaleString()+' impressions · '+k[4]+' clicks</p>'+
  '<div style="font-family:var(--mono);font-size:.6rem;letter-spacing:.05em;text-transform:uppercase;color:var(--amber-2);margin:16px 0 6px">Position history (lower is better)</div>'+
  '<svg viewBox="0 0 '+W+' '+(H+6)+'" style="width:100%;background:var(--paper-2);border:1px solid var(--line);border-radius:3px"><path d="'+path+'" fill="none" stroke="#F8BC1E" stroke-width="2"/>'+dots+labels+'</svg>'+
  '<p style="font-size:.82rem;color:var(--muted);margin-top:12px">Sample trend. On deploy this reads live from Google Search Console / Bing Webmaster.</p>';
 document.getElementById('modal').classList.add('show');
}
/* ===== save as template + create from template ===== */
function templateNameTaken(name){var k=normTitle(name).toLowerCase();if(!k)return false;return (STATE.templates||[]).some(function(t){return normTitle(t.name).toLowerCase()===k;});}
function saveAsTemplate(){
  closeToolbarMore();
  var box=document.getElementById('modalbox');
  box.className='modalbox';
  if(MODE!=='edit'||!page()){
    box.innerHTML='<button class="close" onclick="closeModal()">×</button>'
      +'<h2>Save as template</h2>'
      +'<p>Open a page in the editor first, then save its layout as a reusable template.</p>'
      +'<div class="modal-actions"><button type="button" class="tbtn solar modal-btn-primary" onclick="closeModal()">OK</button></div>';
    document.getElementById('modal').classList.add('show');
    return;
  }
  var pg=page();
  var defaultName=normTitle(pg.name)+' template';
  var secCount=(pg.blocks||[]).length;
  box.innerHTML='<button class="close" onclick="closeModal()">×</button>'
    +'<h2>Save as template</h2>'
    +'<p>Save this page layout so you can reuse it when creating new pages.</p>'
    +'<p class="modal-note">From <b>'+esc(pg.name)+'</b> · '+secCount+' section'+(secCount===1?'':'s')+'</p>'
    +'<div class="fld"><label for="template-name">Template name</label>'
    +'<input id="template-name" type="text" value="'+esc(defaultName)+'" placeholder="e.g. Commercial landing template" onkeydown="if(event.key===\'Enter\'){event.preventDefault();confirmSaveTemplate()}"></div>'
    +'<div id="template-save-err" class="modal-err" role="alert"></div>'
    +'<div class="modal-actions">'
    +'<button type="button" class="tbtn modal-btn-ghost" onclick="closeModal()">Cancel</button>'
    +'<button type="button" class="tbtn solar modal-btn-primary" onclick="confirmSaveTemplate()">Save template</button>'
    +'</div>';
  document.getElementById('modal').classList.add('show');
  var inp=document.getElementById('template-name');
  if(inp){inp.focus();inp.select();}
}
function confirmSaveTemplate(){
  var inp=document.getElementById('template-name');
  var err=document.getElementById('template-save-err');
  if(!inp)return;
  var name=normTitle(inp.value);
  if(!name){if(err)err.textContent='Please enter a template name.';inp.focus();return;}
  if(templateNameTaken(name)){if(err)err.textContent='A template named “'+name+'” already exists. Choose a different name.';inp.focus();return;}
  STATE.templates=STATE.templates||[];
  STATE.templates.push({id:uid(),name:name,theme:page().theme||'light',blocks:JSON.parse(JSON.stringify(page().blocks))});
  save();
  var box=document.getElementById('modalbox');
  box.innerHTML='<button class="close" onclick="closeModal()">×</button>'
    +'<h2>Template saved</h2>'
    +'<p class="modal-success">“'+esc(name)+'” is ready to reuse.</p>'
    +'<p class="modal-note">Find it on the dashboard under <b>Create → From template</b>.</p>'
    +'<div class="modal-actions"><button type="button" class="tbtn solar modal-btn-primary" onclick="closeModal()">Done</button></div>';
}
function makeFromTemplate(i){var t=(STATE.templates||[])[i];if(!t)return;var b=JSON.parse(JSON.stringify(t.blocks));b.forEach(function(bl){bl.id=uid()});var name=uniquePageTitle(t.name);var slug=uniquePageSlug(titleToSlug(name));STATE.pages.push({id:uid(),name:name,slug:slug,type:'page',seo:{slug:slug},theme:t.theme,blocks:b});STATE.current=STATE.pages.length-1;SEL=null;MODE='edit';setMode();renderAll();save();syncCmsUrl(false);}

/* ===== dedicated mega-menu editor page ===== */
var MEGA_PI=0, MDRAG=null;
/** Common public routes — not always CMS pages, but needed in the header. */
var NAV_LINK_PRESETS=[
  {id:'estimator',label:'Estimator',href:'/solar-estimator'},
  {id:'funding',label:'Funding',href:'/commercial-funding'},
  {id:'faqs',label:'FAQs',href:'/#faq'},
  {id:'contact',label:'Contact',href:'/#quote'},
  {id:'blog',label:'Blog',href:'/blog'},
  {id:'home',label:'Home',href:'/'}
];
/** In-page anchors commonly used by CTAs / buttons. */
var PAGE_ANCHOR_PRESETS=[
  {label:'Quote form',href:'#quote'},
  {label:'Services',href:'#services'},
  {label:'FAQs',href:'#faq'},
  {label:'How it works',href:'#how'}
];
var PHONE_LINK_PRESETS=[
  {label:'Call office',href:'tel:01633965205'}
];
function selectMegaTab(i){ MEGA_PI = Number(i); renderMega(); }
function showMega(){applyCmsView('mega');}
function pageName(slug){var p=STATE.pages.filter(function(x){return x.slug===slug})[0];if(p)return p.name;var pre=NAV_LINK_PRESETS.filter(function(x){return x.href===slug})[0];return pre?pre.label:slug;}
function linkCatalog(){
  var items=[];
  NAV_LINK_PRESETS.forEach(function(p){items.push({group:'Site pages',label:p.label,href:p.href});});
  PAGE_ANCHOR_PRESETS.forEach(function(p){items.push({group:'On this page',label:p.label,href:p.href});});
  PHONE_LINK_PRESETS.forEach(function(p){items.push({group:'Phone',label:p.label,href:p.href});});
  (STATE.pages||[]).forEach(function(p){
    items.push({group:isCmsBlogPage(p)?'Blog articles':'CMS pages',label:p.name||'Untitled',href:p.slug||'/'});
  });
  return items;
}
function linkLabelFor(href){
  if(!href)return 'Choose a link…';
  var hit=linkCatalog().filter(function(x){return x.href===href})[0];
  return hit?hit.label:'Custom path';
}
/** Searchable link picker — sections first, then links inside a section. */
function linkPickHtml(cur, applyExpr){
  var id='lp'+Math.random().toString(36).slice(2,9);
  var shown=cur
    ?'<span class="link-pick-name">'+esc(linkLabelFor(cur))+'</span><span class="link-pick-path">'+esc(cur)+'</span>'
    :'<span class="link-pick-name muted">Choose a link…</span>';
  return '<div class="link-pick'+(cur?' has-val':'')+'" id="'+id+'" data-cur="'+esc(cur||'')+'" data-apply="'+esc(applyExpr)+'" data-section="">'
    +'<button type="button" class="link-pick-btn" onclick="event.stopPropagation();toggleLinkPick(\''+id+'\')">'
    +'<span class="link-pick-val">'+shown+'</span><span class="link-pick-chev" aria-hidden="true">▾</span></button>'
    +'<div class="link-pick-menu" hidden>'
    +'<div class="link-pick-search"><input type="search" placeholder="Search by name or path…" autocomplete="off" onclick="event.stopPropagation()" onkeydown="event.stopPropagation()" oninput="filterLinkPick(\''+id+'\',this.value)"></div>'
    +'<div class="link-pick-nav" hidden></div>'
    +'<div class="link-pick-list" role="listbox"></div>'
    +'<div class="link-pick-foot"><span class="link-pick-hint">Pick a section, then a link</span></div>'
    +'</div></div>';
}
function closeLinkPicks(exceptId){
  document.querySelectorAll('.link-pick').forEach(function(el){
    if(exceptId&&el.id===exceptId)return;
    el.classList.remove('open');
    el.setAttribute('data-section','');
    var menu=el.querySelector('.link-pick-menu');
    if(menu)menu.hidden=true;
  });
}
function toggleLinkPick(id){
  var root=document.getElementById(id);
  if(!root)return;
  var willOpen=!root.classList.contains('open');
  closeLinkPicks(willOpen?id:null);
  if(!willOpen){root.classList.remove('open');root.setAttribute('data-section','');var m=root.querySelector('.link-pick-menu');if(m)m.hidden=true;return;}
  root.classList.add('open');
  root.setAttribute('data-section','');
  var menu=root.querySelector('.link-pick-menu');
  if(menu)menu.hidden=false;
  var inp=root.querySelector('.link-pick-search input');
  if(inp)inp.value='';
  renderLinkPick(id);
  if(inp)setTimeout(function(){inp.focus();},20);
}
function openLinkPickSection(id,sectionOrEl){
  var root=document.getElementById(id);
  if(!root)return;
  var section=sectionOrEl&&sectionOrEl.getAttribute?sectionOrEl.getAttribute('data-section'):sectionOrEl;
  root.setAttribute('data-section',section||'');
  var inp=root.querySelector('.link-pick-search input');
  if(inp)inp.value='';
  renderLinkPick(id);
}
function backLinkPickSections(id){
  openLinkPickSection(id,'');
}
function filterLinkPick(id,q){
  renderLinkPick(id,q);
}
function linkPickGrouped(q){
  q=String(q||'').trim().toLowerCase();
  var groups={};
  var order=[];
  linkCatalog().forEach(function(it){
    var hay=(it.label+' '+it.href).toLowerCase();
    if(q&&hay.indexOf(q)<0)return;
    if(!groups[it.group]){groups[it.group]=[];order.push(it.group);}
    groups[it.group].push(it);
  });
  return {groups:groups,order:order,q:q};
}
function renderLinkPick(id,qOverride){
  var root=document.getElementById(id);
  if(!root)return;
  var list=root.querySelector('.link-pick-list');
  var nav=root.querySelector('.link-pick-nav');
  var foot=root.querySelector('.link-pick-hint');
  if(!list)return;
  var cur=root.getAttribute('data-cur')||'';
  var section=root.getAttribute('data-section')||'';
  var inp=root.querySelector('.link-pick-search input');
  var q=qOverride!=null?String(qOverride):((inp&&inp.value)||'');
  q=q.trim();
  var data=linkPickGrouped(q);
  var groups=data.groups;
  var order=data.order;

  // Searching: flat results across sections (skip section drill-down)
  if(q){
    if(nav){nav.hidden=true;nav.innerHTML='';}
    if(foot)foot.textContent='Search results';
    if(!order.length){
      list.innerHTML='<div class="link-pick-empty">No matches</div>';
      return;
    }
    var sh='';
    order.forEach(function(g){
      sh+='<div class="link-pick-group">'+esc(g)+'</div>';
      groups[g].forEach(function(it){
        var on=it.href===cur?' on':'';
        sh+='<button type="button" class="link-pick-item'+on+'" role="option" data-href="'+esc(it.href)+'" onclick="event.stopPropagation();applyLinkPick(\''+id+'\',this)">'
          +'<span class="link-pick-item-name">'+esc(it.label)+'</span>'
          +'<span class="link-pick-item-path">'+esc(it.href)+'</span></button>';
      });
    });
    list.innerHTML=sh;
    return;
  }

  // Inside a section: show links + back
  if(section){
    if(nav){
      nav.hidden=false;
      nav.innerHTML='<button type="button" class="link-pick-back" onclick="event.stopPropagation();backLinkPickSections(\''+id+'\')"><span aria-hidden="true">←</span> All sections</button>'
        +'<span class="link-pick-nav-title">'+esc(section)+'</span>';
    }
    if(foot)foot.textContent='Links in '+section;
    var items=groups[section]||[];
    // If section has no filtered items (shouldn't happen without q), rebuild without filter
    if(!items.length){
      var full=linkPickGrouped('');
      items=full.groups[section]||[];
    }
    if(!items.length){
      list.innerHTML='<div class="link-pick-empty">No links in this section</div>';
      return;
    }
    var lh='';
    items.forEach(function(it){
      var on=it.href===cur?' on':'';
      lh+='<button type="button" class="link-pick-item'+on+'" role="option" data-href="'+esc(it.href)+'" onclick="event.stopPropagation();applyLinkPick(\''+id+'\',this)">'
        +'<span class="link-pick-item-name">'+esc(it.label)+'</span>'
        +'<span class="link-pick-item-path">'+esc(it.href)+'</span></button>';
    });
    list.innerHTML=lh;
    return;
  }

  // Top level: sections only
  if(nav){nav.hidden=true;nav.innerHTML='';}
  if(foot)foot.textContent='Pick a section, then a link';
  var all=linkPickGrouped('');
  if(!all.order.length){
    list.innerHTML='<div class="link-pick-empty">No pages available</div>';
    return;
  }
  var ch='';
  all.order.forEach(function(g){
    var n=all.groups[g].length;
    var hasCur=all.groups[g].some(function(it){return it.href===cur;});
    ch+='<button type="button" class="link-pick-section'+(hasCur?' has-cur':'')+'" data-section="'+esc(g)+'" onclick="event.stopPropagation();openLinkPickSection(\''+id+'\',this)">'
      +'<span class="link-pick-section-main">'
      +'<span class="link-pick-section-name">'+esc(g)+'</span>'
      +'<span class="link-pick-section-meta">'+n+' link'+(n===1?'':'s')+(hasCur?' · current':'')+'</span>'
      +'</span><span class="link-pick-section-chev" aria-hidden="true">›</span></button>';
  });
  list.innerHTML=ch;
}
function applyLinkPick(id,el){
  var href=el&&el.getAttribute?el.getAttribute('data-href'):el;
  var root=document.getElementById(id);
  var apply=root?root.getAttribute('data-apply'):'';
  closeLinkPicks();
  if(!apply||href==null)return;
  try{
    if(apply.indexOf('setTopPage(')===0){
      var mi=Number(apply.replace(/^setTopPage\(|\)$/g,''));
      setTopPage(mi,href);
    }else if(apply.indexOf('setMenuPage(')===0){
      var parts=apply.replace(/^setMenuPage\(|\)$/g,'').split(',');
      setMenuPage(Number(parts[0]),Number(parts[1]),Number(parts[2]),href);
    }else if(apply.indexOf('setFeatCta(')===0){
      var fi=Number(apply.replace(/^setFeatCta\(|\)$/g,''));
      setFeatCta(fi,href);
    }else if(apply.indexOf('upd(')===0){
      var um=apply.match(/^upd\('([^']+)'\)$/);
      if(um)upd(um[1],href);
    }
  }catch(e){console.error(e);}
}
function setFeatCta(mi,v){featOf(STATE.site.menu[mi]).ctaPage=v;renderMega();save();}
function navHasLabel(lbl){
  var want=String(lbl||'').toLowerCase();
  return (STATE.site.menu||[]).some(function(m){return String(m.label||'').toLowerCase()===want;});
}
/** Add a top-level direct link (e.g. Estimator → /solar-estimator). */
function addNavPreset(id){
  var p=NAV_LINK_PRESETS.filter(function(x){return x.id===id})[0];
  if(!p)return;
  if(navHasLabel(p.label)){
    var idx=(STATE.site.menu||[]).findIndex(function(m){return String(m.label||'').toLowerCase()===p.label.toLowerCase();});
    if(idx>=0){
      var m=STATE.site.menu[idx];
      m.megaEnabled=false;
      m.href=p.href;
      m.page=p.href;
      selectMegaTab(idx);
      save();
    }
    return;
  }
  STATE.site.menu.push({label:p.label,megaEnabled:false,page:p.href,href:p.href,cols:[]});
  selectMegaTab(STATE.site.menu.length-1);
  save();
}
function featOf(m){if(!m.featured)m.featured={img:'',title:'Book a free survey',text:'No obligation, no pushy sales — just honest advice.',cta:'Get a quote',ctaPage:'',bg:'dark'};if(!m.featured.bg)m.featured.bg='dark';return m.featured;}
function megaOn(m){return m.megaEnabled===true || (m.megaEnabled!==false && Array.isArray(m.cols) && m.cols.length > 0);}
function setMenuIcon(mi,ci,ii,v){STATE.site.menu[mi].cols[ci].items[ii].icon=v;renderMega();save();}
function setMenuPage(mi,ci,ii,v){var it=STATE.site.menu[mi].cols[ci].items[ii];it.page=v;it.href=v;renderMega();save();}
function setMenuLabel(mi,ci,ii,v){STATE.site.menu[mi].cols[ci].items[ii].label=v;renderMega();save();}
function setMenuDesc(mi,ci,ii,v){STATE.site.menu[mi].cols[ci].items[ii].desc=v;renderMega();save();}
function toggleMega(mi,v){var m=STATE.site.menu[mi];m.megaEnabled=v;if(v&&(!m.cols||!m.cols.length))m.cols=[{ey:'Column',items:[{icon:'solar',label:'Item',page:''}]}];renderMega();save();}
function setTopPage(mi,v){STATE.site.menu[mi].page=v;STATE.site.menu[mi].href=v;renderMega();save();}
function setFeatBg(mi,v){featOf(STATE.site.menu[mi]).bg=v;renderMega();save();}
/** Save draft then publish so the public Header (Solar & Battery, Business, …) updates. */
async function publishMegaMenu(){
  var status=document.getElementById('megaPubStatus');
  if(status){status.style.color='var(--muted)';status.textContent='Saving & publishing menu…';}
  try{
    await save();
    // Send live STATE so draft-only publish still updates the published menu.
    var r=await fetch('/api/cms/publish',{
      method:'POST',
      credentials:'same-origin',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({state:STATE})
    });
    if(!r.ok){
      var em='Publish failed';
      try{em=(await r.json()).error||em;}catch(e){}
      if(r.status===401)throw new Error('Sign in as an approved admin to publish.');
      throw new Error(em);
    }
    if(status){
      status.style.color='var(--ok)';
      status.innerHTML='✓ Live on the site header — <a href="/" target="_blank" rel="noopener" style="color:var(--amber-2);font-weight:700">open homepage</a> to check.';
    }
  }catch(e){
    if(status){status.style.color='var(--amber-2)';status.textContent='⚠ '+(e&&e.message?e.message:'Publish failed');}
  }
}
/* icon popup picker */
function openMenuIcon(mi,ci,ii){var cur=STATE.site.menu[mi].cols[ci].items[ii].icon||'solar';var mb=document.getElementById('modalbox');mb.className='modalbox';
 mb.innerHTML='<button class="close" onclick="closeModal()">×</button><h2>Choose an icon</h2><input id="iconsearch" placeholder="Search icons…" style="width:100%;padding:.55rem;border:1px solid var(--line);border-radius:3px;margin:10px 0" oninput="filterIconModal(this.value)"><div class="iconpick" id="iconmodalgrid" style="grid-template-columns:repeat(8,1fr)">'+ICONKEYS.map(function(k){return '<button data-k="'+k+'" class="'+(k===cur?'on':'')+'" title="'+k+'" onclick="pickMenuIcon('+mi+','+ci+','+ii+',\''+k+'\')">'+icon(k,18)+'</button>'}).join('')+'</div>';
 document.getElementById('modal').classList.add('show');}
function filterIconModal(q){q=(q||'').toLowerCase();var g=document.getElementById('iconmodalgrid');if(!g)return;g.querySelectorAll('button').forEach(function(b){b.style.display=b.dataset.k.indexOf(q)>=0?'':'none'})}
function pickMenuIcon(mi,ci,ii,k){STATE.site.menu[mi].cols[ci].items[ii].icon=k;closeModal();renderMega();save();}
/* drag reorder — top-level items + links within a column */
function mDragStart(type,mi,ci,idx){MDRAG={type:type,mi:mi,ci:ci,idx:idx}}
function mDragOver(e){e.preventDefault()}
function mDragEnd(){MDRAG=null}
function mDrop(type,mi,ci,idx){if(!MDRAG||MDRAG.type!==type){MDRAG=null;return}
 if(type==='top'){var a=STATE.site.menu;if(MDRAG.idx===idx){MDRAG=null;return}var m=a.splice(MDRAG.idx,1)[0];a.splice(idx,0,m);MEGA_PI=a.indexOf(m);}
 else{if(MDRAG.mi!==mi||MDRAG.ci!==ci){MDRAG=null;return}var a=STATE.site.menu[mi].cols[ci].items;if(MDRAG.idx===idx){MDRAG=null;return}var m=a.splice(MDRAG.idx,1)[0];a.splice(idx,0,m);}
 MDRAG=null;renderMega();save();}
/* featured image pickers */
function confirmRemoveMenuItem(){
  var item=(STATE.site.menu||[])[MEGA_PI];
  if(!item)return;
  openConfirmModal({
    title:'Remove menu item?',
    message:'This removes the top-level nav item and its columns. This cannot be undone.',
    label:'Item to remove',
    targetHtml:'<div class="modal-confirm-target"><span class="nm">'+esc(item.label||'Untitled')+'</span><span class="ty">nav</span></div>',
    confirmLabel:'Remove item',
    action:function(){
      STATE.site.menu.splice(MEGA_PI,1);
      MEGA_PI=0;
      renderMega();
      save();
    }
  });
}
function setFeatImg(id){var im=(STATE.site.images||[]).filter(function(x){return x.id===id})[0];featOf(STATE.site.menu[MEGA_PI]).img=im?im.data:'';renderMega();save();}
function clearFeatImg(){featOf(STATE.site.menu[MEGA_PI]).img='';renderMega();save();}
function menuFeatImgs(feat){var imgs=STATE.site.images||[];if(!imgs.length)return '<div class="hint" style="font-size:.8rem">No images yet — add some in the <b>Media library</b>, then pick one here.</div>';
 return '<div class="iconpick" style="grid-template-columns:repeat(6,1fr)">'+imgs.map(function(im){return '<button class="'+(feat.img===im.data?'on':'')+'" style="aspect-ratio:4/3;overflow:hidden;padding:0" onclick="setFeatImg(\''+im.id+'\')"><img src="'+im.data+'" style="width:100%;height:100%;object-fit:cover"></button>'}).join('')+'</div>'+(feat.img?'<button class="rm" style="margin-top:6px" onclick="clearFeatImg()">remove image</button>':'');
}
function renderMega(){var el=document.getElementById('megaedit');if(!el)return;var site=STATE&&STATE.site;var M=(site&&site.menu)||[];
 if(!M.length){el.innerHTML='<div class="adm-wrap"><div class="adm-h"><div><h1>Mega menu</h1></div></div><div class="honest">No menu items yet. <button class="tbtn2" onclick="STATE.site.menu=[{label:\'New item\',megaEnabled:true,page:\'\',cols:[{ey:\'Column\',items:[{icon:\'solar\',label:\'Item\',page:\'\'}]}]}];selectMegaTab(0);save()">Add one</button></div></div>';return;}
 if(MEGA_PI>=M.length)MEGA_PI=0;var sel=M[MEGA_PI];var mega=megaOn(sel);var feat=featOf(sel);
 var nav=M.map(function(t,i){return '<button class="mm-nav'+(i===MEGA_PI?' on':'')+'" draggable="true" ondragstart="mDragStart(\'top\','+i+',0,'+i+')" ondragover="mDragOver(event)" ondrop="mDrop(\'top\',0,0,'+i+')" ondragend="mDragEnd()" onclick="selectMegaTab('+i+')" title="Drag to reorder">'+esc(t.label)+(megaOn(t)?'':' ↗')+'</button>';}).join('');
 var panel;
 if(mega){
   var cols=(sel.cols||[]).map(function(c){return '<div class="mm-col"><div class="mm-ey">'+esc(c.ey)+'</div>'+(c.items||[]).map(function(it){return '<div class="mm-item"><span class="ic">'+icon(it.icon||'solar',18)+'</span><div><b>'+esc(it.label)+'</b>'+(it.desc?'<span class="mm-d">'+esc(it.desc)+'</span>':'')+'</div></div>';}).join('')+'</div>';}).join('');
   var _tex=feat.bg==='light'?'/assets/heliaxis-card-fill-light.svg':'/assets/heliaxis-card-fill-dark.svg';
   var fbg=feat.img?' style="background-image:linear-gradient(rgba(20,18,14,.5),rgba(20,18,14,.82)),url('+feat.img+');background-size:cover;background-position:center"':' style="background-image:url('+_tex+');background-size:cover;background-position:top right;background-repeat:no-repeat"';
   var featured='<div class="mm-featured'+(feat.bg==='light'&&!feat.img?' light':'')+'"'+fbg+'>'+(feat.img?'':'<svg class="mm-spark" viewBox="0 0 24 24" fill="#F8BC1E" width="32" height="32">'+[0,90,180,270].map(function(a){return '<g transform="rotate('+a+' 12 12)">'+RAY+'</g>'}).join('')+'</svg>')+'<div class="mm-ft-t">'+esc(feat.title)+'</div><p>'+esc(feat.text)+'</p><span class="mm-ft-cta">'+esc(feat.cta)+' →</span></div>';
   panel='<div class="mm-panel" style="grid-template-columns:repeat('+((sel.cols||[]).length)+',1fr) 1.15fr">'+cols+featured+'</div>';
 } else {
   panel='<div style="padding:22px 24px;background:var(--card);font-family:var(--mono);font-size:.75rem;color:var(--muted)">Direct link → '+(sel.href||sel.page?esc(pageName(sel.href||sel.page)):'<span style="color:#b4462f">no page set</span>')+' · no mega panel</div>';
 }
 var preview='<div class="mm-preview"><div class="mm-bar">'+nav+'</div>'+panel+'</div>';

 var ed='<div class="panelcard"><h3>Top-level item “'+esc(sel.label)+'”</h3>'+
   '<div class="fld"><label>Label</label><input value="'+esc(sel.label)+'" onchange="STATE.site.menu['+MEGA_PI+'].label=this.value;renderMega();save()"></div>'+
   '<label class="chk"><input type="checkbox" '+(mega?'checked':'')+' onchange="toggleMega('+MEGA_PI+',this.checked)"> Enable mega menu (columns, links &amp; featured panel)</label>';
 if(!mega){
   ed+='<div class="fld"><label>This item links directly to</label><div class="link-pick-row"><input class="link-pick-path-input" value="'+esc(sel.href||sel.page||'')+'" placeholder="e.g. /solar-estimator" onchange="setTopPage('+MEGA_PI+',this.value)">'+linkPickHtml(sel.page||sel.href||'','setTopPage('+MEGA_PI+')')+'</div><div class="hint" style="font-size:.75rem;margin-top:6px">Search the list for Estimator, Blog, or any CMS page — or type a custom path. Leave mega menu unchecked for a simple nav link.</div></div>';
 } else {
   ed+='<div class="fld"><label>Featured panel — background</label><div class="seg"><button class="'+(feat.bg!=='light'?'on':'')+'" onclick="setFeatBg('+MEGA_PI+',\'dark\')">Dark texture</button><button class="'+(feat.bg==='light'?'on':'')+'" onclick="setFeatBg('+MEGA_PI+',\'light\')">Light texture</button></div><div class="hint" style="font-size:.75rem;margin-top:4px">Uses the brand card-fill background we designed — grid + warm glow, in dark or light.</div></div>'+
     '<div class="fld"><label>Or a custom photo (optional — overrides the texture)</label>'+menuFeatImgs(feat)+'</div>'+
     '<div class="fld"><label>Featured title</label><input value="'+esc(feat.title)+'" onchange="featOf(STATE.site.menu['+MEGA_PI+']).title=this.value;renderMega();save()"></div>'+
     '<div class="fld"><label>Featured text</label><textarea rows="2" onchange="featOf(STATE.site.menu['+MEGA_PI+']).text=this.value;renderMega();save()">'+esc(feat.text)+'</textarea></div>'+
     '<div class="row2"><div class="fld"><label>CTA label</label><input value="'+esc(feat.cta)+'" onchange="featOf(STATE.site.menu['+MEGA_PI+']).cta=this.value;renderMega();save()"></div><div class="fld"><label>CTA links to</label>'+linkPickHtml(feat.ctaPage||'','setFeatCta('+MEGA_PI+')')+'</div></div>';
 }
 ed+='<button class="rm" onclick="confirmRemoveMenuItem()">Remove top-level item</button></div>';

 if(mega){
   (sel.cols||[]).forEach(function(c,ci){
     ed+='<div class="panelcard"><h3 style="display:flex;justify-content:space-between">Column '+(ci+1)+'<button class="rm" onclick="STATE.site.menu['+MEGA_PI+'].cols.splice('+ci+',1);renderMega();save()">remove column</button></h3>'+
       '<div class="fld"><label>Column heading</label><input value="'+esc(c.ey)+'" onchange="STATE.site.menu['+MEGA_PI+'].cols['+ci+'].ey=this.value;renderMega();save()"></div><div class="hint" style="font-size:.76rem">Drag the ⋮⋮ handle to reorder links.</div>';
     (c.items||[]).forEach(function(it,ii){
       ed+='<div class="mm-itemrow" ondragover="mDragOver(event)" ondrop="mDrop(\'item\','+MEGA_PI+','+ci+','+ii+')">'+
         '<span class="mm-grip" draggable="true" ondragstart="mDragStart(\'item\','+MEGA_PI+','+ci+','+ii+')" ondragend="mDragEnd()" title="Drag to reorder">⋮⋮</span>'+
         '<button class="icp" title="Click to choose an icon" onclick="openMenuIcon('+MEGA_PI+','+ci+','+ii+')">'+icon(it.icon||'solar',18)+'</button>'+
         '<input value="'+esc(it.label)+'" placeholder="Label" onchange="setMenuLabel('+MEGA_PI+','+ci+','+ii+',this.value)">'+
         linkPickHtml(it.page||it.href||'','setMenuPage('+MEGA_PI+','+ci+','+ii+')')+
         '<button class="rm" onclick="STATE.site.menu['+MEGA_PI+'].cols['+ci+'].items.splice('+ii+',1);renderMega();save()">×</button></div>'+
         '<div style="margin:0 0 10px 26px"><input placeholder="Excerpt (optional — shows under the label)" value="'+esc(it.desc||'')+'" onchange="setMenuDesc('+MEGA_PI+','+ci+','+ii+',this.value)" style="width:100%;font-size:.78rem;padding:6px 8px;border:1px solid var(--line);border-radius:2px;background:var(--paper)"></div>';
     });
     ed+='<button class="miniadd" onclick="STATE.site.menu['+MEGA_PI+'].cols['+ci+'].items.push({icon:\'solar\',label:\'New link\',page:\'\'});renderMega();save()">+ Add link</button></div>';
   });
 }
 ed+='<div class="dash-actions">'+(mega?'<button class="dact" onclick="STATE.site.menu['+MEGA_PI+'].cols.push({ey:\'New column\',items:[{icon:\'solar\',label:\'Item\',page:\'\'}]});renderMega();save()"><b>+ Add column</b><span>to this item</span></button>':'')
   +'<button class="dact" onclick="addNavPreset(\'estimator\')"><b>+ Estimator</b><span>links to /solar-estimator</span></button>'
   +'<button class="dact" onclick="addNavPreset(\'blog\')"><b>+ Blog</b><span>links to /blog</span></button>'
   +'<button class="dact" onclick="addNavPreset(\'funding\')"><b>+ Funding</b><span>links to /commercial-funding</span></button>'
   +'<button class="dact" onclick="addNavPreset(\'faqs\')"><b>+ FAQs</b><span>links to /#faq</span></button>'
   +'<button class="dact" onclick="addNavPreset(\'contact\')"><b>+ Contact</b><span>links to /#quote</span></button>'
   +'<button class="dact" onclick="STATE.site.menu.push({label:\'New item\',megaEnabled:true,page:\'\',cols:[{ey:\'Column\',items:[{icon:\'solar\',label:\'Item\',page:\'\'}]}]});selectMegaTab(STATE.site.menu.length-1);save()"><b>+ Add top-level item</b><span>new nav entry / mega panel</span></button></div>';

 el.innerHTML='<div class="adm-wrap"><div class="adm-h"><div><h1>Mega menu</h1><p>This is the top navigation on the live site (the Solar &amp; Battery / Business / Funding / Estimator bar). Add a direct link like <b>Estimator</b> below, or enable a mega panel. Then use the top <b>Publish</b> button to update the header.</p></div></div>'+preview+ed+'</div>';
}

boot();
ensurePublishStyles().catch(function(){});

/* ---- Report an issue (bug / feature) -> /api/feedback ---- */
(function(){
  var btn=document.createElement('button');
  btn.textContent='🐛 Report';
  btn.style.cssText='position:fixed;right:16px;bottom:16px;z-index:9999;background:var(--ink);color:var(--paper);border:1px solid var(--line-d,rgba(247,242,231,.18));border-radius:999px;padding:.6rem 1rem;font-family:var(--body);font-weight:600;font-size:.85rem;cursor:pointer;box-shadow:0 8px 24px -8px rgba(0,0,0,.5)';
  document.body.appendChild(btn);

  var ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;z-index:10000;background:rgba(33,31,24,.5);display:none;align-items:center;justify-content:center;padding:20px';
  ov.innerHTML='<div style="background:var(--card,#fffdf8);color:var(--ink);border-radius:6px;max-width:520px;width:100%;max-height:85vh;overflow:auto;padding:22px;font-family:var(--body)">'
    +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px"><b style="font-size:1.1rem">Report an issue</b><button id="fbClose" style="background:none;border:0;font-size:1.3rem;cursor:pointer;color:var(--muted)">&times;</button></div>'
    +'<div style="display:flex;gap:6px;margin-bottom:10px"><button id="fbBug" class="fbtab">&#128027; Bug</button><button id="fbFeat" class="fbtab">&#10024; Feature</button></div>'
    +'<input id="fbTitle" placeholder="Short summary *" style="width:100%;padding:.6rem;border:1px solid var(--line);border-radius:3px;margin-bottom:8px;font-family:var(--body);box-sizing:border-box">'
    +'<textarea id="fbDetail" rows="4" placeholder="What happened / what would you like? Steps, which page, expected vs actual…" style="width:100%;padding:.6rem;border:1px solid var(--line);border-radius:3px;margin-bottom:8px;font-family:var(--body);box-sizing:border-box"></textarea>'
    +'<div id="fbMsg" style="font-size:.85rem;margin-bottom:8px"></div>'
    +'<div style="display:flex;gap:8px;justify-content:space-between;align-items:center"><button id="fbList" style="background:none;border:1px solid var(--line);border-radius:3px;padding:.5rem .8rem;cursor:pointer;font-weight:600;font-family:var(--body)">View reports</button><button id="fbSend" style="background:var(--solar);color:var(--ink);border:0;border-radius:3px;padding:.55rem 1.1rem;cursor:pointer;font-weight:700;font-family:var(--body)">Send report</button></div>'
    +'<div id="fbReports" style="margin-top:14px"></div></div>';
  document.body.appendChild(ov);

  var st=document.createElement('style');
  st.textContent='.fbtab{flex:1;padding:.5rem;border:1px solid var(--line);border-radius:3px;background:var(--paper-2);cursor:pointer;font-weight:600;font-family:var(--body)}.fbtab.on{background:var(--solar);border-color:var(--solar)}';
  document.head.appendChild(st);

  var esc2=(typeof esc==='function')?esc:function(s){return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')};
  var type='bug';
  function setType(t){type=t;document.getElementById('fbBug').classList.toggle('on',t==='bug');document.getElementById('fbFeat').classList.toggle('on',t==='feature');}
  function openM(){ov.style.display='flex';}
  function closeM(){ov.style.display='none';document.getElementById('fbReports').innerHTML='';document.getElementById('fbMsg').textContent='';}
  setType('bug');
  btn.onclick=openM;
  ov.addEventListener('click',function(e){if(e.target===ov)closeM();});
  document.getElementById('fbClose').onclick=closeM;
  document.getElementById('fbBug').onclick=function(){setType('bug')};
  document.getElementById('fbFeat').onclick=function(){setType('feature')};

  document.getElementById('fbSend').onclick=async function(){
    var title=document.getElementById('fbTitle').value.trim();
    var detail=document.getElementById('fbDetail').value.trim();
    var msg=document.getElementById('fbMsg');
    if(!title){msg.style.color='var(--amber-2)';msg.textContent='Please add a short summary.';return;}
    msg.style.color='var(--muted)';msg.textContent='Sending…';
    try{
      var r=await fetch('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({type:type,title:title,detail:detail,page_url:location.pathname})});
      if(!r.ok){var em='Failed';try{em=(await r.json()).error||em}catch(e){}throw new Error(em);}
      msg.style.color='var(--ok)';msg.textContent='✓ Thanks — report sent.';
      document.getElementById('fbTitle').value='';document.getElementById('fbDetail').value='';
    }catch(e){msg.style.color='var(--amber-2)';msg.textContent='⚠ '+(e.message||'Failed to send');}
  };

  document.getElementById('fbList').onclick=async function(){
    var box=document.getElementById('fbReports');box.innerHTML='<div style="color:var(--muted);font-size:.85rem">Loading…</div>';
    try{
      var r=await fetch('/api/feedback',{credentials:'same-origin',cache:'no-store'});
      var d=await r.json();var items=(d&&d.items)||[];
      if(!items.length){box.innerHTML='<div style="color:var(--muted);font-size:.85rem">No reports yet.</div>';return;}
      box.innerHTML='<div style="font-weight:700;margin:8px 0;font-size:.9rem">Reports ('+items.length+')</div>'+items.map(function(it){
        var col=it.status==='fixed'?'var(--ok)':(it.status==='open'?'var(--amber-2)':'var(--muted)');
        return '<div style="border-top:1px solid var(--line);padding:8px 0"><div style="display:flex;justify-content:space-between;gap:8px"><b style="font-size:.9rem">'+(it.type==='feature'?'✨ ':'🐛 ')+esc2(it.title)+'</b><span style="color:'+col+';font-size:.72rem;font-family:var(--mono);text-transform:uppercase">'+esc2(it.status)+'</span></div>'+(it.detail?'<div style="color:var(--muted);font-size:.82rem;margin-top:3px">'+esc2(it.detail)+'</div>':'')+'</div>';
      }).join('');
    }catch(e){box.innerHTML='<div style="color:var(--amber-2);font-size:.85rem">Failed to load.</div>';}
  };
})();

// Attach all functions referenced by inline event handlers to window
const w = window as any;
w.goDash = goDash;
w.toggleToolbarMore = toggleToolbarMore;
w.closeToolbarMore = closeToolbarMore;
w.switchPage = switchPage;
w.togglePagePicker = togglePagePicker;
w.closePagePicker = closePagePicker;
w.pagePickerSearch = pagePickerSearch;
w.pagePickerPick = pagePickerPick;
w.addPage = addPage;
w.confirmNewPage = confirmNewPage;
w.newPageNameInput = newPageNameInput;
w.newPageSlugInput = newPageSlugInput;
w.saveAsTemplate = saveAsTemplate;
w.confirmSaveTemplate = confirmSaveTemplate;
w.forceSave = forceSave;
w.exportJSON = exportJSON;
w.exportHTML = exportHTML;
w.openPublish = openPublish;
w.openPublishPreview = openPublishPreview;
w.doPublish = doPublish;
w.tab = tab;
w.setView = setView;
w.selectBlock = selectBlock;
w.addBlock = addBlock;
w.delBlock = delBlock;
w.confirmDelBlock = confirmDelBlock;
w.doDelBlock = doDelBlock;
w.openConfirmModal = openConfirmModal;
w.openNoticeModal = openNoticeModal;
w.runConfirmAction = runConfirmAction;
w.confirmRemoveMenuItem = confirmRemoveMenuItem;
w.addItem = addItem;
w.rmItem = rmItem;
w.rmFooterLink = rmFooterLink;
w.addFooterLink = addFooterLink;
w.rmFooterCol = rmFooterCol;
w.setGalleryFeatured = setGalleryFeatured;
w.moveGalItem = moveGalItem;
w.upd = upd;
w.updT = updT;
w.updArr2 = updArr2;
w.nestArr = nestArr;
w.filterIcons = filterIcons;
w.pickImg = pickImg;
w.editPlacementImgMeta = editPlacementImgMeta;
w.pvOver = pvOver;
w.pvLeave = pvLeave;
w.pvDrop = pvDrop;
w.pvDropEnd = pvDropEnd;
w.pvImgClick = pvImgClick;
w.pvGalImgClick = pvGalImgClick;
w.pvGalImgFile = pvGalImgFile;
w.mediaFocusStart = mediaFocusStart;
w.mediaFocusMove = mediaFocusMove;
w.mediaFocusEnd = mediaFocusEnd;
w.mediaZoomStep = mediaZoomStep;
w.mediaFocusWheel = mediaFocusWheel;
w.dstart = dstart;
w.dstartNew = dstartNew;
w.dover = dover;
w.dleave = dleave;
w.dleaveZone = dleaveZone;
w.ddrop = ddrop;
w.ddropEnd = ddropEnd;
w.dend = dend;
w.blockRowPrev = blockRowPrev;
w.blockRowLeave = blockRowLeave;
w.sectionPrev = sectionPrev;
w.tplHide = tplHide;
w.tplPrev = tplPrev;
w.epInput = epInput;
w.epBlur = epBlur;
w.epKey = epKey;
w.richClick = richClick;
w.menuLabel = menuLabel;
w.menuCol = menuCol;
w.menuItem = menuItem;
w.menuItemAdd = menuItemAdd;
w.menuItemRm = menuItemRm;
w.menuColAdd = menuColAdd;
w.menuAdd = menuAdd;
w.menuRm = menuRm;
w.logoBnr = logoBnr;
w.logoRm = logoRm;
w.logoAdd = logoAdd;
w.imgRm = imgRm;
w.imgRmAsk = imgRmAsk;
w.imgUpload = imgUpload;
w.closeImgMetaModal = closeImgMetaModal;
w.confirmImgMeta = confirmImgMeta;
w.imgMetaSetLoading = imgMetaSetLoading;
w.imgMetaLivePreview = imgMetaLivePreview;
w.seoUpd = seoUpd;
w.seoSlugCommit = seoSlugCommit;
w.setPageTheme = setPageTheme;
w.setPageType = setPageType;
w.save = save;
w.renderPreview = renderPreview;
w.renderSEO = renderSEO;
w.renderBuild = renderBuild;
w.renderImages = renderImages;
w.renderMega = renderMega;
w.renderLogosLib = renderLogosLib;
w.closeModal = closeModal;
w.makeLanding = makeLanding;
w.dashNewPage = dashNewPage;
w.makeBlogArticle = makeBlogArticle;
w.dashPageTypeSet = dashPageTypeSet;
w.dashClearFilters = dashClearFilters;
w.dashPageSearch = dashPageSearch;
w.dashClearSearch = dashClearSearch;
w.dashPageGo = dashPageGo;
w.DASH_PAGE_SEARCH = DASH_PAGE_SEARCH;
w.pageNameUpd = pageNameUpd;
w.pageNameInput = pageNameInput;
w.editPage = editPage;
w.delPage = delPage;
w.doDelPage = doDelPage;
w.showLibrary = showLibrary;
w.showLogos = showLogos;
w.showMega = showMega;
w.showAnalytics = showAnalytics;
w.showEnquiries = showEnquiries;
w.openGallery = openGallery;
w.closeGallery = closeGallery;
w.galPick = galPick;
w.openKeyword = openKeyword;
w.openLead = openLead;
w.setLeadStatus = setLeadStatus;
w.openCaseModal = openCaseModal;
w.makeCase = makeCase;
w.casePrev = casePrev;
w.openMenuIcon = openMenuIcon;
w.pickMenuIcon = pickMenuIcon;
w.filterIconModal = filterIconModal;
w.setMenuLabel = setMenuLabel;
w.setMenuDesc = setMenuDesc;
w.setMenuPage = setMenuPage;
w.setTopPage = setTopPage;
w.setFeatCta = setFeatCta;
w.toggleLinkPick = toggleLinkPick;
w.filterLinkPick = filterLinkPick;
w.applyLinkPick = applyLinkPick;
w.closeLinkPicks = closeLinkPicks;
w.openLinkPickSection = openLinkPickSection;
w.backLinkPickSections = backLinkPickSections;
w.toggleMega = toggleMega;
w.mDragStart = mDragStart;
w.mDragOver = mDragOver;
w.mDrop = mDrop;
w.mDragEnd = mDragEnd;
w.pvLeaveZone = pvLeaveZone;
w.setFeatImg = setFeatImg;
w.clearFeatImg = clearFeatImg;
w.setFeatBg = setFeatBg;
w.publishMegaMenu = publishMegaMenu;
w.addNavPreset = addNavPreset;
w.featOf = featOf;
w.logoFileAdd = logoFileAdd;
w.page = page;
Object.defineProperty(w, 'STATE', {
  get: function(){ return STATE; },
  set: function(v){ STATE = v; },
  configurable: true
});
w.selectMegaTab = selectMegaTab;
w.selectMenuPreviewTab = selectMenuPreviewTab;
Object.defineProperty(w, 'MEGA_PI', { get: function(){ return MEGA_PI; }, set: function(v){ MEGA_PI = Number(v); }, configurable: true });
Object.defineProperty(w, 'MENU_PI', { get: function(){ return MENU_PI; }, set: function(v){ MENU_PI = Number(v); }, configurable: true });
w.IMGFILTER = typeof IMGFILTER !== 'undefined' ? IMGFILTER : undefined;
}
