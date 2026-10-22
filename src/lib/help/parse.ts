import { PORTAL_KEYS, PORTALS } from '../portals';
import { isPlaceholder } from './context';

/**
 * The Help section's content (src/content/help): one folder per section, its card in _section.md and one
 * Markdown file per article, each with a small frontmatter block. This file turns a file's text into a
 * section or an article and says what's wrong with it. No file system here, so the browser, the server
 * and scripts/test-help.mjs share it (the test also checks links, pictures and callouts in every file).
 *
 *   _section.md   title, summary, order, icon (a name from AdminShell's icons), then an optional intro
 *   <slug>.md     title, summary, order, keywords, where, path, access, then the article
 *
 * `path` is one app page, or a kind of page with a placeholder for the record: /admin/crm/[id] is every
 * customer's page (Help for this page offers it there; there's no single page to open).
 */

export type HelpArticle = {
  section: string;
  slug: string;
  /** /admin/help/<section>/<slug> */
  url: string;
  title: string;
  summary: string;
  order: number;
  keywords: string[];
  /** The menu path on a computer, e.g. "CRM › WhatsApp templates". */
  where: string | null;
  /** The app page it's mainly about (the "Open this page" button; Help for this page); /admin/crm/[id] for every customer's page. */
  path: string | null;
  /** Who can use what it describes: ['everyone'], ['admin'] or portal keys (any of them). */
  access: string[];
  /** The Markdown after the frontmatter. */
  body: string;
};

export type HelpSection = {
  key: string;
  url: string;
  title: string;
  summary: string;
  order: number;
  icon: string;
  /** Optional paragraph shown above the article list (Markdown). */
  intro: string;
  articles: HelpArticle[];
};

export type HelpLibrary = { sections: HelpSection[]; problems: string[] };

export const HELP_ROOT_URL = '/admin/help';
/** Section folders and article files: lower-case words joined by hyphens. */
export const isHelpSlug = (s: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s);

const SECTION_KEYS = ['title', 'summary', 'order', 'icon'] as const;
const ARTICLE_KEYS = ['title', 'summary', 'order', 'keywords', 'where', 'path', 'access'] as const;
export const ACCESS_KEYS = ['everyone', 'admin', ...PORTAL_KEYS] as const;

/** `---` key: value lines `---`, then the body. Values may be quoted; no nesting, no lists. */
export function splitFrontmatter(src: string): { data: Record<string, string>; body: string; problems: string[] } {
  const text = src.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const problems: string[] = [];
  if (!text.startsWith('---\n')) return { data: {}, body: text, problems: ['no frontmatter (the file must start with a --- line)'] };
  const end = text.indexOf('\n---', 3);
  if (end < 0 || !/^\n---[ \t]*(\n|$)/.test(text.slice(end))) return { data: {}, body: text, problems: ['frontmatter is not closed with a --- line'] };
  const data: Record<string, string> = {};
  for (const raw of text.slice(4, end).split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!m) {
      problems.push(`frontmatter line is not "key: value": ${line}`);
      continue;
    }
    const key = m[1].toLowerCase();
    let value = m[2].trim();
    if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value[value.length - 1] === value[0]) value = value.slice(1, -1);
    if (key in data) problems.push(`"${key}" is given twice`);
    data[key] = value;
  }
  const after = text.slice(end + 4).replace(/^[ \t]*\n/, '');
  return { data, body: after.replace(/^\n+/, '').replace(/\s+$/, '') + '\n', problems };
}

const list = (v: string | undefined) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

function orderOf(v: string | undefined, problems: string[]) {
  if (v === undefined || v === '') {
    problems.push('"order" is missing');
    return 1000;
  }
  if (!/^-?\d+$/.test(v)) {
    problems.push(`"order" must be a whole number, not "${v}"`);
    return 1000;
  }
  return Number(v);
}

function required(data: Record<string, string>, key: string, problems: string[]) {
  const v = data[key]?.trim() ?? '';
  if (!v) problems.push(`"${key}" is missing`);
  return v;
}

/** "getting-started" → "Getting started" (a section with no _section.md yet). */
export const titleFromKey = (key: string) => key.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

