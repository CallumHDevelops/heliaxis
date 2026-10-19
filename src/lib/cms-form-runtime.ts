/** Shared CMS contact-form behaviour for published pages + admin preview. */

const OPT_IN_LABEL = 'OK to message me on WhatsApp about my enquiry';
const OPT_IN_LABEL_CSS = 'display:flex;align-items:flex-start;gap:.55rem;margin:.25rem 0 .9rem;font-size:.9rem;line-height:1.35;cursor:pointer;text-align:left;text-transform:none;letter-spacing:normal';
const OPT_IN_BOX_CSS = 'width:20px;height:20px;min-width:20px;padding:0;margin:1px 0 0;border:0;box-shadow:none;flex:0 0 auto;appearance:auto;-webkit-appearance:checkbox;accent-color:#C77F04';

/**
 * The unticked "OK to message me on WhatsApp" box (WhatsApp permission), added to every enquiry form
 * that doesn't have one yet. Not while the form is being edited in the CMS.
 */
export function addWhatsAppOptIn(root: ParentNode = document) {
  if (typeof document === 'undefined') return;
  root.querySelectorAll<HTMLFormElement>('form.pv-cms-form').forEach((form) => {
    if (form.querySelector('[name="whatsappOptIn"]') || form.querySelector('[contenteditable="true"]')) return;
    const label = document.createElement('label');
    label.className = 'pv-optin';
    label.style.cssText = OPT_IN_LABEL_CSS;
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.name = 'whatsappOptIn';
    box.style.cssText = OPT_IN_BOX_CSS;
    const text = document.createElement('span');
    text.textContent = OPT_IN_LABEL;
    label.append(box, text);
    const anchor = form.querySelector('.pv-form-msg') || form.querySelector('.pv-form-actions');
    if (anchor) anchor.before(label);
    else form.appendChild(label);
  });
}

function closestForm(el: Element | null): HTMLFormElement | null {
  return el?.closest('form.pv-cms-form') as HTMLFormElement | null;
}

function setMsg(form: HTMLFormElement, text: string, ok: boolean) {
  let box = form.querySelector('.pv-form-msg') as HTMLElement | null;
  if (!box) {
    box = document.createElement('div');
    box.className = 'pv-form-msg';
    const actions = form.querySelector('.pv-form-actions');
    if (actions) actions.before(box);
    else form.appendChild(box);
  }
  box.textContent = text;
  box.classList.toggle('ok', ok);
  box.classList.toggle('err', !ok);
  box.hidden = !text;
}

function collectInterests(form: HTMLFormElement): string[] {
  return Array.from(form.querySelectorAll('.pv-tiles-interest .pv-tile.on')).map(
    (el) => (el as HTMLElement).dataset.value || el.textContent?.trim() || ''
  ).filter(Boolean);
}

function collectSector(form: HTMLFormElement): string {
  const on = form.querySelector('.pv-tiles-sector .pv-tile.on') as HTMLElement | null;
  return on?.dataset.value || on?.textContent?.trim() || '';
}

function collectPropertyType(form: HTMLFormElement): string {
  const segBtn = form.querySelector('.pv-seg button.on') as HTMLElement | null;
  if (segBtn) return segBtn.dataset.value || 'home';
  const hidden = form.querySelector('input[name="propertyType"]') as HTMLInputElement | null;
  return hidden?.value || '';
}

