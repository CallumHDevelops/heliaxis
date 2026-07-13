/** Shared CMS contact-form behaviour for published pages + admin preview. */

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

async function submitCmsForm(form: HTMLFormElement) {
  const fd = new FormData(form);
  const name = String(fd.get('name') || '').trim();
  const email = String(fd.get('email') || '').trim();
  const phone = String(fd.get('phone') || '').trim();
  const postcode = String(fd.get('postcode') || '').trim();
  const organization = String(fd.get('organization') || '').trim();
  const message = String(fd.get('message') || '').trim();
  const sector = collectSector(form);
  const interests = collectInterests(form);

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
        interest: interests.join(', '),
        propertyType: sector.toLowerCase().includes('residential')
          ? 'home'
          : sector
            ? 'business'
            : '',
        source: 'cms-form',
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

/** Idempotent document-level listeners for CMS enquiry forms. */
export function initCmsFormRuntime() {
  if (typeof document === 'undefined' || bound) return;
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
  document.addEventListener('click',function(e){
    var t=e.target;if(!t||!t.closest)return;
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
    var sec=sector(form);var ints=interests(form);
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
      interest:ints.join(', '),propertyType:/residential/i.test(sec)?'home':(sec?'business':''),source:'cms-form'
    })}).then(function(r){return r.json().then(function(d){return {ok:r.ok,d:d};});}).then(function(x){
      if(x.ok&&x.d.success){setMsg(form,x.d.message||"Thank you — we've received your enquiry and will be in touch shortly.",true);form.reset();form.querySelectorAll('.pv-tile.on').forEach(function(el){el.classList.remove('on');});if(btn)btn.style.display='none';}
      else{setMsg(form,(x.d&&x.d.error)||'Something went wrong. Please try again.',false);if(btn){btn.removeAttribute('aria-disabled');btn.classList.remove('busy');var lab2=btn.querySelector('[data-btn-label]')||btn;lab2.textContent=(prev||'Send Enquiry').replace(/Sending…/,'').trim()||'Send Enquiry';}}
    }).catch(function(){
      setMsg(form,'Failed to send. Please try again or call us.',false);
      if(btn){btn.removeAttribute('aria-disabled');btn.classList.remove('busy');var lab3=btn.querySelector('[data-btn-label]')||btn;lab3.textContent=(prev||'Send Enquiry').replace(/Sending…/,'').trim()||'Send Enquiry';}
    });
  },true);
})();`;
