/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * On-brand starting layouts. Built from the brand guidelines' own patterns (dark hero with a
 * gold-accent headline, mono eyebrow + footer, the social post spec, accreditation chips).
 * Everything is placed relative to the safe area, so one layout suits a card or a banner.
 */
import { ACCREDITATIONS, CONTACT, LOGOS, brandColour } from './brand';
import { brandSvg, iconSvg, type IconTone } from './assets';
import { mm, type StudioEngine } from './engine';
import { formatById } from './formats';

export type StarterDef = { id: string; name: string; hint: string; formats: string[] | 'print' | 'digital' | 'all' };

export const STARTERS: StarterDef[] = [
  { id: 'blank', name: 'Blank', hint: 'Just the page', formats: 'all' },
  { id: 'hero-dark', name: 'Dark hero', hint: 'Ink background, gold-accent headline, CTA', formats: ['a6', 'a5', 'dl', 'a4', 'a3', 'a2', 'a1', 'comp', 'a4-a5fold', 'a4-dlfold'] },
  { id: 'light-photo', name: 'Light with photo', hint: 'Paper background, photo frame, icon features', formats: ['a6', 'a5', 'dl', 'a4', 'a3', 'a2', 'a1', 'a4-a5fold', 'a4-dlfold'] },
  { id: 'bcard', name: 'Business card', hint: 'Dark front, contact details on the back', formats: ['bcard', 'bcard-p'] },
  { id: 'letterhead', name: 'Letterhead', hint: 'Logo, contact line and accreditations', formats: ['letterhead'] },
  { id: 'popup', name: 'Pop-up stand', hint: 'Keeps everything on the front face', formats: ['popup33'] },
  { id: 'rollup', name: 'Roller banner', hint: 'Hero top, features, contact above the base', formats: ['rollup'] },
  { id: 'social', name: 'Social post', hint: 'The brand post layout', formats: 'digital' },
];

export function startersFor(formatId: string, digital: boolean) {
  // Custom sizes get the general print layouts (they work off the safe area). An unrecognised
  // printer template is usually die-cut into panels (folders, packs), so full-page layouts don't fit.
  const fid = digital || formatById(formatId) ? formatId : formatId === 'template' ? '' : 'a4';
  return STARTERS.filter((s) => s.formats === 'all' || (s.formats === 'digital' ? digital : s.formats === 'print' ? !digital : (s.formats as string[]).includes(fid)));
}

/* ---------- small builders ---------- */

async function logo(e: StudioEngine, onDark: boolean, widthPt: number, x: number, y: number) {
  const def = LOGOS.find((l) => l.id === (onDark ? 'logo-light' : 'logo'))!;
  const o = await e.addSvg(await brandSvg(def.asset), { role: 'logo', name: def.name, widthPt, logoId: def.id });
  o.set({ left: x, top: y });
  o.setCoords();
  return o;
}
async function spark(e: StudioEngine, sizePt: number, x: number, y: number) {
  const o = await e.addSvg(await brandSvg('heliaxis-spark.svg'), { role: 'spark', name: 'Spark', widthPt: sizePt });
  o.set({ left: x, top: y });
  o.setCoords();
  return o;
}
async function icon(e: StudioEngine, name: string, tone: IconTone, sizePt: number, x: number, y: number) {
  const o = await e.addSvg(await iconSvg(name, tone), { role: 'icon', name: `Icon · ${name}`, widthPt: sizePt, iconName: name });
  o.set({ left: x, top: y });
  o.setCoords();
  return o;
}
function text(
  e: StudioEngine,
  style: string,
  body: string,
  x: number,
  y: number,
  width: number,
  opts: { fill?: string; align?: string; accent?: string; size?: number; accentFill?: string } = {},
) {
  const o = e.addText(style, body) as any;
  o.set({ left: x, top: y, width, textAlign: opts.align ?? 'left' });
  if (opts.fill) o.set('fill', opts.fill);
  if (opts.size) o.set('fontSize', opts.size);
  if (opts.accent) {
    const i = body.lastIndexOf(opts.accent);
    if (i >= 0) o.setSelectionStyles({ fill: opts.accentFill ?? brandColour('solar').hex }, i, i + opts.accent.length);
  }
  o.initDimensions?.();
  o.setCoords();
  return o;
}
function place(o: any, x: number, y: number) {
  o.set({ left: x, top: y });
  o.setCoords();
  return o;
}

