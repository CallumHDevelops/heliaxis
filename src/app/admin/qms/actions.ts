'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { writeWithClaude } from '@/lib/qms/ai';
import { addMonths, bumpRevision, canApprove } from '@/lib/qms/checks';
import { loadDetail, loadOverview, loadRecords, qmsSession, recordsSession, ukToday, type QmsDetail, type QmsOverview } from '@/lib/qms/server';
import { SEED } from '@/lib/qms/seed';
import { APPROVAL_CHECKLIST, DOC_COLUMNS, RECORD_COLUMNS, RECORD_KINDS, type DocKind, type QmsDoc, type RecordKind, type QmsRecord } from '@/lib/qms/types';

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
const clean = (s: unknown, max: number) => (typeof s === 'string' ? s.trim().slice(0, max) : '');
const day = (s: unknown) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
const done = () => revalidatePath('/admin/qms');

async function who(admin = false) {
  const s = await qmsSession();
  if (!s) throw new Error('Not authorised');
  if (admin && !s.admin) throw new Error('Only an admin can do that.');
  return s;
}
async function recordsWho(admin = false) {
  const s = await recordsSession();
  if (!s) throw new Error('Not authorised');
  if (admin && !s.admin) throw new Error('Only an admin can do that.');
  return s;
}
async function guard<T>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await fn();
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Something went wrong.');
  }
}

export async function refresh(): Promise<QmsOverview> {
  await who();
  return loadOverview();
}

export async function openDoc(id: string): Promise<Result<{ detail: QmsDetail }>> {
  return guard(async () => {
    await who();
    if (!isUuid(id)) return fail('Not found.');
    const detail = await loadDetail(id);
    return detail ? { ok: true, detail } : fail('Not found.');
  });
}

/** Adds every document in the standard register that isn't there yet. Never touches ones that are. */
export async function importStandardRegister(): Promise<Result<{ added: number }>> {
  return guard(async () => {
    const s = await who(true);
    const db = createAdminClient();
    const { data } = await db.from('qms_documents').select('kind, ref');
    const have = new Set((data ?? []).map((d: { kind: string; ref: string }) => `${d.kind}:${d.ref.toUpperCase()}`));
    const rows = SEED.filter((d) => !have.has(`${d.kind}:${d.ref.toUpperCase()}`)).map((d) => ({
      kind: d.kind, ref: d.ref, title: d.title, section: d.section ?? null, summary: d.summary ?? null, review_months: d.reviewMonths ?? 12, revision: '1', created_by: s.name,
    }));
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await db.from('qms_documents').insert(rows.slice(i, i + 200));
      if (error) return fail('Couldn’t add them. Has qms.sql been run?');
    }
    done();
    return { ok: true, added: rows.length };
  });
}

export async function createDoc(input: { kind: DocKind; ref: string; title: string; section?: string | null }): Promise<Result<{ id: string }>> {
  return guard(async () => {
    const s = await who();
    const ref = clean(input.ref, 20).toUpperCase();
    const title = clean(input.title, 200);
    if (!['internal', 'procedure', 'form', 'external'].includes(input.kind)) return fail('Pick where it goes.');
    if (!ref || !title) return fail('It needs a reference and a title.');
    const { data, error } = await createAdminClient()
      .from('qms_documents')
      .insert({ kind: input.kind, ref, title, section: input.section || null, revision: '1', created_by: s.name })
      .select('id')
      .single();
    if (error || !data) return fail('Couldn’t add it.');
    done();
    return { ok: true, id: data.id as string };
  });
}

export type DocPatch = Partial<{
  title: string; ref: string; kind: DocKind; section: string | null; owner: string | null; summary: string | null;
  body_md: string; source_url: string | null; revision_date: string | null; review_months: number;
}>;

