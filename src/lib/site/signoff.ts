import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { ukDay } from '@/lib/bank-holidays';
import { DOCS_BUCKET, ensureDocsBucket } from '@/lib/crm/server';
import { notify } from '@/lib/notify';
import { canonicalJson } from '@/lib/subcontractors/hashing';
import { validSignature } from '@/lib/subcontractors/server';
import { addSourceTask } from '@/lib/surveys/server';
import { getSettings as getWaSettings } from '@/lib/whatsapp/settings';
import { serverCtx } from './form-ctx';
import { schemaFor } from './forms';
import type { SiteForm } from './forms/types';
import { issueLabourPo, livePo, raiseLabourPo, sendPoMessages } from './labour-po';
import { sendAfter, siteShort } from './messages';
import { packPo } from './pack';
import type { SignoffReply } from './pack-shared';
import { HELD_WORDS, poNext, type HeldReason } from './po-shared';
import { formatPence } from './money';
// The electrician's sign-off steps register themselves (commissioning, tasks, the paperwork).
import './electrician-signoff';
import { saveTradeReport } from './reports';
import { EIC_SIGNOFF } from './eic/plugin';
import { flagsFor, openForms, recordAnswers, signCheck } from './rules';
import { pluginDocs, pluginGate, pluginJob, registerSignoff, type SignoffRow } from './signoff-plugins';
import { jobOf } from './send';
import { logJob, logSiteEvent, readAssignment, type AssignmentRow, type Db } from './server';
import { TRADE_LABEL, type AssignmentStatus, type Flag, type Stage } from './types';

/**
 * Signing off (SPEC 1I, ARCH 7.1): the server's own gate over what has reached it, one
 * site_signoffs row per stage (a retry gets the first result back), the job's dates, the labour PO
 * raised there and then so the phone can show its number, and the rest after the reply (the PO
 * issued, the trade's report, the job owner told), each step stamping a column so /api/cron/site
 * can finish any that didn't run.
 *
 * Units 2 and 3 plug in per trade with registerSignoff (signoff-plugins.ts): more for the gate to
 * check, job updates (commissioned_at) and the documents a sign-off makes. The electrician's pack
 * registers in electrician-signoff.ts, imported above so it's there wherever a sign-off runs.
 */
export { registerSignoff, type SignoffPlugin, type SignoffRow } from './signoff-plugins';

/** The scaffold's dates on the job, only where they're empty: up at erection, down at the strike. */
async function scaffoldDates(db: Db, a: AssignmentRow, s: SignoffRow) {
  if (s.stage !== 'erection' && s.stage !== 'strike') return;
  const col = s.stage === 'erection' ? 'scaffold_up_on' : 'scaffold_down_on';
  const day = ukDay(new Date(s.signed_at));
  const { data } = await db.from('crm_projects').update({ [col]: day }).eq('id', a.project_id).is(col, null).select('id');
  if (data?.length) await logJob(db, a.project_id, `Scaffold ${s.stage === 'erection' ? 'up' : 'down'} on ${day} (from the scaffolder’s sign-off)`, { assignment: a.id, [col]: day }, null);
}
registerSignoff('roofer', { docs: (db, a) => saveTradeReport(db, a.id) });
registerSignoff('scaffolder', { job: scaffoldDates, docs: (db, a) => saveTradeReport(db, a.id) });
// The certificate (Unit 3): the EIC or Minor Works made after the reply, paperwork.eic_on, the instruments remembered.
registerSignoff('electrician', EIC_SIGNOFF);

/** Where each stage can be signed from, and where it goes (SPEC 5.2). */
const FROM: Record<Stage, AssignmentStatus[]> = { main: ['sent', 'opened', 'started'], erection: ['sent', 'opened', 'started'], strike: ['signed'] };
const TO: Record<Stage, AssignmentStatus> = { main: 'done', erection: 'signed', strike: 'done' };
/** A phone's clock more than this far out is replaced by the server's. */
const CLOCK_SLACK_MS = 72 * 3_600_000;