async function submitCmsForm(form: HTMLFormElement) {
  const fd = new FormData(form);
  const name = String(fd.get('name') || '').trim();
  const email = String(fd.get('email') || '').trim();
  const phone = String(fd.get('phone') || '').trim();
  const postcode = String(fd.get('postcode') || '').trim();
  const organization = String(fd.get('organization') || '').trim();
  const message = String(fd.get('message') || '').trim();
  const interestField = String(fd.get('interest') || '').trim();
  const whatsappOptIn = fd.get('whatsappOptIn') === 'on';
  const sector = collectSector(form);
  const interests = collectInterests(form);
  const propertyType = collectPropertyType(form);

  if (!name) {
    setMsg(form, 'Please enter your name.', false);
    return;
  }
  if (!email || email.indexOf('@') < 1) {
    setMsg(form, 'Please enter a valid email.', false);
    return;
  }
  if (form.querySelector('.pv-tiles-sector') && !sector) {
    setMsg(form, 'Please select your sector.', false);
    return;
  }
  if (form.querySelector('.pv-tiles-interest') && !interests.length) {
    setMsg(form, 'Please select at least one interest.', false);
    return;
  }

  const btn = form.querySelector('.pv-form-actions .pv-btn, .pv-form-actions button') as HTMLElement | null;
  const labelEl = (btn?.querySelector('[data-btn-label]') || btn) as HTMLElement | null;
  const prevLabel = labelEl?.textContent?.trim() || 'Send Enquiry';
  if (btn) {
    btn.setAttribute('aria-disabled', 'true');
    btn.classList.add('busy');
    if (labelEl) labelEl.textContent = 'Sending…';
  }
  setMsg(form, '', true);

  try {
    const r = await fetch('/api/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        email,
        phone,
        postcode,
        organization,
        message,
        sector,
        interests,
        interest: interestField || interests.join(', ') || message,
        propertyType: propertyType || (sector.toLowerCase().includes('residential')
          ? 'home'
          : sector
            ? 'business'
            : ''),
        source: 'cms-form',
        whatsappOptIn,
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.success) {
      setMsg(form, d.message || "Thank you — we've received your enquiry and will be in touch shortly.", true);
      form.reset();
      form.querySelectorAll('.pv-tile.on').forEach((el) => el.classList.remove('on'));
      if (btn) btn.style.display = 'none';
    } else {
      setMsg(form, d.error || 'Something went wrong. Please try again.', false);
      if (btn) {
        btn.removeAttribute('aria-disabled');
        btn.classList.remove('busy');
        if (labelEl) labelEl.textContent = prevLabel;
      }
    }
  } catch {
    setMsg(form, 'Failed to send. Please try again or call us.', false);
    if (btn) {
      btn.removeAttribute('aria-disabled');
      btn.classList.remove('busy');
      if (labelEl) labelEl.textContent = prevLabel;
    }
  }
}

function onDocClick(e: Event) {
  const t = e.target as HTMLElement | null;
  if (!t) return;
  const segBtn = t.closest('.pv-seg button') as HTMLButtonElement | null;
  if (segBtn && closestForm(segBtn)) {
    e.preventDefault();
    e.stopPropagation();
    const group = segBtn.closest('.pv-seg');
    group?.querySelectorAll('button.on').forEach((el) => el.classList.remove('on'));
    segBtn.classList.add('on');
    return;
  }
  const tile = t.closest('.pv-tile') as HTMLElement | null;
  if (!tile || !closestForm(tile)) return;
  e.preventDefault();
  e.stopPropagation();
  const group = tile.closest('.pv-tiles');
  if (!group) return;
  if (group.classList.contains('pv-tiles-sector')) {
    group.querySelectorAll('.pv-tile.on').forEach((el) => el.classList.remove('on'));
    tile.classList.add('on');
  } else if (group.classList.contains('pv-tiles-interest')) {
    tile.classList.toggle('on');
  }
}

function onDocSubmit(e: Event) {
  const form = e.target as HTMLFormElement | null;
  if (!form || !form.classList.contains('pv-cms-form')) return;
  e.preventDefault();
  e.stopPropagation();
  void submitCmsForm(form);
}

let bound = false;

/** Idempotent document-level listeners for CMS enquiry forms (the WhatsApp box is added on every call). */
export function initCmsFormRuntime() {
  if (typeof document === 'undefined') return;
  addWhatsAppOptIn();
  if (bound) return;
  bound = true;
  document.addEventListener('click', onDocClick, true);
  document.addEventListener('submit', onDocSubmit, true);
}

