import { NextResponse } from 'next/server';
import { requireApproved } from '@/lib/auth';
import { getPublishStyles } from '@/lib/cms-publish-styles';

export async function GET() {
  const session = await requireApproved();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    return NextResponse.json(getPublishStyles());
  } catch {
    return NextResponse.json({ error: 'styles not found' }, { status: 500 });
  }
}