export type SignoffInput = { op_id?: unknown; stage?: unknown; name?: unknown; signature?: unknown; declaration?: unknown; signed_at?: unknown; rev?: unknown };
export type SignoffMeta = { deviceId: string | null; ip: string | null; userAgent: string | null };
export type SignoffOutcome = { ok: true; reply: SignoffReply; signoff: SignoffRow; fresh: boolean } | { ok: false; status: number; body: Record<string, unknown> };

const isUuid = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f-]{36}$/i.test(s);
const STAGES: Stage[] = ['main', 'erection', 'strike'];
const signoffRow = (r: Record<string, unknown>): SignoffRow => ({ ...(r as unknown as SignoffRow), flags: Array.isArray(r.flags) ? (r.flags as Flag[]) : [], extra: (r.extra ?? {}) as Record<string, unknown> });

/** The forms a stage signs (one for the roofer and scaffold; the electrician's sections share 'main'). */
const formsOf = (a: AssignmentRow, stage: Stage, signed: Stage[]): SiteForm[] => openForms(schemaFor(a), signed).filter((f) => f.stage === stage);

/** What the phone's done screen needs: the sign-off, the status, and the PO with what happens to it next. */
async function replyFor(db: Db, a: AssignmentRow, s: SignoffRow, again: boolean): Promise<SignoffReply> {
  const now = (await readAssignment(db, a.id)) ?? a;
  const po = await livePo(db, a.id);
  const next = poNext(po, s.stage);
  let goesAt: string | null = null;
  if (next === 'sending') {
    const at = sendAfter(new Date(), await getWaSettings());
    if (at.getTime() > Date.now() + 60_000) goesAt = at.toISOString();
  }
  return {
    signoff: { id: s.id, stage: s.stage, signed_at: s.signed_at, signed_name: s.signed_name },
    status: now.status,
    po: po ? packPo(po as unknown as Record<string, unknown>) : null,
    po_next: next,
    goes_at: goesAt,
    again,
  };
}

/**
 * Take a sign-off from the phone. Checks (the device owns the assignment: the caller has), the
 * status allows the stage, the signature, and the gate over what the server holds; then the row,
 * the status, the job's dates and the PO. A retry (the same op, or the stage already signed) gets
 * the first result, and nothing is made twice.
 */
