'use strict';
// Draws the placeholder tray/app icon (near-black tile, yellow disc) as PNGs with no dependencies.
// Replace desktop/assets/*.png with the real Heliaxis mark when the brand artwork is exported.
const zlib = require('node:zlib');
const fs = require('node:fs');
const path = require('node:path');

function crc32(buf) {
  let c, crc = ~0;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return ~crc >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const r = size / 2, rad = size * 0.3, corner = size * 0.22;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const o = y * (size * 4 + 1) + 1 + x * 4;
      const dx = Math.max(Math.abs(x + 0.5 - r) - (r - corner), 0), dy = Math.max(Math.abs(y + 0.5 - r) - (r - corner), 0);
      const inTile = dx * dx + dy * dy <= corner * corner;
      const inDisc = (x + 0.5 - r) ** 2 + (y + 0.5 - r) ** 2 <= rad * rad;
      const px = !inTile ? [0, 0, 0, 0] : inDisc ? [248, 188, 30, 255] : [11, 11, 12, 255];
      raw.set(px, o);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const out = path.join(__dirname, '..', 'assets');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'tray.png'), png(32));
fs.writeFileSync(path.join(out, 'icon.png'), png(256));
console.log('icons written to', out);