const INK = '#211F18', PAPER = '#F7F2E7', MUTED_D = '#A69F8E', SOLAR = '#F8BC1E', AMBER2 = '#C77F04', MUTED = '#6E6A5E';

/* ---------- page builders ---------- */

async function heroDark(e: StudioEngine) {
  const s = e.safePt();
  const u = Math.min(s.w, s.h) / 100; // layout unit
  e.addBrandBg({ base: INK, glow: true, grid: true, dark: true });
  await logo(e, true, Math.max(mm(28), s.w * 0.38), s.x, s.y);
  await spark(e, u * 7, s.x + s.w - u * 7, s.y);
  const eb = text(e, 'eyebrow', 'MCS-certified · South Wales', s.x, s.y + s.h * 0.3, s.w, { fill: SOLAR });
  const h = text(e, 'display', 'Energy that revolves around you.', s.x, eb.top + eb.height + u * 3, s.w * 0.92, { fill: PAPER, accent: 'you.' });
  const lead = text(e, 'lead', 'Solar, battery storage, heat pumps and EV charging — designed around how you use energy.', s.x, h.top + h.height + u * 4, s.w * 0.85, { fill: MUTED_D });
  const btn = e.addButton('Get my free quote →', 'solid');
  place(btn, s.x, lead.top + lead.height + u * 6);
  const foot = text(e, 'label', `${CONTACT.web.toUpperCase()} · ${CONTACT.phone}`, s.x, 0, s.w, { fill: MUTED_D });
  place(foot, s.x, s.y + s.h - foot.height);
  let cx = s.x;
  const chipY = foot.top - u * 9;
  for (const a of ACCREDITATIONS) {
    const c = e.addButton(a, 'chip-dark', false);
    place(c, cx, chipY);
    cx += c.width + u * 2;
  }
}

async function lightPhoto(e: StudioEngine) {
  const s = e.safePt();
  const u = Math.min(s.w, s.h) / 100;
  e.addBrandBg({ base: PAPER, glow: true, grid: true, dark: false });
  await logo(e, false, Math.max(mm(28), s.w * 0.34), s.x, s.y);
  const eb = text(e, 'eyebrow', 'Solar · Battery · EV', s.x, s.y + s.h * 0.16, s.w, { fill: AMBER2 });
  const h = text(e, 'heading', 'Own your energy.', s.x, eb.top + eb.height + u * 2, s.w, { fill: INK, accent: 'energy.' });
  const frame = e.addFrame(s.w, s.h * 0.34);
  place(frame, s.x, h.top + h.height + u * 4);
  const fy = frame.top + frame.height + u * 5;
  const items: [string, string][] = [['solar', 'Solar panels'], ['battery', 'Battery storage'], ['ev', 'EV charging']];
  const colW = s.w / 3;
  for (let i = 0; i < items.length; i++) {
    const [ic, label] = items[i];
    await icon(e, ic, 'ink', u * 9, s.x + colW * i, fy);
    text(e, 'subheading', label, s.x + colW * i, fy + u * 11, colW - u * 3, { fill: INK });
  }
  const btn = e.addButton('Book a free survey →', 'dark');
  const foot = text(e, 'label', `${CONTACT.web.toUpperCase()} · ${CONTACT.phone}`, s.x, 0, s.w, { fill: MUTED });
  place(foot, s.x, s.y + s.h - foot.height);
  place(btn, s.x, foot.top - btn.height - u * 4);
}