/** Inline script body for static HTML previews / exports. */
export const CMS_FORM_RUNTIME_SCRIPT = `(function(){
  if(window.__pvCmsFormBound)return;window.__pvCmsFormBound=true;
  function closestForm(el){return el&&el.closest?el.closest('form.pv-cms-form'):null;}
  function setMsg(form,text,ok){
    var box=form.querySelector('.pv-form-msg');
    if(!box){box=document.createElement('div');box.className='pv-form-msg';var a=form.querySelector('.pv-form-actions');if(a)a.parentNode.insertBefore(box,a);else form.appendChild(box);}
    box.textContent=text||'';box.classList.toggle('ok',!!ok);box.classList.toggle('err',!ok);box.hidden=!text;
  }
  function interests(form){return Array.prototype.map.call(form.querySelectorAll('.pv-tiles-interest .pv-tile.on'),function(el){return el.getAttribute('data-value')||(el.textContent||'').trim();}).filter(Boolean);}
  function sector(form){var on=form.querySelector('.pv-tiles-sector .pv-tile.on');return on?(on.getAttribute('data-value')||(on.textContent||'').trim()):'';}
  function propType(form){var on=form.querySelector('.pv-seg button.on');if(on)return on.getAttribute('data-value')||'home';var h=form.querySelector('input[name="propertyType"]');return h?h.value:'';}
  function addOptIn(){document.querySelectorAll('form.pv-cms-form').forEach(function(form){
    if(form.querySelector('[name="whatsappOptIn"]')||form.querySelector('[contenteditable="true"]'))return;
    var l=document.createElement('label');l.className='pv-optin';l.style.cssText=${JSON.stringify(OPT_IN_LABEL_CSS)};
    var b=document.createElement('input');b.type='checkbox';b.name='whatsappOptIn';b.style.cssText=${JSON.stringify(OPT_IN_BOX_CSS)};
    var t=document.createElement('span');t.textContent=${JSON.stringify(OPT_IN_LABEL)};l.appendChild(b);l.appendChild(t);
    var a=form.querySelector('.pv-form-msg')||form.querySelector('.pv-form-actions');if(a)a.parentNode.insertBefore(l,a);else form.appendChild(l);
  });}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addOptIn);else addOptIn();
  document.addEventListener('click',function(e){
    var t=e.target;if(!t||!t.closest)return;
    var segBtn=t.closest('.pv-seg button');if(segBtn&&closestForm(segBtn)){e.preventDefault();e.stopPropagation();var g=segBtn.closest('.pv-seg');if(g)g.querySelectorAll('button.on').forEach(function(el){el.classList.remove('on');});segBtn.classList.add('on');return;}
    var tile=t.closest('.pv-tile');if(!tile||!closestForm(tile))return;
    e.preventDefault();e.stopPropagation();
    var group=tile.closest('.pv-tiles');if(!group)return;
    if(group.classList.contains('pv-tiles-sector')){group.querySelectorAll('.pv-tile.on').forEach(function(el){el.classList.remove('on');});tile.classList.add('on');}
    else if(group.classList.contains('pv-tiles-interest')){tile.classList.toggle('on');}
  },true);
  document.addEventListener('submit',function(e){
    var form=e.target;if(!form||!form.classList||!form.classList.contains('pv-cms-form'))return;
    e.preventDefault();e.stopPropagation();
    var fd=new FormData(form);
    var name=String(fd.get('name')||'').trim();
    var email=String(fd.get('email')||'').trim();
    var phone=String(fd.get('phone')||'').trim();
    var postcode=String(fd.get('postcode')||'').trim();
    var organization=String(fd.get('organization')||'').trim();
    var message=String(fd.get('message')||'').trim();
    var interestField=String(fd.get('interest')||'').trim();
    var waOptIn=fd.get('whatsappOptIn')==='on';
    var sec=sector(form);var ints=interests(form);var ptype=propType(form);
    if(!name){setMsg(form,'Please enter your name.',false);return;}
    if(!email||email.indexOf('@')<1){setMsg(form,'Please enter a valid email.',false);return;}
    if(form.querySelector('.pv-tiles-sector')&&!sec){setMsg(form,'Please select your sector.',false);return;}
    if(form.querySelector('.pv-tiles-interest')&&!ints.length){setMsg(form,'Please select at least one interest.',false);return;}
    var btn=form.querySelector('.pv-form-actions .pv-btn, .pv-form-actions button');
    var prev=btn?btn.textContent:'';
    if(btn){btn.setAttribute('aria-disabled','true');btn.classList.add('busy');var lab=btn.querySelector('[data-btn-label]')||btn;lab.textContent='Sending…';}
    setMsg(form,'',true);
    fetch('/api/quote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      name:name,email:email,phone:phone,postcode:postcode,organization:organization,message:message,sector:sec,interests:ints,
      interest:interestField||ints.join(', ')||message,propertyType:ptype||(/residential/i.test(sec)?'home':(sec?'business':'')),source:'cms-form',whatsappOptIn:waOptIn
    })}).then(function(r){return r.json().then(function(d){return {ok:r.ok,d:d};});}).then(function(x){
      if(x.ok&&x.d.success){setMsg(form,x.d.message||"Thank you — we've received your enquiry and will be in touch shortly.",true);form.reset();form.querySelectorAll('.pv-tile.on').forEach(function(el){el.classList.remove('on');});if(btn)btn.style.display='none';}
      else{setMsg(form,(x.d&&x.d.error)||'Something went wrong. Please try again.',false);if(btn){btn.removeAttribute('aria-disabled');btn.classList.remove('busy');var lab2=btn.querySelector('[data-btn-label]')||btn;lab2.textContent=(prev||'Send Enquiry').replace(/Sending…/,'').trim()||'Send Enquiry';}}
    }).catch(function(){
      setMsg(form,'Failed to send. Please try again or call us.',false);
      if(btn){btn.removeAttribute('aria-disabled');btn.classList.remove('busy');var lab3=btn.querySelector('[data-btn-label]')||btn;lab3.textContent=(prev||'Send Enquiry').replace(/Sending…/,'').trim()||'Send Enquiry';}
    });
  },true);
})();`;

