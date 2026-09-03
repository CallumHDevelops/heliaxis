'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireManager, requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { TechnologyId } from '@/lib/types';

const TECHS: TechnologyId[] = [
  'solar_pv',
  'battery_storage',
  'ashp',
  'led_lighting',
  'small_wind',
];

const projectSchema = z.object({
  name: z.string().trim().min(2, 'Give the project a name.'),
  status: z.enum(['planning', 'active', 'on_hold', 'complete', 'cancelled']),
  sector: z.enum(['residential', 'commercial']),
  technologies: z.array(z.enum(TECHS as [TechnologyId, ...TechnologyId[]])).default([]),
  client_name: z.string().trim().optional(),
  client_contact: z.string().trim().optional(),
  client_phone: z.string().trim().optional(),
  client_email: z.string().trim().optional(),
  site_address: z.string().trim().optional(),
  site_postcode: z.string().trim().optional(),
  site_contact: z.string().trim().optional(),
  site_contact_phone: z.string().trim().optional(),
  what3words: z.string().trim().optional(),
  site_lat: z.number().min(-90).max(90).nullable(),
  site_lng: z.number().min(-180).max(180).nullable(),
  principal_contractor: z.string().trim().optional(),
  principal_designer: z.string().trim().optional(),
  cdm_notifiable: z.boolean().default(false),
  f10_reference: z.string().trim().optional(),
  start_date: z.string().trim().optional(),
  end_date: z.string().trim().optional(),
  access_notes: z.string().trim().optional(),
  welfare_notes: z.string().trim().optional(),
  nearest_hospital: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export type ProjectFormState = { error?: string; fieldErrors?: Record<string, string> };

function parse(formData: FormData) {
  const raw = {
    name: str(formData, 'name'),
    status: str(formData, 'status') || 'planning',
    sector: str(formData, 'sector') || 'residential',
    technologies: formData.getAll('technologies').map(String),
    client_name: str(formData, 'client_name'),
    client_contact: str(formData, 'client_contact'),
    client_phone: str(formData, 'client_phone'),
    client_email: str(formData, 'client_email'),
    site_address: str(formData, 'site_address'),
    site_postcode: str(formData, 'site_postcode'),
    site_contact: str(formData, 'site_contact'),
    site_contact_phone: str(formData, 'site_contact_phone'),
    what3words: str(formData, 'what3words'),
    site_lat: num(formData, 'site_lat'),
    site_lng: num(formData, 'site_lng'),
    principal_contractor: str(formData, 'principal_contractor'),
    principal_designer: str(formData, 'principal_designer'),
    cdm_notifiable: formData.get('cdm_notifiable') === 'on',
    f10_reference: str(formData, 'f10_reference'),
    start_date: str(formData, 'start_date'),
    end_date: str(formData, 'end_date'),
    access_notes: str(formData, 'access_notes'),
    welfare_notes: str(formData, 'welfare_notes'),
    nearest_hospital: str(formData, 'nearest_hospital'),
    notes: str(formData, 'notes'),
  };
  return projectSchema.safeParse(raw);
}

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === 'string' ? v.trim() : '';
}

/** Hidden numeric inputs post as strings, and as '' when never populated. */
function num(formData: FormData, key: string): number | null {
  const raw = str(formData, key);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Empty date strings must become null, not '' — Postgres rejects the latter. */
function nullable<T extends Record<string, unknown>>(values: T): T {
  const out = { ...values };
  for (const [k, v] of Object.entries(out)) {
    if (v === '') (out as Record<string, unknown>)[k] = null;
  }
  return out;
}

export async function createProject(
  _prev: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  await requireUser('/projects/new');

  const parsed = parse(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' };
  }

  const supabase = await createClient();

  const { data: reference, error: refError } = await supabase.rpc('next_project_reference');
  if (refError || !reference) {
    return { error: 'Could not allocate a project reference. Try again.' };
  }

  const { data, error } = await supabase
    .from('projects')
    .insert(nullable({ ...parsed.data, reference: reference as string }))
    .select('id')
    .single();

  if (error) return { error: error.message };

  revalidatePath('/projects');
  redirect(`/projects/${data.id}`);
}

export async function updateProject(
  _prev: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  await requireUser();

  const id = str(formData, 'id');
  if (!id) return { error: 'Missing project id.' };

  const parsed = parse(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('projects').update(nullable(parsed.data)).eq('id', id);
  if (error) return { error: error.message };

  revalidatePath(`/projects/${id}`);
  revalidatePath('/projects');
  redirect(`/projects/${id}`);
}

export async function deleteProject(formData: FormData) {
  await requireManager();
  const id = String(formData.get('id') ?? '');
  if (!id) return;

  const supabase = await createClient();
  await supabase.from('projects').delete().eq('id', id);

  revalidatePath('/projects');
  redirect('/projects');
}

export async function deleteProjectFile(formData: FormData) {
  await requireUser();
  const id = String(formData.get('id') ?? '');
  const projectId = String(formData.get('project_id') ?? '');
  const path = String(formData.get('file_path') ?? '');
  if (!id || !projectId) return;

  const supabase = await createClient();
  // Remove the row first: if the storage delete fails we'd rather have an
  // orphaned object than a row pointing at a file that no longer exists.
  await supabase.from('project_files').delete().eq('id', id);
  if (path) await supabase.storage.from('project-files').remove([path]);

  revalidatePath(`/projects/${projectId}`);
}
