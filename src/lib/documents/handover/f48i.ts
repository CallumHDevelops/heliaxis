import 'server-only';
import type { ShadingInput } from '@/lib/handover/inputs';
import { begin, type Loader } from './common';

/**
 * F48I, shading, performance and maintenance (SPEC 4.5): the MCS estimate and shade factor from the
 * design, MIS 3002's own notes word for word (src/lib/site/fixed/mis3002.ts; until they're copied in
 * this isn't made), what the survey saw shading the roof and its sun-path photo, then the checks the
 * customer can do themselves. The handover never works an estimate out.
 */
export const F48I_TITLE = 'Solar PV Shading and Maintenance';

export async function makeShading(s: ShadingInput, load: Loader): Promise<Uint8Array> {
  const kit = await begin('F48I', F48I_TITLE, s);
  kit.section('Your estimated generation', { intro: 'From your system’s design, worked out the MCS way.' });
  kit.rows([
    { label: 'Estimated generation in the first year', value: `${s.kwh.toLocaleString('en-GB')} kWh`, strong: true },
    { label: 'Shade factor', value: String(s.shade) },
  ]);
  kit.section(`Important note (${s.source})`);
  kit.paragraph(s.note);
  if (s.shadingNote) kit.paragraph(s.shadingNote);
  kit.section('Shading on your roof');
  kit.rows([{ label: 'What the survey saw shading the roof', value: s.shading.length ? s.shading.join(', ') : 'Nothing recorded' }]);
  if (s.sunPath) {
    const bytes = await load('photos', s.sunPath);
    if (bytes) await kit.photos([{ bytes, mime: /\.png$/i.test(s.sunPath) ? 'image/png' : 'image/jpeg', caption: 'Sun-path photo from the middle of the panel area, facing south' }], { perRow: 2 });
  }
  kit.section('Looking after it');
  kit.paragraph(
    [
      '•  Look at your generation in the app each month, and compare it with the same month last year.',
      '•  From the ground, look out for damage, a lot of dirt, or loose cables. Never go on the roof.',
      '•  If generation drops suddenly, or the inverter shows a fault, call us on 01633 965205.',
    ].join('\n')
  );
  return kit.save();
}
