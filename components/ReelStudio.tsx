'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Spark } from './Spark';
import {
  REEL_SIZES,
  renderReel,
  sceneIndexAt,
  sceneStart,
  totalDuration,
  type ReelSizeKey,
  type Scene,
  type SceneMedia,
  type ReelTheme,
  type ReelAnim,
  type ReelTransition,
  type ReelZone,
} from '@/lib/reelEngine';
import { ICON_SPRITE } from '@/lib/iconSprite';
import { prettifyIcon } from '@/lib/icons';
import styles from './ReelStudio.module.css';

const REEL_BADGE_PRESETS = [
  { icon: 'ic-shield', label: 'MCS Certified' },
  { icon: 'ic-award', label: 'TrustMark' },
  { icon: 'ic-check', label: 'RECC' },
  { icon: 'ic-percent', label: '0% VAT' },
];

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const newScene = (): Scene => ({
  id: uid(),
  bg: null,
  videoUrl: null,
  videoName: '',
  videoStart: 0,
  theme: 'dark',
  eyebrow: 'MCS-CERTIFIED · SOUTH WALES',
  headline: 'Energy that revolves around *you.*',
  sub: 'Solar, battery, heating and EV charging.',
  seconds: 3,
  anim: 'up',
});

const THEMES: ReelTheme[] = ['dark', 'light', 'gold'];
const ANIMS: { k: ReelAnim; label: string }[] = [
  { k: 'up', label: 'Slide up' },
  { k: 'fade', label: 'Fade' },
  { k: 'left', label: 'Slide in' },
];
const SIZE_KEYS = Object.keys(REEL_SIZES) as ReelSizeKey[];
const REEL_TYPES = [
  'Myth-buster',
  'FAQ / Q&A',
  'Grant / funding',
  'Customer proof / stat',
  'Quick tip',
  'Announcement / news',
  'Explainer',
];
const PLATFORMS = ['Instagram', 'TikTok', 'Facebook', 'LinkedIn'];
const CTA_PRESETS = ['Get a free survey', 'Book your survey', 'Message us today', 'Try our estimator', 'Learn more'];
const TRANSITIONS: { k: ReelTransition; label: string }[] = [
  { k: 'fade', label: 'Cross-fade' },
  { k: 'slide', label: 'Slide' },
];

