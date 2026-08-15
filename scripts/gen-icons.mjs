import sharp from 'sharp';
import { mkdirSync } from 'fs';

const ray = 'M10.6 9.6 L13.4 9.6 L13.4 0.6 L10.6 2.8 Z';
const rays = [0, 90, 180, 270]
  .map((a) => `<g transform="rotate(${a} 12 12)"><path d="${ray}"/></g>`)
  .join('');

const spark = (scale) =>
  `<g fill="#F8BC1E" transform="translate(50 50)"><g transform="scale(${scale}) translate(-12 -12)">${rays}</g></g>`;

const anySvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#211F18"/>${spark(2.6)}</svg>`;
const maskSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#211F18"/>${spark(2.0)}</svg>`;

mkdirSync('public/icons', { recursive: true });

async function png(svg, size, out) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(out);
  console.log('wrote', out);
}

await png(anySvg, 192, 'public/icons/icon-192.png');
await png(anySvg, 512, 'public/icons/icon-512.png');
await png(maskSvg, 512, 'public/icons/icon-maskable-512.png');
await png(maskSvg, 180, 'app/apple-icon.png');
console.log('done');
