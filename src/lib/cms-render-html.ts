/**
 * Server-side CMS page HTML for scheduled publish (publish-mode, no edit attrs).
 * Covers AI blog template blocks + common extras so schedule can run without opening the editor.
 */

import { accentText } from '@/lib/cms-accent-text';

type LooseBlock = { id?: string; t?: string; p?: Record<string, unknown> };

const SPARK =
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style="fill:var(--amber-2)"><g transform="rotate(0 12 12)"><path d="M11 9.6 L13 9.6 L13 0.8 L11 3 Z"/></g><g transform="rotate(90 12 12)"><path d="M11 9.6 L13 9.6 L13 0.8 L11 3 Z"/></g><g transform="rotate(180 12 12)"><path d="M11 9.6 L13 9.6 L13 0.8 L11 3 Z"/></g><g transform="rotate(270 12 12)"><path d="M11 9.6 L13 9.6 L13 0.8 L11 3 Z"/></g></svg>';
const HERO_MARK_SPARK =
  '<svg class="bigspark" viewBox="0 0 24 24" fill="#F8BC1E" aria-hidden="true"><g transform="rotate(0 12 12)"><path d="M11 9.6 L13 9.6 L13 0.8 L11 3 Z"/></g><g transform="rotate(90 12 12)"><path d="M11 9.6 L13 9.6 L13 0.8 L11 3 Z"/></g><g transform="rotate(180 12 12)"><path d="M11 9.6 L13 9.6 L13 0.8 L11 3 Z"/></g><g transform="rotate(270 12 12)"><path d="M11 9.6 L13 9.6 L13 0.8 L11 3 Z"/></g></svg>';

const GAL_CAM =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="3.5"/><path d="M8 6l1.5-2h5L16 6"/></svg>';

const INTERESTS: [string, string][] = [
  ['solar', 'Solar PV Installation'],
  ['battery', 'Battery Storage'],
  ['heatpump', 'Infrared Heating'],
  ['led', 'LED Lighting'],
  ['users', 'Consultation & Advisory'],
  ['coin', 'Funding & Grants'],
];

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function spacingStyle(p: Record<string, unknown> | undefined): string {
  if (!p) return '';
  let s = '';
  if (p._pt) s += `padding-top:${p._pt}px;`;
  if (p._pb) s += `padding-bottom:${p._pb}px;`;
  if (p._mt) s += `margin-top:${p._mt}px;`;
  if (p._mb) s += `margin-bottom:${p._mb}px;`;
  return s;
}

function heroBtn(label: unknown, cls: string, pulse?: boolean, href?: unknown): string {
  if (!label) return '';
  const inner =
    `<span>${esc(label)}</span>` +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  const link = href != null && String(href).trim() ? String(href).trim() : '#';
  return `<a class="btn ${cls}${pulse ? ' pulse' : ''}" href="${esc(link)}">${inner}</a>`;
}

