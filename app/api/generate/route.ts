import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { BRAND, VOICE, COMPLIANCE } from '@/lib/prompt';

export const runtime = 'nodejs';

// AI provider config — OpenAI-compatible (OpenRouter now; swap via env later).
// Mirrors the existing Heliaxis blog CMS setup so the same account/keys are reused.
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

  return `You are Heliaxis's senior social copywriter, writing ONE on-brand social graphic.

${BRAND}

${VOICE}

TONE FOR THIS POST: ${tone}

TEMPLATE: ${tplName} (${tplDesc}). Fill EXACTLY these fields: ${fieldList}.

HOW TO MAKE IT GOOD (think before writing):
- Lead with the reader's benefit or a genuine hook, not the product. Earn the read.
- Be specific and concrete over generic. One clear idea per post — don't cram.
- Prefer a real, checkable detail (a place, a system size, a scenario) over vague claims.
- Read the headline aloud: if it sounds like an advert or a cliché, rewrite it.

FIELD RULES:
- 'eyebrow' = a 2-4 word ALL-CAPS kicker that frames the post (e.g. "CUSTOMER STORY · CARDIFF").
- 'headline' = short and punchy (aim ≤ 8 words); wrap ONE or TWO key words in *asterisks* to accent them gold. No full stop unless it's a deliberate statement.
- 'sub' = one or two plain, useful sentences that add something beyond the headline.
- 'stat' = ONE clean figure with its correct unit and nothing else (no brackets, no words): energy = kWh, system size = kWp or kW, money = £, proportions = %. One line (e.g. £1,400, 68%, 4,200 kWh).
- 'statlabel' = a few words saying what the figure is (e.g. "saved every year.").
- On a stat post the 'sub' MUST give the context that makes the number meaningful — system size, property type, orientation/location (e.g. "From a 5.2 kWp array on a south-facing roof in Newport.").
- 'badge'/'cta'/'item1..3' where present: keep tight and specific.
- 'footer' = always "heliaxis.co.uk · 01633 965205".

GOOD vs WEAK headline (for calibration):
- WEAK: "Harness the power of the sun today!"  →  GOOD: "Your roof works while you're out."
- WEAK: "Amazing solar savings!"  →  GOOD: "Cut the bit of the bill you actually control."

TOPIC / ANGLE FROM THE USER:
${topic}

${avoid ? `AVOID REPEATING these recent posts — be meaningfully different in angle AND wording:\n${avoid}\n` : ''}${COMPLIANCE}

Respond with ONLY a JSON object mapping each required field to its string value. No markdown, no commentary, no code fences. Fields: ${fieldList}.`;
}

export async function POST(req: Request) {
  // require an authenticated user — no anonymous generation
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
  const { tplName, tplDesc, fields, topic, tone, recent } = body || {};
  if (!topic || !Array.isArray(fields))
    return NextResponse.json({ error: 'Missing topic or fields' }, { status: 400 });

  const prompt = buildPrompt(tplName, tplDesc, fields, topic, tone || 'House style', recent || []);

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
      temperature: 0.7,
      max_tokens: 700,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!r.ok) {
    const detail = await r.text();
    return NextResponse.json({ error: 'AI request failed', detail }, { status: 502 });
  }

  const data = await r.json();
  const text: string = data?.choices?.[0]?.message?.content || '';
  let obj: Record<string, string> | null = null;
  try {
    obj = JSON.parse(text.replace(/```json/gi, '').replace(/```/g, '').trim());
  } catch {
    return NextResponse.json({ error: 'Could not parse model output', raw: text }, { status: 502 });
  }

  return NextResponse.json({ fields: obj });
}
