/**
 * Server-side CMS page HTML for scheduled publish (publish-mode, no edit attrs).
 * Covers AI blog template blocks + common extras so schedule can run without opening the editor.
 */

type LooseBlock = { id?: string; t?: string; p?: Record<string, unknown> };

const SPARK =
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style="fill:var(--amber-2)"><g transform="rotate(0 12 12)"><path d="M11 9.6 L13 9.6 L13 0.8 L11 3 Z"/></g><g transform="rotate(90 12 12)"><path d="M11 9.6 L13 9.6 L13 0.8 L11 3 Z"/></g><g transform="rotate(180 12 12)"><path d="M11 9.6 L13 9.6 L13 0.8 L11 3 Z"/></g><g transform="rotate(270 12 12)"><path d="M11 9.6 L13 9.6 L13 0.8 L11 3 Z"/></g></svg>';

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

function btn(label: unknown, cls: string, pulse?: boolean, href?: unknown): string {
  if (!label) return '';
  const inner =
    `<span>${esc(label)}</span>` +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  const clsFull = `pv-btn ${cls}${pulse ? ' pulse' : ''}`;
  const link = href != null && String(href).trim() ? String(href).trim() : '';
  if (link) {
    return `<a class="${clsFull}" href="${esc(link)}">${inner}</a>`;
  }
  return `<span class="${clsFull}">${inner}</span>`;
}

function eyebrow(t: unknown): string {
  if (!(t && String(t).trim())) return '';
  return `<span class="pv-eyebrow">${SPARK}<span>${esc(t)}</span></span>`;
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

function imgSrc(val: unknown): string {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'object' && val && 'src' in val) return String((val as { src?: string }).src || '');
  if (typeof val === 'object' && val && 'data' in val) return String((val as { data?: string }).data || '');
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

function mediaFrameHtml(val: unknown): string {
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
  const imgStyle =
    `object-position:${focusX}% ${focusY}%;transform:scale(${zoom});transform-origin:${focusX}% ${focusY}%`;
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

function iconStub(size = 18): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/></svg>`;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x ?? '')) : [];
}

function renderBlock(b: LooseBlock): string {
  const p = (b.p || {}) as Record<string, unknown>;
  const t = String(b.t || '');

  if (t === 'hero') {
    const sub =
      p.sub && String(p.sub).trim() ? `<p class="pv-sub">${esc(p.sub)}</p>` : '';
    const btns =
      (p.ctaDisabled ? '' : btn(p.ctaLabel, 'solar', !!p.ctaPulse, p.ctaHref || '#quote')) +
      (p.cta2Disabled ? '' : btn(p.cta2, p.dark ? '' : 'dark ghost', false, p.cta2Href || ''));
    const btnrow = btns ? `<div class="pv-btnrow">${btns}</div>` : '';
    return (
      `<div class="pv-hero${p.dark ? '' : ' light'}${p.textWide ? ' wide' : ''}"><div class="z">` +
      heroTags(p.tags) +
      eyebrow(p.eyebrow) +
      `<h1>${esc(p.headline)}</h1>${sub}${btnrow}</div></div>`
    );
  }

  if (t === 'media') {
    const im = p.img
      ? mediaFrameHtml(p.img)
      : '<div class="pv-media-frame is-empty" aria-hidden="true">IMAGE</div>';
    const ctaBtn = p.ctaDisabled ? '' : btn(p.cta, 'solar', false, p.ctaHref || '#quote');
    const cols = p.textWide
      ? p.side === 'left'
        ? '0.75fr 1.25fr'
        : '1.25fr 0.75fr'
      : '1fr 1fr';
    const tx =
      `<div>${eyebrow(p.eyebrow)}` +
      `<h2 style="font-size:clamp(1.5rem,2.6vw,2.1rem);font-weight:700;margin-top:10px">${esc(p.title)}</h2>` +
      `<p style="color:var(--muted);margin-top:12px;line-height:1.6">${esc(p.text)}</p>` +
      (ctaBtn ? `<div class="pv-btnrow">${ctaBtn}</div>` : '') +
      '</div>';
    return `<div class="pv-media is-blog" style="display:grid;grid-template-columns:${cols};gap:34px;align-items:center">${p.side === 'left' ? im + tx : tx + im}</div>`;
  }

  if (t === 'rich') {
    return `<div class="pv-rich">${String(p.html || '<p></p>')}</div>`;
  }

  if (t === 'cta') {
    return (
      `<div class="pv-cta"><div class="z"><h2>${esc(p.headline)}</h2><p>${esc(p.sub)}</p>` +
      (p.ctaDisabled
        ? ''
        : `<div class="pv-btnrow" style="justify-content:center">${btn(p.btn, 'solar', !!p.pulse, p.btnHref || '#quote')}</div>`) +
      '</div></div>'
    );
  }

  if (t === 'split') {
    const lb = asStringArray(p.lb);
    const rb = asStringArray(p.rb);
    return (
      '<div class="pv-split"><div class="pv-splitcard">' +
      `<h3>${esc(p.lt)}</h3><p>${esc(p.ld)}</p><ul>${lb.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>${btn(p.lc, 'dark', false, p.lcHref || '#quote')}` +
      '</div><div class="pv-splitcard dark">' +
      `<h3>${esc(p.rt)}</h3><p>${esc(p.rd)}</p><ul>${rb.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>${btn(p.rc, 'solar', false, p.rcHref || '/commercial-funding')}` +
      '</div></div>'
    );
  }

  if (t === 'form') {
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
      '<div class="pv-quote" id="quote"><div class="pv-quote-inner"><form class="pv-formcard pv-cms-form" action="/api/quote" method="post" novalidate>' +
      `<div class="pv-quote-head"><h2>${esc(p.heading)}</h2><p>${esc(p.sub)}</p></div>${rows}` +
      `<div class="pv-form-msg" hidden></div><div class="pv-form-actions">${cta}</div>` +
      '<p class="pv-form-note">By submitting this form, you agree to our privacy policy and terms of service.</p></form></div></div>'
    );
  }

  if (t === 'faq') {
    const items = Array.isArray(p.items) ? (p.items as Array<{ q?: string; a?: string }>) : [];
    return (
      '<div class="pv-faq"><div class="shead center">' +
      eyebrow('Good to know') +
      '<h2>Your questions, answered</h2></div>' +
      items
        .map(
          (q, i) =>
            `<div class="pv-qa"><div class="q"><span class="ix">Q/0${i + 1}</span><span>${esc(q.q)}</span></div><div class="a">${esc(q.a)}</div></div>`,
        )
        .join('') +
      '</div>'
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

  return '';
}

/** Build live `pv-page` HTML from draft CMS blocks. */
export function renderCmsPageHtml(blocks: unknown[] | undefined | null): string {
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
}
