'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DesignDoc, PageGeometry, TemplateRef, TemplateSummary } from '@/lib/design/types';
import { StudioEngine, mm, uid, type TemplateLayer } from './lib/engine';
import { loadBrandFonts } from './lib/fonts';
import { FORMATS, formatById, geometryFor, matchFormat, targetDpi, type FormatDef } from './lib/formats';
import { brandSvg, iconSvg, type IconTone } from './lib/assets';
import { LOGOS } from './lib/brand';
import { buildStarter } from './lib/starters';
import { TemplateError, readTemplate, renderTemplate, type TemplateInfo } from './lib/template';
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

/** The open design's id in the address, so a reload or a bookmark reopens it. */
function setUrlProject(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('project', id);
  else url.searchParams.delete('project');
  window.history.replaceState(null, '', url.toString());
}

const hasContent = (d: DesignDoc) => d.pages.some((p) => ((p.json as any).objects?.length ?? 0) > 0);
const today = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export type StudioApi = {
  engine: StudioEngine;
  doc: DesignDoc;
  page: number;
  tick: number;
  cloudReady: boolean;
  isAdmin: boolean;
  fmt: FormatDef | undefined;
  digital: boolean;
  /** Photo resolution to aim for on this design (dpi at the placed size). */
  dpi: number;
  /** Bumped when the template library changes (a template was saved to it). */
  libTick: number;
  toast: (m: string, action?: ToastAction) => void;
  placeFiles: (files: File[]) => Promise<void>;
  addLogo: (id: string) => Promise<void>;
  addIcon: (name: string, tone: IconTone) => Promise<void>;
  addImageUrl: (url: string, assetPath: string | null, name: string) => Promise<void>;
  applyStarter: (id: string) => Promise<void>;
  openDialog: (d: DialogKind) => void;
  importTemplateFile: (file: File) => Promise<void>;
  useLibraryTemplate: (t: TemplateSummary) => Promise<void>;
  setTemplateRef: (patch: Partial<TemplateRef>) => void;
  /** Hide the printer template, or show it again the way it was (on top / behind). */
  toggleTemplate: () => void;
  removeTemplate: () => void;
  setGeometry: (g: PageGeometry) => void;
};

export type ToastAction = { label: string; run: () => void | Promise<void> };
type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'local' | 'error' | 'conflict';

const CONFLICT_MSG = 'This design was saved on another computer since you opened it, so your changes weren’t saved over it. They’re kept here — save them as a copy, or open Designs for the latest.';

