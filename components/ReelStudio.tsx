'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Spark } from './Spark';
import {
  REEL_SIZES,
  renderReel,
  sceneIndexAt,
  totalDuration,
  type ReelSizeKey,
  type Scene,
  type SceneMedia,
  type ReelTheme,
  type ReelAnim,
} from '@/lib/reelEngine';
import styles from './ReelStudio.module.css';

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

  function drawAt(t: number) {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const dim = REEL_SIZES[sizeRef.current];
    if (c.width !== dim.w || c.height !== dim.h) {
      c.width = dim.w;
      c.height = dim.h;
    }
    renderReel(ctx, scenesRef.current, t, mediaFor, famRef.current, dim.w, dim.h);
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
    drawAt(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    syncVideos(t, true);
    drawAt(t);
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
    };
    r.readAsDataURL(file);
  }
  function onSceneVideo(file?: File) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    patch(sel, { videoUrl: url, videoName: file.name, videoStart: 0, bg: null });
  }
  function removeVideo() {
    patch(sel, { videoUrl: null, videoName: '', videoStart: 0 });
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
          drawAt(tt);
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
          <label className={styles.upload}>
            {audioName ? '♪ ' + audioName.slice(0, 16) : '♪ Add music'}
            <input type="file" accept="audio/*" onChange={(e) => onAudio(e.target.files?.[0])} />
          </label>
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
            onClick={() => setSel(i)}
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
          <canvas ref={canvasRef} />
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
          <input value={sc.eyebrow} onChange={(e) => patch(sel, { eyebrow: e.target.value })} />
        </div>
        <div className={styles.fld}>
          <label>Headline — *word* for gold</label>
          <textarea value={sc.headline} onChange={(e) => patch(sel, { headline: e.target.value })} />
        </div>
        <div className={styles.fld}>
          <label>Sub</label>
          <textarea value={sc.sub} onChange={(e) => patch(sel, { sub: e.target.value })} />
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
    </div>
  );
}