/** Idempotent accordion binding for `.pv-faq .qa2`. */
export function initPvFaq(root?: ParentNode | Document | null) {
  if (typeof document === 'undefined') return;
  const scope = root ?? document;
  scope.querySelectorAll<HTMLElement>('.pv-faq .qa2').forEach((qa) => {
    if (qa.dataset.faqBound) return;
    qa.dataset.faqBound = '1';
    const q = qa.querySelector<HTMLButtonElement>('.q');
    const a = qa.querySelector<HTMLElement>('.a');
    if (!q || !a) return;
    if (qa.classList.contains('open')) a.style.maxHeight = `${a.scrollHeight}px`;
    q.addEventListener('click', (e) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('[contenteditable="true"]')) return;
      e.preventDefault();
      e.stopPropagation();
      const faq = qa.closest('.pv-faq');
      if (faq?.classList.contains('is-edit')) return;
      const open = qa.classList.toggle('open');
      faq?.querySelectorAll<HTMLElement>('.qa2.open').forEach((o) => {
        if (o === qa) return;
        o.classList.remove('open');
        const ao = o.querySelector<HTMLElement>('.a');
        if (ao) ao.style.maxHeight = '';
      });
      a.style.maxHeight = open ? `${a.scrollHeight}px` : '';
    });
  });
}

/** Inline script body for static HTML previews / exports. */
export const CMS_FAQ_RUNTIME_SCRIPT = `(function(){
  function bindFaq(root){
    (root||document).querySelectorAll('.pv-faq .qa2').forEach(function(qa){
      if(qa.dataset.faqBound)return;
      qa.dataset.faqBound='1';
      var q=qa.querySelector('.q'),a=qa.querySelector('.a');
      if(!q||!a)return;
      if(qa.classList.contains('open'))a.style.maxHeight=a.scrollHeight+'px';
      q.addEventListener('click',function(e){
        if(e.target&&e.target.closest&&e.target.closest('[contenteditable="true"]'))return;
        e.preventDefault();e.stopPropagation();
        var faq=qa.closest('.pv-faq');
        if(faq&&faq.classList.contains('is-edit'))return;
        var open=qa.classList.toggle('open');
        if(faq)faq.querySelectorAll('.qa2.open').forEach(function(o){
          if(o!==qa){o.classList.remove('open');var ao=o.querySelector('.a');if(ao)ao.style.maxHeight=null;}
        });
        a.style.maxHeight=open?a.scrollHeight+'px':null;
      });
    });
  }
  window.initPvFaq=function(root){bindFaq(root);};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){bindFaq();});
  else bindFaq();
})();`;
