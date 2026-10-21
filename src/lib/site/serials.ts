/**
 * Reading a serial number out of whatever a barcode or QR code holds (REGS 5.2), in this order:
 * an ISO/IEC 15434 envelope, a GS1 element string, a GS1 Digital Link, another URL, a Wi-Fi QR (the
 * SSID only: a Wi-Fi password is never kept), JSON, labelled text, and last a bare token. Brand
 * patterns (REGS 5.1) are hints, never a reason to refuse. Pure: the phone and the tests share it.
 */

export type How = 'iso15434' | 'gs1' | 'digital_link' | 'url' | 'wifi' | 'json' | 'labelled' | 'bare';
export type Parsed = { serial: string | null; model: string | null; how: How | null; raw: string };

const ORDER: How[] = ['iso15434', 'gs1', 'digital_link', 'url', 'wifi', 'json', 'labelled', 'bare'];
const RS = '\x1e';
const GS = '\x1d';
const EOT = '\x04';
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9-]{5,29}$/;
const looksSerial = (s: string | null | undefined): s is string => !!s && TOKEN.test(s.trim());
const clean = (s: string) => s.replace(/[\x00-\x1f]/g, '').trim();

/** 1. ISO/IEC 15434: [)> RS 06 GS … ; data identifier S is the serial, 1P the part (model). */
function iso15434(raw: string): Parsed | null {
  if (!raw.startsWith('[)>')) return null;
  const body = raw.slice(3).split(EOT)[0];
  const formats = body.split(RS).filter(Boolean);
  let serial: string | null = null;
  let model: string | null = null;
  for (const fmt of formats) {
    const fields = fmt.split(GS);
    if (fields[0] !== '06') continue;
    for (const f of fields.slice(1)) {
      if (f.startsWith('1P')) model ??= clean(f.slice(2)) || null;
      // A data identifier is optional digits then a letter: "S…" is the serial ("1S…" is something else).
      else if (f.startsWith('S') && f.length > 1) serial ??= clean(f.slice(1)) || null;
    }
  }
  return serial || model ? { serial, model, how: 'iso15434', raw } : null;
}

/** GS1 application identifiers this needs: fixed lengths, and the variable ones (ended by GS). */
const AI_FIXED: Record<string, number> = { '00': 18, '01': 14, '02': 14, '11': 6, '12': 6, '13': 6, '15': 6, '16': 6, '17': 6, '20': 2 };
const AI_VAR = ['10', '21', '22', '240', '241', '250', '251'];

function gs1Fields(s: string): Record<string, string> | null {
  const out: Record<string, string> = {};
  // Human-readable form: (01)12345678901234(21)ABC123
  if (s.startsWith('(')) {
    for (const m of s.matchAll(/\((\d{2,4})\)([^(]*)/g)) out[m[1]] = clean(m[2]);
    return Object.keys(out).length ? out : null;
  }
  let i = 0;
  while (i < s.length) {
    if (s[i] === GS) {
      i++;
      continue;
    }
    const two = s.slice(i, i + 2);
    const three = s.slice(i, i + 3);
    if (AI_FIXED[two] !== undefined) {
      out[two] = s.slice(i + 2, i + 2 + AI_FIXED[two]);
      i += 2 + AI_FIXED[two];
    } else if (AI_VAR.includes(three)) {
      const end = s.indexOf(GS, i + 3);
      out[three] = s.slice(i + 3, end === -1 ? undefined : end);
      i = end === -1 ? s.length : end + 1;
    } else if (AI_VAR.includes(two)) {
      const end = s.indexOf(GS, i + 2);
      out[two] = s.slice(i + 2, end === -1 ? undefined : end).slice(0, 20);
      i = end === -1 ? s.length : end + 1;
    } else return Object.keys(out).length ? out : null;
  }
  return Object.keys(out).length ? out : null;
}

/** 2. A GS1 element string: a symbology identifier, FNC1/GS separators, or the human-readable (01)…(21)…. */
function gs1(raw: string): Parsed | null {
  let s = raw;
  const sym = /^\](d2|Q3|C1|e0)/.exec(s);
  if (sym) s = s.slice(3);
  else if (!s.includes(GS) && !/^\(\d{2,4}\)/.test(s)) return null;
  const f = gs1Fields(s.startsWith(GS) ? s.slice(1) : s);
  if (!f || !f['21']) return null;
  return { serial: clean(f['21']), model: null, how: 'gs1', raw };
}

