'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState } from 'react';
import type { TemplateSummary, UploadItem } from '@/lib/design/types';
import type { StudioApi } from '../DesignStudio';
import { BRAND_COLOURS, BRAND_RULES, CTAS, ICON_NAMES, LOGOS, STRAPLINES, TEXT_STYLES, ACCREDITATIONS, CONTACT, brandColour } from '../lib/brand';
import { brandSvg, type IconTone } from '../lib/assets';
import { startersFor } from '../lib/starters';
import * as api from '../lib/api';
import { mm } from '../lib/engine';
import { Ico, type IconName } from './icons';

type Tab = 'design' | 'brand' | 'text' | 'icons' | 'photos' | 'shapes' | 'layers';
const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'design', label: 'Design', icon: 'layout' },
  { id: 'brand', label: 'Brand', icon: 'brand' },
  { id: 'text', label: 'Text', icon: 'text' },
  { id: 'icons', label: 'Icons', icon: 'icons' },
  { id: 'photos', label: 'Photos', icon: 'photo' },
  { id: 'shapes', label: 'Shapes', icon: 'shapes' },
  { id: 'layers', label: 'Layers', icon: 'layers' },
];

export function LeftPanel({ s }: { s: StudioApi }) {
  const [tab, setTab] = useState<Tab>('design');
  return (
    <aside className="ds2-left">
      <nav className="ds2-rail" aria-label="Tools">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)} title={t.label}>
            <Ico n={t.icon} size={20} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      <div className="ds2-panel">
        {tab === 'design' && <DesignTab s={s} />}
        {tab === 'brand' && <BrandTab s={s} />}
        {tab === 'text' && <TextTab s={s} />}
        {tab === 'icons' && <IconsTab s={s} />}
        {tab === 'photos' && <PhotosTab s={s} />}
        {tab === 'shapes' && <ShapesTab s={s} />}
        {tab === 'layers' && <LayersTab s={s} />}
      </div>
    </aside>
  );
}