/** Edits. The text of an approved document is locked: start a new revision first. Moving a document (kind) is allowed any time. */
export async function saveDoc(id: string, patch: DocPatch): Promise<Result<{ detail: QmsDetail }>> {
  return guard(async () => {
    await who();
    const db = createAdminClient();
    const { data: cur } = await db.from('qms_documents').select(DOC_COLUMNS).eq('id', id).maybeSingle();
    if (!cur) return fail('Not found.');
    const doc = cur as QmsDoc;
    const up: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const content = patch.body_md !== undefined || patch.title !== undefined || patch.source_url !== undefined;
    if (content && doc.status === 'approved') return fail('It’s approved, so its content is locked. Start a new revision to change it.');
    if (patch.title !== undefined) up.title = clean(patch.title, 200);
    if (patch.ref !== undefined) up.ref = clean(patch.ref, 20).toUpperCase();
    if (patch.kind !== undefined && ['internal', 'procedure', 'form', 'external'].includes(patch.kind)) up.kind = patch.kind;
    if (patch.section !== undefined) up.section = patch.section || null;
    if (patch.owner !== undefined) up.owner = clean(patch.owner, 120) || null;
    if (patch.summary !== undefined) up.summary = clean(patch.summary, 300) || null;
    if (patch.body_md !== undefined) up.body_md = patch.body_md.slice(0, 200_000);
    if (patch.source_url !== undefined) up.source_url = clean(patch.source_url, 500) || null;
    if (patch.revision_date !== undefined) up.revision_date = day(patch.revision_date);
    if (patch.review_months !== undefined) up.review_months = Math.min(60, Math.max(1, Math.round(Number(patch.review_months) || 12)));
    // Editing a document that is with the approver takes it back to draft: what they looked at has changed.
    if (content && doc.status === 'in_review') up.status = 'draft';
    const { error } = await db.from('qms_documents').update(up).eq('id', id);
    if (error) return fail('Couldn’t save.');
    done();
    const detail = await loadDetail(id);
    return detail ? { ok: true, detail } : fail('Not found.');
  });
}