/** 3 and 4. A URL: GS1 Digital Link (/01/{gtin}/21/{serial}), else a query key, else the last path segment. */
function fromUrl(raw: string): Parsed | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol)) return null;
  const parts = u.pathname.split('/').filter(Boolean).map((p) => decodeURIComponent(p));
  const at = parts.indexOf('21');
  if (parts.includes('01') && at >= 0 && parts[at + 1]) return { serial: parts[at + 1], model: null, how: 'digital_link', raw };
  for (const k of ['sn', 'SN', 'serial', 'serialNumber', 's', 'id']) {
    const v = u.searchParams.get(k);
    if (looksSerial(v)) return { serial: v.trim(), model: null, how: 'url', raw };
  }
  const last = parts.at(-1);
  return looksSerial(last) ? { serial: last, model: null, how: 'url', raw } : null;
}

/** 5. A Wi-Fi QR: the SSID only (Huawei names it Device-SN). The password never leaves this function. */
function wifi(raw: string): Parsed | null {
  if (!/^WIFI:/i.test(raw)) return null;
  const ssid = /(?:^WIFI:|;)S:((?:\\.|[^;])*)/i.exec(raw)?.[1]?.replace(/\\(.)/g, '$1') ?? '';
  const tail = ssid.split('-').at(-1) ?? '';
  const serial = looksSerial(tail) && tail.length >= 6 ? tail : looksSerial(ssid) ? ssid : null;
  return { serial, model: null, how: 'wifi', raw: `WIFI:S:${ssid}` };
}

/** 6. JSON with an sn / serial / SerialNumber key (any case). */
function json(raw: string): Parsed | null {
  const t = raw.trim();
  if (!t.startsWith('{')) return null;
  try {
    const o = JSON.parse(t) as Record<string, unknown>;
    const find = (names: string[]) => Object.entries(o).find(([k]) => names.includes(k.toLowerCase()))?.[1];
    const serial = find(['sn', 'serial', 'serialnumber', 'serial_number']);
    const model = find(['model', 'pn', 'partnumber', 'part_number']);
    if (typeof serial !== 'string' && typeof serial !== 'number') return null;
    return { serial: String(serial).trim(), model: typeof model === 'string' ? model.trim() : null, how: 'json', raw };
  } catch {
    return null;
  }
}

/** 7. Labelled text: "S/N: ABC123", "Serial No. ABC123" … */
function labelled(raw: string): Parsed | null {
  for (const part of raw.split(/[;,|\n\r]+/)) {
    const m = /(?:S\/?N|Serial(?:\s*No\.?|\s*Number)?)\s*[:#=]?\s*([A-Z0-9][A-Z0-9-]{5,29})/i.exec(part);
    if (m) return { serial: m[1], model: null, how: 'labelled', raw };
  }
  return null;
}

/** 8. The whole payload is one 6–30 character token of letters, digits and dashes. */
const bare = (raw: string): Parsed | null => (looksSerial(raw.trim()) ? { serial: raw.trim(), model: null, how: 'bare', raw } : null);

/** One code's payload → the serial in it, by the first way that works. */
export function parsePayload(raw: string): Parsed {
  const r = String(raw ?? '');
  for (const fn of [iso15434, gs1, fromUrl, wifi, json, labelled, bare]) {
    const p = fn(r);
    if (p) return p;
  }
  return { serial: null, model: null, how: null, raw: r.slice(0, 200) };
}

/** Several codes in one frame: each as a chip, the one that reads most surely as a serial picked. */
export function pickSerial(payloads: string[]): { chips: Parsed[]; pick: number } {
  const chips = [...new Set(payloads)].map(parsePayload);
  let pick = -1;
  let best = ORDER.length;
  chips.forEach((c, i) => {
    if (!c.serial || !c.how) return;
    const rank = ORDER.indexOf(c.how);
    if (rank < best) {
      best = rank;
      pick = i;
    }
  });
  return { chips, pick };
}

/** Hints from what's known per brand (REGS 5.1). Never a reason to refuse a serial. */
export function brandHint(serial: string): string | null {
  const s = serial.trim().toUpperCase();
  if (/^[A-Z]{2}\d{4}[A-Z]\d{3}$/.test(s)) return 'Looks like a GivEnergy serial';
  if (/^[A-Z0-9]{6}-[A-Z0-9]{9}-[A-Z0-9]{2}$/.test(s)) return 'Looks like a SolarEdge serial';
  if (/^\d{16}$/.test(s)) return 'Looks like a 16-digit panel serial (JA Solar uses these)';
  return null;
}

/** The same serial twice on a job. */
export function duplicates(list: string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const s of list.map((x) => x.trim().toUpperCase()).filter(Boolean)) (seen.has(s) ? dup : seen).add(s);
  return [...dup];
}
