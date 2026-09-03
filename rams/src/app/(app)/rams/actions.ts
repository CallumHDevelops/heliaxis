'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { isManager, requireManager, requireUser } from '@/lib/auth';
import { defaultContent } from '@/lib/content/defaults';
import { defaultTitle } from '@/lib/content/technologies';
import { getRams } from '@/lib/db';
import { expiryFromHours, generateToken, hashToken, shareUrl } from '@/lib/share';
import { MAX_EXPIRY_HOURS } from '@/lib/share-ui';
import { createClient } from '@/lib/supabase/server';
import type { RamsContent, RamsStatus, Sector, TechnologyId } from '@/lib/types';

const TECHS = ['solar_pv', 'battery_storage', 'ashp', 'led_lighting', 'small_wind'] as const;

export type ActionState = { error?: string; ok?: string };

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === 'string' ? v.trim() : '';
}

// --- Create ----------------------------------------------------------------

export async function createRams(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireUser('/rams/new');

  const parsed = z
    .object({
      project_id: z.string().uuid('Choose a project.'),
      technology: z.enum(TECHS),
      sector: z.enum(['residential', 'commercial']),
      title: z.string().trim().optional(),
      review_months: z.coerce.number().int().min(1).max(36).default(12),
    })
    .safeParse({
      project_id: str(formData, 'project_id'),
      technology: str(formData, 'technology'),
      sector: str(formData, 'sector'),
      title: str(formData, 'title'),
      review_months: str(formData, 'review_months') || '12',
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' };
  }

  const { project_id, technology, sector, review_months } = parsed.data;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from('projects')
    .select('reference')
    .eq('id', project_id)
    .single();
  if (!project) return { error: 'That project could not be found.' };

  // References are per-project and sequential: HX-2026-0007/RA-01.
  const { count } = await supabase
    .from('rams_documents')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', project_id);

  const reference = `${project.reference}/RA-${String((count ?? 0) + 1).padStart(2, '0')}`;

  const reviewDate = new Date();
  reviewDate.setMonth(reviewDate.getMonth() + review_months);

  const { data, error } = await supabase
    .from('rams_documents')
    .insert({
      project_id,
      reference,
      title: parsed.data.title || defaultTitle(technology as TechnologyId, sector as Sector),
      technology,
      sector,
      content: defaultContent(technology as TechnologyId, sector as Sector),
      review_date: reviewDate.toISOString().slice(0, 10),
      author_id: user.id,
    })
    .select('id')
    .single();

  if (error) return { error: error.message };

  revalidatePath('/rams');
  revalidatePath(`/projects/${project_id}`);
  redirect(`/rams/${data.id}`);
}

// --- Save the body ---------------------------------------------------------

export async function saveRamsContent(
  id: string,
  patch: { title?: string; review_date?: string | null; content: RamsContent }
): Promise<ActionState> {
  await requireUser();

  const supabase = await createClient();
  const update: Record<string, unknown> = { content: patch.content };
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.review_date !== undefined) update.review_date = patch.review_date || null;

  const { error } = await supabase.from('rams_documents').update(update).eq('id', id);
  if (error) return { error: error.message };

  revalidatePath(`/rams/${id}`);
  return { ok: 'Saved' };
}

// --- Status transitions ----------------------------------------------------

const NEXT: Record<RamsStatus, RamsStatus[]> = {
  draft: ['in_review'],
  in_review: ['draft', 'approved'],
  approved: ['in_review', 'issued'],
  issued: ['archived'],
  archived: ['draft'],
};

export async function setRamsStatus(formData: FormData) {
  const { user, profile } = await requireUser();

  const id = str(formData, 'id');
  const to = str(formData, 'status') as RamsStatus;
  if (!id || !to) return;

  const doc = await getRams(id);
  if (!doc) return;

  if (!NEXT[doc.status]?.includes(to)) return;

  // Approving and issuing are management acts — and nobody signs off their own
  // document, which is the whole point of the review step.
  if ((to === 'approved' || to === 'issued') && !isManager(profile)) return;
  if (to === 'approved' && doc.author_id === user.id && profile.role !== 'admin') return;

  const supabase = await createClient();
  const update: Record<string, unknown> = { status: to };

  if (to === 'approved') {
    update.approved_by = user.id;
    update.approved_at = new Date().toISOString();
  }
  if (to === 'issued') update.issued_at = new Date().toISOString();
  if (to === 'draft') {
    update.approved_by = null;
    update.approved_at = null;
    update.issued_at = null;
  }

  await supabase.from('rams_documents').update(update).eq('id', id);

  revalidatePath(`/rams/${id}`);
  revalidatePath('/rams');
}

