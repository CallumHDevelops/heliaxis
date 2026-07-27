import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

  const prompt = `You are writing the SOCIAL MEDIA CAPTION that sits beneath a Heliaxis post graphic.

Heliaxis is an MCS-certified renewable energy installer in South Wales (solar PV, battery storage, infrared/alternative heating, LED lighting, EV charging).
BRAND VOICE: confident, plain-spoken, benefit-led, honest. Numbers over adjectives. UK English. Never hype ("revolutionary", "leading", "cutting-edge"). We survey before we quote and show our assumptions.

TONE: ${tone || 'House style'}
TEMPLATE: ${tplName || 'Post'} (${tplDesc || ''}).

The GRAPHIC ALREADY SHOWS this text — do NOT just repeat it in the caption:
${onGraphic}

Write a caption that COMPLEMENTS the graphic, it must NOT restate the same sentences:
- Open with a short scroll-stopping hook (a question, a myth, or a concrete fact) — a different angle from the headline.
- Add 1-2 short paragraphs of context or value that go BEYOND what's on the image (why it matters, what to check, a practical takeaway).
- End with a clear, low-pressure call to action (free no-obligation survey · 01633 965205 · heliaxis.co.uk).
- Then a final line of 4-6 relevant hashtags.

COMPLIANCE: never invent specific savings, payback or prices. Keep claims honest and general unless a figure is already given. UK English. Keep it tight and readable — a few short paragraphs, not an essay.

Return ONLY the caption text (with the hashtags line). No preamble, no quotes, no markdown.`;

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
