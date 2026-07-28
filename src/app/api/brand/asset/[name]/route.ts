import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { hasBrandAccess } from '@/lib/brand-access';
import { BRAND_ASSET_MIME, BRAND_ASSET_NAMES } from '@/lib/brand-assets';

type Params = { params: Promise<{ name: string }> };

export async function GET(_request: Request, { params }: Params) {
  if (!(await hasBrandAccess())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { name } = await params;
  if (!BRAND_ASSET_NAMES.has(name)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const filePath = path.join(process.cwd(), 'brand-kit', name);
  try {
    const data = await readFile(filePath);
    const ext = path.extname(name).toLowerCase();
    return new NextResponse(data, {
      headers: {
        'Content-Type': BRAND_ASSET_MIME[ext] || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${name}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
