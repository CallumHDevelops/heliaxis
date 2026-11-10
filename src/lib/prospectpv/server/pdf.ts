/**
 * Server-only: a browser for rendering PDFs, and image inlining so letters
 * don't depend on the network while printing.
 */
import 'server-only';
import type { Browser } from 'playwright-core';
import type { LetterData } from '../types';

export async function launchBrowser(): Promise<Browser> {
  const { chromium } = await import('playwright-core');
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const packed = (await import('@sparticuz/chromium')).default;
    return chromium.launch({ args: packed.args, executablePath: await packed.executablePath(), headless: true });
  }
  return chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
}

const MAX_BYTES = 5 * 1024 * 1024;

async function toDataUri(url: string): Promise<string> {
  if (url.startsWith('data:')) return url;
  if (!/^https?:\/\//.test(url)) throw new Error(`Image address isn’t a web address: ${url.slice(0, 40)}`);
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Couldn’t load an image for the letter (${res.status}): ${url}`);
  const type = res.headers.get('content-type')?.split(';')[0] ?? '';
  if (!type.startsWith('image/')) throw new Error(`An image address returned ${type || 'something that isn’t an image'}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error(`An image is over 5 MB: ${url}`);
  return `data:${type};base64,${buf.toString('base64')}`;
}

/** Replaces every image address in the letter with the image itself. */
export async function inlineLetterImages(data: LetterData): Promise<LetterData> {
  const cache = new Map<string, Promise<string>>();
  const get = (u: string | undefined) => {
    if (!u) return Promise.resolve(u);
    if (!cache.has(u)) cache.set(u, toDataUri(u));
    return cache.get(u)!;
  };
  const i = data.images;
  const [logo, logoWhite, accreditations, hero, install, team, esaUnit, signatureUrl, photoUrl] = await Promise.all([
    get(i.logo), get(i.logoWhite), get(i.accreditations), get(i.hero), get(i.install), get(i.team), get(i.esaUnit), get(data.sender.signatureUrl), get(data.sender.photoUrl),
  ]);
  return {
    ...data,
    images: { ...i, logo: logo ?? '', logoWhite, accreditations: accreditations ?? '', hero, install, team, esaUnit },
    sender: { ...data.sender, signatureUrl, photoUrl },
  };
}
