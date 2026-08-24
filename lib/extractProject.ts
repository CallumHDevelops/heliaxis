// Shared AI extraction of project fields from free text — used by the
// OpenSolar PDF import and the Telegram ingest webhook. SERVER-ONLY.

export interface ProjectFields {
  name: string;
  location: string;
  panelManufacturer: string;
  panelModel: string;
  panelWattage: string;
  panelCount: string;
  systemSize: string;
  annualGeneration: string;
  inverterBrand: string;
  inverterModel: string;
  batteryBrand: string;
  batteryTotal: string;
  annualSavings: string;
}

export function aiConfig() {
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

// Returns the extracted fields, or throws with a readable message.
export async function extractProjectFields(input: string): Promise<Partial<ProjectFields>> {
  const { apiKey, baseUrl, model } = aiConfig();
  if (!apiKey) throw new Error('Server is missing AI credentials (set OPENROUTER_API_KEY)');

  const text = String(input || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 12000);
  if (!text) throw new Error('No text to read');

  const prompt = `You are extracting the key facts about a solar-PV installation into a structured record for Heliaxis's project library. The text may be an OpenSolar proposal, or a short free-text message from an installer (e.g. a WhatsApp/Telegram note). Use ONLY facts present in the text. If a value isn't present, return "". Do NOT guess or invent figures.

For 'location', give a ROUGH location (town/area only, e.g. "Tredegar") — NOT a full street address (privacy). For 'name', a short project label (usually the town/area).

TEXT:
"""${text}"""

Return ONLY this JSON shape:
{"name":"","location":"","panelManufacturer":"","panelModel":"","panelWattage":"e.g. 515 W","panelCount":"e.g. 16","systemSize":"e.g. 6.4 kWp","annualGeneration":"e.g. 5,391 kWh","inverterBrand":"","inverterModel":"","batteryBrand":"","batteryTotal":"e.g. 10 kWh (empty if no battery)","annualSavings":"e.g. £900"}`;

  const r = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://social.heliaxis.co.uk',
      'X-Title': 'Heliaxis Project Import',
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
    throw new Error(`AI request failed: ${detail.slice(0, 200)}`);
  }
  const json = await r.json();
  const out: string = json?.choices?.[0]?.message?.content || '';
  try {
    return JSON.parse(out.replace(/```json/gi, '').replace(/```/g, '').trim());
  } catch {
    throw new Error('Could not parse the extracted fields');
  }
}

// snake_case DB columns keyed by the camelCase field names above
export const FIELD_TO_COLUMN: Record<keyof ProjectFields, string> = {
  name: 'name',
  location: 'location',
  panelManufacturer: 'panel_manufacturer',
  panelModel: 'panel_model',
  panelWattage: 'panel_wattage',
  panelCount: 'panel_count',
  systemSize: 'system_size',
  annualGeneration: 'annual_generation',
  inverterBrand: 'inverter_brand',
  inverterModel: 'inverter_model',
  batteryBrand: 'battery_brand',
  batteryTotal: 'battery_total',
  annualSavings: 'annual_savings',
};
