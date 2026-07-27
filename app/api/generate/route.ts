import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// House style + field rules, mirrored from the standalone tool.
function buildPrompt(
  tplName: string,
  tplDesc: string,
  fields: string[],
  topic: string,
  tone: string,
  recent: string[]
) {
  const fieldList = fields.join(', ');
  const avoid = recent
    .filter(Boolean)
    .slice(0, 25)
    .map((h) => '- ' + h.slice(0, 90))
    .join('\n');

  return `You are writing a social media post for Heliaxis, an MCS-certified renewable energy installer in South Wales (solar PV, battery storage, infrared/alternative heating, LED lighting, EV charging).

BRAND VOICE: confident, plain-spoken, benefit-led, honest. Numbers over adjectives. UK English. Never hype ("revolutionary", "leading", "cutting-edge"). We survey before we quote and show our assumptions. We'll tell a customer "no" when something isn't worth doing.

TONE FOR THIS POST: ${tone}

TEMPLATE: ${tplName} (${tplDesc}). Fill EXACTLY these fields: ${fieldList}.
FIELD RULES: 'eyebrow' = 2-4 word ALL-CAPS kicker. 'headline' = short and punchy; wrap ONE or TWO key words in *asterisks* to accent them gold. 'sub' = one or two plain sentences. 'stat' = a short figure like £1,400 or 68%. 'footer' = always "heliaxis.co.uk · 01633 965205". Keep it tight — this is a graphic, not an article.

TOPIC / ANGLE FROM THE USER:
${topic}

${avoid ? `AVOID REPEATING these recent posts — make this meaningfully different in angle and wording:\n${avoid}\n` : ''}
COMPLIANCE: Do not invent specific savings, payback, percentages or prices. If the user supplied a figure, use it; otherwise keep claims general or use a clearly illustrative placeholder in [square brackets] the user must verify.

Respond with ONLY a JSON object mapping each required field to its string value. No markdown, no commentary, no code fences. Fields: ${fieldList}.`;
}

export async function POST(req: Request) {
  // require an authenticated user — no anonymous generation
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key)
    return NextResponse.json({ error: 'Server is missing ANTHROPIC_API_KEY' }, { status: 500 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  const { tplName, tplDesc, fields, topic, tone, recent } = body || {};
  if (!topic || !Array.isArray(fields))
    return NextResponse.json({ error: 'Missing topic or fields' }, { status: 400 });

  const prompt = buildPrompt(tplName, tplDesc, fields, topic, tone || 'House style', recent || []);

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
      max_tokens: 700,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!r.ok) {
    const detail = await r.text();
    return NextResponse.json({ error: 'Anthropic API error', detail }, { status: 502 });
  }

  const data = await r.json();
  const text: string = data?.content?.[0]?.text || '';
  let obj: Record<string, string> | null = null;
  try {
    obj = JSON.parse(text.replace(/```json/gi, '').replace(/```/g, '').trim());
  } catch {
    return NextResponse.json({ error: 'Could not parse model output', raw: text }, { status: 502 });
  }

  return NextResponse.json({ fields: obj });
}