export default function ReelStudio({ userEmail }: { userEmail: string }) {
  const supabase = createClient();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const famRef = useRef({ display: 'sans-serif', body: 'sans-serif', mono: 'monospace' });
  const imgCache = useRef<Record<string, HTMLImageElement>>({});
  const videoCache = useRef<Record<string, HTMLVideoElement>>({});

  const [scenes, setScenes] = useState<Scene[]>([newScene()]);
  const [sel, setSel] = useState(0);
  const [size, setSize] = useState<ReelSizeKey>('9:16');
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [images, setImages] = useState<{ id: string; name: string; data_url: string }[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioName, setAudioName] = useState('');
  const [audioAttribution, setAudioAttribution] = useState('');
  const [musicOpen, setMusicOpen] = useState(false);
  const [musicQ, setMusicQ] = useState('');
  const [musicResults, setMusicResults] = useState<
    { id: string; name: string; artist: string; duration: number; audio: string; license: string }[]
  >([]);
  const [musicBusy, setMusicBusy] = useState(false);
  const [musicErr, setMusicErr] = useState('');
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const [exporting, setExporting] = useState(false);
  const [, force] = useState(0); // re-render when video metadata loads
  const [genOpen, setGenOpen] = useState(false);
  const [genType, setGenType] = useState('Myth-buster');
  const [genPlatform, setGenPlatform] = useState('Instagram');
  const [genContext, setGenContext] = useState('');
  const [genUrl, setGenUrl] = useState('');
  const [genBusy, setGenBusy] = useState(false);
  const [genErr, setGenErr] = useState('');
  const [genCaption, setGenCaption] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [ctaLibrary, setCtaLibrary] = useState<{ id: string; label: string }[]>([]);
  const [reels, setReels] = useState<
    { id: string; name: string; size: string; updated_at: string }[]
  >([]);
  const [reelsOpen, setReelsOpen] = useState(false);
  const [reelId, setReelId] = useState<string | null>(null);
  const [reelName, setReelName] = useState('Untitled reel');
  const [saveMsg, setSaveMsg] = useState('');
  const [badgeLibrary, setBadgeLibrary] = useState<{ id: string; icon: string; label: string }[]>(
    []
  );

  const zonesRef = useRef<ReelZone[]>([]);
  const scenesRef = useRef(scenes);
  const sizeRef = useRef(size);
  const playheadRef = useRef(0);
  const playingRef = useRef(false);
  const startRef = useRef(0);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    scenesRef.current = scenes;
  }, [scenes]);
  useEffect(() => {
    sizeRef.current = size;
    drawAt(playheadRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  function imgFor(url: string) {
    let im = imgCache.current[url];
    if (!im) {
      im = new Image();
      im.onload = () => drawAt(playheadRef.current);
      im.src = url;
      imgCache.current[url] = im;
    }
    return im;
  }
  function videoFor(url: string) {
    let v = videoCache.current[url];
    if (!v) {
      v = document.createElement('video');
      v.src = url;
      v.muted = true;
      v.playsInline = true;
      v.preload = 'auto';
      v.onloadeddata = () => {
        force((n) => n + 1);
        drawAt(playheadRef.current);
      };
      videoCache.current[url] = v;
    }
    return v;
  }
  function mediaFor(s: Scene): SceneMedia | null {
    if (s.videoUrl) {
      const v = videoFor(s.videoUrl);
      if (v.videoWidth && v.videoHeight)
        return { src: v, w: v.videoWidth, h: v.videoHeight, kenBurns: false };
      return null;
    }
    if (s.bg) {
      const im = imgFor(s.bg);
      if (im.complete && im.naturalWidth)
        return { src: im, w: im.naturalWidth, h: im.naturalHeight, kenBurns: true };
      return null;
    }
    return null;
  }

  function drawAt(t: number, animate = false) {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const dim = REEL_SIZES[sizeRef.current];
    if (c.width !== dim.w || c.height !== dim.h) {
      c.width = dim.w;
      c.height = dim.h;
    }
    zonesRef.current = renderReel(
      ctx,
      scenesRef.current,
      t,
      mediaFor,
      famRef.current,
      dim.w,
      dim.h,
      !animate // settled when not animating (editing/scrubbing) so text/CTA show fully
    );
  }

  function selectScene(i: number) {
    setSel(i);
    stop();
    setHead(sceneStart(scenesRef.current, i) + 0.001);
  }

  function onCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const cv = canvasRef.current;
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    const mx = ((e.clientX - r.left) * cv.width) / r.width;
    const my = ((e.clientY - r.top) * cv.height) / r.height;
    const { i } = sceneIndexAt(scenesRef.current, playheadRef.current);
    if (i !== sel) setSel(i);
    for (let k = zonesRef.current.length - 1; k >= 0; k--) {
      const z = zonesRef.current[k];
      if (mx >= z.x && mx <= z.x + z.w && my >= z.y && my <= z.y + z.h) {
        const el = document.querySelector<HTMLElement>(`[data-rfield="${z.f}"]`);
        if (el) {
          el.focus();
          el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
        return;
      }
    }
  }
  function onCanvasMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const cv = canvasRef.current;
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    const mx = ((e.clientX - r.left) * cv.width) / r.width;
    const my = ((e.clientY - r.top) * cv.height) / r.height;
    const hit = zonesRef.current.some(
      (z) => mx >= z.x && mx <= z.x + z.w && my >= z.y && my <= z.y + z.h
    );
    cv.style.cursor = hit ? 'pointer' : 'default';
  }

  function syncVideos(t: number, isPlaying: boolean) {
    const arr = scenesRef.current;
    const { i, lt } = sceneIndexAt(arr, t);
    const active = arr[i];
    const activeUrl = active?.videoUrl || null;
    for (const url in videoCache.current) {
      if (url !== activeUrl) videoCache.current[url].pause();
    }
    if (activeUrl && active) {
      const v = videoCache.current[activeUrl];
      if (v) {
        const target = (active.videoStart || 0) + Math.max(0, lt);
        if (isPlaying) {
          if (v.paused) {
            try {
              v.currentTime = target;
            } catch {
              /* not seekable yet */
            }
            v.play().catch(() => {});
          } else if (Math.abs(v.currentTime - target) > 0.35) {
            try {
              v.currentTime = target;
            } catch {
              /* ignore */
            }
          }
        } else {
          if (!v.paused) v.pause();
          if (Math.abs(v.currentTime - target) > 0.05) {
            try {
              v.currentTime = target;
            } catch {
              /* ignore */
            }
          }
        }
      }
    }
  }

  // fonts + persisted draft + image library
  useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    famRef.current = {
      display: cs.getPropertyValue('--font-ezra').trim() || 'sans-serif',
      body: cs.getPropertyValue('--font-body').trim() || 'sans-serif',
      mono: cs.getPropertyValue('--font-mono').trim() || 'monospace',
    };
    try {
      const saved = localStorage.getItem('heliaxis_reel');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed.scenes) && parsed.scenes.length) {
          // videos are in-memory only — drop dead blob URLs on load
          setScenes(
            parsed.scenes.map((s: Scene) => ({ ...s, videoUrl: null, videoName: '', videoStart: 0 }))
          );
          if (parsed.size && REEL_SIZES[parsed.size as ReelSizeKey]) setSize(parsed.size);
        }
      }
    } catch {
      /* ignore */
    }
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => drawAt(playheadRef.current));
    }
    loadImages();
    loadCtas();
    loadReels();
    loadBadges();
    drawAt(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadBadges() {
    const { data } = await supabase
      .from('badge_library')
      .select('id, icon, label')
      .order('created_at', { ascending: true });
    if (data) setBadgeLibrary(data as { id: string; icon: string; label: string }[]);
  }
  function addBadgeToScene(icon: string, label: string) {
    const existing = sc.badges || [];
    if (existing.some((b) => b.icon === icon && b.label.toLowerCase() === label.toLowerCase()))
      return; // already on this scene
    patch(sel, { badges: [...existing, { icon, label }] });
  }
  function removeBadgeFromScene(i: number) {
    patch(sel, { badges: (sc.badges || []).filter((_, k) => k !== i) });
  }

  useEffect(() => {
    try {
      // don't persist blob video URLs (invalid after reload)
      const persist = scenes.map((s) => ({ ...s, videoUrl: null, videoName: '', videoStart: 0 }));
      localStorage.setItem('heliaxis_reel', JSON.stringify({ scenes: persist, size }));
    } catch {
      /* ignore */
    }
    if (!playingRef.current) drawAt(playheadRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenes, size]);

  async function loadImages() {
    const { data } = await supabase
      .from('image_library')
      .select('id, name, data_url')
      .order('created_at', { ascending: false });
    if (data) setImages(data as { id: string; name: string; data_url: string }[]);
  }
  async function loadCtas() {
    const { data } = await supabase
      .from('cta_library')
      .select('id, label')
      .order('created_at', { ascending: true });
    if (data) setCtaLibrary(data as { id: string; label: string }[]);
  }
  async function saveCta() {
    const label = (sc?.cta || '').trim();
    if (!label) return;
    if (ctaLibrary.some((c) => c.label.toLowerCase() === label.toLowerCase())) return;
    const { error } = await supabase.from('cta_library').insert({ label });
    if (!error) loadCtas();
  }
  function deleteCta(id: string) {
    setCtaLibrary((l) => l.filter((c) => c.id !== id));
    supabase.from('cta_library').delete().eq('id', id);
  }

  async function loadReels() {
    const { data } = await supabase
      .from('reels')
      .select('id, name, size, updated_at')
      .order('updated_at', { ascending: false });
    if (data) setReels(data as { id: string; name: string; size: string; updated_at: string }[]);
  }
  function scenesForSave() {
    // strip in-memory video blobs; keep text/bg/cta/etc.
    return scenesRef.current.map((s) => ({ ...s, videoUrl: null, videoName: '', videoStart: 0 }));
  }
  async function saveReel() {
    setSaveMsg('');
    const payload = { name: reelName.trim() || 'Untitled reel', size, scenes: scenesForSave() };
    if (reelId) {
      const { error } = await supabase
        .from('reels')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', reelId);
      if (error) {
        setSaveMsg(error.message);
        return;
      }
    } else {
      const { data, error } = await supabase.from('reels').insert(payload).select('id').single();
      if (error) {
        setSaveMsg(error.message);
        return;
      }
      if (data) setReelId(data.id as string);
    }
    setSaveMsg('Saved ✓');
    loadReels();
    setTimeout(() => setSaveMsg(''), 1500);
  }
  async function loadReel(id: string) {
    const { data } = await supabase
      .from('reels')
      .select('id, name, size, scenes')
      .eq('id', id)
      .single();
    if (data) {
      stop();
      const arr = (data.scenes as Scene[]) || [];
      setScenes(arr.length ? arr : [newScene()]);
      if (data.size && REEL_SIZES[data.size as ReelSizeKey]) setSize(data.size as ReelSizeKey);
      setReelId(data.id as string);
      setReelName((data.name as string) || 'Untitled reel');
      setSel(0);
      playheadRef.current = 0;
      setPlayhead(0);
      setReelsOpen(false);
    }
  }
  function deleteReel(id: string) {
    setReels((r) => r.filter((x) => x.id !== id));
    if (reelId === id) setReelId(null);
    supabase.from('reels').delete().eq('id', id);
  }
  function newReel() {
    stop();
    setScenes([newScene()]);
    setReelId(null);
    setReelName('Untitled reel');
    setSel(0);
    playheadRef.current = 0;
    setPlayhead(0);
    setReelsOpen(false);
  }

  const total = totalDuration(scenes);

  function setHead(t: number) {
    const clamped = Math.max(0, Math.min(total, t));
    playheadRef.current = clamped;
    setPlayhead(clamped);
    syncVideos(clamped, false);
    drawAt(clamped);
  }

  function tick() {
    if (!playingRef.current) return;
    const t = (performance.now() - startRef.current) / 1000;
    if (t >= total) {
      playheadRef.current = total;
      setPlayhead(total);
      drawAt(total);
      stop();
      return;
    }
    playheadRef.current = t;
    setPlayhead(t);
    const { i } = sceneIndexAt(scenesRef.current, t);
    setSel((v) => (v === i ? v : i));
    syncVideos(t, true);
    drawAt(t, true);
    requestAnimationFrame(tick);
  }
  function play() {
    if (!scenes.length) return;
    let from = playheadRef.current;
    if (from >= total - 0.01) from = 0;
    startRef.current = performance.now() - from * 1000;
    playingRef.current = true;
    setPlaying(true);
    if (audioElRef.current && audioUrl) {
      audioElRef.current.currentTime = from;
      audioElRef.current.play().catch(() => {});
    }
    requestAnimationFrame(tick);
  }
  function stop() {
    playingRef.current = false;
    setPlaying(false);
    if (audioElRef.current) audioElRef.current.pause();
    for (const url in videoCache.current) videoCache.current[url].pause();
  }

  // ---- scene ops ----
  function patch(i: number, p: Partial<Scene>) {
    setScenes((s) => s.map((sc, j) => (j === i ? { ...sc, ...p } : sc)));
  }
  function addScene() {
    setScenes((s) => {
      const next = [...s, newScene()];
      setSel(next.length - 1);
      return next;
    });
  }
  function removeScene(i: number) {
    setScenes((s) => (s.length <= 1 ? s : s.filter((_, j) => j !== i)));
    setSel((v) => Math.max(0, v - (i <= v ? 1 : 0)));
  }
  function duplicateScene(i: number) {
    setScenes((s) => [...s.slice(0, i + 1), { ...s[i], id: uid() }, ...s.slice(i + 1)]);
  }
  function move(i: number, dir: -1 | 1) {
    setScenes((s) => {
      const j = i + dir;
      if (j < 0 || j >= s.length) return s;
      const next = [...s];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setSel((v) => (v === i ? i + dir : v));
  }

  function onAudio(file?: File) {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      setAudioUrl(r.result as string);
      setAudioName(file.name);
      setAudioAttribution('');
    };
    r.readAsDataURL(file);
  }
  async function searchMusic() {
    setMusicBusy(true);
    setMusicErr('');
    try {
      const res = await fetch('/api/music?q=' + encodeURIComponent(musicQ));
      const j = await res.json();
      setMusicBusy(false);
      if (!res.ok || j.error) {
        setMusicErr(j.error || 'Search failed.');
        return;
      }
      setMusicResults(j.tracks || []);
    } catch {
      setMusicBusy(false);
      setMusicErr('Network error — please try again.');
    }
  }
  function previewTrack(audio: string) {
    if (!previewRef.current) previewRef.current = new Audio();
    const a = previewRef.current;
    a.src = audio;
    a.currentTime = 0;
    a.play().catch(() => {});
  }
  function stopPreview() {
    if (previewRef.current) previewRef.current.pause();
  }
  async function useTrack(t: { name: string; artist: string; audio: string; license: string }) {
    setMusicErr('');
    try {
      const res = await fetch('/api/music?audio=' + encodeURIComponent(t.audio));
      if (!res.ok) throw new Error('load failed');
      const blob = await res.blob();
      setAudioUrl(URL.createObjectURL(blob));
      setAudioName(`${t.name} — ${t.artist}`);
      setAudioAttribution(
        `Music: “${t.name}” by ${t.artist} (via Jamendo)${t.license ? ' · ' + t.license : ''}`
      );
      stopPreview();
      setMusicOpen(false);
    } catch {
      setMusicErr('Could not load that track — try another.');
    }
  }
  function onSceneVideo(file?: File) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    patch(sel, { videoUrl: url, videoName: file.name, videoStart: 0, bg: null });
  }
  function removeVideo() {
    patch(sel, { videoUrl: null, videoName: '', videoStart: 0 });
  }

  async function suggestAngles() {
    setSuggestBusy(true);
    try {
      const res = await fetch('/api/suggest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: genType, platform: genPlatform, context: genContext }),
      });
      const j = await res.json();
      setSuggestBusy(false);
      if (res.ok && !j.error) setSuggestions(j.suggestions || []);
    } catch {
      setSuggestBusy(false);
    }
  }

  async function runGenerateReel() {
    setGenErr('');
    setGenBusy(true);
    try {
      const res = await fetch('/api/reel', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: genType,
          platform: genPlatform,
          context: genContext,
          referenceUrl: genUrl,
        }),
      });
      const j = await res.json();
      setGenBusy(false);
      if (!res.ok || j.error) {
        setGenErr(j.error || 'Generation failed. Try again.');
        return;
      }
      const mapped: Scene[] = (j.scenes || []).map((s: any) => ({
        id: uid(),
        bg: null,
        videoUrl: null,
        videoName: '',
        videoStart: 0,
        theme: s.theme,
        eyebrow: s.eyebrow,
        headline: s.headline,
        sub: s.sub,
        seconds: s.seconds,
        anim: s.anim,
      }));
      if (mapped.length) {
        stop();
        setScenes(mapped);
        setSel(0);
        playheadRef.current = 0;
        setPlayhead(0);
      }
      setGenCaption(
        ((j.caption || '') + (j.hashtags ? '\n\n' + j.hashtags : '')).trim()
      );
      setGenOpen(false);
    } catch {
      setGenBusy(false);
      setGenErr('Network error — please try again.');
    }
  }

  function pickMime() {
    const cands = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    for (const c of cands) if (MediaRecorder.isTypeSupported(c)) return c;
    return 'video/webm';
  }

  async function exportReel() {
    if (!scenes.length || exporting) return;
    stop();
    setExporting(true);
    try {
      const canvas = canvasRef.current!;
      setHead(0);
      const stream = canvas.captureStream(30);
      let ac: AudioContext | null = null;
      let aEl: HTMLAudioElement | null = null;
      if (audioUrl) {
        ac = new AudioContext();
        aEl = new Audio(audioUrl);
        const srcNode = ac.createMediaElementSource(aEl);
        const dest = ac.createMediaStreamDestination();
        srcNode.connect(dest);
        dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
      }
      const rec = new MediaRecorder(stream, {
        mimeType: pickMime(),
        videoBitsPerSecond: 8_000_000,
      });
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      const stopped = new Promise<void>((res) => {
        rec.onstop = () => res();
      });
      rec.start();
      if (aEl && ac) {
        aEl.currentTime = 0;
        await ac.resume();
        aEl.play().catch(() => {});
      }
      await new Promise<void>((resolve) => {
        const t0 = performance.now();
        const loop = () => {
          const t = (performance.now() - t0) / 1000;
          const tt = Math.min(t, total);
          syncVideos(tt, true);
          drawAt(tt, true);
          if (t >= total) {
            resolve();
            return;
          }
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      });
      rec.stop();
      if (aEl) aEl.pause();
      for (const url in videoCache.current) videoCache.current[url].pause();
      await stopped;
      if (ac) ac.close();
      const blob = new Blob(chunks, { type: 'video/webm' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'heliaxis-reel.webm';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (err) {
      alert('Export failed: ' + (err instanceof Error ? err.message : 'unknown error'));
    }
    setExporting(false);
    setHead(0);
  }

  const sc = scenes[sel] || scenes[0];
  const selVideo = sc.videoUrl ? videoCache.current[sc.videoUrl] : null;
  const selVideoDur = selVideo && selVideo.duration ? selVideo.duration : 30;

  return (
    <div className={styles.app}>
      <div style={{ display: 'none' }} aria-hidden dangerouslySetInnerHTML={{ __html: ICON_SPRITE }} />
      {audioUrl && <audio ref={audioElRef} src={audioUrl} preload="auto" />}
      <div className={styles.bar}>
        <div className={styles.lt}>
          <img src="/heliaxis-logo-light.png" alt="Heliaxis" />
          <span className={styles.tag}>Reel Studio · beta</span>
        </div>
        <div className={styles.rt}>
          {genCaption && (
            <button
              className={styles.btn}
              onClick={() => navigator.clipboard?.writeText(genCaption)}
              title="Copy the generated caption + hashtags"
            >
              Copy caption
            </button>
          )}
          <button className={`${styles.btn} ${styles.solar}`} onClick={() => setGenOpen(true)}>
            <Spark size={12} /> Generate
          </button>
          <button className={styles.upload} onClick={() => setMusicOpen(true)}>
            {audioName ? '♪ ' + audioName.slice(0, 16) : '♪ Music'}
          </button>
          <button
            className={styles.btn}
            onClick={() => {
              loadReels();
              setReelsOpen(true);
            }}
          >
            Reels
          </button>
          <button className={styles.btn} onClick={saveReel}>
            {saveMsg || 'Save'}
          </button>
          <Link className={styles.btn} href="/studio">
            Back to posts
          </Link>
          <button
            className={`${styles.btn} ${styles.solar}`}
            onClick={exportReel}
            disabled={exporting}
          >
            {exporting ? 'Exporting…' : 'Export WebM'}
          </button>
        </div>
      </div>

      {/* LEFT — format + scene list */}
      <div className={styles.panel}>
        <input
          className={styles.nameInput}
          value={reelName}
          onChange={(e) => setReelName(e.target.value)}
          placeholder="Reel name"
        />
        <div className={styles.ph}>
          <Spark size={11} /> Format
        </div>
        <div className={styles.seg} style={{ flexWrap: 'wrap', marginBottom: 16 }}>
          {SIZE_KEYS.map((k) => (
            <button
              key={k}
              className={size === k ? styles.segon : ''}
              onClick={() => setSize(k)}
              title={REEL_SIZES[k].label}
            >
              {k}
            </button>
          ))}
        </div>

        <div className={styles.ph}>
          <Spark size={11} /> Scenes · {total.toFixed(1)}s
        </div>
        {scenes.map((s, i) => (
          <div
            key={s.id}
            className={`${styles.scene} ${i === sel ? styles.on : ''}`}
            onClick={() => selectScene(i)}
          >
            <div className={styles.scnum}>{i + 1}</div>
            <div className={styles.scbody}>
              <b>{s.headline.split('*').join('') || 'Untitled scene'}</b>
              <span>
                {s.seconds}s · {s.theme}
                {s.videoUrl ? ' · video' : s.bg ? ' · photo' : ''}
              </span>
            </div>
            <div className={styles.scops}>
              <button onClick={(e) => (e.stopPropagation(), move(i, -1))} title="Move up">
                ↑
              </button>
              <button onClick={(e) => (e.stopPropagation(), move(i, 1))} title="Move down">
                ↓
              </button>
              <button onClick={(e) => (e.stopPropagation(), duplicateScene(i))} title="Duplicate">
                ⧉
              </button>
              <button
                onClick={(e) => (e.stopPropagation(), removeScene(i))}
                title="Delete"
                className={styles.scdel}
              >
                ×
              </button>
            </div>
          </div>
        ))}
        <button className={styles.mini} onClick={addScene}>
          + Add scene
        </button>
      </div>

      {/* CENTRE — preview */}
      <div className={styles.stage}>
        <div className={styles.canvaswrap}>
          <canvas ref={canvasRef} onClick={onCanvasClick} onMouseMove={onCanvasMove} />
        </div>
        <div className={styles.transport}>
          <button className={`${styles.btn} ${styles.solar}`} onClick={playing ? stop : play}>
            {playing ? '❚❚ Pause' : '▶ Play'}
          </button>
          <input
            type="range"
            min={0}
            max={Math.max(0.1, total)}
            step={0.05}
            value={playhead}
            onChange={(e) => {
              stop();
              setHead(Number(e.target.value));
            }}
            className={styles.scrub}
          />
          <span className={styles.time}>
            {playhead.toFixed(1)} / {total.toFixed(1)}s
          </span>
        </div>
      </div>

      {/* RIGHT — scene editor */}
      <div className={`${styles.panel} ${styles.right}`}>
        <div className={styles.ph}>
          <Spark size={11} /> Scene {sel + 1}
        </div>

        <div className={styles.fld}>
          <label>Theme</label>
          <div className={styles.seg}>
            {THEMES.map((t) => (
              <button
                key={t}
                className={sc.theme === t ? styles.segon : ''}
                onClick={() => patch(sel, { theme: t })}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.fld}>
          <label>Video clip {sc.videoUrl ? '(overrides background)' : ''}</label>
          {sc.videoUrl ? (
            <>
              <div className={styles.videoRow}>
                <span>🎬 {sc.videoName || 'clip'}</span>
                <button onClick={removeVideo}>Remove</button>
              </div>
              <label style={{ marginTop: 8 }}>
                Trim start — {(sc.videoStart || 0).toFixed(1)}s of {selVideoDur.toFixed(1)}s
              </label>
              <input
                type="range"
                min={0}
                max={Math.max(0.1, selVideoDur - 0.1)}
                step={0.1}
                value={sc.videoStart || 0}
                onChange={(e) => patch(sel, { videoStart: Number(e.target.value) })}
                style={{ width: '100%' }}
              />
              <div className={styles.hint}>Plays for the scene duration from this point.</div>
            </>
          ) : (
            <label className={styles.uploadDark}>
              Upload video clip
              <input
                type="file"
                accept="video/*"
                onChange={(e) => onSceneVideo(e.target.files?.[0])}
              />
            </label>
          )}
        </div>

        {!sc.videoUrl && (
          <div className={styles.fld}>
            <label>Background image</label>
            <div className={styles.bgGrid}>
              <button
                className={`${styles.bgCell} ${!sc.bg ? styles.on : ''}`}
                onClick={() => patch(sel, { bg: null })}
                title="No photo (branded gradient)"
              >
                None
              </button>
              {images.map((im) => (
                <button
                  key={im.id}
                  className={`${styles.bgCell} ${sc.bg === im.data_url ? styles.on : ''}`}
                  onClick={() => patch(sel, { bg: im.data_url })}
                  title={im.name}
                >
                  <img src={im.data_url} alt={im.name} />
                </button>
              ))}
            </div>
            <div className={styles.hint}>From your post Image library.</div>
          </div>
        )}

        <div className={styles.fld}>
          <label>Eyebrow</label>
          <input
            data-rfield="eyebrow"
            value={sc.eyebrow}
            onChange={(e) => patch(sel, { eyebrow: e.target.value })}
          />
        </div>
        <div className={styles.fld}>
          <label>Headline — *word* for gold</label>
          <textarea
            data-rfield="headline"
            value={sc.headline}
            onChange={(e) => patch(sel, { headline: e.target.value })}
          />
        </div>
        <div className={styles.fld}>
          <label>Sub</label>
          <textarea
            data-rfield="sub"
            value={sc.sub}
            onChange={(e) => patch(sel, { sub: e.target.value })}
          />
        </div>

        <div className={styles.fld}>
          <label>CTA button (optional)</label>
          <div className={styles.ctaRow}>
            <input
              data-rfield="cta"
              value={sc.cta || ''}
              onChange={(e) => patch(sel, { cta: e.target.value })}
              placeholder="e.g. Get a free survey"
            />
            <button className={styles.miniInline} onClick={saveCta} disabled={!(sc.cta || '').trim()}>
              Save
            </button>
          </div>
          <div className={styles.chips}>
            {CTA_PRESETS.map((c) => (
              <button key={c} className={styles.chip} onClick={() => patch(sel, { cta: c })}>
                {c}
              </button>
            ))}
            {ctaLibrary.map((c) => (
              <span key={c.id} className={styles.chip}>
                <button className={styles.chipMain} onClick={() => patch(sel, { cta: c.label })}>
                  {c.label}
                </button>
                <button className={styles.chipX} onClick={() => deleteCta(c.id)} aria-label="Delete">
                  ×
                </button>
              </span>
            ))}
            {sc.cta ? (
              <button className={styles.chip} onClick={() => patch(sel, { cta: '' })}>
                ✕ no button
              </button>
            ) : null}
          </div>
        </div>

        <div className={styles.fld}>
          <label>Accreditations (optional)</label>
          {(sc.badges || []).length > 0 && (
            <div className={styles.chips} style={{ marginBottom: 6 }}>
              {(sc.badges || []).map((b, i) => (
                <span key={i} className={styles.chip}>
                  <svg className={styles.badgeIco} aria-hidden>
                    <use href={`#${b.icon}`} />
                  </svg>
                  {b.label || prettifyIcon(b.icon)}
                  <button className={styles.chipX} onClick={() => removeBadgeFromScene(i)}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className={styles.chips}>
            {REEL_BADGE_PRESETS.map((p) => (
              <button
                key={p.label}
                className={styles.chip}
                onClick={() => addBadgeToScene(p.icon, p.label)}
              >
                <svg className={styles.badgeIco} aria-hidden>
                  <use href={`#${p.icon}`} />
                </svg>
                {p.label}
              </button>
            ))}
            {badgeLibrary.map((l) => (
              <button
                key={l.id}
                className={styles.chip}
                onClick={() => addBadgeToScene(l.icon, l.label)}
              >
                <svg className={styles.badgeIco} aria-hidden>
                  <use href={`#${l.icon}`} />
                </svg>
                {l.label || prettifyIcon(l.icon)}
              </button>
            ))}
          </div>
          <div className={styles.hint}>
            Small pills above the footer. Build more in the post studio&rsquo;s Icon bank.
          </div>
        </div>

        <div className={styles.fld}>
          <label>Duration — {sc.seconds}s</label>
          <input
            type="range"
            min={1}
            max={10}
            step={0.5}
            value={sc.seconds}
            onChange={(e) => patch(sel, { seconds: Number(e.target.value) })}
            style={{ width: '100%' }}
          />
        </div>
        <div className={styles.fld}>
          <label>Text animation</label>
          <div className={styles.seg}>
            {ANIMS.map((a) => (
              <button
                key={a.k}
                className={sc.anim === a.k ? styles.segon : ''}
                onClick={() => patch(sel, { anim: a.k })}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.fld}>
          <label>Transition into this scene</label>
          <div className={styles.seg}>
            {TRANSITIONS.map((t) => (
              <button
                key={t.k}
                className={(sc.transition || 'fade') === t.k ? styles.segon : ''}
                onClick={() => patch(sel, { transition: t.k })}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.note}>
          <b>Export</b> records in real time — keep the tab focused. Output is WebM. Video clips are
          in-memory only (re-add after a reload); MP4 + saved reels are planned.
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
              <Spark size={16} /> Generate a reel
            </h2>
            <p className={styles.msub}>
              The AI scripts a full multi-scene reel — tuned for the platform&rsquo;s audience and
              attention span. It replaces the current scenes; you then add backgrounds/clips.
            </p>
            <div className={styles.fld}>
              <label>Type</label>
              <select value={genType} onChange={(e) => setGenType(e.target.value)}>
                {REEL_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className={styles.fld}>
              <label>Platform (sets tone: B2C vs B2B, and length)</label>
              <select value={genPlatform} onChange={(e) => setGenPlatform(e.target.value)}>
                {PLATFORMS.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className={styles.fld}>
              <label>Context / angle (optional)</label>
              <textarea
                value={genContext}
                onChange={(e) => setGenContext(e.target.value)}
                placeholder="e.g. Bust the myth that solar doesn't work in Welsh winters. Or: promote our battery install offer."
              />
              <button
                className={styles.miniInline}
                onClick={suggestAngles}
                disabled={suggestBusy}
                style={{ marginTop: 6 }}
              >
                {suggestBusy ? 'Thinking…' : '✦ Suggest angles'}
              </button>
              {suggestions.length > 0 && (
                <div className={styles.chips}>
                  {suggestions.map((s, i) => (
                    <button key={i} className={styles.chip} onClick={() => setGenContext(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {genType.startsWith('Grant') && (
              <div className={styles.fld}>
                <label>Grant / reference URL — the AI reads it for real details</label>
                <input
                  value={genUrl}
                  onChange={(e) => setGenUrl(e.target.value)}
                  placeholder="https://…"
                />
              </div>
            )}
            {genErr && <div className={styles.gstatus}>{genErr}</div>}
            <div className={styles.mrow}>
              <button
                className={`${styles.btn} ${styles.solar}`}
                onClick={runGenerateReel}
                disabled={genBusy}
              >
                {genBusy ? 'Scripting…' : '✦ Generate reel'}
              </button>
              <button className={styles.btn} onClick={() => setGenOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MUSIC MODAL */}
      {musicOpen && (
        <div
          className={styles.modal}
          onClick={() => {
            stopPreview();
            setMusicOpen(false);
          }}
        >
          <div className={styles.modalbox} onClick={(e) => e.stopPropagation()}>
            <button
              className={styles.mclose}
              onClick={() => {
                stopPreview();
                setMusicOpen(false);
              }}
            >
              ×
            </button>
            <h2 className={styles.mtitle}>
              <Spark size={16} /> Music
            </h2>
            <p className={styles.msub}>
              Search royalty-free tracks (via Jamendo). Preview, then use — remember to credit the
              artist in your caption. Or upload your own file below.
            </p>
            <div className={styles.ctaRow}>
              <input
                value={musicQ}
                onChange={(e) => setMusicQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchMusic()}
                placeholder="e.g. upbeat corporate, calm acoustic"
              />
              <button className={styles.miniInline} onClick={searchMusic} disabled={musicBusy}>
                {musicBusy ? '…' : 'Search'}
              </button>
            </div>
            {musicErr && <div className={styles.gstatus}>{musicErr}</div>}
            <div className={styles.reelList} style={{ marginTop: 12 }}>
              {musicResults.map((t) => (
                <div className={styles.reelRow} key={t.id}>
                  <button className={styles.reelPick} onClick={() => useTrack(t)}>
                    <b>{t.name}</b>
                    <span>
                      {t.artist} · {Math.round(t.duration)}s
                    </span>
                  </button>
                  <button
                    className={styles.reelDel}
                    onClick={() => previewTrack(t.audio)}
                    title="Preview"
                  >
                    ▶
                  </button>
                </div>
              ))}
              {!musicBusy && musicResults.length === 0 && (
                <div className={styles.empty}>Search for a mood or genre to start.</div>
              )}
            </div>
            {audioAttribution && <div className={styles.hint}>{audioAttribution}</div>}
            <div className={styles.mrow}>
              <label className={styles.uploadDark} style={{ flex: 1 }}>
                Upload your own file
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(e) => onAudio(e.target.files?.[0])}
                />
              </label>
              <button
                className={`${styles.btn} ${styles.solar}`}
                onClick={() => {
                  stopPreview();
                  setMusicOpen(false);
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REELS MODAL */}
      {reelsOpen && (
        <div className={styles.modal} onClick={() => setReelsOpen(false)}>
          <div className={styles.modalbox} onClick={(e) => e.stopPropagation()}>
            <button className={styles.mclose} onClick={() => setReelsOpen(false)}>
              ×
            </button>
            <h2 className={styles.mtitle}>
              <Spark size={16} /> Saved reels
            </h2>
            <p className={styles.msub}>
              Reels save their scenes, format, text and CTAs (shared across the team). Uploaded video
              clips and music aren&rsquo;t stored — re-add them after loading.
            </p>
            <div className={styles.reelList}>
              {reels.length === 0 && <div className={styles.empty}>No saved reels yet.</div>}
              {reels.map((r) => (
                <div className={styles.reelRow} key={r.id}>
                  <button className={styles.reelPick} onClick={() => loadReel(r.id)}>
                    <b>{r.name}</b>
                    <span>
                      {r.size} · {new Date(r.updated_at).toLocaleDateString('en-GB')}
                    </span>
                  </button>
                  <button className={styles.reelDel} onClick={() => deleteReel(r.id)}>
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className={styles.mrow}>
              <button className={`${styles.btn} ${styles.solar}`} onClick={newReel}>
                + New reel
              </button>
              <button className={styles.btn} onClick={() => setReelsOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