export async function signOff(db: Db, a: AssignmentRow, b: SignoffInput, meta: SignoffMeta): Promise<SignoffOutcome> {
  const stage = STAGES.find((x) => x === b.stage);
  if (!stage) return { ok: false, status: 400, body: { error: 'bad', message: 'That sign-off didn’t make sense. Call the office.' } };
  // Signed already (a retry, or a second phone): the first result.
  const { data: had } = await db.from('site_signoffs').select('*').eq('assignment_id', a.id).eq('stage', stage).maybeSingle();
  if (had) {
    const s = signoffRow(had);
    return { ok: true, reply: await replyFor(db, a, s, true), signoff: s, fresh: false };
  }
  // The same op again after the office reopened it: not a new sign-off.
  if (isUuid(b.op_id)) {
    const { data: op } = await db.from('site_ops').select('op_id').eq('assignment_id', a.id).eq('op_id', b.op_id).maybeSingle();
    if (op) return { ok: false, status: 409, body: { error: 'reopened', message: 'The office reopened this. Check your answers and sign again.' } };
  }
  const { data: so } = await db.from('site_signoffs').select('stage').eq('assignment_id', a.id);
  const signed = ((so ?? []) as { stage: Stage }[]).map((x) => x.stage);
  if (!FROM[stage].includes(a.status)) {
    const message = stage === 'strike' ? 'Sign off the scaffold going up first.' : a.status === 'draft' ? 'This job hasn’t been sent to you yet.' : 'This is signed off already. Ask the office to reopen it.';
    return { ok: false, status: 409, body: { error: 'status', message, status: a.status } };
  }
  const name = typeof b.name === 'string' ? b.name.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
  if (!name) return { ok: false, status: 400, body: { error: 'bad', message: 'Put your name to sign.' } };
  if (!validSignature(b.signature)) return { ok: false, status: 400, body: { error: 'bad', message: 'Draw your signature to sign.' } };

  // The gate, over what has reached the server (photos that arrived, answers saved).
  const forms = formsOf(a, stage, signed);
  if (!forms.length) return { ok: false, status: 409, body: { error: 'status', message: 'There’s nothing to sign for this job yet.' } };
  const ctx = await serverCtx(db, a);
  const checks = forms.map((f) => signCheck(f, ctx));
  const extra = await pluginGate(db, a, stage, ctx);
  const missing = [...checks.flatMap((c) => c.must), ...extra];
  const stops = checks.flatMap((c) => c.stops);
  if (missing.length || stops.length) {
    const what = [...stops.map((f) => f.text), ...missing.map((m) => m.label)];
    return {
      ok: false,
      status: 422,
      body: { error: 'gate', message: `Not signed yet. Heliaxis still needs: ${what.join('; ')}.`, missing, stops },
    };
  }

  // The record: what was signed, against which answers and photos.
  const id = randomUUID();
  const { data: ph } = await db.from('crm_photos').select('id').eq('assignment_id', a.id);
  const photoIds = ((ph ?? []) as { id: string }[]).map((p) => p.id).sort();
  const answers = Object.assign({}, ...forms.map((f) => recordAnswers(f, ctx)));
  const hash = createHash('sha256').update(canonicalJson({ answers, photos: photoIds })).digest('hex');
  const phoneAt = typeof b.signed_at === 'string' ? Date.parse(b.signed_at) : NaN;
  const signedAt = Number.isFinite(phoneAt) && Math.abs(phoneAt - Date.now()) <= CLOCK_SLACK_MS ? new Date(phoneAt).toISOString() : new Date().toISOString();
  const shown = forms[0].sig.declaration?.(ctx) ?? '';
  const declaration = typeof b.declaration === 'string' && b.declaration.trim() ? b.declaration.trim().slice(0, 2000) : shown;

  await ensureDocsBucket();
  const path = `signatures/${a.project_id}/site-${id}.png`;
  const png = Buffer.from(String(b.signature).split(',')[1] ?? '', 'base64');
  const up = await db.storage.from(DOCS_BUCKET).upload(path, png, { contentType: 'image/png', upsert: false });
  if (up.error) return { ok: false, status: 503, body: { error: 'busy', message: 'The signature didn’t save. It will try again.' } };

  const { data: ins, error } = await db
    .from('site_signoffs')
    .insert({
      id,
      assignment_id: a.id,
      stage,
      signed_name: name,
      signature_path: path,
      signed_at: signedAt,
      device_id: meta.deviceId,
      ip: meta.ip,
      user_agent: meta.userAgent?.slice(0, 400) ?? null,
      declaration,
      answers_hash: hash,
      flags: forms.flatMap((f) => flagsFor(f, ctx)),
      extra: {
        phone_signed_at: typeof b.signed_at === 'string' ? b.signed_at : null,
        phone_rev: typeof b.rev === 'number' ? b.rev : null,
        server_rev: a.rev,
        photos: photoIds,
        ...(declaration !== shown ? { declaration_now: shown } : {}),
      },
    })
    .select('*')
    .single();
  if (error || !ins) {
    await db.storage.from(DOCS_BUCKET).remove([path]).catch(() => null);
    // Another request signed the same stage a moment ago: that's the one.
    const { data: again } = await db.from('site_signoffs').select('*').eq('assignment_id', a.id).eq('stage', stage).maybeSingle();
    if (again) {
      const s = signoffRow(again);
      return { ok: true, reply: await replyFor(db, a, s, true), signoff: s, fresh: false };
    }
    return { ok: false, status: 503, body: { error: 'busy', message: 'That didn’t save. It will try again.' } };
  }
  const s = signoffRow(ins);
  if (isUuid(b.op_id)) await db.from('site_ops').insert({ assignment_id: a.id, op_id: b.op_id, kind: 'signoff' }).then(() => null, () => null);

  // The status: signed (scaffold up) or done (roofer, electrician, scaffold down).
  const at = new Date().toISOString();
  const to = TO[stage];
  await db
    .from('site_assignments')
    .update({ status: to, ...(stage !== 'strike' ? { signed_at: signedAt } : {}), ...(to === 'done' ? { done_at: at } : {}), updated_at: at })
    .eq('id', a.id)
    .in('status', FROM[stage]);
  await logSiteEvent(db, a.id, 'trade', 'signed_off', { stage, signoff: id, name, device: meta.deviceId, answers_hash: hash }, meta.ip);
  const now = (await readAssignment(db, a.id)) ?? a;
  // Job updates are made only where empty, so a failure here is left for the documents step to try again.
  await pluginJob(db, now, s).catch((e) => console.error('[site/signoff] job', e));

  // The PO, now, so the phone can show its number (none for the strike: the erection raised it).
  if (stage !== 'strike') await raiseLabourPo(db, now, { id: s.id, signed_name: s.signed_name, signed_at: s.signed_at, stage });
  return { ok: true, reply: await replyFor(db, now, s, false), signoff: s, fresh: true };
}