function Sec({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="ds2-sec">
      <div className="ds2-sec-h">
        <h3>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ---------------- Design: format, starters, templates ---------------- */

function DesignTab({ s }: { s: StudioApi }) {
  const [lib, setLib] = useState<{ ready: boolean; items: TemplateSummary[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const load = () => api.listTemplates().then(setLib).catch(() => setLib({ ready: false, items: [] }));
  // reloads when a template is saved to the library (libTick)
  useEffect(() => {
    void load();
  }, [s.libTick]);
  const starters = startersFor(s.doc.formatId, s.digital);
  const t = s.engine.template;
  return (
    <>
      <Sec title="This design">
        <div className="ds2-card">
          <b>{s.doc.formatLabel}</b>
          <span className="ds2-dim">
            {round1(s.doc.geometry.trim.w)} × {round1(s.doc.geometry.trim.h)} mm trim · {round1(s.doc.geometry.trim.x)} mm bleed · {round1(s.doc.geometry.safe)} mm safe
          </span>
          {s.doc.geometry.note && <span className="ds2-note">{s.doc.geometry.note}</span>}
        </div>
        <button className="ds2-btn full" onClick={() => s.openDialog('new')}><Ico n="plus" /> New design / change size</button>
      </Sec>

      {s.doc.formatId === 'template' && (
        <Sec title="Getting started">
          <p className="ds2-hint">Lay a brand background across the whole sheet, then place the logo and copy on the panels your template marks out.</p>
          <div className="ds2-bgs">
            <button className="ds2-bg dark" onClick={() => s.engine.addBrandBg({ base: '#211F18', glow: true, grid: true, dark: true })}><span>Ink · glow · grid</span></button>
            <button className="ds2-bg light hx-light" onClick={() => s.engine.addBrandBg({ base: '#F7F2E7', glow: true, grid: true, dark: false })}><span>Paper · grid</span></button>
          </div>
        </Sec>
      )}

      {starters.length > 1 && (
        <Sec title="Starting layouts">
          <div className="ds2-list">
            {starters.filter((x) => x.id !== 'blank').map((st) => (
              <button key={st.id} className="ds2-item" onClick={() => void s.applyStarter(st.id)}>
                <Ico n="spark" size={14} className="gold" />
                <span><b>{st.name}</b><small>{st.hint}</small></span>
              </button>
            ))}
          </div>
        </Sec>
      )}

      <Sec title="Printer template">
        {t ? (
          <div className="ds2-card">
            <b><Ico n="template" size={14} /> {t.ref.name}</b>
            <span className="ds2-dim">Guide only — never printed unless you choose to include it.</span>
            <div className="ds2-seg">
              {(['over', 'under', 'off'] as const).map((m) => (
                <button key={m} className={t.ref.mode === m ? 'on' : ''} onClick={() => s.setTemplateRef({ mode: m })}>
                  {m === 'over' ? 'On top' : m === 'under' ? 'Behind' : 'Hidden'}
                </button>
              ))}
            </div>
            <label className="ds2-range">
              Opacity <input type="range" min={0.1} max={1} step={0.05} value={t.ref.opacity} onChange={(e) => s.setTemplateRef({ opacity: Number(e.target.value) })} />
            </label>
            <button className="ds2-link danger" onClick={s.removeTemplate}>Remove template</button>
            <span className="ds2-dim">It’s also the bottom row in Layers.</span>
          </div>
        ) : (
          <p className="ds2-hint">Got a template from your printer (business cards, folders, pop-ups)? Import the PDF and design over it — the studio matches its size, bleed and safe area.</p>
        )}
        <button className="ds2-btn full" onClick={() => fileRef.current?.click()}><Ico n="upload" /> Import printer template (PDF)</button>
        <input ref={fileRef} type="file" accept="application/pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void s.importTemplateFile(f); }} />
      </Sec>

      <Sec title="Template library" action={<button className="ds2-link" onClick={() => void load()}>Refresh</button>}>
        {!lib ? (
          <p className="ds2-hint">Loading…</p>
        ) : !lib.ready ? (
          <p className="ds2-hint">Saved templates appear here once <b>design-studio.sql</b> has been run (it’s on your setup to-do list).</p>
        ) : !lib.items.length ? (
          <p className="ds2-hint">No templates yet. Import one and tick “Save to the template library”.</p>
        ) : (
          <div className="ds2-list">
            {lib.items.map((it) => (
              <div key={it.id} className="ds2-item row">
                <button className="grow" onClick={() => void s.useLibraryTemplate(it)}>
                  <Ico n="template" size={15} />
                  <span><b>{it.name}</b><small>{round1(it.geometry.trim.w)} × {round1(it.geometry.trim.h)} mm{it.geometry.note ? ` · ${it.geometry.note}` : ''}</small></span>
                </button>
                <button className="ds2-icon sm" title="Remove from library" onClick={async () => {
                  if (!window.confirm(`Remove “${it.name}” from the library? Designs that use it keep working.`)) return;
                  try { await api.deleteTemplate(it.id); void load(); } catch (e) { s.toast(e instanceof Error ? e.message : 'Couldn’t remove it.'); }
                }}><Ico n="trash" size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </Sec>
    </>
  );
}

/* ---------------- Brand ---------------- */

function BrandTab({ s }: { s: StudioApi }) {
  const e = s.engine;
  const [logoSvgs, setLogoSvgs] = useState<Record<string, string>>({});
  useEffect(() => {
    for (const l of LOGOS) brandSvg(l.asset).then((svg) => setLogoSvgs((x) => ({ ...x, [l.id]: svg }))).catch(() => undefined);
  }, []);
  const addComponent = async (id: string) => {
    const sf = e.safePt();
    if (id === 'button') e.addButton(CTAS[0], 'solid');
    if (id === 'button-dark') e.addButton(CTAS[1], 'dark');
    if (id === 'chips' || id === 'chips-dark') {
      const list: any[] = [];
      let x = sf.x;
      for (const a of ACCREDITATIONS) {
        const c = e.addButton(a, id === 'chips' ? 'chip' : 'chip-dark', false);
        c.set({ left: x, top: sf.y + sf.h - c.height });
        c.setCoords();
        x += c.width + mm(1.5);
        list.push(c);
      }
      e.canvas.setActiveObject(new e.f.ActiveSelection(list, { canvas: e.canvas }));
      e.canvas.requestRenderAll();
    }
    if (id === 'eyebrow') {
      const t = e.addText('eyebrow', 'MCS-certified · South Wales');
      const size = t.fontSize * 1.1;
      const sp = await e.addSvg(await brandSvg('heliaxis-spark.svg'), { role: 'spark', name: 'Spark', widthPt: size });
      sp.set({ left: t.left, top: t.top + (t.height - size) / 2 });
      sp.setCoords();
      t.set({ left: t.left + size * 1.6 });
      t.setCoords();
      e.canvas.setActiveObject(new e.f.ActiveSelection([sp, t], { canvas: e.canvas }));
      e.canvas.requestRenderAll();
    }
    if (id === 'contact') e.addText('label', `${CONTACT.web.toUpperCase()} · ${CONTACT.phone} · ${CONTACT.email.toUpperCase()}`);
    if (id === 'stat') {
      const n = e.addText('stat', '£1,240');
      const l = e.addText('label', 'Average yearly saving*');
      l.set({ left: n.left, top: n.top + n.height + mm(1) });
      l.setCoords();
      e.canvas.setActiveObject(new e.f.ActiveSelection([n, l], { canvas: e.canvas }));
      e.canvas.requestRenderAll();
      s.toast('Only use real, provable figures — add the footnote that explains them.');
    }
    if (id === 'frame') e.addFrame();
  };
  return (
    <>
      <Sec title="Logo">
        <div className="ds2-logos">
          {LOGOS.map((l) => (
            <button key={l.id} className={`ds2-logo${l.onDark ? ' dark' : ' hx-light'}${l.role === 'spark' ? ' spark' : ''}`} onClick={() => void s.addLogo(l.id)} title={`Add ${l.name}`}>
              {logoSvgs[l.id] ? <span dangerouslySetInnerHTML={{ __html: logoSvgs[l.id] }} /> : <span className="ds2-dim">{l.name}</span>}
            </button>
          ))}
        </div>
        <p className="ds2-hint">Print-quality vectors. Charcoal on light, reversed on dark — never recoloured or stretched.</p>
      </Sec>
      <Sec title="Colours">
        <div className="ds2-swatches">
          {BRAND_COLOURS.filter((c) => !c.statusOnly).map((c) => (
            <button key={c.id} className="ds2-sw hx-light" style={{ background: c.hex }} title={`${c.name} ${c.hex} — ${c.role}`} onClick={() => e.setFill(c.hex)} />
          ))}
        </div>
        <p className="ds2-hint">Select something, then a colour. While editing text, highlight words and pick gold for the brand accent.</p>
      </Sec>
      <Sec title="Backgrounds">
        <div className="ds2-bgs">
          <button className="ds2-bg dark" onClick={() => e.addBrandBg({ base: '#211F18', glow: true, grid: true, dark: true })}><span>Ink · glow · grid</span></button>
          <button className="ds2-bg light hx-light" onClick={() => e.addBrandBg({ base: '#F7F2E7', glow: true, grid: true, dark: false })}><span>Paper · grid</span></button>
          <button className="ds2-bg card hx-light" onClick={() => e.addBrandBg({ base: '#FFFDF8', glow: false, grid: true, dark: false })}><span>Card · grid</span></button>
          <button className="ds2-bg gold" onClick={() => e.addBrandBg({ base: '#F8BC1E', glow: false, grid: false, dark: false })}><span>Solar gold</span></button>
        </div>
      </Sec>
      <Sec title="Components">
        <div className="ds2-list">
          {[
            ['button', 'Gold button', CTAS[0]],
            ['button-dark', 'Dark button', CTAS[1]],
            ['chips', 'Accreditation chips', ACCREDITATIONS.join(' · ')],
            ['chips-dark', 'Chips (on dark)', ACCREDITATIONS.join(' · ')],
            ['eyebrow', 'Eyebrow with spark', 'Mono caps label'],
            ['contact', 'Contact line', `${CONTACT.web} · ${CONTACT.phone}`],
            ['stat', 'Big number', 'Ezra stat + label'],
            ['frame', 'Photo frame', 'Drop a photo in later'],
          ].map(([id, name, hint]) => (
            <button key={id} className="ds2-item" onClick={() => void addComponent(id)}>
              <Ico n="spark" size={14} className="gold" />
              <span><b>{name}</b><small>{hint}</small></span>
            </button>
          ))}
        </div>
      </Sec>
      <Sec title="Brand rules">
        <ul className="ds2-rules">{BRAND_RULES.map((r) => <li key={r}>{r}</li>)}</ul>
        <a className="ds2-link" href="/branding" target="_blank" rel="noopener">Full brand guidelines ↗</a>
      </Sec>
    </>
  );
}

/* ---------------- Text ---------------- */

function TextTab({ s }: { s: StudioApi }) {
  const e = s.engine;
  return (
    <>
      <Sec title="Brand type styles">
        <div className="ds2-list">
          {TEXT_STYLES.map((st) => (
            <button key={st.id} className="ds2-type" onClick={() => e.addText(st.id)} title={st.hint}>
              <span style={{ fontFamily: st.fontFamily, fontWeight: st.fontWeight, fontSize: Math.min(26, Math.max(11, st.size * 0.9)), letterSpacing: `${st.charSpacing / 1000}em`, textTransform: st.uppercase ? 'uppercase' : 'none', color: st.colour === 'solar' ? '#F8BC1E' : st.colour === 'amber2' ? '#E39A0C' : st.colour === 'muted' ? '#A69F8E' : '#F7F2E7' }}>
                {st.name}
              </span>
              <small>{st.hint} · {e.styleSize(st)} pt here</small>
            </button>
          ))}
        </div>
      </Sec>
      <Sec title="Straplines">
        <div className="ds2-list">
          {STRAPLINES.map((t) => (
            <button key={t} className="ds2-item" onClick={() => {
              const o = e.addText('display', t);
              const last = t.trim().split(' ').pop()!;
              const i = t.lastIndexOf(last);
              o.setSelectionStyles({ fill: brandColour('solar').hex }, i, i + last.length);
              e.canvas.requestRenderAll();
            }}><span><b>{t}</b><small>Display, last word in gold</small></span></button>
          ))}
        </div>
      </Sec>
      <Sec title="Calls to action">
        <div className="ds2-list">
          {CTAS.map((t) => (
            <button key={t} className="ds2-item" onClick={() => e.addButton(t, 'solid')}><span><b>{t}</b><small>Gold button</small></span></button>
          ))}
        </div>
      </Sec>
    </>
  );
}

/* ---------------- Icons ---------------- */

function IconsTab({ s }: { s: StudioApi }) {
  const [sprite, setSprite] = useState<string | null>(null);
  const [tone, setTone] = useState<IconTone>('ink');
  const [q, setQ] = useState('');
  useEffect(() => {
    brandSvg('heliaxis-icons.svg').then(setSprite).catch(() => setSprite(''));
  }, []);
  const list = ICON_NAMES.filter((n) => n.includes(q.trim().toLowerCase()));
  return (
    <>
      {sprite ? <div hidden dangerouslySetInnerHTML={{ __html: sprite }} /> : null}
      <Sec title="Brand icons">
        <input className="ds2-input" placeholder="Search icons…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="ds2-seg" style={{ margin: '8px 0' }}>
          {(['ink', 'paper', 'gold'] as IconTone[]).map((t) => (
            <button key={t} className={tone === t ? 'on' : ''} onClick={() => setTone(t)}>{t === 'ink' ? 'For light' : t === 'paper' ? 'For dark' : 'Gold'}</button>
          ))}
        </div>
        <div className={`ds2-icons tone-${tone}${tone === 'paper' ? '' : ' hx-light'}`}>
          {list.map((n) => (
            <button key={n} onClick={() => void s.addIcon(n, tone)} title={n}>
              <svg viewBox="0 0 24 24" width="26" height="26"><use href={`#ic-${n}`} /></svg>
              <small>{n}</small>
            </button>
          ))}
        </div>
      </Sec>
    </>
  );
}

/* ---------------- Photos ---------------- */

function PhotosTab({ s }: { s: StudioApi }) {
  const [items, setItems] = useState<UploadItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const load = () => api.listUploads().then((r) => setItems(r.items)).catch(() => setItems([]));
  useEffect(() => {
    void load();
  }, []);
  const a = s.engine.active();
  const target = a && (a.role === 'photo-slot' || a.type === 'image');
  return (
    <>
      <Sec title="Photos">
        <button className="ds2-btn full solar" disabled={busy} onClick={() => fileRef.current?.click()}><Ico n="upload" /> {busy ? 'Uploading…' : 'Upload photos'}</button>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml" multiple hidden onChange={async (e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = '';
          if (!files.length) return;
          setBusy(true);
          try { await s.placeFiles(files); } finally { setBusy(false); void load(); }
        }} />
        <p className="ds2-hint">
          {target ? 'Click a photo to drop it into the selected frame (cropped to fill).' : 'Real install photography only. Tip: select a photo frame first, then click a photo to fill it. You can also drag files onto the page.'}
        </p>
        {!items ? (
          <p className="ds2-hint">Loading…</p>
        ) : !items.length ? (
          <p className="ds2-hint">No uploads yet.</p>
        ) : (
          <div className="ds2-photos">
            {items.filter((it) => it.mime !== 'image/svg+xml').map((it) => (
              <button key={it.path} onClick={() => void s.addImageUrl(api.fileUrl(it.path), it.path, it.name)} title={it.name}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={api.fileUrl(it.path)} alt={it.name} loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </Sec>
    </>
  );
}

/* ---------------- Shapes ---------------- */

function ShapesTab({ s }: { s: StudioApi }) {
  const e = s.engine;
  return (
    <Sec title="Shapes">
      <div className="ds2-shapes">
        <button onClick={() => e.addRect('#F8BC1E')}><span className="shp rect" /> Box</button>
        <button onClick={() => { const r = e.addRect('#F7F2E7'); r.set({ stroke: 'rgba(33,31,24,0.14)', strokeWidth: 0.75, rx: mm(0.8), ry: mm(0.8) }); e.canvas.requestRenderAll(); }}><span className="shp card hx-light" /> Card</button>
        <button onClick={() => e.addEllipse('#F8BC1E')}><span className="shp circle" /> Circle</button>
        <button onClick={() => e.addLine('#211F18')}><span className="shp line" /> Line</button>
        <button onClick={() => { const l = e.addLine('rgba(33,31,24,0.14)'); l.set({ strokeWidth: 0.5 }); e.canvas.requestRenderAll(); }}><span className="shp hair" /> Hairline</button>
        <button onClick={() => e.addFrame()}><span className="shp frame hx-light" /> Photo frame</button>
      </div>
      <p className="ds2-hint">Brand style: hairline borders instead of shadows, tight corners.</p>
    </Sec>
  );
}

/* ---------------- Layers ---------------- */

function LayersTab({ s }: { s: StudioApi }) {
  const e = s.engine;
  const objs = [...e.objects()].reverse();
  const active = new Set(e.activeList());
  const label = (o: any) => o.name || (e.isText(o) ? String(o.text).slice(0, 28) : o.type);
  const t = e.template;
  // The printer template is a layer too: the bottom one (Behind / Hidden), or over everything (On top,
  // set in Design → Printer template). Always locked — it's a guide, never moved or printed.
  const tplRow = t ? (
    <div className={`ds2-layer tpl${t.ref.mode === 'off' ? ' off' : ''}`} key="printer-template">
      <span className="grow" title={`${t.ref.name}${t.ref.title ? ` — ${t.ref.title}` : ''}`}>
        <span className="ds2-layer-k">GUIDE</span> Printer template
      </span>
      <button className="ds2-icon sm" title={t.ref.mode === 'off' ? 'Show the template' : 'Hide the template'} aria-label={t.ref.mode === 'off' ? 'Show the printer template' : 'Hide the printer template'} onClick={s.toggleTemplate}>
        <Ico n={t.ref.mode === 'off' ? 'eyeOff' : 'eye'} size={14} />
      </button>
      <span className="ds2-icon sm ds2-layer-lock" role="img" title="Locked — the template is a guide, never moved or printed" aria-label="Locked">
        <Ico n="lock" size={14} />
      </span>
      <button className="ds2-icon sm" title="Remove the template (Undo in the message that follows)" aria-label="Remove the printer template" onClick={s.removeTemplate}>
        <Ico n="trash" size={14} />
      </button>
    </div>
  ) : null;
  return (
    <Sec title={`Layers (${objs.length + (t ? 1 : 0)})`}>
      {!objs.length && <p className="ds2-hint">{t ? 'Nothing on the template yet — add text, shapes, photos or the logo.' : 'Nothing on this page yet.'}</p>}
      <div className="ds2-layers">
        {t?.ref.mode === 'over' && tplRow}
        {objs.map((o: any, idx: number) => (
          <div key={o.id ?? `layer-${idx}`} className={`ds2-layer${active.has(o) ? ' on' : ''}`}>
            <button className="grow" onClick={() => e.select(o)}>
              <span className="ds2-layer-k">{kindLabel(o)}</span> {label(o)}
            </button>
            <button className="ds2-icon sm" title={o.visible === false ? 'Show' : 'Hide'} onClick={() => e.toggleVisible(o)}>
              <Ico n={o.visible === false ? 'eyeOff' : 'eye'} size={14} />
            </button>
            <button className="ds2-icon sm" title={o.locked ? 'Unlock' : 'Lock'} onClick={() => { e.canvas.setActiveObject(o); e.setLocked(!o.locked); }}>
              <Ico n={o.locked ? 'lock' : 'unlock'} size={14} />
            </button>
          </div>
        ))}
        {t?.ref.mode !== 'over' && tplRow}
      </div>
      {t && <p className="ds2-hint">The printer template is a guide: it’s left out of your PDF unless you tick “Include the printer template” when you export.</p>}
    </Sec>
  );
}

function kindLabel(o: any) {
  if (o.role === 'logo') return 'LOGO';
  if (o.role === 'spark') return 'SPARK';
  if (o.role === 'icon') return 'ICON';
  if (o.role === 'background') return 'BG';
  if (o.role === 'button') return 'BTN';
  if (o.role === 'chip') return 'CHIP';
  if (o.role === 'photo-slot') return 'FRAME';
  if (o.type === 'image') return 'IMG';
  if (o.type === 'textbox') return 'TEXT';
  if (o.type === 'group') return 'GRP';
  return 'SHAPE';
}

const round1 = (n: number) => Math.round(n * 10) / 10;