async function backContact(e: StudioEngine) {
  const s = e.safePt();
  const u = Math.min(s.w, s.h) / 100;
  e.addBrandBg({ base: PAPER, glow: false, grid: true, dark: false });
  await logo(e, false, Math.max(mm(26), s.w * 0.3), s.x, s.y);
  const h = text(e, 'heading', 'Why Heliaxis', s.x, s.y + s.h * 0.14, s.w, { fill: INK });
  let y = h.top + h.height + u * 4;
  const pts: [string, string, string][] = [
    ['shield', 'MCS-certified', 'Designed and installed to the MCS standard, backed by RECC and TrustMark.'],
    ['chart', 'Designed around you', 'Every system is sized to your real energy use — no guesswork.'],
    ['wrench', 'Local and accountable', 'Our own team, across South Wales, from survey to switch-on.'],
  ];
  for (const [ic, t, d] of pts) {
    await icon(e, ic, 'ink', u * 8, s.x, y);
    const tt = text(e, 'subheading', t, s.x + u * 11, y, s.w - u * 11, { fill: INK });
    const dd = text(e, 'body', d, s.x + u * 11, tt.top + tt.height + u, s.w - u * 11, { fill: MUTED });
    y = dd.top + dd.height + u * 5;
  }
  const foot = text(e, 'label', `${CONTACT.web.toUpperCase()} · ${CONTACT.phone} · ${CONTACT.email.toUpperCase()}`, s.x, 0, s.w, { fill: MUTED });
  place(foot, s.x, s.y + s.h - foot.height);

  // Dark call-to-action panel above the footer, when the page has room for it.
  const pad = u * 6;
  const inner = s.w - pad * 2;
  const panel = e.addRect(INK);
  panel.set({ name: 'Call-to-action panel', rx: mm(1.2), ry: mm(1.2) });
  const eb = text(e, 'eyebrow', 'Free survey · No obligation', 0, 0, inner, { fill: SOLAR });
  const hd = text(e, 'heading', 'Ready to own your energy?', 0, 0, inner, { fill: PAPER, accent: 'energy?' });
  const bd = text(e, 'body', `Call ${CONTACT.phone} or book online — we’ll design a system around your home.`, 0, 0, inner, { fill: MUTED_D });
  const btn = e.addButton('Book my free survey →', 'solid', false);
  const ph = pad + eb.height + u * 2 + hd.height + u * 2 + bd.height + u * 5 + btn.height + pad;
  const top = foot.top - u * 6 - ph;
  if (top < y) {
    for (const o of [panel, eb, hd, bd, btn]) e.canvas.remove(o);
    return;
  }
  panel.set({ left: s.x, top, width: s.w, height: ph });
  panel.setCoords();
  place(eb, s.x + pad, top + pad);
  place(hd, s.x + pad, eb.top + eb.height + u * 2);
  place(bd, s.x + pad, hd.top + hd.height + u * 2);
  place(btn, s.x + pad, bd.top + bd.height + u * 5);
}

async function bcardFront(e: StudioEngine) {
  const s = e.safePt();
  e.addBrandBg({ base: INK, glow: true, grid: true, dark: true });
  const w = Math.max(mm(30), s.w * 0.62);
  const lg = await logo(e, true, w, 0, 0);
  place(lg, s.x + (s.w - lg.getScaledWidth()) / 2, s.y + s.h * 0.36);
  const strap = text(e, 'label', 'Energy that revolves around you', s.x, 0, s.w, { fill: MUTED_D, align: 'center' });
  place(strap, s.x, lg.top + lg.getScaledHeight() + mm(3));
}
async function bcardBack(e: StudioEngine) {
  const s = e.safePt();
  e.addBrandBg({ base: PAPER, glow: false, grid: true, dark: false });
  const name = text(e, 'subheading', 'Your Name', s.x, s.y, s.w * 0.8, { fill: INK, size: 11 });
  const role = text(e, 'label', 'Role · Heliaxis', s.x, name.top + name.height + mm(0.8), s.w, { fill: AMBER2 });
  const lines = [CONTACT.phone, CONTACT.email, CONTACT.web];
  let y = role.top + role.height + mm(3.5);
  for (const l of lines) {
    const t = text(e, 'body', l, s.x, y, s.w, { fill: INK, size: 7.5 });
    y = t.top + t.height + mm(0.6);
  }
  const acc = text(e, 'label', ACCREDITATIONS.join(' · '), s.x, 0, s.w - mm(9), { fill: MUTED });
  place(acc, s.x, s.y + s.h - acc.height);
  await spark(e, mm(6), s.x + s.w - mm(6), s.y + s.h - mm(6));
}

