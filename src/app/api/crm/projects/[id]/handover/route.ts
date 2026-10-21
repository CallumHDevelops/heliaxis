import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json, logActivity } from '@/lib/crm/server';
import { isSlot, SITE_SLOTS, slotDef, type SlotCode } from '@/lib/handover/slots';
import {
  buildHandover,
  handoverReady,
  handoverSummary,
  handoverView,
  HANDOVER_NOT_READY,
  markDnoSent,
  markNotNeeded,
  patchSlotData,
  recordPayment,
  refreshHandover,
  sendHandover,
  signF78Design,
  tellCustomer,
  type Via,
} from '@/lib/handover/server';
import { validSignature } from '@/lib/subcontractors/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

const notReady = () => json({ error: HANDOVER_NOT_READY, ready: false }, 503);
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const PARTS = ['application', 'acceptance', 'installation', 'g100'];
const viaOf = (v: unknown): Via[] => (Array.isArray(v) ? v : [v]).filter((x): x is Via => x === 'whatsapp' || x === 'email');

/** The Handover tab (screen D6): every item's state, the pack, what to copy, the payments. ?summary=1: the Overview card's line. */
export async function GET(req: Request, { params }: Ctx) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  if (!(await handoverReady())) return notReady();
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const db = createAdminClient();
  if (new URL(req.url).searchParams.has('summary')) {
    const s = await handoverSummary(db, id);
    return s ? json(s) : json({ error: 'Not found' }, 404);
  }
  const view = await handoverView(db, id);
  return view ? json(view) : json({ error: 'Not found' }, 404);
}

/**
 * The office's actions on the pack, each answered with the tab's data again:
 * refresh · regenerate {slot} · na {slot, reason} · restore {slot} · archive {doc} · visible {doc, visible}
 * · move {doc, slot, release} · values {slot, values} · outstanding {items} · part {doc, part}
 * · sign-f78-design {name, signature} · dno-sent · record-payment {kind, amount_pence, paid_on, method, reference}
 * · delete-payment {payment} (admin) · build · send {via, override} · tell {slot, via}.
 */