/** Keeps the current revision in the history and opens the next one as a draft. */
export async function startRevision(id: string, note: string): Promise<Result<{ detail: QmsDetail }>> {
  return guard(async () => {
    const s = await who();
    const db = createAdminClient();
    const { data: cur } = await db.from('qms_documents').select(DOC_COLUMNS).eq('id', id).maybeSingle();
    if (!cur) return fail('Not found.');
    const doc = cur as QmsDoc;
    await db.from('qms_revisions').insert({
      document_id: id, revision: doc.revision, revision_date: doc.revision_date, title: doc.title, body_md: doc.body_md, file_path: doc.file_path,
      note: clean(note, 500) || null, created_by: s.name,
    });
    const { error } = await db
      .from('qms_documents')
      .update({ revision: bumpRevision(doc.revision), revision_date: ukToday(), status: 'draft', next_review_on: null, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return fail('Couldn’t start the new revision.');
    done();
    const detail = await loadDetail(id);
    return detail ? { ok: true, detail } : fail('Not found.');
  });
}

export async function submitForReview(id: string): Promise<Result<{ detail: QmsDetail }>> {
  return guard(async () => {
    await who();
    const d = await loadDetail(id);
    if (!d) return fail('Not found.');
    if (d.doc.status === 'approved') return fail('It’s already approved.');
    const { error } = await createAdminClient().from('qms_documents').update({ status: 'in_review', updated_at: new Date().toISOString() }).eq('id', id);
    if (error) return fail('Couldn’t send it for review.');
    done();
    const detail = await loadDetail(id);
    return detail ? { ok: true, detail } : fail('Not found.');
  });
}

/** The approver's decision. Approving needs every automatic check to be clear of failures and every box ticked. */
export async function reviewDoc(id: string, decision: 'approved' | 'changes_requested', checklist: Record<string, boolean>, note: string): Promise<Result<{ detail: QmsDetail }>> {
  return guard(async () => {
    const s = await who(true);
    const db = createAdminClient();
    const d = await loadDetail(id);
    if (!d) return fail('Not found.');
    const text = clean(note, 2000);
    if (decision === 'approved') {
      if (!canApprove(d.checks)) return fail('Some checks are failing. Fix them first.');
      const need = APPROVAL_CHECKLIST[d.doc.kind];
      if (need.some((c) => !checklist[c.key])) return fail('Tick every box to approve.');
    } else if (!text) return fail('Say what needs changing: it goes to the writer as a comment.');
    const today = ukToday();
    await db.from('qms_reviews').insert({
      document_id: id, revision: d.doc.revision, reviewer: s.name, decision, checklist,
      checker: d.checks.map((c) => ({ id: c.id, status: c.status })), note: text || null,
    });
    if (decision === 'approved') {
      await db.from('qms_documents').update({
        status: 'approved', approved_revision: d.doc.revision, approved_by: s.name, approved_at: new Date().toISOString(),
        next_review_on: addMonths(today, d.doc.review_months), updated_at: new Date().toISOString(),
      }).eq('id', id);
    } else {
      await db.from('qms_comments').insert({ document_id: id, revision: d.doc.revision, author: s.name, body: text });
      await db.from('qms_documents').update({ status: 'changes_requested', updated_at: new Date().toISOString() }).eq('id', id);
    }
    done();
    const detail = await loadDetail(id);
    return detail ? { ok: true, detail } : fail('Not found.');
  });
}

export async function addComment(id: string, body: string, quote: string): Promise<Result<{ detail: QmsDetail }>> {
  return guard(async () => {
    const s = await who();
    const text = clean(body, 4000);
    if (!text) return fail('Write the comment first.');
    const db = createAdminClient();
    const { data: doc } = await db.from('qms_documents').select('revision').eq('id', id).maybeSingle();
    if (!doc) return fail('Not found.');
    const { error } = await db.from('qms_comments').insert({ document_id: id, revision: doc.revision, author: s.name, body: text, quote: clean(quote, 400) || null });
    if (error) return fail('Couldn’t add the comment.');
    done();
    const detail = await loadDetail(id);
    return detail ? { ok: true, detail } : fail('Not found.');
  });
}

/** Resolve (it's fixed) or reopen (it isn't). Admins and the document's reviewers both can: this is the check on Claude's answer. */
export async function setCommentStatus(commentId: string, status: 'resolved' | 'open'): Promise<Result<{ detail: QmsDetail }>> {
  return guard(async () => {
    await who();
    const db = createAdminClient();
    const { data: c } = await db.from('qms_comments').select('document_id').eq('id', commentId).maybeSingle();
    if (!c) return fail('Not found.');
    await db.from('qms_comments').update({ status, resolved_at: status === 'resolved' ? new Date().toISOString() : null }).eq('id', commentId);
    done();
    const detail = await loadDetail(c.document_id as string);
    return detail ? { ok: true, detail } : fail('Not found.');
  });
}

/**
 * Writes the first draft (no text yet) or answers the open comments (text and comments). Keeps what was there in the
 * history first, so nothing is lost, answers each comment, and leaves the document as a draft for another look.
 */
export async function writeWithClaudeAction(id: string): Promise<Result<{ detail: QmsDetail; answered: number }>> {
  return guard(async () => {
    const s = await who(true);
    const db = createAdminClient();
    const d = await loadDetail(id);
    if (!d) return fail('Not found.');
    if (d.doc.kind === 'external') return fail('External documents are the issuer’s: link or upload the real copy.');
    if (d.doc.status === 'approved') return fail('It’s approved, so its content is locked. Start a new revision first.');
    const open = d.comments.filter((c) => c.status === 'open');
    const hasText = !!d.doc.body_md?.trim();
    if (hasText && !open.length) return fail('Nothing to answer: add a comment saying what to change.');
    const { data: reg } = await db.from('qms_documents').select('ref, title, kind').neq('status', 'archived').order('ref');
    const res = await writeWithClaude(d.doc, open, (reg ?? []) as { ref: string; title: string; kind: string }[]);
    if (!res.ok) return fail(res.error);
    if (hasText) {
      await db.from('qms_revisions').insert({
        document_id: id, revision: d.doc.revision, revision_date: d.doc.revision_date, title: d.doc.title, body_md: d.doc.body_md,
        note: `Before Claude answered ${open.length} comment${open.length === 1 ? '' : 's'}`, created_by: 'Claude',
      });
    }
    await db.from('qms_documents').update({
      body_md: res.body, summary: d.doc.summary || res.summary || null, status: 'draft', revision_date: d.doc.revision_date || ukToday(), owner: d.doc.owner || s.name, updated_at: new Date().toISOString(),
    }).eq('id', id);
    const said = new Map(res.responses.map((r) => [r.id, r.response]));
    for (const c of open) {
      await db.from('qms_comments').update({ status: 'addressed', response: said.get(c.id) ?? 'Reviewed and updated.', responded_by: 'Claude' }).eq('id', c.id);
    }
    done();
    const detail = await loadDetail(id);
    return detail ? { ok: true, detail, answered: open.length } : fail('Not found.');
  });
}

export async function archiveDoc(id: string, archived: boolean): Promise<Result<{ detail: QmsDetail }>> {
  return guard(async () => {
    await who(true);
    await createAdminClient().from('qms_documents').update({ status: archived ? 'archived' : 'draft', updated_at: new Date().toISOString() }).eq('id', id);
    done();
    const detail = await loadDetail(id);
    return detail ? { ok: true, detail } : fail('Not found.');
  });
}

/* Records: open to every approved user */

async function nextRecordRef(kind: RecordKind) {
  const prefix = RECORD_KINDS.find((k) => k.key === kind)!.prefix;
  const { data } = await createAdminClient().from('qms_records').select('ref').like('ref', `${prefix}-%`).order('ref', { ascending: false }).limit(1);
  const last = data?.[0]?.ref ? parseInt(String(data[0].ref).slice(prefix.length + 1), 10) : 0;
  return `${prefix}-${String((Number.isFinite(last) ? last : 0) + 1).padStart(4, '0')}`;
}

export async function saveRecord(input: { id?: string; kind: RecordKind; title: string; status: QmsRecord['status']; owner: string; due_on: string; data: Record<string, string>; notes: string }): Promise<Result<{ record: QmsRecord }>> {
  return guard(async () => {
    const s = await recordsWho();
    const kind = RECORD_KINDS.find((k) => k.key === input.kind);
    if (!kind) return fail('Pick the kind of record.');
    const title = clean(input.title, 200);
    if (!title) return fail('It needs a title.');
    const data: Record<string, string> = {};
    for (const f of kind.fields) data[f.key] = clean(input.data?.[f.key], 4000);
    const status = ['open', 'in_progress', 'closed'].includes(input.status) ? input.status : 'open';
    const row = {
      title, status, owner: clean(input.owner, 120) || null, due_on: day(input.due_on), data, notes: clean(input.notes, 4000) || null,
      closed_on: status === 'closed' ? ukToday() : null, updated_at: new Date().toISOString(),
    };
    const db = createAdminClient();
    if (input.id) {
      if (!isUuid(input.id)) return fail('Not found.');
      const { data: r, error } = await db.from('qms_records').update(row).eq('id', input.id).select(RECORD_COLUMNS).single();
      if (error || !r) return fail('Couldn’t save.');
      done();
      return { ok: true, record: r as QmsRecord };
    }
    for (let tries = 0; tries < 3; tries++) {
      const { data: r, error } = await db.from('qms_records').insert({ ...row, kind: input.kind, ref: await nextRecordRef(input.kind), created_by: s.name }).select(RECORD_COLUMNS).single();
      if (!error && r) {
        done();
        return { ok: true, record: r as QmsRecord };
      }
    }
    return fail('Couldn’t add it. Has qms.sql been run?');
  });
}

export async function deleteRecord(id: string): Promise<Result> {
  return guard(async () => {
    await recordsWho(true);
    if (!isUuid(id)) return fail('Not found.');
    await createAdminClient().from('qms_records').delete().eq('id', id);
    done();
    return { ok: true };
  });
}

export async function refreshRecords(): Promise<QmsRecord[]> {
  await recordsWho();
  return loadRecords();
}
