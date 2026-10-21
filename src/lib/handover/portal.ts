import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadHandover } from './facts';
import { siteAddress } from './inputs';
import { handoverReady, statesOf } from './server';
import { approved, DRAFTS } from './settings-shared';
import { contentsGroups, customerState } from './slots';
import { hasPrintVersion } from '@/lib/documents/print-shared';

/**
 * "Your handover pack" in the customer's portal (SPEC 4.10, screens C1 and C2): Download everything
 * first once it's been sent, then the documents in the pack's groups and order, each with its one
 * plain line; "On its way" for what's still to come (titles only, no internal notes); a "What to do
 * now" box; and the signature cards for the completion record and, on G98 jobs, Form B. Archived
 * and held documents never show. Null before handover.sql, so the portal is exactly as it was.
 */

/** `print`: one Heliaxis makes, with a print version (documents/print-shared.ts). */
export type PortalDoc = { id: string; name: string; at: string; print: boolean };
export type PortalHandover = {
  sent: boolean;
  pack: { id: string; size: number | null } | null;
  groups: { title: string; items: { code: string; title: string; line: string; docs: PortalDoc[]; coming: boolean }[] }[];
  signs: { kind: 'f16e' | 'g98'; title: string; line: string; declaration: string }[];
  next: string[];
  /** Every document shown here, so "Other documents" leaves them out. */
  ids: string[];
};

export async function portalHandover(projectId: string): Promise<PortalHandover | null> {
  if (!(await handoverReady())) return null;
  const db = createAdminClient();
  const l = await loadHandover(db, projectId);
  if (!l) return null;
  const { views } = statesOf(l);
  const f = l.facts;
  const sent = !!l.pack?.sent_at;
  const doc = (d: { id: string; name: string; at: string; key: string | null; source: string | null }) => ({ id: d.id, name: d.name.replace(/\.pdf$/i, ''), at: d.at, print: d.source === 'generated' && hasPrintVersion(d.key) });
  const shown = views.filter((v) => customerState(v) === 'ready' || (sent && customerState(v) === 'coming'));
  const item = (v: (typeof views)[number]) => ({
    code: v.code,
    title: v.title,
    line: v.customer,
    docs: v.docs.filter((d) => d.visible).sort((a, b) => b.version - a.version).map(doc),
    coming: customerState(v) === 'coming',
  });
  const groups = contentsGroups(shown.filter((v) => v.code !== 'F07BI')).map((g) => ({ title: g.title, items: g.items.map(item) }));
  const cover = shown.find((v) => v.code === 'F07BI');
  if (cover) groups.unshift({ title: 'Start here', items: [item(cover)] });
  // Old handover documents (before items existed) still belong here.
  const legacy = l.docs.filter((d) => d.category === 'handover' && !d.handover_slot && d.visible && !d.archived_at);
  if (legacy.length) groups.push({ title: 'Other', items: legacy.map((d) => ({ code: 'CCMH', title: d.name, line: '', docs: [doc({ id: d.id, name: d.name, at: d.created_at, key: d.generated_key, source: d.source })], coming: false })) });
  const pack = l.docs.find((d) => d.generated_key === 'PACK' && !d.archived_at && d.visible);

  const signs: PortalHandover['signs'] = [];
  const f16e = views.find((v) => v.code === 'F16E');
  const switchedOn = !!f.job.commissionedOn || !!f.electrician?.signedAt;
  if (f16e && f16e.state !== 'na' && switchedOn && approved(f.settings, 'completion') && !f.data.F16E?.customer && !f.electrician?.customer.f16e)
    signs.push({ kind: 'f16e', title: 'Sign to say the work’s finished', line: 'It goes into your handover pack as your completion record.', declaration: DRAFTS.completion.text.replace('{address}', siteAddress(f) || 'my home') });
  const f47 = views.find((v) => v.code === 'F47');
  // Not asked for once the form has gone to the DNO (marked sent, or uploaded as sent).
  if (f47 && f47.state !== 'na' && !f47.docs.length && f.job.dno.route === 'g98' && switchedOn && !f.job.dno.notified && !f.data.F47?.customer && !f.electrician?.customer.g98)
    signs.push({ kind: 'g98', title: 'Sign the G98 form', line: 'Your signature for the form that tells the electricity network (DNO) about your system.', declaration: 'Your signature for the G98 Form B, which tells the electricity network (DNO) about your system.' });

  const next: string[] = [];
  if (f.job.products.includes('solar')) next.push('Apply for the Smart Export Guarantee (SEG) with an energy supplier, so you’re paid for what you export. You’ll need your MCS certificate and your export MPAN.');
  next.push(f.system.monitoring ? `Download the ${f.system.monitoring} app, so you can see what your system is doing.` : 'Download your system’s monitoring app, so you can see what it’s doing.');
  next.push('Keep this link safe: it’s your copy of everything, and you may need it if you sell your home.');

  const ids = [...groups.flatMap((g) => g.items.flatMap((i) => i.docs.map((d) => d.id))), ...(pack ? [pack.id] : [])];
  return { sent, pack: sent && pack ? { id: pack.id, size: pack.size } : null, groups: groups.filter((g) => g.items.length), signs, next, ids };
}
