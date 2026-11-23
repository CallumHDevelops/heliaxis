/**
 * Contact details a customer writes into a message: "Regards, David Bird, Is y Garn, Pencaer, Goodwick", "SA64 0JQ", "my email is…".
 * Pure, so it can be tested. It only reads what is clearly stated, and the caller only fills what is still blank on the record.
 */
export type ContactDetails = { name?: string; postcode?: string; address?: string; email?: string };

const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const SIGNOFF = /^\s*(kind regards|best regards|warm regards|regards|many thanks|thanks very much|thank you|thanks|best wishes|best|cheers|yours sincerely|yours faithfully|yours|sincerely|kindest regards)[\s,.!-]*$/i;
const NAME_LINE = /^(?:(?:mr|mrs|ms|miss|mx|dr|prof)\.?\s+)?[A-ZÀ-Ý][a-zà-ÿ'’-]+(?:\s+[A-ZÀ-Ý][a-zà-ÿ'’-]+){1,3}$/;
const NOT_NAME = /\b(solar|battery|panels?|heliaxis|quote|system|inverter|installer|team|limited|ltd|plc|please|thank|hello|sent from)\b/i;

/** A postcode as it should be stored: "sa640jq" → "SA64 0JQ". */
export const tidyPostcode = (pc: string): string => {
  const k = pc.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return `${k.slice(0, -3)} ${k.slice(-3)}`;
};

const cleanLine = (l: string) => l.replace(/\s+/g, ' ').replace(/^[,\-–•*\s]+|[,\-–•*\s]+$/g, '').trim();

export function extractContactDetails(message: string): ContactDetails {
  const text = message.replace(/\r/g, '');
  const out: ContactDetails = {};
  const email = EMAIL.exec(text);
  if (email) out.email = email[0].toLowerCase();
  const pc = POSTCODE.exec(text);
  if (pc) out.postcode = tidyPostcode(`${pc[1]}${pc[2]}`);

  const lines = text.split('\n').map((l) => l.trim());
  // After a sign-off ("Regards"): the name, then the lines of the address.
  for (let i = 0; i < lines.length; i++) {
    if (!SIGNOFF.test(lines[i])) continue;
    const rest = lines.slice(i + 1).filter((l, idx, all) => l || all.slice(0, idx).some(Boolean));
    const name = cleanLine(rest[0] ?? '');
    if (name && NAME_LINE.test(name) && !NOT_NAME.test(name)) {
      out.name = name;
      const addr: string[] = [];
      for (const raw of rest.slice(1, 5)) {
        const l = cleanLine(raw);
        if (!l || /https?:\/\/|www\.|@|^\+?\d[\d\s()-]{7,}$/.test(l)) break;
        addr.push(l.replace(POSTCODE, '').replace(/[,\s]+$/, '').trim());
      }
      const address = addr.filter(Boolean).join(', ');
      if (address.length >= 4) out.address = address;
    }
    break;
  }
  // "My name is David Bird", "I'm David Bird", "this is David Bird".
  if (!out.name) {
    const m = /\b(?:my name is|my name's|i am|i'm|this is|it's)\s+((?:[A-ZÀ-Ý][a-zà-ÿ'’-]+)(?:\s+[A-ZÀ-Ý][a-zà-ÿ'’-]+){1,2})\b/.exec(text);
    if (m && !NOT_NAME.test(m[1])) out.name = m[1];
  }
  // "My address is …", "I live at …", "Address: …".
  if (!out.address) {
    const a = /\b(?:my address is|address is|i live at|i'm at|located at|address:)\s*([^\n]{6,120})/i.exec(text);
    if (a) {
      const addr = cleanLine(a[1].replace(POSTCODE, '').replace(/\b(my|and|email|phone|tel).*$/i, ''));
      if (addr.length >= 6) out.address = addr;
    }
  }
  return out;
}

/** May this name replace what the record has? Yes when it is the same person written more fully ("David" → "David Bird"), or the record has no real name. */
export function betterName(current: string | null | undefined, found: string | null | undefined): string | null {
  const f = String(found ?? '').trim();
  if (!f || f.split(/\s+/).length < 2) return null;
  const c = String(current ?? '').trim();
  if (!c || /^[+\d\s()-]+$/.test(c) || /^(meta lead|whatsapp|unknown|customer)$/i.test(c)) return f;
  if (c.toLowerCase() === f.toLowerCase()) return null;
  const cw = c.split(/\s+/);
  const fw = f.split(/\s+/);
  // One word, and it's the new name's first word: just the surname was missing.
  if (cw.length === 1 && cw[0].toLowerCase() === fw[0].toLowerCase().replace(/^(mr|mrs|ms|miss|dr)\.?$/i, fw[1] ?? '')) return f;
  if (cw.length === 1 && cw[0].toLowerCase() === fw[0].toLowerCase()) return f;
  return null;
}
