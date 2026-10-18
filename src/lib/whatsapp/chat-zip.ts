/**
 * The text of a WhatsApp export as the user picked it: a .txt (Android, without media), or the chat
 * inside a .zip (an iPhone's "_chat.txt", or Android's "WhatsApp Chat with ….txt" with media). Only the
 * zip's directory and that one file are read, so a zip full of photos isn't loaded into memory, and
 * the browser's own DecompressionStream unpacks it (no library).
 */

const u16 = (v: DataView, at: number) => v.getUint16(at, true);
const u32 = (v: DataView, at: number) => v.getUint32(at, true);
const u64 = (v: DataView, at: number) => Number(v.getBigUint64(at, true));

async function view(file: Blob, start: number, end: number) {
  return new DataView(await file.slice(start, end).arrayBuffer());
}

/** Far longer than any one chat: refuse rather than unpack something huge. */
const MAX_UNZIPPED = 50 * 1024 * 1024;

type Entry = { name: string; flags: number; method: number; packed: number; size: number; offset: number };

/** The entries listed in a zip's central directory. */
async function listZip(zip: Blob): Promise<Entry[]> {
  // The end-of-directory record is the last 22 bytes, plus a comment of up to 64 KB.
  const tailStart = Math.max(0, zip.size - 22 - 0xffff);
  const tail = await view(zip, tailStart, zip.size);
  let end = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (u32(tail, i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('This isn’t a zip file, or it’s damaged.');
  let count = u16(tail, end + 10);
  let dirSize = u32(tail, end + 12);
  let dirStart = u32(tail, end + 16);
  // Zip64 (very big exports): the real numbers are in a record just before.
  if ((count === 0xffff || dirSize === 0xffffffff || dirStart === 0xffffffff) && end >= 20 && u32(tail, end - 20) === 0x07064b50) {
    const at = u64(tail, end - 12);
    const z = await view(zip, at, at + 56);
    if (u32(z, 0) === 0x06064b50) {
      count = u64(z, 32);
      dirSize = u64(z, 40);
      dirStart = u64(z, 48);
    }
  }

  const dir = await view(zip, dirStart, dirStart + dirSize);
  const names = new TextDecoder();
  const entries: Entry[] = [];
  for (let p = 0, n = 0; n < count && p + 46 <= dir.byteLength && u32(dir, p) === 0x02014b50; n++) {
    const nameLen = u16(dir, p + 28);
    const extraLen = u16(dir, p + 30);
    const e: Entry = {
      name: names.decode(new Uint8Array(dir.buffer, dir.byteOffset + p + 46, nameLen)),
      flags: u16(dir, p + 8),
      method: u16(dir, p + 10),
      packed: u32(dir, p + 20),
      size: u32(dir, p + 24),
      offset: u32(dir, p + 42),
    };
    // Zip64 sizes and offset sit in an extra field when the 32-bit ones are maxed out.
    const extraEnd = p + 46 + nameLen + extraLen;
    for (let x = p + 46 + nameLen; x + 4 <= extraEnd; x += 4 + u16(dir, x + 2)) {
      if (u16(dir, x) !== 1) continue;
      // In this order, and only the ones that are maxed out.
      let y = x + 4;
      for (const key of ['size', 'packed', 'offset'] as const) {
        if (e[key] === 0xffffffff && y + 8 <= extraEnd) {
          e[key] = u64(dir, y);
          y += 8;
        }
      }
    }
    entries.push(e);
    p = extraEnd + u16(dir, p + 32);
  }
  return entries;
}

/** The chat .txt inside a WhatsApp export zip. */
export async function readChatZip(zip: Blob): Promise<{ name: string; text: string }> {
  const txt = (await listZip(zip)).filter((e) => /\.txt$/i.test(e.name) && !/(^|\/)__MACOSX\//.test(e.name));
  const base = (e: Entry) => e.name.split('/').pop() || e.name;
  const chat =
    txt.find((e) => base(e).toLowerCase() === '_chat.txt') ||
    txt.find((e) => /^WhatsApp[ _-]?Chat/i.test(base(e))) ||
    (txt.length === 1 ? txt[0] : null);
  if (!chat) throw new Error('There’s no WhatsApp chat in this zip.');
  if (chat.flags & 1) throw new Error('This zip is password-protected.');
  if (chat.size > MAX_UNZIPPED) throw new Error('The chat in this zip is too big to import.');

  const local = await view(zip, chat.offset, chat.offset + 30);
  if (u32(local, 0) !== 0x04034b50) throw new Error('This zip looks damaged.');
  const start = chat.offset + 30 + u16(local, 26) + u16(local, 28);
  const data = zip.slice(start, start + chat.packed);
  let raw: ArrayBuffer;
  if (chat.method === 0) {
    raw = await data.arrayBuffer();
  } else if (chat.method === 8) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('This browser can’t open zip files. Unzip it first and choose the .txt inside, or update the browser.');
    }
    try {
      raw = await new Response(data.stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
    } catch {
      throw new Error('This zip looks damaged.');
    }
  } else {
    throw new Error('This zip is packed in a way the browser can’t open. Unzip it first and choose the .txt inside.');
  }
  return { name: base(chat), text: new TextDecoder().decode(raw) };
}

/** A picked file's chat text; for a zip, also the name of the chat file inside it. */
export async function readChatFile(file: Blob): Promise<{ text: string; inner: string | null }> {
  const magic = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const isZip = magic[0] === 0x50 && magic[1] === 0x4b && magic[2] === 3 && magic[3] === 4;
  if (!isZip) {
    if (file.size > MAX_UNZIPPED) throw new Error('This file is too big to be a chat export.');
    return { text: new TextDecoder().decode(await file.arrayBuffer()), inner: null };
  }
  const { name, text } = await readChatZip(file);
  return { text, inner: name };
}
