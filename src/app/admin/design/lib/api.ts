/** Client calls for the Design studio API (projects, templates, uploads). */
import type { DesignDoc, PageGeometry, ProjectSummary, TemplateSummary, UploadItem } from '@/lib/design/types';

async function j<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error || `Request failed (${res.status})`);
  return body as T;
}
const post = (url: string, body: unknown, method = 'POST') =>
  fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' });

export const fileUrl = (path: string) => `/api/design/file?path=${encodeURIComponent(path)}`;

/* projects */
export async function listProjects() {
  return j<{ ready: boolean; items: ProjectSummary[] }>(await fetch('/api/design/projects', { credentials: 'same-origin' }));
}
export async function getProject(id: string) {
  return j<{ item: { id: string; name: string; format_id: string; doc: DesignDoc; updated_at: string } }>(
    await fetch(`/api/design/projects/${id}`, { credentials: 'same-origin' }),
  );
}
export async function createProject(name: string, doc: DesignDoc, thumb?: string) {
  return j<{ item: { id: string; name: string; updated_at: string } }>(await post('/api/design/projects', { name, doc, thumb }));
}
export async function saveProject(id: string, patch: { name?: string; doc?: DesignDoc; thumb?: string; archived?: boolean }) {
  return j<{ item: { id: string; name: string; updated_at: string } }>(await post(`/api/design/projects/${id}`, patch, 'PATCH'));
}
export async function deleteProject(id: string) {
  return j<{ deleted: true }>(await fetch(`/api/design/projects/${id}`, { method: 'DELETE', credentials: 'same-origin' }));
}

/* storage uploads: prepare → direct browser upload (Vercel caps request bodies ~4.5 MB) */
async function directUpload(prepareUrl: string, file: File): Promise<string> {
  const p = await j<{ bucket: string; path: string; token: string }>(
    await post(prepareUrl, { action: 'prepare', name: file.name, mime: file.type, size: file.size }),
  );
  const { createClient } = await import('@/lib/supabase/client');
  const up = await createClient().storage.from(p.bucket).uploadToSignedUrl(p.path, p.token, file, { contentType: file.type });
  if (up.error) throw new Error(up.error.message);
  return p.path;
}

/* templates */
export async function listTemplates() {
  return j<{ ready: boolean; items: TemplateSummary[] }>(await fetch('/api/design/templates', { credentials: 'same-origin' }));
}
export function uploadTemplatePdf(file: File) {
  return directUpload('/api/design/templates', file);
}
export async function saveTemplate(path: string, name: string, title: string | null, size: number, geometry: PageGeometry) {
  return j<{ item: TemplateSummary }>(await post('/api/design/templates', { action: 'save', path, name, title, size, geometry }));
}
export async function patchTemplate(id: string, patch: { name?: string; geometry?: PageGeometry }) {
  return j<{ item: TemplateSummary }>(await post(`/api/design/templates/${id}`, patch, 'PATCH'));
}
export async function deleteTemplate(id: string) {
  return j<{ deleted: true }>(await fetch(`/api/design/templates/${id}`, { method: 'DELETE', credentials: 'same-origin' }));
}
export async function fetchBytes(url: string): Promise<Uint8Array> {
  const r = await fetch(url, { credentials: 'same-origin' });
  if (!r.ok) throw new Error(`Couldn’t load the file (${r.status}).`);
  return new Uint8Array(await r.arrayBuffer());
}

/* uploads (team image library) */
export async function listUploads() {
  return j<{ items: UploadItem[] }>(await fetch('/api/design/uploads', { credentials: 'same-origin' }));
}
export function uploadImage(file: File) {
  return directUpload('/api/design/uploads', file);
}

/* local crash-recovery draft */
const DRAFT_KEY = 'hx-design:draft:v2';
export type LocalDraft = { doc: DesignDoc; name: string; projectId: string | null; at: number; page: number };
export function writeDraft(d: LocalDraft) {
  try {
    const s = JSON.stringify(d);
    if (s.length < 4_500_000) localStorage.setItem(DRAFT_KEY, s);
  } catch {
    /* private window / full storage — the cloud save still works */
  }
}
export function readDraft(): LocalDraft | null {
  try {
    const s = localStorage.getItem(DRAFT_KEY);
    return s ? (JSON.parse(s) as LocalDraft) : null;
  } catch {
    return null;
  }
}
export function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}
