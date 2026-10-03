import { NextResponse } from 'next/server';
import { requirePortal } from '@/lib/auth';
import { getPublishStyles } from '@/lib/cms-publish-styles';

export async function GET() {
  const session = await requirePortal('cms');
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    return NextResponse.json(getPublishStyles());
  } catch {
    return NextResponse.json({ error: 'styles not found' }, { status: 500 });
  }
}
