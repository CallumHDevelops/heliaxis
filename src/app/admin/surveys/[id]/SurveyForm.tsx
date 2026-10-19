'use client';
/* eslint-disable @next/next/no-html-link-for-pages -- survey pages open with a full page load, so the service worker can serve its copy with no signal */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { SignaturePad } from '@/components/subcontractors/SignaturePad';
import {
  addSurveyPhotos,
  PHOTO_UPLOADED,
  QUEUE_CHANGED,
  queuedForSurvey,
  queueNeedsSignIn,
  removeQueued,
  retryQueued,
  setQueuedMarkup,
  type PhotoUploadedDetail,
  type QueuedPhoto,
} from '@/lib/crm/photo-queue';
import { COMPASS_POINTS, compassLabel, directionsUrl, keepScreenOn, nearestCompass, roofFacingFromLooking, watchCompass, watchPitch } from '@/lib/surveys/device';
import { cleanMarkup, flattenMarkup, type Markup } from '@/lib/surveys/markup';
import {
  finishSurvey,
  getSignature,
  loadSurvey,
  outboxItems,
  queueMarkup,
  saveAnswers,
  saveStatus,
  setSignature,
  SURVEYS_CHANGED,
  undoFinish,
  type Loaded,
  type OutboxItem,
  type SaveStatus,
  type SurveysChangedDetail,
} from '@/lib/surveys/offline';
import { mergeSurvey, same } from '@/lib/surveys/merge';
import { evaluate, isShown, levelOf, missingWords, roofName, roofsOf, slotFor, type Evaluation, type Miss } from '@/lib/surveys/rules';
import {
  fieldIndex,
  hasBattery,
  MAX_ROOFS,
  SCREENS,
  SOLAR_SCHEMA,
  type Answers,
  type Ctx,
  type Field,
  type RoofAnswers,
  type Section,
  type SurveyPhoto,
} from '@/lib/surveys/solar-schema';
import { AshpSurvey } from './AshpSurvey';
import { MarkupEditor } from './MarkupEditor';
import { PhotoRun } from './PhotoRun';
import { PhotoSlot, PhotoViewer, type PhotoActions, type SlotPhoto } from './PhotoSlot';
import '../surveys.css';

/**
 * The survey on the phone (/admin/surveys/{id}, and /admin/surveys/shell when the service worker
 * has no copy of that survey's page). Built for a roof: one screen at a time in the order of the
 * visit, big buttons for gloves, dark-on-white for sunlight, a sticky Back · Take photo · Next bar,
 * and the screen kept on.
 *
 * No server data: the id comes from the address, and the survey from the network or, with no
 * signal, from the copy on this phone (src/lib/surveys/offline.ts). Every change is kept on the
 * phone first and saved to the server when there's signal; photos go through the photo queue.
 */

const UUID_IN_PATH = /^\/admin\/surveys\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;
const NO_PRODUCTS: string[] = [];
const FIELDS = fieldIndex();
const AT_KEY = 'hx.survey.at.';
const UK_TIME = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const UK_WHEN = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const SKIP_REASONS = ['No access', 'Not safe to check', 'Customer didn’t want it', 'Ran out of time'];
const SAID_PREFIX = 'Customer said: ';

const noSubscribe = () => () => {};
const pathNow = () => location.pathname;
const pathOnServer = () => '';
function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

const isOpen = (s?: string | null) => s === 'booked' || s === 'draft';
const isEmptyValue = (v: unknown) => v == null || (typeof v === 'string' && v === '') || (Array.isArray(v) && v.length === 0);

/** A copy of `o` with `key` set to `v` (or removed when empty). */
function withValue<T extends Record<string, unknown>>(o: T, key: string, v: unknown): T {
  const next = { ...o } as Record<string, unknown>;
  if (isEmptyValue(v)) delete next[key];
  else next[key] = v;
  return next as T;
}

function withValues<T extends Record<string, unknown>>(o: T, changes: Record<string, unknown>): T {
  let next = o;
  for (const [k, v] of Object.entries(changes)) next = withValue(next, k, v);
  return next;
}

/** "Front of the house", or "Roof pitch (Rear main)" with several roof areas. */
function slotLabel(slot: string, roofs: RoofAnswers[]): string {
  const [fieldId, roofId] = slot.split(':');
  const label = FIELDS.get(fieldId)?.field.label ?? fieldId;
  if (!roofId || roofs.length < 2) return label;
  const i = roofs.findIndex((r) => r.id === roofId);
  return i >= 0 ? `${label} (${roofName(roofs[i], i)})` : label;
}

const roofOfSlot = (slot: string) => slot.split(':')[1] ?? null;

function fromServer(p: SurveyPhoto, pending: Map<string, Markup | null>): SlotPhoto {
  return {
    key: `p:${p.id}`,
    slot: p.slot ?? '',
    photoId: p.id,
    queueId: null,
    clientId: p.clientId,
    thumb: p.thumb ?? p.url,
    src: p.url,
    blob: null,
    markup: pending.has(p.id) ? pending.get(p.id) ?? null : p.markup,
    width: p.width,
    height: p.height,
    state: 'up',
    failed: null,
  };
}

/* ── The form ─────────────────────────────────────────────────────────────────── */

