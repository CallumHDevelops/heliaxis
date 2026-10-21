'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { DesignDoc, PageGeometry, ProjectSummary, TemplateRef, TemplateSummary } from '@/lib/design/types';
import type { StudioApi } from '../DesignStudio';
import { FORMATS, FORMAT_GROUPS, customGeometry, formatById } from '../lib/formats';
import { startersFor } from '../lib/starters';
import { BRAND_COLOURS, hexToCmyk, type CMYK } from '../lib/brand';
import { exportPdf, exportRaster } from '../lib/export';
import { runPreflight, type Issue } from '../lib/preflight';
import { renderTemplate, type TemplateInfo } from '../lib/template';
import * as api from '../lib/api';
import { Ico } from './icons';

export type DialogKind = 'new' | 'template' | 'export' | 'projects' | 'checks' | 'print';
export type PendingTemplate = { file: File | null; bytes: Uint8Array; info: TemplateInfo; name: string; library: TemplateSummary | null };

type Props = {
  s: StudioApi;
  kind: DialogKind | null;
  close: () => void;
  project: { id: string | null; name: string };
  fabric: any;
  flushPage: () => DesignDoc;
  templateBytes: Uint8Array | null;
  startNew: (formatId: string, starterId: string, custom?: PageGeometry) => Promise<void>;
  openProject: (id: string) => Promise<void>;
  pendingTemplate: PendingTemplate | null;
  applyTemplate: (o: { pending: PendingTemplate; geometry: PageGeometry; pageNo: number; mode: TemplateRef['mode']; opacity: number; saveToLibrary: boolean; newDesign: boolean }) => Promise<void>;
  currentProjectId: string | null;
  onProjectDeleted: (id: string) => void;
};

export function Dialogs(p: Props) {
  const [printOpen, setPrintOpen] = useState(false);
  if (!p.kind && !printOpen) return null;
  return (
    <>
      {p.kind === 'new' && <NewDesign {...p} />}
      {p.kind === 'template' && p.pendingTemplate && <TemplateSetup {...p} pending={p.pendingTemplate} />}
      {p.kind === 'export' && <ExportDialog {...p} openPrint={() => setPrintOpen(true)} />}
      {p.kind === 'projects' && <Projects {...p} />}
      {p.kind === 'checks' && <Checks {...p} />}
      {printOpen && <PrintColours s={p.s} close={() => setPrintOpen(false)} />}
    </>
  );
}

