import { NextResponse } from 'next/server';
import { requireApproved } from '@/lib/auth';
import { generatePageBlocks, isAiConfigured } from '@/lib/cms/ai-page';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const session = await requireApproved();
  if (!session || session.profile.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: 'AI not configured. Set OPENROUTER_API_KEY (or AI_API_KEY) and optionally AI_MODEL / AI_BASE_URL.' },
      { status: 503 },
    );
  }

  let body: { prompt?: string; context?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const prompt = (body.prompt || '').trim();
  if (prompt.length < 8) {
    return NextResponse.json({ error: 'Prompt is too short' }, { status: 400 });
  }
  const context = typeof body.context === 'string' ? body.context.slice(0, 2000) : '';

  try {
    const blocks = await generatePageBlocks(prompt, context);
    if (!blocks.length) {
      return NextResponse.json(
        { error: 'The AI did not return any usable sections. Try rephrasing your description.' },
        { status: 422 },
      );
    }
    return NextResponse.json({ blocks });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
