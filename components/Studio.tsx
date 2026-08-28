'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Spark } from './Spark';
import ProjectsModal from './ProjectsModal';
import {
  TEMPLATES,
  SIZES,
  THEMES,
  FIELD_LABELS,
  renderPost,
  type PostState,
  type TemplateKey,
  type SizeKey,
  type ThemeKey,
  type ClickZone,
  type RenderImages,
  type Badge,
} from '@/lib/postEngine';
import { ICON_IDS, ICON_SPRITE } from '@/lib/iconSprite';
import { prettifyIcon } from '@/lib/icons';
import { APP_VERSION, WHATS_NEW, TOUR_STEPS, type TourStep } from '@/lib/updates';
import type { Brand } from '@/lib/postEngine';
import {
  type BrandKit,
  BLANK_BRAND,
  HELIAXIS_DEFAULTS,
  HEADING_FONTS,
  BODY_FONTS,
  extractAccent,
} from '@/lib/brandKit';
import GuideTour from './GuideTour';
import styles from './Studio.module.css';

const SEEN_KEY = 'heliaxis_studio_seen_version';

const BADGE_PRESETS: Badge[] = [
  { icon: 'ic-shield', label: 'MCS Certified' },
  { icon: 'ic-award', label: 'TrustMark' },
  { icon: 'ic-check', label: 'RECC' },
  { icon: 'ic-percent', label: '0% VAT' },
  { icon: 'ic-leaf', label: 'Renewable' },
];

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

interface HistoryRow {
  id: string;
  tpl: string;
  size: string;
  theme: string;
  hatch: boolean;
  data: Record<string, string>;
  headline: string;
  source: string;
  created_at: string;
}

interface AdminUser {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  confirmed: boolean;
}

