/* eslint-disable */
// @ts-nocheck

/**
 * CMS Engine — extracted from public/pages/cms.html
 * All original JS logic, executed after the DOM shell mounts.
 * Functions are attached to window so onclick attributes continue working.
 */
export function initCms(options?: { initialPageSlug?: string | null }): void {
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
    {label:'Residential',cols:[{ey:'What we install',items:[{icon:'solar',label:'Solar panels'},{icon:'battery',label:'Battery storage'},{icon:'heatpump',label:'Heat pumps'},{icon:'ev',label:'EV chargers'}]},{ey:'Tools & funding',items:[{icon:'monitor',label:'Savings estimator'},{icon:'coin',label:'Funding & 0% VAT'}]}]},
    {label:'Commercial',cols:[{ey:'Solutions',items:[{icon:'solar',label:'Commercial solar'},{icon:'battery',label:'Battery storage'},{icon:'ev',label:'EV & fleet'}]},{ey:'Grants & funding',items:[{icon:'coin',label:'Funding & finance'},{icon:'grant',label:'Newport Net Zero grant'}]},{ey:'By sector',items:[{icon:'warehouse',label:'Warehousing'},{icon:'building',label:'Care homes'}]}]}
  ]
}}
function homeBlocks(){return [
 {id:uid(),t:'hero',p:{eyebrow:'MCS-certified · South Wales',headline:'Cut your energy bills with Welsh sunshine.',sub:'Solar, battery, heat pumps & EV — one local, accredited team. No pushy sales, ever.',dark:true,ctaLabel:'Get my free quote',ctaPulse:true,cta2:'Estimate my savings'}},
 {id:uid(),t:'stats',p:{items:[{n:'1,200+',k:'Installs completed'},{n:'£1,200',k:'Avg. yearly saving'},{n:'4.9★',k:'Customer rating'},{n:'25 yr',k:'Workmanship guarantee'}]}},
 {id:uid(),t:'grid',p:{eyebrow:'What we install',title:'One team for your whole energy setup',cols:3,items:[
   {icon:'solar',title:'Solar PV panels',desc:'Tier-one panels sized to your roof.'},{icon:'battery',title:'Battery storage',desc:'Store sunshine for after dark.'},{icon:'heatpump',title:'Heat pumps',desc:'Efficient low-carbon heating.'},
   {icon:'ev',title:'EV chargers',desc:'Charge from your own solar.'},{icon:'led',title:'LED lighting',desc:'Fast-payback lighting upgrades.'},{icon:'monitor',title:'Monitoring',desc:'Track savings from your phone.'}]}},
 {id:uid(),t:'banner',p:{heading:'Trusted technology we install'}},
 {id:uid(),t:'split',p:{lt:'For your home',ld:'Cut your bills, add battery backup and go greener.',lb:['Free, no-obligation home survey','0% VAT on residential solar to 2027','Finance to spread the cost'],lc:'Get my home quote',rt:'For your business',rd:'Turn your roof into lower running costs, with ROI, grants and finance.',rb:['Free commercial energy assessment','Grants, finance & PPA','Typical 3–6 year payback'],rc:'Explore business funding'}},
 {id:uid(),t:'testi',p:{items:[
   {stars:5,quote:'Neat, tidy and no pressure. Bills dropped massively.',name:'Sarah M.',loc:'Cardiff'},
   {stars:5,quote:'Spot on from survey to switch-on. They cleaned up after.',name:'David R.',loc:'Swansea'},
   {stars:5,quote:'Straight answers, proper ROI figures, payback we\'re hitting.',name:'Gareth L.',loc:'Newport'}]}},
 {id:uid(),t:'faq',p:{items:[
   {q:'Do solar panels work in Wales\' cloudy weather?',a:'Yes — panels run on daylight, not direct sun, so they still generate on overcast days.'},
   {q:'How much could I save?',a:'Many homes save four figures a year. The estimator gives a quick indication; a survey confirms exact figures.'},
   {q:'Is there really no hard sell?',a:'Correct — we\'re engineers, not commission-driven salespeople.'}]}},
 {id:uid(),t:'cta',p:{headline:'Your lower bills start with one free survey.',sub:'Join 1,200+ South Wales homes and businesses already powering up.',btn:'Get my free quote',pulse:true}}
]}
function newState(){return {pages:[{id:uid(),name:'Home',slug:'/',type:'page',blocks:homeBlocks()}],current:0,site:defaultSite()}}