/** Copy an issued document into a new version so the record stays immutable. */
export async function reviseRams(formData: FormData) {
  const { user } = await requireUser();
  const id = str(formData, 'id');
  if (!id) return;

  const doc = await getRams(id);
  if (!doc) return;

  const supabase = await createClient();
  const { data } = await supabase
    .from('rams_documents')
    .insert({
      project_id: doc.project_id,
      reference: doc.reference,
      title: doc.title,
      technology: doc.technology,
      sector: doc.sector,
      version: doc.version + 1,
      status: 'draft',
      content: doc.content,
      review_date: doc.review_date,
      author_id: user.id,
    })
    .select('id')
    .single();

  await supabase.from('rams_documents').update({ status: 'archived' }).eq('id', id);

  revalidatePath('/rams');
  if (data) redirect(`/rams/${data.id}`);
}

export async function deleteRams(formData: FormData) {
  await requireManager();
  const id = str(formData, 'id');
  if (!id) return;

  const supabase = await createClient();
  await supabase.from('rams_documents').delete().eq('id', id);

  revalidatePath('/rams');
  redirect('/rams');
}

// --- Briefing record -------------------------------------------------------

export async function addBriefing(formData: FormData) {
  const { profile } = await requireUser();

  const ramsId = str(formData, 'rams_id');
  const personName = str(formData, 'person_name');
  if (!ramsId || !personName) return;

  const supabase = await createClient();
  await supabase.from('rams_briefings').insert({
    rams_id: ramsId,
    person_name: personName,
    person_role: str(formData, 'person_role') || null,
    company: str(formData, 'company') || null,
    briefed_by: profile.full_name || profile.email,
    signed_at: str(formData, 'signed') === 'on' ? new Date().toISOString() : null,
  });

  revalidatePath(`/rams/${ramsId}`);
}

export async function removeBriefing(formData: FormData) {
  await requireUser();
  const id = str(formData, 'id');
  const ramsId = str(formData, 'rams_id');
  if (!id) return;

  const supabase = await createClient();
  await supabase.from('rams_briefings').delete().eq('id', id);

  revalidatePath(`/rams/${ramsId}`);
}

// --- Share links -----------------------------------------------------------

export type ShareState = ActionState & { url?: string };

export async function createShareLink(
  _prev: ShareState,
  formData: FormData
): Promise<ShareState> {
  const { user } = await requireUser();

  const ramsId = str(formData, 'rams_id');
  if (!ramsId) return { error: 'Missing document.' };

  const doc = await getRams(ramsId);
  if (!doc) return { error: 'That document could not be found.' };

  // A draft is not a controlled document — sharing one outside the business
  // would put unapproved controls in a client's hands.
  if (doc.status === 'draft' || doc.status === 'in_review') {
    return { error: 'Approve the document before sharing it externally.' };
  }

  const hours = Number(str(formData, 'hours')) || 168;
  if (!Number.isFinite(hours) || hours < 1 || hours > MAX_EXPIRY_HOURS) {
    return { error: `Choose an expiry between 1 hour and ${MAX_EXPIRY_HOURS / 24} days.` };
  }

  const maxViewsRaw = str(formData, 'max_views');
  const maxViews = maxViewsRaw ? Number(maxViewsRaw) : null;
  if (maxViews !== null && (!Number.isInteger(maxViews) || maxViews < 1 || maxViews > 1000)) {
    return { error: 'View limit must be a whole number between 1 and 1000.' };
  }

  const token = generateToken();
  const supabase = await createClient();

  const { error } = await supabase.from('share_links').insert({
    rams_id: ramsId,
    token_hash: hashToken(token),
    label: str(formData, 'label') || null,
    recipient_email: str(formData, 'recipient_email') || null,
    expires_at: expiryFromHours(hours).toISOString(),
    max_views: maxViews,
    created_by: user.id,
  });

  if (error) return { error: error.message };

  revalidatePath(`/rams/${ramsId}`);
  // The raw token is never stored, so this is the only moment it can be shown.
  return { ok: 'Link created', url: shareUrl(token) };
}

export async function revokeShareLink(formData: FormData) {
  await requireUser();

  const id = str(formData, 'id');
  const ramsId = str(formData, 'rams_id');
  if (!id) return;

  const supabase = await createClient();
  await supabase.from('share_links').update({ revoked_at: new Date().toISOString() }).eq('id', id);

  revalidatePath(`/rams/${ramsId}`);
}
