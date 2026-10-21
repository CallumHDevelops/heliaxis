'use client';

import { siteFetch, uploadTimeoutMs, type Outcome } from './client';
import { byJob, changed, delRec, getDevice, getPack, getRec, mergeServer, putRec, updateDevice, updatePack, type DraftRecord, type FileRecord, type PackRecord, type PhotoRecord } from './offline';
import { packChanges, type SiteJobRow, type SitePack } from './pack-shared';

/**
 * Job packs onto the phone: the pack itself, then its files (drawings, design PDFs, the survey's
 * reference photos, the thumbnails of photos already on the server) as blobs, so all of it opens
 * with no signal. A refresh never touches the answers given on this phone; what the office changed
 * shows as "Updated by the office: start date, access notes".
 */

export type ReadyStep = { details: boolean; design: number | null; drawings: number | null; offline: boolean | null; missing: number };

/**
 * One file from its signed link, or null. A stalled download gives up (two minutes for storage to
 * answer, then a minute plus about 10 KB/s for its size, as an upload), so one slow drawing can't
 * hold up the rest of the pack; it counts as missing and comes with the next refresh.
 */
export async function fetchBlob(url: string, firstMs = 120_000, bodyMs: (bytes: number) => number = uploadTimeoutMs): Promise<Blob | null> {
  const ctl = new AbortController();
  let timer = setTimeout(() => ctl.abort(), firstMs);
  try {
    const r = await fetch(url, { credentials: 'omit', signal: ctl.signal });
    if (!r.ok) return null;
    clearTimeout(timer);
    timer = setTimeout(() => ctl.abort(), bodyMs(Number(r.headers.get('content-length')) || 0));
    return await r.blob();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function keepFile(assignmentId: string, id: string, name: string, mime: string, url: string): Promise<boolean> {
  if (await getRec<FileRecord>('files', id)) return true;
  const blob = await fetchBlob(url);
  if (!blob) return false;
  try {
    await putRec('files', { id, assignmentId, name, mime: mime || blob.type, blob, storedAt: new Date().toISOString() } satisfies FileRecord);
    return true;
  } catch {
    return false;
  }
}

/** Download one job's pack and its files. onStep ticks the "Getting your job ready" list (P2). */
export async function downloadPack(id: string, onStep?: (s: ReadyStep) => void): Promise<Outcome<PackRecord>> {
  const r = await siteFetch<SitePack>(`/api/site/jobs/${id}/pack`, { job: id });
  if (!r.ok) return r;
  const pack = r.data;
  const was = await getPack(id);
  const changes = was && was.version !== pack.version ? [...new Set([...(was.changes ?? []), ...packChanges(was.pack, pack)])] : (was?.changes ?? []);
  // What a sign-off left on the phone stays: the gate's list until that stage is signed, a put right's until it's sent.
  const gate = was?.gate && !pack.assignment.signoffs.some((x) => x.stage === was.gate?.stage) ? was.gate : undefined;
  const putRightGate = was?.putRightGate && pack.returns?.some((r) => r.n === was.putRightGate?.n && r.status === 'open') ? was.putRightGate : undefined;
  const rec: PackRecord = { id, pack, version: pack.version, storedAt: new Date().toISOString(), changes, ...(gate ? { gate } : {}), ...(putRightGate ? { putRightGate } : {}) };
  await putRec('packs', rec);
  const step: ReadyStep = { details: true, design: null, drawings: null, offline: null, missing: 0 };
  onStep?.({ ...step });

  // The answers: only the keys this phone hasn't changed take the server's (another phone's) values.
  const draft = await getRec<DraftRecord>('drafts', id);
  if (draft && pack.assignment.rev > draft.baseRev) await mergeServer(id, pack.assignment.answers, pack.assignment.rev);

  const design = pack.files.filter((f) => f.kind === 'design');
  const drawings = pack.files.filter((f) => f.kind !== 'design');
  let got = 0;
  for (const f of design) if (await keepFile(id, f.id, f.name, f.mime, f.url)) got++;
  step.design = got;
  step.missing += design.length - got;
  onStep?.({ ...step });
  got = 0;
  for (const f of drawings) if (await keepFile(id, f.id, f.name, f.mime, f.url)) got++;
  step.drawings = got;
  step.missing += drawings.length - got;
  onStep?.({ ...step });
  for (const p of pack.photos) if (p.thumb) await keepFile(id, `thumb:${p.id}`, `${p.slot}.jpg`, 'image/jpeg', p.thumb);
  // An electrician's: the roofer's evidence photos (the PV inspection), and the certificate files already sent.
  for (const p of pack.electrician?.roofer_photos ?? []) if (p.thumb) await keepFile(id, `thumb:${p.id}`, `${p.slot}.jpg`, 'image/jpeg', p.thumb);
  for (const f of pack.electrician?.uploads ?? []) if (f.url) await keepFile(id, `upload:${f.id}`, f.name, f.mime, f.url);

  // The PO once it has been issued: its PDF, to open with no signal (each version once).
  let poFile: string | null = null;
  const version = Number((pack.po?.labour as { version?: unknown } | null)?.version) || 0;
  if (pack.po && version > 0) {
    poFile = `po:${pack.po.id}:v${version}`;
    if (!(await getRec<FileRecord>('files', poFile))) {
      const po = await siteFetch<{ url: string | null }>(`/api/site/jobs/${id}/po`, { job: id });
      if (po.ok && po.data.url) await keepFile(id, poFile, `${pack.po.po_number}.pdf`, 'application/pdf', po.data.url);
    }
  }

  // Files the office has since taken off the job go from the phone too.
  const keep = new Set([
    ...pack.files.map((f) => f.id),
    ...pack.photos.map((p) => `thumb:${p.id}`),
    ...(pack.electrician?.roofer_photos ?? []).map((p) => `thumb:${p.id}`),
    ...(pack.electrician?.uploads ?? []).map((f) => `upload:${f.id}`),
    ...(poFile ? [poFile] : []),
  ]);
  for (const f of await byJob<FileRecord>('files', id)) if (!keep.has(f.id)) await delRec('files', f.id);

  const d = await getDevice();
  if (d && !d.jobs.includes(id)) await updateDevice({ jobs: [...d.jobs, id] });
  step.offline = await warmShell();
  onStep?.({ ...step });
  changed();
  return { ok: true, status: 200, data: rec };
}

/** Ask the service worker to keep the app's pages and scripts, so it opens after a cold start with no signal. */
export async function warmShell(timeoutMs = 15_000): Promise<boolean> {
  try {
    if (!('serviceWorker' in navigator)) return false;
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), timeoutMs))]);
    const sw = reg?.active;
    if (!sw) return false;
    return await new Promise<boolean>((resolve) => {
      const ch = new MessageChannel();
      const t = setTimeout(() => resolve(false), timeoutMs);
      ch.port1.onmessage = (e) => {
        clearTimeout(t);
        resolve((e.data as { ok?: boolean } | null)?.ok === true);
      };
      sw.postMessage({ type: 'WARM' }, [ch.port2]);
    });
  } catch {
    return false;
  }
}

