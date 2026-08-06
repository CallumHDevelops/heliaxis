import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { BRAND, VOICE, COMPLIANCE } from '@/lib/prompt';

export const runtime = 'nodejs';

function aiConfig() {
  const apiKey =
    process.env.OPENROUTER_API_KEY || process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = (
    process.env.OPENAI_API_BASE_URL ||
    process.env.AI_BASE_URL ||
    'https://openrouter.ai/api/v1'
  ).replace(/\/$/, '');
  const model = process.env.OPENAI_MODEL || process.env.AI_MODEL || 'openai/gpt-4o-mini';
  return { apiKey, baseUrl, model };
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { apiKey, baseUrl, model } = aiConfig();
  if (!apiKey)
    return NextResponse.json(
      { error: 'Server is missing AI credentials (set OPENROUTER_API_KEY)' },
      { status: 500 }
    );

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  const { tplName, tplDesc, data, tone } = body || {};
  if (!data || typeof data !== 'object')
    return NextResponse.json({ error: 'Missing post content' }, { status: 400 });

  const onGraphic = Object.entries(data as Record<string, string>)
    .filter(([, v]) => v && String(v).trim())
    .map(([k, v]) => `${k}: ${String(v).split('*').join('')}`)
    .join('\n');

  const prompt = `You are Heliaxis's social copywriter, writing the CAPTION that sits beneath a post graphic.

${BRAND}

${VOICE}

TONE: ${tone || 'House style'}
TEMPLATE: ${tplName || 'Post'} (${tplDesc || ''}).

The GRAPHIC ALREADY SHOWS this text — do NOT restate these same sentences in the caption:
${onGraphic}

Write a caption that COMPLEMENTS the graphic (adds to it, never repeats it):
- Line 1 is a scroll-stopping hook — a different angle from the headline (a question, a myth, or a concrete fact). It must work even if the image isn't seen.
- Then 1-2 short paragraphs of genuine value the image doesn't cover: why it matters, what to check, a practical takeaway.
- End with a clear, low-pressure CTA (free no-obligation survey · 01633 965205 · heliaxis.co.uk).
- Final line: 4-6 relevant, non-spammy hashtags.
- Keep it tight and skimmable — short paragraphs, line breaks, no walls of text, no emoji-stuffing.

${COMPLIANCE}

Return ONLY the caption text (ending with the hashtags line). No preamble, no quotes, no markdown.`;

  const r = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://social.heliaxis.co.uk',
      'X-Title': 'Heliaxis Post Studio',
    },
    body: JSON.stringify({
      model,
      temperature: 0.85,
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!r.ok) {
    const detail = await r.text();
    return NextResponse.json({ error: 'AI request failed', detail }, { status: 502 });
  }

  const json = await r.json();
  const caption: string = (json?.choices?.[0]?.message?.content || '').trim();
  if (!caption) return NextResponse.json({ error: 'Empty caption returned' }, { status: 502 });

  return NextResponse.json({ caption });
}