async function letterhead(e: StudioEngine) {
  const s = e.safePt();
  await logo(e, false, mm(48), s.x, s.y);
  const r = text(e, 'label', `${CONTACT.web.toUpperCase()} · ${CONTACT.phone}`, s.x, s.y, s.w, { fill: MUTED, align: 'right' });
  place(r, s.x, s.y + mm(4));
  const foot = text(e, 'small', 'Heliaxis Ltd · MCS-certified renewable energy installers · South Wales', s.x, 0, s.w * 0.7, { fill: MUTED });
  place(foot, s.x, s.y + s.h - foot.height);
  let cx = s.x + s.w;
  for (const a of [...ACCREDITATIONS].reverse()) {
    const c = e.addButton(a, 'chip', false);
    cx -= c.width;
    place(c, cx, s.y + s.h - c.height);
    cx -= mm(2);
  }
}

async function popup(e: StudioEngine) {
  // Front face only (between the wrap-round zones).
  const z = e.g.zones ?? [];
  const left = z[0] ? mm(z[0].box.x + z[0].box.w) : e.safePt().x;
  const right = z[1] ? mm(z[1].box.x) : e.safePt().x + e.safePt().w;
  const sf = e.safePt();
  const pad = (right - left) * 0.07;
  const s = { x: left + pad, y: sf.y + pad, w: right - left - 2 * pad, h: sf.h - 2 * pad };
  const u = s.w / 100;
  e.addBrandBg({ base: INK, glow: true, grid: true, dark: true });
  const lg = await logo(e, true, s.w * 0.62, 0, 0);
  place(lg, s.x + (s.w - lg.getScaledWidth()) / 2, s.y + u * 2);
  const eb = text(e, 'eyebrow', 'MCS-certified · South Wales', s.x, lg.top + lg.getScaledHeight() + u * 8, s.w, { fill: SOLAR, align: 'center', size: u * 2.2 });
  const h = text(e, 'display', 'Energy that revolves around you.', s.x, eb.top + eb.height + u * 2.5, s.w, { fill: PAPER, accent: 'you.', align: 'center', size: u * 9 });
  const feats: [string, string][] = [['solar', 'Solar'], ['battery', 'Battery storage'], ['heatpump', 'Heat pumps'], ['ev', 'EV charging']];
  const colW = s.w / feats.length;
  const fy = h.top + h.height + u * 8;
  for (let i = 0; i < feats.length; i++) {
    const [ic, label] = feats[i];
    const ico = await icon(e, ic, 'paper', u * 12, 0, fy);
    place(ico, s.x + colW * i + (colW - ico.getScaledWidth()) / 2, fy);
    text(e, 'subheading', label, s.x + colW * i, fy + u * 14, colW, { fill: PAPER, align: 'center', size: u * 3 });
  }
  const phone = text(e, 'heading', `${CONTACT.phone} · ${CONTACT.web}`, s.x, 0, s.w, { fill: SOLAR, align: 'center', size: u * 4.2 });
  place(phone, s.x, s.y + s.h - phone.height);
}

async function rollup(e: StudioEngine) {
  const sf = e.safePt();
  const base = (e.g.zones ?? []).find((z) => z.kind === 'nogo');
  const bottom = base ? mm(base.box.y) - mm(10) : sf.y + sf.h;
  const s = { x: sf.x, y: sf.y, w: sf.w, h: bottom - sf.y };
  const u = s.w / 100;
  e.addBrandBg({ base: PAPER, glow: false, grid: true, dark: false });
  const hero = e.addBrandBg({ base: INK, glow: true, grid: true, dark: true }, 'top-half');
  hero.set({ height: e.H * 0.5 });
  e.canvas.moveObjectTo(hero, 1); // backgrounds go to the back — keep the dark half above the paper
  await logo(e, true, s.w * 0.7, s.x, s.y + u * 4);
  const h = text(e, 'display', 'Energy that revolves around you.', s.x, s.y + u * 40, s.w, { fill: PAPER, accent: 'you.', size: u * 11 });
  const lead = text(e, 'lead', 'Solar, batteries, heat pumps and EV charging across South Wales.', s.x, h.top + h.height + u * 6, s.w, { fill: MUTED_D, size: u * 4.4 });
  void lead;
  let y = e.H * 0.5 + u * 10;
  for (const [ic, label] of [['solar', 'Solar panels'], ['battery', 'Battery storage'], ['heatpump', 'Heat pumps'], ['ev', 'EV charging']] as [string, string][]) {
    await icon(e, ic, 'ink', u * 12, s.x, y);
    text(e, 'heading', label, s.x + u * 17, y + u * 2.5, s.w - u * 17, { fill: INK, size: u * 5.5 });
    y += u * 18;
  }
  const btn = e.addButton('Get my free quote →', 'solid');
  btn.set({ labelSize: u * 5 });
  btn.fitLabel?.();
  const phone = text(e, 'heading', CONTACT.phone, s.x, 0, s.w, { fill: INK, size: u * 7 });
  place(phone, s.x, bottom - phone.height);
  place(btn, s.x, phone.top - btn.height - u * 5);
}