export function SurveyForm() {
  const path = useSyncExternalStore(noSubscribe, pathNow, pathOnServer);
  const id = UUID_IN_PATH.exec(path)?.[1]?.toLowerCase() ?? null;
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadTick, setLoadTick] = useState(0);
  const [answers, setAnswersState] = useState<Answers>({});
  const answersRef = useRef<Answers>({});
  const [serverPhotos, setServerPhotos] = useState<SurveyPhoto[]>([]);
  const [queue, setQueue] = useState<SlotPhoto[]>([]);
  const queueRef = useRef<SlotPhoto[]>([]);
  const [pending, setPending] = useState<Map<string, Markup | null>>(() => new Map());
  const [status, setStatus] = useState<SaveStatus | null>(null);
  const finishingRef = useRef(false);
  const [needSignIn, setNeedSignIn] = useState(false);
  const urls = useRef(new Map<string, { thumb: string; full: string }>());

  const [screen, setScreen] = useState(0);
  const [roofId, setRoofId] = useState('r1');
  const [more, setMore] = useState<Record<string, boolean>>({});
  const [sheet, setSheet] = useState<null | 'sections' | 'menu' | 'said' | 'signoff' | { skip: string; title: string }>(null);
  const [run, setRun] = useState<{ start: string | null } | null>(null);
  const [viewing, setViewing] = useState<{ key: string; clientId: string | null; draw: boolean } | null>(null);
  const [viewBusy, setViewBusy] = useState(false);
  const [viewError, setViewError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [actionError, setActionError] = useState<string | null>(null);
  const barCamera = useRef<HTMLInputElement>(null);
  const barSlot = useRef<string | null>(null);
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const payload = loaded?.payload ?? null;
  const survey = payload?.survey ?? null;
  const products = payload?.project.products ?? NO_PRODUCTS;

  const say = useCallback((msg: string) => {
    clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  /* ── Loading ── */

  /** Photos taken on this phone this time keep showing the phone's copy: quicker, and it works with no signal. */
  const withLocal = useCallback(
    (list: SurveyPhoto[]) =>
      list.map((p) => {
        const u = p.clientId ? urls.current.get(p.clientId) : undefined;
        return u ? { ...p, url: u.full, thumb: u.thumb } : p;
      }),
    []
  );

  /** The queue, the outbox and the save state for this survey, read again after any change. */
  const refresh = useCallback(async () => {
    if (!id) return;
    const [st, items, out] = await Promise.all([
      saveStatus(id).catch(() => null),
      queuedForSurvey(id).catch(() => [] as QueuedPhoto[]),
      outboxItems().catch(() => [] as OutboxItem[]),
    ]);
    const known = urls.current;
    const view: SlotPhoto[] = [];
    const waitingDrawings = new Map<string, Markup | null>();
    for (const q of items) {
      if (q.uploadedAs) {
        waitingDrawings.set(q.uploadedAs, cleanMarkup(q.markup));
        continue;
      }
      let u = known.get(q.id);
      if (!u) {
        u = { thumb: URL.createObjectURL(q.thumb), full: URL.createObjectURL(q.full) };
        known.set(q.id, u);
      }
      view.push({
        key: `q:${q.id}`,
        slot: q.slot ?? '',
        photoId: null,
        queueId: q.id,
        clientId: q.id,
        thumb: u.thumb,
        src: u.full,
        blob: q.full,
        markup: cleanMarkup(q.markup),
        width: q.width || null,
        height: q.height || null,
        state: q.failed ? 'failed' : 'waiting',
        failed: q.failed ?? null,
      });
    }
    for (const o of out) if (o.kind === 'markup' && o.surveyId === id && !o.failed) waitingDrawings.set(o.photoId, o.markup);
    queueRef.current = view;
    setQueue(view);
    setPending(waitingDrawings);
    setNeedSignIn(queueNeedsSignIn());
    if (st) {
      // "Finished, uploading" has just gone through: open it again as finished.
      if (finishingRef.current && !st.finishing && !st.finishFailed) setLoadTick((n) => n + 1);
      finishingRef.current = st.finishing;
      setStatus(st);
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    void loadSurvey(id).then((l) => {
      if (!alive) return;
      answersRef.current = l.answers;
      setAnswersState(l.answers);
      setServerPhotos(withLocal(l.payload?.photos ?? []));
      setLoaded(l);
      // Opening may have unlocked or locked the phone's copy (reopened, finished elsewhere).
      void refresh();
      try {
        const at = JSON.parse(localStorage.getItem(AT_KEY + id) || 'null') as { screen?: number; roof?: string } | null;
        if (at && typeof at.screen === 'number') setScreen(Math.max(0, Math.min(SCREENS.length - 1, at.screen)));
        if (at?.roof) setRoofId(at.roof);
      } catch {
        /* no saved place */
      }
    });
    return () => {
      alive = false;
    };
  }, [id, loadTick, refresh, withLocal]);

  // Opened with no signal and no copy on the phone: try again when the signal comes back.
  useEffect(() => {
    if (!online || !loaded || loaded.payload || loaded.error !== 'offline') return;
    const t = setTimeout(() => setLoadTick((n) => n + 1), 500);
    return () => clearTimeout(t);
  }, [online, loaded]);

  useEffect(() => {
    if (!id) return;
    const onSurveys = (e: Event) => {
      const d = (e as CustomEvent<SurveysChangedDetail>).detail;
      if (d?.id && d.id !== id) return;
      // Answers saved on another phone were merged into the copy here: show them too, or the next
      // change on this screen would save over them.
      if (d?.merged) {
        const m = mergeSurvey(d.merged.base, answersRef.current, d.merged.server).answers;
        if (!same(m, answersRef.current)) {
          answersRef.current = m;
          setAnswersState(m);
          void saveAnswers(id, m).catch(() => null);
        }
      }
      void refresh();
    };
    const onQueue = () => void refresh();
    window.addEventListener(SURVEYS_CHANGED, onSurveys);
    window.addEventListener(QUEUE_CHANGED, onQueue);
    // The first read is after the survey has opened (the load above), so it sees the opened copy.
    return () => {
      window.removeEventListener(SURVEYS_CHANGED, onSurveys);
      window.removeEventListener(QUEUE_CHANGED, onQueue);
    };
  }, [id, refresh]);

  // A photo went up: show it as uploaded straight away, then fetch the signed copies.
  useEffect(() => {
    if (!id) return;
    const onUploaded = (e: Event) => {
      const d = (e as CustomEvent<PhotoUploadedDetail>).detail;
      if (!d || d.surveyId !== id || !d.photoId) return;
      const photoId = d.photoId;
      const was = queueRef.current.find((q) => q.queueId === d.id);
      setServerPhotos((prev) =>
        prev.some((p) => p.id === photoId)
          ? prev
          : [
              ...prev,
              {
                id: photoId,
                slot: d.slot ?? null,
                url: was?.src ?? null,
                thumb: was?.thumb ?? null,
                markup: was?.markup ?? null,
                markupUrl: null,
                width: was?.width ?? null,
                height: was?.height ?? null,
                created_at: new Date().toISOString(),
                clientId: d.id,
              },
            ]
      );
      clearTimeout(refetchTimer.current);
      refetchTimer.current = setTimeout(() => {
        void fetch(`/api/crm/surveys/${id}`, { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null))
          .then((p: { photos?: SurveyPhoto[] } | null) => {
            if (p?.photos) setServerPhotos(withLocal(p.photos));
          })
          .catch(() => null);
      }, 2500);
    };
    window.addEventListener(PHOTO_UPLOADED, onUploaded);
    return () => {
      window.removeEventListener(PHOTO_UPLOADED, onUploaded);
      clearTimeout(refetchTimer.current);
    };
  }, [id, withLocal]);

  // The screen stays on while the survey is open.
  useEffect(() => keepScreenOn(), []);

  useEffect(() => {
    const known = urls.current;
    const toasts = toastTimer;
    return () => {
      clearTimeout(toasts.current);
      for (const u of known.values()) {
        URL.revokeObjectURL(u.thumb);
        URL.revokeObjectURL(u.full);
      }
      known.clear();
    };
  }, []);

  /* ── What the form shows ── */

  const photos = useMemo(() => {
    const up = serverPhotos.filter((p) => p.slot).map((p) => fromServer(p, pending));
    const upIds = new Set(up.map((p) => p.clientId).filter(Boolean));
    return [...up, ...queue.filter((q) => !upIds.has(q.queueId))];
  }, [serverPhotos, queue, pending]);

  const photoInfo = useMemo(() => photos.map((p) => ({ slot: p.slot, hasMarkup: !!p.markup, failed: p.state === 'failed' })), [photos]);
  const ev = useMemo(() => evaluate(SOLAR_SCHEMA, answers, photoInfo, products), [answers, photoInfo, products]);
  const missing = useMemo(() => new Set(ev.missing.map((m) => slotFor(m.field, m.roofId))), [ev]);
  const notFilled = useMemo(() => new Set(ev.notFilled.map((m) => slotFor(m.field, m.roofId))), [ev]);

  const roofs = roofsOf(answers);
  const baseCtx: Ctx = { a: { ...answers, roofs }, products };
  const sectionShown = (s: Section) => !s.show || s.show(baseCtx);
  const visible = SCREENS.map((_, i) => i).filter((i) => SOLAR_SCHEMA.some((s) => s.screen === i && sectionShown(s)));
  const cur = visible.includes(screen) ? screen : (visible.find((i) => i > screen) ?? visible[visible.length - 1] ?? 0);
  const pos = visible.indexOf(cur);
  const roof = roofs.find((r) => r.id === roofId) ?? roofs[0];

  const lockedReason = status?.locked ?? loaded?.draft?.locked ?? (survey && !isOpen(survey.status) ? survey.status : null);
  const finishing = !!status?.finishing;
  const readOnly = !!lockedReason || finishing;
  const canDraw = lockedReason !== 'cancelled' && lockedReason !== 'deleted';
  const canFinish = !readOnly && !ev.missing.length && !ev.blocks.length;

  /* ── Changing answers ── */

  const commit = useCallback(
    (next: Answers) => {
      answersRef.current = next;
      setAnswersState(next);
      if (id) void saveAnswers(id, next).catch(() => null);
    },
    [id]
  );

  const setMany = useCallback(
    (changes: Record<string, unknown>, onRoof?: string) => {
      const a = answersRef.current;
      if (!onRoof) return commit(withValues(a, changes));
      commit({ ...a, roofs: roofsOf(a).map((r) => (r.id === onRoof ? withValues(r, changes) : r)) });
    },
    [commit]
  );

  const set = useCallback(
    (key: string, v: unknown, onRoof?: string) => {
      const changes: Record<string, unknown> = { [key]: v };
      // An asbestos cement roof is "asbestos suspected" until someone says otherwise.
      if (key === 'R3' && v === 'asbestos_cement' && onRoof) {
        const r = roofsOf(answersRef.current).find((x) => x.id === onRoof);
        if (!r?.R16 || r.R16 === 'no') changes.R16 = 'suspected';
      }
      setMany(changes, onRoof);
    },
    [setMany]
  );

  const toggleSend = (slot: string) => {
    const a = answersRef.current;
    const send = { ...((a.send as Record<string, boolean> | undefined) ?? {}) };
    if (send[slot]) delete send[slot];
    else send[slot] = true;
    commit(withValue(a, 'send', Object.keys(send).length ? send : undefined));
  };

  const setSkip = (key: string, reason: string | null) => {
    const a = answersRef.current;
    const skip = { ...((a.skip as Record<string, string> | undefined) ?? {}) };
    if (reason) skip[key] = reason;
    else delete skip[key];
    commit(withValue(a, 'skip', Object.keys(skip).length ? skip : undefined));
  };

  function addRoof() {
    const a = answersRef.current;
    const rs = roofsOf(a);
    if (rs.length >= MAX_ROOFS) return;
    const used = new Set(rs.map((r) => r.id));
    let n = 1;
    while (used.has(`r${n}`)) n++;
    const added: RoofAnswers = { id: `r${n}`, R1: `Roof area ${rs.length + 1}` };
    commit({ ...a, roofs: [...rs, added] });
    pickRoof(added.id);
  }

  function removeRoof(r: RoofAnswers, i: number) {
    if (!window.confirm(`Remove ${roofName(r, i)}? Its answers go. Any photos of it stay on the job.`)) return;
    const a = answersRef.current;
    const skip = { ...((a.skip as Record<string, string> | undefined) ?? {}) };
    for (const k of Object.keys(skip)) if (k.endsWith(`:${r.id}`)) delete skip[k];
    commit(withValue({ ...a, roofs: roofsOf(a).filter((x) => x.id !== r.id) }, 'skip', Object.keys(skip).length ? skip : undefined));
    pickRoof(roofsOf(a)[0]?.id ?? 'r1');
  }

  /* ── Moving around ── */

  const remember = (s: number, r: string) => {
    try {
      if (id) localStorage.setItem(AT_KEY + id, JSON.stringify({ screen: s, roof: r }));
    } catch {
      /* ignore */
    }
  };

  function go(to: number, onRoof?: string | null, focus?: string) {
    setScreen(to);
    if (onRoof) setRoofId(onRoof);
    remember(to, onRoof ?? roofId);
    setSheet(null);
    requestAnimationFrame(() => {
      const el = focus ? document.getElementById(focus) : document.getElementById('svf-screen');
      el?.scrollIntoView({ block: focus ? 'center' : 'start' });
    });
  }

  function pickRoof(r: string) {
    setRoofId(r);
    remember(cur, r);
  }

  const jump = (m: Miss) => go(m.screen, m.roofId, `f-${slotFor(m.field, m.roofId)}`);

  /* ── Photos ── */

  const addPhotos = useCallback(
    async (slot: string, files: FileList | File[]) => {
      if (!id || !payload) return;
      const ids = await addSurveyPhotos(payload.project.id, id, slot, files).catch(() => [] as string[]);
      await refresh();
      if (ids.length) say(`${ids.length === 1 ? 'Photo' : `${ids.length} photos`} saved: ${slotLabel(slot, roofsOf(answersRef.current))}`);
      else say('That file isn’t a photo.');
    },
    [id, payload, refresh, say]
  );

  const actions: PhotoActions = useMemo(
    () => ({
      add: addPhotos,
      open: (p, draw = false) => {
        setViewError(null);
        setViewing({ key: p.key, clientId: p.clientId, draw: draw && canDraw });
      },
      canAdd: !readOnly,
    }),
    [addPhotos, readOnly, canDraw]
  );

  const viewed = viewing ? (photos.find((p) => p.key === viewing.key) ?? (viewing.clientId ? photos.find((p) => p.clientId === viewing.clientId) : undefined)) : undefined;

  async function saveDrawing(p: SlotPhoto, m: Markup | null) {
    if (!id) return;
    if (!m && !p.markup) {
      setViewing(null);
      return;
    }
    let blob: Blob | null = null;
    if (m) {
      blob = await flattenMarkup(p.blob ?? p.src ?? '', m).catch(() => null);
      // A photo still on the phone only takes a drawing with its flattened copy.
      if (!blob && p.queueId && p.state !== 'up') throw new Error('Couldn’t save the drawing on this phone. Try again.');
    }
    if (p.queueId && p.state !== 'up') {
      if (await setQueuedMarkup(p.queueId, m, blob)) {
        await refresh();
        setViewing(null);
        say('Drawing saved');
        return;
      }
    }
    // Uploaded, or it went up while you were drawing: the drawing follows it.
    const up = p.photoId ? p : photos.find((x) => x.photoId && x.clientId === p.queueId);
    if (!up?.photoId) throw new Error('The photo has just uploaded. Open it again in a moment and save the drawing.');
    const photoId = up.photoId;
    await queueMarkup(id, photoId, m, blob);
    setServerPhotos((prev) => prev.map((x) => (x.id === photoId ? { ...x, markup: m } : x)));
    setViewing(null);
    say(online ? 'Drawing saved' : 'Drawing saved on this phone: it uploads when you have signal');
  }

  async function deletePhoto(p: SlotPhoto) {
    if (!window.confirm(p.state === 'failed' ? 'Remove this photo?' : 'Delete this photo?')) return;
    setViewBusy(true);
    setViewError(null);
    try {
      if (p.queueId && p.state !== 'up') {
        await removeQueued(p.queueId);
        await refresh();
      } else if (p.photoId) {
        if (!online) throw new Error('You need signal to delete a photo that has uploaded.');
        const r = await fetch(`/api/crm/photos/${p.photoId}`, { method: 'DELETE', cache: 'no-store' });
        if (!r.ok) throw new Error('Couldn’t delete it. Try again.');
        const gone = p.photoId;
        setServerPhotos((prev) => prev.filter((x) => x.id !== gone));
      }
      setViewing(null);
    } catch (err) {
      setViewError(err instanceof Error ? err.message : 'Couldn’t delete it.');
    } finally {
      setViewBusy(false);
    }
  }

  async function retryPhoto(p: SlotPhoto) {
    if (!p.queueId) return;
    setViewBusy(true);
    await retryQueued(p.queueId).catch(() => 0);
    setViewBusy(false);
    setViewing(null);
    await refresh();
  }

  // The bar's "Take photo": the next missing photo on this screen (this roof area first).
  const screenSteps = ev.photoRun.filter((s) => s.screen === cur && !s.done && s.level !== 'optional');
  const nextPhoto = screenSteps.find((s) => !roofOfSlot(s.slot) || roofOfSlot(s.slot) === roof.id) ?? screenSteps[0] ?? null;
  const runTodo = ev.photoRun.filter((s) => !s.done && s.level !== 'optional').length;

  function barPhoto() {
    if (nextPhoto) {
      barSlot.current = nextPhoto.slot;
      const r = roofOfSlot(nextPhoto.slot);
      if (r && r !== roof.id) pickRoof(r);
      barCamera.current?.click();
    } else setRun({ start: null });
  }

  /* ── Finishing ── */

  async function finish() {
    if (!id || !canFinish) return;
    const z8 = (answersRef.current.Z8 ?? null) as { name?: string } | null;
    if (!z8?.name && !window.confirm('Finish without the customer’s signature?')) return;
    const signature = await getSignature(id);
    await finishSurvey(id, { signature, signedName: z8?.name ?? '', at: new Date().toISOString() });
    finishingRef.current = true;
    await refresh();
    window.scrollTo({ top: 0 });
  }

  async function patchSurvey(body: Record<string, unknown>, done: string) {
    if (!id) return;
    setActionError(null);
    try {
      const r = await fetch(`/api/crm/surveys/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(j.error || 'That didn’t work. Try again.');
      setSheet(null);
      say(done);
      setLoadTick((n) => n + 1);
    } catch (err) {
      setActionError(err instanceof Error && online ? err.message : 'You need signal for that.');
    }
  }

  /* ── Screens ── */

  if (!path) return <div className="svf svf-root" />;
  if (!id) {
    return (
      <div className="svf svf-root">
        <div className="svf-empty">
          <p className="svf-big">Open a survey from the list.</p>
          <a className="svf-btn" href="/admin/surveys/todo">
            Surveys to do
          </a>
        </div>
      </div>
    );
  }
  if (!loaded) {
    return (
      <div className="svf svf-root">
        <div className="svf-empty">
          <p className="svf-big">Opening the survey…</p>
        </div>
      </div>
    );
  }
  if (!payload || !survey) {
    const words =
      loaded.error === 'signin'
        ? 'Sign in again to open this survey.'
        : loaded.error === 'not_found'
          ? 'This survey wasn’t found. It may have been deleted.'
          : 'This survey isn’t on this phone yet, and there’s no signal. It opens when the signal comes back.';
    return (
      <div className="svf svf-root">
        <div className="svf-empty">
          <p className="svf-big">{words}</p>
          {loaded.error === 'signin' ? (
            <a className="svf-btn" href={`/login?next=${encodeURIComponent(path)}`}>
              Sign in
            </a>
          ) : (
            <a className="svf-btn svf-btn--ghost" href="/admin/surveys/todo">
              ← Surveys
            </a>
          )}
        </div>
      </div>
    );
  }

  const a3 = (answers.A3 ?? null) as { address?: string; postcode?: string } | null;
  const address = (a3?.address || payload.project.address || '').trim();
  const postcode = (a3?.postcode || payload.project.postcode || '').trim();
  const directions = directionsUrl(address, postcode);
  const when = isOpen(survey.status) ? payload.project.survey_at : survey.completed_at;
  const customer = payload.customer?.name || payload.project.title || 'Customer';
  const saved = saveWords(status, online, lockedReason);
  const signed = (answers.Z8 ?? null) as { name?: string; at?: string } | null;

  const header = (
    <header className="svf-head">
      <a className="svf-back" href="/admin/surveys/todo">
        ← Surveys
      </a>
      <h1>{customer}</h1>
      <p className="svf-head__addr">{[address, postcode].filter(Boolean).join(', ') || 'No address yet'}</p>
      <p className="svf-head__meta">
        {[survey.type === 'ashp' ? 'Heat pump survey' : 'Solar survey', when ? UK_WHEN.format(new Date(when)) : 'Not dated', payload.project.ref].filter(Boolean).join(' · ')}
      </p>
      <div className="svf-head__row">
        {directions && (
          <a className="svf-btn svf-btn--ghost" href={directions} target="_blank" rel="noopener noreferrer">
            📍 Directions
          </a>
        )}
        {payload.customer?.phone && (
          <a className="svf-btn svf-btn--ghost" href={`tel:${payload.customer.phone.replace(/\s+/g, '')}`}>
            📞 Call
          </a>
        )}
        {loaded.source === 'phone' && <span className="svf-ready">Ready offline ✓</span>}
      </div>
    </header>
  );

  const banners = (
    <>
      {needSignIn && (
        <div className="svf-banner svf-banner--err" role="alert">
          <p>Sign in again to upload your photos.</p>
          <a className="svf-btn svf-btn--ghost" href={`/login?next=${encodeURIComponent(path)}`}>
            Sign in
          </a>
        </div>
      )}
      {status?.error && !lockedReason && (
        <p className="svf-banner svf-banner--err" role="alert">
          Your answers didn’t save: {status.error}
        </p>
      )}
      {actionError && (
        <p className="svf-banner svf-banner--err" role="alert">
          {actionError}
        </p>
      )}
      {lockedReason === 'complete' && (
        <div className="svf-banner svf-banner--ok">
          <p>
            <strong>Finished ✓</strong>
            {survey.completed_at ? ` ${UK_WHEN.format(new Date(survey.completed_at))}` : ''}
            {survey.completed_by_name ? ` by ${survey.completed_by_name}` : ''}.
            {ev.drawingsToDo.length > 0 && survey.type === 'solar' ? ' Drawings still to do: tap a photo below to draw on it.' : ''}
          </p>
          <div className="svf-row">
            {survey.type === 'solar' && (
              <a className="svf-btn" href={`/admin/surveys/${survey.id}/report`}>
                See the report
              </a>
            )}
            <button
              type="button"
              className="svf-btn svf-btn--ghost"
              onClick={() =>
                window.confirm(`Reopen this survey to change it?${signed?.name || survey.customer_signed_name ? ' The customer will need to sign again.' : ''}`) &&
                void patchSurvey({ status: 'draft' }, 'Survey reopened')
              }
            >
              Reopen
            </button>
          </div>
        </div>
      )}
      {lockedReason === 'cancelled' && (
        <div className="svf-banner svf-banner--err">
          <p>This survey was cancelled.</p>
          <button type="button" className="svf-btn svf-btn--ghost" onClick={() => void patchSurvey({ status: 'draft' }, 'Survey brought back')}>
            Bring it back
          </button>
        </div>
      )}
      {lockedReason === 'deleted' && <p className="svf-banner svf-banner--err">This survey has been deleted. Anything on this phone stays here.</p>}
      {finishing && (
        <div className="svf-banner svf-banner--ok" role="status">
          <p>
            <strong>Finished, uploading.</strong>{' '}
            {status?.photosWaiting
              ? `${status.photosWaiting} photo${status.photosWaiting === 1 ? '' : 's'} still to go. `
              : ''}
            It completes by itself once everything is up: keep the app open, or open it again when you have signal.
          </p>
          <button type="button" className="svf-btn svf-btn--ghost" onClick={() => void undoFinish(survey.id)}>
            Undo finish to change something
          </button>
        </div>
      )}
      {status?.finishFailed && (
        <div className="svf-banner svf-banner--err" role="alert">
          <p>
            <strong>{status.finishFailed.message}</strong>
          </p>
          {status.finishFailed.missing?.length ? <p>Still needed: {missingWords(status.finishFailed.missing, 4)}.</p> : null}
          <p>Fix it, then tap Finish on site again.</p>
        </div>
      )}
      {!!status?.photosFailed.length && (
        <p className="svf-banner svf-banner--err" role="alert">
          {status.photosFailed.length === 1 ? '1 photo' : `${status.photosFailed.length} photos`} couldn’t upload. Tap {status.photosFailed.length === 1 ? 'it' : 'each one'} to try again, or remove it and take it again.
        </p>
      )}
    </>
  );

  const viewer = viewed && viewing && (
    <>
      {viewing.draw && viewed.src ? (
        <MarkupEditor
          key={viewed.clientId ?? viewed.key}
          src={viewed.src}
          initial={viewed.markup}
          title={slotLabel(viewed.slot, roofs)}
          onSave={(m) => saveDrawing(viewed, m)}
          onClose={() => setViewing(null)}
        />
      ) : (
        <PhotoViewer
          photo={viewed}
          label={slotLabel(viewed.slot, roofs)}
          canDelete={!readOnly}
          canDraw={canDraw && !!viewed.src}
          busy={viewBusy}
          error={viewError}
          onDraw={() => setViewing({ ...viewing, draw: true })}
          onDelete={() => void deletePhoto(viewed)}
          onRetry={() => void retryPhoto(viewed)}
          onClose={() => setViewing(null)}
        />
      )}
    </>
  );

  /* Heat pump surveys: the SimpliHeat link, its report and a few photos. */
  if (survey.type === 'ashp') {
    return (
      <div className="svf svf-root">
        {header}
        <div className="svf-status" role="status">
          {saved.text}
        </div>
        {banners}
        <AshpSurvey
          payload={payload}
          photos={photos.filter((p) => p.slot === 'G1')}
          actions={actions}
          readOnly={readOnly}
          online={online}
          onFinish={() => {
            finishingRef.current = true;
            return finishSurvey(survey.id, { signature: null, signedName: '', at: new Date().toISOString() }).then(refresh);
          }}
          onChanged={() => setLoadTick((n) => n + 1)}
        />
        {viewer}
        {toast && (
          <div className="svf-toast" role="status">
            {toast}
          </div>
        )}
      </div>
    );
  }

  const api: Api = {
    answers,
    ev,
    missing,
    notFilled,
    readOnly,
    photos,
    actions,
    roofs,
    set,
    toggleSend,
    openSignOff: () => setSheet('signoff'),
  };

  const sections = SOLAR_SCHEMA.filter((s) => s.screen === cur && sectionShown(s));
  const perRoof = sections.some((s) => s.perRoof);
  const last = pos === visible.length - 1;
  const neededOn = (i: number) => ev.missing.filter((m) => m.screen === i).length;

  return (
    <div className="svf svf-root">
      {header}
      {banners}

      <div className="svf-nav">
        <button type="button" className="svf-nav__sections" onClick={() => setSheet('sections')} aria-label="All sections">
          <span className="svf-nav__count">
            {pos + 1}/{visible.length}
          </span>
          <span className="svf-nav__title">{SCREENS[cur].title}</span>
          <span aria-hidden="true">▾</span>
        </button>
        <span className="svf-nav__pct" aria-label={`${ev.percent}% done`}>
          {ev.percent}%
        </span>
        <button type="button" className="svf-nav__more" onClick={() => setSheet('menu')} aria-label="More">
          ⋯
        </button>
        <div className="svf-nav__bar" aria-hidden="true">
          <span style={{ width: `${ev.percent}%` }} />
        </div>
        <p className={`svf-nav__save is-${saved.tone}`} role="status">
          {saved.text}
        </p>
      </div>

      <div className="svf-screen" id="svf-screen">
        <h2 className="svf-screen__title">{SCREENS[cur].title}</h2>

        {cur === 1 && !readOnly && runTodo > 0 && (
          <button type="button" className="svf-btn svf-btn--solar svf-btn--wide svf-run-start" onClick={() => setRun({ start: null })}>
            📷 Take the photos ({runTodo} needed)
          </button>
        )}

        {/* Once per property (the cut-out image), above the roof areas. */}
        {sections.map((s) =>
          s.perRoof && s.once?.length ? (
            <div key={`${s.key}-once`} className="svf-section">
              {s.once.filter((f) => isShown(f, baseCtx)).map((f) => (
                <FieldView key={f.id} f={f} ctx={baseCtx} api={api} />
              ))}
            </div>
          ) : null
        )}

        {perRoof && (
          <div className="svf-roofs" role="tablist" aria-label="Roof areas">
            {roofs.map((r, i) => {
              const needs = ev.missing.filter((m) => m.screen === cur && m.roofId === r.id).length;
              return (
                <button
                  key={r.id}
                  type="button"
                  role="tab"
                  aria-selected={r.id === roof.id}
                  className={r.id === roof.id ? 'svf-roof is-on' : 'svf-roof'}
                  onClick={() => pickRoof(r.id)}
                >
                  {roofName(r, i)}
                  {needs ? <span className="svf-roof__need">{needs} needed</span> : null}
                </button>
              );
            })}
            {!readOnly && roofs.length < MAX_ROOFS && (
              <button type="button" className="svf-roof svf-roof--add" onClick={addRoof}>
                + Add roof area
              </button>
            )}
          </div>
        )}

        {cur === SCREENS.length - 1 ? (
          <FinishScreen
            api={api}
            ctx={baseCtx}
            section={sections[0]}
            signed={signed}
            canFinish={canFinish}
            finishing={finishing}
            locked={!!lockedReason}
            runTodo={runTodo}
            onJump={jump}
            onDraw={(m) => {
              const p = photos.find((x) => x.slot === slotFor(m.field, m.roofId) && x.state !== 'failed');
              if (p) actions.open(p, true);
              else jump(m);
            }}
            onRun={() => setRun({ start: null })}
            onFinish={() => void finish()}
          />
        ) : (
          sections.map((s) => {
            const ctx: Ctx = s.perRoof ? { ...baseCtx, roof } : baseCtx;
            const skipKey = s.perRoof ? `${s.key}:${roof.id}` : s.key;
            const reason = s.skippable ? ((answers.skip as Record<string, string> | undefined)?.[skipKey] ?? null) : null;
            const shown = s.fields.filter((f) => f.type !== 'auto' && isShown(f, ctx));
            const main = shown.filter((f) => levelOf(f, ctx) !== 'optional');
            const extra = shown.filter((f) => levelOf(f, ctx) === 'optional');
            const moreKey = skipKey;
            const title = s.perRoof && roofs.length > 1 ? `${s.title}: ${roofName(roof, roofs.indexOf(roof))}` : s.title;
            return (
              <section key={skipKey} className="svf-section" aria-label={title}>
                {sections.length > 1 && <h3 className="svf-section__title">{title}</h3>}
                {reason ? (
                  <div className="svf-skipped">
                    <p>
                      <strong>Not checked:</strong> {reason}
                    </p>
                    {!readOnly && (
                      <button type="button" className="svf-btn svf-btn--ghost" onClick={() => setSkip(skipKey, null)}>
                        Undo: check it now
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    {main.map((f) => (
                      <FieldView key={f.id} f={f} ctx={ctx} api={api} />
                    ))}
                    {extra.length > 0 && (
                      <>
                        <button
                          type="button"
                          className="svf-more"
                          aria-expanded={!!more[moreKey]}
                          onClick={() => setMore((m) => ({ ...m, [moreKey]: !m[moreKey] }))}
                        >
                          {more[moreKey] ? '▴ Less detail' : `▾ More detail (${extra.length})`}
                        </button>
                        {more[moreKey] && extra.map((f) => <FieldView key={f.id} f={f} ctx={ctx} api={api} />)}
                      </>
                    )}
                    {s.skippable && !readOnly && (
                      <button type="button" className="svf-skip" onClick={() => setSheet({ skip: skipKey, title })}>
                        Couldn’t check this section
                      </button>
                    )}
                  </>
                )}
                {s.key === 'C' && roofs.indexOf(roof) > 0 && !readOnly && (
                  <button type="button" className="svf-skip svf-skip--danger" onClick={() => removeRoof(roof, roofs.indexOf(roof))}>
                    Remove {roofName(roof, roofs.indexOf(roof))}
                  </button>
                )}
              </section>
            );
          })
        )}
      </div>

      {!readOnly && (
        <button type="button" className="svf-said" onClick={() => setSheet('said')}>
          💬 Customer said…
        </button>
      )}

      <nav className="svf-bar" aria-label="Survey">
        <button type="button" className="svf-bar__btn" disabled={pos <= 0} onClick={() => go(visible[pos - 1])}>
          ← Back
        </button>
        <button
          type="button"
          className="svf-bar__btn svf-bar__photo"
          disabled={readOnly}
          onClick={barPhoto}
          aria-label={nextPhoto ? `Take photo: ${nextPhoto.label}` : 'Take the photos'}
        >
          <span>📷 {nextPhoto ? 'Take photo' : 'Photos'}</span>
          <small>{nextPhoto ? nextPhoto.label : runTodo ? `${runTodo} needed elsewhere` : 'All needed ✓'}</small>
        </button>
        {last ? (
          <button type="button" className="svf-bar__btn svf-bar__next" disabled={!canFinish} onClick={() => void finish()}>
            Finish
          </button>
        ) : (
          <button type="button" className="svf-bar__btn svf-bar__next" onClick={() => go(visible[pos + 1])}>
            Next →
          </button>
        )}
        <input
          ref={barCamera}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            const files = e.target.files ? Array.from(e.target.files) : [];
            e.currentTarget.value = '';
            if (files.length && barSlot.current) void addPhotos(barSlot.current, files);
          }}
        />
      </nav>

      {sheet === 'sections' && (
        <Sheet title="Sections" onClose={() => setSheet(null)}>
          <ul className="svf-list">
            {visible.map((i) => {
              const n = neededOn(i);
              return (
                <li key={i}>
                  <button type="button" className={i === cur ? 'svf-list__btn is-on' : 'svf-list__btn'} onClick={() => go(i)}>
                    <span>{SCREENS[i].title}</span>
                    <span className={n ? 'svf-badge svf-badge--need' : 'svf-badge svf-badge--done'}>{n ? `${n} needed` : '✓'}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Sheet>
      )}

      {sheet === 'menu' && (
        <Sheet title="More" onClose={() => setSheet(null)}>
          <div className="svf-stack">
            {!readOnly && (
              <button
                type="button"
                className="svf-btn svf-btn--solar svf-btn--wide"
                onClick={() => {
                  setSheet(null);
                  setRun({ start: null });
                }}
              >
                📷 Take the photos{runTodo ? ` (${runTodo} needed)` : ''}
              </button>
            )}
            {!readOnly && (
              <button type="button" className="svf-btn svf-btn--wide" onClick={() => setSheet('signoff')}>
                ✍ Customer sign-off{signed?.name ? ' ✓' : ''}
              </button>
            )}
            <a className="svf-btn svf-btn--ghost svf-btn--wide" href={`/admin/crm/${payload.project.id}`}>
              Open the job
            </a>
            <a className="svf-btn svf-btn--ghost svf-btn--wide" href={`/admin/surveys/${survey.id}/report`}>
              Survey report
            </a>
            {isOpen(survey.status) && !lockedReason && (
              <button
                type="button"
                className="svf-btn svf-btn--danger svf-btn--wide"
                onClick={() => window.confirm('Cancel this survey? It stays on the job as cancelled.') && void patchSurvey({ status: 'cancelled' }, 'Survey cancelled')}
              >
                Cancel this survey
              </button>
            )}
          </div>
        </Sheet>
      )}

      {sheet === 'said' && (
        <SaidSheet
          onClose={() => setSheet(null)}
          onSave={(text) => {
            const line = `[${UK_TIME.format(new Date())}] ${SAID_PREFIX}${text}`;
            const before = typeof answersRef.current.X6 === 'string' ? answersRef.current.X6.trim() : '';
            set('X6', before && before !== 'None' ? `${before}\n${line}` : line);
            setSheet(null);
            say('Added to Requests from the customer');
          }}
        />
      )}

      {sheet === 'signoff' && (
        <SignOffSheet
          surveyId={survey.id}
          customerName={payload.customer?.name ?? ''}
          signed={signed}
          onClose={() => setSheet(null)}
          onSave={(name, image) => {
            set('Z8', { name, at: new Date().toISOString() });
            void setSignature(survey.id, image);
            setSheet(null);
            say('Signed ✓');
          }}
          onClear={() => {
            set('Z8', null);
            void setSignature(survey.id, null);
            setSheet(null);
          }}
        />
      )}

      {sheet && typeof sheet === 'object' && (
        <SkipSheet
          title={sheet.title}
          onClose={() => setSheet(null)}
          onSave={(reason) => {
            setSkip(sheet.skip, reason);
            setSheet(null);
          }}
        />
      )}

      {run && (
        <PhotoRun
          steps={ev.photoRun}
          photos={photos}
          startSlot={run.start}
          drawingNeeded={(slot) => FIELDS.get(slot.split(':')[0])?.field.drawing === 'needed'}
          onAdd={addPhotos}
          onOpen={(p, draw) => actions.open(p, draw)}
          onClose={() => setRun(null)}
        />
      )}

      {viewer}

      {toast && (
        <div className="svf-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

/** The save line under the screen title. */
function saveWords(st: SaveStatus | null, online: boolean, locked: string | null): { text: string; tone: 'ok' | 'warn' | 'err' } {
  if (locked === 'complete') return { text: 'Finished ✓', tone: 'ok' };
  if (locked === 'cancelled') return { text: 'Cancelled', tone: 'err' };
  if (locked === 'deleted') return { text: 'Deleted', tone: 'err' };
  if (!st) return { text: 'Saved on this phone', tone: 'ok' };
  const bits: string[] = [];
  if (st.finishing) bits.push('Finished, uploading');
  if (!st.saved) bits.push(online ? 'Saving…' : 'Saved on this phone: uploads when you have signal');
  if (st.photosFailed.length) bits.push(`${st.photosFailed.length} photo${st.photosFailed.length === 1 ? '' : 's'} couldn’t upload`);
  if (st.photosWaiting) bits.push(`${st.photosWaiting} photo${st.photosWaiting === 1 ? '' : 's'} waiting to upload`);
  if (st.drawingsWaiting) bits.push(`${st.drawingsWaiting} drawing${st.drawingsWaiting === 1 ? '' : 's'} waiting`);
  if (!bits.length) return { text: online ? 'Saved ✓' : 'Saved on this phone ✓', tone: 'ok' };
  return { text: bits.join(' · '), tone: st.photosFailed.length ? 'err' : 'warn' };
}

/* ── Questions ────────────────────────────────────────────────────────────────── */

type Api = {
  answers: Answers;
  ev: Evaluation;
  missing: Set<string>;
  notFilled: Set<string>;
  readOnly: boolean;
  photos: SlotPhoto[];
  actions: PhotoActions;
  roofs: RoofAnswers[];
  set: (key: string, v: unknown, roofId?: string) => void;
  toggleSend: (slot: string) => void;
  openSignOff: () => void;
};

function FieldView({ f, ctx, api }: { f: Field; ctx: Ctx; api: Api }) {
  const roofId = ctx.roof?.id;
  const slot = slotFor(f.id, roofId);
  const level = levelOf(f, ctx);
  const src = (ctx.roof ?? api.answers) as Record<string, unknown>;
  const value = src[f.id];
  const needed = api.missing.has(slot);
  const done = level !== 'optional' && !needed && !api.notFilled.has(slot);
  const set = (v: unknown, key = f.id) => api.set(key, v, roofId);
  const dis = api.readOnly;
  const warnings = api.ev.warnings.filter((w) => w.field === slot);
  const blocks = api.ev.blocks.filter((b) => b.field === slot);

  if (f.type === 'auto') return null;
  if (f.type === 'photo' || f.type === 'photos') {
    return (
      <div className="svf-field" id={`f-${slot}`}>
        <PhotoSlot
          slot={slot}
          label={f.label}
          help={f.help}
          hint={f.hint}
          needed={needed}
          multiple={f.type === 'photos'}
          drawingNeeded={f.drawing === 'needed'}
          photos={api.photos.filter((p) => p.slot === slot)}
          actions={api.actions}
        />
      </div>
    );
  }

  const send = (api.answers.send as Record<string, boolean> | undefined) ?? {};
  const sent = !!f.canSend && send[slot] === true;
  const inputId = `in-${slot}`;
  let input: ReactNode = null;
  switch (f.type) {
    case 'choice':
    case 'band': {
      const suggestion = f.id === 'L17' && roofId ? api.ev.suggestions[roofId] : undefined;
      input = (
        <>
          {suggestion && (
            <p className="svf-note">
              <strong>Suggested: {f.options?.find((o) => o.key === suggestion.verdict)?.label}.</strong> {suggestion.reasons.join('. ')}.
            </p>
          )}
          <Pills
            label={f.label}
            options={f.options ?? []}
            value={typeof value === 'string' ? value : null}
            suggested={suggestion?.verdict}
            disabled={dis}
            onPick={(k) => api.set(f.id, k, roofId)}
          />
          {value === 'other' && (
            <input
              className="svf-input"
              aria-label={`${f.label}: say what`}
              placeholder="Say what"
              value={String(src[`${f.id}_other`] ?? '')}
              disabled={dis}
              onChange={(e) => set(e.target.value, `${f.id}_other`)}
            />
          )}
        </>
      );
      break;
    }
    case 'multi': {
      const list = Array.isArray(value) ? value.map(String) : [];
      input = (
        <div className="svf-chips" role="group" aria-label={f.label}>
          {(f.options ?? []).map((o) => {
            const on = list.includes(o.key);
            return (
              <button
                key={o.key}
                type="button"
                className={on ? 'svf-pill is-on' : 'svf-pill'}
                aria-pressed={on}
                disabled={dis}
                onClick={() => {
                  if (o.key === 'none') set(on ? null : ['none']);
                  else set(on ? list.filter((k) => k !== o.key) : [...list.filter((k) => k !== 'none'), o.key]);
                }}
              >
                {on ? '✓ ' : ''}
                {o.label}
              </button>
            );
          })}
        </div>
      );
      break;
    }
    case 'yesno':
      input = (
        <Pills
          label={f.label}
          options={[
            { key: 'yes', label: 'Yes' },
            { key: 'no', label: 'No' },
          ]}
          value={value === true ? 'yes' : value === false ? 'no' : null}
          disabled={dis}
          onPick={(k) => set(k === 'yes')}
        />
      );
      break;
    case 'text':
      input = <input id={inputId} className="svf-input" value={typeof value === 'string' ? value : ''} disabled={dis} onChange={(e) => set(e.target.value)} />;
      break;
    case 'longtext':
      input = (
        <>
          <textarea
            id={inputId}
            className="svf-input svf-textarea"
            rows={4}
            value={typeof value === 'string' ? value : ''}
            disabled={dis}
            onChange={(e) => set(e.target.value)}
          />
          {f.noneChip && !dis && !(typeof value === 'string' && value.trim()) && (
            <div className="svf-chips">
              <button type="button" className="svf-pill" onClick={() => set(f.noneChip)}>
                {f.noneChip}
              </button>
            </div>
          )}
        </>
      );
      break;
    case 'number':
      input = <NumberField label={f.label} chips={f.chips} unit={f.unit} value={value} disabled={dis} onChange={(v) => set(v)} />;
      break;
    case 'pitch':
      input = <PitchField label={f.label} chips={f.chips} value={value} disabled={dis} onChange={(v) => set(v)} />;
      break;
    case 'compass':
      input = <CompassField value={value} disabled={dis} onChange={(v) => set(v)} />;
      break;
    case 'dims':
      input = <DimsField label={f.label} chips={f.chips} unit={f.unit} value={value} disabled={dis} onChange={(v) => set(v)} />;
      break;
    case 'address': {
      const v = (value ?? {}) as { address?: string; postcode?: string };
      input = (
        <div className="svf-stack">
          <input
            id={inputId}
            className="svf-input"
            aria-label="Address"
            placeholder="Address"
            autoComplete="street-address"
            value={v.address ?? ''}
            disabled={dis}
            onChange={(e) => set({ ...v, address: e.target.value })}
          />
          <input
            className="svf-input svf-input--short"
            aria-label="Postcode"
            placeholder="Postcode"
            autoComplete="postal-code"
            autoCapitalize="characters"
            value={v.postcode ?? ''}
            disabled={dis}
            onChange={(e) => set({ ...v, postcode: e.target.value.toUpperCase() })}
          />
        </div>
      );
      break;
    }
    case 'system':
      input = <SystemField value={value} roofs={api.roofs} battery={hasBattery(api.answers)} disabled={dis} onChange={(v) => set(v)} />;
      break;
    case 'signature': {
      const s = (value ?? null) as { name?: string; at?: string } | null;
      input = (
        <div className="svf-stack">
          <p className={s?.name ? 'svf-note svf-note--ok' : 'svf-help'}>
            {s?.name ? `✓ Signed by ${s.name}${s.at ? ` at ${UK_TIME.format(new Date(s.at))}` : ''}` : 'Not signed yet.'}
          </p>
          {!dis && (
            <button type="button" className="svf-btn svf-btn--wide" onClick={api.openSignOff}>
              ✍ {s?.name ? 'Sign again' : 'Customer sign-off'}
            </button>
          )}
        </div>
      );
      break;
    }
  }

  const hasInput = f.type === 'text' || f.type === 'longtext' || f.type === 'address';
  return (
    <div className={needed ? 'svf-field is-needed' : 'svf-field'} id={`f-${slot}`}>
      <div className="svf-label">
        {hasInput ? <label htmlFor={inputId}>{f.label}</label> : <span>{f.label}</span>}
        {needed ? <span className="svf-badge svf-badge--need">Needed</span> : done ? <span className="svf-badge svf-badge--done">✓</span> : null}
      </div>
      {f.help && <p className="svf-help">{f.help}</p>}
      {sent ? <p className="svf-note svf-note--ok">✓ The customer will send this.</p> : input}
      {f.canSend && !dis && (
        <div className="svf-chips">
          <button type="button" className={sent ? 'svf-pill is-on' : 'svf-pill'} aria-pressed={sent} onClick={() => api.toggleSend(slot)}>
            {sent ? '✓ ' : ''}Customer will send
          </button>
        </div>
      )}
      {warnings.map((w) => (
        <p key={w.message} className="svf-warn">
          ⚠ {w.message}
        </p>
      ))}
      {blocks.map((b) => (
        <p key={b.message} className="svf-block" role="alert">
          ⛔ {b.message}
        </p>
      ))}
    </div>
  );
}

function Pills({
  label,
  options,
  value,
  suggested,
  disabled,
  onPick,
}: {
  label: string;
  options: { key: string; label: string; block?: string }[];
  value: string | null;
  suggested?: string;
  disabled: boolean;
  onPick: (key: string) => void;
}) {
  return (
    <div className="svf-chips" role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const on = value === o.key;
        const cls = ['svf-pill', on && 'is-on', o.block && 'is-bad', !on && suggested === o.key && 'is-suggested'].filter(Boolean).join(' ');
        return (
          <button key={o.key} type="button" role="radio" aria-checked={on} className={cls} disabled={disabled} onClick={() => onPick(o.key)}>
            {on ? '✓ ' : ''}
            {o.label}
            {!on && suggested === o.key ? ' (suggested)' : ''}
          </button>
        );
      })}
    </div>
  );
}

/** A number box that lets you type "2." on the way to "2.5" (the answer is saved as you type). */
function NumberBox({ value, label, unit, disabled, onChange }: { value: unknown; label: string; unit?: string; disabled: boolean; onChange: (v: number | null) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (typeof value === 'number' && Number.isFinite(value) ? String(value) : '');
  return (
    <div className="svf-numbox">
      <input
        className="svf-input svf-input--num"
        inputMode="decimal"
        aria-label={label}
        value={shown}
        disabled={disabled}
        onFocus={() => setDraft(shown)}
        onBlur={() => setDraft(null)}
        onChange={(e) => {
          const t = e.target.value.replace(',', '.');
          setDraft(t);
          if (!t.trim()) onChange(null);
          else if (Number.isFinite(Number(t))) onChange(Number(t));
        }}
      />
      {unit && <span className="svf-unit">{unit}</span>}
    </div>
  );
}

function NumberField({
  label,
  chips,
  unit,
  value,
  disabled,
  onChange,
}: {
  label: string;
  chips?: (string | number)[];
  unit?: string;
  value: unknown;
  disabled: boolean;
  onChange: (v: number | null) => void;
}) {
  const [other, setOther] = useState(false);
  const list = (chips ?? []).map(Number).filter(Number.isFinite);
  const isChip = typeof value === 'number' && list.includes(value);
  const box = !list.length || other || (value != null && !isChip);
  return (
    <>
      {list.length > 0 && (
        <div className="svf-chips" role="radiogroup" aria-label={label}>
          {list.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={value === c}
              className={value === c ? 'svf-pill is-on' : 'svf-pill'}
              disabled={disabled}
              onClick={() => {
                setOther(false);
                onChange(c);
              }}
            >
              {value === c ? '✓ ' : ''}
              {c}
              {unit && unit !== '°' ? ` ${unit}` : unit}
            </button>
          ))}
          <button type="button" className={box && !isChip ? 'svf-pill is-on' : 'svf-pill'} disabled={disabled} onClick={() => setOther(true)}>
            Other
          </button>
        </div>
      )}
      {box && <NumberBox value={isChip ? null : value} label={label} unit={unit} disabled={disabled} onChange={onChange} />}
    </>
  );
}

function PitchField({ label, chips, value, disabled, onChange }: { label: string; chips?: (string | number)[]; value: unknown; disabled: boolean; onChange: (v: number | null) => void }) {
  const stop = useRef<(() => void) | null>(null);
  const [reading, setReading] = useState<number | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    const r = stop;
    return () => r.current?.();
  }, []);

  async function start() {
    setMsg(null);
    const s = await watchPitch((deg) => setReading(deg));
    if (!s) {
      setMsg('This phone can’t measure the pitch, or it wasn’t allowed to. Pick the nearest instead.');
      return;
    }
    stop.current = s;
    setMeasuring(true);
  }

  function end(use: boolean) {
    stop.current?.();
    stop.current = null;
    setMeasuring(false);
    if (use && reading != null) onChange(reading);
    setReading(null);
  }

  return (
    <>
      <NumberField label={label} chips={chips} unit="°" value={value} disabled={disabled} onChange={onChange} />
      {!disabled &&
        (measuring ? (
          <div className="svf-measure" role="status">
            <p>Lay the phone along a rafter, long edge down the slope.</p>
            <p className="svf-measure__value">{reading != null ? `${reading}°` : 'Reading…'}</p>
            <div className="svf-row">
              <button type="button" className="svf-btn svf-btn--ghost" onClick={() => end(false)}>
                Stop
              </button>
              <button type="button" className="svf-btn svf-btn--solar" disabled={reading == null} onClick={() => end(true)}>
                Use {reading ?? ''}°
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="svf-btn svf-btn--ghost svf-btn--wide" onClick={() => void start()}>
            📐 Measure with the phone
          </button>
        ))}
      {msg && <p className="svf-help">{msg}</p>}
    </>
  );
}

const COMPASS_GRID: (string | null)[][] = [
  ['NW', 'N', 'NE'],
  ['W', null, 'E'],
  ['SW', 'S', 'SE'],
];

function CompassField({ value, disabled, onChange }: { value: unknown; disabled: boolean; onChange: (v: number | null) => void }) {
  const stop = useRef<(() => void) | null>(null);
  const [facing, setFacing] = useState<number | null>(null);
  const [live, setLive] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const picked = typeof value === 'number' && Number.isFinite(value) ? nearestCompass(value) : null;
  useEffect(() => {
    const r = stop;
    return () => r.current?.();
  }, []);

  async function start() {
    setMsg(null);
    const s = await watchCompass((heading) => setFacing(nearestCompass(roofFacingFromLooking(heading))));
    if (!s) {
      setMsg('This phone has no compass, or it wasn’t allowed to use it. Tap the nearest direction instead.');
      return;
    }
    stop.current = s;
    setLive(true);
  }

  function end(use: boolean) {
    stop.current?.();
    stop.current = null;
    setLive(false);
    if (use && facing != null) onChange(facing);
    setFacing(null);
  }

  return (
    <>
      <div className="svf-compass" role="radiogroup" aria-label="Direction the roof faces">
        {COMPASS_GRID.flat().map((p, i) => {
          if (!p) {
            return (
              <button key="c" type="button" className="svf-compass__mid" disabled={disabled || live} onClick={() => void start()} aria-label="Use the phone’s compass">
                🧭
                <small>Compass</small>
              </button>
            );
          }
          const deg = COMPASS_POINTS.indexOf(p as (typeof COMPASS_POINTS)[number]) * 45;
          const on = picked === deg;
          return (
            <button key={`${p}-${i}`} type="button" role="radio" aria-checked={on} className={on ? 'svf-pill is-on' : 'svf-pill'} disabled={disabled} onClick={() => onChange(deg)}>
              {on ? '✓ ' : ''}
              {p}
            </button>
          );
        })}
      </div>
      {live && (
        <div className="svf-measure" role="status">
          <p>Stand facing the roof slope and hold the phone flat, top edge pointing at the roof.</p>
          <p className="svf-measure__value">{facing != null ? `Faces ${compassLabel(facing)}` : 'Reading…'}</p>
          <div className="svf-row">
            <button type="button" className="svf-btn svf-btn--ghost" onClick={() => end(false)}>
              Stop
            </button>
            <button type="button" className="svf-btn svf-btn--solar" disabled={facing == null} onClick={() => end(true)}>
              Use {facing != null ? compassLabel(facing) : ''}
            </button>
          </div>
        </div>
      )}
      {msg && <p className="svf-help">{msg}</p>}
    </>
  );
}

function DimsField({
  label,
  chips,
  unit,
  value,
  disabled,
  onChange,
}: {
  label: string;
  chips?: (string | number)[];
  unit?: string;
  value: unknown;
  disabled: boolean;
  onChange: (v: unknown) => void;
}) {
  const [other, setOther] = useState(false);
  const list = (chips ?? []).map(String);
  const custom = value && typeof value === 'object' ? (value as { w?: number; d?: number }) : null;
  const box = other || !!custom || !list.length;
  return (
    <>
      <div className="svf-chips" role="radiogroup" aria-label={label}>
        {list.map((c) => {
          const on = value === c;
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={on}
              className={on ? 'svf-pill is-on' : 'svf-pill'}
              disabled={disabled}
              onClick={() => {
                setOther(false);
                onChange(c);
              }}
            >
              {on ? '✓ ' : ''}
              {c.replace('x', ' × ')}
            </button>
          );
        })}
        {list.length > 0 && (
          <button type="button" className={box ? 'svf-pill is-on' : 'svf-pill'} disabled={disabled} onClick={() => setOther(true)}>
            Other
          </button>
        )}
      </div>
      {box && (
        <div className="svf-row svf-row--dims">
          <NumberBox value={custom?.w} label={`${label}: width`} unit={unit} disabled={disabled} onChange={(w) => onChange(w == null && !custom?.d ? null : { ...custom, w })} />
          <span aria-hidden="true">×</span>
          <NumberBox value={custom?.d} label={`${label}: depth`} unit={unit} disabled={disabled} onChange={(d) => onChange(d == null && !custom?.w ? null : { ...custom, d })} />
        </div>
      )}
    </>
  );
}

function SystemField({ value, roofs, battery, disabled, onChange }: { value: unknown; roofs: RoofAnswers[]; battery: boolean; disabled: boolean; onChange: (v: unknown) => void }) {
  const z = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const put = (k: string, v: unknown) => {
    const next = withValue(z, k, v);
    onChange(Object.keys(next).length ? next : null);
  };
  const faces = Array.isArray(z.faces) ? z.faces.map(String) : [];
  return (
    <div className="svf-system">
      <div className="svf-grid2">
        <label className="svf-sub">
          Panels
          <NumberBox value={z.panels} label="Number of panels" disabled={disabled} onChange={(v) => put('panels', v)} />
        </label>
        <label className="svf-sub">
          Size
          <NumberBox value={z.kwp} label="System size in kWp" unit="kWp" disabled={disabled} onChange={(v) => put('kwp', v)} />
        </label>
        <label className="svf-sub">
          Inverter size
          <NumberBox value={z.inverterKw} label="Inverter size in kW" unit="kW" disabled={disabled} onChange={(v) => put('inverterKw', v)} />
        </label>
        {battery && (
          <label className="svf-sub">
            Battery
            <NumberBox value={z.batteryKwh} label="Battery size in kWh" unit="kWh" disabled={disabled} onChange={(v) => put('batteryKwh', v)} />
          </label>
        )}
      </div>
      <label className="svf-sub">
        Inverter make and model
        <input className="svf-input" value={typeof z.inverter === 'string' ? z.inverter : ''} disabled={disabled} onChange={(e) => put('inverter', e.target.value)} />
      </label>
      {roofs.length > 1 && (
        <>
          <p className="svf-sub">Roof areas with panels</p>
          <div className="svf-chips">
            {roofs.map((r, i) => {
              const on = faces.includes(r.id);
              return (
                <button
                  key={r.id}
                  type="button"
                  className={on ? 'svf-pill is-on' : 'svf-pill'}
                  aria-pressed={on}
                  disabled={disabled}
                  onClick={() => put('faces', on ? faces.filter((x) => x !== r.id) : [...faces, r.id])}
                >
                  {on ? '✓ ' : ''}
                  {roofName(r, i)}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ── The Finish screen ────────────────────────────────────────────────────────── */

const DNO_WORDS = { g98: 'G98: tell the DNO after', g99: 'G99: apply first', unknown: 'Not known yet' } as const;
const PLANNING_WORDS = { permitted: 'Permitted development', check: 'Check with the council', consent: 'Listed building consent' } as const;
const STRUCTURAL_WORDS = { desktop_ok: 'Desktop check', engineer: 'Structural engineer', not_suitable: 'Not suitable', unknown: 'Not known yet' } as const;

function FinishScreen({
  api,
  ctx,
  section,
  signed,
  canFinish,
  finishing,
  locked,
  runTodo,
  onJump,
  onDraw,
  onRun,
  onFinish,
}: {
  api: Api;
  ctx: Ctx;
  section: Section | undefined;
  signed: { name?: string; at?: string } | null;
  canFinish: boolean;
  finishing: boolean;
  locked: boolean;
  runTodo: number;
  onJump: (m: Miss) => void;
  onDraw: (m: Miss) => void;
  onRun: () => void;
  onFinish: () => void;
}) {
  const [restSkipped, setRestSkipped] = useState(false);
  const { ev } = api;
  const red = ev.flags.filter((f) => f !== 'Drawings to do');
  const field = (id: string) => section?.fields.find((f) => f.id === id);
  const z1 = field('Z1');
  const z6 = field('Z6');
  const z8 = field('Z8');
  return (
    <div className="svf-finish">
      {ev.missing.length > 0 ? (
        <section className="svf-card svf-card--need" aria-label="Still needed">
          <h3>Still needed ({ev.missing.length})</h3>
          <p className="svf-help">Tap one to go to it.</p>
          <ul className="svf-list">
            {ev.missing.map((m) => (
              <li key={`${m.field}:${m.roofId ?? ''}`}>
                <button type="button" className="svf-list__btn" onClick={() => onJump(m)}>
                  <span>{m.label}</span>
                  <span className="svf-list__where">{SCREENS[m.screen]?.title} ›</span>
                </button>
              </li>
            ))}
          </ul>
          {runTodo > 0 && !locked && (
            <button type="button" className="svf-btn svf-btn--solar svf-btn--wide" onClick={onRun}>
              📷 Take the photos ({runTodo})
            </button>
          )}
        </section>
      ) : (
        !locked && <p className="svf-card svf-card--ok">✓ Everything needed is done.</p>
      )}

      {ev.blocks.map((b) => (
        <p key={b.field + b.message} className="svf-block" role="alert">
          ⛔ {b.message}
        </p>
      ))}

      {ev.drawingsToDo.length > 0 && (
        <section className="svf-card" aria-label="Drawings to do">
          <h3>Drawings to do</h3>
          <p className="svf-help">Do them now, or later in the van. They don’t stop you finishing.</p>
          <ul className="svf-list">
            {ev.drawingsToDo.map((m) => (
              <li key={`${m.field}:${m.roofId ?? ''}`}>
                <button type="button" className="svf-list__btn" onClick={() => onDraw(m)}>
                  <span>✎ {m.label}</span>
                  <span className="svf-list__where">Draw ›</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {red.length > 0 && (
        <section className="svf-card svf-card--flags" aria-label="Red flags">
          <h3>Red flags ({red.length})</h3>
          <ul className="svf-flags">
            {red.map((f) => (
              <li key={f}>⚑ {f}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="svf-card" aria-label="What it means">
        <h3>What it means</h3>
        <dl className="svf-extras">
          <dt>DNO route</dt>
          <dd>
            <strong>{DNO_WORDS[ev.summary.dnoRoute]}</strong>
            <span>{ev.summary.dnoNote}</span>
          </dd>
          <dt>Planning</dt>
          <dd>
            <strong>{PLANNING_WORDS[ev.summary.planning]}</strong>
            <span>{ev.summary.planningNote}</span>
          </dd>
          <dt>Structural</dt>
          <dd>
            <strong>{STRUCTURAL_WORDS[ev.summary.structural]}</strong>
          </dd>
        </dl>
      </section>

      {z1 && <FieldView f={z1} ctx={ctx} api={api} />}
      {z6 && <FieldView f={z6} ctx={ctx} api={api} />}
      {z8 && <FieldView f={z8} ctx={ctx} api={api} />}

      {ev.notFilled.length > 0 &&
        (restSkipped ? (
          <p className="svf-help">
            {ev.notFilled.length} not filled: they won’t stop you finishing.{' '}
            <button type="button" className="svf-link" onClick={() => setRestSkipped(false)}>
              Show them
            </button>
          </p>
        ) : (
          <details className="svf-card svf-notfilled">
            <summary>Not filled ({ev.notFilled.length})</summary>
            <p className="svf-help">Worth doing, but they never stop you finishing.</p>
            <ul className="svf-list">
              {ev.notFilled.map((m) => (
                <li key={`${m.field}:${m.roofId ?? ''}`}>
                  <button type="button" className="svf-list__btn" onClick={() => onJump(m)}>
                    <span>{m.label}</span>
                    <span className="svf-list__where">{SCREENS[m.screen]?.title} ›</span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="svf-btn svf-btn--ghost svf-btn--wide" onClick={() => setRestSkipped(true)}>
              Skip the rest
            </button>
          </details>
        ))}

      {!locked && !finishing && (
        <div className="svf-finish__go">
          <button type="button" className="svf-btn svf-btn--solar svf-btn--huge" disabled={!canFinish} onClick={onFinish}>
            ✓ Finish on site
          </button>
          <p className="svf-help">
            {canFinish
              ? `${signed?.name ? `Signed by ${signed.name}. ` : 'Not signed by the customer yet. '}Works with no signal: photos still uploading carry on by themselves.`
              : ev.blocks.length
                ? 'Fix the problem above first.'
                : `${ev.missing.length} thing${ev.missing.length === 1 ? '' : 's'} still needed: ${missingWords(ev.missing)}.`}
          </p>
        </div>
      )}
    </div>
  );
}

/* ── Sheets ───────────────────────────────────────────────────────────────────── */

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="svf-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="svf-sheet__panel">
        <div className="svf-sheet__head">
          <strong>{title}</strong>
          <button type="button" className="svf-btn svf-btn--ghost" onClick={onClose}>
            ✕ Close
          </button>
        </div>
        <div className="svf-sheet__body">{children}</div>
      </div>
    </div>
  );
}

function SaidSheet({ onClose, onSave }: { onClose: () => void; onSave: (text: string) => void }) {
  const [text, setText] = useState('');
  const clean = text.replace(/\s+/g, ' ').trim();
  return (
    <Sheet title="Customer said…" onClose={onClose}>
      <p className="svf-help">Saved with the time under Requests from the customer.</p>
      <input
        className="svf-input"
        autoFocus
        value={text}
        maxLength={300}
        placeholder="e.g. would like the battery in the garage"
        aria-label="What the customer said"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && clean && onSave(clean)}
      />
      <button type="button" className="svf-btn svf-btn--solar svf-btn--wide" disabled={!clean} onClick={() => onSave(clean)}>
        Save
      </button>
    </Sheet>
  );
}

function SkipSheet({ title, onClose, onSave }: { title: string; onClose: () => void; onSave: (reason: string) => void }) {
  const [text, setText] = useState('');
  const clean = text.replace(/\s+/g, ' ').trim();
  return (
    <Sheet title={`Couldn’t check: ${title}`} onClose={onClose}>
      <p className="svf-help">Its questions are skipped and a red flag says why.</p>
      <div className="svf-chips">
        {SKIP_REASONS.map((r) => (
          <button key={r} type="button" className="svf-pill" onClick={() => onSave(r)}>
            {r}
          </button>
        ))}
      </div>
      <input className="svf-input" value={text} maxLength={200} placeholder="Or say why" aria-label="Why it couldn’t be checked" onChange={(e) => setText(e.target.value)} />
      <button type="button" className="svf-btn svf-btn--wide" disabled={!clean} onClick={() => onSave(clean)}>
        Save
      </button>
    </Sheet>
  );
}

/**
 * The customer's sign-off: their typed name first, then the signature. The signature pad clears
 * itself when the screen changes size, so the keyboard is closed before it appears.
 */
function SignOffSheet({
  surveyId,
  customerName,
  signed,
  onClose,
  onSave,
  onClear,
}: {
  surveyId: string;
  customerName: string;
  signed: { name?: string; at?: string } | null;
  onClose: () => void;
  onSave: (name: string, image: string) => void;
  onClear: () => void;
}) {
  const [step, setStep] = useState<'show' | 'name' | 'sign'>(signed?.name ? 'show' : 'name');
  const [name, setName] = useState(signed?.name || customerName);
  const [image, setImage] = useState<string | null>(null);
  const [kept, setKept] = useState<string | null>(null);
  useEffect(() => {
    if (!signed?.name) return;
    let alive = true;
    void getSignature(surveyId).then((s) => alive && setKept(s));
    return () => {
      alive = false;
    };
  }, [surveyId, signed?.name]);
  const clean = name.replace(/\s+/g, ' ').trim();

  return (
    <Sheet title="Customer sign-off" onClose={onClose}>
      {step === 'show' && (
        <div className="svf-stack">
          <p className="svf-note svf-note--ok">
            ✓ Signed by {signed?.name}
            {signed?.at ? ` at ${UK_TIME.format(new Date(signed.at))}` : ''}
          </p>
          {kept && (
            // eslint-disable-next-line @next/next/no-img-element -- a data URL kept on the phone
            <img className="svf-sig" src={kept} alt={`Signature of ${signed?.name}`} />
          )}
          <button type="button" className="svf-btn svf-btn--wide" onClick={() => setStep('name')}>
            Sign again
          </button>
          <button type="button" className="svf-btn svf-btn--danger svf-btn--wide" onClick={() => window.confirm('Remove the signature?') && onClear()}>
            Remove the signature
          </button>
        </div>
      )}
      {step === 'name' && (
        <div className="svf-stack">
          <label className="svf-label" htmlFor="svf-signed-name">
            Customer’s name
          </label>
          <input
            id="svf-signed-name"
            className="svf-input"
            value={name}
            autoComplete="name"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && clean) {
                e.currentTarget.blur();
                setStep('sign');
              }
            }}
          />
          <button
            type="button"
            className="svf-btn svf-btn--solar svf-btn--wide"
            disabled={!clean}
            onClick={() => {
              (document.activeElement as HTMLElement | null)?.blur?.();
              setStep('sign');
            }}
          >
            Next: sign
          </button>
        </div>
      )}
      {step === 'sign' && (
        <div className="svf-stack">
          <p className="svf-agree">“I agree the kit locations and cable routes we discussed.”</p>
          <p className="svf-help">{clean}, sign below with your finger.</p>
          <SignaturePad onChange={setImage} height={180} />
          <div className="svf-row">
            <button type="button" className="svf-btn svf-btn--ghost" onClick={() => setStep('name')}>
              ← Name
            </button>
            <button type="button" className="svf-btn svf-btn--solar svf-btn--grow" disabled={!image} onClick={() => image && onSave(clean, image)}>
              Save signature
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