export default function Studio({
  userEmail,
  isAdmin,
}: {
  userEmail: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const zonesRef = useRef<ClickZone[]>([]);
  const imgsRef = useRef<RenderImages>({});
  const famRef = useRef({ display: 'sans-serif', body: 'sans-serif', mono: 'monospace' });
  const brandRef = useRef<Brand | undefined>(undefined);

  const [S, setS] = useState<PostState>({
    tpl: 'statement',
    size: 'square',
    theme: 'dark',
    hatch: true,
    data: { ...TEMPLATES.statement.defaults },
    badges: [],
    photoShade: 0.62,
    brands: [],
  });

  const [genOpen, setGenOpen] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [genTpl, setGenTpl] = useState<TemplateKey>('statement');
  const [genTopic, setGenTopic] = useState('');
  const [genTone, setGenTone] = useState('Confident & plain-spoken (house style)');
  const [genStatus, setGenStatus] = useState('');
  const [genErr, setGenErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mobileTab, setMobileTab] = useState<'design' | 'content'>('design');
  const [genSuggest, setGenSuggest] = useState<string[]>([]);
  const [genSuggestBusy, setGenSuggestBusy] = useState(false);

  // account menu + admin
  const [menuOpen, setMenuOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailDraft, setEmailDraft] = useState(userEmail);
  const [emailMsg, setEmailMsg] = useState('');
  const [emailErr, setEmailErr] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersMsg, setUsersMsg] = useState('');
  const [usersBusy, setUsersBusy] = useState(false);

  // per-post identity + auto-save
  const [postId, setPostId] = useState<string>(() => newId());
  const [postSource, setPostSource] = useState<'manual' | 'ai'>('manual');
  const [postAuthor, setPostAuthor] = useState<string>(userEmail);
  const [downloads, setDownloads] = useState(0);
  const [hasPhoto, setHasPhoto] = useState(false);
  // data-URL of the current background photo, persisted with the post so it
  // comes back when the post is reloaded from history
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  // when a post was created from a project, remember it so we can offer
  // "Change photo" scoped to that project and tag it in history
  const [postProject, setPostProject] = useState<{ id: string; name: string } | null>(null);
  const [projPhotoOpen, setProjPhotoOpen] = useState(false);
  const [projPhotos, setProjPhotos] = useState<{ id: string; name: string; data_url: string }[]>(
    []
  );
  const [projPhotosBusy, setProjPhotosBusy] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveMsg, setSaveMsg] = useState('');
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [captionOverride, setCaptionOverride] = useState<string | null>(null);
  const [capBusy, setCapBusy] = useState(false);
  const [capErr, setCapErr] = useState('');
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [myBrandOpen, setMyBrandOpen] = useState(false);
  const [brand, setBrand] = useState<BrandKit>(BLANK_BRAND);
  const [bkDraft, setBkDraft] = useState<BrandKit>(BLANK_BRAND);
  const [brandBusy, setBrandBusy] = useState(false);
  const [brandMsg2, setBrandMsg2] = useState('');
  const [tourOpen, setTourOpen] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [newPostOpen, setNewPostOpen] = useState(false);
  const [npTpl, setNpTpl] = useState<TemplateKey>('statement');
  const [npMode, setNpMode] = useState<'choose' | 'project'>('choose');
  const [npProjects, setNpProjects] = useState<
    Record<string, string>[]
  >([]);
  const [npBusy, setNpBusy] = useState(false);
  const [iconOpen, setIconOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [pickLabel, setPickLabel] = useState('');
  const [library, setLibrary] = useState<{ id: string; icon: string; label: string }[]>([]);
  const [libMsg, setLibMsg] = useState('');
  const [ideasOpen, setIdeasOpen] = useState(false);
  const [ideas, setIdeas] = useState<{ title: string; brief: string }[]>([]);
  const [ideasBusy, setIdeasBusy] = useState(false);
  const [ideasErr, setIdeasErr] = useState('');
  const [savedIdeas, setSavedIdeas] = useState<{ id: string; title: string; brief: string }[]>([]);
  const [brandLogos, setBrandLogos] = useState<{ id: string; name: string; data_url: string }[]>(
    []
  );
  const [brandMsg, setBrandMsg] = useState('');
  const [brandOpen, setBrandOpen] = useState(false);
  const brandCache = useRef<Record<string, HTMLImageElement>>({});
  const [imageOpen, setImageOpen] = useState(false);
  const [imageLibrary, setImageLibrary] = useState<
    { id: string; name: string; description: string; data_url: string }[]
  >([]);
  const [imageMsg, setImageMsg] = useState('');
  const [editImage, setEditImage] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [confirmState, setConfirmState] = useState<{ msg: string; onYes: () => void } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // inline "edit text on the post" overlay
  const [edit, setEdit] = useState<{
    f: string;
    multiline: boolean;
    display: boolean;
    left: number;
    top: number;
    width: number;
    height: number;
    fontPx: number;
  } | null>(null);
  const [editVal, setEditVal] = useState('');
  const editRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  // drag-to-move state (which field is being dragged and from where)
  const dragRef = useRef<{
    f: string;
    z: ClickZone;
    startX: number;
    startY: number;
    baseDx: number;
    baseDy: number;
    moved: boolean;
  } | null>(null);
  const firstRun = useRef(true);
  const skipSave = useRef(false);

  const supabase = createClient();

  // resolve next/font family names + load logo images once
  useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    famRef.current = {
      display: cs.getPropertyValue('--font-ezra').trim() || 'sans-serif',
      body: cs.getPropertyValue('--font-body').trim() || 'sans-serif',
      mono: cs.getPropertyValue('--font-mono').trim() || 'monospace',
    };
    const light = new Image();
    const dark = new Image();
    light.onload = draw;
    dark.onload = () => {
      // build pure-black logo for the gold theme
      const t = document.createElement('canvas');
      t.width = dark.naturalWidth;
      t.height = dark.naturalHeight;
      const tc = t.getContext('2d')!;
      tc.drawImage(dark, 0, 0);
      const id = tc.getImageData(0, 0, t.width, t.height);
      const p = id.data;
      for (let i = 0; i < p.length; i += 4) {
        if (p[i + 3] > 10) {
          p[i] = 0;
          p[i + 1] = 0;
          p[i + 2] = 0;
        }
      }
      tc.putImageData(id, 0, 0);
      const black = new Image();
      black.onload = draw;
      black.src = t.toDataURL();
      imgsRef.current.black = black;
      draw();
    };
    light.src = '/heliaxis-logo-light.png';
    dark.src = '/heliaxis-logo.png';
    imgsRef.current.light = light;
    imgsRef.current.dark = dark;

    // wait for fonts, then draw
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(draw);
    }
    loadHistory();
    loadLibrary();
    loadBrandLogos();
    loadImages();
    loadBrandKit();
    // show "what's new" once per release
    try {
      if (localStorage.getItem(SEEN_KEY) !== APP_VERSION) setWhatsNewOpen(true);
    } catch {
      /* private mode / no storage — skip */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function dismissWhatsNew() {
    try {
      localStorage.setItem(SEEN_KEY, APP_VERSION);
    } catch {
      /* ignore */
    }
    setWhatsNewOpen(false);
  }
  function startTour() {
    // close anything that would sit over the tour
    setWhatsNewOpen(false);
    setMenuOpen(false);
    setGenOpen(false);
    setHistOpen(false);
    setNewPostOpen(false);
    setTourOpen(true);
  }
  // called as the tour advances — reveal the right panel on mobile so the
  // target actually exists, and close the account menu between steps
  function handleTourStep(step: TourStep) {
    if (step.mobileTab) setMobileTab(step.mobileTab);
    if (step.target !== '[data-tour="account"]') setMenuOpen(false);
  }

  const draw = useCallback(() => {
    if (!canvasRef.current) return;
    zonesRef.current = renderPost(
      canvasRef.current,
      Sref.current,
      imgsRef.current,
      famRef.current,
      brandRef.current
    );
  }, []);

  // keep a ref of latest state for the draw callback
  const Sref = useRef(S);
  useEffect(() => {
    Sref.current = S;
    draw();
  }, [S, draw]);

  // focus the inline editor when it opens; close it if the window resizes
  // (its position is pixel-based and would drift)
  useEffect(() => {
    if (!edit) return;
    const t = setTimeout(() => {
      editRef.current?.focus();
      const el = editRef.current;
      if (el && 'select' in el) el.select();
    }, 10);
    const onResize = () => setEdit(null);
    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', onResize);
    };
  }, [edit]);

  // resolve selected brand logos to <img> elements and repaint when ready
  useEffect(() => {
    const ids = S.brands || [];
    ids.forEach((id) => {
      if (!brandCache.current[id]) {
        const logo = brandLogos.find((b) => b.id === id);
        if (logo) {
          const im = new Image();
          im.onload = () => draw();
          im.src = logo.data_url;
          brandCache.current[id] = im;
        }
      }
    });
    imgsRef.current.brands = ids.map((id) => brandCache.current[id]).filter(Boolean);
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [S.brands, brandLogos]);

  async function loadBrandLogos() {
    const { data } = await supabase
      .from('brand_logos')
      .select('id, name, data_url')
      .order('created_at', { ascending: true });
    if (data) setBrandLogos(data as { id: string; name: string; data_url: string }[]);
  }
  function onBrandFile(file?: File) {
    if (!file) return;
    const r = new FileReader();
    r.onload = async () => {
      const dataUrl = r.result as string;
      const name = file.name.replace(/\.[^.]+$/, '');
      const { error } = await supabase.from('brand_logos').insert({ name, data_url: dataUrl });
      if (error) {
        setBrandMsg(error.message);
        return;
      }
      setBrandMsg('');
      loadBrandLogos();
    };
    r.readAsDataURL(file);
  }
  function toggleBrand(id: string) {
    setS((s) => {
      const cur = s.brands || [];
      return { ...s, brands: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] };
    });
  }
  function deleteBrandLogo(id: string, name: string) {
    askConfirm(`Delete "${name || 'this logo'}" from the library? This can't be undone.`, () => {
      setBrandLogos((list) => list.filter((b) => b.id !== id));
      setS((s) => ({ ...s, brands: (s.brands || []).filter((x) => x !== id) }));
      supabase.from('brand_logos').delete().eq('id', id);
    });
  }
  function openBrand() {
    setBrandMsg('');
    setMenuOpen(false);
    loadBrandLogos();
    setBrandOpen(true);
  }

  // ---- image / photo library ----
  async function loadImages() {
    const { data } = await supabase
      .from('image_library')
      .select('id, name, description, data_url')
      .order('created_at', { ascending: false });
    if (data)
      setImageLibrary(
        data as { id: string; name: string; description: string; data_url: string }[]
      );
  }
  function openImages() {
    setImageMsg('');
    setEditImage(null);
    loadImages();
    setImageOpen(true);
  }
  function startEditImage(l: { id: string; name: string; description: string }) {
    setEditImage(l.id);
    setEditName(l.name || '');
    setEditDesc(l.description || '');
  }
  async function saveImageDetails() {
    if (!editImage) return;
    const { error } = await supabase
      .from('image_library')
      .update({ name: editName.trim(), description: editDesc.trim() })
      .eq('id', editImage);
    if (error) {
      setImageMsg(error.message);
      return;
    }
    setEditImage(null);
    loadImages();
  }
  function selectImageUrl(dataUrl: string) {
    const im = new Image();
    im.onload = () => {
      imgsRef.current.photo = im;
      setHasPhoto(true);
      draw();
    };
    im.src = dataUrl;
    setPhotoUrl(dataUrl);
  }
  function readFileAsDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(new Error('read failed'));
      r.readAsDataURL(file);
    });
  }
  async function onImageFiles(files?: FileList | null) {
    if (!files || !files.length) return;
    setImageMsg('');
    const seen = new Set(imageLibrary.map((i) => (i.name || '').trim().toLowerCase()));
    const arr = Array.from(files);
    const toInsert: { name: string; data_url: string }[] = [];
    const skipped: string[] = [];
    for (const file of arr) {
      const name = file.name.replace(/\.[^.]+$/, '').trim();
      const key = name.toLowerCase();
      if (seen.has(key)) {
        skipped.push(name);
        continue;
      }
      seen.add(key);
      try {
        toInsert.push({ name, data_url: await readFileAsDataURL(file) });
      } catch {
        skipped.push(name);
      }
    }
    if (toInsert.length) {
      if (arr.length === 1) selectImageUrl(toInsert[0].data_url); // single upload → apply now
      const { error } = await supabase.from('image_library').insert(toInsert);
      if (error) {
        setImageMsg(error.message);
        return;
      }
    }
    if (skipped.length)
      setImageMsg(`Skipped ${skipped.length} with a name already in the library: ${skipped.join(', ')}`);
    loadImages();
  }
  function askConfirm(msg: string, onYes: () => void) {
    setConfirmState({ msg, onYes });
  }

  // ---- My Brand kit (logo, colours, fonts) ----
  function applyBrand(kit: BrandKit) {
    const customColours =
      kit.color_accent !== HELIAXIS_DEFAULTS.color_accent ||
      kit.color_ink !== HELIAXIS_DEFAULTS.color_ink ||
      kit.color_paper !== HELIAXIS_DEFAULTS.color_paper;
    brandRef.current = customColours
      ? { accent: kit.color_accent, ink: kit.color_ink, paper: kit.color_paper }
      : undefined;
    // fonts (fall back to the built-in Heliaxis/Hanken faces)
    const cs = getComputedStyle(document.documentElement);
    famRef.current = {
      display: kit.font_heading || cs.getPropertyValue('--font-ezra').trim() || 'sans-serif',
      body: kit.font_body || cs.getPropertyValue('--font-body').trim() || 'sans-serif',
      mono: cs.getPropertyValue('--font-mono').trim() || 'monospace',
    };
    // logos (fall back to the Heliaxis marks)
    const lightSrc = kit.logo_light || '/heliaxis-logo-light.png';
    const darkSrc = kit.logo_dark || '/heliaxis-logo.png';
    const li = new Image();
    li.onload = () => draw();
    li.src = lightSrc;
    imgsRef.current.light = li;
    const dk = new Image();
    dk.onload = () => {
      try {
        const t = document.createElement('canvas');
        t.width = dk.naturalWidth;
        t.height = dk.naturalHeight;
        const tc = t.getContext('2d')!;
        tc.drawImage(dk, 0, 0);
        const id = tc.getImageData(0, 0, t.width, t.height);
        const p = id.data;
        for (let i = 0; i < p.length; i += 4) {
          if (p[i + 3] > 10) {
            p[i] = 0;
            p[i + 1] = 0;
            p[i + 2] = 0;
          }
        }
        tc.putImageData(id, 0, 0);
        const bl = new Image();
        bl.onload = () => draw();
        bl.src = t.toDataURL();
        imgsRef.current.black = bl;
      } catch {
        /* tainted canvas — skip the black variant */
      }
      draw();
    };
    dk.src = darkSrc;
    imgsRef.current.dark = dk;
    if (document.fonts?.ready) document.fonts.ready.then(draw);
    draw();
  }
  async function loadBrandKit() {
    const { data } = await supabase.from('brand_kit').select('*').eq('id', 'default').maybeSingle();
    if (data) {
      const kit = data as BrandKit;
      setBrand(kit);
      applyBrand(kit);
    }
  }
  function openMyBrand() {
    setMenuOpen(false);
    setBrandMsg2('');
    setBkDraft({ ...brand });
    setMyBrandOpen(true);
  }
  function onBrandLogoFile(which: 'logo_light' | 'logo_dark', file?: File) {
    if (!file) return;
    const r = new FileReader();
    r.onload = async () => {
      const dataUrl = r.result as string;
      setBkDraft((d) => ({ ...d, [which]: dataUrl }));
      // auto-suggest the accent from the first logo uploaded
      try {
        const accent = await extractAccent(dataUrl);
        setBkDraft((d) => ({ ...d, color_accent: accent }));
        setBrandMsg2('Accent colour picked from your logo — adjust it below if needed.');
      } catch {
        /* ignore */
      }
    };
    r.readAsDataURL(file);
  }
  async function reExtractAccent() {
    const src = bkDraft.logo_dark || bkDraft.logo_light;
    if (!src) return;
    const accent = await extractAccent(src);
    setBkDraft((d) => ({ ...d, color_accent: accent }));
  }
  async function saveBrand() {
    setBrandBusy(true);
    setBrandMsg2('');
    const { error } = await supabase
      .from('brand_kit')
      .upsert({ id: 'default', ...bkDraft, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    setBrandBusy(false);
    if (error) {
      setBrandMsg2(error.message);
      return;
    }
    setBrand(bkDraft);
    applyBrand(bkDraft);
    setMyBrandOpen(false);
  }
  function resetBrandToDefault() {
    setBkDraft({ ...BLANK_BRAND });
    setBrandMsg2('Reset to the Heliaxis defaults — press Save to apply.');
  }
  function deleteImage(id: string, name: string) {
    askConfirm(`Delete "${name || 'this image'}" from the library? This can't be undone.`, () => {
      setImageLibrary((list) => list.filter((i) => i.id !== id)); // instant, optimistic
      supabase.from('image_library').delete().eq('id', id);
    });
  }

  // auto-save the current post (upsert by id) shortly after any change
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    setSaveState('saving');
    const h = setTimeout(() => {
      autosave();
    }, 1000);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [S, photoUrl]);

  function postRowData(dls: number) {
    return {
      ...S.data,
      __badges: JSON.stringify(S.badges || []),
      __brands: JSON.stringify(S.brands || []),
      __author: postAuthor || userEmail,
      __downloads: dls,
      __project: postProject?.name || '',
      __projectId: postProject?.id || '',
      __offsets: JSON.stringify(S.offsets || {}),
    };
  }

  // upsert a post row; if the DB doesn't have the `photo` column yet, retry
  // without it so saving never breaks before the migration is run
  async function upsertPost(row: Record<string, unknown>) {
    let { error } = await supabase.from('posts').upsert(row, { onConflict: 'id' });
    if (error && /photo/i.test(error.message) && 'photo' in row) {
      const { photo: _p, ...rest } = row;
      void _p;
      ({ error } = await supabase.from('posts').upsert(rest, { onConflict: 'id' }));
    }
    return error;
  }

  async function autosave() {
    const error = await upsertPost({
      id: postId,
      tpl: S.tpl,
      size: S.size,
      theme: S.theme,
      hatch: S.hatch,
      data: postRowData(downloads),
      headline: headlineOf(S.data),
      source: postSource,
      photo: photoUrl,
    });
    if (error) {
      setSaveState('error');
      setSaveMsg(error.message);
      return;
    }
    setSaveState('saved');
    loadHistory();
  }

  async function saveNow() {
    skipSave.current = false;
    setSaveState('saving');
    await autosave();
  }

  async function saveContinue() {
    await saveNow();
    setSaveModalOpen(false);
  }
  async function saveAndDownload() {
    await saveNow();
    setSaveModalOpen(false);
    download();
  }
  async function saveAndNew() {
    await saveNow();
    setSaveModalOpen(false);
    openNewPost();
  }

  // photos from the project this post was created from
  async function openProjectPhotos() {
    if (!postProject) return;
    setProjPhotoOpen(true);
    setProjPhotosBusy(true);
    const { data } = await supabase
      .from('project_images')
      .select('id, name, data_url')
      .eq('project_id', postProject.id)
      .order('created_at', { ascending: true });
    setProjPhotos((data as { id: string; name: string; data_url: string }[]) || []);
    setProjPhotosBusy(false);
  }

  async function loadHistory() {
    // don't pull the (large) photo data-URL for every row — fetched on open
    const { data } = await supabase
      .from('posts')
      .select('id, tpl, size, theme, hatch, data, headline, source, created_at')
      .order('created_at', { ascending: false })
      .limit(120);
    if (data) setHistory(data as HistoryRow[]);
  }

  function setTpl(k: TemplateKey) {
    setCaptionOverride(null);
    setCapErr('');
    setS((s) => ({ ...s, tpl: k, data: { ...TEMPLATES[k].defaults } }));
  }

  async function makeCaption(
    tplKey: TemplateKey,
    data: Record<string, string>,
    tone: string
  ): Promise<string> {
    const t = TEMPLATES[tplKey];
    const res = await fetch('/api/caption', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tplName: t.name, tplDesc: t.desc, data, tone }),
    });
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.error || 'Could not generate caption.');
    return json.caption || '';
  }
  async function genCaption() {
    setCapErr('');
    setCapBusy(true);
    try {
      const caption = await makeCaption(S.tpl, S.data, genTone);
      setCaptionOverride(caption);
    } catch (e) {
      setCapErr((e as Error).message || 'Network error — please try again.');
    } finally {
      setCapBusy(false);
    }
  }
  function setField(k: string, v: string) {
    setS((s) => ({ ...s, data: { ...s.data, [k]: v } }));
  }

  function addBadge(icon: string, label: string) {
    if (!icon) return;
    const clean = label.trim();
    setS((s) => {
      const existing = s.badges || [];
      if (existing.some((b) => b.icon === icon && b.label.toLowerCase() === clean.toLowerCase()))
        return s; // no duplicates
      return { ...s, badges: [...existing, { icon, label: clean }] };
    });
  }
  function removeBadge(i: number) {
    setS((s) => ({ ...s, badges: (s.badges || []).filter((_, j) => j !== i) }));
  }
  function openIconBank() {
    setPicked([]);
    setPickLabel('');
    setLibMsg('');
    loadLibrary();
    setIconOpen(true);
  }
  function togglePick(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }
  function labelFor(id: string) {
    return picked.length === 1 ? pickLabel.trim() || prettifyIcon(id) : prettifyIcon(id);
  }
  function addPickedToPost() {
    picked.forEach((id) => addBadge(id, labelFor(id)));
    setPicked([]);
    setPickLabel('');
  }

  async function loadLibrary() {
    const { data } = await supabase
      .from('badge_library')
      .select('id, icon, label')
      .order('created_at', { ascending: true });
    if (data) setLibrary(data as { id: string; icon: string; label: string }[]);
  }
  async function saveToLibrary() {
    if (!picked.length) return;
    setLibMsg('');
    const rows = picked.map((id) => ({ icon: id, label: labelFor(id) }));
    const { error } = await supabase.from('badge_library').insert(rows);
    if (error) {
      setLibMsg(error.message);
      return;
    }
    loadLibrary();
  }
  function deleteFromLibrary(id: string) {
    askConfirm('Remove this badge from your library?', () => {
      setLibrary((list) => list.filter((l) => l.id !== id));
      supabase.from('badge_library').delete().eq('id', id);
    });
  }
  async function updateLibrary(id: string, label: string) {
    const { error } = await supabase
      .from('badge_library')
      .update({ label: label.trim() })
      .eq('id', id);
    if (error) {
      setLibMsg(error.message);
      return;
    }
    loadLibrary();
  }

  // ---- post ideas ----
  function openIdeas() {
    setIdeasErr('');
    setIdeasOpen(true);
    loadSavedIdeas();
    genIdeas();
  }
  async function genIdeas() {
    setIdeasErr('');
    setIdeasBusy(true);
    try {
      const recent = history.slice(0, 25).map((h) => h.headline);
      const res = await fetch('/api/ideas', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ recent }),
      });
      const json = await res.json();
      setIdeasBusy(false);
      if (!res.ok || json.error) {
        setIdeasErr(json.error || 'Could not get ideas.');
        return;
      }
      setIdeas(Array.isArray(json.ideas) ? json.ideas : []);
    } catch {
      setIdeasBusy(false);
      setIdeasErr('Network error — please try again.');
    }
  }
  async function loadSavedIdeas() {
    const { data } = await supabase
      .from('saved_ideas')
      .select('id, title, brief')
      .order('created_at', { ascending: false });
    if (data) setSavedIdeas(data as { id: string; title: string; brief: string }[]);
  }
  async function saveIdea(idea: { title: string; brief: string }) {
    setIdeasErr('');
    const { error } = await supabase
      .from('saved_ideas')
      .insert({ title: idea.title, brief: idea.brief });
    if (error) {
      setIdeasErr(error.message);
      return;
    }
    loadSavedIdeas();
  }
  function deleteSavedIdea(id: string) {
    setSavedIdeas((list) => list.filter((i) => i.id !== id));
    supabase.from('saved_ideas').delete().eq('id', id);
  }
  function selectIdea(idea: { title: string; brief: string }) {
    const topic = idea.brief ? `${idea.title} — ${idea.brief}` : idea.title;
    setGenTopic(topic);
    setIdeasOpen(false);
    setGenOpen(true);
    runGenerate(topic);
  }

  function loadPhoto(file?: File) {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      const im = new Image();
      im.onload = () => {
        imgsRef.current.photo = im;
        setHasPhoto(true);
        draw();
      };
      im.src = r.result as string;
      setPhotoUrl(r.result as string);
    };
    r.readAsDataURL(file);
  }
  function clearPhoto() {
    imgsRef.current.photo = null;
    setHasPhoto(false);
    setPhotoUrl(null);
    draw();
  }

  const MULTILINE_FIELDS = new Set([
    'sub',
    'headline',
    'quote',
    'item1',
    'item2',
    'item3',
    'statlabel',
  ]);
  const DISPLAY_FIELDS = new Set(['headline', 'stat', 'statlabel', 'quote']);

  function canvasPoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const cv = canvasRef.current!;
    const r = cv.getBoundingClientRect();
    return {
      cv,
      scale: r.width / cv.width,
      mx: ((e.clientX - r.left) * cv.width) / r.width,
      my: ((e.clientY - r.top) * cv.height) / r.height,
    };
  }
  function hitZone(mx: number, my: number): ClickZone | null {
    for (let i = zonesRef.current.length - 1; i >= 0; i--) {
      const z = zonesRef.current[i];
      if (mx >= z.x && mx <= z.x + z.w && my >= z.y && my <= z.y + z.h) return z;
    }
    return null;
  }
  // open the inline text editor over a field's zone
  function openInlineEdit(z: ClickZone, scale: number) {
    if (!(z.f in S.data)) return;
    const multiline = MULTILINE_FIELDS.has(z.f);
    const dh = z.h * scale;
    const fontPx = Math.max(13, Math.min(38, Math.round(multiline ? dh * 0.26 : dh * 0.44)));
    setEditVal(S.data[z.f] || '');
    setEdit({
      f: z.f,
      multiline,
      display: DISPLAY_FIELDS.has(z.f),
      left: z.x * scale,
      top: z.y * scale,
      width: Math.max(80, z.w * scale),
      height: Math.max(fontPx * 1.6, dh),
      fontPx,
    });
  }

  function onCanvasPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (edit) return; // let the open editor keep focus
    const { cv, mx, my } = canvasPoint(e);
    const z = hitZone(mx, my);
    if (!z || !(z.f in S.data)) {
      dragRef.current = null;
      return;
    }
    const cur = S.offsets?.[z.f] || { dx: 0, dy: 0 };
    dragRef.current = { f: z.f, z, startX: mx, startY: my, baseDx: cur.dx, baseDy: cur.dy, moved: false };
    try {
      cv.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    cv.style.cursor = 'grabbing';
  }
  function onCanvasPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const { cv, mx, my } = canvasPoint(e);
    const drag = dragRef.current;
    if (!drag) {
      cv.style.cursor = hitZone(mx, my) ? 'grab' : 'default';
      return;
    }
    const ddx = mx - drag.startX;
    const ddy = my - drag.startY;
    if (!drag.moved && Math.hypot(ddx, ddy) < 4) return; // ignore micro-moves
    drag.moved = true;
    const f = drag.f;
    setS((s) => ({
      ...s,
      offsets: { ...(s.offsets || {}), [f]: { dx: Math.round(drag.baseDx + ddx), dy: Math.round(drag.baseDy + ddy) } },
    }));
  }
  function onCanvasPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    const { cv, scale } = canvasPoint(e);
    const drag = dragRef.current;
    dragRef.current = null;
    try {
      cv.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    cv.style.cursor = 'grab';
    if (drag && !drag.moved) openInlineEdit(drag.z, scale); // a click, not a drag → edit
  }
  function onCanvasDoubleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    // double-click a moved field to snap it back to its auto position
    const cv = canvasRef.current!;
    const r = cv.getBoundingClientRect();
    const mx = ((e.clientX - r.left) * cv.width) / r.width;
    const my = ((e.clientY - r.top) * cv.height) / r.height;
    const z = hitZone(mx, my);
    if (z && S.offsets?.[z.f]) {
      setEdit(null);
      setS((s) => {
        const next = { ...(s.offsets || {}) };
        delete next[z.f];
        return { ...s, offsets: next };
      });
    }
  }
  function resetOffsets() {
    setS((s) => ({ ...s, offsets: {} }));
  }

  async function download() {
    const cv = canvasRef.current!;
    cv.toBlob((b) => {
      if (!b) return;
      const a = document.createElement('a');
      a.download = `heliaxis-${S.tpl}-${S.size}.png`;
      a.href = URL.createObjectURL(b);
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, 'image/png');
    // track download count on the post
    const next = downloads + 1;
    setDownloads(next);
    skipSave.current = false;
    await upsertPost({
      id: postId,
      tpl: S.tpl,
      size: S.size,
      theme: S.theme,
      hatch: S.hatch,
      data: postRowData(next),
      headline: headlineOf(S.data),
      source: postSource,
      photo: photoUrl,
    });
    loadHistory();
  }

  function headlineOf(data: Record<string, string>) {
    return (data.headline || data.stat || data.quote || '').split('*').join('');
  }

  function newPost() {
    skipSave.current = true;
    setPostId(newId());
    setPostSource('manual');
    setPostAuthor(userEmail);
    setDownloads(0);
    setPostProject(null);
    imgsRef.current.photo = null;
    setHasPhoto(false);
    setPhotoUrl(null);
    setSaveState('idle');
    setCaptionOverride(null);
    setCapErr('');
    setS({
      tpl: 'statement',
      size: 'square',
      theme: 'dark',
      hatch: true,
      data: { ...TEMPLATES.statement.defaults },
      badges: [],
      photoShade: 0.62,
      brands: [],
    });
  }

  // ---- New Post modal (template + Custom / Smart / from project) ----
  function openNewPost() {
    setNpMode('choose');
    setNewPostOpen(true);
    loadNpProjects();
  }
  async function loadNpProjects() {
    const { data } = await supabase
      .from('projects')
      .select('*')
      .order('updated_at', { ascending: false });
    if (data) setNpProjects(data as Record<string, string>[]);
  }
  function startPost(tpl: TemplateKey, source: 'manual' | 'ai', data?: Record<string, string>) {
    skipSave.current = source === 'manual';
    setPostId(newId());
    setPostSource(source);
    setPostAuthor(userEmail);
    setDownloads(0);
    setPostProject(null);
    imgsRef.current.photo = null;
    setHasPhoto(false);
    setPhotoUrl(null);
    setSaveState('idle');
    setCaptionOverride(null);
    setCapErr('');
    setS({
      tpl,
      size: 'square',
      theme: 'dark',
      hatch: true,
      data: data || { ...TEMPLATES[tpl].defaults },
      badges: [],
      photoShade: 0.62,
      brands: [],
    });
  }
  function npCustom() {
    startPost(npTpl, 'manual');
    setNewPostOpen(false);
  }
  function npSmart() {
    startPost(npTpl, 'manual');
    setNewPostOpen(false);
    setGenTpl(npTpl);
    setGenOpen(true);
  }
  function buildProjectTopic(p: Record<string, string>) {
    const bits: string[] = [];
    if (p.location) bits.push(`in ${p.location}`);
    if (p.system_size) bits.push(`a ${p.system_size} system`);
    const panel = [
      p.panel_count ? `${p.panel_count} ×` : '',
      p.panel_wattage,
      p.panel_manufacturer,
      p.panel_model ? `(${p.panel_model})` : '',
    ]
      .filter(Boolean)
      .join(' ');
    if (panel) bits.push(`${panel} panels`);
    if (p.inverter_brand)
      bits.push(`${p.inverter_brand}${p.inverter_model ? ' ' + p.inverter_model : ''} inverter`);
    if (p.battery_brand)
      bits.push(`${p.battery_total ? p.battery_total + ' of ' : ''}${p.battery_brand} battery storage`);
    if (p.annual_generation) bits.push(`generating around ${p.annual_generation} a year`);
    if (p.annual_savings) bits.push(`saving about ${p.annual_savings} a year`);
    return `A REAL, completed Heliaxis installation: ${bits.join(', ')}.${
      p.notes ? ' Notes: ' + p.notes + '.' : ''
    } Write a ${TEMPLATES[npTpl].name} post celebrating this specific real install. These figures are verified — use them exactly and do not invent any others.`;
  }
  async function npFromProject(p: Record<string, string>) {
    setNpBusy(true);
    try {
      const { data: imgs } = await supabase
        .from('project_images')
        .select('data_url')
        .eq('project_id', p.id)
        .limit(1);
      const t = TEMPLATES[npTpl];
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tplName: t.name,
          tplDesc: t.desc,
          fields: t.fields,
          topic: buildProjectTopic(p),
          tone: 'Confident & plain-spoken (house style)',
          recent: history.slice(0, 25).map((h) => h.headline),
        }),
      });
      const json = await res.json();
      setNpBusy(false);
      if (!res.ok || json.error) {
        alert(json.error || 'Generation failed — try again.');
        return;
      }
      const next: Record<string, string> = { ...TEMPLATES[npTpl].defaults };
      for (const f of t.fields) if (json.fields?.[f]) next[f] = json.fields[f];
      if (!next.footer) next.footer = 'heliaxis.co.uk · 01633 965205';
      startPost(npTpl, 'ai', next);
      setPostProject({ id: p.id, name: p.name || p.location || 'Project' });
      const url = imgs && imgs[0] ? (imgs[0] as { data_url: string }).data_url : null;
      if (url) selectImageUrl(url);
      setNewPostOpen(false);
      setNpMode('choose');
      // write a distinct caption (not a copy of the on-image text)
      setCapBusy(true);
      try {
        const caption = await makeCaption(npTpl, next, 'Confident & plain-spoken (house style)');
        setCaptionOverride(caption);
      } catch {
        /* leave the default caption if the AI caption fails */
      } finally {
        setCapBusy(false);
      }
    } catch {
      setNpBusy(false);
      alert('Network error — please try again.');
    }
  }

  async function suggestPostTopics() {
    setGenSuggestBusy(true);
    try {
      const res = await fetch('/api/suggest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: `${TEMPLATES[genTpl].name} post`,
          platform: 'Instagram',
          context: genTopic,
        }),
      });
      const j = await res.json();
      setGenSuggestBusy(false);
      if (res.ok && !j.error) setGenSuggest(j.suggestions || []);
    } catch {
      setGenSuggestBusy(false);
    }
  }

  async function runGenerate(topicArg?: string) {
    const topic = (topicArg ?? genTopic).trim();
    setGenErr(false);
    if (!topic) {
      setGenErr(true);
      setGenStatus('Add a topic or angle first.');
      return;
    }
    setBusy(true);
    setGenStatus('✦ Writing your post…');
    const t = TEMPLATES[genTpl];
    const recent = history.slice(0, 25).map((h) => h.headline);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tplName: t.name,
          tplDesc: t.desc,
          fields: t.fields,
          topic,
          tone: genTone,
          recent,
        }),
      });
      const json = await res.json();
      setBusy(false);
      if (!res.ok || json.error) {
        setGenErr(true);
        setGenStatus(json.error || 'Generation failed. Try again.');
        return;
      }
      const obj = json.fields || {};
      const next: Record<string, string> = { ...TEMPLATES[genTpl].defaults };
      for (const f of TEMPLATES[genTpl].fields) if (obj[f]) next[f] = obj[f];
      if (!next.footer) next.footer = 'heliaxis.co.uk · 01633 965205';
      const newState: PostState = { ...S, tpl: genTpl, data: next };
      // start a fresh saved record for the generated post; autosave persists it
      skipSave.current = false;
      setPostId(newId());
      setPostSource('ai');
      setPostAuthor(userEmail);
      setDownloads(0);
      setCaptionOverride(null);
      setCapErr('');
      setS(newState);
      setGenOpen(false);
      setGenTopic('');
    } catch (err) {
      setBusy(false);
      setGenErr(true);
      setGenStatus('Network error — please try again.');
    }
  }

  function loadHistoryRow(row: HistoryRow) {
    skipSave.current = true;
    setPostId(row.id);
    setPostSource((row.source as 'manual' | 'ai') || 'manual');
    setSaveState('saved');
    setCaptionOverride(null);
    setCapErr('');
    const raw = { ...row.data } as Record<string, string>;
    let badges: Badge[] = [];
    try {
      badges = raw.__badges ? JSON.parse(raw.__badges) : [];
    } catch {
      badges = [];
    }
    let brands: string[] = [];
    try {
      brands = raw.__brands ? JSON.parse(raw.__brands) : [];
    } catch {
      brands = [];
    }
    let offsets: Record<string, { dx: number; dy: number }> = {};
    try {
      offsets = raw.__offsets ? JSON.parse(raw.__offsets) : {};
    } catch {
      offsets = {};
    }
    setPostAuthor(raw.__author || '');
    setDownloads(Number(raw.__downloads) || 0);
    setPostProject(raw.__projectId ? { id: raw.__projectId, name: raw.__project || 'Project' } : null);
    imgsRef.current.photo = null;
    setHasPhoto(false);
    setPhotoUrl(null);
    // restore the saved background photo (fetched lazily, not in the list query)
    supabase
      .from('posts')
      .select('photo')
      .eq('id', row.id)
      .single()
      .then(({ data }) => {
        const url = (data as { photo?: string } | null)?.photo;
        if (url) {
          skipSave.current = true;
          selectImageUrl(url);
        }
      });
    delete raw.__badges;
    delete raw.__brands;
    delete raw.__author;
    delete raw.__downloads;
    delete raw.__project;
    delete raw.__projectId;
    delete raw.__offsets;
    setS({
      tpl: row.tpl as TemplateKey,
      size: (row.size as SizeKey) || 'square',
      theme: (row.theme as ThemeKey) || 'dark',
      hatch: row.hatch !== false,
      data: raw,
      badges,
      photoShade: 0.62,
      brands,
      offsets,
    });
    setHistOpen(false);
  }

  // render a history row to an image for the hover preview (no stored photo)
  function renderRowToDataURL(row: HistoryRow): string | null {
    try {
      const data = { ...row.data } as Record<string, string>;
      let badges: Badge[] = [];
      let brands: string[] = [];
      try {
        badges = data.__badges ? JSON.parse(data.__badges) : [];
      } catch {
        badges = [];
      }
      try {
        brands = data.__brands ? JSON.parse(data.__brands) : [];
      } catch {
        brands = [];
      }
      let offsets: Record<string, { dx: number; dy: number }> = {};
      try {
        offsets = data.__offsets ? JSON.parse(data.__offsets) : {};
      } catch {
        offsets = {};
      }
      delete data.__badges;
      delete data.__brands;
      delete data.__author;
      delete data.__downloads;
      delete data.__project;
      delete data.__projectId;
      delete data.__offsets;
      const state: PostState = {
        tpl: row.tpl as TemplateKey,
        size: (row.size as SizeKey) || 'square',
        theme: (row.theme as ThemeKey) || 'dark',
        hatch: row.hatch !== false,
        data,
        badges,
        brands,
        photoShade: 0.62,
        offsets,
      };
      const brandImgs: HTMLImageElement[] = [];
      for (const id of brands) {
        let im = brandCache.current[id];
        if (!im) {
          const logo = brandLogos.find((b) => b.id === id);
          if (logo) {
            im = new Image();
            im.src = logo.data_url;
            brandCache.current[id] = im;
          }
        }
        if (im) brandImgs.push(im);
      }
      const off = document.createElement('canvas');
      renderPost(
        off,
        state,
        { ...imgsRef.current, photo: null, brands: brandImgs },
        famRef.current,
        brandRef.current
      );
      return off.toDataURL('image/png');
    } catch {
      return null;
    }
  }

  async function clearHistory() {
    if (!confirm('Clear all saved post history? This cannot be undone.')) return;
    await supabase.from('posts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    loadHistory();
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  async function saveEmail() {
    setEmailErr(false);
    setEmailMsg('');
    const email = emailDraft.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setEmailErr(true);
      setEmailMsg('Enter a valid email address.');
      return;
    }
    setEmailBusy(true);
    try {
      const res = await fetch('/api/account/email', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      setEmailBusy(false);
      if (!res.ok || json.error) {
        setEmailErr(true);
        setEmailMsg(json.error || 'Could not update email.');
        return;
      }
      setEmailMsg('Email updated.');
      router.refresh();
      setTimeout(() => setEmailOpen(false), 900);
    } catch {
      setEmailBusy(false);
      setEmailErr(true);
      setEmailMsg('Network error — please try again.');
    }
  }

  async function loadUsers() {
    setUsersBusy(true);
    setUsersMsg('');
    try {
      const res = await fetch('/api/admin/users');
      const json = await res.json();
      setUsersBusy(false);
      if (!res.ok || json.error) {
        setUsersMsg(json.error || 'Could not load users.');
        return;
      }
      setUsers(json.users || []);
    } catch {
      setUsersBusy(false);
      setUsersMsg('Network error — please try again.');
    }
  }

  function openAdmin() {
    setMenuOpen(false);
    setAdminOpen(true);
    loadUsers();
  }

  async function deleteUser(id: string, email: string) {
    if (!confirm(`Delete ${email}? This permanently removes their login and cannot be undone.`))
      return;
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) {
        setUsersMsg(json.error || 'Could not delete user.');
        return;
      }
      setUsers((list) => list.filter((u) => u.id !== id));
    } catch {
      setUsersMsg('Network error — please try again.');
    }
  }

  function fmtDate(iso: string | null) {
    if (!iso) return 'never';
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: '2-digit',
    });
  }

  const tpl = TEMPLATES[S.tpl];
  const caption = captionOverride ?? tpl.caption(S.data);

  return (
    <div className={styles.app} data-mtab={mobileTab}>
      {/* hidden icon sprite for <use> references */}
      <div style={{ display: 'none' }} aria-hidden dangerouslySetInnerHTML={{ __html: ICON_SPRITE }} />
      <div className={styles.bar}>
        <div className={styles.lt}>
          <img src="/heliaxis-logo-light.png" alt="Heliaxis" />
          <span className={styles.tag}>Post Studio</span>
        </div>
        <div className={styles.rt}>
          <span
            className={styles.savebadge}
            data-state={saveState}
            title={saveState === 'error' ? saveMsg : undefined}
          >
            {saveState === 'saving'
              ? 'Saving…'
              : saveState === 'saved'
                ? '✓ Saved'
                : saveState === 'error'
                  ? 'Save failed'
                  : 'Autosave on'}
          </span>
          <a className={styles.btn} href="/reel">
            Reels
          </a>
          <button
            className={styles.btn}
            onClick={startTour}
            title="Take the interactive tour"
            aria-label="Take the interactive tour"
          >
            ? Guide
          </button>
          <button className={styles.btn} data-tour="history" onClick={() => setHistOpen(true)}>
            History
          </button>
          <button className={styles.btn} data-tour="generate" onClick={() => setGenOpen(true)}>
            <Spark size={12} /> Generate
          </button>
          <button className={styles.btn} data-tour="new-post" onClick={openNewPost}>
            + New Post
          </button>
          <button className={styles.btn} onClick={() => setSaveModalOpen(true)}>
            Save
          </button>
          <button className={`${styles.btn} ${styles.solar}`} onClick={download}>
            Download PNG
          </button>
          <div className={styles.profile}>
            <button
              className={styles.avatar}
              data-tour="account"
              onClick={() => setMenuOpen((o) => !o)}
              title={userEmail}
              aria-label="Account menu"
            >
              {(userEmail[0] || '?').toUpperCase()}
            </button>
            {menuOpen && (
              <>
                <div className={styles.menuback} onClick={() => setMenuOpen(false)} />
                <div className={styles.menu}>
                  <div className={styles.menuhead}>
                    <div className={styles.menuemail}>{userEmail}</div>
                    <div className={styles.menurole}>{isAdmin ? 'Administrator' : 'Member'}</div>
                  </div>
                  <button
                    className={styles.menuitem}
                    onClick={() => {
                      setMenuOpen(false);
                      setEmailDraft(userEmail);
                      setEmailMsg('');
                      setEmailErr(false);
                      setEmailOpen(true);
                    }}
                  >
                    Edit email
                  </button>
                  <button className={styles.menuitem} onClick={openMyBrand}>
                    My Brand
                  </button>
                  <button className={styles.menuitem} onClick={openBrand}>
                    Manufacturer logos
                  </button>
                  <button
                    className={styles.menuitem}
                    onClick={() => {
                      setMenuOpen(false);
                      openImages();
                    }}
                  >
                    Image library
                  </button>
                  <button
                    className={styles.menuitem}
                    onClick={() => {
                      setMenuOpen(false);
                      setProjectsOpen(true);
                    }}
                  >
                    Projects
                  </button>
                  {isAdmin && (
                    <button className={styles.menuitem} onClick={openAdmin}>
                      Manage users
                    </button>
                  )}
                  <button
                    className={`${styles.menuitem} ${styles.menusignout}`}
                    onClick={signOut}
                  >
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* LEFT */}
      <div className={styles.panel}>
        <div className={styles.ph}>
          <Spark size={11} /> Template
        </div>
        <select
          className={styles.tplSelect}
          data-tour="template"
          value={S.tpl}
          onChange={(e) => setTpl(e.target.value as TemplateKey)}
        >
          {(Object.keys(TEMPLATES) as TemplateKey[]).map((k) => (
            <option key={k} value={k}>
              {TEMPLATES[k].name} — {TEMPLATES[k].desc}
            </option>
          ))}
        </select>

        <div className={styles.ph}>
          <Spark size={11} /> Size
        </div>
        <div className={`${styles.seg} ${styles.sizes}`} data-tour="size">
          {(Object.keys(SIZES) as SizeKey[]).map((k) => (
            <button
              key={k}
              className={k === S.size ? styles.on : ''}
              onClick={() => setS((s) => ({ ...s, size: k }))}
            >
              <b>{SIZES[k].label}</b>
              <i>{SIZES[k].note}</i>
            </button>
          ))}
        </div>
        <div className={styles.hint}>{SIZES[S.size].use}</div>

        <div className={styles.ph}>
          <Spark size={11} /> Theme
        </div>
        <div className={styles.seg} data-tour="theme">
          {(Object.keys(THEMES) as ThemeKey[]).map((k) => (
            <button
              key={k}
              className={k === S.theme ? styles.on : ''}
              onClick={() => setS((s) => ({ ...s, theme: k }))}
            >
              {THEMES[k]}
            </button>
          ))}
        </div>

        <div className={styles.ph}>
          <Spark size={11} /> Texture
        </div>
        <div className={styles.seg}>
          <button
            className={S.hatch ? styles.on : ''}
            onClick={() => setS((s) => ({ ...s, hatch: true }))}
          >
            Cross-hatch on
          </button>
          <button
            className={!S.hatch ? styles.on : ''}
            onClick={() => setS((s) => ({ ...s, hatch: false }))}
          >
            Off
          </button>
        </div>

        <div className={styles.ph}>
          <Spark size={11} /> Layout
        </div>
        <div className={styles.hint}>
          Drag any text on the post to reposition it. Click to edit, double-click a moved item to
          snap it back.
        </div>
        {S.offsets && Object.keys(S.offsets).length > 0 && (
          <button className={styles.mini} onClick={resetOffsets}>
            Reset moved text ({Object.keys(S.offsets).length})
          </button>
        )}

        <div className={styles.ph}>
          <Spark size={11} /> Photo background
        </div>
        {postProject && (
          <button className={`${styles.mini} ${styles.solar}`} onClick={openProjectPhotos}>
            Change photo — {postProject.name}
          </button>
        )}
        <button className={styles.mini} data-tour="photo" onClick={openImages}>
          {postProject ? 'Or choose from library' : 'Select Photo / Image'}
        </button>
        <div className={styles.hint}>
          {postProject
            ? 'This post was built from a project — pick any photo from that install, or use the shared library.'
            : 'Optional. A real install photo lifts engagement far more than a graphic. The overlay and faint grid keep text readable and on-brand.'}
        </div>
        <button className={styles.mini} onClick={clearPhoto}>
          Remove photo
        </button>
        {hasPhoto && (
          <div className={styles.fld} style={{ marginTop: 12 }}>
            <label>Image darkening — lower is brighter</label>
            <input
              type="range"
              min={0}
              max={90}
              value={Math.round((S.photoShade ?? 0.62) * 100)}
              onChange={(e) =>
                setS((s) => ({ ...s, photoShade: Number(e.target.value) / 100 }))
              }
              style={{ width: '100%' }}
            />
          </div>
        )}

        <div className={styles.ph}>
          <Spark size={11} /> Accreditations
        </div>
        {(S.badges || []).length > 0 && (
          <div className={styles.badgeRow}>
            {(S.badges || []).map((b, i) => (
              <span className={styles.badgeChip} key={i}>
                <svg className={styles.badgeIco} aria-hidden>
                  <use href={`#${b.icon}`} />
                </svg>
                {b.label || prettifyIcon(b.icon)}
                <button
                  className={styles.badgeX}
                  onClick={() => removeBadge(i)}
                  aria-label="Remove badge"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <button className={styles.mini} data-tour="badges" onClick={openIconBank}>
          + Add badge / icon
        </button>
        <div className={styles.hint}>Small badges under the content — MCS, TrustMark, 0% VAT.</div>

        <div className={styles.ph}>
          <Spark size={11} /> Trusted installers
        </div>
        {(S.brands || []).length > 0 && (
          <div className={styles.brandGrid}>
            {(S.brands || []).map((id) => {
              const l = brandLogos.find((b) => b.id === id);
              if (!l) return null;
              return (
                <span className={`${styles.brandChip} ${styles.on}`} key={id}>
                  <span className={styles.brandPick}>
                    <img src={l.data_url} alt={l.name} loading="lazy" decoding="async" />
                    <span>{l.name || 'Logo'}</span>
                  </span>
                  <button
                    className={styles.brandX}
                    onClick={() => toggleBrand(id)}
                    aria-label="Remove from post"
                    title="Remove from post"
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        )}
        <button className={styles.mini} onClick={openBrand}>
          Select Manufacturer logo
        </button>
        <div className={styles.hint}>Shown bottom-right under &ldquo;Trusted installers of&rdquo;.</div>
      </div>

      {/* CENTRE */}
      <div className={styles.stage}>
        <div className={styles.canvaswrap} data-tour="canvas">
          <canvas
            ref={canvasRef}
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={onCanvasPointerUp}
            onDoubleClick={onCanvasDoubleClick}
            style={{ touchAction: 'none' }}
          />
          {edit &&
            (edit.multiline ? (
              <textarea
                ref={editRef as React.RefObject<HTMLTextAreaElement>}
                className={styles.canvasEdit}
                style={{
                  left: edit.left,
                  top: edit.top,
                  width: edit.width,
                  height: edit.height,
                  fontSize: edit.fontPx,
                  fontFamily: edit.display ? 'var(--font-ezra), sans-serif' : 'var(--font-body), sans-serif',
                }}
                value={editVal}
                onChange={(e) => {
                  setEditVal(e.target.value);
                  setField(edit.f, e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setEdit(null);
                  }
                }}
                onBlur={() => setEdit(null)}
              />
            ) : (
              <input
                ref={editRef as React.RefObject<HTMLInputElement>}
                className={styles.canvasEdit}
                style={{
                  left: edit.left,
                  top: edit.top,
                  width: edit.width,
                  height: edit.height,
                  fontSize: edit.fontPx,
                  fontFamily: edit.display ? 'var(--font-ezra), sans-serif' : 'var(--font-body), sans-serif',
                }}
                value={editVal}
                onChange={(e) => {
                  setEditVal(e.target.value);
                  setField(edit.f, e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' || e.key === 'Enter') {
                    e.preventDefault();
                    setEdit(null);
                  }
                }}
                onBlur={() => setEdit(null)}
              />
            ))}
        </div>
        <div className={styles.stagemeta}>
          {SIZES[S.size].note} · {tpl.name} · {THEMES[S.theme]}
        </div>
      </div>

      {/* RIGHT */}
      <div className={`${styles.panel} ${styles.right}`} data-tour="content">
        <div className={styles.ph}>
          <Spark size={11} /> Content
        </div>
        {tpl.fields.map((k) => {
          const big = k === 'sub' || k === 'quote' || k === 'headline' || k.startsWith('item');
          return (
            <div className={styles.fld} key={k}>
              <label>{FIELD_LABELS[k]}</label>
              {big ? (
                <textarea
                  data-field={k}
                  value={S.data[k] || ''}
                  onChange={(e) => setField(k, e.target.value)}
                />
              ) : (
                <input
                  type="text"
                  data-field={k}
                  value={S.data[k] || ''}
                  onChange={(e) => setField(k, e.target.value)}
                />
              )}
            </div>
          );
        })}

        <div className={`${styles.ph} ${styles.phbetween}`} data-tour="caption">
          <span className={styles.phlabel}>
            <Spark size={11} /> Suggested caption
          </span>
          <button className={styles.phbtn} onClick={genCaption} disabled={capBusy}>
            {capBusy ? 'Writing…' : '✦ Generate'}
          </button>
        </div>
        <div className={styles.cap}>{caption}</div>
        {capErr && <div className={styles.saveerr}>{capErr}</div>}
        <div className={styles.tags}>
          {tpl.tags.map((t) => (
            <span className={styles.tagC} key={t}>
              {t}
            </span>
          ))}
        </div>
        <button
          className={styles.mini}
          onClick={() =>
            navigator.clipboard?.writeText(
              captionOverride ? caption : caption + '\n\n' + tpl.tags.join(' ')
            )
          }
        >
          Copy caption
        </button>
        <div className={styles.postid} title={`Full post ID: ${postId}`}>
          POST ID · <b>{postId.slice(0, 8)}</b>
        </div>
        {saveState === 'error' && <div className={styles.saveerr}>Save failed — {saveMsg}</div>}
        <div className={styles.note}>
          <b>Before posting:</b> any savings, payback or grant figure must be one you can evidence.
          Add your assumptions and a date where it matters.
        </div>
      </div>

      {/* GENERATE MODAL */}
      {genOpen && (
        <div className={styles.modal} onClick={() => setGenOpen(false)}>
          <div className={styles.modalbox} onClick={(e) => e.stopPropagation()}>
            <button className={styles.mclose} onClick={() => setGenOpen(false)}>
              ×
            </button>
            <h2 className={styles.mtitle}>
              <Spark size={16} /> Generate a post with AI
            </h2>
            <p className={styles.msub}>
              Choose a template and describe the post. The AI writes on-brand copy, checks it
              against your shared history so you never repeat, and drops it onto the canvas.
            </p>
            <button className={styles.mini} onClick={openIdeas}>
              ✦ Not sure what to post? Get ideas
            </button>
            <div className={styles.fld}>
              <label>Template</label>
              <select value={genTpl} onChange={(e) => setGenTpl(e.target.value as TemplateKey)}>
                {(Object.keys(TEMPLATES) as TemplateKey[]).map((k) => (
                  <option key={k} value={k}>
                    {TEMPLATES[k].name} — {TEMPLATES[k].desc}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.fld}>
              <label>Topic / angle</label>
              <textarea
                value={genTopic}
                onChange={(e) => setGenTopic(e.target.value)}
                placeholder="e.g. New battery install in Penarth, customer cut evening grid use by 70%. Or: explain why cheaper quotes often skip MCS certification."
              />
              <button
                className={styles.phbtn}
                style={{ marginTop: 6 }}
                onClick={suggestPostTopics}
                disabled={genSuggestBusy}
              >
                {genSuggestBusy ? 'Thinking…' : '✦ Suggest angles'}
              </button>
              {genSuggest.length > 0 && (
                <div className={styles.sugRow}>
                  {genSuggest.map((s, i) => (
                    <button key={i} className={styles.sugChip} onClick={() => setGenTopic(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className={styles.fld}>
              <label>Tone</label>
              <select value={genTone} onChange={(e) => setGenTone(e.target.value)}>
                <option>Confident &amp; plain-spoken (house style)</option>
                <option>Warm &amp; friendly</option>
                <option>Punchy &amp; urgent</option>
                <option>Educational &amp; calm</option>
              </select>
            </div>
            <div className={`${styles.gstatus} ${genErr ? styles.err : ''}`}>{genStatus}</div>
            <div className={styles.mrow}>
              <button
                className={`${styles.btn} ${styles.solar}`}
                onClick={() => runGenerate()}
                disabled={busy}
              >
                {busy ? 'Generating…' : '✦ Generate post'}
              </button>
              <button className={styles.btn} onClick={() => setGenOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HISTORY MODAL */}
      {histOpen && (
        <div className={styles.modal} onClick={() => setHistOpen(false)}>
          <div className={styles.modalbox} onClick={(e) => e.stopPropagation()}>
            <button className={styles.mclose} onClick={() => setHistOpen(false)}>
              ×
            </button>
            <h2 className={styles.mtitle}>
              <Spark size={16} /> Post history
            </h2>
            <p className={styles.msub}>
              Everything your team has generated or saved, newest first. Click any to reload it.
            </p>
            <div className={styles.histlist}>
              {history.length === 0 && (
                <div className={styles.histempty}>
                  No posts yet. Generated and saved posts appear here so nobody repeats one.
                </div>
              )}
              {history.map((row) => {
                const dt = new Date(row.created_at);
                const author = (row.data as Record<string, string>)?.__author || '';
                const dls = Number((row.data as Record<string, string>)?.__downloads) || 0;
                const project = (row.data as Record<string, string>)?.__project || '';
                return (
                  <div
                    className={styles.hitem}
                    key={row.id}
                    onClick={() => loadHistoryRow(row)}
                    onMouseEnter={() => setPreviewUrl(renderRowToDataURL(row))}
                    onMouseLeave={() => setPreviewUrl(null)}
                  >
                    <div className={styles.ht}>
                      {row.headline || TEMPLATES[row.tpl as TemplateKey]?.name || 'Post'}
                    </div>
                    {project && <div className={styles.htag}>▦ Project: {project}</div>}
                    <div className={styles.hm}>
                      {TEMPLATES[row.tpl as TemplateKey]?.name} · {row.theme} ·{' '}
                      {dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}{' '}
                      {dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      {row.source === 'ai' ? ' · ✦ generated' : ''} · {dls} download
                      {dls === 1 ? '' : 's'}
                    </div>
                    {author && <div className={styles.hby}>by {author}</div>}
                    <div className={styles.hd}>
                      {row.data?.sub || row.data?.statlabel || row.data?.quote || ''}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className={styles.mrow}>
              <button className={styles.btn} onClick={clearHistory}>
                Clear all
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IDEAS MODAL */}
      {ideasOpen && (
        <div className={styles.modal} onClick={() => setIdeasOpen(false)}>
          <div className={styles.modalbox} onClick={(e) => e.stopPropagation()}>
            <button className={styles.mclose} onClick={() => setIdeasOpen(false)}>
              ×
            </button>
            <h2 className={styles.mtitle}>
              <Spark size={16} /> Post ideas
            </h2>
            <p className={styles.msub}>
              A few angles you could post about. Select one to generate it, or save it for later.
            </p>
            {savedIdeas.length > 0 && (
              <>
                <div className={styles.libLabel}>Saved for later</div>
                <div className={styles.ideaList}>
                  {savedIdeas.map((i) => (
                    <div className={styles.ideaCard} key={i.id}>
                      <div className={styles.ideaText}>
                        <div className={styles.ideaTitle}>{i.title}</div>
                        {i.brief && <div className={styles.ideaBrief}>{i.brief}</div>}
                      </div>
                      <div className={styles.ideaActions}>
                        <button
                          className={`${styles.btn} ${styles.solar}`}
                          onClick={() => selectIdea(i)}
                        >
                          Select
                        </button>
                        <button className={styles.btn} onClick={() => deleteSavedIdea(i.id)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            <div className={styles.libLabel}>Fresh ideas</div>
            {ideasErr && <div className={styles.saveerr}>{ideasErr}</div>}
            <div className={styles.ideaList}>
              {ideasBusy && <div className={styles.histempty}>Thinking of ideas…</div>}
              {!ideasBusy && ideas.length === 0 && !ideasErr && (
                <div className={styles.histempty}>No ideas yet.</div>
              )}
              {ideas.map((i, idx) => (
                <div className={styles.ideaCard} key={idx}>
                  <div className={styles.ideaText}>
                    <div className={styles.ideaTitle}>{i.title}</div>
                    {i.brief && <div className={styles.ideaBrief}>{i.brief}</div>}
                  </div>
                  <div className={styles.ideaActions}>
                    <button
                      className={`${styles.btn} ${styles.solar}`}
                      onClick={() => selectIdea(i)}
                    >
                      Select
                    </button>
                    <button className={styles.btn} onClick={() => saveIdea(i)}>
                      Save for later
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className={styles.mrow}>
              <button className={styles.btn} onClick={genIdeas} disabled={ideasBusy}>
                {ideasBusy ? 'Thinking…' : '✦ Get 5 more'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ICON BANK MODAL */}
      {iconOpen && (
        <div className={styles.modal} onClick={() => setIconOpen(false)}>
          <div className={styles.modalbox} onClick={(e) => e.stopPropagation()}>
            <button className={styles.mclose} onClick={() => setIconOpen(false)}>
              ×
            </button>
            <h2 className={styles.mtitle}>
              <Spark size={16} /> Icon bank
            </h2>
            <p className={styles.msub}>
              Add as many as you like — presets and library add instantly, or multi-select icons
              from the grid. The panel stays open; hit Done when finished.
            </p>
            {(S.badges || []).length > 0 && (
              <>
                <div className={styles.libLabel}>On this post</div>
                <div className={styles.badgeRow}>
                  {(S.badges || []).map((b, i) => (
                    <span className={styles.badgeChip} key={i}>
                      <svg className={styles.badgeIco} aria-hidden>
                        <use href={`#${b.icon}`} />
                      </svg>
                      {b.label || prettifyIcon(b.icon)}
                      <button
                        className={styles.badgeX}
                        onClick={() => removeBadge(i)}
                        aria-label="Remove badge"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </>
            )}
            <div className={styles.presets}>
              {BADGE_PRESETS.map((p) => (
                <button
                  key={p.label}
                  className={styles.presetBtn}
                  onClick={() => addBadge(p.icon, p.label)}
                >
                  <svg className={styles.badgeIco} aria-hidden>
                    <use href={`#${p.icon}`} />
                  </svg>
                  {p.label}
                </button>
              ))}
            </div>
            {library.length > 0 && (
              <>
                <div className={styles.libLabel}>Your library</div>
                <div className={styles.presets}>
                  {library.map((l) => (
                    <span className={styles.libItem} key={l.id}>
                      <button
                        className={styles.presetBtn}
                        onClick={() => addBadge(l.icon, l.label)}
                      >
                        <svg className={styles.badgeIco} aria-hidden>
                          <use href={`#${l.icon}`} />
                        </svg>
                        {l.label || prettifyIcon(l.icon)}
                      </button>
                      <button
                        className={styles.libBtn}
                        onClick={() => {
                          const nl = window.prompt('Edit label', l.label);
                          if (nl !== null) updateLibrary(l.id, nl);
                        }}
                        aria-label="Edit label"
                        title="Edit label"
                      >
                        ✎
                      </button>
                      <button
                        className={styles.libBtn}
                        onClick={() => deleteFromLibrary(l.id)}
                        aria-label="Remove from library"
                        title="Remove from library"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </>
            )}
            <div className={styles.iconGrid}>
              {ICON_IDS.map((id) => (
                <button
                  key={id}
                  className={`${styles.iconCell} ${picked.includes(id) ? styles.on : ''}`}
                  title={prettifyIcon(id)}
                  onClick={() => togglePick(id)}
                >
                  <svg aria-hidden>
                    <use href={`#${id}`} />
                  </svg>
                </button>
              ))}
            </div>
            <div className={styles.stickyFooter}>
              <div className={styles.fld}>
                <label>
                  Label{' '}
                  {picked.length > 1 ? '(pick one to label; others use their name)' : '(optional)'}
                </label>
                <input
                  type="text"
                  value={pickLabel}
                  onChange={(e) => setPickLabel(e.target.value)}
                  placeholder="e.g. MCS Certified"
                  disabled={picked.length !== 1}
                />
              </div>
              {libMsg && <div className={styles.saveerr}>{libMsg}</div>}
              <div className={styles.mrow}>
                <button
                  className={`${styles.btn} ${styles.solar}`}
                  disabled={!picked.length}
                  onClick={addPickedToPost}
                >
                  {picked.length > 1 ? `Add ${picked.length} to post` : 'Add to post'}
                </button>
                <button className={styles.btn} disabled={!picked.length} onClick={saveToLibrary}>
                  Save to Library
                </button>
                <button className={`${styles.btn} ${styles.solar}`} onClick={() => setIconOpen(false)}>
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* HISTORY HOVER PREVIEW */}
      {histOpen && previewUrl && (
        <div className={styles.previewFloat}>
          <img src={previewUrl} alt="Post preview" />
        </div>
      )}

      {/* CONFIRM DIALOG */}
      {confirmState && (
        <div className={styles.modal} style={{ zIndex: 400 }} onClick={() => setConfirmState(null)}>
          <div className={`${styles.modalbox} ${styles.confirmBox}`} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.mtitle}>Are you sure?</h2>
            <p className={styles.msub}>{confirmState.msg}</p>
            <div className={styles.mrow}>
              <button
                className={styles.dangerBtn}
                onClick={() => {
                  confirmState.onYes();
                  setConfirmState(null);
                }}
              >
                Delete
              </button>
              <button
                className={`${styles.btn} ${styles.solar}`}
                onClick={() => setConfirmState(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BRAND / MANUFACTURER LOGO MODAL */}
      {brandOpen && (
        <div className={styles.modal} onClick={() => setBrandOpen(false)}>
          <div className={styles.modalbox} onClick={(e) => e.stopPropagation()}>
            <button className={styles.mclose} onClick={() => setBrandOpen(false)}>
              ×
            </button>
            <h2 className={styles.mtitle}>
              <Spark size={16} /> Manufacturer logos
            </h2>
            <p className={styles.msub}>
              Upload installer/partner logos, then tap to place selected ones on the post
              (bottom-right, under &ldquo;Trusted installers of&rdquo;). Shared across the team.
            </p>
            <div className={styles.logoGrid}>
              {brandLogos.length === 0 && (
                <div className={styles.histempty}>No logos yet — upload one below.</div>
              )}
              {brandLogos.map((l) => (
                <div
                  className={`${styles.logoCell} ${(S.brands || []).includes(l.id) ? styles.on : ''}`}
                  key={l.id}
                >
                  <button className={styles.logoPick} onClick={() => toggleBrand(l.id)} title={l.name}>
                    <img src={l.data_url} alt={l.name} loading="lazy" decoding="async" />
                    <span>{l.name || 'Logo'}</span>
                  </button>
                  <button
                    className={styles.logoDel}
                    onClick={() => deleteBrandLogo(l.id, l.name)}
                    aria-label="Delete logo"
                    title="Delete from library"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            {brandMsg && <div className={styles.saveerr}>{brandMsg}</div>}
            <div className={styles.hint}>Transparent PNG or SVG works best.</div>
            <div className={styles.mrow}>
              <label className={styles.uploadBtn}>
                Upload logo
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => onBrandFile(e.target.files?.[0])}
                />
              </label>
              <button className={styles.btn} onClick={() => setBrandOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IMAGE LIBRARY MODAL */}
      {imageOpen && (
        <div className={styles.modal} onClick={() => setImageOpen(false)}>
          <div className={styles.modalbox} onClick={(e) => e.stopPropagation()}>
            <button className={styles.mclose} onClick={() => setImageOpen(false)}>
              ×
            </button>
            <h2 className={styles.mtitle}>
              <Spark size={16} /> Image library
            </h2>
            <p className={styles.msub}>
              Pick a background image, or upload a new one (applied instantly and saved to the shared
              library).
            </p>
            <div className={styles.logoGrid}>
              {imageLibrary.length === 0 && (
                <div className={styles.histempty}>No images yet — upload one below.</div>
              )}
              {imageLibrary.map((l) => (
                <div className={styles.logoCell} key={l.id}>
                  <button
                    className={styles.imgPick}
                    onClick={() => {
                      selectImageUrl(l.data_url);
                      setImageOpen(false);
                    }}
                    title={l.description || l.name || 'Use as background'}
                  >
                    <img src={l.data_url} alt={l.name} loading="lazy" decoding="async" />
                  </button>
                  <div className={styles.imgMeta}>
                    <span className={styles.imgName} title={l.name}>
                      {l.name || 'Untitled'}
                    </span>
                    <button
                      className={styles.imgInfo}
                      onClick={() => startEditImage(l)}
                      title="Edit details"
                      aria-label="Edit details"
                    >
                      ⓘ
                    </button>
                  </div>
                  <button
                    className={styles.logoDel}
                    onClick={() => deleteImage(l.id, l.name)}
                    aria-label="Delete image"
                    title="Delete from library"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            {editImage && (
              <div className={styles.detailEditor}>
                <div className={styles.libLabel}>Image details</div>
                <div className={styles.fld}>
                  <label>Name</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="e.g. Penarth 6.4 kWp install"
                  />
                </div>
                <div className={styles.fld}>
                  <label>Notes for the team</label>
                  <textarea
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    placeholder="Location, system size, what's notable, usage rights…"
                  />
                </div>
                <div className={styles.mrow}>
                  <button className={`${styles.btn} ${styles.solar}`} onClick={saveImageDetails}>
                    Save details
                  </button>
                  <button className={styles.btn} onClick={() => setEditImage(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {imageMsg && <div className={styles.saveerr}>{imageMsg}</div>}
            <div className={styles.mrow}>
              <label className={styles.uploadBtn}>
                Upload image(s)
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => onImageFiles(e.target.files)}
                />
              </label>
              <button className={styles.btn} onClick={() => setImageOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SAVE MODAL */}
      {saveModalOpen && (
        <div className={styles.modal} onClick={() => setSaveModalOpen(false)}>
          <div className={styles.modalbox} onClick={(e) => e.stopPropagation()}>
            <button className={styles.mclose} onClick={() => setSaveModalOpen(false)}>
              ×
            </button>
            <h2 className={styles.mtitle}>
              <Spark size={16} /> Save this post
            </h2>
            <p className={styles.msub}>
              Your work autosaves as you edit — choose what to do next.
            </p>
            <div className={styles.savechoices}>
              <button
                className={`${styles.btn} ${styles.solar}`}
                onClick={saveContinue}
                disabled={saveState === 'saving'}
              >
                Save &amp; continue editing
              </button>
              <button
                className={styles.btn}
                onClick={saveAndDownload}
                disabled={saveState === 'saving'}
              >
                Save &amp; download PNG
              </button>
              <button
                className={styles.btn}
                onClick={saveAndNew}
                disabled={saveState === 'saving'}
              >
                Save &amp; create new post
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT EMAIL MODAL */}
      {emailOpen && (
        <div className={styles.modal} onClick={() => setEmailOpen(false)}>
          <div className={styles.modalbox} onClick={(e) => e.stopPropagation()}>
            <button className={styles.mclose} onClick={() => setEmailOpen(false)}>
              ×
            </button>
            <h2 className={styles.mtitle}>
              <Spark size={16} /> Your account
            </h2>
            <p className={styles.msub}>Update the email address you sign in with.</p>
            <div className={styles.fld}>
              <label>Email</label>
              <input
                type="email"
                value={emailDraft}
                onChange={(e) => setEmailDraft(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div className={`${styles.gstatus} ${emailErr ? styles.err : ''}`}>{emailMsg}</div>
            <div className={styles.mrow}>
              <button
                className={`${styles.btn} ${styles.solar}`}
                onClick={saveEmail}
                disabled={emailBusy}
              >
                {emailBusy ? 'Saving…' : 'Save email'}
              </button>
              <button className={styles.btn} onClick={() => setEmailOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MANAGE USERS MODAL (admin) */}
      {adminOpen && isAdmin && (
        <div className={styles.modal} onClick={() => setAdminOpen(false)}>
          <div className={styles.modalbox} onClick={(e) => e.stopPropagation()}>
            <button className={styles.mclose} onClick={() => setAdminOpen(false)}>
              ×
            </button>
            <h2 className={styles.mtitle}>
              <Spark size={16} /> Manage users
            </h2>
            <p className={styles.msub}>
              Everyone with access to Post Studio. Deleting a user permanently removes their login.
            </p>
            {usersMsg && <div className={`${styles.gstatus} ${styles.err}`}>{usersMsg}</div>}
            <div className={styles.userlist}>
              {usersBusy && <div className={styles.histempty}>Loading users…</div>}
              {!usersBusy && users.length === 0 && (
                <div className={styles.histempty}>No users found.</div>
              )}
              {users.map((u) => {
                const isSelf = u.email.toLowerCase() === userEmail.toLowerCase();
                return (
                  <div className={styles.urow} key={u.id}>
                    <div className={styles.uinfo}>
                      <div className={styles.uemail}>
                        {u.email}
                        {isSelf && <span className={styles.ubadge}>you</span>}
                        {!u.confirmed && (
                          <span className={`${styles.ubadge} ${styles.ubadgeMuted}`}>
                            unconfirmed
                          </span>
                        )}
                      </div>
                      <div className={styles.umeta}>
                        Joined {fmtDate(u.created_at)} · last in {fmtDate(u.last_sign_in_at)}
                      </div>
                    </div>
                    <button
                      className={styles.udel}
                      disabled={isSelf}
                      title={isSelf ? 'You cannot delete your own account' : 'Delete user'}
                      onClick={() => deleteUser(u.id, u.email)}
                    >
                      Delete
                    </button>
                  </div>
                );
              })}
            </div>
            <div className={styles.mrow}>
              <button className={styles.btn} onClick={loadUsers} disabled={usersBusy}>
                Refresh
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NEW POST MODAL */}
      {newPostOpen && (
        <div className={styles.modal} onClick={() => setNewPostOpen(false)}>
          <div className={styles.modalbox} onClick={(e) => e.stopPropagation()}>
            <button className={styles.mclose} onClick={() => setNewPostOpen(false)}>
              ×
            </button>
            <h2 className={styles.mtitle}>
              <Spark size={16} /> New post
            </h2>
            <p className={styles.msub}>Pick a template, then choose how to start.</p>
            <div className={styles.fld}>
              <label>Template</label>
              <select value={npTpl} onChange={(e) => setNpTpl(e.target.value as TemplateKey)}>
                {(Object.keys(TEMPLATES) as TemplateKey[]).map((k) => (
                  <option key={k} value={k}>
                    {TEMPLATES[k].name} — {TEMPLATES[k].desc}
                  </option>
                ))}
              </select>
            </div>

            {npMode === 'choose' ? (
              <div className={styles.npChoices}>
                <button className={styles.npCard} onClick={npCustom}>
                  <span className={styles.npIco}>✎</span>
                  <b>Custom</b>
                  <i>Start blank and write it yourself.</i>
                </button>
                <button className={styles.npCard} onClick={npSmart}>
                  <span className={`${styles.npIco} ${styles.npAi}`}>
                    <Spark size={18} /> AI
                  </span>
                  <b>Smart Post</b>
                  <i>The AI writes it from a topic you give.</i>
                </button>
                <button className={styles.npCard} onClick={() => setNpMode('project')}>
                  <span className={styles.npIco}>▦</span>
                  <b>Create from project</b>
                  <i>Turn a real install into a post.</i>
                </button>
              </div>
            ) : (
              <>
                <div className={styles.libLabel}>Choose a project</div>
                {npBusy && (
                  <div className={styles.gstatus}>✦ Writing your post from the project…</div>
                )}
                <div className={styles.histlist}>
                  {npProjects.length === 0 && (
                    <div className={styles.histempty}>
                      No projects yet — add one from the profile menu (Projects).
                    </div>
                  )}
                  {npProjects.map((p) => (
                    <div
                      className={styles.hitem}
                      key={p.id}
                      onClick={() => !npBusy && npFromProject(p)}
                    >
                      <div className={styles.ht}>{p.name || p.location || 'Project'}</div>
                      <div className={styles.hm}>
                        {[p.location, p.system_size].filter(Boolean).join(' · ') || 'No details'}
                      </div>
                    </div>
                  ))}
                </div>
                <div className={styles.mrow}>
                  <button className={styles.btn} onClick={() => setNpMode('choose')} disabled={npBusy}>
                    Back
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* PROJECT PHOTO PICKER (for posts created from a project) */}
      {projPhotoOpen && (
        <div className={styles.modal} onClick={() => setProjPhotoOpen(false)}>
          <div className={styles.modalbox} onClick={(e) => e.stopPropagation()}>
            <button className={styles.mclose} onClick={() => setProjPhotoOpen(false)}>
              ×
            </button>
            <h2 className={styles.mtitle}>
              <Spark size={16} /> {postProject?.name || 'Project'} — photos
            </h2>
            <p className={styles.msub}>
              Choose a photo from this install to use as the background.
            </p>
            <div className={styles.logoGrid}>
              {projPhotosBusy && <div className={styles.histempty}>Loading photos…</div>}
              {!projPhotosBusy && projPhotos.length === 0 && (
                <div className={styles.histempty}>
                  No photos on this project yet — add some in Projects.
                </div>
              )}
              {projPhotos.map((im) => (
                <div className={styles.logoCell} key={im.id}>
                  <button
                    className={styles.imgPick}
                    onClick={() => {
                      selectImageUrl(im.data_url);
                      setProjPhotoOpen(false);
                    }}
                    title={im.name || 'Use as background'}
                  >
                    <img src={im.data_url} alt={im.name} loading="lazy" decoding="async" />
                  </button>
                </div>
              ))}
            </div>
            <div className={styles.mrow}>
              <button className={styles.btn} onClick={() => setProjPhotoOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* INTERACTIVE GUIDE / TOUR */}
      {tourOpen && (
        <GuideTour
          steps={TOUR_STEPS}
          onClose={() => setTourOpen(false)}
          onStep={handleTourStep}
        />
      )}

      {/* WHAT'S NEW MODAL */}
      {whatsNewOpen && (
        <div className={styles.modal} onClick={dismissWhatsNew}>
          <div className={styles.modalbox} onClick={(e) => e.stopPropagation()}>
            <button className={styles.mclose} onClick={dismissWhatsNew}>
              ×
            </button>
            <h2 className={styles.mtitle}>
              <Spark size={16} /> What&rsquo;s new
            </h2>
            <p className={styles.msub}>Here&rsquo;s what&rsquo;s changed since you were last in.</p>
            <div className={styles.guideList}>
              {WHATS_NEW.map((u) => (
                <div className={styles.updateEntry} key={u.version}>
                  <div className={styles.updateHead}>
                    <span className={styles.updateTitle}>{u.title}</span>
                    <span className={styles.updateDate}>{u.date}</span>
                  </div>
                  <ul className={styles.updateItems}>
                    {u.items.map((it, i) => (
                      <li key={i}>{it}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className={styles.mrow}>
              <button
                className={styles.btn}
                onClick={() => {
                  dismissWhatsNew();
                  startTour();
                }}
              >
                ? Take the tour
              </button>
              <button className={`${styles.btn} ${styles.solar}`} onClick={dismissWhatsNew}>
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MY BRAND MODAL */}
      {myBrandOpen && (
        <div className={styles.modal} onClick={() => setMyBrandOpen(false)}>
          <div className={styles.modalbox} onClick={(e) => e.stopPropagation()}>
            <button className={styles.mclose} onClick={() => setMyBrandOpen(false)}>
              ×
            </button>
            <h2 className={styles.mtitle}>
              <Spark size={16} /> My Brand
            </h2>
            <p className={styles.msub}>
              Your logo, colours and fonts — applied to every post. Upload a logo and the accent
              colour is picked from it automatically.
            </p>

            <div className={styles.libLabel}>Logos</div>
            <div className={styles.brandLogoRow}>
              <label className={styles.brandLogoBox}>
                {bkDraft.logo_light ? (
                  <img src={bkDraft.logo_light} alt="Logo for dark posts" />
                ) : (
                  <span>Upload logo<br />(for dark posts)</span>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => onBrandLogoFile('logo_light', e.target.files?.[0])}
                />
              </label>
              <label className={`${styles.brandLogoBox} ${styles.brandLogoLight}`}>
                {bkDraft.logo_dark ? (
                  <img src={bkDraft.logo_dark} alt="Logo for light posts" />
                ) : (
                  <span>Upload logo<br />(for light posts)</span>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => onBrandLogoFile('logo_dark', e.target.files?.[0])}
                />
              </label>
            </div>
            <div className={styles.hint}>
              A light (usually white) logo shows on dark/photo posts; a dark logo shows on light
              posts. Transparent PNG or SVG works best.
            </div>

            <div className={styles.libLabel}>Colours</div>
            <div className={styles.brandColors}>
              {(
                [
                  ['color_accent', 'Accent'],
                  ['color_ink', 'Dark'],
                  ['color_paper', 'Light'],
                ] as [keyof BrandKit, string][]
              ).map(([k, label]) => (
                <div className={styles.brandColor} key={k}>
                  <label>{label}</label>
                  <div className={styles.brandColorRow}>
                    <input
                      type="color"
                      value={(bkDraft[k] as string) || '#000000'}
                      onChange={(e) => setBkDraft((d) => ({ ...d, [k]: e.target.value }))}
                    />
                    <input
                      type="text"
                      value={bkDraft[k] as string}
                      onChange={(e) => setBkDraft((d) => ({ ...d, [k]: e.target.value }))}
                    />
                  </div>
                </div>
              ))}
            </div>
            {(bkDraft.logo_light || bkDraft.logo_dark) && (
              <button className={styles.mini} onClick={reExtractAccent}>
                ✦ Re-pick accent from logo
              </button>
            )}

            <div className={styles.libLabel}>Fonts</div>
            <div className={styles.grid2}>
              <div className={styles.fld}>
                <label>Headings</label>
                <select
                  value={bkDraft.font_heading}
                  onChange={(e) => setBkDraft((d) => ({ ...d, font_heading: e.target.value }))}
                >
                  {HEADING_FONTS.map((f) => (
                    <option key={f.label} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.fld}>
                <label>Body text</label>
                <select
                  value={bkDraft.font_body}
                  onChange={(e) => setBkDraft((d) => ({ ...d, font_body: e.target.value }))}
                >
                  {BODY_FONTS.map((f) => (
                    <option key={f.label} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {brandMsg2 && <div className={styles.note}>{brandMsg2}</div>}
            <div className={styles.mrow}>
              <button className={`${styles.btn} ${styles.solar}`} onClick={saveBrand} disabled={brandBusy}>
                {brandBusy ? 'Saving…' : 'Save brand'}
              </button>
              <button className={styles.btn} onClick={resetBrandToDefault}>
                Reset to Heliaxis
              </button>
              <button className={styles.btn} onClick={() => setMyBrandOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {projectsOpen && (
        <ProjectsModal
          onClose={() => setProjectsOpen(false)}
          onOpenPost={(row) => loadHistoryRow(row as HistoryRow)}
        />
      )}

      {/* mobile bottom bar */}
      <div className={styles.mobileBar}>
        <button
          className={`${styles.mbBtn} ${mobileTab === 'design' ? styles.mbOn : ''}`}
          onClick={() => setMobileTab('design')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M4 6h16M4 12h16M4 18h10" />
          </svg>
          Design
        </button>
        <button
          className={`${styles.mbBtn} ${mobileTab === 'content' ? styles.mbOn : ''}`}
          onClick={() => setMobileTab('content')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M5 4h14v16H5z" />
            <path d="M8 9h8M8 13h5" />
          </svg>
          Content
        </button>
        <button className={styles.mbBtn} onClick={() => setGenOpen(true)}>
          <Spark size={16} />
          Generate
        </button>
        <button className={styles.mbBtn} onClick={download}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 4v11M8 11l4 4 4-4M5 20h14" />
          </svg>
          Download
        </button>
      </div>
    </div>
  );
}