let lastJobs = 0;
/**
 * The home list, and a pack for every job on it (a second job for the same person arrives this
 * way, without its link being opened on this phone). At most once a minute unless forced.
 */
export async function refreshJobs(force = false): Promise<Outcome<SiteJobRow[]>> {
  if (!force && Date.now() - lastJobs < 60_000) {
    const d = await getDevice();
    return { ok: true, status: 200, data: d?.home?.rows ?? [] };
  }
  const r = await siteFetch<{ jobs: SiteJobRow[] }>('/api/site/jobs');
  if (!r.ok) return r;
  lastJobs = Date.now();
  const rows = r.data.jobs ?? [];
  const d = await getDevice();
  await updateDevice({ home: { rows, at: new Date().toISOString() }, jobs: [...new Set([...(d?.jobs ?? []), ...rows.map((j) => j.id)])] });
  const listed = new Set(rows.map((j) => j.id));
  for (const j of rows) {
    if (j.status === 'cancelled') {
      await updatePack(j.id, (p) => ({ ...p, problem: p.problem ?? { kind: 'cancelled', message: 'This job was cancelled. Call the office on 01633 965205.', at: new Date().toISOString() } }));
      continue;
    }
    const p = await getPack(j.id);
    // A label photo from this phone that went up in the last hour: its read (suggestions) comes with the pack.
    const unread = !!p && (await byJob<PhotoRecord>('photos', j.id)).some((x) => x.read && x.uploadedId && Date.now() - Date.parse(x.takenAt) < 3_600_000 && !p.pack.reads.some((r) => r.photo_id === x.uploadedId));
    // New, or changed on the server since this phone's copy (rev counts answers from other phones too).
    // The PO issued or paid since (its PDF comes with the pack).
    const poMoved = !!p && ((p.pack.po?.status ?? null) !== (j.po?.status ?? null) || (p.pack.po?.sent_at ?? null) !== (j.po?.sent_at ?? null) || (p.pack.po?.paid_on ?? null) !== (j.po?.paid_on ?? null));
    // The office's review since: a return to site to put right, or the green light (its words come with the pack).
    const openHere = p ? Math.max(0, ...(p.pack.returns ?? []).filter((x) => x.status === 'open').map((x) => x.n)) : 0;
    const reviewMoved = !!p && ((p.pack.po?.review_status ?? null) !== (j.po?.review_status ?? null) || openHere !== (j.put_right?.n ?? 0));
    if (!p || unread || poMoved || reviewMoved || p.pack.assignment.rev !== j.rev || p.pack.assignment.status !== j.status || force || Date.now() - Date.parse(p.storedAt) > 30 * 60_000) await downloadPack(j.id);
  }
  for (const id of d?.jobs ?? []) {
    if (listed.has(id)) continue;
    await updatePack(id, (p) => ({ ...p, problem: p.problem ?? { kind: 'gone', message: 'This job isn’t on your list any more. Call the office on 01633 965205.', at: new Date().toISOString() } }));
  }
  return { ok: true, status: 200, data: rows };
}

/** "Updated by the office" seen. */
export const seenChanges = (id: string) => updatePack(id, (p) => ({ ...p, changes: [] }));