export async function POST(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!(await handoverReady())) return notReady();
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const db = createAdminClient();
  const { data: p } = await db.from('crm_projects').select('id, enquiry_id').eq('id', id).maybeSingle();
  if (!p) return json({ error: 'Not found' }, 404);
  const b = await req.json().catch(() => ({}));
  const by = s.user.id;
  const byName = s.profile.full_name || s.profile.email || 'Someone';
  const slot = isSlot(b.slot) ? (b.slot as SlotCode) : null;
  const docOf = async (docId: unknown) => {
    if (!isUuid(String(docId ?? ''))) return null;
    const { data } = await db.from('crm_documents').select('*').eq('id', String(docId)).eq('project_id', id).maybeSingle();
    return data as { id: string; name: string; handover_slot: string | null; visible: boolean; generated_key: string | null } | null;
  };
  const log = (body: string) => logActivity({ enquiryId: String(p.enquiry_id), projectId: id, kind: 'system', body, byId: by }).catch(() => null);
  const notes: string[] = [];
  let extra: Record<string, unknown> = {};

  try {
    switch (b.action) {
      case 'refresh':
        await refreshHandover(db, id, { by });
        break;
      case 'regenerate': {
        if (!slot) return json({ error: 'Which item?' }, 400);
        // The electrician's own documents are made by the site app, from their sign-off: F43…, the EV
        // and heat pump records (CCMH), their certificate (CC21: the EIC made in the app, or the pages
        // of their own). The latest electrician last, so theirs is the current one (as the pack reads it).
        let siteMade = false;
        if (slotDef(slot)?.maker === 'site' || slot === 'CCMH' || slot === 'CC21') {
          const { saveElectricianDocs } = await import('@/lib/site/electrician-docs');
          const { data: els } = await db.from('site_assignments').select('id').eq('project_id', id).eq('trade', 'electrician').neq('status', 'cancelled').order('created_at');
          for (const e of (els ?? []) as { id: string }[]) {
            siteMade = (await saveElectricianDocs(db, e.id, { force: [slot], by })).some((x) => x.status === 'saved') || siteMade;
            if (slot === 'CC21') {
              const { saveCertificate } = await import('@/lib/site/eic/server');
              siteMade = !!(await saveCertificate(db, e.id, by, { force: true }))?.saved.some((x) => x.status === 'saved') || siteMade;
            }
          }
        }
        // Released into their portal once the pack has gone, and the pack rebuilt.
        const r = await refreshHandover(db, id, { by, force: [slot] });
        if (r.made.length || siteMade) await log(`Handover pack: ${slotDef(slot)?.title} made again`);
        else notes.push('Nothing to make: it’s up to date, or it still needs something (see the row).');
        break;
      }
      case 'na':
      case 'restore': {
        if (!slot) return json({ error: 'Which item?' }, 400);
        const reason = String(b.reason ?? '').trim().slice(0, 200);
        if (b.action === 'na' && !reason) return json({ error: 'Say why it isn’t needed.' }, 400);
        // One of the documents Send waits for: only an admin can take it off, as only an admin can send without it.
        if (b.action === 'na' && SITE_SLOTS.includes(slot) && s.profile.role !== 'admin') return json({ error: 'Only an admin can mark this not needed: the pack waits for it before it can go.' }, 403);
        await markNotNeeded(db, id, slot, b.action === 'na', reason || null, by, byName);
        await refreshHandover(db, id, { by });
        break;
      }
      case 'archive': {
        const d = await docOf(b.doc);
        if (!d) return json({ error: 'Not found' }, 404);
        await db.from('crm_documents').update({ archived_at: new Date().toISOString(), archived_by: by, visible: false }).eq('id', d.id);
        await log(`Handover pack: “${d.name}” archived (kept, hidden from the customer)`);
        await refreshHandover(db, id, { by });
        break;
      }
      case 'visible': {
        const d = await docOf(b.doc);
        if (!d) return json({ error: 'Not found' }, 404);
        // Shown or hidden by hand: it stays as set (a held document isn't released over it later).
        await db.from('crm_documents').update({ visible: b.visible === true, release: 'now' }).eq('id', d.id);
        await log(`Handover pack: “${d.name}” ${b.visible === true ? 'shown in' : 'hidden from'} the customer’s portal`);
        break;
      }
      case 'move': {
        const d = await docOf(b.doc);
        if (!d || !slot || slot === 'PACK') return json({ error: 'Choose the document and the item.' }, 400);
        const hold = b.release === 'with_pack';
        await db.from('crm_documents').update({ handover_slot: slot, release: hold ? 'with_pack' : 'now', visible: !hold, source: 'upload' }).eq('id', d.id);
        await log(`“${d.name}” moved into the handover pack (${slotDef(slot)?.title})`);
        await refreshHandover(db, id, { by });
        break;
      }
      case 'values': {
        if (!slot || !b.values || typeof b.values !== 'object') return json({ error: 'Nothing to save.' }, 400);
        const values = Object.fromEntries(Object.entries(b.values as Record<string, unknown>).map(([k, v]) => [k.slice(0, 40), String(v ?? '').trim().slice(0, 500)]));
        await patchSlotData(db, id, slot, { values }, by);
        await refreshHandover(db, id, { by });
        break;
      }
      case 'outstanding': {
        const items = (Array.isArray(b.items) ? b.items : [])
          .map((x: { text?: unknown; by?: unknown }) => ({ text: String(x?.text ?? '').trim().slice(0, 300), by: YMD.test(String(x?.by ?? '')) ? String(x.by) : null }))
          .filter((x: { text: string }) => x.text)
          .slice(0, 20);
        await patchSlotData(db, id, 'F16E', { outstanding: items }, by);
        await refreshHandover(db, id, { by });
        break;
      }
      case 'part': {
        const d = await docOf(b.doc);
        if (!d || !PARTS.includes(String(b.part))) return json({ error: 'Which G99 paper is it?' }, 400);
        await patchSlotData(db, id, 'F76', { parts: { [d.id]: String(b.part) } }, by);
        break;
      }
      case 'sign-f78-design': {
        const name = String(b.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
        if (name.length < 3 || !validSignature(b.signature)) return json({ error: 'Type your name and sign.' }, 400);
        await signF78Design(db, id, { name, signature: String(b.signature), by });
        await log(`F78 design part signed by ${name}`);
        await refreshHandover(db, id, { by });
        break;
      }
      case 'dno-sent':
        await markDnoSent(db, id, by, byName);
        await log('G98 Form B sent to the DNO');
        await refreshHandover(db, id, { by });
        break;
      case 'record-payment': {
        const pence = Math.round(Number(b.amount_pence));
        const kind = ['stage', 'final', 'other'].includes(String(b.kind)) ? (String(b.kind) as 'stage' | 'final' | 'other') : null;
        const method = ['card', 'bank_transfer', 'other'].includes(String(b.method)) ? (String(b.method) as 'card' | 'bank_transfer' | 'other') : null;
        if (!(pence > 0) || pence > 100_000_000) return json({ error: 'Type the amount from the invoice.' }, 400);
        if (!kind || !method || !YMD.test(String(b.paid_on ?? ''))) return json({ error: 'Say when it was paid, how, and whether it’s the final payment.' }, 400);
        await recordPayment(db, id, { kind, amount_pence: pence, paid_on: String(b.paid_on), method, reference: String(b.reference ?? '').trim().slice(0, 80) || null, by, byName });
        await refreshHandover(db, id, { by });
        break;
      }
      case 'delete-payment': {
        if (s.profile.role !== 'admin') return json({ error: 'Only an admin can remove a recorded payment.' }, 403);
        if (!isUuid(String(b.payment ?? ''))) return json({ error: 'Not found' }, 404);
        await db.from('crm_payments').delete().eq('id', String(b.payment)).eq('project_id', id);
        await log('A recorded payment was removed');
        await refreshHandover(db, id, { by });
        break;
      }
      case 'build': {
        const r = await buildHandover(db, id, { by });
        await log(`Handover pack built (version ${r.version}, ${r.pages} pages)`);
        extra = { built: r };
        break;
      }
      case 'send': {
        const via = viaOf(b.via);
        if (b.override === true && s.profile.role !== 'admin') return json({ error: 'Only an admin can send it before everything from site is in.' }, 403);
        const r = await sendHandover(db, id, { via, by, byName, override: b.override === true });
        if (!r.ok) return json({ error: r.error, blocking: r.blocking ?? [] }, 409);
        notes.push(...r.notes);
        extra = { at: r.at };
        break;
      }
      case 'tell': {
        if (!slot) return json({ error: 'Which item?' }, 400);
        const r = await tellCustomer(db, id, slot, viaOf(b.via), by);
        notes.push(...r.notes);
        break;
      }
      default:
        return json({ error: 'Unknown action' }, 400);
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Not done. Try again.' }, 500);
  }
  const view = await handoverView(db, id);
  return json({ ...view, notes, ...extra });
}
