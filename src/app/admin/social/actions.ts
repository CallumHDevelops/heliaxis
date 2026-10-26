'use server';

import { revalidatePath } from 'next/cache';
import { requirePortal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { draftMention, saveDraftEdit } from '@/lib/social/drafts';

/**
 * Everything a person can do on a comment. None of these touch Facebook, Instagram or any review site:
 * they only change what this app records. A reply is copied and posted by hand.
 * Critical and safety replies can only be approved, and Critical comments only dismissed, by an admin.
 */

async function session() {
  const s = await requirePortal('social_monitoring');
  if (!s) throw new Error('Not allowed');
  return { id: s.user.id, admin: s.profile.role === 'admin' };
}

const idOf = (f: FormData, k = 'id') => String(f.get(k) || '');

async function setStatus(mentionId: string, to: string, actor: string, reason?: string) {
  const db = createAdminClient();
  const { data: m } = await db.from('social_mention').select('status').eq('id', mentionId).maybeSingle();
  if (!m || m.status === to) return;
  const closed = to === 'posted' || to === 'dismissed';
  await db.from('social_mention').update({ status: to, closed_at: closed ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq('id', mentionId);
  await db.from('social_status_event').insert({ mention_id: mentionId, from_status: m.status, to_status: to, actor_id: actor, reason: reason ?? null });
}

function refresh(mentionId: string) {
  revalidatePath('/admin/social');
  revalidatePath(`/admin/social/review/${mentionId}`);
}

/** An admin approves this exact text (the approval is tied to its hash, so any later edit needs approving again). */
export async function approveDraft(f: FormData) {
  const me = await session();
  if (!me.admin) throw new Error('Only an admin can approve this reply');
  const db = createAdminClient();
  const draftId = idOf(f);
  const { data: d } = await db.from('social_draft').select('id, mention_id, status, text_sha256, guardrail_pass').eq('id', draftId).maybeSingle();
  if (!d || d.status !== 'ready' || !d.guardrail_pass) return;
  await db.from('social_draft').update({ status: 'approved', approved_by: me.id, approved_at: new Date().toISOString(), approved_text_sha256: d.text_sha256, updated_at: new Date().toISOString() }).eq('id', draftId);
  await setStatus(d.mention_id, 'approved', me.id);
  refresh(d.mention_id);
}

/** Recorded when someone presses Copy. The database refuses it unless the guardrails passed (and, for safety replies, an admin approved this text). */
export async function markCopied(draftId: string): Promise<{ ok: boolean; error?: string }> {
  const me = await session();
  const db = createAdminClient();
  const { data: d } = await db.from('social_draft').select('id, mention_id, status, requires_approval, guardrail_pass').eq('id', draftId).maybeSingle();
  if (!d) return { ok: false, error: 'Draft not found' };
  if (!d.guardrail_pass) return { ok: false, error: 'This reply has not passed the checks' };
  if (d.requires_approval && d.status !== 'approved' && d.status !== 'copied') return { ok: false, error: 'An admin needs to approve this reply first' };
  const { error } = await db.from('social_draft').update({ status: 'copied', copied_by: me.id, copied_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', draftId);
  if (error) return { ok: false, error: 'Could not record the copy' };
  await setStatus(d.mention_id, 'copied', me.id);
  refresh(d.mention_id);
  return { ok: true };
}

/** "I've posted it": closes the comment. */
export async function markPosted(f: FormData) {
  const me = await session();
  const db = createAdminClient();
  const mentionId = idOf(f, 'mentionId');
  const link = String(f.get('link') || '').trim().slice(0, 500) || null;
  const { data: d } = await db.from('social_draft').select('id').eq('mention_id', mentionId).eq('status', 'copied').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (d) await db.from('social_draft').update({ status: 'posted', posted_by: me.id, posted_at: new Date().toISOString(), posted_reply_link: link, updated_at: new Date().toISOString() }).eq('id', d.id);
  await setStatus(mentionId, 'posted', me.id);
  refresh(mentionId);
}

/** No reply needed (or already dealt with some other way). Critical comments: admins only. */
export async function dismissMention(f: FormData) {
  const me = await session();
  const db = createAdminClient();
  const mentionId = idOf(f, 'mentionId');
  const { data: m } = await db.from('social_mention').select('severity').eq('id', mentionId).maybeSingle();
  if (!m) return;
  if (m.severity === 'critical' && !me.admin) throw new Error('Only an admin can dismiss a Critical comment');
  await setStatus(mentionId, 'dismissed', me.id, String(f.get('reason') || '').slice(0, 300) || undefined);
  refresh(mentionId);
}

export async function regenerateDraft(f: FormData) {
  await session();
  const mentionId = idOf(f, 'mentionId');
  await draftMention(mentionId);
  refresh(mentionId);
}

export async function addNote(f: FormData) {
  const me = await session();
  const mentionId = idOf(f, 'mentionId');
  const text = String(f.get('text') || '').trim().slice(0, 2000);
  if (!text) return;
  await createAdminClient().from('social_note').insert({ mention_id: mentionId, author_id: me.id, text });
  refresh(mentionId);
}

/** Someone edits the suggested reply: the checks run again, and any approval is withdrawn (it belonged to the old wording). */
export async function editDraft(f: FormData) {
  const me = await session();
  const r = await saveDraftEdit(idOf(f), String(f.get('text') || ''), me.id);
  if (!r.ok) throw new Error(r.error || 'Could not save');
  const mentionId = String(f.get('mentionId') || '');
  if (mentionId) refresh(mentionId);
}