function btn(label: unknown, cls: string, pulse?: boolean, href?: unknown, noArrow?: boolean): string {
  if (!label) return '';
  const inner =
    `<span>${esc(label)}</span>` +
    (noArrow
      ? ''
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>');
  const clsFull = `pv-btn ${cls}${pulse ? ' pulse' : ''}`;
  const link = href != null && String(href).trim() ? String(href).trim() : '';
  if (link) {
    return `<a class="${clsFull}" href="${esc(link)}">${inner}</a>`;
  }
  return `<span class="${clsFull}">${inner}</span>`;
}

function eyebrow(t: unknown, onDark?: boolean): string {
  if (!(t && String(t).trim())) return '';
  return `<span class="pv-eyebrow${onDark ? ' on-dark' : ''}">${SPARK}<span>${esc(t)}</span></span>`;
}

function heroTags(tags: unknown): string {
  if (!tags) return '';
  const list = String(tags)
    .split(/[,|]/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (!list.length) return '';
  return (
    '<div class="pv-hero-tags">' +
    list
      .map((t) => `<span class="pv-hero-tag">${esc(t)}</span>`)
      .join('<span class="pv-hero-tag-sep" aria-hidden="true">|</span>') +
    '</div>'
  );
}

type LibImage = { id?: string; data?: string };
let _libImages: LibImage[] = [];

function imgSrc(val: unknown): string {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'object' && val) {
    const m = val as { src?: string; libId?: string; data?: string };
    if (m.libId) {
      const hit = _libImages.find((im) => im.id === m.libId);
      if (hit?.data) return String(hit.data);
    }
    if (m.src) return String(m.src);
    if (m.data) return String(m.data);
  }
  return '';
}

function clampFocus(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 50;
  return Math.max(0, Math.min(100, v));
}

function clampZoom(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 1;
  return Math.max(1, Math.min(3, Math.round(v * 100) / 100));
}

function mediaFrameHtml(val: unknown, fit?: unknown): string {
  const src = imgSrc(val);
  if (!src) {
    return '<div class="pv-media-frame is-empty" aria-hidden="true">IMAGE</div>';
  }
  let alt = '';
  let decorative = false;
  let title = '';
  let caption = '';
  let loading = 'lazy';
  let focusX = 50;
  let focusY = 50;
  let zoom = 1;
  if (typeof val === 'object' && val) {
    const m = val as Record<string, unknown>;
    alt = String(m.alt || '');
    decorative = !!m.decorative;
    title = String(m.title || '');
    caption = String(m.caption || '');
    loading = String(m.loading || 'lazy');
    focusX = clampFocus(m.focusX);
    focusY = clampFocus(m.focusY);
    zoom = clampZoom(m.zoom);
  }
  const z = clampZoom(zoom) * 1.2;
  const maxShift = ((1 - 1 / z) / 2) * 100;
  const tx = ((50 - focusX) / 50) * maxShift;
  const ty = ((50 - focusY) / 50) * maxShift;
  const imgStyle =
    fit === 'contain'
      ? 'object-fit:contain;object-position:center'
      : `object-fit:cover;object-position:50% 50%;transform:translate(${tx}%,${ty}%) scale(${z});transform-origin:center center`;
  const img =
    `<img class="pv-media-frame-img" src="${esc(src)}" alt="${esc(decorative ? '' : alt)}"` +
    (decorative ? ' aria-hidden="true"' : '') +
    (title ? ` title="${esc(title)}"` : '') +
    ` loading="${esc(loading)}" decoding="async" style="${imgStyle}">`;
  const cap = caption
    ? `<figcaption class="pv-media-frame-cap">${esc(caption)}</figcaption>`
    : '';
  return `<div class="pv-media-frame">${img}${cap}</div>`;
}

const QUOTE_CHECK_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="var(--ink)" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
const QUOTE_SHIELD_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path class="f" d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" fill="var(--solar)" stroke="none"/><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/></svg>';

function formVariant(p: Record<string, unknown>): 'quote' | 'contact' {
  if (p.variant === 'contact') return 'contact';
  if (p.variant === 'quote') return 'quote';
  if (p.fSector || p.fInterests || p.fOrg) return 'contact';
  return 'quote';
}

function iconStub(size = 18): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/></svg>`;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x ?? '')) : [];
}

function renderBlock(b: LooseBlock): string {
  const p = (b.p || {}) as Record<string, unknown>;
  const t = String(b.t || '').trim().toLowerCase();

  if (t === 'hero') {
    const wide = !!p.textWide;
    const hideMark = wide || !!p.hideMark;
    const sub =
      p.sub && String(p.sub).trim()
        ? `<p class="lead">${esc(p.sub)}</p>`
        : '';
    let btns = '';
    if (!p.ctaDisabled) {
      btns += heroBtn(p.ctaLabel || 'Get my free quote', 'btn-solar', !!p.ctaPulse, p.ctaHref || '#quote');
    }
    if (!p.cta2Disabled && p.cta2 && String(p.cta2).trim()) {
      btns += heroBtn(p.cta2, 'btn-light', false, p.cta2Href || '');
    }
    const btnrow = btns ? `<div class="cbtns">${btns}</div>` : '';
    const mt =
      p.microtrust !== undefined
        ? String(p.microtrust)
        : 'Free survey · No obligation · No salespeople · Insurance-backed guarantees';
    const mthtml =
      !p.hideMicrotrust && mt.trim()
        ? `<p class="microtrust">${esc(mt)}</p>`
        : '';
    const rtVal = String(p.ratingValue || '4.9');
    const rtInst = String(p.ratingInstalls || '1200');
    const rthtml = !p.hideRating
      ? `<div class="rating"><div class="r"><span class="big">${esc(rtVal)}</span><span class="stars">★★★★★</span><span>Google &amp; Trustpilot</span></div><div class="r"><span class="big"><span>${esc(rtInst)}</span>+</span><span>installs across South Wales</span></div></div>`
      : '';
    const eyebrowHtml = p.eyebrow
      ? `<span class="eyebrow on-dark">${SPARK.replace('<svg ', '<svg class="spark-ico" ')}${esc(p.eyebrow)}</span>`
      : '';
    let markHtml = '';
    if (!hideMark) {
      if (p.markImg) {
        const src = imgSrc(p.markImg);
        markHtml = src
          ? `<div class="hero-mark"><img src="${esc(src)}" alt="" style="max-width:min(52%,230px);height:auto"></div>`
          : `<div class="hero-mark">${HERO_MARK_SPARK}</div>`;
      } else {
        markHtml = `<div class="hero-mark">${HERO_MARK_SPARK}</div>`;
      }
    }
    const sunHtml = wide || p.hideSun ? '' : '<div class="sun"></div>';
    const bgSrc = imgSrc(p.bgImg);
    let bgHtml = '';
    if (bgSrc) {
      let bfx = 50;
      let bfy = 50;
      let bz = 1;
      if (typeof p.bgImg === 'object' && p.bgImg) {
        const bm = p.bgImg as Record<string, unknown>;
        bfx = clampFocus(bm.focusX);
        bfy = clampFocus(bm.focusY);
        bz = clampZoom(bm.zoom);
      }
      const z = bz * 1.2;
      const maxShift = ((1 - 1 / z) / 2) * 100;
      const tx = ((50 - bfx) / 50) * maxShift;
      const ty = ((50 - bfy) / 50) * maxShift;
      const bgStyle = `object-fit:cover;object-position:50% 50%;transform:translate(${tx}%,${ty}%) scale(${z});transform-origin:center center`;
      let ov = 62;
      // Match the client guard (cms-engine.ts): a literal null must fall through
      // to the 62 default, not become Number(null)===0 → a near-transparent scrim.
      if (p.bgOverlay != null && Number.isFinite(Number(p.bgOverlay))) {
        ov = Math.max(0, Math.min(100, Number(p.bgOverlay)));
      }
      const scrimOp = (0.4 + 0.6 * (ov / 100)).toFixed(3);
      bgHtml =
        `<div class="hero-bg"><img class="hero-bg-img" src="${esc(bgSrc)}" alt="" aria-hidden="true" loading="eager" fetchpriority="high" decoding="async" style="${bgStyle}">` +
        `<div class="hero-bg-scrim" style="opacity:${scrimOp}"></div><div class="hero-bg-hatch" aria-hidden="true"></div></div>`;
    }
    const heroCls = `hero${wide ? ' wide' : ''}${hideMark ? ' no-mark' : ''}${bgSrc ? ' has-bg' : ''}`;
    const wrapCls = `wrap${hideMark ? ' is-single' : ''}`;
    return (
      `<section class="${heroCls}" id="top">${bgHtml}<div class="glow"></div>${sunHtml}<div class="${wrapCls}"><div class="hero-copy">` +
      heroTags(p.tags) +
      eyebrowHtml +
      `<h1>${accentText(p.headline)}</h1>${sub}${btnrow}${mthtml}${rthtml}</div>${markHtml}</div></section>`
    );
  }

  if (t === 'media') {
    const im = p.img
      ? mediaFrameHtml(p.img, p.fit)
      : '<div class="pv-media-frame is-empty" aria-hidden="true">IMAGE</div>';
    const ctaBtn = p.ctaDisabled ? '' : btn(p.cta, 'solar', false, p.ctaHref || '#quote');
    const cols = p.textWide
      ? p.side === 'left'
        ? '0.75fr 1.25fr'
        : '1.25fr 0.75fr'
      : '1fr 1fr';
    const tx =
      `<div>${eyebrow(p.eyebrow)}` +
      `<h2 style="font-size:clamp(1.5rem,2.6vw,2.1rem);font-weight:700;margin-top:10px">${accentText(p.title)}</h2>` +
      `<p style="color:var(--muted);margin-top:12px;line-height:1.6">${esc(p.text).replace(/\n/g, '<br>')}</p>` +
      (ctaBtn ? `<div class="pv-btnrow">${ctaBtn}</div>` : '') +
      '</div>';
    return `<div class="pv-media is-blog" style="display:grid;grid-template-columns:${cols};gap:34px;align-items:center">${p.side === 'left' ? im + tx : tx + im}</div>`;
  }

  if (t === 'rich') {
    return `<div class="pv-rich">${String(p.html || '<p></p>')}</div>`;
  }

  if (t === 'cta') {
    let btns = '';
    if (!p.ctaDisabled) btns += btn(p.btn, 'solar', !!p.pulse, p.btnHref || '#quote');
    if (!p.cta2Disabled && p.btn2 && String(p.btn2).trim()) {
      btns += btn(p.btn2, 'ghost on-dark', false, p.btn2Href || 'tel:01633965205', true);
    }
    const row = btns ? `<div class="pv-btnrow pv-cta-btns">${btns}</div>` : '';
    return (
      `<div class="pv-cta"><div class="pv-cta-glow"></div><div class="z"><h2>${accentText(p.headline)}</h2><p>${esc(p.sub)}</p>${row}</div></div>`
    );
  }

  if (t === 'footer') {
    const cols = Array.isArray(p.cols)
      ? (p.cols as Array<{ title?: string; links?: Array<{ label?: string; href?: string }> }>)
      : [];
    const logoSrc = imgSrc(p.logoImg);
    const brand = logoSrc
      ? `<img class="pv-footer-logo" src="${esc(logoSrc)}" alt="${esc(p.brandText || 'Heliaxis')}">`
      : `<p class="pv-footer-word">${esc(p.brandText || 'Heliaxis')}</p>`;
    const colHtml = cols
      .map((col) => {
        const links = (col.links || [])
          .map((l) => `<a href="${esc(l.href || '#')}">${esc(l.label)}</a>`)
          .join('');
        return `<div><h4>${esc(col.title || '')}</h4>${links}</div>`;
      })
      .join('');
    const siteHref = String(p.siteHref || 'https://heliaxis.co.uk');
    return (
      `<footer class="pv-footer"><div class="wrap"><div class="cols"><div class="pv-footer-brand">${brand}` +
      `<p class="pv-footer-about">${esc(p.about)}</p></div>${colHtml}</div>` +
      `<div class="base"><span>${esc(p.copyright)}</span><a href="${esc(siteHref)}" class="pv-footer-url">${esc(p.siteUrl || 'heliaxis.co.uk')}</a></div></div></footer>`
    );
  }

  if (t === 'split') {
    const lb = asStringArray(p.lb);
    const rb = asStringArray(p.rb);
    return (
      '<div class="pv-split"><div class="pv-splitcard">' +
      `<h3>${accentText(p.lt)}</h3><p>${esc(p.ld)}</p><ul>${lb.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>${btn(p.lc, 'dark', false, p.lcHref || '#quote')}` +
      '</div><div class="pv-splitcard dark">' +
      `<h3>${accentText(p.rt)}</h3><p>${esc(p.rd)}</p><ul>${rb.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>${btn(p.rc, 'solar', false, p.rcHref || '/commercial-funding')}` +
      '</div></div>'
    );
  }

  if (t === 'form') {
    if (formVariant(p) === 'contact') {
      const fld = (label: string, req: boolean, ph: string, type: string, name: string) => {
        const lab = `<label for="pv-${name}">${label}${req ? ' <span class="req">*</span>' : ''}</label>`;
        if (type === 'textarea') {
          return `<div class="pv-field">${lab}<textarea id="pv-${name}" name="${name}" rows="4" placeholder="${esc(ph)}"${req ? ' required' : ''}></textarea></div>`;
        }
        return `<div class="pv-field">${lab}<input id="pv-${name}" name="${name}" type="${type || 'text'}" placeholder="${esc(ph)}"${req ? ' required' : ''}></div>`;
      };
      const sectors: [string, string][] = [
        ['home', 'Residential'],
        ['building', 'Commercial'],
        ['users', 'Public Sector'],
        ['warehouse', 'Housing Association'],
        ['target', 'Other'],
      ];
      let rows = '';
      const pair: string[] = [];
      if (p.fName) pair.push(fld('Name', true, 'Your name', 'text', 'name'));
      if (p.fOrg) pair.push(fld('Organization Name', false, 'Company or organization', 'text', 'organization'));
      if (pair.length) {
        rows += `<div class="pv-fields-2">${pair.join('')}</div>`;
        pair.length = 0;
      }
      if (p.fEmail) pair.push(fld('Email', true, 'your.email@example.com', 'email', 'email'));
      if (p.fPhone) pair.push(fld('Phone', false, 'Enter phone', 'tel', 'phone'));
      if (pair.length) {
        rows += `<div class="pv-fields-2">${pair.join('')}</div>`;
        pair.length = 0;
      }
      if (p.fPost) rows += fld('Postcode', false, 'e.g. CF10 1AA', 'text', 'postcode');
      if (p.fSector) {
        rows +=
          '<div class="pv-fgroup"><label>Your Sector <span class="req">*</span></label><div class="pv-tiles pv-tiles-sector" role="group" aria-label="Sector">' +
          sectors
            .map(
              (s) =>
                `<button type="button" class="pv-tile" data-value="${esc(s[1])}">${iconStub(18)}<span>${s[1]}</span></button>`,
            )
            .join('') +
          '</div></div>';
      }
      if (p.fInterests) {
        rows +=
          '<div class="pv-fgroup"><label>I am interested in <span class="req">*</span><span class="hint-inline">(Select all that apply)</span></label><div class="pv-tiles pv-tiles-interest" role="group" aria-label="Interests">' +
          INTERESTS.map(
            (it) =>
              `<button type="button" class="pv-tile" data-value="${esc(it[1])}">${iconStub(18)}<span>${esc(it[1])}</span></button>`,
          ).join('') +
          '</div></div>';
      }
      if (p.fMsg) rows += fld('Message', false, 'Tell us more about your project requirements…', 'textarea', 'message');
      const btnLabel = String(p.btn || 'Send Enquiry');
      const cta =
        `<button type="submit" class="pv-btn solar${p.pulse ? ' pulse' : ''}"><span data-btn-label>${esc(btnLabel)}</span>` +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>';
      return (
        '<div class="pv-quote is-contact" id="quote"><div class="pv-quote-inner"><form class="pv-formcard pv-cms-form" action="/api/quote" method="post" novalidate>' +
        `<div class="pv-quote-head"><h2>${accentText(p.heading)}</h2><p>${esc(p.sub)}</p></div>${rows}` +
        `<div class="pv-form-msg" hidden></div><div class="pv-form-actions">${cta}</div>` +
        '<p class="pv-form-note">By submitting this form, you agree to our privacy policy and terms of service.</p></form></div></div>'
      );
    }

    const anchor =
      p.anchor && String(p.anchor).trim()
        ? String(p.anchor).trim().replace(/[^a-zA-Z0-9_-]/g, '')
        : 'quote';
    const points = Array.isArray(p.points)
      ? (p.points as Array<{ title?: string; text?: string }>)
      : [];
    const pts = points
      .map(
        (pt) =>
          `<div class="pv-pt"><span class="ic">${QUOTE_CHECK_SVG}</span><div><b>${esc(pt.title)}</b><span>${esc(pt.text).replace(/\n/g, '<br>')}</span></div></div>`,
      )
      .join('');
    let callBox = '';
    if (!p.hideCall) {
      const telHref = String(p.callHref || (p.phone ? `tel:${String(p.phone).replace(/\s/g, '')}` : '#'));
      callBox =
        `<div class="pv-callnow"><div><div class="pv-call-lbl">${esc(p.callLabel || 'Prefer to talk?')}</div>` +
        `<a class="tel" href="${esc(telHref)}">${esc(p.phone || '01633 965205')}</a></div>` +
        `<a class="pv-btn dark ghost" href="${esc(telHref)}">${esc(p.callBtn || 'Call us now')}</a></div>`;
    }
    const qfld = (label: string, req: boolean, ph: string, type: string, name: string) => {
      const lab = `<label for="pv-${name}">${label}${req ? ' <span class="req">*</span>' : ''}</label>`;
      if (type === 'textarea') {
        return `<div class="pv-qfield">${lab}<textarea id="pv-${name}" name="${name}" rows="2" placeholder="${esc(ph)}"${req ? ' required' : ''}></textarea></div>`;
      }
      return `<div class="pv-qfield">${lab}<input id="pv-${name}" name="${name}" type="${type || 'text'}" placeholder="${esc(ph)}"${req ? ' required' : ''}></div>`;
    };
    let rows = '';
    if (p.fName !== false) rows += qfld(String(p.nameLabel || 'Full name'), true, String(p.namePh || 'Your name'), 'text', 'name');
    if (p.fPhone !== false) rows += qfld(String(p.phoneLabel || 'Phone'), false, String(p.phonePh || 'Mobile or landline'), 'tel', 'phone');
    if (p.fEmail !== false) rows += qfld(String(p.emailLabel || 'Email'), true, String(p.emailPh || 'you@email.com'), 'email', 'email');
    if (p.fPost !== false) rows += qfld(String(p.postLabel || 'Postcode'), false, String(p.postPh || 'e.g. CF10 1AA'), 'text', 'postcode');
    if (p.fInterest !== false) {
      rows += qfld(
        String(p.interestLabel || 'What are you interested in? (optional)'),
        false,
        String(p.interestPh || 'Solar, battery, heat pump, EV…'),
        'textarea',
        'interest',
      );
    }
    const seg =
      p.showTabs === false
        ? '<input type="hidden" name="propertyType" value="home">'
        : `<div class="pv-seg" role="group" aria-label="Property type"><button type="button" class="on" data-value="home">${esc(p.tabHome || 'For my home')}</button><button type="button" data-value="business">${esc(p.tabBiz || 'For my business')}</button></div>`;
    const cta =
      `<button type="submit" class="pv-btn solar${p.pulse ? ' pulse' : ''}"><span data-btn-label>${esc(p.btn || 'Get my free quote')}</span>` +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>';
    const foot = p.footnote
      ? `<p class="pv-form-re">${QUOTE_SHIELD_SVG}<span>${esc(p.footnote)}</span></p>`
      : '';
    const legal = p.legalNote ? `<p class="pv-form-note">${esc(p.legalNote)}</p>` : '';
    const feb =
      p.eyebrow != null && String(p.eyebrow).trim() !== ''
        ? String(p.eyebrow)
        : 'Free, no-obligation quote';
    const ftl =
      p.title != null && String(p.title).trim() !== ''
        ? String(p.title)
        : 'Ready to see what you could save?';
    const why =
      `<div class="pv-why">${eyebrow(feb)}<h2>${accentText(ftl)}</h2>${pts}${callBox}</div>`;
    const form =
      `<form class="pv-qcard pv-cms-form" action="/api/quote" method="post" novalidate>${seg}${rows}` +
      `<div class="pv-form-msg" hidden></div><div class="pv-form-actions">${cta}</div>${foot}${legal}</form>`;
    return `<div class="pv-quote is-split" id="${esc(anchor)}"><div class="wrap"><div class="pv-qgrid">${why}${form}</div></div></div>`;
  }

  if (t === 'faq') {
    const items = Array.isArray(p.items) ? (p.items as Array<{ q?: string; a?: string }>) : [];
    const feb =
      p.eyebrow != null && String(p.eyebrow).trim() !== ''
        ? String(p.eyebrow)
        : 'Good to know';
    const ftl =
      p.title != null && String(p.title).trim() !== ''
        ? String(p.title)
        : 'Your questions, answered';
    const anchor =
      p.anchor && String(p.anchor).trim()
        ? String(p.anchor).trim().replace(/[^a-zA-Z0-9_-]/g, '')
        : 'faq';
    const qa = items
      .map((q, i) => {
        const num = String(i + 1).padStart(2, '0');
        return (
          `<div class="qa2"><button type="button" class="q"><span class="ix">Q/${num}</span><span>${esc(q.q)}</span><span class="tog"></span></button>` +
          `<div class="a"><p>${esc(q.a)}</p></div></div>`
        );
      })
      .join('');
    return (
      `<div class="pv-faq" id="${esc(anchor)}"><div class="wrap"><div class="shead center">${eyebrow(feb)}<h2>${accentText(ftl)}</h2></div><div class="faq">${qa}</div></div></div>`
    );
  }

  if (t === 'stats') {
    const items = Array.isArray(p.items) ? (p.items as Array<{ n?: string; k?: string }>) : [];
    return (
      `<div class="pv-stats" style="grid-template-columns:repeat(${items.length || 1},1fr)">` +
      items
        .map((s) => `<div class="pv-stat"><div class="n">${esc(s.n)}</div><div class="k">${esc(s.k)}</div></div>`)
        .join('') +
      '</div>'
    );
  }

  if (t === 'testi') {
    const items = Array.isArray(p.items)
      ? (p.items as Array<{ stars?: number; quote?: string; name?: string; loc?: string }>)
      : [];
    const teb =
      p.eyebrow != null && String(p.eyebrow).trim() !== '' ? String(p.eyebrow) : 'Real customers';
    const ttl = String(p.title || 'Trusted across South Wales');
    const fn =
      p.footnote === '' ? null : String(p.footnote || 'Illustrative testimonials — replace with your real Google & Trustpilot reviews.');
    const tq = (q: unknown) => {
      const s = String(q ?? '');
      if (!s) return '""';
      if (/^["'“”]/.test(s)) return esc(s);
      return `"${esc(s)}"`;
    };
    const cards = items
      .map(
        (tt) =>
          `<div class="tcard"><div class="stars">${'★'.repeat(tt.stars || 5)}</div><blockquote>${tq(tt.quote)}</blockquote><div class="who"><b>${esc(tt.name)}</b> <span>· <span>${esc(tt.loc)}</span></span></div></div>`,
      )
      .join('');
    let body =
      items.length > 3
        ? `<div class="pv-tmarquee"><div class="trk" style="animation-duration:${Number(p.speed) || 36}s">${cards}${cards}</div></div>`
        : `<div class="tgrid">${cards}</div>`;
    const fnHtml = fn ? `<p class="pv-testi-note">${esc(fn)}</p>` : '';
    return (
      `<div class="pv-testi"><div class="wrap"><div class="shead center">${eyebrow(teb)}<h2>${accentText(ttl)}</h2></div>${body}${fnHtml}</div></div>`
    );
  }

  if (t === 'gallery') {
    const items = Array.isArray(p.items)
      ? (p.items as Array<{ img?: unknown; loc?: string; featured?: boolean }>)
      : [];
    const geb =
      p.eyebrow != null && String(p.eyebrow).trim() !== '' ? String(p.eyebrow) : 'Recent work';
    const gtl =
      p.title != null && String(p.title).trim() !== ''
        ? String(p.title)
        : 'Installs across South Wales';
    const gsub =
      p.sub === ''
        ? null
        : p.sub != null && String(p.sub).trim() !== ''
          ? String(p.sub)
          : "A few of the homes and businesses we've powered up. Real drone & install photos drop straight into these frames.";
    const gfn =
      p.footnote === ''
        ? null
        : p.footnote != null && String(p.footnote).trim() !== ''
          ? String(p.footnote)
          : 'Placeholder frames — swap in your real drone & install photography.';
    const gfl =
      p.featuredLabel != null && String(p.featuredLabel).trim() !== ''
        ? String(p.featuredLabel)
        : 'Featured install';
    let gfi = 0;
    items.forEach((it, i) => {
      if (it.featured) gfi = i;
    });
    if (typeof p.featuredIndex === 'number') gfi = p.featuredIndex;
    gfi = Math.max(0, Math.min(gfi, Math.max(0, items.length - 1)));
    const cards = items
      .map((it, i) => {
        const src = imgSrc(it.img);
        let img = '';
        if (src) {
          let style = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;z-index:0';
          if (typeof it.img === 'object' && it.img) {
            const m = it.img as Record<string, unknown>;
            const fx = clampFocus(m.focusX);
            const fy = clampFocus(m.focusY);
            style += `;object-position:${fx}% ${fy}%`;
          }
          img = `<img src="${esc(src)}" alt="" loading="lazy" decoding="async" style="${style}">`;
        }
        const ph = src
          ? ''
          : `<span class="ph">${GAL_CAM}${i === gfi ? `<span class="t">${esc(gfl)}</span>` : ''}</span>`;
        return `<div class="gcard${i === gfi ? ' big' : ''}">${img}${ph}<span class="loc">${esc(it.loc)}</span></div>`;
      })
      .join('');
    const subHtml = gsub ? `<p>${esc(gsub)}</p>` : '';
    const gfnHtml = gfn ? `<p class="pv-gal-note">${esc(gfn)}</p>` : '';
    return (
      `<div class="pv-gallery"><div class="wrap"><div class="shead center">${eyebrow(geb)}<h2>${accentText(gtl)}</h2>${subHtml}</div><div class="gallery">${cards}</div>${gfnHtml}</div></div>`
    );
  }

  if (t === 'funding') {
    const items = Array.isArray(p.items)
      ? (p.items as Array<{ title?: string; text?: string }>)
      : [];
    const feb =
      p.eyebrow != null && String(p.eyebrow).trim() !== ''
        ? String(p.eyebrow)
        : 'Funding & finance';
    const ftl =
      p.title != null && String(p.title).trim() !== ''
        ? String(p.title)
        : 'Solar within reach, whatever your budget';
    const fsub =
      p.sub === ''
        ? null
        : p.sub != null && String(p.sub).trim() !== ''
          ? String(p.sub)
          : 'Buy outright, spread the cost, or pay nothing upfront — plus the Welsh grants worth knowing about.';
    const cols = Math.min(Math.max(items.length, 1), 3);
    const cards = items
      .map(
        (it) =>
          `<div class="fcard"><h3>${accentText(it.title)}</h3><p>${esc(it.text).replace(/\n/g, '<br>')}</p></div>`,
      )
      .join('');
    const subHtml = fsub ? `<p>${esc(fsub)}</p>` : '';
    const ctaHtml =
      !p.ctaDisabled && p.cta && String(p.cta).trim()
        ? `<a class="pv-urgency" href="${esc(p.ctaHref || '/commercial-funding')}"><span class="dot"></span><span>${esc(p.cta)}</span></a>`
        : '';
    return (
      `<div class="pv-funding"><div class="pv-funding-glow"></div><div class="wrap"><div class="shead">${eyebrow(feb, true)}<h2>${accentText(ftl)}</h2>${subHtml}</div><div class="fgrid" style="grid-template-columns:repeat(${cols},1fr)">${cards}</div>${ctaHtml}</div></div>`
    );
  }

  if (t === 'clientbanner') {
    const cs = Array.isArray(p.clients) ? (p.clients as Array<{ name?: string; img?: unknown }>) : [];
    if (!cs.length) return `<div class="pv-banner${p.dark ? ' dk' : ''}"><div class="bh">${accentText(p.heading)}</div><div class="pv-bmarq"><div class="trk"></div></div></div>`;
    const chip = (c: { name?: string; img?: unknown }) => {
      const src = imgSrc(c.img);
      return `<span class="pv-brand">${src ? `<img src="${esc(src)}" alt="${esc(c.name)}">` : esc(c.name)}</span>`;
    };
    let cset = cs.map(chip).join('');
    let cn = cs.length;
    while (cn < 10) {
      cset += cs.map(chip).join('');
      cn += cs.length;
    }
    return `<div class="pv-banner${p.dark ? ' dk' : ''}"><div class="bh">${accentText(p.heading)}</div><div class="pv-bmarq"><div class="trk"><div class="pv-bset">${cset}</div><div class="pv-bset" aria-hidden="true">${cset}</div></div></div></div>`;
  }

  if (t === 'accbanner') {
    const is = Array.isArray(p.items) ? (p.items as Array<{ name?: string; img?: unknown }>) : [];
    if (!is.length) return `<div class="pv-banner${p.dark ? ' dk' : ''}"><div class="bh">${accentText(p.heading)}</div><div class="pv-bmarq"><div class="trk"></div></div></div>`;
    const chip = (c: { name?: string; img?: unknown }) => {
      const src = imgSrc(c.img);
      return `<span class="pv-brand">${src ? `<img src="${esc(src)}" alt="${esc(c.name)}" style="height:40px;width:auto;object-fit:contain">` : esc(c.name)}</span>`;
    };
    let iset = is.map(chip).join('');
    let inum = is.length;
    while (inum < 10) {
      iset += is.map(chip).join('');
      inum += is.length;
    }
    return `<div class="pv-banner${p.dark ? ' dk' : ''}"><div class="bh">${accentText(p.heading)}</div><div class="pv-bmarq"><div class="trk"><div class="pv-bset">${iset}</div><div class="pv-bset" aria-hidden="true">${iset}</div></div></div></div>`;
  }

  if (t === 'grid') {
    const items = Array.isArray(p.items)
      ? (p.items as Array<{ icon?: string; title?: string; desc?: string }>)
      : [];
    const cols = Number(p.cols) || 3;
    const anchor =
      p.anchor && String(p.anchor).trim()
        ? ` id="${esc(String(p.anchor).trim().replace(/[^a-zA-Z0-9_-]/g, ''))}"`
        : '';
    // Known limitation: this server path is only the scheduled-publish FALLBACK
    // (used when no client-rendered HTML exists). It renders a generic icon stub
    // rather than the per-item duotone glyph — the client engine owns the full icon
    // set, and the mainstream publish path serves the client-rendered HTML with the
    // real icons, so live pages are unaffected.
    const card = (it: { icon?: string; title?: string; desc?: string }) =>
      `<div class="pv-card"><span class="ic">${iconStub(22)}</span><h3>${accentText(it.title)}</h3><p>${esc(it.desc)}</p></div>`;
    let inner = '';
    if (p.fill === 'balance') {
      inner =
        '<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:14px">' +
        items
          .map(
            (it) =>
              `<div class="pv-card" style="flex:0 1 calc(${100 / cols}% - 14px);min-width:220px"><span class="ic">${iconStub(22)}</span><h3>${accentText(it.title)}</h3><p>${esc(it.desc)}</p></div>`,
          )
          .join('') +
        '</div>';
    } else {
      let extra = '';
      const rem = items.length % cols;
      if (rem !== 0 && p.fill === 'contact') {
        const gap = cols - rem;
        extra =
          `<div class="pv-card pv-contact" style="grid-column:span ${gap}"><h3>${accentText(p.contactHeading || 'Get in touch')}</h3><p>${esc(p.contactText || "Not sure which option fits? Tell us your setup and we'll point you the right way.")}</p>${btn(p.contactBtn || 'Contact us', 'solar', false, p.contactHref || '#quote')}</div>`;
      }
      inner =
        `<div class="pv-grid" style="grid-template-columns:repeat(${cols},1fr)">` +
        items.map(card).join('') +
        extra +
        '</div>';
    }
    return `<div class="pv-sec"${anchor}><div class="shead${p.centerHeader ? ' center' : ''}">${eyebrow(p.eyebrow)}<h2>${accentText(p.title)}</h2></div>${inner}</div>`;
  }

  if (t === 'steps') {
    const items = Array.isArray(p.items)
      ? (p.items as Array<{ title?: string; text?: string }>)
      : [];
    return (
      `<div class="pv-sec"><div class="shead">${eyebrow(p.eyebrow || 'How it works')}<h2>${accentText(p.title)}</h2></div>` +
      `<div class="pv-steps" style="grid-template-columns:repeat(${Math.min(items.length || 1, 4)},1fr)">` +
      items
        .map(
          (s, i) =>
            `<div class="pv-pstep"><div class="n">0${i + 1}</div><h4>${accentText(s.title)}</h4><p>${esc(s.text).replace(/\n/g, '<br>')}</p></div>`,
        )
        .join('') +
      '</div></div>'
    );
  }

  if (t === 'pricing') {
    const plans = Array.isArray(p.plans)
      ? (p.plans as Array<{ name?: string; price?: string; per?: string; feats?: unknown; cta?: string; ctaHref?: string; hl?: boolean }>)
      : [];
    return (
      `<div class="pv-sec"><div class="shead center">${eyebrow(p.eyebrow || 'Options')}<h2>${accentText(p.title)}</h2></div>` +
      `<div style="display:grid;grid-template-columns:repeat(${plans.length || 1},1fr);gap:14px">` +
      plans
        .map((pl) => {
          const feats = Array.isArray(pl.feats) ? (pl.feats as unknown[]) : [];
          return (
            `<div class="pv-card${pl.hl ? ' pv-plan-hl' : ''}"><div style="font-family:var(--mono);font-size:.64rem;text-transform:uppercase;letter-spacing:.06em;color:var(--amber-2)">${esc(pl.name)}</div>` +
            `<div style="font-family:var(--display);font-weight:900;font-size:1.9rem;margin:6px 0">${esc(pl.price)}</div>` +
            `<div style="color:var(--muted);font-size:.8rem;margin-bottom:12px">${esc(pl.per)}</div>` +
            feats
              .map(
                (f) =>
                  `<div style="display:flex;gap:8px;padding:5px 0;font-size:.87rem;border-top:1px solid var(--line)"><span style="color:var(--ok)">✓</span><span>${esc(f)}</span></div>`,
              )
              .join('') +
            `<div style="margin-top:14px">${btn(pl.cta, pl.hl ? 'solar' : 'dark ghost', false, pl.ctaHref || '#quote')}</div></div>`
          );
        })
        .join('') +
      '</div></div>'
    );
  }

  if (t === 'casestudy') {
    const items = Array.isArray(p.items)
      ? (p.items as Array<{ img?: unknown; loc?: string; title?: string; stat?: string; statlabel?: string }>)
      : [];
    return (
      `<div class="pv-sec"><div class="shead">${eyebrow(p.eyebrow || 'Our work')}<h2>${accentText(p.title)}</h2></div>` +
      `<div style="display:grid;grid-template-columns:repeat(${Math.min(items.length || 1, 3)},1fr);gap:14px">` +
      items
        .map((cs) => {
          const src = imgSrc(cs.img);
          const media = src
            ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async" style="width:100%;height:150px;object-fit:cover;display:block">`
            : '<div style="height:150px;background:linear-gradient(135deg,#26324c,#171d2b)"></div>';
          return (
            `<div class="pv-card" style="padding:0;overflow:hidden">${media}<div style="padding:18px">` +
            `<div style="font-family:var(--mono);font-size:.6rem;letter-spacing:.05em;text-transform:uppercase;color:var(--muted)">${esc(cs.loc)}</div>` +
            `<h3 style="font-size:1.02rem;font-weight:600;margin-top:4px">${accentText(cs.title)}</h3>` +
            `<div style="font-family:var(--display);font-weight:900;color:var(--amber-2);font-size:1.4rem;margin-top:10px">${esc(cs.stat)}</div>` +
            `<div style="font-size:.76rem;color:var(--muted)">${esc(cs.statlabel)}</div></div></div>`
          );
        })
        .join('') +
      '</div></div>'
    );
  }

  if (t === 'explorer') {
    const items = (Array.isArray(p.items)
      ? (p.items as Array<{ title?: string; text?: string; img?: unknown; cta?: string; ctaHref?: string }>)
      : []).slice(0, 8);
    const list = items.length ? items : [{ title: 'Option', text: 'Description.' }];
    const xeb = p.eyebrow != null && String(p.eyebrow).trim() !== '' ? String(p.eyebrow) : 'Mounting systems';
    const xtl = p.title != null && String(p.title).trim() !== '' ? String(p.title) : 'One roof, every way to mount it';
    const xsub = p.sub === '' ? null
      : p.sub != null && String(p.sub).trim() !== '' ? String(p.sub)
      : 'Pick a system to see how we install it — and the photo updates with it.';
    const gid = `pvfx-${esc(String((b as { id?: unknown }).id || 'x'))}`;
    const radios = list.map((_it, i) =>
      `<input class="pv-fx-radio" type="radio" name="${gid}" id="${gid}-${i + 1}"${i === 0 ? ' checked' : ''}>`).join('');
    const shots = list.map((it, i) => {
      const num = String(i + 1).padStart(2, '0');
      const src = imgSrc(it.img);
      const im = src
        ? `<img src="${esc(src)}" alt="${esc(it.title || '')}" loading="lazy" decoding="async" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">`
        : '<div class="pv-fx-empty" aria-hidden="true">IMAGE</div>';
      return `<figure class="pv-fx-shot">${im}<span class="pv-fx-tag">${num} / ${esc(it.title || '')}</span></figure>`;
    }).join('');
    const rows = list.map((it, i) => {
      const num = String(i + 1).padStart(2, '0');
      const cta = it.cta && String(it.cta).trim()
        ? `<a class="pv-btn solar pv-fx-cta" href="${esc(it.ctaHref || '#quote')}"><span>${esc(it.cta)}</span></a>`
        : '';
      return `<label class="pv-fx-item" for="${gid}-${i + 1}">`
        + `<span class="pv-fx-no">${num}</span>`
        + `<span class="pv-fx-copy"><span class="pv-fx-title">${accentText(it.title || '')}</span>`
        + `<span class="pv-fx-desc"><span class="pv-fx-desc-in"><span class="pv-fx-desc-tx">${esc(it.text || '').replace(/\n/g, '<br>')}</span>${cta}</span></span></span>`
        + `<span class="pv-fx-chev" aria-hidden="true"></span></label>`;
    }).join('');
    const xsubHtml = xsub ? `<p>${esc(xsub)}</p>` : '';
    return `<section class="pv-fx"><div class="pv-fx-glow"></div><div class="wrap"><div class="shead">${eyebrow(xeb, true)}<h2>${accentText(xtl)}</h2>${xsubHtml}</div>${radios}<div class="pv-fx-inner"><div class="pv-fx-stage">${shots}</div><div class="pv-fx-list">${rows}</div></div></div></section>`;
  }

  return '';
}

/** Build live `pv-page` HTML from draft CMS blocks. */
export function renderCmsPageHtml(
  blocks: unknown[] | undefined | null,
  images?: LibImage[] | null
): string {
  const prev = _libImages;
  _libImages = Array.isArray(images) ? images : [];
  try {
    const list = Array.isArray(blocks) ? (blocks as LooseBlock[]) : [];
    const inner = list
      .map((b) => {
        const html = renderBlock(b);
        if (!html) return '';
        return `<div style="${spacingStyle(b.p)}">${html}</div>`;
      })
      .filter(Boolean)
      .join('\n');
    return `<div class="pv-page">${inner}</div>`;
  } finally {
    _libImages = prev;
  }
}
