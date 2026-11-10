/**
 * Browser test of the Map screen in real Chromium: draws a shape with the mouse,
 * checks the estimate flow, keyboard use and phone width. Basemap tiles are off
 * (no tile server in tests); the drawing, validation and panels are the real code.
 *
 *   npm run test:prospectpv:browser      (needs Chromium; set CHROME_PATH if not at /opt/pw-browsers/chromium)
 */
import { build } from 'esbuild';
import { copyFileSync, mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, type Browser, type Locator, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Playwright's own matchers live in @playwright/test; these small helpers wait the same way. */
const seen = (l: Locator, timeout = 10_000) => l.waitFor({ state: 'visible', timeout });
const hasText = (l: Locator, text: string | RegExp, timeout = 10_000) => l.filter({ hasText: text }).waitFor({ state: 'visible', timeout });

let browser: Browser;
let server: Server;
let base = '';
let dir: string;
const ROOT = path.resolve(__dirname, '../../..');

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'pvmap-'));
  await build({
    entryPoints: [path.join(ROOT, 'tests/prospectpv/browser/harness.tsx')],
    bundle: true, outfile: path.join(dir, 'app.js'), format: 'iife', platform: 'browser', jsx: 'automatic', minify: false,
    loader: { ".css": "css", ".svg": "dataurl", ".png": "dataurl" }, define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}', 'process.platform': '"browser"' },
    alias: { '@': path.join(ROOT, 'src'), 'server-only': path.join(ROOT, 'tests/prospectpv/empty.ts') },
    tsconfig: path.join(ROOT, 'tsconfig.json'), logLevel: 'error',
  });
  // The map's worker is served from /maplibre/ in the app (scripts/copy-maplibre.mjs); the test server serves it flat.
  for (const f of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) copyFileSync(path.join(ROOT, 'node_modules/maplibre-gl/dist', f), path.join(dir, f));
  writeFileSync(path.join(dir, 'index.html'), '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="app.css"><div id="root"></div><script src="app.js"></script>');
  // Served over http: a file:// page makes MapLibre's worker fetch fail.
  const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };
  server = createServer((req, res) => {
    const name = (req.url ?? '/').split('?')[0]!.replace(/^\/$/, '/index.html');
    const file = path.join(dir, path.basename(name));
    if (!existsSync(file)) { res.statusCode = 404; res.end(); return; }
    res.setHeader('Content-Type', types[path.extname(file)] ?? 'application/octet-stream');
    res.end(readFileSync(file));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const executablePath = process.env.CHROME_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  browser = await chromium.launch({ executablePath, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
}, 120_000);
afterAll(async () => { await browser?.close(); server?.close(); });

async function open(width = 1280, height = 900): Promise<Page> {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors: string[] = [];
  page.on('pageerror', (e) => { errors.push(e.message); if (process.env.PV_DEBUG) console.log('pageerror', e.message.slice(0, 300)); });
  page.on('console', (m) => { if (process.env.PV_DEBUG && m.type() === 'error') console.log('console.error', m.text().slice(0, 300)); });
  page.on('requestfailed', (r) => { if (process.env.PV_DEBUG) console.log('request failed', r.url().slice(0, 120), r.failure()?.errorText); });
  (page as Page & { errors: string[] }).errors = errors;
  await page.goto(`${base}/index.html`);
  await page.waitForSelector('.pvm-map[data-ready="true"]', { timeout: 30_000 });
  return page;
}

/** Draws a rectangle of about 100 m by 100 m near the middle of the map with the mouse. */
async function drawSquare(page: Page) {
  await page.getByRole('button', { name: 'Rectangle' }).click();
  const box = (await page.locator('.pvm-map canvas').first().boundingBox())!;
  const cx = box.x + box.width / 2; const cy = box.y + box.height / 2;
  await page.mouse.click(cx - 60, cy - 60);
  await page.mouse.move(cx + 60, cy + 60, { steps: 4 });
  await page.mouse.click(cx + 60, cy + 60);
}

describe('Map screen', () => {
  it('ships no key, no OS host and no server code in the browser bundle', () => {
    const js = readFileSync(path.join(dir, 'app.js'), 'utf8');
    for (const bad of ['api.os.uk', 'PROSPECTPV_OS_API_KEY', 'OS_DATA_HUB_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'key=']) {
      expect(js.includes(bad), `bundle contains "${bad}"`).toBe(false);
    }
  });

  it('starts empty and offers the drawing tools by name', async () => {
    const page = await open();
    await seen(page.getByText('Nothing drawn yet'));
    for (const n of ['Polygon', 'Rectangle', 'Freehand', 'Edit']) await seen(page.getByRole('button', { name: n }));
    expect(await page.getByRole('button', { name: 'Polygon' }).getAttribute('aria-pressed')).toBe('true');
    expect(await page.getByRole('button', { name: /Count homes/ }).count()).toBe(0);
    await page.close();
  }, 60_000);

  it('draws a shape, shows its size, counts homes and saves it', async () => {
    const page = await open();
    await drawSquare(page);
    await hasText(page.locator('.pvm-big'), 'ha', 10_000);
    const text = await page.locator('.pvm-big').innerText();
    expect(Number.parseFloat(text)).toBeGreaterThan(0.1);

    await page.getByRole('button', { name: 'Count homes and estimate' }).click();
    await seen(page.getByText('Homes found'));
    await hasText(page.locator('.pvm-stat', { hasText: 'Homes found' }), '412');
    await hasText(page.locator('.pvm-stat', { hasText: 'Estimated cost' }), '£0.00');
    expect(await page.evaluate(() => window.__calls.estimate.length)).toBe(1);
    const sent = await page.evaluate(() => window.__calls.estimate[0] as { type: string; coordinates: number[][][][] });
    expect(sent.type).toBe('MultiPolygon');
    expect(sent.coordinates[0]![0]!.length).toBeGreaterThanOrEqual(4);
    // Longitude, latitude in WGS84 near Cardiff, never projected coordinates.
    const [lng, lat] = sent.coordinates[0]![0]![0]!;
    expect(lng).toBeGreaterThan(-3.3); expect(lng).toBeLessThan(-3.0);
    expect(lat).toBeGreaterThan(51.4); expect(lat).toBeLessThan(51.6);

    await page.getByRole('button', { name: 'Save area as a campaign' }).click();
    await seen(page.getByText('Give this area a name'));
    await page.getByLabel('Name this area').fill('Test estate');
    await page.getByRole('button', { name: 'Save area as a campaign' }).click();
    await seen(page.getByText(/Saved as a draft campaign/));
    expect(await page.evaluate(() => window.__calls.save.length)).toBe(1);
    expect(await page.evaluate(() => (window.__calls.save[0] as { name: string }).name)).toBe('Test estimate'.replace('estimate', 'estate'));
    expect((page as Page & { errors: string[] }).errors).toEqual([]);
    await page.close();
  }, 90_000);

  it('blocks an area that is too big with a plain message and no estimate button', async () => {
    const page = await open();
    await page.getByRole('button', { name: 'Rectangle' }).click();
    const box = (await page.locator('.pvm-map canvas').first().boundingBox())!;
    // Zoom well out first so a normal drag covers far more than 50 ha.
    await page.evaluate(() => (document.querySelector('.pvm-map') as HTMLElement).dispatchEvent(new Event('noop')));
    for (let i = 0; i < 5; i++) { await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.wheel(0, 400); await page.waitForTimeout(250); }
    await page.waitForTimeout(600);
    await page.mouse.click(box.x + 80, box.y + 80);
    await page.mouse.move(box.x + box.width - 80, box.y + box.height - 80, { steps: 4 });
    await page.mouse.click(box.x + box.width - 80, box.y + box.height - 80);
    await seen(page.getByRole('alert').filter({ hasText: /limit/ }), 10_000);
    expect(await page.getByRole('button', { name: /Count homes/ }).count()).toBe(0);
    await page.close();
  }, 90_000);

  it('can be started without a mouse by loading an area from a file', async () => {
    const page = await open();
    const geo = { type: 'Polygon', coordinates: [[[-3.1795, 51.4812], [-3.178, 51.4812], [-3.178, 51.4821], [-3.1795, 51.4821], [-3.1795, 51.4812]]] };
    await page.setInputFiles('input[type=file]', { name: 'area.geojson', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(geo)) });
    await hasText(page.locator('.pvm-big'), 'ha', 10_000);
    await page.getByRole('button', { name: 'Count homes and estimate' }).focus();
    await page.keyboard.press('Enter');
    await seen(page.locator('.pvm-stat', { hasText: 'Homes found' }));
    await page.close();
  }, 60_000);

  it('says so when an uploaded file is not an area', async () => {
    const page = await open();
    await page.setInputFiles('input[type=file]', { name: 'x.geojson', mimeType: 'application/json', buffer: Buffer.from('{"type":"Point","coordinates":[0,0]}') });
    await seen(page.getByRole('alert').filter({ hasText: /no polygon/ }));
    await page.close();
  }, 60_000);

  it('works at phone width without sideways scrolling', async () => {
    const page = await open(390, 800);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await seen(page.getByRole('button', { name: 'Rectangle' }));
    await page.close();
  }, 60_000);
});
