import 'server-only';
import { longDay, type CompletionInput } from '@/lib/handover/inputs';
import { stampWords } from '../pdf-kit';
import { begin, type Loader } from './common';

/**
 * HX-HO-08, the completion sign-off (SPEC 4.5): when the work was done and the
 * system switched on, what was done, anything still to put right with the date it will be, and the
 * customer's own confirmation and signature (taken on the electrician's phone or in their portal,
 * never reused from another document, D15), with the installer's name.
 */
export const COMPLETION_TITLE = 'Completion sign-off';

export async function makeCompletion(c: CompletionInput, load: Loader): Promise<Uint8Array> {
  const kit = await begin('HX-HO-08', COMPLETION_TITLE, c, { pairs: [['Installed', c.installDays], ['Switched on', c.commissionedOn ? longDay(c.commissionedOn) : null]] });
  if (c.done.length) {
    kit.section('What was done');
    kit.paragraph(c.done.map((l) => `•  ${l}`).join('\n'));
  }
  kit.section('Still to put right');
  if (c.outstanding.length) kit.grid({ columns: ['What', 'Done by'], rows: c.outstanding.map((o) => [o.text, o.by ? longDay(o.by) : 'Date to be agreed']), widths: [4, 1.4] });
  else kit.paragraph('Nothing: the work is finished.');
  if (c.installer) {
    kit.section('Installed by');
    kit.rows([{ label: 'Electrician', value: c.installer }]);
  }
  kit.section('Your confirmation');
  kit.paragraph(c.declaration);
  await kit.signatures([
    {
      title: 'Customer',
      png: await load('docs', c.signature.path),
      name: c.signature.name,
      at: c.signature.signed_at,
      line: c.signature.via === 'portal' ? `Signed in their Heliaxis portal, ${stampWords(c.signature.signed_at)}` : null,
    },
  ]);
  return kit.save();
}
