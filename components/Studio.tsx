'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Spark } from './Spark';
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
} from '@/lib/postEngine';
import styles from './Studio.module.css';

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

  const [S, setS] = useState<PostState>({
    tpl: 'statement',
    size: 'square',
    theme: 'dark',
    hatch: true,
    data: { ...TEMPLATES.statement.defaults },
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
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveMsg, setSaveMsg] = useState('');
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const draw = useCallback(() => {
    if (!canvasRef.current) return;
    zonesRef.current = renderPost(canvasRef.current, Sref.current, imgsRef.current, famRef.current);
  }, []);

  // keep a ref of latest state for the draw callback
  const Sref = useRef(S);
  useEffect(() => {
    Sref.current = S;
    draw();
  }, [S, draw]);

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
  }, [S]);

  async function autosave() {
    const { error } = await supabase.from('posts').upsert(
      {
        id: postId,
        tpl: S.tpl,
        size: S.size,
        theme: S.theme,
        hatch: S.hatch,
        data: S.data,
        headline: headlineOf(S.data),
        source: postSource,
      },
      { onConflict: 'id' }
    );
    if (error) {
      setSaveState('error');
      setSaveMsg(error.message);
      return;
    }
    setSaveState('saved');
    loadHistory();
  }

  async function loadHistory() {
    const { data } = await supabase
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(120);
    if (data) setHistory(data as HistoryRow[]);
  }

  function setTpl(k: TemplateKey) {
    setS((s) => ({ ...s, tpl: k, data: { ...TEMPLATES[k].defaults } }));
  }
  function setField(k: string, v: string) {
    setS((s) => ({ ...s, data: { ...s.data, [k]: v } }));
  }

  function loadPhoto(file?: File) {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      const im = new Image();
      im.onload = () => {
        imgsRef.current.photo = im;
        draw();
      };
      im.src = r.result as string;
    };
    r.readAsDataURL(file);
  }
  function clearPhoto() {
    imgsRef.current.photo = null;
    draw();
  }

  function onCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const cv = canvasRef.current!;
    const r = cv.getBoundingClientRect();
    const mx = ((e.clientX - r.left) * cv.width) / r.width;
    const my = ((e.clientY - r.top) * cv.height) / r.height;
    for (let i = zonesRef.current.length - 1; i >= 0; i--) {
      const z = zonesRef.current[i];
      if (mx >= z.x && mx <= z.x + z.w && my >= z.y && my <= z.y + z.h) {
        const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
          `[data-field="${z.f}"]`
        );
        if (el) {
          el.focus();
          el.scrollIntoView({ block: 'center', behavior: 'smooth' });
          el.style.boxShadow = '0 0 0 2px var(--solar)';
          setTimeout(() => (el.style.boxShadow = ''), 1200);
        }
        return;
      }
    }
  }
  function onCanvasMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const cv = canvasRef.current!;
    const r = cv.getBoundingClientRect();
    const mx = ((e.clientX - r.left) * cv.width) / r.width;
    const my = ((e.clientY - r.top) * cv.height) / r.height;
    const hit = zonesRef.current.some(
      (z) => mx >= z.x && mx <= z.x + z.w && my >= z.y && my <= z.y + z.h
    );
    cv.style.cursor = hit ? 'pointer' : 'default';
  }

  function download() {
    const cv = canvasRef.current!;
    cv.toBlob((b) => {
      if (!b) return;
      const a = document.createElement('a');
      a.download = `heliaxis-${S.tpl}-${S.size}.png`;
      a.href = URL.createObjectURL(b);
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, 'image/png');
  }

  function headlineOf(data: Record<string, string>) {
    return (data.headline || data.stat || data.quote || '').split('*').join('');
  }

  function newPost() {
    skipSave.current = true;
    setPostId(newId());
    setPostSource('manual');
    imgsRef.current.photo = null;
    setSaveState('idle');
    setS({
      tpl: 'statement',
      size: 'square',
      theme: 'dark',
      hatch: true,
      data: { ...TEMPLATES.statement.defaults },
    });
  }

  async function runGenerate() {
    setGenErr(false);
    if (!genTopic.trim()) {
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
          topic: genTopic,
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
    setS({
      tpl: row.tpl as TemplateKey,
      size: (row.size as SizeKey) || 'square',
      theme: (row.theme as ThemeKey) || 'dark',
      hatch: row.hatch !== false,
      data: { ...row.data },
    });
    setHistOpen(false);
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
  const caption = tpl.caption(S.data);

  return (
    <div className={styles.app}>
      <div className={styles.bar}>
        <div className={styles.lt}>
          <img src="/heliaxis-logo-light.png" alt="Heliaxis" />
          <span className={styles.tag}>Post Studio</span>
        </div>
        <div className={styles.rt}>
          <button className={styles.btn} onClick={() => setHistOpen(true)}>
            History
          </button>
          <button className={styles.btn} onClick={() => setGenOpen(true)}>
            <Spark size={12} /> Generate
          </button>
          <button className={styles.btn} onClick={newPost}>
            + New Post
          </button>
          <button className={`${styles.btn} ${styles.solar}`} onClick={download}>
            Download PNG
          </button>
          <div className={styles.profile}>
            <button
              className={styles.avatar}
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
        <div className={styles.tgrid}>
          {(Object.keys(TEMPLATES) as TemplateKey[]).map((k) => (
            <button
              key={k}
              className={`${styles.tpl} ${k === S.tpl ? styles.on : ''}`}
              onClick={() => setTpl(k)}
            >
              <b>{TEMPLATES[k].name}</b>
              <span>{TEMPLATES[k].desc}</span>
            </button>
          ))}
        </div>

        <div className={styles.ph}>
          <Spark size={11} /> Size
        </div>
        <div className={`${styles.seg} ${styles.sizes}`}>
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
        <div className={styles.seg}>
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
          <Spark size={11} /> Photo background
        </div>
        <div className={styles.fld}>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => loadPhoto(e.target.files?.[0])}
            style={{ fontSize: '.75rem' }}
          />
        </div>
        <div className={styles.hint}>
          Optional. A real install photo lifts engagement far more than a graphic. The overlay and
          faint grid keep text readable and on-brand.
        </div>
        <button className={styles.mini} onClick={clearPhoto}>
          Remove photo
        </button>
      </div>

      {/* CENTRE */}
      <div className={styles.stage}>
        <div className={styles.canvaswrap}>
          <canvas ref={canvasRef} onClick={onCanvasClick} onMouseMove={onCanvasMove} />
        </div>
        <div className={styles.stagemeta}>
          {SIZES[S.size].note} · {tpl.name} · {THEMES[S.theme]}
        </div>
      </div>

      {/* RIGHT */}
      <div className={`${styles.panel} ${styles.right}`}>
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

        <div className={styles.ph}>
          <Spark size={11} /> Suggested caption
        </div>
        <div className={styles.cap}>{caption}</div>
        <div className={styles.tags}>
          {tpl.tags.map((t) => (
            <span className={styles.tagC} key={t}>
              {t}
            </span>
          ))}
        </div>
        <button
          className={styles.mini}
          onClick={() => navigator.clipboard?.writeText(caption + '\n\n' + tpl.tags.join(' '))}
        >
          Copy caption
        </button>
        <div className={styles.savestate} data-state={saveState}>
          {saveState === 'saving' && 'Saving…'}
          {saveState === 'saved' && '✓ Saved automatically'}
          {saveState === 'error' && `Save failed — ${saveMsg}`}
          {saveState === 'idle' && 'Autosaves as you edit'}
        </div>
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
                onClick={runGenerate}
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
                return (
                  <div
                    className={styles.hitem}
                    key={row.id}
                    onClick={() => loadHistoryRow(row)}
                  >
                    <div className={styles.ht}>
                      {row.headline || TEMPLATES[row.tpl as TemplateKey]?.name || 'Post'}
                    </div>
                    <div className={styles.hm}>
                      {TEMPLATES[row.tpl as TemplateKey]?.name} · {row.theme} ·{' '}
                      {dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}{' '}
                      {dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      {row.source === 'ai' ? ' · ✦ generated' : ''}
                    </div>
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
    </div>
  );
}