/* ============ persistence ============ */
async function save(){
  DIRTY=true;
  setSaved('Saving to Supabase…');
  try{
    if(!window.storage)throw new Error('Storage unavailable');
    await window.storage.set('heliaxis-cms-v1',JSON.stringify(STATE),false);
    setSaved('Saved to Supabase');
    DIRTY=false;
  }catch(e){
    setSaved(e&&e.message?e.message:'Save failed');
  }
}
function setSaved(t){const e=document.getElementById('savestate');if(!e)return;const label=e.querySelector('.save-label');if(label)label.textContent=t;else e.textContent=t;e.classList.toggle('is-dirty',/saving|failed|unsaved/i.test(t));e.classList.toggle('is-saving',/saving/i.test(t));e.classList.toggle('is-ok',/saved/i.test(t)&&!/failed|unsaved|saving/i.test(t));}
async function boot(){
  try{if(window.storage){const r=await window.storage.get('heliaxis-cms-v1');if(r&&r.value){STATE=JSON.parse(r.value);}}}catch(e){}
  if(!STATE)STATE=newState();
  if(ensureUniquePageTitles())save();
  if(repairLegacyUntitledSlugs())save();
  if(ensureUniquePageSlugs())save();
  var slug=CMS_INITIAL_SLUG||getSlugFromPath();
  CMS_INITIAL_SLUG=null;
  try{
    if(slug){var idx=findPageByEditSlug(slug);if(idx>=0){STATE.current=idx;SEL=null;MODE='edit';setMode();renderAll();tab('build');syncCmsUrl(true);return;}}
    MODE='dash';setMode();renderAll();
  }finally{
    hideCmsBoot();
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
function esc(s){return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
/* Inline-edit attribute helper: only emits contenteditable wiring when edit mode
   is on (i.e. in the live preview). Publish/export call renderBlock without edit,
   so none of this leaks into the published site. */
function ce(ep,edit){return (edit&&ep)?' contenteditable="true" data-ep="'+ep+'" oninput="epInput(this)" onblur="epBlur(this)" onkeydown="epKey(event)" onclick="event.stopPropagation()"':'';}
function btn(label,cls,pulse,ic,ep,edit){if(!label)return '';return '<span class="pv-btn '+cls+(pulse?' pulse':'')+'">'+(ic?icon(ic,16):'')+'<span'+ce(ep,edit)+'>'+esc(label)+'</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>'}
function eyebrow(t,ep,edit){if(!(t&&String(t).trim()))return '';return '<span class="pv-eyebrow">'+SPARK+'<span'+ce(ep,edit)+'>'+esc(t)+'</span></span>'}
function heroTags(tags){
  if(!tags)return '';
  var list=String(tags).split(/[,|]/).map(function(t){return t.trim()}).filter(Boolean);
  if(!list.length)return '';
  return '<div class="pv-hero-tags">'+list.map(function(t){return '<span class="pv-hero-tag">'+esc(t)+'</span>'}).join('<span class="pv-hero-tag-sep" aria-hidden="true">|</span>')+'</div>';
}
function renderBlock(b,edit){
 const p=b.p;const id=b.id;
 if(b.t==='hero'){
   var sub=(p.sub&&String(p.sub).trim())?'<p class="pv-sub"'+ce(id+'.sub',edit)+'>'+esc(p.sub)+'</p>':'';
   var btns=(p.ctaDisabled?'':btn(p.ctaLabel,'solar',p.ctaPulse,null,id+'.ctaLabel',edit))+(p.cta2Disabled?'':btn(p.cta2,p.dark?'':'dark ghost',false,null,id+'.cta2',edit));
   var btnrow=btns?'<div class="pv-btnrow">'+btns+'</div>':'';
   return '<div class="pv-hero'+(p.dark?'':' light')+(p.textWide?' wide':'')+'"><div class="z">'+heroTags(p.tags)+eyebrow(p.eyebrow,id+'.eyebrow',edit)+'<h1'+ce(id+'.headline',edit)+'>'+esc(p.headline)+'</h1>'+sub+btnrow+'</div></div>';
 }
 if(b.t==='stats')return '<div class="pv-stats" style="grid-template-columns:repeat('+(p.items.length)+',1fr)">'+p.items.map((s,i)=>'<div class="pv-stat"><div class="n"'+ce(id+'.items.'+i+'.n',edit)+'>'+esc(s.n)+'</div><div class="k"'+ce(id+'.items.'+i+'.k',edit)+'>'+esc(s.k)+'</div></div>').join('')+'</div>';
 if(b.t==='grid'){const gc=(it,i)=>'<div class="pv-card"><span class="ic">'+icon(it.icon)+'</span><h3'+ce(id+'.items.'+i+'.title',edit)+'>'+esc(it.title)+'</h3><p'+ce(id+'.items.'+i+'.desc',edit)+'>'+esc(it.desc)+'</p></div>';
   let inner;
   if(p.fill==='balance'){inner='<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:14px">'+p.items.map((it,i)=>'<div class="pv-card" style="flex:0 1 calc('+(100/p.cols)+'% - 14px);min-width:220px"><span class="ic">'+icon(it.icon)+'</span><h3'+ce(id+'.items.'+i+'.title',edit)+'>'+esc(it.title)+'</h3><p'+ce(id+'.items.'+i+'.desc',edit)+'>'+esc(it.desc)+'</p></div>').join('')+'</div>';}
   else{let extra='';const rem=p.items.length%p.cols;if(rem!==0&&p.fill==='contact'){const gap=p.cols-rem;extra='<div class="pv-card pv-contact" style="grid-column:span '+gap+'"><h3'+ce(id+'.contactHeading',edit)+'>'+esc(p.contactHeading||'Get in touch')+'</h3><p'+ce(id+'.contactText',edit)+'>'+esc(p.contactText||'Not sure which option fits? Tell us your setup and we\'ll point you the right way.')+'</p><span class="pv-btn solar"'+ce(id+'.contactBtn',edit)+'>'+esc(p.contactBtn||'Contact us')+'</span></div>';}inner='<div class="pv-grid" style="grid-template-columns:repeat('+p.cols+',1fr)">'+p.items.map(gc).join('')+extra+'</div>';}
   return '<div class="pv-sec"><div class="shead">'+eyebrow(p.eyebrow,id+'.eyebrow',edit)+'<h2'+ce(id+'.title',edit)+'>'+esc(p.title)+'</h2></div>'+inner+'</div>';}
 if(b.t==='split')return '<div class="pv-split"><div class="pv-splitcard"><h3'+ce(id+'.lt',edit)+'>'+esc(p.lt)+'</h3><p'+ce(id+'.ld',edit)+'>'+esc(p.ld)+'</p><ul>'+p.lb.map((x,i)=>'<li'+ce(id+'.lb.'+i,edit)+'>'+esc(x)+'</li>').join('')+'</ul>'+btn(p.lc,'dark',false,null,id+'.lc',edit)+'</div><div class="pv-splitcard dark"><h3'+ce(id+'.rt',edit)+'>'+esc(p.rt)+'</h3><p'+ce(id+'.rd',edit)+'>'+esc(p.rd)+'</p><ul>'+p.rb.map((x,i)=>'<li'+ce(id+'.rb.'+i,edit)+'>'+esc(x)+'</li>').join('')+'</ul>'+btn(p.rc,'solar',false,null,id+'.rc',edit)+'</div></div>';
 if(b.t==='testi'){const cards=p.items.map((tt,i)=>'<div class="pv-tcard"><div class="st">'+'★'.repeat(tt.stars)+'</div><blockquote'+ce(id+'.items.'+i+'.quote',edit)+'>'+esc(tt.quote)+'</blockquote><div class="who"><b'+ce(id+'.items.'+i+'.name',edit)+'>'+esc(tt.name)+'</b> <span>· <span'+ce(id+'.items.'+i+'.loc',edit)+'>'+esc(tt.loc)+'</span></span></div></div>');
   let body;
   if(p.items.length>3){body='<div class="pv-tmarquee"><div class="trk" style="animation-duration:'+(p.speed||36)+'s">'+cards.join('')+cards.join('')+'</div></div>';}
   else{body='<div class="pv-tgrid">'+cards.join('')+'</div>';}
   return '<div class="pv-testi"><div class="shead center">'+eyebrow('Real customers')+'<h2>Trusted across South Wales</h2></div>'+body+'</div>';}
 if(b.t==='banner'){const ls=STATE.site.logos.filter(l=>l.bnr);const chip=l=>'<span class="pv-brand">'+(l.img?'<img src="'+l.img+'">':esc(l.name))+'</span>';
   return '<div class="pv-banner"><div class="bh"'+ce(id+'.heading',edit)+'>'+esc(p.heading)+'</div><div class="pv-bmarq"><div class="trk">'+ls.map(chip).join('')+ls.map(chip).join('')+'</div></div></div>';}
 if(b.t==='cta')return '<div class="pv-cta"><div class="z"><h2'+ce(id+'.headline',edit)+'>'+esc(p.headline)+'</h2><p'+ce(id+'.sub',edit)+'>'+esc(p.sub)+'</p>'+(p.ctaDisabled?'':'<div class="pv-btnrow" style="justify-content:center">'+btn(p.btn,'solar',p.pulse,null,id+'.btn',edit)+'</div>')+'</div></div>';
 if(b.t==='faq')return '<div class="pv-faq"><div class="shead center">'+eyebrow('Good to know')+'<h2>Your questions, answered</h2></div>'+p.items.map((q,i)=>'<div class="pv-qa"><div class="q"><span class="ix">Q/0'+(i+1)+'</span><span'+ce(id+'.items.'+i+'.q',edit)+'>'+esc(q.q)+'</span></div><div class="a"'+ce(id+'.items.'+i+'.a',edit)+'>'+esc(q.a)+'</div></div>').join('')+'</div>';
if(b.t==='media'){const im=p.img?imgTag(p.img,'width:100%;border-radius:3px;display:block',edit,id+'.img'):'<div style="aspect-ratio:4/3;background:linear-gradient(135deg,#26324c,#171d2b);border-radius:3px;display:grid;place-items:center;color:var(--muted-d);font-family:var(--mono);font-size:.7rem">IMAGE</div>';
   const ctaBtn=p.ctaDisabled?'':btn(p.cta,'solar',false,null,id+'.cta',edit);
   const cols=p.textWide?(p.side==='left'?'0.75fr 1.25fr':'1.25fr 0.75fr'):'1fr 1fr';
   const tx='<div>'+eyebrow(p.eyebrow,id+'.eyebrow',edit)+'<h2 style="font-size:clamp(1.5rem,2.6vw,2.1rem);font-weight:800;margin-top:10px"'+ce(id+'.title',edit)+'>'+esc(p.title)+'</h2><p style="color:var(--muted);margin-top:12px;line-height:1.6"'+ce(id+'.text',edit)+'>'+esc(p.text)+'</p>'+(ctaBtn?'<div class="pv-btnrow">'+ctaBtn+'</div>':'')+'</div>';
   return '<div class="pv-sec" style="display:grid;grid-template-columns:'+cols+';gap:34px;align-items:center">'+(p.side==='left'?im+tx:tx+im)+'</div>';}
 if(b.t==='form'){let f='';if(p.fName)f+='<input placeholder="Full name *">';if(p.fOrg)f+='<input placeholder="Organisation (optional)">';if(p.fEmail)f+='<input placeholder="Email *">';if(p.fPhone)f+='<input placeholder="Phone">';if(p.fPost)f+='<input placeholder="Postcode">';
   if(p.fSector)f+='<div class="pv-fgroup"><label>Your sector *</label><div class="pv-pills">'+['Residential','Commercial','Public Sector','Housing Association','Other'].map(function(x){return '<span class="pv-pill">'+x+'</span>'}).join('')+'</div></div>';
   if(p.fInterests)f+='<div class="pv-fgroup"><label>I\'m interested in <span style="color:var(--muted);text-transform:none;letter-spacing:0">(select all that apply)</span></label><div class="pv-checks">'+INTERESTS.map(function(it){return '<span class="pv-check">'+icon(it[0],18)+it[1]+'</span>'}).join('')+'</div></div>';
   if(p.fMsg)f+='<textarea rows="3" placeholder="Message"></textarea>';
   return '<div class="pv-sec"><div style="max-width:600px;margin:0 auto;text-align:center">'+eyebrow('Get in touch')+'<h2 style="font-weight:800;margin-top:10px"'+ce(id+'.heading',edit)+'>'+esc(p.heading)+'</h2><p style="color:var(--muted);margin-top:8px"'+ce(id+'.sub',edit)+'>'+esc(p.sub)+'</p></div><div class="pv-form" style="max-width:560px;margin:22px auto 0;display:flex;flex-direction:column;gap:12px">'+f+btn(p.btn,'solar',p.pulse,null,id+'.btn',edit)+'</div></div>';}
if(b.t==='pricing')return '<div class="pv-sec"><div class="shead center">'+eyebrow(p.eyebrow||'Options',id+'.eyebrow',edit)+'<h2'+ce(id+'.title',edit)+'>'+esc(p.title)+'</h2></div><div style="display:grid;grid-template-columns:repeat('+p.plans.length+',1fr);gap:14px">'+p.plans.map((pl,i)=>'<div class="pv-card'+(pl.hl?' pv-plan-hl':'')+'"><div style="font-family:var(--mono);font-size:.64rem;text-transform:uppercase;letter-spacing:.06em;color:var(--amber-2)"'+ce(id+'.plans.'+i+'.name',edit)+'>'+esc(pl.name)+'</div><div style="font-family:var(--display);font-weight:900;font-size:1.9rem;margin:6px 0"'+ce(id+'.plans.'+i+'.price',edit)+'>'+esc(pl.price)+'</div><div style="color:var(--muted);font-size:.8rem;margin-bottom:12px"'+ce(id+'.plans.'+i+'.per',edit)+'>'+esc(pl.per)+'</div>'+pl.feats.map((f,fi)=>'<div style="display:flex;gap:8px;padding:5px 0;font-size:.87rem;border-top:1px solid var(--line)"><span style="color:var(--ok)">✓</span><span'+ce(id+'.plans.'+i+'.feats.'+fi,edit)+'>'+esc(f)+'</span></div>').join('')+'<div style="margin-top:14px">'+btn(pl.cta,pl.hl?'solar':'dark ghost',false,null,id+'.plans.'+i+'.cta',edit)+'</div></div>').join('')+'</div></div>';
 if(b.t==='steps')return '<div class="pv-sec"><div class="shead center">'+eyebrow(p.eyebrow||'How it works',id+'.eyebrow',edit)+'<h2'+ce(id+'.title',edit)+'>'+esc(p.title)+'</h2></div><div style="display:grid;grid-template-columns:repeat('+p.items.length+',1fr);gap:20px">'+p.items.map((s,i)=>'<div><div style="font-family:var(--mono);font-size:.72rem;letter-spacing:.05em;color:var(--amber-2);border-bottom:1px solid var(--line);padding-bottom:8px;margin-bottom:12px">STEP 0'+(i+1)+'</div><h3 style="font-family:var(--display);font-weight:700;font-size:1.08rem"'+ce(id+'.items.'+i+'.title',edit)+'>'+esc(s.title)+'</h3><p style="color:var(--muted);font-size:.87rem;margin-top:6px;line-height:1.5"'+ce(id+'.items.'+i+'.text',edit)+'>'+esc(s.text)+'</p></div>').join('')+'</div></div>';
 if(b.t==='casestudy')return '<div class="pv-sec"><div class="shead">'+eyebrow(p.eyebrow||'Our work',id+'.eyebrow',edit)+'<h2'+ce(id+'.title',edit)+'>'+esc(p.title)+'</h2></div><div style="display:grid;grid-template-columns:repeat('+Math.min(p.items.length,3)+',1fr);gap:14px">'+p.items.map((cs,i)=>'<div class="pv-card" style="padding:0;overflow:hidden">'+(cs.img?imgTag(cs.img,'width:100%;height:150px;object-fit:cover;display:block',edit,id+'.items.'+i+'.img'):'<div style="height:150px;background:linear-gradient(135deg,#26324c,#171d2b)"></div>')+'<div style="padding:18px"><div style="font-family:var(--mono);font-size:.6rem;letter-spacing:.05em;text-transform:uppercase;color:var(--muted)"'+ce(id+'.items.'+i+'.loc',edit)+'>'+esc(cs.loc)+'</div><h3 style="font-size:1.02rem;font-weight:700;margin-top:4px"'+ce(id+'.items.'+i+'.title',edit)+'>'+esc(cs.title)+'</h3><div style="font-family:var(--display);font-weight:900;color:var(--amber-2);font-size:1.4rem;margin-top:10px"'+ce(id+'.items.'+i+'.stat',edit)+'>'+esc(cs.stat)+'</div><div style="font-size:.76rem;color:var(--muted)"'+ce(id+'.items.'+i+'.statlabel',edit)+'>'+esc(cs.statlabel)+'</div></div></div>').join('')+'</div></div>';
 if(b.t==='clientbanner'){const cs=p.clients||[];const chip=c=>'<span class="pv-brand">'+(c.img?'<img src="'+c.img+'">':esc(c.name))+'</span>';return '<div class="pv-banner"><div class="bh"'+ce(id+'.heading',edit)+'>'+esc(p.heading)+'</div><div class="pv-bmarq"><div class="trk">'+cs.map(chip).join('')+cs.map(chip).join('')+'</div></div></div>';}
 if(b.t==='rich'){
   var richCe=edit?' contenteditable="true" data-ep="'+id+'.html" data-html="1" oninput="epInput(this)" onblur="epBlur(this)" onkeydown="epKey(event,true)" onclick="richClick(event,this,\''+id+'\')"':'';
   return '<div class="pv-rich"'+richCe+'>'+(p.html||'<p>Rich text…</p>')+'</div>';
 }
 return '';
}
const BLOCKNAMES={hero:'Hero',stats:'Stat bar',grid:'Grid section',split:'Home / Business',media:'Image + text',pricing:'Pricing / finance',steps:'Process steps',casestudy:'Case-study cards',clientbanner:'Client banner',testi:'Testimonials',banner:'Brand banner',form:'Contact form',cta:'CTA band',faq:'FAQ',rich:'Rich text'};
function renderPreview(){
 const pv=document.getElementById('preview');pv.className='preview'+(VIEW==='mob'?' mob':'')+(page().theme==='dark'?' dk':'');
 pv.ondragover=function(e){pvOver(e);};pv.ondrop=function(e){pvDropEnd(e);};pv.ondragleave=function(e){pvLeaveZone(e);};
 const b=page().blocks;
 document.getElementById('pvname').textContent=page().name+' · '+page().slug;
 if(!b.length){pv.innerHTML='<div class="pv-empty" ondragover="pvOver(event)" ondrop="pvDropEnd(event)">Empty page — drag a section here, or add one from the left ↙</div>';return;}
 pv.innerHTML=b.map((bl,i)=>'<div class="pv-block'+(SEL===bl.id?' sel':'')+'" style="'+spacingStyle(bl.p)+'" data-idx="'+i+'" ondragover="pvOver(event,'+i+',this)" ondragleave="pvLeave(this)" ondrop="pvDrop(event,'+i+')" onclick="selectBlock(\''+bl.id+'\')">'+renderBlock(bl,true)+'</div>').join('');
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
   '<span class="gr">⋮⋮</span><span class="nm">'+BLOCKNAMES[bl.t]+'</span><span class="ty">'+bl.t+'</span><button class="x" onclick="event.stopPropagation();confirmDelBlock(\''+bl.id+'\')">×</button></div>').join('')+'</div>';
 h+='<div class="addwrap"><button class="addbtn" onclick="document.getElementById(\'addmenu\').classList.toggle(\'hide\')">+ Add section</button>'+
   '<div class="addmenu hide" id="addmenu">'+Object.keys(BLOCKNAMES).map(t=>'<button draggable="true" ondragstart="dstartNew(event,\''+t+'\')" ondragend="dend()" onmouseenter="sectionPrev(\''+t+'\',this)" onmouseleave="blockRowLeave(event)" onclick="addBlock(\''+t+'\')" title="Click to add, or drag onto the layout">'+BLOCKNAMES[t]+'</button>').join('')+'</div></div>';
 // inspector
 if(SEL){const bl=b.find(x=>x.id===SEL);if(bl)h+='<div style="margin-top:18px;border-top:1px solid var(--line);padding-top:14px"><div class="ph">'+SPARK+'Edit: '+BLOCKNAMES[bl.t]+'</div>'+inspector(bl)+'</div>';}
 el.innerHTML=h;
}
function txt(label,val,path){return '<div class="fld"><label>'+label+'</label><input value="'+esc(val)+'" oninput="updT(\''+path+'\',this.value)"></div>'}
function area(label,val,path){return '<div class="fld"><label>'+label+'</label><textarea rows="2" oninput="updT(\''+path+'\',this.value)">'+esc(val)+'</textarea></div>'}
function chk(label,val,path){return '<label class="chk"><input type="checkbox" '+(val?'checked':'')+' onchange="upd(\''+path+'\',this.checked)">'+label+'</label>'}
function iconPicker(cur,path){const uid2='ip'+Math.random().toString(36).slice(2,7);
 return '<div class="fld"><label>Icon (library — '+ICONKEYS.length+')</label><input placeholder="search icons…" style="margin-bottom:5px" oninput="filterIcons(this,\''+uid2+'\')"><div class="iconpick" id="'+uid2+'">'+ICONKEYS.map(k=>'<button data-k="'+k+'" class="'+(k===cur?'on':'')+'" onclick="upd(\''+path+'\',\''+k+'\')" title="'+k+'">'+icon(k,18)+'</button>').join('')+'</div></div>'}
function filterIcons(inp,id){const q=inp.value.toLowerCase();document.getElementById(id).querySelectorAll('button').forEach(b=>{b.style.display=b.dataset.k.includes(q)?'':'none'})}
function inspector(bl){const p=bl.p,id=bl.id;let h='';
 if(bl.t==='hero'){h+=txt('Blog tags',p.tags||'',id+'.tags')+'<div class="hint">Comma or | separated — shown at the top of the hero.</div>'+txt('Eyebrow',p.eyebrow,id+'.eyebrow')+area('Headline',p.headline,id+'.headline')+area('Subheadline',p.sub,id+'.sub')+'<div class="hint">Leave subheadline empty to remove the gap under the title.</div>'+chk('Wider text',!!p.textWide,id+'.textWide')+chk('Disable button',!!p.ctaDisabled,id+'.ctaDisabled')+(p.ctaDisabled?'<div class="hint">Primary button is hidden.</div>':txt('Primary button',p.ctaLabel,id+'.ctaLabel')+chk('Pulse animation on button',p.ctaPulse,id+'.ctaPulse'))+chk('Disable secondary button',!!p.cta2Disabled,id+'.cta2Disabled')+(p.cta2Disabled?'<div class="hint">Secondary button is hidden.</div>':txt('Secondary button',p.cta2,id+'.cta2'))+chk('Dark hero',p.dark,id+'.dark');}
 else if(bl.t==='stats'){h+='<div class="hint">Stat tiles</div>';p.items.forEach((s,i)=>{h+='<div class="sub"><div class="sh"><b>Tile '+(i+1)+'</b><button class="rm" onclick="rmItem(\''+id+'\',\'items\','+i+')">remove</button></div>'+txt('Number',s.n,id+'.items.'+i+'.n')+txt('Label',s.k,id+'.items.'+i+'.k')+'</div>';});h+='<button class="miniadd" onclick="addItem(\''+id+'\',\'items\',{n:\'0\',k:\'Label\'})">+ Add tile</button>';}
 else if(bl.t==='grid'){h+=txt('Eyebrow',p.eyebrow,id+'.eyebrow')+txt('Title',p.title,id+'.title');
   h+='<div class="fld"><label>Columns (grid width)</label><div class="seg">'+[2,3,4].map(c=>'<button class="'+(p.cols===c?'on':'')+'" onclick="upd(\''+id+'.cols\','+c+')">'+c+' wide</button>').join('')+'</div></div>';
   h+='<div class="fld"><label>If a row is incomplete</label><select onchange="upd(\''+id+'.fill\',this.value)">'+'<option value="none"'+((p.fill||'none')==='none'?' selected':'')+'>Leave empty</option>'+'<option value="contact"'+(p.fill==='contact'?' selected':'')+'>Fill gap with a get-in-touch card</option>'+'<option value="balance"'+(p.fill==='balance'?' selected':'')+'>Balance / centre the last row</option>'+'</select></div>';
   if(p.fill==='contact')h+='<div class="sub" style="background:var(--paper-2)"><div class="sh"><b>Get-in-touch card</b></div>'+txt('Heading',p.contactHeading||'Get in touch',id+'.contactHeading')+area('Text',p.contactText||'',id+'.contactText')+txt('Button',p.contactBtn||'Contact us',id+'.contactBtn')+'</div>';
   h+='<div class="hint">'+p.items.length+' items × '+p.cols+' wide = '+Math.ceil(p.items.length/p.cols)+' rows. Add or remove items to change the shape (e.g. 3 items = 1×3, 6 = 2×3, 4 at 2-wide = 2×2).</div>';
   p.items.forEach((it,i)=>{h+='<div class="sub"><div class="sh"><b>Item '+(i+1)+'</b><button class="rm" onclick="rmItem(\''+id+'\',\'items\','+i+')">remove</button></div>'+iconPicker(it.icon,id+'.items.'+i+'.icon')+txt('Title',it.title,id+'.items.'+i+'.title')+txt('Description',it.desc,id+'.items.'+i+'.desc')+'</div>';});
   h+='<button class="miniadd" onclick="addItem(\''+id+'\',\'items\',{icon:\'solar\',title:\'New item\',desc:\'Description\'})">+ Add item</button>';}
 else if(bl.t==='split'){h+='<div class="hint"><b>Left card</b></div>'+txt('Title',p.lt,id+'.lt')+area('Text',p.ld,id+'.ld')+bulletsEd(id,'lb',p.lb)+txt('Button',p.lc,id+'.lc');
   h+='<div class="hint"><b>Right card (dark)</b></div>'+txt('Title',p.rt,id+'.rt')+area('Text',p.rd,id+'.rd')+bulletsEd(id,'rb',p.rb)+txt('Button',p.rc,id+'.rc');}
 else if(bl.t==='testi'){h+='<div class="hint">Add testimonials. <b>More than 3 turns it into an auto-scrolling slider.</b></div>';
   h+='<div class="fld"><label>Slider speed — '+(p.speed||36)+'s per loop (lower = faster)</label><input type="range" min="12" max="80" value="'+(p.speed||36)+'" oninput="updT(\''+id+'.speed\',+this.value)"></div>';
   p.items.forEach((tt,i)=>{h+='<div class="sub"><div class="sh"><b>#'+(i+1)+'</b><button class="rm" onclick="rmItem(\''+id+'\',\'items\','+i+')">remove</button></div>'+area('Quote',tt.quote,id+'.items.'+i+'.quote')+'<div class="row2">'+txt('Name',tt.name,id+'.items.'+i+'.name')+txt('Location',tt.loc,id+'.items.'+i+'.loc')+'</div><div class="fld"><label>Stars — '+(tt.stars||5)+'</label><div class="seg">'+[1,2,3,4,5].map(s=>'<button class="'+((tt.stars||5)===s?'on':'')+'" onclick="upd(\''+id+'.items.'+i+'.stars\','+s+')">'+s+'★</button>').join('')+'</div></div></div>';});
   h+='<button class="miniadd" onclick="addItem(\''+id+'\',\'items\',{stars:5,quote:\'Great service.\',name:\'Name\',loc:\'Town\'})">+ Add testimonial</button>';
   if(p.items.length>3)h+='<div class="hint" style="color:var(--ok)">✓ Slider active ('+p.items.length+' testimonials)</div>';}
 else if(bl.t==='banner'){h+=txt('Heading',p.heading,id+'.heading')+'<div class="hint">Logos are managed in the <b>Logos</b> tab. Any logo ticked “Include in banner” shows here automatically.</div>';}
 else if(bl.t==='cta'){h+=area('Headline',p.headline,id+'.headline')+area('Subtext',p.sub,id+'.sub')+chk('Disable button',!!p.ctaDisabled,id+'.ctaDisabled')+(p.ctaDisabled?'<div class="hint">Button is hidden on the page.</div>':txt('Button',p.btn,id+'.btn')+chk('Pulse animation on button',p.pulse,id+'.pulse'));}
 else if(bl.t==='faq'){p.items.forEach((q,i)=>{h+='<div class="sub"><div class="sh"><b>Q'+(i+1)+'</b><button class="rm" onclick="rmItem(\''+id+'\',\'items\','+i+')">remove</button></div>'+txt('Question',q.q,id+'.items.'+i+'.q')+area('Answer',q.a,id+'.items.'+i+'.a')+'</div>';});h+='<button class="miniadd" onclick="addItem(\''+id+'\',\'items\',{q:\'Question?\',a:\'Answer.\'})">+ Add question</button>';}
 else if(bl.t==='rich'){h+=area('Content (HTML allowed)',p.html,id+'.html')+'<div class="hint">Or click the text in the preview to edit it directly. Enter adds a new line.</div>';}
 else if(bl.t==='form'){h+=txt('Heading',p.heading,id+'.heading')+area('Sub',p.sub,id+'.sub')+txt('Button',p.btn,id+'.btn')+chk('Pulse button',p.pulse,id+'.pulse')+'<div class="hint">Fields</div>'+chk('Name',p.fName,id+'.fName')+chk('Organisation',p.fOrg,id+'.fOrg')+chk('Email',p.fEmail,id+'.fEmail')+chk('Phone',p.fPhone,id+'.fPhone')+chk('Postcode',p.fPost,id+'.fPost')+chk('Sector picker',p.fSector,id+'.fSector')+chk('Interest checkboxes',p.fInterests,id+'.fInterests')+chk('Message',p.fMsg,id+'.fMsg');} else if(bl.t==='media'){h+=imagePicker(p.img,id+'.img')+'<div class="fld"><label>Image side</label><div class="seg"><button class="'+(p.side==='left'?'on':'')+'" onclick="upd(\''+id+'.side\',\'left\')">Left</button><button class="'+(p.side!=='left'?'on':'')+'" onclick="upd(\''+id+'.side\',\'right\')">Right</button></div></div>'+txt('Eyebrow',p.eyebrow,id+'.eyebrow')+txt('Title',p.title,id+'.title')+'<div class="fld"><label>Text</label><textarea rows="5" oninput="updT(\''+id+'.text\',this.value)">'+esc(p.text)+'</textarea></div>'+chk('Wider text',!!p.textWide,id+'.textWide')+chk('Disable button',!!p.ctaDisabled,id+'.ctaDisabled')+(p.ctaDisabled?'<div class="hint">Button is hidden on the page.</div>':txt('Button',p.cta,id+'.cta'));}
else if(bl.t==='pricing'){h+=txt('Eyebrow',p.eyebrow,id+'.eyebrow')+txt('Title',p.title,id+'.title');p.plans.forEach((pl,i)=>{h+='<div class="sub"><div class="sh"><b>Plan '+(i+1)+'</b><button class="rm" onclick="rmItem(\''+id+'\',\'plans\','+i+')">remove</button></div>'+txt('Name',pl.name,id+'.plans.'+i+'.name')+'<div class="row2">'+txt('Price',pl.price,id+'.plans.'+i+'.price')+txt('Per',pl.per,id+'.plans.'+i+'.per')+'</div>'+bulletsEd(id,'plans.'+i+'.feats',pl.feats)+txt('Button',pl.cta,id+'.plans.'+i+'.cta')+chk('Highlight this plan',pl.hl,id+'.plans.'+i+'.hl')+'</div>';});h+='<button class="miniadd" onclick="addItem(\''+id+'\',\'plans\',{name:\'Plan\',price:\'£0\',per:\'\',feats:[\'Feature\'],cta:\'Choose\',hl:false})">+ Add plan</button>';}
 else if(bl.t==='steps'){h+=txt('Eyebrow',p.eyebrow,id+'.eyebrow')+txt('Title',p.title,id+'.title');p.items.forEach((s,i)=>{h+='<div class="sub"><div class="sh"><b>Step '+(i+1)+'</b><button class="rm" onclick="rmItem(\''+id+'\',\'items\','+i+')">remove</button></div>'+txt('Title',s.title,id+'.items.'+i+'.title')+area('Text',s.text,id+'.items.'+i+'.text')+'</div>';});h+='<button class="miniadd" onclick="addItem(\''+id+'\',\'items\',{title:\'Step\',text:\'Detail.\'})">+ Add step</button>';}
 else if(bl.t==='casestudy'){h+=txt('Eyebrow',p.eyebrow,id+'.eyebrow')+txt('Title',p.title,id+'.title');p.items.forEach((cs,i)=>{h+='<div class="sub"><div class="sh"><b>Card '+(i+1)+'</b><button class="rm" onclick="rmItem(\''+id+'\',\'items\','+i+')">remove</button></div>'+imagePicker(cs.img,id+'.items.'+i+'.img')+txt('Location',cs.loc,id+'.items.'+i+'.loc')+txt('Title',cs.title,id+'.items.'+i+'.title')+'<div class="row2">'+txt('Stat',cs.stat,id+'.items.'+i+'.stat')+txt('Stat label',cs.statlabel,id+'.items.'+i+'.statlabel')+'</div></div>';});h+='<button class="miniadd" onclick="addItem(\''+id+'\',\'items\',{img:\'\',loc:\'Town\',title:\'Project\',stat:\'0\',statlabel:\'Label\'})">+ Add card</button>';}
 else if(bl.t==='clientbanner'){h+=txt('Heading',p.heading,id+'.heading');p.clients.forEach((c,i)=>{h+='<div style="display:flex;gap:5px;margin-bottom:5px"><input value="'+esc(c.name)+'" oninput="updArr2(\''+id+'\',\'clients\','+i+',\'name\',this.value)"><button class="rm" onclick="rmItem(\''+id+'\',\'clients\','+i+')">×</button></div>';});h+='<button class="miniadd" onclick="addItem(\''+id+'\',\'clients\',{name:\'Client name\',img:\'\'})">+ Add client</button>';}
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
function selectBlock(id){if(SEL===id)return;SEL=id;tplHide();renderPreview();renderBuild();}
function blockDefs(){const defs={
  hero:{eyebrow:'Eyebrow',headline:'Your headline here',sub:'Supporting sentence.',dark:true,ctaLabel:'Get a quote',ctaPulse:false,cta2:'',ctaDisabled:false,cta2Disabled:false,textWide:false,tags:''},
  stats:{items:[{n:'100+',k:'Installs'},{n:'£1,200',k:'Saved / yr'},{n:'4.9★',k:'Rating'}]},
  grid:{eyebrow:'Section',title:'Section title',cols:3,fill:'none',contactHeading:'Get in touch',contactText:'Not sure which option fits? Tell us your setup and we\'ll point you the right way.',contactBtn:'Contact us',items:[{icon:'solar',title:'Item one',desc:'Description.'},{icon:'battery',title:'Item two',desc:'Description.'},{icon:'ev',title:'Item three',desc:'Description.'}]},
  split:{lt:'For your home',ld:'Text.',lb:['Point one','Point two'],lc:'Home quote',rt:'For your business',rd:'Text.',rb:['Point one','Point two'],rc:'Business quote'},
  testi:{items:[{stars:5,quote:'Great service.',name:'Name',loc:'Town'}]},
  banner:{heading:'Trusted technology we install'},
  cta:{headline:'Ready to start?',sub:'Book a free survey today.',btn:'Get my free quote',pulse:true,ctaDisabled:false},
  faq:{items:[{q:'A question?',a:'An answer.'}]},
  rich:{html:'<p>Write anything here…</p>'},
  media:{img:'',side:'right',eyebrow:'Why choose us',title:'A section title',text:'Describe the benefit here — pair it with a real photo of your work.',cta:'Learn more',ctaDisabled:false,textWide:false},
  form:{heading:'Start the conversation',sub:'No obligation, no pushy sales. We reply within 1 working day.',btn:'Send enquiry',pulse:true,fName:true,fEmail:true,fPhone:true,fPost:true,fOrg:true,fMsg:true,fSector:true,fInterests:true}
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
  var name=BLOCKNAMES[bl.t]||bl.t;
  var box=document.getElementById('modalbox');
  box.className='modalbox modal-confirm';
  box.innerHTML='<button class="close" onclick="closeModal()">×</button>'
    +'<div class="modal-confirm-head">'
    +'<div class="modal-confirm-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg></div>'
    +'<div><h2>Delete section?</h2><p>Are you sure you want to delete this section? This cannot be undone.</p></div>'
    +'</div>'
    +'<div class="modal-confirm-body">'
    +'<div class="modal-confirm-label">Section to remove</div>'
    +'<div class="modal-confirm-target"><span class="gr">⋮⋮</span><span class="nm">'+esc(name)+'</span><span class="ty">'+esc(bl.t)+'</span></div>'
    +'</div>'
    +'<div class="modal-confirm-foot">'
    +'<button type="button" class="mbtn mbtn-ghost" onclick="closeModal()">Cancel</button>'
    +'<button type="button" class="mbtn mbtn-danger" onclick="doDelBlock(\''+id+'\')">Delete section</button>'
    +'</div>';
  document.getElementById('modal').classList.add('show');
}
function doDelBlock(id){closeModal();delBlock(id);}
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
function renderPagePickerList(){var el=document.getElementById('pagePickerList');var countEl=document.getElementById('pagePickerCount');if(!el)return;var indices=pagePickerIndices();var cur=STATE.current;var labels={home:'Home',landing:'Landing',case:'Case study',page:'Page'};if(countEl)countEl.textContent=PAGE_PICKER_SEARCH?indices.length+' of '+STATE.pages.length:STATE.pages.length+' pages';if(!indices.length){el.innerHTML='<div class="page-picker-empty">No pages match</div>';return;}el.innerHTML=indices.map(function(i){var pg=STATE.pages[i];var kind=dashPageBadge(pg);return '<button type="button" class="page-picker-item'+(i===cur?' on':'')+'" role="option" aria-selected="'+(i===cur)+'" onclick="pagePickerPick('+i+')"><span class="page-picker-item-name">'+esc(pg.name)+'</span><span class="page-picker-item-meta">'+esc(pg.slug||'/')+' · '+labels[kind]+'</span></button>';}).join('');}
function renderPageSel(){var lbl=document.getElementById('pagePickerLabel');if(lbl&&page())lbl.textContent=page().name;var menu=document.getElementById('pagePickerMenu');if(menu&&menu.classList.contains('open'))renderPagePickerList();}
function togglePagePicker(ev){if(ev)ev.stopPropagation();var menu=document.getElementById('pagePickerMenu');var btn=document.getElementById('pagePickerTrigger');if(!menu)return;if(menu.classList.contains('open')){closePagePicker();return;}closeToolbarMore();menu.classList.add('open');if(btn)btn.setAttribute('aria-expanded','true');PAGE_PICKER_SEARCH='';var inp=document.getElementById('pagePickerSearch');if(inp){inp.value='';inp.focus();}renderPagePickerList();}
function closePagePicker(){var menu=document.getElementById('pagePickerMenu');var btn=document.getElementById('pagePickerTrigger');if(menu)menu.classList.remove('open');if(btn)btn.setAttribute('aria-expanded','false');PAGE_PICKER_SEARCH='';}
function pagePickerSearch(q){PAGE_PICKER_SEARCH=q;renderPagePickerList();}
function pagePickerPick(i){closePagePicker();switchPage(i);}
function renderToolbarPageType(){var el=document.getElementById('toolbarPageType');if(!el)return;if(MODE!=='edit'||!page()){el.innerHTML='';return;}var kind=dashPageBadge(page());var labels={home:'Home',landing:'Landing',case:'Case study',page:'Page'};el.innerHTML='<span class="toolbar-type-badge toolbar-type-'+kind+'">'+labels[kind]+'</span>';var lbl=document.getElementById('toolbarPageLabel');if(lbl)lbl.textContent=page().name;}
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
function imgMetaEmpty(){return {src:'',alt:'',title:'',desc:'',caption:'',keywords:'',loading:'lazy',decorative:false};}
function imgResolve(val){
 if(!val)return imgMetaEmpty();
 if(typeof val==='string')return {src:val,alt:'',title:'',desc:'',caption:'',keywords:'',loading:'lazy',decorative:false};
 return {src:val.src||'',alt:val.alt||'',title:val.title||'',desc:val.desc||'',caption:val.caption||'',keywords:val.keywords||'',loading:val.loading||'lazy',decorative:!!val.decorative};
}
function imgSrc(val){return imgResolve(val).src;}
function pvImgClick(ev,path){ev.stopPropagation();const blockId=path.split('.')[0];if(blockId)selectBlock(blockId);editPlacementImgMeta(path);}
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
 return '<div class="imgseo-card" onclick="editPlacementImgMeta(\''+path+'\')" title="Edit SEO for this section"><img src="'+m.src+'"><div class="imgseo-card-body"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span class="imgseo-pill">'+SPARK+' Section SEO</span>'+(tags.length?'<span style="font-family:var(--mono);font-size:.54rem;color:var(--muted)">'+tags.join(' · ')+'</span>':'')+'</div><div class="imgseo-card-row"><b>Alt</b> '+(m.alt?esc(m.alt):'<span style="opacity:.55">Not set</span>')+'</div>'+(m.title?'<div class="imgseo-card-row"><b>Title</b> '+esc(m.title)+'</div>':'')+(m.caption?'<div class="imgseo-card-row"><b>Caption</b> '+esc(m.caption)+'</div>':'')+'<div class="imgseo-card-hint">Click image in preview or here to edit SEO</div></div></div>';
}
function imagePicker(cur,path){const imgs=STATE.site.images||[];const src=imgSrc(cur);
 let h='<div class="fld"><label>Image</label><label class="miniadd" style="display:inline-block;cursor:pointer;margin-bottom:6px">+ Upload<input type="file" accept="image/*" multiple style="display:none" onchange="imgUpload(this,\''+path+'\')"></label>';
 if(imgs.length){h+='<div class="iconpick" style="grid-template-columns:repeat(4,1fr)">'+imgs.map(im=>'<button class="'+(src===im.data?'on':'')+'" style="aspect-ratio:4/3;overflow:hidden" onclick="pickImg(\''+path+'\',\''+im.id+'\')" title="'+esc(im.name||im.cat||'Image')+'"><img src="'+im.data+'" style="width:100%;height:100%;object-fit:cover"></button>').join('')+'</div>';}
 else{h+='<div class="hint">No images yet — upload one above.</div>';}
 h+=sectionImgMeta(cur,path)+'</div>';return h;}
function pickImg(path,imgId){const im=(STATE.site.images||[]).find(x=>x.id===imgId);if(!im)return;const cur=getAtPath(path);const existing=imgSrc(cur)===im.data?imgResolve(cur):{...imgMetaEmpty(),src:im.data};openPlacementImgMeta(path,im.data,im.name,existing);}
function editPlacementImgMeta(path){const cur=getAtPath(path);const m=imgResolve(cur);if(!m.src){alert('Pick an image first.');return;}openPlacementImgMeta(path,m.src,'',m);}
function openPlacementImgMeta(path,src,name,existing){const ex=imgResolve(existing);ex.src=src;window._imgMetaPlacementPath=path;showImgMetaModal({data:src,name:name||'',alt:ex.alt,title:ex.title,desc:ex.desc,caption:ex.caption,keywords:ex.keywords,loading:ex.loading,decorative:ex.decorative},{placement:true,suggestedAlt:ex.alt||suggestAltFromName(name)});}
function renderImages(){const el=document.getElementById('panel-images');const imgs=STATE.site.images||[];const cats=[...new Set(imgs.map(im=>im.cat).filter(Boolean))];
 let h='<div class="ph">'+SPARK+'Image library</div><div class="hint">Upload images here once, then reuse them in any section. <b>SEO metadata</b> (alt text, title) is added when you pick an image in the <b>Sections</b> tab — each section can have its own SEO for the same file.</div>';
 h+='<div class="fld"><label>Upload image(s)</label><input type="file" accept="image/*" multiple id="imgup" onchange="imgUpload(this)"></div>';
 h+='<div class="fld"><label>Filter by category</label><select onchange="IMGFILTER=this.value;renderImages()"><option value="">All ('+imgs.length+')</option>'+cats.map(c=>'<option value="'+esc(c)+'"'+(IMGFILTER===c?' selected':'')+'>'+esc(c)+'</option>').join('')+'</select></div>';
 const shown=imgs.map((im,i)=>({im,i})).filter(x=>!IMGFILTER||x.im.cat===IMGFILTER);
 h+=shown.length?'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'+shown.map(({im,i})=>'<div style="border:1px solid var(--line);border-radius:3px;overflow:hidden;position:relative"><img src="'+im.data+'" style="width:100%;height:68px;object-fit:cover;display:block"><button class="rm" style="position:absolute;top:2px;right:4px;background:rgba(0,0,0,.55);color:#fff;border-radius:2px;padding:1px 5px" onclick="imgRm('+i+')">×</button><div style="font-size:.68rem;padding:5px 7px;color:var(--muted);border-top:1px solid var(--line);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+(im.name?esc(im.name):'Image')+(im.cat?' · '+esc(im.cat):'')+'</div></div>').join('')+'</div>':'<div class="hint">No images yet — upload one above.</div>';
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
 if(!f.decorative&&!f.alt){alert('Please add alt text — it helps SEO and accessibility. Or mark the image as decorative.');return;}
 const placement={src:d.data,alt:f.decorative?'':f.alt,title:f.title,desc:f.desc,caption:f.caption,keywords:f.keywords,loading:f.loading||'lazy',decorative:f.decorative};
 const placementPath=window._imgMetaPlacementPath;
 closeImgMetaModal();
 if(placementPath){upd(placementPath,placement);return;}
 save();renderImages();if(MODE==='library')renderLibrary();}
function imgMetaUpd(i,k,v){STATE.site.images[i][k]=v;save();if(k==='cat'){renderImages();if(MODE==='library')renderLibrary();}}
function imgRm(i){STATE.site.images.splice(i,1);renderImages();if(MODE==='library')renderLibrary();save();}

/* ============ SEO TAB ============ */
function setPageTheme(t){const pg=page();pg.theme=t;renderPreview();renderSEO();save();}
function setPageType(kind){var pg=page();var slug=(pg.slug||'').replace(/\/$/,'')||'/';if(slug==='/'||slug==='')return;if(kind==='page')pg.type='page';else if(kind==='landing')pg.type='landing';else if(kind==='case')pg.type='casestudy';renderSEO();renderToolbarPageType();save();}
function pageTypePickerHtml(pg){var slug=(pg.slug||'').replace(/\/$/,'')||'/';if(slug==='/'||slug==='')return '<div class="fld"><label>Page type</label><div class="hint" style="margin:0">Homepage — set automatically because the URL slug is <code>/</code>.</div></div>';var kind=dashPageBadge(pg);return '<div class="fld"><label>Page type</label><div class="seg"><button type="button" class="'+(kind==='page'?'on':'')+'" onclick="setPageType(\'page\')">Page</button><button type="button" class="'+(kind==='landing'?'on':'')+'" onclick="setPageType(\'landing\')">Landing</button><button type="button" class="'+(kind==='case'?'on':'')+'" onclick="setPageType(\'case\')">Case study</button></div><div class="hint" style="margin-top:6px;margin-bottom:0">Used for dashboard badges and filters. Create shortcuts: <b>+ Landing page</b> or <b>+ Case study</b> on the dashboard.</div></div>';}
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
  if(!next){alert('URL slug cannot be empty.');renderSEO();return;}
  // `/` is allowed when free — that page becomes the homepage. Block only if another page already owns it.
  if(next==='/'&&pageSlugTaken('/',STATE.current)){showSeoSlugHomeOnlyErr('The URL slug / is already used by the homepage. Only one page can use /.');return;}
  if(pageSlugTaken(next,STATE.current)){alert('URL slug “'+next+'” is already used by another page. Choose a different slug.');renderSEO();return;}
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
  {id:uid(),t:'testi',p:{items:[{stars:5,quote:'Honest, tidy and no pressure — exactly what you want.',name:'Sarah M.',loc:'Cardiff'},{stars:5,quote:'Spot on from survey to switch-on.',name:'David R.',loc:'Swansea'},{stars:5,quote:'Straight answers and a payback we\'re already hitting.',name:'Gareth L.',loc:'Newport'}]}},
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
 return '<!DOCTYPE html><html lang="en-GB"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>'+esc(seo.title||pg.name+' — Heliaxis')+'</title>'+meta+
  '<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">'+
  '<style>'+css+'</style></head><body'+(pg.theme==='dark'?' class="dk"':'')+'>'+body+'</body></html>';
}
function download(name,text){const b=new Blob([text],{type:'text/html'});const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download=name;a.click();URL.revokeObjectURL(u);}
async function exportHTML(){var pg=page();var slug=(pg.slug||'/').replace(/^\//,'').replace(/[^a-z0-9]+/gi,'-').replace(/^-+|-+$/g,'')||'page';download(slug+'.html',await pageHTML(pg));}
function exportJSON(){const b=new Blob([JSON.stringify(STATE,null,2)],{type:'application/json'});const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download='heliaxis-site.json';a.click();URL.revokeObjectURL(u);}
function siteOrigin(){var env=(typeof process!=='undefined'&&process.env.NEXT_PUBLIC_SITE_URL)||'';if(env)return String(env).replace(/\/$/,'');return (location.origin||'').replace(/\/$/,'');}
function publicPageUrl(slug){var s=(slug||'/').trim()||'/';if(s==='/'||s==='')return siteOrigin()+'/';if(s.charAt(0)!=='/')s='/'+s;return siteOrigin()+s;}
function buildPublishCss(){return PUBLISH_STYLES.root+'*,*::before,*::after{box-sizing:border-box}html,body{height:auto;overflow:auto}body{margin:0;font-family:var(--body);background:var(--paper);color:var(--ink)}body.dk{background:var(--ink)}'+PUBLISH_STYLES.preview;}
function openPublish(){
  var box=document.getElementById('modalbox');
  box.className='modalbox';
  var pg=page();
  var liveUrl=pg?publicPageUrl(pg.slug):siteOrigin()+'/';
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
async function openPublishPreview(pageIdx){
  var idx=typeof pageIdx==='number'?pageIdx:STATE.current;
  var pg=STATE.pages[idx];
  if(!pg)return;
  var msg=document.getElementById('pubmsg');
  // Open synchronously on the click so the browser does not block the tab.
  var win=window.open('about:blank','_blank');
  if(!win){
    var tip='Allow pop-ups for this site to open the preview in a new tab.';
    if(msg){msg.style.color='var(--amber-2)';msg.textContent='⚠ '+tip;}
    else alert(tip);
    return;
  }
  try{
    win.document.write('<!DOCTYPE html><html><head><title>Building preview…</title></head><body style="font-family:system-ui;padding:40px;color:#666">Building live preview…</body></html>');
    win.document.close();
    if(msg){msg.style.color='var(--muted)';msg.textContent='Opening preview…';}
    var html=await pageHTML(pg);
    html=html.replace(/<title>[^<]*<\/title>/i,'<title>'+esc(pg.name||'Page')+' · Preview (not published)</title>');
    win.document.open();
    win.document.write(html);
    win.document.close();
    if(msg){msg.style.color='var(--ok)';msg.textContent='✓ Preview opened in a new tab — not published yet.';}
  }catch(e){
    var err=e&&e.message?e.message:'Could not open preview';
    try{win.document.open();win.document.write('<!DOCTYPE html><html><body style="font-family:system-ui;padding:40px;color:#b33">⚠ '+String(err).replace(/</g,'&lt;')+'</body></html>');win.document.close();}catch(e2){}
    if(msg){msg.style.color='var(--amber-2)';msg.textContent='⚠ '+err;}
    else alert(err);
  }
}
async function doPublish(){
  if(!document.getElementById('modal')||!document.getElementById('modal').classList.contains('show')||!document.getElementById('pubmsg'))openPublish();
  var m=document.getElementById('pubmsg');
  if(!m)return;
  m.style.color='var(--muted)';m.textContent='Saving & publishing…';
  try{
    await save();
    await ensurePublishStyles();
    var css=buildPublishCss();
    var pages=STATE.pages.map(function(pg){
      return{slug:pg.slug,name:pg.name,theme:pg.theme||'',seo:pg.seo||{},
        html:pg.blocks.map(function(b){return '<div style="'+spacingStyle(b.p)+'">'+renderBlock(b)+'</div>';}).join('\n')};
    });
    var r=await fetch('/api/cms/publish',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',
      body:JSON.stringify({rendered:{css:css,pages:pages}})});
    if(!r.ok){var em='Publish failed';try{em=(await r.json()).error||em;}catch(e){}if(r.status===401)throw new Error('You must be signed in as an approved admin to publish.');throw new Error(em);}
    var liveUrl=publicPageUrl(page()?page().slug:'/');
    m.style.color='var(--ok)';
    m.innerHTML='✓ <b>Published — live on your site</b>'
      +'<div style="margin-top:10px"><a href="'+esc(liveUrl)+'" target="_blank" rel="noopener" style="color:var(--amber-2);font-weight:700;text-decoration:underline">View live page →</a></div>'
      +'<div style="margin-top:6px;font-family:var(--mono);font-size:.72rem;color:var(--muted);word-break:break-all">'+esc(liveUrl)+'</div>'
      +'<div style="margin-top:10px;color:var(--muted);font-size:.82rem">No Vercel redeploy needed — content is live now (including the homepage when you publish Home).</div>';
  }catch(e){
    m.style.color='var(--amber-2)';
    m.textContent='⚠ '+(e&&e.message?e.message:'Publish failed');
  }
}
function closeModal(){document.getElementById('modal').classList.remove('show')}
document.getElementById('modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal()});
document.addEventListener('keydown',function(e){if(MODE!=='dash')return;if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes((document.activeElement&&document.activeElement.tagName)||'')){e.preventDefault();var el=document.getElementById('dash-page-search');if(el)el.focus();}});
document.addEventListener('click',function(e){var wrap=document.querySelector('.toolbar-more-wrap');if(wrap&&!wrap.contains(e.target))closeToolbarMore();var picker=document.getElementById('pagePicker');if(picker&&!picker.contains(e.target))closePagePicker();});
window.addEventListener('popstate',function(){var slug=getSlugFromPath();if(!slug){goDash(true);return;}var idx=findPageByEditSlug(slug);if(idx>=0){STATE.current=idx;SEL=null;MODE='edit';setMode();renderAll();tab('build');}else goDash(true);});

/* ===== dashboard URL routing ===== */
function normTitle(s){return (s||'').trim();}
function titleKey(s){return normTitle(s).toLowerCase();}
function pageTitleTaken(name,exceptIdx){var k=titleKey(name);if(!k)return false;for(var i=0;i<STATE.pages.length;i++){if(i===exceptIdx)continue;if(titleKey(STATE.pages[i].name)===k)return true;}return false;}
function uniquePageTitle(base,exceptIdx){base=normTitle(base)||'Untitled page';if(!pageTitleTaken(base,exceptIdx))return base;var n=2;while(pageTitleTaken(base+' '+n,exceptIdx))n++;return base+' '+n;}
function ensureUniquePageTitles(){var changed=false;for(var i=0;i<STATE.pages.length;i++){if(!pageTitleTaken(STATE.pages[i].name,i))continue;STATE.pages[i].name=uniquePageTitle(STATE.pages[i].name,i);changed=true;}return changed;}
function trySetPageName(idx,name){name=normTitle(name);if(!name){alert('Page title cannot be empty.');return false;}if(pageTitleTaken(name,idx)){alert('A page titled “'+name+'” already exists. Choose a different title.');return false;}STATE.pages[idx].name=name;syncPageSlugFromTitle(STATE.pages[idx],idx);save();renderAll();if(MODE==='edit'&&STATE.current===idx){renderSEO();syncCmsUrl(false);}return true;}
function pageNameUpd(v){if(!trySetPageName(STATE.current,v))renderSEO();}
function slugifyTitle(s){return (s||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');}
function titleToSlug(name){var base=slugifyTitle(name)||'page';return '/'+base;}
function normSlug(s){s=normTitle(s);if(!s||s==='/')return '/';s=s.replace(/^\/+/,'');var base=slugifyTitle(s)||'page';return '/'+base;}
function pageSlugTaken(slug,exceptIdx){var k=normSlug(slug);if(!k)return false;if(k==='/blog'||k.indexOf('/blog/')===0)return true;for(var i=0;i<STATE.pages.length;i++){if(i===exceptIdx)continue;if(normSlug(STATE.pages[i].slug)===k)return true;}return false;}
function uniquePageSlug(base,exceptIdx){base=normSlug(base);if(base==='/')return '/';if(!pageSlugTaken(base,exceptIdx))return base;var n=2;while(pageSlugTaken(base+'-'+n,exceptIdx))n++;return base+'-'+n;}
function ensureUniquePageSlugs(){var changed=false;for(var i=0;i<STATE.pages.length;i++){var pg=STATE.pages[i];var cur=normSlug(pg.slug);if(cur==='/'&&!pageSlugTaken('/',i)){if(pg.slug!=='/'){pg.slug='/';pg.seo=pg.seo||{};pg.seo.slug='/';changed=true;}continue;}if(cur==='/'&&pageSlugTaken('/',i)){var next=uniquePageSlug(titleToSlug(pg.name||'page'),i);if(next==='/')next=uniquePageSlug('/page',i);pg.slug=next;pg.seo=pg.seo||{};pg.seo.slug=next;changed=true;continue;}if(!pageSlugTaken(cur,i)){if(pg.slug!==cur){pg.slug=cur;pg.seo=pg.seo||{};pg.seo.slug=cur;changed=true;}continue;}var fixed=uniquePageSlug(cur,i);pg.slug=fixed;pg.seo=pg.seo||{};pg.seo.slug=fixed;changed=true;}return changed;}
function isHomePage(pg){var cur=(pg.slug||'/').replace(/\/$/,'')||'/';return cur==='/'||cur==='';}
function slugFromPageTitle(pg){if(isHomePage(pg))return '/';return titleToSlug(pg.name);}
function syncPageSlugFromTitle(pg,idx){if(isHomePage(pg)){pg.slug='/';pg.seo=pg.seo||{};pg.seo.slug='/';return;}var except=typeof idx==='number'?idx:STATE.pages.indexOf(pg);var next=uniquePageSlug(slugFromPageTitle(pg),except);pg.slug=next;pg.seo=pg.seo||{};pg.seo.slug=next;}
function repairLegacyUntitledSlugs(){var changed=false;STATE.pages.forEach(function(pg,i){if(!pg.name||isHomePage(pg))return;if(!/^\/untitled-[a-z0-9]+$/i.test(pg.slug||''))return;syncPageSlugFromTitle(pg,i);changed=true;});return changed;}
function pageNameInput(v){var pg=page();var cur=(pg.slug||'').replace(/\/$/,'')||'/';if(cur==='/'||cur==='')return;var slugInp=document.getElementById('seo-slug-input');if(!slugInp)return;slugInp.value=uniquePageSlug(titleToSlug(normTitle(v)),STATE.current);}
function pageEditSlug(pg){var base=slugifyTitle(pg.name);if(!base)base=slugifyTitle((pg.slug||'/').replace(/^\//,''))||'page';return base;}
function getSlugFromPath(){var parts=location.pathname.replace(/\/+$/,'').split('/');if(parts.length<3||parts[1]!=='admin')return null;var s=decodeURIComponent(parts[2]);if(!s||s==='enquiries'||s==='approvals'||s==='blog')return null;return s;}
function findPageByEditSlug(slug){if(!slug)return -1;slug=decodeURIComponent(slug).toLowerCase();return STATE.pages.findIndex(function(pg){return pageEditSlug(pg).toLowerCase()===slug;});}
function cmsAdminPath(slug){return '/admin/'+encodeURIComponent(slug);}
function syncCmsUrl(replace){var path='/admin';if(MODE==='edit'&&page())path=cmsAdminPath(pageEditSlug(page()));if(location.pathname===path){document.title=MODE==='edit'&&page()?page().name+' · Heliaxis CMS':'Heliaxis CMS';return;}var state={cmsMode:MODE,slug:MODE==='edit'&&page()?pageEditSlug(page()):null};if(replace)history.replaceState(state,'',path);else history.pushState(state,'',path);document.title=MODE==='edit'&&page()?page().name+' · Heliaxis CMS':'Heliaxis CMS';}
/* ===== extension: template variety, case studies, section preview ===== */
let IMGFILTER='';
let DASH_PAGE_SEARCH='';
let DASH_PAGE_NUM=1;
let DASH_PAGE_SORT='az';
let DASH_PAGE_TYPE='';
const DASH_PAGE_SIZE=12;
var dashSearchTimer=null;
function dashPageTypeMatches(pg){if(!DASH_PAGE_TYPE)return true;return dashPageBadge(pg)===DASH_PAGE_TYPE;}
function dashTypeCounts(){var c={all:STATE.pages.length,home:0,landing:0,case:0,page:0};STATE.pages.forEach(function(pg){c[dashPageBadge(pg)]++;});return c;}
function dashPageMatches(pg){if(!DASH_PAGE_SEARCH)return true;var q=DASH_PAGE_SEARCH.toLowerCase();return (pg.name||'').toLowerCase().indexOf(q)>=0||(pg.slug||'').toLowerCase().indexOf(q)>=0;}
function dashFilteredIndices(){var out=[];STATE.pages.forEach(function(pg,i){if(dashPageMatches(pg)&&dashPageTypeMatches(pg))out.push(i);});out.sort(function(a,b){var na=(STATE.pages[a].name||'').toLowerCase();var nb=(STATE.pages[b].name||'').toLowerCase();if(na===nb)return a-b;return DASH_PAGE_SORT==='za'?(na<nb?1:-1):(na<nb?-1:1);});return out;}
function dashPageSearch(q){DASH_PAGE_SEARCH=q;DASH_PAGE_NUM=1;clearTimeout(dashSearchTimer);dashSearchTimer=setTimeout(renderDashPages,200);}
function dashPageTypeSet(v){DASH_PAGE_TYPE=v;DASH_PAGE_NUM=1;renderDashPages();}
function dashPageFilterHtml(){var tc=dashTypeCounts();return '<select class="dash-sort" id="dash-page-type" onchange="dashPageTypeSet(this.value)" title="Filter by page type"><option value="">All pages ('+tc.all+')</option><option value="home"'+(DASH_PAGE_TYPE==='home'?' selected':'')+'>Home ('+tc.home+')</option><option value="landing"'+(DASH_PAGE_TYPE==='landing'?' selected':'')+'>Landing ('+tc.landing+')</option><option value="case"'+(DASH_PAGE_TYPE==='case'?' selected':'')+'>Case study ('+tc.case+')</option><option value="page"'+(DASH_PAGE_TYPE==='page'?' selected':'')+'>Page ('+tc.page+')</option></select>';}
function dashPagesHeadCount(total){if(DASH_PAGE_SEARCH||DASH_PAGE_TYPE)return total+' of '+STATE.pages.length;return ''+STATE.pages.length;}
function dashClearSearch(){DASH_PAGE_SEARCH='';var el=document.getElementById('dash-page-search');if(el)el.value='';DASH_PAGE_NUM=1;renderDashPages();}
function dashPageGo(n){DASH_PAGE_NUM=Math.max(1,+n||1);renderDashPages();var sec=document.getElementById('dash-pages-sec');if(sec)sec.scrollIntoView({behavior:'smooth',block:'start'});}
function dashPageBadge(pg){var slug=(pg.slug||'').replace(/\/$/,'')||'/';if(slug==='/'||slug==='')return 'home';var t=(pg.type||'page').toLowerCase();if(t==='landing')return 'landing';if(t==='casestudy'||t==='case')return 'case';if(t==='home')return 'home';var name=(pg.name||'').toLowerCase();if(name.indexOf('landing')>=0)return 'landing';if(slug.indexOf('case-study')>=0||name.indexOf('case study')>=0)return 'case';return 'page';}
function dashPageBadgeHtml(kind){var labels={home:'Home',landing:'Landing',case:'Case study',page:'Page'};return '<span class="pbadge pbadge-'+kind+'">'+labels[kind]+'</span>';}
function dashPageCard(i){var pg=STATE.pages[i];var secs=(pg.blocks||[]).length;var badge=dashPageBadge(pg);return '<article class="pcard" onclick="editPage('+i+')" role="button" tabindex="0" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();editPage('+i+')}"><div class="pthumb"><div class="pthumb-frame"><div class="zi" id="thumb'+i+'"></div></div><div class="pthumb-shade"></div>'+dashPageBadgeHtml(badge)+'<span class="pthumb-open"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>Open editor</span></div><div class="pcard-body"><h3 class="pcard-name">'+esc(pg.name)+'</h3><div class="pcard-meta-row"><span class="pcard-secs">'+secs+' section'+(secs===1?'':'s')+'</span></div><div class="pcard-actions" onclick="event.stopPropagation()"><button type="button" class="pcard-btn pcard-btn-primary" onclick="editPage('+i+')">Edit page</button><button type="button" class="pcard-btn" onclick="openPublishPreview('+i+')" title="Preview how this page will look when published">Preview</button><button type="button" class="pcard-btn pcard-btn-danger" onclick="delPage('+i+')" title="Delete page">Delete</button></div></div></article>';}
function dashStatsHtml(){var nc=newCount();var imgs=(STATE.site&&STATE.site.images)?STATE.site.images.length:0;return '<div class="dash-stats"><div class="dash-stat"><span class="dash-stat-n">'+STATE.pages.length+'</span><span class="dash-stat-l">Pages</span></div><div class="dash-stat'+(nc?' dash-stat-hot':'')+'"><span class="dash-stat-n">'+nc+'</span><span class="dash-stat-l">New leads</span></div><div class="dash-stat"><span class="dash-stat-n">'+imgs+'</span><span class="dash-stat-l">Images</span></div><a class="dash-stat dash-stat-link" href="/admin/blog"><span class="dash-stat-n">✎</span><span class="dash-stat-l">Blog</span></a><a class="dash-stat dash-stat-link" href="/" target="_blank" rel="noopener"><span class="dash-stat-n">↗</span><span class="dash-stat-l">View live site</span></a></div>';}
function renderDashThumb(i){var pg=STATE.pages[i];var t=document.getElementById('thumb'+i);if(!t)return;t.className='zi'+(pg.theme==='dark'?' dk':'');t.innerHTML=pg.blocks.length?pg.blocks.map(renderBlock).join(''):'<div class="pthumb-empty">Empty page — click to add sections</div>';}
function renderDashPages(){var indices=dashFilteredIndices();var total=indices.length;var pages=Math.max(1,Math.ceil(total/DASH_PAGE_SIZE));if(DASH_PAGE_NUM>pages)DASH_PAGE_NUM=pages;var start=(DASH_PAGE_NUM-1)*DASH_PAGE_SIZE;var slice=indices.slice(start,start+DASH_PAGE_SIZE);var searchEl=document.getElementById('dash-page-search');var hadFocus=searchEl&&document.activeElement===searchEl;var selStart=hadFocus?searchEl.selectionStart:0;var selEnd=hadFocus?searchEl.selectionEnd:0;var hEl=document.getElementById('dash-pages-h');if(hEl)hEl.innerHTML=SPARK+'Your pages ('+dashPagesHeadCount(total)+')';var clr=document.getElementById('dash-search-clear');if(clr)clr.style.display=DASH_PAGE_SEARCH?'inline-flex':'none';var typeEl=document.getElementById('dash-page-type');if(typeEl){var tc=dashTypeCounts();typeEl.innerHTML='<option value="">All pages ('+tc.all+')</option><option value="home"'+(DASH_PAGE_TYPE==='home'?' selected':'')+'>Home ('+tc.home+')</option><option value="landing"'+(DASH_PAGE_TYPE==='landing'?' selected':'')+'>Landing ('+tc.landing+')</option><option value="case"'+(DASH_PAGE_TYPE==='case'?' selected':'')+'>Case study ('+tc.case+')</option><option value="page"'+(DASH_PAGE_TYPE==='page'?' selected':'')+'>Page ('+tc.page+')</option>';}var grid=document.getElementById('dash-pages-grid');if(!grid)return;var h='';if(!total)h+='<div class="dash-empty">'+(DASH_PAGE_SEARCH||DASH_PAGE_TYPE?'No pages match your filters. <button type="button" class="dash-link-btn" onclick="dashClearFilters()">Clear filters</button>':'No pages yet. Create one above.')+'</div>';else slice.forEach(function(i){h+=dashPageCard(i);});grid.innerHTML=h;var pager=document.getElementById('dash-pages-pager');if(pager){if(total<=DASH_PAGE_SIZE)pager.innerHTML='';else pager.innerHTML='<div class="dash-pager"><button type="button" class="dash-pg-btn"'+(DASH_PAGE_NUM<=1?' disabled':'')+' onclick="dashPageGo('+(DASH_PAGE_NUM-1)+')">← Previous</button><span class="dash-pg-info">Page '+DASH_PAGE_NUM+' of '+pages+' · '+total+' page'+(total===1?'':'s')+'</span><button type="button" class="dash-pg-btn"'+(DASH_PAGE_NUM>=pages?' disabled':'')+' onclick="dashPageGo('+(DASH_PAGE_NUM+1)+')">Next →</button></div>';}slice.forEach(renderDashThumb);if(hadFocus){var el2=document.getElementById('dash-page-search');if(el2){el2.focus();try{el2.setSelectionRange(selStart,selEnd);}catch(e){}}}}
function dashClearFilters(){DASH_PAGE_SEARCH='';DASH_PAGE_TYPE='';DASH_PAGE_NUM=1;var el=document.getElementById('dash-page-search');if(el)el.value='';renderDashPages();}
var TEMPLATE_MAP=['product','dark','image','finance','minimal','grant','image','sector','product','grant','image','dark','minimal','sector','image'];
var THEME_BY_TPL={product:'light',dark:'dark',image:'light',minimal:'light',finance:'light',grant:'light',sector:'light'};
var TPL_LABEL={product:'Light · classic',dark:'Dark · bold',image:'Image-led',minimal:'Minimal · typographic',finance:'Finance · pricing',grant:'Grant · steps',sector:'Sector · case studies'};
window.EXTRA_DEFAULTS={
 pricing:{eyebrow:'Ways to pay',title:'Choose how you fund it',plans:[{name:'Buy outright',price:'From £5,900',per:'one-off',feats:['Own it outright','Best lifetime return','25-year warranty'],cta:'Get a quote',hl:false},{name:'Finance',price:'£0 upfront',per:'spread monthly',feats:['Spread the cost','Often bill-neutral','Flexible terms'],cta:'Check finance',hl:true},{name:'PPA',price:'£0 upfront',per:'pay per unit',feats:['No capital outlay','Funder-owned & maintained','Savings from day one'],cta:'See PPA',hl:false}]},
 steps:{eyebrow:'How it works',title:'From enquiry to switch-on',items:[{title:'Free survey',text:'We assess your roof, usage and goals.'},{title:'Design & quote',text:'A clear proposal with honest figures.'},{title:'Install',text:'MCS-certified, tidy and on schedule.'},{title:'Switch on',text:'Start saving — tracked from your phone.'}]},
 casestudy:{eyebrow:'Our work',title:'Recent projects',items:[{img:'',loc:'Cardiff',title:'4-bed home retrofit',stat:'£1,400/yr',statlabel:'Estimated saving'},{img:'',loc:'Newport',title:'Warehouse rooftop',stat:'55 kWp',statlabel:'System installed'},{img:'',loc:'Swansea',title:'Care home',stat:'42%',statlabel:'Grid reduction'}]},
 clientbanner:{heading:'Trusted by businesses across South Wales',clients:[{name:'Morgan Ltd',img:''},{name:'Valley Foods',img:''},{name:'Cambrian Care',img:''},{name:'Severn Logistics',img:''},{name:'Tafwyl Retail',img:''}]}
};
function altLanding(c,tpl){const[name,headline,sub,benefits,cta]=c;const U=()=>uid();
 const hero={id:U(),t:'hero',p:{eyebrow:'MCS-certified · South Wales',headline,sub,dark:true,ctaLabel:cta,ctaPulse:true,cta2:''}};
 const stats={id:U(),t:'stats',p:{items:[{n:'1,200+',k:'Installs'},{n:'4.9★',k:'Rated'},{n:'25 yr',k:'Warranty'},{n:'£0',k:'Survey'}]}};
 const bgrid={id:U(),t:'grid',p:{eyebrow:'Why '+name.toLowerCase(),title:'What you get',cols:benefits.length===4?2:3,fill:'contact',items:benefits.map((b,i)=>({icon:['shield','coin','solar','battery','ev','clock'][i%6],title:b,desc:''}))}};
 const media=(side)=>({id:U(),t:'media',p:{img:'',side:side||'right',eyebrow:name,title:headline,text:sub+' Pair this with a real photo of one of your installs.',cta}});
 const testi={id:U(),t:'testi',p:{speed:36,items:[{stars:5,quote:'Honest, tidy and no pressure — exactly what you want.',name:'Sarah M.',loc:'Cardiff'},{stars:5,quote:'Spot on from survey to switch-on.',name:'David R.',loc:'Swansea'},{stars:5,quote:'Straight answers and a payback we\'re already hitting.',name:'Gareth L.',loc:'Newport'}]}};
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
const SAMPLES={hero:{eyebrow:'Eyebrow',headline:'A punchy headline',sub:'Supporting line of copy.',dark:true,ctaLabel:'Get a quote',ctaPulse:false,cta2:'Learn more'},stats:{items:[{n:'1,200+',k:'Installs'},{n:'4.9★',k:'Rated'},{n:'25 yr',k:'Warranty'}]},grid:{eyebrow:'Section',title:'Grid section',cols:3,items:[{icon:'solar',title:'Item one',desc:'Description.'},{icon:'battery',title:'Item two',desc:'Description.'},{icon:'ev',title:'Item three',desc:'Description.'}]},split:{lt:'For your home',ld:'Text.',lb:['Point one','Point two'],lc:'Home quote',rt:'For your business',rd:'Text.',rb:['Point one','Point two'],rc:'Business quote'},media:{img:'',side:'right',eyebrow:'Why us',title:'Image + text',text:'A benefit paired with a photo.',cta:'Learn more',ctaDisabled:false,textWide:false},testi:{speed:36,items:[{stars:5,quote:'Great service.',name:'Sarah',loc:'Cardiff'},{stars:5,quote:'Highly recommend.',name:'Dai',loc:'Swansea'},{stars:5,quote:'Spot on.',name:'Gwen',loc:'Newport'}]},banner:{heading:'Trusted technology we install'},form:{heading:'Book your free survey',sub:'No obligation.',btn:'Send',pulse:false,fName:true,fEmail:true,fPhone:true,fPost:false,fMsg:true},cta:{headline:'Ready to start?',sub:'Book a free survey.',btn:'Get a quote',pulse:false},faq:{items:[{q:'A question?',a:'An answer.'},{q:'Another?',a:'Another answer.'}]},rich:{html:'<p>Rich text paragraph…</p>'}};
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
 document.querySelector('.main').style.display=m==='edit'?'grid':'none';
 document.getElementById('dashboard').style.display=m==='dash'?'block':'none';
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
function goDash(skipUrl){MODE='dash';setMode();renderDashboard();if(!skipUrl)syncCmsUrl(false);}
function editPage(i){STATE.current=+i;SEL=null;MODE='edit';setMode();renderAll();tab('build');syncCmsUrl(false);}
function editTab(t){MODE='edit';setMode();renderAll();tab(t);}
function delPage(i){if(STATE.pages.length<=1){alert('Keep at least one page.');return;}if(!confirm('Delete this page?'))return;STATE.pages.splice(i,1);if(STATE.current>=STATE.pages.length)STATE.current=STATE.pages.length-1;renderDashboard();save();}
function dashNewPage(){var name=uniquePageTitle('Untitled page');var slug=uniquePageSlug(titleToSlug(name));STATE.pages.push({id:uid(),name:name,slug:slug,type:'page',seo:{slug:slug},blocks:[{id:uid(),t:'hero',p:{eyebrow:'New page',headline:'Your headline here',sub:'Start building — add sections from the left.',dark:true,ctaLabel:'Get a quote',ctaPulse:false,cta2:''}}]});editPage(STATE.pages.length-1);save();}
function renderDashboard(){var el=document.getElementById('dashboard');
 var h='<div class="dash-wrap"><div class="dash-head"><h1>Dashboard</h1><p>Your whole site at a glance. Open a page to edit it, or create something new.</p></div>';
 h+=dashStatsHtml();
 h+='<div class="dash-sec-h">'+SPARK+'Create</div><div class="dash-actions">'+
   '<button class="dact dact-icon" onclick="dashNewPage()"><span class="dact-ic">'+icon('home',22)+'</span><b>+ New page</b><span>Start from a blank canvas</span></button>'+
   '<button class="dact dact-icon" onclick="openGallery(\'landing\')"><span class="dact-ic">'+icon('target',22)+'</span><b>+ Landing page</b><span>15 campaign templates</span></button>'+
   '<button class="dact dact-icon" onclick="openGallery(\'case\')"><span class="dact-ic">'+icon('building',22)+'</span><b>+ Case study</b><span>3 layouts, scrollable previews</span></button>'+
   '<button class="dact dact-icon" onclick="openGallery(\'template\')"><span class="dact-ic">'+icon('grant',22)+'</span><b>+ From template</b><span>Your saved layouts</span></button>'+
   '<a class="dact dact-icon" href="/admin/blog" style="text-decoration:none"><span class="dact-ic">'+icon('grant',22)+'</span><b>Blog</b><span>AI posts · schedule · Sanity</span></a></div>';
 h+='<div id="dash-pages-sec" class="dash-panel"><div class="dash-sec-h" id="dash-pages-h">'+SPARK+'Your pages ('+STATE.pages.length+')</div>';
 h+='<div class="dash-pages-toolbar"><div class="dash-search"><input id="dash-page-search" type="search" placeholder="Search by title or path…" value="'+esc(DASH_PAGE_SEARCH)+'" oninput="dashPageSearch(this.value)"><button type="button" class="dash-search-clear" id="dash-search-clear" style="display:'+(DASH_PAGE_SEARCH?'inline-flex':'none')+'" onclick="dashClearSearch()" title="Clear search">×</button></div><div class="dash-toolbar-filters">'+dashPageFilterHtml()+'</div></div>';
 h+='<div class="dash-grid" id="dash-pages-grid"></div><div id="dash-pages-pager"></div></div>';
 h+=leadsCard();
 h+='<div class="dash-sec-h">'+SPARK+'Site &amp; admin</div><div class="dash-actions">'+
   '<button class="dact" onclick="showMega()"><b>Mega menu</b><span>Links, icons &amp; featured image</span></button>'+
   
   '<button class="dact" onclick="showLibrary()"><b>Image library</b><span>Media, categorise &amp; filter</span></button>'+
   '<button class="dact" onclick="showLogos()"><b>Brand logos</b><span>Manufacturer banner library</span></button>'+
   '<button class="dact" onclick="showEnquiries()"><b>Enquiries</b><span>Leads &amp; statuses</span></button>'+
   '<a class="dact" href="/admin/blog" style="text-decoration:none"><b>Blog</b><span>AI posts · schedule · Sanity</span></a>'+
   '<button class="dact" onclick="showAnalytics()"><b>Analytics &amp; SEO</b><span>Traffic, engagement, rankings</span></button></div>';
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
var INTERESTS=[['solar','Solar PV'],['battery','Battery storage'],['heatpump','Infrared heating'],['led','LED lighting'],['users','Consultation'],['coin','Funding & grants']];
var SAMPLE_LEADS=[
 {id:'l1',name:'Emily Watkins',org:'',email:'emily.w@gmail.com',phone:'07700 900123',town:'Cardiff',postcode:'CF24 3AA',lat:51.48,lng:-3.16,sector:'Residential',interests:['solar','battery'],msg:'Interested in solar + battery for a 3-bed semi in Roath.',src:'Home hero',time:'2h ago',isnew:true},
 {id:'l2',name:'Rhys Davies',org:'Davies Joinery',email:'rhys@daviesjoinery.co.uk',phone:'07700 900456',town:'Swansea',postcode:'SA1 4PB',lat:51.62,lng:-3.94,sector:'Commercial',interests:['solar','led','coin'],msg:'Workshop roof — keen to know what grants apply.',src:'PPA landing',time:'5h ago',isnew:true},
 {id:'l3',name:'Morgan Facilities',org:'Morgan Ltd',email:'ops@morgan.co.uk',phone:'01633 900789',town:'Newport',postcode:'NP19 4TT',lat:51.58,lng:-2.98,sector:'Commercial',interests:['solar','battery','led'],msg:'55kWp warehouse rooftop enquiry.',src:'Commercial',time:'Yesterday',isnew:false},
 {id:'l4',name:'Sian Hughes',org:'',email:'sian.h@outlook.com',phone:'07700 900222',town:'Bridgend',postcode:'CF31 1AA',lat:51.505,lng:-3.58,sector:'Residential',interests:['heatpump','solar'],msg:'Infrared heating and possibly solar.',src:'Estimator',time:'Yesterday',isnew:false},
 {id:'l5',name:'Cambrian Care',org:'Cambrian Care Homes',email:'estates@cambriancare.org',phone:'01633 900333',town:'Caerphilly',postcode:'CF83 1AA',lat:51.571,lng:-3.22,sector:'Public Sector',interests:['solar','battery','led','coin'],msg:'Two care homes, decarbonisation planning.',src:'Sector page',time:'2 days ago',isnew:false}
];
function leads(){if(!STATE.leads)STATE.leads=JSON.parse(JSON.stringify(SAMPLE_LEADS));return STATE.leads;}
function newCount(){return leads().filter(function(l){return l.isnew}).length;}
function leadsCard(){var L=leads();var nc=newCount();
 var rows=L.slice(0,5).map(function(l,i){return '<div class="lead-row" onclick="openLead('+i+')"><span class="lead-dot'+(l.isnew?' new':'')+'"></span><div class="lr-main"><b>'+esc(l.name)+'</b><span>'+esc(l.town)+' · '+esc(l.sector)+' · via '+esc(l.src)+'</span></div><div class="lr-int">'+l.interests.slice(0,4).map(function(k){return icon(k,16)}).join('')+'</div><div class="lr-t">'+esc(l.time)+'</div></div>';}).join('');
 return '<div class="dash-sec-h">'+SPARK+'Leads &amp; form submissions</div><div class="leads-card'+(nc?' hot':'')+'"><div class="leads-h"><b>Recent enquiries</b><button class="tbtn2" style="padding:4px 9px;margin-left:auto" onclick="showEnquiries()">Manage all →</button>'+(nc?'<span class="newbadge">'+nc+' new</span>':'<span style="font-family:var(--mono);font-size:.62rem;color:var(--muted)">all read</span>')+'</div>'+rows+'</div>';
}
function mapXY(l){var x=(l.lng-(-4.35))/((-2.65)-(-4.35));var y=1-((l.lat-51.30)/(51.75-51.30));return {x:Math.max(.06,Math.min(.94,x))*100,y:Math.max(.12,Math.min(.9,y))*100};}
function openLead(i){var l=leads()[i];l.isnew=false;save();
 var xy=mapXY(l);
 var pin='<div class="lead-pin" style="left:'+xy.x+'%;top:'+xy.y+'%"><svg viewBox="0 0 24 24" fill="#F8BC1E" stroke="#211F18" stroke-width="1.2"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7z"/><circle cx="12" cy="9" r="2.5" fill="#211F18" stroke="none"/></svg></div>';
 var ints=INTERESTS.map(function(it){var on=l.interests.indexOf(it[0])>=0;return '<div class="lead-int '+(on?'on':'off')+'">'+icon(it[0],18)+it[1]+'</div>';}).join('');
 document.getElementById('modalbox').className='modalbox leadbox';
 document.getElementById('modalbox').innerHTML='<button class="close" onclick="closeModal()">×</button><h2>'+esc(l.name)+'</h2><p style="color:var(--muted)">'+esc(l.sector)+(l.org?' · '+esc(l.org):'')+' · via '+esc(l.src)+' · '+esc(l.time)+'</p>'+
  '<div class="lead-map"><div class="mapgrid"></div><div class="coast"></div>'+pin+'<div style="position:absolute;left:10px;bottom:8px;font-family:var(--mono);font-size:.62rem;background:rgba(255,255,255,.8);padding:3px 7px;border-radius:2px">'+esc(l.town)+' · '+esc(l.postcode)+'</div></div>'+
  '<div class="lead-meta"><div><span>Email</span>'+esc(l.email)+'</div><div><span>Phone</span>'+esc(l.phone)+'</div></div>'+
  '<div style="font-family:var(--mono);font-size:.6rem;letter-spacing:.05em;text-transform:uppercase;color:var(--amber-2);margin-bottom:6px">Interested in</div><div class="lead-int-grid">'+ints+'</div>'+
  '<div style="font-family:var(--mono);font-size:.6rem;letter-spacing:.05em;text-transform:uppercase;color:var(--amber-2);margin:14px 0 6px">Message</div><p style="font-size:.9rem;line-height:1.5">'+esc(l.msg)+'</p>'+
  '<div style="display:flex;gap:8px;margin-top:16px"><a class="tbtn solar" style="color:var(--ink);text-decoration:none" href="mailto:'+esc(l.email)+'">Reply by email</a><a class="tbtn" style="color:var(--ink);border-color:var(--line);text-decoration:none" href="tel:'+esc(l.phone.replace(/\s/g,''))+'">Call</a></div>';
 document.getElementById('modal').classList.add('show');
 if(MODE==='dash')renderDashboard();
}
/* ===== standalone image library ===== */
function showLibrary(){MODE='library';setMode();renderLibrary();syncCmsUrl(false);}
function renderLibrary(){var el=document.getElementById('library');var imgs=STATE.site.images||[];var cats=[];imgs.forEach(function(im){if(im.cat&&cats.indexOf(im.cat)<0)cats.push(im.cat)});
 var h='<div class="adm-wrap"><div class="adm-h"><div><h1>Media library</h1><p>'+imgs.length+' items · auto-converted to WebP. Upload once, then add SEO per section when you use an image.</p></div><div><label class="tbtn2" style="cursor:pointer">+ Upload<input type="file" accept="image/*" multiple style="display:none" onchange="imgUpload(this)"></label></div></div>';
 h+='<div class="dash-actions" style="margin-bottom:16px"><select onchange="IMGFILTER=this.value;renderLibrary()" style="padding:8px 10px;border:1px solid var(--line);border-radius:3px;background:var(--card);max-width:260px"><option value="">All categories ('+imgs.length+')</option>'+cats.map(function(c){return '<option'+(IMGFILTER===c?' selected':'')+'>'+esc(c)+'</option>'}).join('')+'</select></div>';
 var shown=imgs.map(function(im,i){return {im:im,i:i}}).filter(function(x){return !IMGFILTER||x.im.cat===IMGFILTER});
 h+=shown.length?'<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px">'+shown.map(function(o){var im=o.im;return '<div style="border:1px solid var(--line);border-radius:3px;overflow:hidden"><img src="'+im.data+'" style="width:100%;height:100px;object-fit:cover;display:block"><div style="padding:5px 7px;font-size:.68rem;color:var(--muted);border-top:1px solid var(--line);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+(im.name?esc(im.name):'Image')+(im.cat?' · '+esc(im.cat):'')+'</div><button class="rm" style="margin:4px 7px 6px" onclick="imgRm('+o.i+');renderLibrary()">Remove</button></div>';}).join('')+'</div>':'<div class="honest">No images yet. Click <b>+ Upload</b> to add some.</div>';
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
function megaPreview(){var m=(STATE.site&&STATE.site.menu)||[];if(!m.length)return '';if(MENU_PI>=m.length)MENU_PI=0;var sel=m[MENU_PI];
 var nav=m.map(function(t,i){return '<button class="mp-nav'+(i===MENU_PI?' on':'')+'" onclick="MENU_PI='+i+';renderMenu()">'+esc(t.label)+'</button>';}).join('');
 var panel=sel.cols.map(function(c){return '<div class="mp-col"><div class="mp-ey">'+esc(c.ey)+'</div>'+c.items.map(function(it){return '<div class="mp-item"><span class="mp-ic">'+icon(it.icon||'solar',15)+'</span>'+esc(it.label)+'</div>';}).join('')+'</div>';}).join('');
 return '<div class="mp-prevbox"><div class="mp-label">Live preview · hover a top item</div><div class="mp-bar">'+nav+'</div><div class="mp-panel">'+panel+'</div></div>';
}
/* ===== enquiries + statuses ===== */
var STATUSES=['New','Contacted','Quoted','Won','Lost'];
function ensureStatuses(){leads().forEach(function(l,i){if(!l.status)l.status=['New','New','Contacted','Quoted','Won'][i]||'New';});}
function setLeadStatus(id,s){var l=leads().filter(function(x){return x.id===id})[0];if(l){l.status=s;save();renderEnquiries();}}
function showEnquiries(){MODE='enq';setMode();renderEnquiries();syncCmsUrl(false);}
function renderEnquiries(){ensureStatuses();var el=document.getElementById('enquiries');var L=leads();
 var counts={};STATUSES.forEach(function(s){counts[s]=0});L.forEach(function(l){counts[l.status]=(counts[l.status]||0)+1});
 var h='<div class="adm-wrap"><div class="adm-h"><div><h1>Enquiries</h1><p>'+L.length+' leads · give each a status and track it through the pipeline.</p></div></div>';
 h+='<div class="stat-ov">'+STATUSES.map(function(s){return '<div class="so"><div class="n">'+counts[s]+'</div><div class="k"><span class="stpill st-'+s+'">'+s+'</span></div></div>';}).join('')+'</div>';
 h+='<div class="panelcard"><table class="tbl enq-tbl"><thead><tr><th>Name</th><th>Location</th><th>Sector</th><th>Interested in</th><th>Received</th><th>Status</th><th></th></tr></thead><tbody>'+
   L.map(function(l,i){return '<tr><td><b>'+esc(l.name)+'</b><div style="font-size:.72rem;color:var(--muted)">'+esc(l.email)+'</div></td><td>'+esc(l.town)+'</td><td>'+esc(l.sector)+'</td><td><div style="display:flex;gap:3px">'+l.interests.map(function(k){return icon(k,15)}).join('')+'</div></td><td>'+esc(l.time)+'</td><td><select onchange="setLeadStatus(\''+l.id+'\',this.value)">'+STATUSES.map(function(s){return '<option'+(l.status===s?' selected':'')+'>'+s+'</option>'}).join('')+'</select></td><td><button class="tbtn2" style="padding:5px 10px" onclick="openLead('+i+')">View</button></td></tr>';}).join('')+'</tbody></table></div>';
 h+='</div>';el.innerHTML=h;
}
/* ===== brand-logo library (standalone, like media) ===== */
function showLogos(){MODE='logos';setMode();renderLogosLib();syncCmsUrl(false);}
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
function showMega(){MODE='mega';setMode();renderMega();syncCmsUrl(false);}
function pageName(slug){var p=STATE.pages.filter(function(x){return x.slug===slug})[0];return p?p.name:slug;}
function pageOpts(cur){return '<option value="">— link to a page —</option>'+STATE.pages.map(function(p){return '<option value="'+esc(p.slug)+'"'+(cur===p.slug?' selected':'')+'>'+esc(p.name)+'</option>'}).join('');}
function featOf(m){if(!m.featured)m.featured={img:'',title:'Book a free survey',text:'No obligation, no pushy sales — just honest advice.',cta:'Get a quote',ctaPage:'',bg:'dark'};if(!m.featured.bg)m.featured.bg='dark';return m.featured;}
function megaOn(m){return m.megaEnabled!==false;}
function setMenuIcon(mi,ci,ii,v){STATE.site.menu[mi].cols[ci].items[ii].icon=v;renderMega();save();}
function setMenuPage(mi,ci,ii,v){STATE.site.menu[mi].cols[ci].items[ii].page=v;renderMega();save();}
function setMenuLabel(mi,ci,ii,v){STATE.site.menu[mi].cols[ci].items[ii].label=v;renderMega();save();}
function setMenuDesc(mi,ci,ii,v){STATE.site.menu[mi].cols[ci].items[ii].desc=v;renderMega();save();}
function toggleMega(mi,v){var m=STATE.site.menu[mi];m.megaEnabled=v;if(v&&(!m.cols||!m.cols.length))m.cols=[{ey:'Column',items:[{icon:'solar',label:'Item',page:''}]}];renderMega();save();}
function setTopPage(mi,v){STATE.site.menu[mi].page=v;renderMega();save();}
function setFeatBg(mi,v){featOf(STATE.site.menu[mi]).bg=v;renderMega();save();}
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
function setFeatImg(id){var im=(STATE.site.images||[]).filter(function(x){return x.id===id})[0];featOf(STATE.site.menu[MEGA_PI]).img=im?im.data:'';renderMega();save();}
function clearFeatImg(){featOf(STATE.site.menu[MEGA_PI]).img='';renderMega();save();}
function menuFeatImgs(feat){var imgs=STATE.site.images||[];if(!imgs.length)return '<div class="hint" style="font-size:.8rem">No images yet — add some in the <b>Media library</b>, then pick one here.</div>';
 return '<div class="iconpick" style="grid-template-columns:repeat(6,1fr)">'+imgs.map(function(im){return '<button class="'+(feat.img===im.data?'on':'')+'" style="aspect-ratio:4/3;overflow:hidden;padding:0" onclick="setFeatImg(\''+im.id+'\')"><img src="'+im.data+'" style="width:100%;height:100%;object-fit:cover"></button>'}).join('')+'</div>'+(feat.img?'<button class="rm" style="margin-top:6px" onclick="clearFeatImg()">remove image</button>':'');
}
function renderMega(){var el=document.getElementById('megaedit');var M=STATE.site.menu||[];
 if(!M.length){el.innerHTML='<div class="adm-wrap"><div class="adm-h"><div><h1>Mega menu</h1></div></div><div class="honest">No menu items yet. <button class="tbtn2" onclick="STATE.site.menu=[{label:\'New item\',megaEnabled:true,page:\'\',cols:[{ey:\'Column\',items:[{icon:\'solar\',label:\'Item\',page:\'\'}]}]}];MEGA_PI=0;renderMega();save()">Add one</button></div></div>';return;}
 if(MEGA_PI>=M.length)MEGA_PI=0;var sel=M[MEGA_PI];var mega=megaOn(sel);var feat=featOf(sel);
 var nav=M.map(function(t,i){return '<button class="mm-nav'+(i===MEGA_PI?' on':'')+'" draggable="true" ondragstart="mDragStart(\'top\','+i+',0,'+i+')" ondragover="mDragOver(event)" ondrop="mDrop(\'top\',0,0,'+i+')" ondragend="mDragEnd()" onclick="MEGA_PI='+i+';renderMega()" title="Drag to reorder">'+esc(t.label)+(megaOn(t)?'':' ↗')+'</button>';}).join('');
 var panel;
 if(mega){
   var cols=sel.cols.map(function(c){return '<div class="mm-col"><div class="mm-ey">'+esc(c.ey)+'</div>'+c.items.map(function(it){return '<div class="mm-item"><span class="ic">'+icon(it.icon||'solar',18)+'</span><div><b>'+esc(it.label)+'</b>'+(it.desc?'<span class="mm-d">'+esc(it.desc)+'</span>':'')+'</div></div>';}).join('')+'</div>';}).join('');
   var _tex=feat.bg==='light'?'/assets/heliaxis-card-fill-light.svg':'/assets/heliaxis-card-fill-dark.svg';
   var fbg=feat.img?' style="background-image:linear-gradient(rgba(20,18,14,.5),rgba(20,18,14,.82)),url('+feat.img+');background-size:cover;background-position:center"':' style="background-image:url('+_tex+');background-size:cover;background-position:top right;background-repeat:no-repeat"';
   var featured='<div class="mm-featured'+(feat.bg==='light'&&!feat.img?' light':'')+'"'+fbg+'>'+(feat.img?'':'<svg class="mm-spark" viewBox="0 0 24 24" fill="#F8BC1E" width="32" height="32">'+[0,90,180,270].map(function(a){return '<g transform="rotate('+a+' 12 12)">'+RAY+'</g>'}).join('')+'</svg>')+'<div class="mm-ft-t">'+esc(feat.title)+'</div><p>'+esc(feat.text)+'</p><span class="mm-ft-cta">'+esc(feat.cta)+' →</span></div>';
   panel='<div class="mm-panel" style="grid-template-columns:repeat('+sel.cols.length+',1fr) 1.15fr">'+cols+featured+'</div>';
 } else {
   panel='<div style="padding:22px 24px;background:var(--card);font-family:var(--mono);font-size:.75rem;color:var(--muted)">Direct link → '+(sel.page?esc(pageName(sel.page)):'<span style="color:#b4462f">no page set</span>')+' · no mega panel</div>';
 }
 var preview='<div class="mm-preview"><div class="mm-bar">'+nav+'</div>'+panel+'</div>';

 var ed='<div class="panelcard"><h3>Top-level item “'+esc(sel.label)+'”</h3>'+
   '<div class="fld"><label>Label</label><input value="'+esc(sel.label)+'" onchange="STATE.site.menu['+MEGA_PI+'].label=this.value;renderMega();save()"></div>'+
   '<label class="chk"><input type="checkbox" '+(mega?'checked':'')+' onchange="toggleMega('+MEGA_PI+',this.checked)"> Enable mega menu (columns, links &amp; featured panel)</label>';
 if(!mega){
   ed+='<div class="fld"><label>This item links directly to</label><select onchange="setTopPage('+MEGA_PI+',this.value)">'+pageOpts(sel.page||'')+'</select></div>';
 } else {
   ed+='<div class="fld"><label>Featured panel — background</label><div class="seg"><button class="'+(feat.bg!=='light'?'on':'')+'" onclick="setFeatBg('+MEGA_PI+',\'dark\')">Dark texture</button><button class="'+(feat.bg==='light'?'on':'')+'" onclick="setFeatBg('+MEGA_PI+',\'light\')">Light texture</button></div><div class="hint" style="font-size:.75rem;margin-top:4px">Uses the brand card-fill background we designed — grid + warm glow, in dark or light.</div></div>'+
     '<div class="fld"><label>Or a custom photo (optional — overrides the texture)</label>'+menuFeatImgs(feat)+'</div>'+
     '<div class="fld"><label>Featured title</label><input value="'+esc(feat.title)+'" onchange="featOf(STATE.site.menu['+MEGA_PI+']).title=this.value;renderMega();save()"></div>'+
     '<div class="fld"><label>Featured text</label><textarea rows="2" onchange="featOf(STATE.site.menu['+MEGA_PI+']).text=this.value;renderMega();save()">'+esc(feat.text)+'</textarea></div>'+
     '<div class="row2"><div class="fld"><label>CTA label</label><input value="'+esc(feat.cta)+'" onchange="featOf(STATE.site.menu['+MEGA_PI+']).cta=this.value;renderMega();save()"></div><div class="fld"><label>CTA links to</label><select onchange="featOf(STATE.site.menu['+MEGA_PI+']).ctaPage=this.value;save()">'+pageOpts(feat.ctaPage)+'</select></div></div>';
 }
 ed+='<button class="rm" onclick="if(confirm(\'Remove this top-level item?\')){STATE.site.menu.splice('+MEGA_PI+',1);MEGA_PI=0;renderMega();save()}">Remove top-level item</button></div>';

 if(mega){
   sel.cols.forEach(function(c,ci){
     ed+='<div class="panelcard"><h3 style="display:flex;justify-content:space-between">Column '+(ci+1)+'<button class="rm" onclick="STATE.site.menu['+MEGA_PI+'].cols.splice('+ci+',1);renderMega();save()">remove column</button></h3>'+
       '<div class="fld"><label>Column heading</label><input value="'+esc(c.ey)+'" onchange="STATE.site.menu['+MEGA_PI+'].cols['+ci+'].ey=this.value;renderMega();save()"></div><div class="hint" style="font-size:.76rem">Drag the ⋮⋮ handle to reorder links.</div>';
     c.items.forEach(function(it,ii){
       ed+='<div class="mm-itemrow" ondragover="mDragOver(event)" ondrop="mDrop(\'item\','+MEGA_PI+','+ci+','+ii+')">'+
         '<span class="mm-grip" draggable="true" ondragstart="mDragStart(\'item\','+MEGA_PI+','+ci+','+ii+')" ondragend="mDragEnd()" title="Drag to reorder">⋮⋮</span>'+
         '<button class="icp" title="Click to choose an icon" onclick="openMenuIcon('+MEGA_PI+','+ci+','+ii+')">'+icon(it.icon||'solar',18)+'</button>'+
         '<input value="'+esc(it.label)+'" placeholder="Label" onchange="setMenuLabel('+MEGA_PI+','+ci+','+ii+',this.value)">'+
         '<select onchange="setMenuPage('+MEGA_PI+','+ci+','+ii+',this.value)">'+pageOpts(it.page||'')+'</select>'+
         '<button class="rm" onclick="STATE.site.menu['+MEGA_PI+'].cols['+ci+'].items.splice('+ii+',1);renderMega();save()">×</button></div>'+
         '<div style="margin:0 0 10px 26px"><input placeholder="Excerpt (optional — shows under the label)" value="'+esc(it.desc||'')+'" onchange="setMenuDesc('+MEGA_PI+','+ci+','+ii+',this.value)" style="width:100%;font-size:.78rem;padding:6px 8px;border:1px solid var(--line);border-radius:2px;background:var(--paper)"></div>';
     });
     ed+='<button class="miniadd" onclick="STATE.site.menu['+MEGA_PI+'].cols['+ci+'].items.push({icon:\'solar\',label:\'New link\',page:\'\'});renderMega();save()">+ Add link</button></div>';
   });
 }
 ed+='<div class="dash-actions">'+(mega?'<button class="dact" onclick="STATE.site.menu['+MEGA_PI+'].cols.push({ey:\'New column\',items:[{icon:\'solar\',label:\'Item\',page:\'\'}]});renderMega();save()"><b>+ Add column</b><span>to this item</span></button>':'')+'<button class="dact" onclick="STATE.site.menu.push({label:\'New item\',megaEnabled:true,page:\'\',cols:[{ey:\'Column\',items:[{icon:\'solar\',label:\'Item\',page:\'\'}]}]});MEGA_PI=STATE.site.menu.length-1;renderMega();save()"><b>+ Add top-level item</b><span>new nav entry</span></button></div>';

 el.innerHTML='<div class="adm-wrap"><div class="adm-h"><div><h1>Mega menu</h1><p>Design your navigation — drag to reorder, click an icon to change it, toggle the mega panel per item, choose the featured background, and link each item to a page.</p></div></div>'+preview+ed+'</div>';
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
w.addItem = addItem;
w.rmItem = rmItem;
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
w.toggleMega = toggleMega;
w.mDragStart = mDragStart;
w.mDragOver = mDragOver;
w.mDrop = mDrop;
w.mDragEnd = mDragEnd;
w.pvLeaveZone = pvLeaveZone;
w.setFeatImg = setFeatImg;
w.clearFeatImg = clearFeatImg;
w.setFeatBg = setFeatBg;
w.featOf = featOf;
w.logoFileAdd = logoFileAdd;
w.page = page;
w.STATE = STATE;
w.IMGFILTER = typeof IMGFILTER !== 'undefined' ? IMGFILTER : undefined;
w.MEGA_PI = typeof MEGA_PI !== 'undefined' ? MEGA_PI : undefined;
w.MENU_PI = typeof MENU_PI !== 'undefined' ? MENU_PI : undefined;
}
