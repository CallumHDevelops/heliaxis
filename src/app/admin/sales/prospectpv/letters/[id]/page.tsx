/** One letter, both sides, with estimates and activity. */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { embeddedFontCss } from '@/components/prospectpv/brand/fonts.server';
import { AdminShell } from '@/components/prospectpv/admin/AdminShell';
import { LetterDetail } from '@/components/prospectpv/admin/LetterDetail';
import { renderLettersHtml } from '@/components/prospectpv/letters/render.server';
import { estimateSavings, typicalHome } from '@/lib/prospectpv/estimates';
import { estimateScaffolding } from '@/lib/prospectpv/scaffolding';
import { requireStaff } from '@/lib/prospectpv/server/auth';
import { assetUrls, getLetter, loadAssets, loadSettings, loadTemplates, withCurrentImages } from '@/lib/prospectpv/server/data';
import { calculatorReady } from '@/lib/prospectpv/settings';
import type { TemplateKey } from '@/lib/prospectpv/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Letter · ProspectPV', robots: { index: false, follow: false } };

type P = { id: string };
type SP = Record<string, string | string[] | undefined>;

export default async function LetterPage({ params, searchParams }: { params: P | Promise<P>; searchParams: SP | Promise<SP> }) {
  const { db } = await requireStaff();
  const { id } = await params;
  const sp = await searchParams;
  const letter = await getLetter(db, id);
  if (!letter) notFound();

  const asked = Number(Array.isArray(sp.template) ? sp.template[0] : sp.template);
  const key = ([1, 2, 3, 4, 5].includes(asked) ? asked : letter.templateKey) as TemplateKey;
  const [settings, templates, assets] = await Promise.all([loadSettings(db), loadTemplates(db), loadAssets(db)]);
  const data = withCurrentImages(letter.data, assetUrls(assets));
  const copyBlocks = templates.find((t) => t.template_key === key)?.copy_blocks;
  const html = (side: 'front' | 'back') => renderLettersHtml([{ data, templateKey: key, copyBlocks, preview: true, sides: [side] }], { fontCss: embeddedFontCss(), title: `Letter ${side}` });

  const a = letter.assessment;
  const scaffold = a?.elevation_width_m ? estimateScaffolding({ storeys: a.storeys ?? 2, elevationWidthM: a.elevation_width_m, elevations: 1 }, settings.scaffolding) : null;
  const savings = estimateSavings(typicalHome(settings.inputs), { generationKwh: data.estimate.annualKwh, batteryKwh: data.estimate.batteryKwh, price: data.package.priceIncVat }, settings);

  return (
    <AdminShell active="letters">
      <LetterDetail
        letter={{ ...letter, data }} previewTemplate={key} frontHtml={html('front')} backHtml={html('back')}
        scaffold={scaffold} savings={savings} generationKwh={data.estimate.annualKwh} calculatorHint={!calculatorReady(settings.assumptions)}
      />
    </AdminShell>
  );
}
