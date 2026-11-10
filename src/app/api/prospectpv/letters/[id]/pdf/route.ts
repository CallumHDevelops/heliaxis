/**
 * GET /api/prospectpv/letters/{id}/pdf[?template=1-5]
 * Print-ready A4 PDF of one letter, made on demand from the figures stored
 * when it was created, so it always matches what the landing page shows.
 * Staff only.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { renderLettersPdf, LetterOverflowError } from '@/components/prospectpv/letters/renderPdf.server';
import { staffOrNull } from '@/lib/prospectpv/server/auth';
import { assetUrls, displayUprn, getLetter, loadAssets, loadSettings, loadTemplates, withCurrentImages } from '@/lib/prospectpv/server/data';
import { inlineLetterImages, launchBrowser } from '@/lib/prospectpv/server/pdf';
import type { TemplateKey } from '@/lib/prospectpv/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'letters';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await staffOrNull();
  if (!session) return NextResponse.json({ message: 'Sign in to download letters.' }, { status: 401 });
  const { id } = await ctx.params;
  const letter = await getLetter(session.db, id);
  if (!letter) return NextResponse.json({ message: 'Letter not found.' }, { status: 404 });

  const asked = Number(req.nextUrl.searchParams.get('template'));
  const key = ([1, 2, 3, 4, 5].includes(asked) ? asked : letter.templateKey) as TemplateKey;
  const [settings, templates, assets] = await Promise.all([loadSettings(session.db), loadTemplates(session.db), loadAssets(session.db)]);

  let browser;
  try {
    const data = await inlineLetterImages(withCurrentImages(letter.data, assetUrls(assets)));
    browser = await launchBrowser();
    const pdf = await renderLettersPdf(browser, [{ data, templateKey: key, copyBlocks: templates.find((t) => t.template_key === key)?.copy_blocks }], {
      bleed: settings.letters.bleed_mm > 0,
      title: `Letter ${letter.code}`,
    });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${slug(letter.campaignName)}_${displayUprn(letter.uprn)}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    if (e instanceof LetterOverflowError) return NextResponse.json({ message: e.message }, { status: 422 });
    console.error('[prospectpv] pdf failed', e);
    return NextResponse.json({ message: 'The PDF couldn’t be made. Try again.' }, { status: 500 });
  } finally {
    await browser?.close();
  }
}