function Modal({ title, close, children, wide, footer }: { title: string; close: () => void; children: React.ReactNode; wide?: boolean; footer?: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [close]);
  return (
    <div className="ds2-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className={`ds2-modal-box${wide ? ' wide' : ''}`}>
        <div className="ds2-modal-h">
          <h2>{title}</h2>
          <button className="ds2-icon" onClick={close} aria-label="Close"><Ico n="close" /></button>
        </div>
        <div className="ds2-modal-b">{children}</div>
        {footer && <div className="ds2-modal-f">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------------- new design ---------------- */

function NewDesign({ s, close, startNew }: Props) {
  const [fid, setFid] = useState(s.doc.formatId === 'template' || s.doc.formatId === 'custom' ? 'a5' : s.doc.formatId);
  const [starter, setStarter] = useState('');
  const [custom, setCustom] = useState({ w: 210, h: 99, bleed: 3, safe: 5 });
  const [busy, setBusy] = useState(false);
  const tplRef = useRef<HTMLInputElement>(null);
  const isCustom = fid === 'custom';
  const f = formatById(fid);
  const starters = startersFor(fid, f?.group === 'Digital');
  useEffect(() => {
    setStarter(starters.find((x) => x.id !== 'blank')?.id ?? 'blank');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fid]);
  const go = async () => {
    setBusy(true);
    try {
      await startNew(isCustom ? 'a5' : fid, starter, isCustom ? customGeometry(custom.w, custom.h, custom.bleed, custom.safe) : undefined);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="New design" close={close} wide footer={
      <>
        <button className="ds2-btn ghost" onClick={() => tplRef.current?.click()}><Ico n="template" /> Start from a printer template…</button>
        <input ref={tplRef} type="file" accept="application/pdf" hidden onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void s.importTemplateFile(file); }} />
        <span className="sp" />
        <button className="ds2-btn" onClick={close}>Cancel</button>
        <button className="ds2-btn solar" disabled={busy} onClick={() => void go()}>{busy ? 'Setting up…' : 'Create design'}</button>
      </>
    }>
      <div className="ds2-new">
        <div className="ds2-formats">
          {FORMAT_GROUPS.map((g) => (
            <div key={g} className="ds2-fgroup">
              <h4>{g}</h4>
              <div className="ds2-fgrid">
                {FORMATS.filter((x) => x.group === g).map((x) => (
                  <button key={x.id} className={`ds2-fmt${fid === x.id ? ' on' : ''}`} onClick={() => setFid(x.id)}>
                    <span className="ds2-fmt-shape" style={{ aspectRatio: `${x.trimW} / ${x.trimH}` }} />
                    <span>{x.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="ds2-fgroup">
            <h4>Custom</h4>
            <button className={`ds2-fmt wide${isCustom ? ' on' : ''}`} onClick={() => setFid('custom')}><span>Custom size…</span></button>
            {isCustom && (
              <div className="ds2-grid4">
                {(['w', 'h', 'bleed', 'safe'] as const).map((k) => (
                  <label key={k} className="ds2-num">
                    <span>{k === 'w' ? 'Width' : k === 'h' ? 'Height' : k === 'bleed' ? 'Bleed' : 'Safe'}</span>
                    <input inputMode="decimal" value={custom[k]} onChange={(e) => setCustom({ ...custom, [k]: Number(e.target.value) || 0 })} />
                    <em>mm</em>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="ds2-starters">
          <h4>Start with</h4>
          {starters.map((st) => (
            <button key={st.id} className={`ds2-item${starter === st.id ? ' on' : ''}`} onClick={() => setStarter(st.id)}>
              <Ico n={st.id === 'blank' ? 'page' : 'spark'} size={14} className="gold" />
              <span><b>{st.name}</b><small>{st.hint}</small></span>
            </button>
          ))}
          {f?.note && <p className="ds2-note">{f.note}</p>}
          {f && <p className="ds2-hint">{f.pages.join(' + ')} · {f.bleed} mm bleed · {f.safe} mm safe area</p>}
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- template setup ---------------- */

function TemplateSetup({ s, close, pending, applyTemplate }: Props & { pending: PendingTemplate }) {
  const g0 = pending.info.geometry;
  const [name, setName] = useState(pending.name);
  const [bleed, setBleed] = useState(round2(g0.trim.x));
  const [safe, setSafe] = useState(round2(g0.safe));
  const [pageNo, setPageNo] = useState(1);
  const [mode, setMode] = useState<TemplateRef['mode']>('over');
  const [opacity, setOpacity] = useState(0.85);
  const [saveLib, setSaveLib] = useState(!pending.library && s.cloudReady);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    renderTemplate(pending.bytes, pageNo, 900).then((cv) => live && setPreview(cv.toDataURL('image/png'))).catch(() => setPreview(null));
    return () => { live = false; };
  }, [pending.bytes, pageNo]);

  const geometry: PageGeometry = useMemo(() => {
    const trimSet = pending.info.confidence === 'high' && (g0.trim.x > 0 || g0.trim.y > 0);
    if (trimSet && Math.abs(bleed - g0.trim.x) < 0.01) return { ...g0, safe };
    // zones are measured from the trim, so they move with it
    const dx = bleed - g0.trim.x, dy = bleed - g0.trim.y;
    const zones = g0.zones?.map((z) => ({ ...z, box: { ...z.box, x: z.box.x + dx, y: z.box.y + dy } }));
    return { ...g0, trim: { x: bleed, y: bleed, w: round2(g0.mediaW - 2 * bleed), h: round2(g0.mediaH - 2 * bleed) }, safe, zones };
  }, [g0, bleed, safe, pending.info.confidence]);

  const go = async (newDesign: boolean) => {
    setBusy(true);
    try {
      await applyTemplate({ pending: { ...pending, name: name.trim() || pending.name }, geometry, pageNo, mode, opacity, saveToLibrary: saveLib, newDesign });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Printer template" close={close} wide footer={
      <>
        <span className="sp" />
        <button className="ds2-btn" onClick={close}>Cancel</button>
        <button className="ds2-btn" disabled={busy} onClick={() => void go(false)}>Use on this design</button>
        <button className="ds2-btn solar" disabled={busy} onClick={() => void go(true)}>{busy ? 'Setting up…' : 'New design on this template'}</button>
      </>
    }>
      <div className="ds2-tpl">
        <div className="ds2-tpl-prev">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {preview ? <img src={preview} alt="Template preview" /> : <div className="ds2-dim">Rendering…</div>}
        </div>
        <div className="ds2-tpl-form">
          <label className="ds2-field"><span>Name</span><input className="ds2-input" value={name} onChange={(e) => setName(e.target.value)} /></label>
          {pending.info.title && <p className="ds2-dim">PDF title: {pending.info.title}</p>}
          <div className={`ds2-detect ${pending.info.confidence}`}>
            <b>{pending.info.confidence === 'high' ? 'Detected from the template' : pending.info.confidence === 'medium' ? 'Partly detected — check the numbers' : 'Couldn’t detect the trim — please check'}</b>
            <ul>{pending.info.detected.map((d) => <li key={d}>{d}</li>)}</ul>
          </div>
          <div className="ds2-grid2">
            <label className="ds2-num"><span>Bleed</span><input inputMode="decimal" value={bleed} onChange={(e) => setBleed(Number(e.target.value) || 0)} /><em>mm</em></label>
            <label className="ds2-num"><span>Safe</span><input inputMode="decimal" value={safe} onChange={(e) => setSafe(Number(e.target.value) || 0)} /><em>mm</em></label>
          </div>
          <p className="ds2-hint">Sheet {round2(geometry.mediaW)} × {round2(geometry.mediaH)} mm → finished {round2(geometry.trim.w)} × {round2(geometry.trim.h)} mm. Your PDF will be exactly this size.</p>
          {pending.info.pages > 1 && (
            <label className="ds2-num wide"><span>Page</span>
              <select value={pageNo} onChange={(e) => setPageNo(Number(e.target.value))}>
                {Array.from({ length: pending.info.pages }, (_, i) => <option key={i} value={i + 1}>Page {i + 1}</option>)}
              </select>
            </label>
          )}
          <h3>Show the template</h3>
          <div className="ds2-seg">
            <button className={mode === 'over' ? 'on' : ''} onClick={() => setMode('over')}>On top (die-lines)</button>
            <button className={mode === 'under' ? 'on' : ''} onClick={() => setMode('under')}>Behind (guide sheet)</button>
          </div>
          <label className="ds2-range">Opacity <input type="range" min={0.1} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} /></label>
          {!pending.library && (
            <label className="ds2-check"><input type="checkbox" checked={saveLib} disabled={!s.cloudReady} onChange={(e) => setSaveLib(e.target.checked)} /> Save to the template library{!s.cloudReady ? ' (needs design-studio.sql)' : ''}</label>
          )}
          <p className="ds2-hint">The template is a guide only — it’s left out of your export unless you choose otherwise.</p>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- export ---------------- */

type PrintSettings = { colours: Record<string, CMYK>; richBlack: CMYK | null };
const DEFAULT_RICH: CMYK = [40, 40, 50, 100];

function ExportDialog({ s, close, project, fabric, flushPage, templateBytes, openPrint }: Props & { openPrint: () => void }) {
  const digital = s.digital;
  const [kind, setKind] = useState<'pdf' | 'png' | 'jpeg'>(digital ? 'png' : 'pdf');
  const [cmyk, setCmyk] = useState(s.doc.output?.cmyk ?? !digital);
  const [marks, setMarks] = useState(s.doc.output?.cropMarks ?? false);
  const [rich, setRich] = useState(true);
  const [blackText, setBlackText] = useState(true);
  const [incTpl, setIncTpl] = useState(false);
  const [dpi, setDpi] = useState(150);
  const [all, setAll] = useState(true);
  const [busy, setBusy] = useState(false);
  const [warnings, setWarnings] = useState<string[] | null>(null);
  const [settings, setSettings] = useState<PrintSettings>({ colours: {}, richBlack: null });
  const issues = useMemo(() => runPreflight(s.engine, { targetDpi: s.fmt?.dpi ?? 300, digital }), [s.engine, s.fmt, digital]);
  const errs = issues.filter((i) => i.level === 'error').length;
  const warns = issues.filter((i) => i.level === 'warn').length;
  useEffect(() => {
    fetch('/api/design/settings', { credentials: 'same-origin' }).then((r) => r.json()).then((d) => d?.settings && setSettings(d.settings)).catch(() => undefined);
  }, []);

  const file = (ext: string, suffix = '') => `${(project.name || 'heliaxis-design').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase()}${suffix}.${ext}`;
  const download = (href: string, name: string) => {
    const a = document.createElement('a');
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const run = async () => {
    setBusy(true);
    setWarnings(null);
    try {
      const d = flushPage();
      if (kind === 'pdf') {
        const res = await exportPdf(fabric, d, d.pages.map((pg) => pg.json), {
          cmyk, cropMarks: marks, richBlack: rich, richBlackCmyk: settings.richBlack ?? DEFAULT_RICH, blackText,
          printColours: settings.colours, includeTemplate: incTpl, templateBytes, title: project.name, rasterDpi: Math.max(300, s.fmt?.dpi ?? 300),
        });
        const url = URL.createObjectURL(new Blob([res.bytes as any], { type: 'application/pdf' }));
        download(url, file('pdf'));
        setTimeout(() => URL.revokeObjectURL(url), 8000);
        setWarnings(res.warnings);
      } else {
        const pages = all ? d.pages.map((_, i) => i) : [s.page];
        for (const i of pages) {
          const url = await exportRaster(fabric, d, d.pages[i].json, { format: kind, dpi, px: s.fmt?.px ?? null });
          download(url, file(kind === 'jpeg' ? 'jpg' : 'png', pages.length > 1 ? `-${d.pages[i].name.toLowerCase().replace(/\s+/g, '-')}` : ''));
        }
        setWarnings([]);
      }
    } catch (e) {
      setWarnings([`Export failed: ${e instanceof Error ? e.message : String(e)}`]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Export" close={close} footer={
      <>
        <span className="sp" />
        <button className="ds2-btn" onClick={close}>Close</button>
        <button className="ds2-btn solar" disabled={busy} onClick={() => void run()}><Ico n="download" /> {busy ? 'Building…' : kind === 'pdf' ? 'Download print PDF' : `Download ${kind === 'png' ? 'PNG' : 'JPG'}`}</button>
      </>
    }>
      <div className={`ds2-preflight-sum ${errs ? 'bad' : warns ? 'warn' : 'ok'}`}>
        <Ico n={errs || warns ? 'warn' : 'check'} />
        <span>{errs ? `${errs} problem${errs > 1 ? 's' : ''}` : warns ? `${warns} thing${warns > 1 ? 's' : ''} to check` : 'Checks passed'} on this page.</span>
        {(errs > 0 || warns > 0) && <button className="ds2-link" onClick={() => s.openDialog('checks')}>Review</button>}
      </div>
      <div className="ds2-seg" style={{ margin: '12px 0' }}>
        <button className={kind === 'pdf' ? 'on' : ''} onClick={() => setKind('pdf')}>Print PDF</button>
        <button className={kind === 'png' ? 'on' : ''} onClick={() => setKind('png')}>PNG</button>
        <button className={kind === 'jpeg' ? 'on' : ''} onClick={() => setKind('jpeg')}>JPG</button>
      </div>
      {kind === 'pdf' ? (
        <div className="ds2-opts">
          <label className="ds2-check"><input type="checkbox" checked={cmyk} onChange={(e) => setCmyk(e.target.checked)} /> <span><b>CMYK colours</b><small>Brand colours as print inks{Object.keys(settings.colours).length ? ' (your print colours)' : ' (calculated — set official values in Print colours)'}.</small></span></label>
          <label className="ds2-check"><input type="checkbox" checked={rich} disabled={!cmyk} onChange={(e) => setRich(e.target.checked)} /> <span><b>Rich black for large dark areas</b><small>Big Ink backgrounds print deep, not grey ({(settings.richBlack ?? DEFAULT_RICH).join('/')}).</small></span></label>
          <label className="ds2-check"><input type="checkbox" checked={blackText} disabled={!cmyk} onChange={(e) => setBlackText(e.target.checked)} /> <span><b>Small dark text in 100% black</b><small>Under 12 pt, overprinted — no colour fringing.</small></span></label>
          <label className="ds2-check"><input type="checkbox" checked={marks} onChange={(e) => setMarks(e.target.checked)} /> <span><b>Crop marks</b><small>Most online printers want bleed only — tick if yours asks for marks.</small></span></label>
          {s.engine.template && <label className="ds2-check"><input type="checkbox" checked={incTpl} disabled={!templateBytes} onChange={(e) => setIncTpl(e.target.checked)} /> <span><b>Include the printer template</b><small>Usually NOT wanted — templates are guides (“This template is a guide only”).</small></span></label>}
          <p className="ds2-hint">Text is converted to outlines, shapes stay vector, photos keep their full resolution. The PDF has correct trim and bleed boxes.</p>
          <button className="ds2-link" onClick={openPrint}>Print colours (CMYK) →</button>
        </div>
      ) : (
        <div className="ds2-opts">
          {s.fmt?.px ? <p className="ds2-hint">Exports at exactly {s.fmt.px.w} × {s.fmt.px.h} px.</p> : (
            <label className="ds2-num wide"><span>Resolution</span>
              <select value={dpi} onChange={(e) => setDpi(Number(e.target.value))}>
                <option value={72}>72 dpi (screen)</option><option value={150}>150 dpi (proof)</option><option value={300}>300 dpi (print)</option>
              </select>
            </label>
          )}
          {s.doc.pages.length > 1 && <label className="ds2-check"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Every page ({s.doc.pages.length} files)</label>}
        </div>
      )}
      {warnings && (
        <div className="ds2-warnings">
          {warnings.length ? (
            <>
              <b>Exported, with notes:</b>
              <ul>{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </>
          ) : <b className="ok"><Ico n="check" size={14} /> Downloaded.</b>}
        </div>
      )}
    </Modal>
  );
}

/* ---------------- print colours ---------------- */

function PrintColours({ s, close }: { s: StudioApi; close: () => void }) {
  const [set, setSet] = useState<PrintSettings | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch('/api/design/settings', { credentials: 'same-origin' }).then((r) => r.json()).then((d) => setSet(d?.settings ?? { colours: {}, richBlack: null })).catch(() => setSet({ colours: {}, richBlack: null }));
  }, []);
  const val = (id: string, hex: string): CMYK => set?.colours[id] ?? hexToCmyk(hex);
  const upd = (id: string, i: number, v: number) => {
    if (!set) return;
    const cur = [...val(id, BRAND_COLOURS.find((c) => c.id === id)!.hex)] as CMYK;
    cur[i] = Math.max(0, Math.min(100, Math.round(v)));
    setSet({ ...set, colours: { ...set.colours, [id]: cur } });
  };
  const save = async () => {
    if (!set) return;
    setBusy(true);
    try {
      const r = await fetch('/api/design/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(set) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Couldn’t save');
      s.toast('Print colours saved for everyone.');
      close();
    } catch (e) {
      s.toast(e instanceof Error ? e.message : 'Couldn’t save');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Print colours (CMYK)" close={close} footer={<><span className="sp" /><button className="ds2-btn" onClick={close}>Close</button>{s.isAdmin && <button className="ds2-btn solar" disabled={busy} onClick={() => void save()}>Save for everyone</button>}</>}>
      <p className="ds2-hint">The brand guidelines only give screen colours, so these start as a calculated conversion. Ask your printer or brand designer for the official CMYK (or Pantone equivalents) and enter them here{s.isAdmin ? '' : ' — an admin can save them'}.</p>
      {!set ? <p className="ds2-hint">Loading…</p> : (
        <table className="ds2-cmyk">
          <thead><tr><th /><th>Colour</th><th>C</th><th>M</th><th>Y</th><th>K</th></tr></thead>
          <tbody>
            {BRAND_COLOURS.filter((c) => !c.statusOnly && c.id !== 'white').map((c) => (
              <tr key={c.id}>
                <td><i style={{ background: c.hex }} /></td>
                <td>{c.name}<small>{c.hex}{set.colours[c.id] ? '' : ' · calculated'}</small></td>
                {val(c.id, c.hex).map((v, i) => (
                  <td key={i}><input inputMode="numeric" disabled={!s.isAdmin} value={v} onChange={(e) => upd(c.id, i, Number(e.target.value))} /></td>
                ))}
              </tr>
            ))}
            <tr>
              <td><i style={{ background: '#111' }} /></td>
              <td>Rich black<small>large Ink areas</small></td>
              {(set.richBlack ?? DEFAULT_RICH).map((v, i) => (
                <td key={i}><input inputMode="numeric" disabled={!s.isAdmin} value={v} onChange={(e) => {
                  const cur = [...(set.richBlack ?? DEFAULT_RICH)] as CMYK;
                  cur[i] = Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0)));
                  setSet({ ...set, richBlack: cur });
                }} /></td>
              ))}
            </tr>
          </tbody>
        </table>
      )}
    </Modal>
  );
}

/* ---------------- projects ---------------- */

function Projects({ s, close, openProject, currentProjectId, onProjectDeleted }: Props) {
  const [data, setData] = useState<{ ready: boolean; items: ProjectSummary[] } | null>(null);
  const load = () => api.listProjects().then(setData).catch(() => setData({ ready: false, items: [] }));
  useEffect(() => {
    void load();
  }, []);
  return (
    <Modal title="Your designs" close={close} wide>
      {!data ? <p className="ds2-hint">Loading…</p> : !data.ready ? (
        <div className="ds2-empty">
          <Ico n="info" size={22} />
          <p>Saving designs to the cloud needs <b>design-studio.sql</b> — it’s on your <Link href="/admin/setup">setup to-do list</Link>. Until then your current design is kept on this computer.</p>
        </div>
      ) : !data.items.length ? (
        <p className="ds2-hint">No saved designs yet — press Save on a design and it appears here.</p>
      ) : (
        <div className="ds2-projects">
          {data.items.map((p) => (
            <div key={p.id} className={`ds2-proj${p.id === currentProjectId ? ' on' : ''}`}>
              <button className="ds2-proj-thumb" onClick={() => void openProject(p.id)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.thumb_url ? <img src={p.thumb_url} alt="" /> : <Ico n="page" size={28} />}
              </button>
              <div className="ds2-proj-meta">
                <b title={p.name}>{p.name}</b>
                <small>{formatById(p.format_id)?.label ?? (p.format_id === 'template' ? 'Printer template' : 'Custom')} · {new Date(p.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small>
              </div>
              <div className="ds2-row tight">
                <button className="ds2-icon sm" title="Duplicate" onClick={async () => {
                  try { const r = await api.getProject(p.id); await api.createProject(`${r.item.name} copy`, r.item.doc); void load(); } catch (e) { s.toast(e instanceof Error ? e.message : 'Couldn’t duplicate.'); }
                }}><Ico n="copy" size={14} /></button>
                <button className="ds2-icon sm" title="Delete" onClick={async () => {
                  if (!window.confirm(`Delete “${p.name}”?`)) return;
                  try { await api.deleteProject(p.id); onProjectDeleted(p.id); void load(); } catch (e) { s.toast(e instanceof Error ? e.message : 'Couldn’t delete.'); }
                }}><Ico n="trash" size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

/* ---------------- checks ---------------- */

function Checks({ s, close }: Props) {
  const [issues, setIssues] = useState<Issue[]>(() => runPreflight(s.engine, { targetDpi: s.fmt?.dpi ?? 300, digital: s.digital }));
  const select = (id?: string) => {
    if (!id) return;
    const o = s.engine.objects().find((x: any) => x.id === id);
    if (!o) return;
    s.engine.canvas.setActiveObject(o);
    s.engine.canvas.requestRenderAll();
    s.engine.emit('selection');
    close();
  };
  const groups: [Issue['level'], string][] = [['error', 'Fix before printing'], ['warn', 'Worth checking'], ['info', 'Notes']];
  return (
    <Modal title={`${s.digital ? 'Brand check' : 'Brand & print check'} · ${s.doc.pages[s.page]?.name ?? 'Page'}`} close={close} footer={<><button className="ds2-btn" onClick={() => setIssues(runPreflight(s.engine, { targetDpi: s.fmt?.dpi ?? 300, digital: s.digital }))}>Re-check</button><span className="sp" /><button className="ds2-btn solar" onClick={close}>Done</button></>}>
      {groups.map(([lvl, title]) => {
        const list = issues.filter((i) => i.level === lvl);
        if (!list.length) return null;
        return (
          <div key={lvl} className={`ds2-issues ${lvl}`}>
            <h3>{title}</h3>
            {list.map((i, k) => (
              <button key={k} className="ds2-issue" onClick={() => select(i.objectId)} disabled={!i.objectId}>
                <Ico n={lvl === 'info' ? 'info' : 'warn'} size={15} />
                <span>{i.message}</span>
                <em>{i.kind}</em>
              </button>
            ))}
          </div>
        );
      })}
    </Modal>
  );
}

const round2 = (n: number) => Math.round(n * 100) / 100;