export function DesignStudio({ cloudReady, isAdmin, projectId, userId }: { cloudReady: boolean; isAdmin: boolean; projectId: string | null; userId: string | null }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<StudioEngine | null>(null);
  const fabricRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [tick, setTick] = useState(0);
  const [libTick, setLibTick] = useState(0);
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
  /** The cloud updated_at the open copy builds on: sent with every save, so a stale copy can't overwrite newer work. */
  const baseRef = useRef<string | null>(null);
  /** The canvas has changes the cloud copy doesn't have (yet). Written into the local draft. */
  const unsavedRef = useRef(false);
  const editSeq = useRef(0);
  const saveFailedRef = useRef(false);
  /** Saved elsewhere since this copy was opened: cloud saves stop until it's kept as a copy or reopened. */
  const conflictRef = useRef(false);
  const [tplBytes, setTplBytes] = useState<Uint8Array | null>(null);
  const tplBytesRef = useRef<Uint8Array | null>(null);
  /** How the template was shown before it was hidden (the Layers eye brings that back). */
  const tplShownMode = useRef<'over' | 'under'>('under');
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [pendingTemplate, setPendingTemplate] = useState<PendingTemplate | null>(null);
  const [toastMsg, setToastMsg] = useState<{ m: string; action?: ToastAction } | null>(null);
  const [guides, setGuides] = useState(true);
  const [trimPreview, setTrimPreview] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());
  const loadingRef = useRef(false);
  /** Bumped whenever another design is opened or started: a save still in flight then leaves this one alone. */
  const genRef = useRef(0);

  const toast = useCallback((m: string, action?: ToastAction) => {
    setToastMsg({ m, action });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), action ? 10000 : 5200);
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

  const draftNow = useCallback(
    (d: DesignDoc): api.LocalDraft => ({
      doc: d,
      name: projectRef.current.name,
      projectId: projectRef.current.id,
      at: Date.now(),
      page: pageRef.current,
      base: baseRef.current,
      unsaved: unsavedRef.current,
    }),
    [],
  );

  /* ---------------- saving ---------------- */

  /** A brand-new cloud design from what's on screen (a conflict's copy, or a design deleted elsewhere). */
  const saveAsNew = useCallback(
    async (name: string, d: DesignDoc, thumb?: string) => {
      const r = await api.createProject(name, d, thumb);
      conflictRef.current = false;
      baseRef.current = r.item.updated_at;
      setProject({ id: r.item.id, name });
      setUrlProject(r.item.id);
      unsavedRef.current = false;
      saveFailedRef.current = false;
      api.writeDraft(draftNow(d));
      setSaveState('saved');
    },
    [draftNow],
  );

  const keepMineAsCopy = useCallback(async () => {
    const d = flushPage();
    const name = `${projectRef.current.name} (my copy)`.slice(0, 140);
    try {
      await saveAsNew(name, d, engineRef.current?.thumbnail(480));
      toast(`Saved as a new design, “${name}”. The other computer’s version is still in Designs.`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Couldn’t save a copy — your changes are still kept on this computer.');
    }
  }, [flushPage, saveAsNew, toast]);

  const persist = useCallback(
    async (explicit: boolean) => {
      const eng = engineRef.current;
      if (!eng || loadingRef.current) return;
      clearTimeout(autosaveTimer.current);
      const d = flushPage();
      setDocState(d);
      const seq = editSeq.current;
      api.writeDraft(draftNow(d));
      if (!cloudReady) {
        setSaveState('local');
        if (explicit) toast('Saved on this computer. Run design-studio.sql (setup to-do list) to save designs to the cloud.');
        return;
      }
      if (conflictRef.current) {
        setSaveState('conflict');
        if (explicit) toast(CONFLICT_MSG, { label: 'Save mine as a copy', run: keepMineAsCopy });
        return;
      }
      const thumb = pageRef.current === 0 ? eng.thumbnail(480) : undefined;
      const gen = genRef.current;
      const run = async () => {
        if (gen !== genRef.current) return; // another design is open now (it was saved before the switch)
        const proj = projectRef.current;
        if (!proj.id && !explicit && !hasContent(d)) {
          setSaveState('idle');
          return;
        }
        setSaveState('saving');
        try {
          if (proj.id) {
            const r = await api.saveProject(proj.id, { name: proj.name, doc: d, thumb, base: baseRef.current });
            if (gen !== genRef.current) return;
            baseRef.current = r.item.updated_at;
          } else {
            const r = await api.createProject(proj.name, d, thumb);
            if (gen !== genRef.current) return;
            baseRef.current = r.item.updated_at;
            setProject({ id: r.item.id, name: projectRef.current.name });
            setUrlProject(r.item.id);
          }
          if (editSeq.current === seq) unsavedRef.current = false;
          saveFailedRef.current = false;
          // The draft: carry the new id and base. Its doc may already hold newer edits, so keep that.
          const cur = api.readDraft();
          if (cur && (cur.projectId === proj.id || cur.projectId === null)) {
            api.writeDraft({ ...cur, projectId: projectRef.current.id, base: baseRef.current, unsaved: unsavedRef.current });
          }
          setSaveState(unsavedRef.current ? 'dirty' : 'saved');
          if (explicit) toast('Saved.');
        } catch (e) {
          if (gen !== genRef.current) return;
          if (e instanceof api.ApiError && e.conflict) {
            conflictRef.current = true;
            setSaveState('conflict');
            toast(CONFLICT_MSG, { label: 'Save mine as a copy', run: keepMineAsCopy });
            return;
          }
          if (e instanceof api.ApiError && e.gone && proj.id) {
            // deleted from Designs while open here: keep the work as a new design rather than lose it
            try {
              await saveAsNew(proj.name, d, thumb);
              toast('That design had been deleted from Designs, so your work was saved as a new design.');
              return;
            } catch {
              /* falls through: kept on this computer */
            }
          }
          saveFailedRef.current = true;
          setSaveState('error');
          const why = e instanceof Error && !(e instanceof TypeError) ? ` (${e.message})` : '';
          toast(`Couldn’t save to the cloud${why} — your changes are kept on this computer and come back when you reopen the design.`);
        }
      };
      // Serialise saves so an older write can never land after a newer one.
      saveChain.current = saveChain.current.then(run, run);
      await saveChain.current;
    },
    [cloudReady, draftNow, flushPage, keepMineAsCopy, saveAsNew, toast],
  );

  const markDirty = useCallback(() => {
    if (loadingRef.current) return;
    unsavedRef.current = true;
    editSeq.current += 1;
    setSaveState((s) => (s === 'saving' ? s : conflictRef.current ? 'conflict' : 'dirty'));
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
      if (ref.mode !== 'off') tplShownMode.current = ref.mode;
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
    async (d: DesignDoc, name: string, id: string | null, pageIdx = 0, base: string | null = null) => {
      const eng = engineRef.current!;
      genRef.current += 1;
      loadingRef.current = true;
      try {
        const p = Math.min(Math.max(0, pageIdx), d.pages.length - 1);
        setDoc(d);
        setProject({ id, name });
        baseRef.current = id ? base : null;
        unsavedRef.current = false;
        saveFailedRef.current = false;
        conflictRef.current = false;
        eng.forgetHistories();
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

  /**
   * Open a cloud design. This computer may hold newer work for it (a save that failed, or a reload
   * inside the autosave pause): if nobody has saved it since, that work is brought back and saved;
   * if someone has, their version opens and this computer's work is kept as a separate design.
   */
  const openCloud = useCallback(
    async (item: { id: string; name: string; doc: DesignDoc; updated_at: string }) => {
      const local = api.readDraft();
      const mine = local?.doc?.v === 2 && local.projectId === item.id && !!local.unsaved;
      setUrlProject(item.id);
      if (mine && local!.base === item.updated_at) {
        await openDoc(local!.doc, local!.name, item.id, local!.page, local!.base);
        markDirty();
        toast('Brought back changes from this computer that hadn’t been saved yet — saving them now.');
        return;
      }
      if (mine) {
        // Both changed: the other computer's version opens, and this computer's work is kept as its own design.
        const name = `${local!.name} (unsaved changes from this computer)`.slice(0, 140);
        try {
          await api.createProject(name, local!.doc);
        } catch {
          // Couldn't keep a copy in the cloud: open this computer's work as a new design instead, so nothing is lost.
          await openDoc(local!.doc, name, null, local!.page);
          setUrlProject(null);
          markDirty();
          toast(`“${item.name}” was changed on another computer (that version is in Designs). Your unsaved changes from here are open as a new design.`);
          return;
        }
        await openDoc(item.doc, item.name, item.id, 0, item.updated_at);
        api.writeDraft(draftNow(item.doc));
        toast(`This design was changed on another computer, so that version is open. Your unsaved changes from here are kept as a separate design: “${name}”.`);
        return;
      }
      await openDoc(item.doc, item.name, item.id, 0, item.updated_at);
      api.writeDraft(draftNow(item.doc));
      if (local?.projectId === item.id && local.base && local.base !== item.updated_at) {
        toast(`Opened the latest saved “${item.name}” — it was changed on another computer.`);
      }
    },
    [draftNow, markDirty, openDoc, toast],
  );

  const openProject = useCallback(
    async (id: string) => {
      try {
        const r = await api.getProject(id);
        await openCloud(r.item);
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Couldn’t open that design.');
      }
    },
    [openCloud, toast],
  );

  /* ---------------- init ---------------- */

  useEffect(() => {
    let disposed = false;
    api.setDraftOwner(userId);
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
      const draft = api.readDraft();
      if (projectId) await openProject(projectId);
      else if (draft?.doc?.v === 2 && draft.projectId && cloudReady) {
        // A draft of a saved design: only picked up as it is if nobody has saved that design since.
        const cloud = await api.getProject(draft.projectId).then((r) => r.item, (e) => e);
        if (!(cloud instanceof Error)) await openCloud(cloud);
        else if (cloud instanceof api.ApiError && cloud.status === 404) {
          await openDoc(draft.doc, draft.name, null, draft.page);
          if (hasContent(draft.doc)) markDirty();
          toast('That design was deleted from Designs — this computer’s copy is open as a new design.');
        } else {
          // offline: carry on from this computer's copy (it saves when the connection is back)
          await openDoc(draft.doc, draft.name, draft.projectId, draft.page, draft.base ?? null);
          if (draft.unsaved) markDirty();
          toast('Picked up where you left off.');
        }
      } else if (draft?.doc?.v === 2) {
        await openDoc(draft.doc, draft.name, draft.projectId, draft.page, draft.base ?? null);
        if (draft.unsaved && cloudReady && hasContent(draft.doc)) markDirty();
        toast('Picked up where you left off.');
      } else {
        await openDoc(makeDoc('a5'), 'Untitled design', null);
        setDialog('new');
      }
      if (!disposed) setReady(true);
    })();
    return () => {
      disposed = true;
      // Leaving inside the autosave pause (the app's own nav fires no unload event): keep it in the draft.
      if (engineRef.current && unsavedRef.current) {
        try {
          api.writeDraft(draftNow(flushPage()));
        } catch {
          /* the engine is already gone */
        }
      }
      clearTimeout(autosaveTimer.current);
      engineRef.current?.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the draft on tab close / hide; warn before leaving when the newest work isn't in the cloud.
  useEffect(() => {
    const flush = () => {
      if (!engineRef.current) return;
      api.writeDraft(draftNow(flushPage()));
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      flush();
      if (unsavedRef.current && (saveFailedRef.current || conflictRef.current)) e.preventDefault();
    };
    const onHide = () => document.visibilityState === 'hidden' && flush();
    window.addEventListener('beforeunload', onUnload);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [draftNow, flushPage]);

  /* ---------------- pages ---------------- */

  const goPage = async (i: number) => {
    const eng = engineRef.current;
    if (!eng || i === pageRef.current) return;
    const d = flushPage();
    setDocState(d);
    const from = d.pages[pageRef.current];
    if (from) eng.stashHistory(from.id);
    loadingRef.current = true;
    try {
      await eng.loadJson(d.pages[i].json);
      eng.restoreHistory(d.pages[i].id);
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
      engineRef.current!.restoreHistory(pages[next].id);
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
    if (hasContent(d) && !window.confirm('Replace every page with this starting layout?')) return;
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

  /**
   * Before replacing the whole design with a new one: save what's pending first, and if the design
   * then has no cloud copy (local-only mode, or the save failed), the local draft about to be
   * replaced is its only copy — so ask.
   */
  const okToReplace = async () => {
    if (!engineRef.current) return true;
    if (cloudReady && unsavedRef.current && !conflictRef.current) await persist(false);
    const d = flushPage();
    if (!hasContent(d)) return true;
    if (cloudReady && projectRef.current.id && !unsavedRef.current) return true;
    return window.confirm(
      cloudReady
        ? 'Your current design hasn’t been saved to the cloud, so starting a new one replaces it on this computer. Export it first if you want to keep it. Replace it?'
        : 'This replaces your current design, which is only kept on this computer — Export it first if you want to keep it. Replace it?',
    );
  };

  /** New design (from the dialog). */
  const startNew = async (formatId: string, starterId: string, custom?: PageGeometry) => {
    if (!(await okToReplace())) return;
    const eng = engineRef.current!;
    const f = formatById(formatId);
    const d = makeDoc(formatId, custom, custom ? `Custom · ${custom.trim.w}×${custom.trim.h} mm` : undefined);
    const name = `${(custom ? 'Custom' : f?.label ?? 'Design').split('·')[0].trim()} — ${today()}`;
    api.clearDraft();
    genRef.current += 1;
    loadingRef.current = true;
    try {
      setDoc(d);
      setProject({ id: null, name });
      baseRef.current = null;
      unsavedRef.current = false;
      saveFailedRef.current = false;
      conflictRef.current = false;
      eng.forgetHistories();
      setUrlProject(null);
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
      // Start on the first page that carries the printer's sizes (some PDFs open with an instructions sheet).
      let info: TemplateInfo = await readTemplate(bytes, 1);
      for (let p = 2; info.confidence === 'low' && p <= Math.min(info.pages, 12); p++) {
        const next = await readTemplate(bytes, p);
        if (next.confidence !== 'low') info = next;
      }
      setPendingTemplate({ file, bytes, info, page: info.page, name: file.name.replace(/\.pdf$/i, ''), library: null });
      setDialog('template');
    } catch (e) {
      toast(e instanceof TemplateError ? e.message : 'That PDF couldn’t be read — is it a printer template?');
    }
  };

  const useLibraryTemplate = async (t: TemplateSummary) => {
    try {
      const bytes = await api.fetchBytes(api.fileUrl(t.storage_path));
      const page = t.page ?? 1;
      const info: TemplateInfo = { title: t.title, pages: 1, page, geometry: t.geometry, detected: ['From your template library.'], confidence: 'high', scale: 1 };
      setPendingTemplate({ file: null, bytes, info, page, name: t.name, library: t });
      setDialog('template');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Couldn’t load that template.');
    }
  };

  /**
   * "Use on this design" changes the page under existing artwork: move every page's content from the
   * old cut line onto the new one, shrunk to fit if it's smaller (never enlarged) and centred, so
   * nothing lands off the sheet. Full-sheet backgrounds are stretched over the new sheet instead.
   */
  const fitContent = (d: DesignDoc, g: PageGeometry): DesignDoc => {
    const ot = d.geometry.trim, nt = g.trim;
    const s = Math.min(1, nt.w / ot.w, nt.h / ot.h);
    const ax = mm(nt.x + (nt.w - ot.w * s) / 2 - ot.x * s);
    const ay = mm(nt.y + (nt.h - ot.h * s) / 2 - ot.y * s);
    const oldW = mm(d.geometry.mediaW), oldH = mm(d.geometry.mediaH);
    const sameSheet = Math.abs(d.geometry.mediaW - g.mediaW) < 0.01 && Math.abs(d.geometry.mediaH - g.mediaH) < 0.01;
    if (Math.abs(s - 1) < 1e-6 && Math.abs(ax) < 0.01 && Math.abs(ay) < 0.01 && sameSheet) return d;
    const covers = (j: any) =>
      j.role === 'background' && Math.abs(j.left ?? 0) < 1 && Math.abs(j.top ?? 0) < 1 && Math.abs((j.width ?? 0) * (j.scaleX ?? 1) - oldW) < 1 && Math.abs((j.height ?? 0) * (j.scaleY ?? 1) - oldH) < 1 && !j.angle;
    const move = (j: any) =>
      covers(j)
        ? { ...j, left: 0, top: 0, width: mm(g.mediaW), height: mm(g.mediaH), scaleX: 1, scaleY: 1, originX: 'left', originY: 'top' }
        : { ...j, left: ax + s * (j.left ?? 0), top: ay + s * (j.top ?? 0), scaleX: s * (j.scaleX ?? 1), scaleY: s * (j.scaleY ?? 1) };
    return { ...d, pages: d.pages.map((p) => ({ ...p, json: { ...p.json, objects: (((p.json as any).objects ?? []) as any[]).map(move) } })) };
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
    if (o.newDesign && !(await okToReplace())) return;
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
        const r = await api.saveTemplate(path, pending.name, pending.info.title, pending.bytes.length, o.geometry, o.pageNo);
        libraryId = r.item.id;
        setLibTick((x) => x + 1);
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Couldn’t add it to the template library.');
      }
    }
    const ref: TemplateRef = { path: path ?? '', name: pending.name, title: pending.info.title, libraryId, page: o.pageNo, mode: o.mode, opacity: o.opacity, include: false };
    const known = matchFormat(o.geometry);
    loadingRef.current = true;
    try {
      let d: DesignDoc;
      if (o.newDesign) {
        genRef.current += 1;
        d = { ...makeDoc('a5', o.geometry, pending.name), pages: [{ id: uid(), name: known?.pages[0] ?? 'Artwork', json: { ...EMPTY } }] };
        setProject({ id: null, name: `${pending.name} — ${today()}` });
        baseRef.current = null;
        unsavedRef.current = false;
        saveFailedRef.current = false;
        conflictRef.current = false;
        eng.forgetHistories();
        setUrlProject(null);
        api.clearDraft();
        setPage(0);
      } else {
        const cur = flushPage();
        d = fitContent(cur, o.geometry);
        // a name the studio made up for the old format follows the new one
        const oldFmt = formatById(cur.formatId);
        const oldPrefix = `${(oldFmt?.label ?? cur.formatLabel).split('·')[0].trim()} — `;
        if (projectRef.current.name.startsWith(oldPrefix)) setProject({ ...projectRef.current, name: `${pending.name} — ${projectRef.current.name.slice(oldPrefix.length)}` });
        if (d.pages.length === 1 && oldFmt?.pages.includes(d.pages[0].name)) d = { ...d, pages: [{ ...d.pages[0], name: known?.pages[0] ?? 'Artwork' }] };
      }
      const nd: DesignDoc = { ...d, formatId: known?.id ?? 'template', formatLabel: pending.name, geometry: o.geometry, template: path ? ref : null };
      setDoc(nd);
      eng.applyGeometry(o.geometry);
      await eng.loadJson(nd.pages[pageRef.current].json);
      await loadTemplateLayer(ref, pending.bytes);
      if (!path) eng.setTemplate({ ref, image: eng.template?.image ?? null });
    } finally {
      loadingRef.current = false;
    }
    setPendingTemplate(null);
    setDialog(null);
    setTick((x) => x + 1);
    markDirty();
  };

  const setTemplateRef = (patch: Partial<TemplateRef>) => {
    const eng = engineRef.current!;
    const t = eng.template;
    if (!t) return;
    const ref = { ...t.ref, ...patch };
    if (ref.mode !== 'off') tplShownMode.current = ref.mode;
    eng.setTemplate({ ref, image: t.image });
    const d = docRef.current;
    if (d.template) setDoc({ ...d, template: ref });
    setTick((x) => x + 1);
    markDirty();
  };
  const toggleTemplate = () => {
    const t = engineRef.current?.template;
    if (!t) return;
    setTemplateRef({ mode: t.ref.mode === 'off' ? tplShownMode.current : 'off' });
  };
  const removeTemplate = () => {
    const eng = engineRef.current!;
    const prev: { layer: TemplateLayer | null; bytes: Uint8Array | null; ref: TemplateRef | null | undefined } = { layer: eng.template, bytes: tplBytesRef.current, ref: docRef.current.template };
    eng.setTemplate(null);
    tplBytesRef.current = null;
    setTplBytes(null);
    setDoc({ ...docRef.current, template: null });
    setTick((x) => x + 1);
    markDirty();
    if (!prev.layer) return;
    toast('Printer template removed — your artwork is unchanged.', {
      label: 'Undo',
      run: () => {
        const e = engineRef.current;
        if (!e || e.template) return;
        e.setTemplate(prev.layer);
        tplBytesRef.current = prev.bytes;
        setTplBytes(prev.bytes);
        setDoc({ ...docRef.current, template: prev.ref ?? null });
        setTick((x) => x + 1);
        markDirty();
      },
    });
  };
  const setGeometry = (g: PageGeometry) => {
    // a safe area at least half the page deep leaves nothing inside it (and won't save)
    const safe = Math.max(0, Math.min(g.safe, Math.floor((Math.min(g.trim.w, g.trim.h) / 2 - 0.5) * 10) / 10));
    const ng = { ...g, safe };
    engineRef.current!.applyGeometry(ng);
    setDoc({ ...docRef.current, geometry: ng });
    markDirty();
  };

  /* ---------------- drag & drop ---------------- */

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) void placeFiles(files);
  };

  const dpi = targetDpi(fmt, doc.geometry);
  const studio: StudioApi | null = useMemo(() => {
    const engine = engineRef.current;
    if (!engine || !ready) return null;
    return {
      engine, doc, page, tick, cloudReady, isAdmin, fmt, digital: !!digital, dpi, libTick, toast, placeFiles, addLogo, addIcon, addImageUrl,
      applyStarter, openDialog: setDialog, importTemplateFile, useLibraryTemplate, setTemplateRef, toggleTemplate, removeTemplate, setGeometry,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, doc, page, tick, cloudReady, isAdmin, fmt, digital, dpi, libTick]);

  const eng = engineRef.current;
  const zoomPct = eng ? Math.round((eng.zoom / (96 / 72)) * 100) : 100;
  const saveLabel: Record<SaveState, string> = {
    idle: cloudReady ? 'Not saved yet' : 'On this computer',
    dirty: 'Unsaved changes',
    saving: 'Saving…',
    saved: 'Saved',
    local: 'Saved on this computer',
    error: 'Save failed — kept locally',
    conflict: 'Changed elsewhere — save a copy',
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
        {saveState === 'conflict' ? (
          <button className="ds2-save is-conflict" onClick={() => void keepMineAsCopy()} title={CONFLICT_MSG}>{saveLabel.conflict}</button>
        ) : (
          <span className={`ds2-save is-${saveState}`}>{saveLabel[saveState]}</span>
        )}
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
          {eng?.template?.ref && (
            <div className="ds2-tplbadge" title={eng.template.ref.title ?? ''}>
              <Ico n="template" size={14} /> {eng.template.ref.name} · {eng.template.ref.mode === 'off' ? 'hidden' : 'guide only'}
            </div>
          )}
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

      {toastMsg && (
        <div className="ds2-toast" role="status">
          <span>{toastMsg.m}</span>
          {toastMsg.action && (
            <button
              className="ds2-btn"
              onClick={() => {
                const a = toastMsg.action!;
                setToastMsg(null);
                void a.run();
              }}
            >
              {toastMsg.action.label}
            </button>
          )}
        </div>
      )}

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
          onProjectDeleted={(id) => { if (projectRef.current.id === id) { setProject({ id: null, name: projectRef.current.name }); baseRef.current = null; setUrlProject(null); } }}
        />
      )}
    </div>
  );
}

const round1 = (n: number) => Math.round(n * 10) / 10;
