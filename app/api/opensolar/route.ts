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

// Extract project fields from OpenSolar proposal text (sent by the client).
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
  const text = String(body?.text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 12000);
  if (!text) return NextResponse.json({ error: 'No PDF text provided' }, { status: 400 });

  const prompt = `You are extracting the key facts from an OpenSolar solar-PV proposal into a structured record for Heliaxis's project library. Use ONLY facts present in the text. If a value isn't present, return "". Do NOT guess.

For 'location', give a ROUGH location (town/area only, e.g. "Tredegar") — NOT the full street address (privacy). For 'name', a short project label (the town/street area).

PROPOSAL TEXT:
"""${text}"""

Return ONLY this JSON shape:
{"name":"","location":"","panelManufacturer":"","panelModel":"","panelWattage":"e.g. 515 W","panelCount":"e.g. 97","systemSize":"e.g. 49.96 kWp","annualGeneration":"e.g. 44,996 kWh","inverterBrand":"","inverterModel":"","batteryBrand":"","batteryTotal":"e.g. 10 kWh (empty if no battery)","annualSavings":"e.g. £29,670"}`;

  const r = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://social.heliaxis.co.uk',
      'X-Title': 'Heliaxis OpenSolar Import',
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 500,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!r.ok) {
    const detail = await r.text();
    return NextResponse.json({ error: 'AI request failed', detail }, { status: 502 });
  }
  const json = await r.json();
  const out: string = json?.choices?.[0]?.message?.content || '';
  let fields: Record<string, string> = {};
  try {
    fields = JSON.parse(out.replace(/```json/gi, '').replace(/```/g, '').trim());
  } catch {
    return NextResponse.json({ error: 'Could not parse the proposal', raw: out }, { status: 502 });
  }
  return NextResponse.json({ fields });
}
