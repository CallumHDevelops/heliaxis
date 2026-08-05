'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Spark } from './Spark';
import {
  REEL_W,
  REEL_H,
  renderReel,
  totalDuration,
  type Scene,
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

export default function ReelStudio({ userEmail }: { userEmail: string }) {
  const supabase = createClient();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const famRef = useRef({ display: 'sans-serif', body: 'sans-serif', mono: 'monospace' });
  const imgCache = useRef<Record<string, HTMLImageElement>>({});

  const [scenes, setScenes] = useState<Scene[]>([newScene()]);
  const [sel, setSel] = useState(0);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [images, setImages] = useState<{ id: string; name: string; data_url: string }[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioName, setAudioName] = useState('');
  const [exporting, setExporting] = useState(false);

  const scenesRef = useRef(scenes);
  const playheadRef = useRef(0);
  const playingRef = useRef(false);
  const startRef = useRef(0);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    scenesRef.current = scenes;
  }, [scenes]);

  const imgFor = useCallback((s: Scene) => {
    if (!s.bg) return null;
    let im = imgCache.current[s.bg];
    if (!im) {
      im = new Image();
      im.onload = () => drawAt(playheadRef.current);
      im.src = s.bg;
      imgCache.current[s.bg] = im;
    }
    return im;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const drawAt = useCallback(
    (t: number) => {
      const c = canvasRef.current;
      if (!c) return;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      if (c.width !== REEL_W) {
        c.width = REEL_W;
        c.height = REEL_H;
      }
      renderReel(ctx, scenesRef.current, t, imgFor, famRef.current);
    },
    [imgFor]
  );

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
        const arr = JSON.parse(saved);
        if (Array.isArray(arr) && arr.length) setScenes(arr);
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

  // persist + repaint on edits (when not actively playing)
  useEffect(() => {
    try {
      localStorage.setItem('heliaxis_reel', JSON.stringify(scenes));
    } catch {
      /* ignore */
    }
    if (!playingRef.current) drawAt(playheadRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenes]);

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
    setScenes((s) => {
      const copy = { ...s[i], id: uid() };
      const next = [...s.slice(0, i + 1), copy, ...s.slice(i + 1)];
      return next;
    });
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
      drawAt(0);
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
          drawAt(Math.min(t, total));
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

  return (
    <div className={styles.app}>
      {audioUrl && <audio ref={audioElRef} src={audioUrl} preload="auto" />}
      <div className={styles.bar}>
        <div className={styles.lt}>
          <img src="/heliaxis-logo-light.png" alt="Heliaxis" />
          <span className={styles.tag}>Reel Studio · beta</span>
        </div>
        <div className={styles.rt}>
          <label className={styles.upload}>
            {audioName ? '♪ ' + audioName.slice(0, 18) : '♪ Add music'}
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

      {/* LEFT — scene list */}
      <div className={styles.panel}>
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
                {s.bg ? ' · photo' : ''}
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
          <label>Background</label>
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
          <div className={styles.hint}>Backgrounds come from your Image library (in the post studio).</div>
        </div>

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
          <b>Export</b> plays the reel in real time to record it, so keep the tab focused. Output is
          WebM (1080×1920). MP4 export is a planned upgrade.
        </div>
      </div>
    </div>
  );
}
