'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DesignDoc, PageGeometry, TemplateRef, TemplateSummary } from '@/lib/design/types';
import { StudioEngine, uid } from './lib/engine';
import { loadBrandFonts } from './lib/fonts';
import { FORMATS, formatById, geometryFor, matchFormat, type FormatDef } from './lib/formats';
import { brandSvg, iconSvg, type IconTone } from './lib/assets';
import { LOGOS } from './lib/brand';
import { buildStarter } from './lib/starters';
import { readTemplate, renderTemplate, type TemplateInfo } from './lib/template';
import * as api from './lib/api';
import { LeftPanel } from './ui/LeftPanel';
import { Inspector } from './ui/Inspector';
import { Dialogs, type DialogKind, type PendingTemplate } from './ui/Dialogs';
import { Ico } from './ui/icons';

const EMPTY = { version: '6.7.1', objects: [] as unknown[] };

export function makeDoc(formatId: string, geometry?: PageGeometry, label?: string): DesignDoc {
  const fmt = formatById(formatId) ?? FORMATS[0];
  return {
    v: 2,
    formatId: fmt.id,
    formatLabel: label ?? fmt.label,
    geometry: geometry ?? geometryFor(fmt),
    template: null,
    pages: fmt.pages.map((name) => ({ id: uid(), name, json: { ...EMPTY } })),
    output: { cmyk: fmt.group !== 'Digital', cropMarks: false },
  };
}

export type StudioApi = {
  engine: StudioEngine;
  doc: DesignDoc;
  page: number;
  tick: number;
  cloudReady: boolean;
  isAdmin: boolean;
  fmt: FormatDef | undefined;
  digital: boolean;
  toast: (m: string) => void;
  placeFiles: (files: File[]) => Promise<void>;
  addLogo: (id: string) => Promise<void>;
  addIcon: (name: string, tone: IconTone) => Promise<void>;
  addImageUrl: (url: string, assetPath: string | null, name: string) => Promise<void>;
  applyStarter: (id: string) => Promise<void>;
  openDialog: (d: DialogKind) => void;
  importTemplateFile: (file: File) => Promise<void>;
  useLibraryTemplate: (t: TemplateSummary) => Promise<void>;
  setTemplateRef: (patch: Partial<TemplateRef>) => void;
  removeTemplate: () => void;
  setGeometry: (g: PageGeometry) => void;
};

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'local' | 'error';