/** Wide banners (LinkedIn cover): the profile photo covers the lower left, so everything sits right. */
async function socialWide(e: StudioEngine) {
  const t = e.trimPt();
  const cq = t.h / 100;
  const pad = t.h * 0.12;
  const colW = t.w * 0.58;
  const x = t.x + t.w - pad - colW;
  e.addBrandBg({ base: INK, glow: true, grid: true, dark: true });
  const lg = await logo(e, true, cq * 34, 0, 0);
  place(lg, t.x + t.w - pad - lg.getScaledWidth(), t.y + pad);
  const h = text(e, 'display', 'Energy that revolves around you.', x, 0, colW, { fill: PAPER, accent: 'you.', align: 'right', size: cq * 13 });
  place(h, x, t.y + t.h / 2 - h.height / 2 + cq * 4);
  const foot = text(e, 'label', `${CONTACT.web.toUpperCase()} · ${CONTACT.phone}`, x, 0, colW, { fill: MUTED_D, align: 'right', size: cq * 5 });
  place(foot, x, t.y + t.h - pad - foot.height);
}

async function social(e: StudioEngine) {
  const t = e.trimPt();
  if (t.w / t.h > 3) return socialWide(e);
  const pad = Math.min(t.w, t.h) * 0.07;
  const s = { x: t.x + pad, y: t.y + pad, w: t.w - 2 * pad, h: t.h - 2 * pad };
  const cq = Math.min(t.w, t.h) / 100; // container-query unit from the brand post CSS (square post = width)
  e.addBrandBg({ base: INK, glow: true, grid: true, dark: true });
  await logo(e, true, cq * 30, s.x, s.y);
  await spark(e, cq * 6, s.x + s.w - cq * 6, s.y);
  const eb = text(e, 'eyebrow', 'Did you know?', s.x, s.y + s.h * 0.28, s.w, { fill: SOLAR, size: cq * 2.9 });
  const h = text(e, 'display', 'Cut your bills with solar.', s.x, eb.top + eb.height + cq * 2.5, s.w, { fill: PAPER, accent: 'solar.', size: cq * 9.5 });
  text(e, 'lead', 'MCS-certified installs across South Wales — designed around how you use energy.', s.x, h.top + h.height + cq * 3, s.w * 0.8, { fill: MUTED_D, size: cq * 4 });
  const left = text(e, 'label', CONTACT.web.toUpperCase(), s.x, 0, s.w / 2, { fill: MUTED_D, size: cq * 2.9 });
  place(left, s.x, s.y + s.h - left.height);
  const right = text(e, 'label', CONTACT.phone, s.x + s.w / 2, 0, s.w / 2, { fill: MUTED_D, size: cq * 2.9, align: 'right' });
  place(right, s.x + s.w / 2, s.y + s.h - right.height);
}

const BUILDERS: Record<string, ((e: StudioEngine) => Promise<void>)[]> = {
  blank: [],
  'hero-dark': [heroDark, backContact],
  'light-photo': [lightPhoto, backContact],
  bcard: [bcardFront, bcardBack],
  letterhead: [letterhead],
  popup: [popup],
  rollup: [rollup],
  social: [social],
};

/**
 * Build a starter into page JSONs (one per page name). Uses the live engine canvas as the
 * workspace; the caller loads the first page afterwards.
 */
export async function buildStarter(e: StudioEngine, id: string, pageCount: number): Promise<Record<string, unknown>[]> {
  const builders = BUILDERS[id] ?? [];
  const pages: Record<string, unknown>[] = [];
  for (let i = 0; i < pageCount; i++) {
    await e.loadJson({ version: '6.7.1', objects: [] });
    const b = builders[i] ?? (i > 0 && builders.length ? backContact : null);
    if (b) await b(e);
    e.canvas.discardActiveObject();
    pages.push(e.serialize());
  }
  return pages;
}