/* ── After the reply ─────────────────────────────────────────────────────────── */

const stamp = (db: Db, id: string, col: 'po_done_at' | 'docs_done_at' | 'notified_at') => db.from('site_signoffs').update({ [col]: new Date().toISOString() }).eq('id', id);

/**
 * The sign-off's steps after the reply, each once: the PO issued (unless it's held, or has gone
 * already), the documents made, and the job owner told. Each stamps its column; one that throws
 * leaves its column empty for the cron to try again.
 */
export async function finishSignoff(db: Db, signoffId: string): Promise<{ po: boolean; docs: boolean; notified: boolean }> {
  const { data } = await db.from('site_signoffs').select('*').eq('id', signoffId).maybeSingle();
  if (!data) return { po: true, docs: true, notified: true };
  const s = signoffRow(data);
  const a = await readAssignment(db, s.assignment_id);
  if (!a || a.status === 'cancelled') return { po: true, docs: true, notified: true };
  const out = { po: !!s.po_done_at, docs: !!s.docs_done_at, notified: !!s.notified_at };

  if (!s.po_done_at) {
    try {
      const po = await livePo(db, a.id);
      // Issued here only the first time and only when nothing holds it: a held PO, or one that's
      // gone and changed since, waits for the office's Issue. Issued but its messages not all queued
      // (something failed part-way): those are queued now, once each.
      if (po && po.status === 'draft' && (po.labour?.version ?? 0) === 0) await issueLabourPo(db, po.id, { by: null });
      else if (po && po.status !== 'cancelled' && (po.labour?.version ?? 0) > 0 && !po.changed_since_sent) await sendPoMessages(db, po.id);
      await stamp(db, s.id, 'po_done_at');
      out.po = true;
    } catch (e) {
      console.error('[site/signoff] po', e);
    }
  }
  if (!s.docs_done_at) {
    try {
      await pluginDocs(db, a, s);
      await stamp(db, s.id, 'docs_done_at');
      out.docs = true;
    } catch (e) {
      console.error('[site/signoff] docs', e);
    }
  }
  if (!s.notified_at) {
    try {
      await tellOwner(db, a, s);
      await stamp(db, s.id, 'notified_at');
      out.notified = true;
    } catch (e) {
      console.error('[site/signoff] notify', e);
    }
  }
  return out;
}

const STAGE_WORDS: Record<Stage, string> = { main: 'signed off', erection: 'signed off the scaffold as up', strike: 'signed off the scaffold as down' };

/**
 * The job owner told: "Roofer signed off at 12 High St · PO-0123 · £384.00 to pay" on the job's
 * activity and as a push; Urgent flags in the same push; open Review flags as one task for the
 * assignment (site-review:<id>, closed once they're all resolved).
 */
