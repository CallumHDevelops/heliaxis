'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from 'react';
import type { StudioApi } from '../DesignStudio';
import { BRAND_COLOURS, FONT_LABEL, FONT_STACK, FONT_WEIGHTS, LOGOS, TEXT_STYLES, brandColour, matchBrand, primaryFamily } from '../lib/brand';
import { brandSvg } from '../lib/assets';
import { mm, toMm } from '../lib/engine';
import { Ico, type IconName } from './icons';

function Num({ label, value, onCommit, step = 0.5, unit, min, max }: { label: string; value: number; onCommit: (v: number) => void; step?: number; unit?: string; min?: number; max?: number }) {
  const [v, setV] = useState(fmt(value));
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    // Re-sync when the object changes on the canvas (React's "adjust state during render" pattern).
    setPrev(value);
    setV(fmt(value));
  }
  const commit = () => {
    const n = Number(String(v).replace(',', '.'));
    if (Number.isFinite(n)) onCommit(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n)));
    else setV(fmt(value));
  };
  return (
    <label className="ds2-num">
      <span>{label}</span>
      <input inputMode="decimal" value={v} step={step} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') { commit(); (e.target as HTMLInputElement).blur(); } }} />
      {unit && <em>{unit}</em>}
    </label>
  );
}
const fmt = (n: number) => (Number.isFinite(n) ? String(Math.round(n * 10) / 10) : '');

