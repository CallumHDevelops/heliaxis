import { NextResponse } from 'next/server';
import { requirePortal } from '@/lib/auth';
import { generateBlogPost, isAiConfigured } from '@/lib/blog/ai';

export const maxDuration = 120;

export async function POST(req: Request) {
  const session = await requirePortal('cms');
  if (!session || session.profile.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: 'AI not configured. Set ANTHROPIC_API_KEY (or OPENROUTER_API_KEY).' },
      { status: 503 },
    );
  }

  let body: { prompt?: string; keyword?: string; audience?: string };
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
    const draft = await generateBlogPost(prompt, { keyword: (body.keyword || '').slice(0, 120), audience: (body.audience || '').slice(0, 200) });
    return NextResponse.json({ draft, prompt });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