export function parseSection(key: string, src: string | null, icons: readonly string[] | null = null): { section: Omit<HelpSection, 'articles'>; problems: string[] } {
  const url = `${HELP_ROOT_URL}/${key}`;
  if (src === null) {
    return {
      section: { key, url, title: titleFromKey(key), summary: '', order: 1000, icon: 'help', intro: '' },
      problems: ['_section.md is missing'],
    };
  }
  const { data, body, problems } = splitFrontmatter(src);
  for (const k of Object.keys(data)) if (!(SECTION_KEYS as readonly string[]).includes(k)) problems.push(`unknown frontmatter key "${k}"`);
  const title = required(data, 'title', problems) || titleFromKey(key);
  const summary = required(data, 'summary', problems);
  const order = orderOf(data.order, problems);
  let icon = data.icon?.trim() || '';
  if (!icon) problems.push('"icon" is missing');
  else if (icons && !icons.includes(icon)) problems.push(`"icon: ${icon}" is not one of the shell's icons (${icons.join(', ')})`);
  if (!icon || (icons && !icons.includes(icon))) icon = 'help';
  return { section: { key, url, title, summary, order, icon, intro: body.trim() }, problems };
}

export function parseArticle(section: string, slug: string, src: string): { article: HelpArticle; problems: string[] } {
  const { data, body, problems } = splitFrontmatter(src);
  for (const k of Object.keys(data)) if (!(ARTICLE_KEYS as readonly string[]).includes(k)) problems.push(`unknown frontmatter key "${k}"`);
  const title = required(data, 'title', problems);
  const summary = required(data, 'summary', problems);
  const order = orderOf(data.order, problems);
  const access = list(data.access);
  if (!access.length) problems.push('"access" is missing (everyone, admin, or a permission such as crm)');
  for (const a of access) if (!(ACCESS_KEYS as readonly string[]).includes(a)) problems.push(`"access: ${a}" is not everyone, admin or one of ${PORTAL_KEYS.join(', ')}`);
  if (access.length > 1 && access.some((a) => a === 'everyone' || a === 'admin')) problems.push('"access": everyone and admin stand alone');
  const path = data.path?.trim() || null;
  if (path && !/^\/(admin|api)(\/|$|\?)/.test(path)) problems.push(`"path: ${path}" must be an app page starting /admin`);
  if (path) {
    const parts = path.split(/[?#]/)[0].split('/').filter(Boolean);
    if (parts.some((p) => /[[\]]/.test(p) && !isPlaceholder(p))) problems.push(`"path: ${path}": a placeholder is a whole part in square brackets, such as /admin/crm/[id]`);
    else if (parts.length > 1 && isPlaceholder(parts[1])) problems.push(`"path: ${path}": the part after /${parts[0]} must be a page's name, not a placeholder`);
  }
  if (title.length > 80) problems.push(`"title" is ${title.length} characters (keep it under about 60)`);
  if (!body.trim()) problems.push('the article has no body');
  return {
    article: {
      section,
      slug,
      url: `${HELP_ROOT_URL}/${section}/${slug}`,
      title: title || titleFromKey(slug),
      summary,
      order,
      keywords: list(data.keywords),
      where: data.where?.trim() || null,
      path,
      access: access.filter((a) => (ACCESS_KEYS as readonly string[]).includes(a)).length ? access.filter((a) => (ACCESS_KEYS as readonly string[]).includes(a)) : ['everyone'],
      body,
    },
    problems,
  };
}

/** Sections in order, each with its articles in order; problems for orders used twice. */
export function assemble(sections: HelpSection[], problems: string[]): HelpLibrary {
  const byOrder = <T extends { order: number; title: string }>(a: T, b: T) => a.order - b.order || a.title.localeCompare(b.title);
  for (const s of sections) {
    s.articles.sort(byOrder);
    const seen = new Map<number, string>();
    for (const a of s.articles) {
      const other = seen.get(a.order);
      if (other) problems.push(`${s.key}/${a.slug}.md: "order: ${a.order}" is also used by ${other}.md`);
      else seen.set(a.order, a.slug);
    }
  }
  sections.sort(byOrder);
  return { sections, problems };
}

/** The chip on an article: who can use what it describes. */
export function accessLabel(access: string[]): string {
  if (!access.length || access.includes('everyone')) return 'Open to everyone';
  if (access.includes('admin')) return 'Admins only';
  const names = access.map((k) => PORTALS.find((p) => p.key === k)?.label ?? k);
  return `Needs ${names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}` : names[0]} access`;
}