function Swatches({ value, onPick, allowCustom = true }: { value: string; onPick: (hex: string) => void; allowCustom?: boolean }) {
  const cur = matchBrand(value);
  return (
    <div className="ds2-swatches sm">
      {BRAND_COLOURS.filter((c) => !c.statusOnly).map((c) => (
        <button key={c.id} className={`ds2-sw hx-light${cur?.id === c.id ? ' on' : ''}`} style={{ background: c.hex }} title={`${c.name} ${c.hex}`} onClick={() => onPick(c.hex)} />
      ))}
      {allowCustom && (
        <label className="ds2-sw custom" title="Custom colour (off-brand)">
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'} onChange={(e) => onPick(e.target.value.toUpperCase())} />
        </label>
      )}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="ds2-row">{children}</div>;
}
function Btn({ icon, title, onClick, on }: { icon: IconName; title: string; onClick: () => void; on?: boolean }) {
  return (
    <button className={`ds2-icon${on ? ' on' : ''}`} title={title} onClick={onClick}>
      <Ico n={icon} />
    </button>
  );
}

export function Inspector({ s }: { s: StudioApi }) {
  const e = s.engine;
  const list = e.activeList();
  const o = e.active();
  const [alignTo, setAlignTo] = useState<'safe' | 'trim'>('safe');
  /** Per object: W and H change together? (Shapes default to no, so a panel can be typed exactly.) */
  const [ratioFor, setRatioFor] = useState<Record<string, boolean>>({});

  if (!o) return <aside className="ds2-right"><PageProps s={s} /></aside>;

  const multi = list.length > 1;
  const isText = e.isText(o);
  const box = e.boxMm(o);
  const kind = multi ? `${list.length} selected` : o.name || o.type;
  const fixedRatio = o.role === 'logo' || o.role === 'spark' || o.role === 'icon';
  const shape = ['rect', 'ellipse', 'circle', 'line', 'polygon', 'path', 'brandbg'].includes(o.type) || o.role === 'photo-slot';
  const keepRatio = fixedRatio || (ratioFor[o.id ?? ''] ?? !shape);

  return (
    <aside className="ds2-right">
      <div className="ds2-insp-h">
        <b>{kind}</b>
        <div className="ds2-row tight">
          <Btn icon="copy" title="Duplicate (Ctrl+D)" onClick={() => void e.duplicate()} />
          <Btn icon={o.locked ? 'lock' : 'unlock'} title={o.locked ? 'Unlock' : 'Lock'} onClick={() => e.setLocked(!o.locked)} on={!!o.locked} />
          <Btn icon="trash" title="Delete (Del)" onClick={() => e.removeSelected()} />
        </div>
      </div>

      <section className="ds2-sec">
        <h3>Position · mm</h3>
        <div className="ds2-grid2">
          <Num label="X" value={box.x} onCommit={(v) => e.moveTo(v, null)} />
          <Num label="Y" value={box.y} onCommit={(v) => e.moveTo(null, v)} />
          <Num label="W" value={box.w} onCommit={(v) => e.resizeTo(v, null, keepRatio)} min={0.5} />
          <Num label="H" value={box.h} onCommit={(v) => e.resizeTo(null, v, keepRatio)} min={0.5} />
          {!multi && <Num label="↻" value={o.angle || 0} unit="°" onCommit={(v) => e.rotateTo(v)} />}
          <Num label="Op" value={Math.round((o.opacity ?? 1) * 100)} unit="%" min={0} max={100} onCommit={(v) => e.set({ opacity: v / 100 })} />
        </div>
        {!multi && (
          <label className="ds2-check">
            <input type="checkbox" checked={keepRatio} disabled={fixedRatio} onChange={(ev) => setRatioFor({ ...ratioFor, [o.id ?? '']: ev.target.checked })} />
            <span>Keep proportions{fixedRatio ? ' (logos and icons always do)' : ''}</span>
          </label>
        )}
      </section>

      <section className="ds2-sec">
        <div className="ds2-sec-h">
          <h3>Align</h3>
          {!multi && (
            <div className="ds2-seg xs">
              <button className={alignTo === 'safe' ? 'on' : ''} onClick={() => setAlignTo('safe')}>Safe</button>
              <button className={alignTo === 'trim' ? 'on' : ''} onClick={() => setAlignTo('trim')}>Trim</button>
            </div>
          )}
        </div>
        <Row>
          {([['left', 'alignL'], ['hcenter', 'alignC'], ['right', 'alignR'], ['top', 'alignT'], ['vcenter', 'alignM'], ['bottom', 'alignB']] as const).map(([w, ic]) => (
            <Btn key={w} icon={ic} title={`Align ${w}`} onClick={() => e.align(w, multi ? 'selection' : alignTo)} />
          ))}
        </Row>
        <Row>
          <Btn icon="front" title="Bring to front" onClick={() => e.arrange('front')} />
          <Btn icon="up" title="Forward" onClick={() => e.arrange('forward')} />
          <Btn icon="down" title="Backward" onClick={() => e.arrange('backward')} />
          <Btn icon="back" title="Send to back" onClick={() => e.arrange('back')} />
          {multi ? <Btn icon="group" title="Group (Ctrl+G)" onClick={() => e.group()} /> : o.type === 'group' && o.role === 'group' ? <Btn icon="group" title="Ungroup (Ctrl+Shift+G)" onClick={() => e.ungroup()} /> : null}
          {!multi && (o.type === 'image' || o.role === 'graphic') && <Btn icon="flipH" title="Flip horizontally" onClick={() => e.set({ flipX: !o.flipX })} />}
        </Row>
      </section>

      {!multi && isText && <TextProps s={s} o={o} />}
      {!multi && o.type === 'brandbutton' && <ButtonProps s={s} o={o} />}
      {!multi && o.type === 'brandbg' && <BgProps s={s} o={o} />}
      {!multi && (o.type === 'rect' || o.type === 'ellipse' || o.type === 'circle' || o.type === 'line' || o.type === 'path' || o.type === 'polygon') && <ShapeProps s={s} o={o} />}
      {!multi && o.type === 'image' && <ImageProps s={s} o={o} />}
      {!multi && o.role === 'logo' && <LogoProps s={s} o={o} />}
      {!multi && o.role === 'icon' && <IconProps s={s} o={o} />}
      {!multi && o.role === 'photo-slot' && (
        <section className="ds2-sec">
          <h3>Photo frame</h3>
          <p className="ds2-hint">Open <b>Photos</b> and click one to drop it in — it’s cropped to fill this frame. Or drag a file onto the page with the frame selected.</p>
        </section>
      )}
      {multi && (
        <section className="ds2-sec">
          <h3>Colour</h3>
          <Swatches value="" onPick={(h) => e.setFill(h)} />
        </section>
      )}
    </aside>
  );
}

/* ---------------- page (nothing selected) ---------------- */

function PageProps({ s }: { s: StudioApi }) {
  const g = s.doc.geometry;
  const custom = s.doc.formatId === 'custom' || s.doc.formatId === 'template';
  const bleed = g.trim.x;
  const setBleed = (b: number) => {
    // keep the trim size, change the bleed around it
    s.setGeometry({ ...g, mediaW: g.trim.w + 2 * b, mediaH: g.trim.h + 2 * b, trim: { ...g.trim, x: b, y: b }, folds: g.folds?.map((f) => ({ ...f, at: f.at - g.trim.x + b })), zones: g.zones?.map((z) => ({ ...z, box: { ...z.box, x: z.box.x - g.trim.x + b, y: z.box.y - g.trim.y + b } })) });
  };
  return (
    <>
      <div className="ds2-insp-h"><b>Page</b></div>
      <section className="ds2-sec">
        <h3>Size</h3>
        <div className="ds2-card">
          <b>{s.doc.formatLabel}</b>
          <span className="ds2-dim">Trim {round1(g.trim.w)} × {round1(g.trim.h)} mm · sheet {round1(g.mediaW)} × {round1(g.mediaH)} mm</span>
        </div>
        <div className="ds2-grid2">
          <Num label="Bleed" unit="mm" value={bleed} min={0} max={50} onCommit={(v) => (s.engine.template ? s.toast('The bleed comes from the printer template.') : setBleed(v))} />
          <Num label="Safe" unit="mm" value={g.safe} min={0} max={Math.max(0, Math.floor((Math.min(g.trim.w, g.trim.h) / 2 - 0.5) * 10) / 10)} onCommit={(v) => s.setGeometry({ ...g, safe: v })} />
        </div>
        {!custom && <p className="ds2-hint">Standard sizes use 3 mm bleed. Use your printer’s template if they specify more.</p>}
      </section>
      <section className="ds2-sec">
        <h3>Guides</h3>
        <ul className="ds2-legend">
          <li><i style={{ background: '#e5484d' }} /> Bleed edge — backgrounds run to here</li>
          <li><i style={{ background: '#16a6c9' }} /> Cut line (trim)</li>
          <li><i style={{ background: '#d6409f' }} /> Safe area — keep text inside</li>
          {!!g.folds?.length && <li><i style={{ background: '#8f63ff' }} /> Fold</li>}
          {!!g.zones?.length && <li><i style={{ background: 'rgba(22,166,201,.4)' }} /> Wrap-round / no-go zone</li>}
        </ul>
      </section>
      <section className="ds2-sec">
        <h3>Shortcuts</h3>
        <ul className="ds2-keys">
          <li><kbd>Space</kbd>+drag pan · <kbd>Ctrl</kbd>+scroll zoom</li>
          <li><kbd>Ctrl</kbd>+<kbd>D</kbd> duplicate · <kbd>Ctrl</kbd>+<kbd>G</kbd> group</li>
          <li>Arrows nudge 0.5 mm (<kbd>Shift</kbd> 5 mm)</li>
          <li><kbd>Ctrl</kbd>+<kbd>S</kbd> save · <kbd>Ctrl</kbd>+<kbd>E</kbd> export</li>
        </ul>
      </section>
    </>
  );
}

/* ---------------- text ---------------- */

function TextProps({ s, o }: { s: StudioApi; o: any }) {
  const e = s.engine;
  const fam = primaryFamily(o.fontFamily);
  const weights = FONT_WEIGHTS[fam] ?? [400, 700];
  const editingSel = o.isEditing && o.selectionStart !== o.selectionEnd;
  return (
    <section className="ds2-sec">
      <h3>Text</h3>
      <select className="ds2-select" value={o.styleId ?? ''} onChange={(ev) => e.applyTextStyle(ev.target.value)}>
        <option value="" disabled>Brand style…</option>
        {TEXT_STYLES.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
      </select>
      <div className="ds2-grid2">
        <label className="ds2-num wide">
          <span>Font</span>
          <select value={fam} onChange={(ev) => {
            const f = ev.target.value;
            const w = FONT_WEIGHTS[f].includes(Number(o.fontWeight)) ? o.fontWeight : FONT_WEIGHTS[f][Math.min(2, FONT_WEIGHTS[f].length - 1)];
            e.set({ fontFamily: FONT_STACK[f], fontWeight: w });
          }}>
            {Object.keys(FONT_STACK).map((f) => <option key={f} value={f}>{FONT_LABEL[f]}</option>)}
          </select>
        </label>
        <label className="ds2-num">
          <span>Wt</span>
          <select value={String(o.fontWeight)} onChange={(ev) => e.set({ fontWeight: Number(ev.target.value) })}>
            {weights.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        </label>
        <Num label="Size" unit="pt" value={(o.fontSize || 0) * (o.scaleY || 1)} min={3} max={2000} onCommit={(v) => e.set({ fontSize: v / (o.scaleY || 1) })} />
        <Num label="Lead" value={o.lineHeight} step={0.05} min={0.7} max={3} onCommit={(v) => e.set({ lineHeight: v })} />
        <Num label="Track" value={o.charSpacing || 0} step={10} min={-200} max={800} onCommit={(v) => e.set({ charSpacing: v })} />
      </div>
      <Row>
        {(['left', 'center', 'right', 'justify'] as const).map((a) => (
          <button key={a} className={`ds2-chip${o.textAlign === a ? ' on' : ''}`} onClick={() => e.set({ textAlign: a })}>{a === 'center' ? 'Centre' : a[0].toUpperCase() + a.slice(1)}</button>
        ))}
        <button className="ds2-chip" title="Make capitals" onClick={() => e.set({ text: String(o.text).toUpperCase() })}>AA</button>
      </Row>
      <h3 style={{ marginTop: 12 }}>Colour</h3>
      <Swatches value={typeof o.fill === 'string' ? o.fill : ''} onPick={(h) => e.setFill(h)} />
      <button className="ds2-btn full" style={{ marginTop: 8 }} disabled={!editingSel} onClick={() => e.accentSelection()} title="Double-click the text, highlight words, then click">
        <Ico n="spark" size={14} className="gold" /> Gold accent on highlighted words
      </button>
      {!editingSel && <p className="ds2-hint">Double-click the text to edit it on the page; highlight a word to make it gold.</p>}
    </section>
  );
}

/* ---------------- button / chip ---------------- */

function ButtonProps({ s, o }: { s: StudioApi; o: any }) {
  const e = s.engine;
  const [label, setLabel] = useState(o.label || '');
  const [prevLabel, setPrevLabel] = useState(o.label || '');
  if ((o.label || '') !== prevLabel) {
    setPrevLabel(o.label || '');
    setLabel(o.label || '');
  }
  return (
    <section className="ds2-sec">
      <h3>{o.role === 'chip' ? 'Chip' : 'Button'}</h3>
      <input className="ds2-input" value={label} onChange={(ev) => setLabel(ev.target.value)} onBlur={() => e.setButton({ label })} onKeyDown={(ev) => { if (ev.key === 'Enter') e.setButton({ label }); }} />
      <div className="ds2-grid2">
        <Num label="Size" unit="pt" value={o.labelSize} min={4} max={600} onCommit={(v) => e.setButton({ labelSize: v, padX: v * (o.role === 'chip' ? 0.8 : 1.3), padY: v * (o.role === 'chip' ? 0.55 : 0.8) })} />
      </div>
      <h3>Button colour</h3>
      <Swatches value={typeof o.fill === 'string' ? o.fill : ''} onPick={(h) => e.set({ fill: h })} allowCustom={false} />
      <h3 style={{ marginTop: 10 }}>Label colour</h3>
      <Swatches value={o.labelFill} onPick={(h) => e.setButton({ labelFill: h })} allowCustom={false} />
    </section>
  );
}

/* ---------------- brand background ---------------- */

function BgProps({ s, o }: { s: StudioApi; o: any }) {
  const e = s.engine;
  const spec = o.brandBg || { base: '#211F18', glow: true, grid: true, dark: true };
  const upd = (p: Partial<typeof spec>) => e.setBrandBg(p);
  return (
    <section className="ds2-sec">
      <h3>Brand background</h3>
      <Swatches value={spec.base} onPick={(h) => e.setFill(h)} allowCustom={false} />
      <Row>
        <button className={`ds2-chip${spec.glow ? ' on' : ''}`} onClick={() => upd({ glow: !spec.glow })}>Gold glow</button>
        <button className={`ds2-chip${spec.grid ? ' on' : ''}`} onClick={() => upd({ grid: !spec.grid })}>Grid</button>
      </Row>
      <button className="ds2-btn full" onClick={() => e.fillBleed()}>Fill to bleed edge</button>
    </section>
  );
}

/* ---------------- shapes ---------------- */

function ShapeProps({ s, o }: { s: StudioApi; o: any }) {
  const e = s.engine;
  const isLine = o.type === 'line';
  return (
    <section className="ds2-sec">
      <h3>{isLine ? 'Line' : 'Fill'}</h3>
      {!isLine && <Swatches value={typeof o.fill === 'string' ? o.fill : ''} onPick={(h) => e.set({ fill: h })} />}
      <h3 style={{ marginTop: 10 }}>{isLine ? 'Colour' : 'Border'}</h3>
      <Swatches value={typeof o.stroke === 'string' ? o.stroke : ''} onPick={(h) => e.set({ stroke: h, strokeWidth: o.strokeWidth || 0.75 })} />
      <div className="ds2-grid2">
        <Num label="Width" unit="pt" value={o.strokeWidth || 0} min={0} max={200} step={0.25} onCommit={(v) => e.set({ strokeWidth: v })} />
        {o.type === 'rect' && <Num label="Radius" unit="mm" value={toMm(o.rx || 0)} min={0} max={500} onCommit={(v) => e.set({ rx: mm(v), ry: mm(v) })} />}
      </div>
      {!isLine && <button className="ds2-link" onClick={() => e.set({ stroke: null, strokeWidth: 0 })}>No border</button>}
    </section>
  );
}

/* ---------------- image ---------------- */

function ImageProps({ s, o }: { s: StudioApi; o: any }) {
  const e = s.engine;
  const m = o.calcTransformMatrix();
  const sc = Math.max(Math.hypot(m[0], m[1]), Math.hypot(m[2], m[3]));
  const ppi = Math.round(72 / sc);
  const target = s.dpi;
  const tone = s.digital ? 'ok' : ppi >= target * 0.8 ? 'ok' : ppi >= target * 0.5 ? 'warn' : 'bad';
  const cropped = o.cropX > 0 || o.cropY > 0 || (o.getElement && o.width < (o.getElement().naturalWidth || o.width) - 1) || (o.getElement && o.height < (o.getElement().naturalHeight || o.height) - 1);
  return (
    <section className="ds2-sec">
      <h3>Photo</h3>
      {!s.digital && <div className={`ds2-dpi ${tone}`}>{ppi} dpi at this size {tone === 'ok' ? '— good for print' : `— aim for ${target}`}</div>}
      {cropped && (
        <>
          <label className="ds2-range">Focus ↔ <input type="range" min={0} max={1} step={0.01} value={o.focalX ?? 0.5} onChange={(ev) => e.setFocal(Number(ev.target.value), o.focalY ?? 0.5)} /></label>
          <label className="ds2-range">Focus ↕ <input type="range" min={0} max={1} step={0.01} value={o.focalY ?? 0.5} onChange={(ev) => e.setFocal(o.focalX ?? 0.5, Number(ev.target.value))} /></label>
        </>
      )}
      <p className="ds2-hint">To swap the photo, keep it selected and click another in <b>Photos</b> — it fills the same box.</p>
    </section>
  );
}

/* ---------------- logo ---------------- */

function LogoProps({ s, o }: { s: StudioApi; o: any }) {
  const e = s.engine;
  const swap = async (id: string) => {
    const def = LOGOS.find((l) => l.id === id)!;
    const b = o.getBoundingRect();
    const idx = e.canvas.getObjects().indexOf(o);
    const n = await e.addSvg(await brandSvg(def.asset), { role: 'logo', name: def.name, widthPt: b.width, logoId: def.id });
    n.set({ left: b.left, top: b.top });
    n.setCoords();
    e.canvas.remove(o);
    e.canvas.moveObjectTo?.(n, idx);
    e.canvas.setActiveObject(n);
    e.canvas.requestRenderAll();
    e.record();
  };
  const wmm = Math.round(e.boxMm(o).w);
  return (
    <section className="ds2-sec">
      <h3>Logo</h3>
      <div className="ds2-seg">
        <button className={o.logoId === 'logo' ? 'on' : ''} onClick={() => void swap('logo')}>On light</button>
        <button className={o.logoId === 'logo-light' ? 'on' : ''} onClick={() => void swap('logo-light')}>On dark</button>
      </div>
      <p className="ds2-hint">{wmm} mm wide{wmm < 25 && !s.digital ? ' — under the suggested 25 mm minimum.' : '.'} The pink halo shows its clear space. Logos can’t be stretched or recoloured.</p>
    </section>
  );
}

/* ---------------- icon ---------------- */

function IconProps({ s, o }: { s: StudioApi; o: any }) {
  const e = s.engine;
  void o;
  const tone = (t: 'ink' | 'paper' | 'gold') =>
    e.setIconTone(t === 'ink' ? brandColour('ink').hex : t === 'paper' ? brandColour('paper').hex : brandColour('solar').hex);
  return (
    <section className="ds2-sec">
      <h3>Icon</h3>
      <div className="ds2-seg">
        <button onClick={() => tone('ink')}>Ink</button>
        <button onClick={() => tone('paper')}>Paper</button>
        <button onClick={() => tone('gold')}>Gold</button>
      </div>
    </section>
  );
}

const round1 = (n: number) => Math.round(n * 10) / 10;
