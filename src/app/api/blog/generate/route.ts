import { NextResponse } from 'next/server';
import { requireApproved } from '@/lib/auth';
import { generateBlogPost, isAiConfigured } from '@/lib/blog/ai';

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

  let body: { prompt?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const prompt = (body.prompt || '').trim();
  if (prompt.length < 8) {
    return NextResponse.json({ error: 'Prompt is too short' }, { status: 400 });
  }

  try {
    const draft = await generateBlogPost(prompt);
    return NextResponse.json({ draft, prompt });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