export function DesignStudio({ cloudReady, isAdmin, projectId }: { cloudReady: boolean; isAdmin: boolean; projectId: string | null }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<StudioEngine | null>(null);
  const fabricRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [tick, setTick] = useState(0);
  const [doc, setDocState] = useState<DesignDoc>(() => makeDoc('a5'));
  const docRef = useRef(doc);
  const setDoc = (d: DesignDoc) => {
    docRef.current = d;
    setDocState(d);
  };
  const [page, setPageState] = useState(0);
  const pageRef = useRef(0);
  const setPage = (i: number) => {
    pageRef.current = i;
    setPageState(i);
  };
  const [project, setProjectState] = useState<{ id: string | null; name: string }>({ id: null, name: 'Untitled design' });
  const projectRef = useRef(project);
  const setProject = (p: { id: string | null; name: string }) => {
    projectRef.current = p;
    setProjectState(p);
  };
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [tplBytes, setTplBytes] = useState<Uint8Array | null>(null);
  const tplBytesRef = useRef<Uint8Array | null>(null);
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [pendingTemplate, setPendingTemplate] = useState<PendingTemplate | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [guides, setGuides] = useState(true);
  const [trimPreview, setTrimPreview] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());
  const loadingRef = useRef(false);

  const toast = useCallback((m: string) => {
    setToastMsg(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 5200);
  }, []);

  const fmt = formatById(doc.formatId);
  const digital = fmt?.group === 'Digital';

  /** Write the live canvas into the current page of the doc. */
  const flushPage = useCallback((): DesignDoc => {
    const eng = engineRef.current;
    const d = docRef.current;
    if (!eng) return d;
    const pages = d.pages.map((p, i) => (i === pageRef.current ? { ...p, json: eng.serialize() } : p));
    const nd = { ...d, pages };
    docRef.current = nd;
    return nd;
  }, []);

  /* ---------------- saving ---------------- */

  const persist = useCallback(
    async (explicit: boolean) => {
      const eng = engineRef.current;
      if (!eng || loadingRef.current) return;
      const d = flushPage();
      setDocState(d);
      const proj = projectRef.current;
      api.writeDraft({ doc: d, name: proj.name, projectId: proj.id, at: Date.now(), page: pageRef.current });
      if (!cloudReady) {
        setSaveState('local');
        if (explicit) toast('Saved on this computer. Run design-studio.sql (setup to-do list) to save designs to the cloud.');
        return;
      }
      const thumb = pageRef.current === 0 ? eng.thumbnail(480) : undefined;
      const run = async () => {
        setSaveState('saving');
        try {
          if (proj.id) {
            await api.saveProject(proj.id, { name: proj.name, doc: d, thumb });
          } else if (explicit || d.pages.some((p) => ((p.json as any).objects?.length ?? 0) > 0)) {
            const r = await api.createProject(proj.name, d, thumb);
            setProject({ id: r.item.id, name: proj.name });
            const url = new URL(window.location.href);
            url.searchParams.set('project', r.item.id);
            window.history.replaceState(null, '', url.toString());
          }
          setSaveState('saved');
          if (explicit) toast('Saved.');
        } catch (e) {
          setSaveState('error');
          toast(e instanceof Error ? e.message : 'Couldn’t save — your work is kept on this computer.');
        }
      };
      // Serialise saves so an older write can never land after a newer one.
      saveChain.current = saveChain.current.then(run, run);
      await saveChain.current;
    },
    [cloudReady, flushPage, toast],
  );

  const markDirty = useCallback(() => {
    if (loadingRef.current) return;
    setSaveState((s) => (s === 'saving' ? s : 'dirty'));
    clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => void persist(false), 1400);
  }, [persist]);

  /* ---------------- open / load ---------------- */

  const loadTemplateLayer = useCallback(
    async (ref: TemplateRef | null | undefined, bytes?: Uint8Array | null) => {
      const eng = engineRef.current!;
      if (!ref) {
        eng.setTemplate(null);
        tplBytesRef.current = null;
        setTplBytes(null);
        return;
      }
      try {
        const b = bytes ?? (await api.fetchBytes(api.fileUrl(ref.path)));
        const img = await renderTemplate(b, ref.page);
        eng.setTemplate({ ref, image: img });
        tplBytesRef.current = b;
        setTplBytes(b);
      } catch {
        eng.setTemplate({ ref, image: null });
        toast('The printer template couldn’t be loaded — the design is fine, but the guide is hidden.');
      }
    },
    [toast],
  );

  const openDoc = useCallback(
    async (d: DesignDoc, name: string, id: string | null, pageIdx = 0) => {
      const eng = engineRef.current!;
      loadingRef.current = true;
      try {
        const p = Math.min(Math.max(0, pageIdx), d.pages.length - 1);
        setDoc(d);
        setProject({ id, name });
        eng.applyGeometry(d.geometry, false);
        await loadTemplateLayer(d.template ?? null);
        await eng.loadJson(d.pages[p].json);
        setPage(p);
        eng.fit();
        setSaveState(id ? 'saved' : 'idle');
      } finally {
        loadingRef.current = false;
      }
    },
    [loadTemplateLayer],
  );

  const openProject = useCallback(
    async (id: string) => {
      try {
        const r = await api.getProject(id);
        await openDoc(r.item.doc, r.item.name, r.item.id, 0);
        const url = new URL(window.location.href);
        url.searchParams.set('project', id);
        window.history.replaceState(null, '', url.toString());
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Couldn’t open that design.');
      }
    },
    [openDoc, toast],
  );

  /* ---------------- init ---------------- */

  useEffect(() => {
    let disposed = false;
    (async () => {
      await loadBrandFonts();
      const fabric = await import('fabric');
      if (disposed || !canvasRef.current || !stageRef.current) return;
      fabricRef.current = fabric;
      const eng = new StudioEngine(fabric, canvasRef.current, stageRef.current, docRef.current.geometry);
      engineRef.current = eng;
      eng.on((ev) => {
        if (ev === 'selection' || ev === 'history' || ev === 'zoom') setTick((t) => t + 1);
        if (ev === 'change' || ev === 'history') markDirty();
      });
      eng.onShortcut = (k) => {
        if (k === 'save') void persist(true);
        else setDialog('export');
      };
      if (projectId) await openProject(projectId);
      else {
        const draft = api.readDraft();
        if (draft?.doc?.v === 2) {
          await openDoc(draft.doc, draft.name, draft.projectId, draft.page);
          toast('Picked up where you left off.');
        } else {
          await openDoc(makeDoc('a5'), 'Untitled design', null);
          setDialog('new');
        }
      }
      if (!disposed) setReady(true);
    })();
    return () => {
      disposed = true;
      clearTimeout(autosaveTimer.current);
      engineRef.current?.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save on tab close / hide.
  useEffect(() => {
    const flush = () => {
      if (!engineRef.current) return;
      const d = flushPage();
      api.writeDraft({ doc: d, name: projectRef.current.name, projectId: projectRef.current.id, at: Date.now(), page: pageRef.current });
    };
    const onHide = () => document.visibilityState === 'hidden' && flush();
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [flushPage]);

  /* ---------------- pages ---------------- */

  const goPage = async (i: number) => {
    const eng = engineRef.current;
    if (!eng || i === pageRef.current) return;
    const d = flushPage();
    setDocState(d);
    loadingRef.current = true;
    try {
      await eng.loadJson(d.pages[i].json);
      setPage(i);
    } finally {
      loadingRef.current = false;
    }
  };
  const addPage = async () => {
    const d = flushPage();
    const nd = { ...d, pages: [...d.pages, { id: uid(), name: `Page ${d.pages.length + 1}`, json: { ...EMPTY } }] };
    setDoc(nd);
    await goPage(nd.pages.length - 1);
    markDirty();
  };
  const removePage = async (i: number) => {
    const d = flushPage();
    if (d.pages.length <= 1 || !window.confirm(`Delete “${d.pages[i].name}”?`)) return;
    const pages = d.pages.filter((_, k) => k !== i);
    const next = Math.min(i, pages.length - 1);
    setDoc({ ...d, pages });
    loadingRef.current = true;
    try {
      await engineRef.current!.loadJson(pages[next].json);
      setPage(next);
    } finally {
      loadingRef.current = false;
    }
    markDirty();
  };
  const duplicatePage = async (i: number) => {
    const d = flushPage();
    const copy = { id: uid(), name: `${d.pages[i].name} copy`, json: JSON.parse(JSON.stringify(d.pages[i].json)) };
    const pages = [...d.pages.slice(0, i + 1), copy, ...d.pages.slice(i + 1)];
    setDoc({ ...d, pages });
    await goPage(i + 1);
    markDirty();
  };

  /* ---------------- content helpers ---------------- */

  const addLogo = async (id: string) => {
    const eng = engineRef.current!;
    const def = LOGOS.find((l) => l.id === id)!;
    try {
      const svg = await brandSvg(def.asset);
      const s = eng.safePt();
      await eng.addSvg(svg, { role: def.role, name: def.name, widthPt: def.role === 'spark' ? Math.min(s.w, s.h) * 0.12 : Math.max(s.w * 0.4, 72), logoId: def.id });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Couldn’t load the logo.');
    }
  };
  const addIcon = async (name: string, tone: IconTone) => {
    const eng = engineRef.current!;
    try {
      const s = eng.safePt();
      await eng.addSvg(await iconSvg(name, tone), { role: 'icon', name: `Icon · ${name}`, widthPt: Math.min(s.w, s.h) * 0.12, iconName: name });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Couldn’t load the icon.');
    }
  };
  const addImageUrl = async (url: string, assetPath: string | null, name: string) => {
    const eng = engineRef.current!;
    const a = eng.active();
    try {
      if (a && (a.role === 'photo-slot' || a.type === 'image')) await eng.fillFrame(a, url, { assetPath: assetPath ?? undefined, name });
      else await eng.addImage(url, { assetPath: assetPath ?? undefined, name });
    } catch {
      toast('That image couldn’t be loaded.');
    }
  };

  /** Upload + place dropped/chosen files. SVGs come in as editable vectors. */
  const placeFiles = async (files: File[]) => {
    const eng = engineRef.current;
    if (!eng) return;
    for (const file of files) {
      if (file.type === 'application/pdf') {
        await importTemplateFile(file);
        continue;
      }
      if (file.type === 'image/svg+xml') {
        try {
          await eng.addSvg(await file.text(), { role: 'graphic', name: file.name.replace(/\.svg$/i, '') });
        } catch {
          toast(`${file.name} isn’t an SVG the studio can read.`);
        }
        continue;
      }
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
        toast(`${file.name}: use JPG, PNG, WebP, SVG — or a PDF template.`);
        continue;
      }
      let url: string;
      let path: string | null = null;
      try {
        path = await api.uploadImage(file);
        url = api.fileUrl(path);
      } catch {
        // Offline / storage unavailable: keep it in the design itself.
        url = await new Promise<string>((res) => {
          const r = new FileReader();
          r.onload = () => res(String(r.result));
          r.readAsDataURL(file);
        });
        toast(`${file.name} couldn’t be uploaded, so it’s stored inside the design (fine for small images).`);
      }
      await addImageUrl(url, path, file.name.replace(/\.[a-z0-9]+$/i, ''));
    }
  };

  const applyStarter = async (id: string) => {
    const eng = engineRef.current!;
    const d = flushPage();
    const hasContent = d.pages.some((p) => ((p.json as any).objects?.length ?? 0) > 0);
    if (hasContent && !window.confirm('Replace every page with this starting layout?')) return;
    loadingRef.current = true;
    try {
      const jsons = await buildStarter(eng, id, d.pages.length);
      const nd = { ...d, pages: d.pages.map((p, i) => ({ ...p, json: jsons[i] ?? { ...EMPTY } })) };
      setDoc(nd);
      await eng.loadJson(nd.pages[0].json);
      setPage(0);
    } finally {
      loadingRef.current = false;
    }
    markDirty();
  };

  /** New design (from the dialog). */
  const startNew = async (formatId: string, starterId: string, custom?: PageGeometry) => {
    const eng = engineRef.current!;
    const f = formatById(formatId);
    const d = makeDoc(formatId, custom, custom ? `Custom · ${custom.trim.w}×${custom.trim.h} mm` : undefined);
    const name = `${(custom ? 'Custom' : f?.label ?? 'Design').split('·')[0].trim()} — ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
    api.clearDraft();
    loadingRef.current = true;
    try {
      setDoc(d);
      setProject({ id: null, name });
      const url = new URL(window.location.href);
      url.searchParams.delete('project');
      window.history.replaceState(null, '', url.toString());
      eng.applyGeometry(d.geometry, false);
      await loadTemplateLayer(null);
      const jsons = await buildStarter(eng, starterId, d.pages.length);
      const nd = { ...d, pages: d.pages.map((p, i) => ({ ...p, json: jsons[i] ?? { ...EMPTY } })) };
      setDoc(nd);
      await eng.loadJson(nd.pages[0].json);
      setPage(0);
      eng.fit();
      setSaveState('idle');
    } finally {
      loadingRef.current = false;
    }
    setDialog(null);
  };

  /* ---------------- templates ---------------- */

  const importTemplateFile = async (file: File) => {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const info: TemplateInfo = await readTemplate(bytes, 1);
      setPendingTemplate({ file, bytes, info, name: file.name.replace(/\.pdf$/i, ''), library: null });
      setDialog('template');
    } catch {
      toast('That PDF couldn’t be read — is it a printer template?');
    }
  };

  const useLibraryTemplate = async (t: TemplateSummary) => {
    try {
      const bytes = await api.fetchBytes(api.fileUrl(t.storage_path));
      const info: TemplateInfo = { title: t.title, pages: 1, geometry: t.geometry, detected: ['From your template library.'], confidence: 'high' };
      setPendingTemplate({ file: null, bytes, info, name: t.name, library: t });
      setDialog('template');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Couldn’t load that template.');
    }
  };

  /** Apply a template (from the Template dialog). */
  const applyTemplate = async (o: {
    pending: PendingTemplate;
    geometry: PageGeometry;
    pageNo: number;
    mode: TemplateRef['mode'];
    opacity: number;
    saveToLibrary: boolean;
    newDesign: boolean;
  }) => {
    const eng = engineRef.current!;
    const { pending } = o;
    let path = pending.library?.storage_path ?? null;
    let libraryId = pending.library?.id ?? null;
    if (!path && pending.file) {
      try {
        path = await api.uploadTemplatePdf(pending.file);
      } catch {
        toast('The template is on your page, but couldn’t be uploaded — it won’t be saved with the design.');
      }
    }
    if (path && o.saveToLibrary && !libraryId && cloudReady) {
      try {
        const r = await api.saveTemplate(path, pending.name, pending.info.title, pending.bytes.length, o.geometry);
        libraryId = r.item.id;
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Couldn’t add it to the template library.');
      }
    }
    const ref: TemplateRef = { path: path ?? '', name: pending.name, title: pending.info.title, libraryId, page: o.pageNo, mode: o.mode, opacity: o.opacity, include: false };
    loadingRef.current = true;
    try {
      let d = o.newDesign ? makeDoc('a5', o.geometry, pending.name) : flushPage();
      if (o.newDesign) {
        d = { ...d, pages: [{ id: uid(), name: 'Artwork', json: { ...EMPTY } }] };
        setProject({ id: null, name: `${pending.name} — ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` });
        api.clearDraft();
        await eng.loadJson(d.pages[0].json);
        setPage(0);
      }
      const known = matchFormat(o.geometry);
      const nd: DesignDoc = { ...d, formatId: known?.id ?? 'template', formatLabel: pending.name, geometry: o.geometry, template: path ? ref : null };
      setDoc(nd);
      eng.applyGeometry(o.geometry);
      await loadTemplateLayer(ref, pending.bytes);
      if (!path) eng.setTemplate({ ref, image: eng.template?.image ?? null });
    } finally {
      loadingRef.current = false;
    }
    setPendingTemplate(null);
    setDialog(null);
    markDirty();
  };

  const setTemplateRef = (patch: Partial<TemplateRef>) => {
    const eng = engineRef.current!;
    const t = eng.template;
    if (!t) return;
    const ref = { ...t.ref, ...patch };
    eng.setTemplate({ ref, image: t.image });
    const d = docRef.current;
    if (d.template) setDoc({ ...d, template: ref });
    setTick((x) => x + 1);
    markDirty();
  };
  const removeTemplate = () => {
    const eng = engineRef.current!;
    eng.setTemplate(null);
    tplBytesRef.current = null;
    setTplBytes(null);
    setDoc({ ...docRef.current, template: null });
    setTick((x) => x + 1);
    markDirty();
  };
  const setGeometry = (g: PageGeometry) => {
    engineRef.current!.applyGeometry(g);
    setDoc({ ...docRef.current, geometry: g });
    markDirty();
  };

  /* ---------------- drag & drop ---------------- */

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) void placeFiles(files);
  };

  const studio: StudioApi | null = useMemo(() => {
    const engine = engineRef.current;
    if (!engine || !ready) return null;
    return {
      engine, doc, page, tick, cloudReady, isAdmin, fmt, digital: !!digital, toast, placeFiles, addLogo, addIcon, addImageUrl,
      applyStarter, openDialog: setDialog, importTemplateFile, useLibraryTemplate, setTemplateRef, removeTemplate, setGeometry,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, doc, page, tick, cloudReady, isAdmin, fmt, digital]);

  const eng = engineRef.current;
  const zoomPct = eng ? Math.round((eng.zoom / (96 / 72)) * 100) : 100;
  const saveLabel: Record<SaveState, string> = {
    idle: cloudReady ? 'Not saved yet' : 'On this computer',
    dirty: 'Unsaved changes',
    saving: 'Saving…',
    saved: 'Saved',
    local: 'Saved on this computer',
    error: 'Save failed — kept locally',
  };

  return (
    // Dark in both themes (a design tool's chrome): an ink island, so the theme tokens inside are the dark ones.
    <div className="ds2 hx-dark" onDragOver={(e) => { e.preventDefault(); if (!dragOver) setDragOver(true); }} onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }} onDrop={onDrop}>
      <header className="ds2-top">
        <button className="ds2-btn ghost" onClick={() => setDialog('projects')} title="Your designs" disabled={!ready}>
          <Ico n="folder" /> <span className="ds2-hide-sm">Designs</span>
        </button>
        <button className="ds2-btn ghost" onClick={() => setDialog('new')} disabled={!ready} title="New design">
          <Ico n="plus" /> <span className="ds2-hide-sm">New</span>
        </button>
        <input
          className="ds2-name"
          value={project.name}
          onChange={(e) => {
            setProject({ ...projectRef.current, name: e.target.value });
            markDirty();
          }}
          aria-label="Design name"
        />
        <span className={`ds2-save is-${saveState}`}>{saveLabel[saveState]}</span>
        <span className="sp" />
        <button className="ds2-icon" onClick={() => eng?.undo()} disabled={!eng?.canUndo()} title="Undo (Ctrl+Z)"><Ico n="undo" /></button>
        <button className="ds2-icon" onClick={() => eng?.redo()} disabled={!eng?.canRedo()} title="Redo (Ctrl+Shift+Z)"><Ico n="redo" /></button>
        <span className="ds2-sep" />
        <button className={`ds2-icon${guides ? ' on' : ''}`} onClick={() => { const v = !guides; setGuides(v); eng?.setGuides(v); }} title="Show bleed, trim and safe guides"><Ico n="guides" /></button>
        <button className={`ds2-icon${trimPreview ? ' on' : ''}`} onClick={() => { const v = !trimPreview; setTrimPreview(v); eng?.setTrimPreview(v); }} title="Preview trimmed (as printed)"><Ico n="scissors" /></button>
        <span className="ds2-sep" />
        <button className="ds2-icon" onClick={() => eng?.zoomBy(0.8)} title="Zoom out (Ctrl+−)"><Ico n="minus" /></button>
        <button className="ds2-zoom" onClick={() => eng?.actualSize()} title="Actual size">{zoomPct}%</button>
        <button className="ds2-icon" onClick={() => eng?.zoomBy(1.25)} title="Zoom in (Ctrl+=)"><Ico n="plus" /></button>
        <button className="ds2-icon" onClick={() => eng?.fit()} title="Fit (Ctrl+0)"><Ico n="fit" /></button>
        <span className="ds2-sep" />
        <button className="ds2-btn" onClick={() => setDialog('checks')} disabled={!ready}><Ico n="check" /> <span className="ds2-hide-sm">Check</span></button>
        <button className="ds2-btn" onClick={() => void persist(true)} disabled={!ready} title="Save (Ctrl+S)"><Ico n="save" /> <span className="ds2-hide-sm">Save</span></button>
        <button className="ds2-btn solar" onClick={() => setDialog('export')} disabled={!ready} title="Export (Ctrl+E)"><Ico n="download" /> Export</button>
      </header>

      <div className="ds2-body">
        {studio ? <LeftPanel s={studio} /> : <aside className="ds2-left ds2-loading" />}
        <main className="ds2-stage" ref={stageRef}>
          {/* The design itself, on its own paper whatever the theme. */}
          <div className="hx-light">
            <canvas ref={canvasRef} />
          </div>
          {!ready && <div className="ds2-boot"><Ico n="spark" size={28} /> Loading the studio and brand fonts…</div>}
          {dragOver && <div className="ds2-drop">Drop photos, SVGs or a printer template PDF</div>}
          {eng?.template?.ref && <div className="ds2-tplbadge" title={eng.template.ref.title ?? ''}><Ico n="template" size={14} /> {eng.template.ref.name} · guide only</div>}
        </main>
        {studio ? <Inspector s={studio} /> : <aside className="ds2-right" />}
      </div>

      <footer className="ds2-pages">
        {doc.pages.map((p, i) => (
          <div key={p.id} className={`ds2-page${i === page ? ' on' : ''}`}>
            <button onClick={() => void goPage(i)} onDoubleClick={() => {
              const n = window.prompt('Page name', p.name);
              if (n) { setDoc({ ...docRef.current, pages: docRef.current.pages.map((x, k) => (k === i ? { ...x, name: n.slice(0, 40) } : x)) }); markDirty(); }
            }} title="Double-click to rename"><Ico n="page" size={14} /> {p.name}</button>
            {i === page && (
              <>
                <button className="ds2-pg-act" onClick={() => void duplicatePage(i)} title="Duplicate page"><Ico n="copy" size={13} /></button>
                {doc.pages.length > 1 && <button className="ds2-pg-act" onClick={() => void removePage(i)} title="Delete page"><Ico n="trash" size={13} /></button>}
              </>
            )}
          </div>
        ))}
        <button className="ds2-page-add" onClick={() => void addPage()} title="Add a page"><Ico n="plus" size={14} /> Page</button>
        <span className="sp" />
        <span className="ds2-meta">
          {doc.formatLabel} · {round1(doc.geometry.trim.w)}×{round1(doc.geometry.trim.h)} mm
          {doc.geometry.trim.x > 0 ? ` · ${round1(doc.geometry.trim.x)} mm bleed` : ''}
          {doc.geometry.note ? ` · ${doc.geometry.note}` : ''}
        </span>
      </footer>

      {toastMsg && <div className="ds2-toast" role="status">{toastMsg}</div>}

      {studio && (
        <Dialogs
          s={studio}
          kind={dialog}
          close={() => { setDialog(null); setPendingTemplate(null); }}
          project={project}
          fabric={fabricRef.current}
          flushPage={flushPage}
          templateBytes={tplBytes}
          startNew={startNew}
          openProject={async (id) => { setDialog(null); await openProject(id); }}
          pendingTemplate={pendingTemplate}
          applyTemplate={applyTemplate}
          currentProjectId={project.id}
          onProjectDeleted={(id) => { if (projectRef.current.id === id) setProject({ id: null, name: projectRef.current.name }); }}
        />
      )}
    </div>
  );
}

const round1 = (n: number) => Math.round(n * 10) / 10;