async function tellOwner(db: Db, a: AssignmentRow, s: SignoffRow) {
  const job = await jobOf(db, a.project_id);
  const where = siteShort(job.address, job.postcode) || job.ref || 'the job';
  const who = a.trade === 'other' ? a.trade_label || TRADE_LABEL.other : TRADE_LABEL[a.trade];
  const po = await livePo(db, a.id);
  const held = (po?.labour?.held ?? []).filter((h) => !(s.stage === 'strike' && h === 'scaffold')) as HeldReason[];
  const poWords = !po
    ? ''
    : po.status === 'draft' && held.length
      ? ` · ${po.po_number} held: ${HELD_WORDS[held[0]]}`
      : ` · ${po.po_number}${po.payable_pence != null ? ` · ${formatPence(po.payable_pence)} to pay` : ''}`;
  const open = a.flags.filter((f) => !f.resolved_at);
  const urgent = open.filter((f) => f.severity === 'urgent');
  const review = open.filter((f) => f.severity === 'review');
  const title = `${who} ${STAGE_WORDS[s.stage]} at ${where}${s.stage === 'strike' ? '' : poWords}`;
  const body = [urgent.length ? `Urgent: ${urgent.map((f) => f.text).join(' · ')}` : '', review.length ? `${review.length} for you to check` : ''].filter(Boolean).join('. ') || `Signed by ${s.signed_name}.`;
  await logJob(db, a.project_id, title, { assignment: a.id, signoff: s.id, stage: s.stage, po: po?.po_number ?? null }, null);
  if (job.owner_id) {
    await notify({ userId: job.owner_id, kind: 'site_signoff', title, body, href: `/admin/projects/${a.project_id}?tab=site`, tag: `site-signoff-${s.id}` }).catch(() => {});
  }
  if (review.length) await reviewTask(db, a, review, job.owner_id, where, who);
}

/** One task per assignment listing its Review flags (made once; 1K closes it when they're resolved). */
export async function reviewTask(db: Db, a: AssignmentRow, review: Flag[], ownerId: string | null, where: string, who: string) {
  await addSourceTask(db, {
    projectId: a.project_id,
    key: `site-review:${a.id}`,
    title: `Check the ${who.toLowerCase()}’s ${review.length === 1 ? 'flag' : `${review.length} flags`} · ${where}`,
    notes: review.map((f) => `• ${f.text}`).join('\n'),
    assigneeId: ownerId,
  });
}

/** /api/cron/site: sign-offs whose steps after the reply didn't all run (two minutes' grace first). */
export async function finishSignoffs(db: Db, until: number): Promise<number> {
  const grace = new Date(Date.now() - 2 * 60_000).toISOString();
  const { data } = await db.from('site_signoffs').select('id').or('po_done_at.is.null,docs_done_at.is.null,notified_at.is.null').lt('received_at', grace).order('received_at').limit(20);
  let n = 0;
  for (const r of (data ?? []) as { id: string }[]) {
    if (Date.now() > until) break;
    await finishSignoff(db, r.id);
    n++;
  }
  return n;
}

/* ── Reopening (the office) ──────────────────────────────────────────────────── */

/**
 * The office reopens the latest sign-off: the row goes (kept in full on the assignment's history,
 * and its signature file stays), the status goes back (started, or signed when it was the strike),
 * and the phone can change answers and sign again. The PO stays: the re-sign updates it, and if it
 * had gone and the money changed, it's marked changed since sent for Issue again.
 */
export async function reopenSignoff(db: Db, a: AssignmentRow, by: string | null, byName: string | null): Promise<{ ok: true; stage: Stage } | { ok: false; error: string }> {
  const { data } = await db.from('site_signoffs').select('*').eq('assignment_id', a.id);
  const rows = ((data ?? []) as Record<string, unknown>[]).map(signoffRow).sort((x, y) => STAGES.indexOf(y.stage) - STAGES.indexOf(x.stage));
  const last = rows[0];
  if (!last) return { ok: false, error: 'There’s no sign-off to reopen.' };
  await logSiteEvent(db, a.id, by ?? 'staff', 'signoff_reopened', { ...last, by_name: byName });
  const { error } = await db.from('site_signoffs').delete().eq('id', last.id);
  if (error) return { ok: false, error: 'Couldn’t reopen it. Try again.' };
  const status: AssignmentStatus = last.stage === 'strike' ? 'signed' : 'started';
  await db
    .from('site_assignments')
    .update({ status, done_at: null, ...(last.stage !== 'strike' ? { signed_at: null } : {}), updated_at: new Date().toISOString() })
    .eq('id', a.id);
  const who = a.trade === 'other' ? a.trade_label || TRADE_LABEL.other : TRADE_LABEL[a.trade];
  const what = last.stage === 'strike' ? 'scaffold-down sign-off' : last.stage === 'erection' ? 'scaffold-up sign-off' : 'sign-off';
  await logJob(db, a.project_id, `${who}’s ${what} reopened${byName ? ` by ${byName}` : ''}`, { assignment: a.id, stage: last.stage }, by);
  return { ok: true, stage: last.stage };
}
