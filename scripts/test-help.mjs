// Help (/admin/help): the articles in src/content/help and the code that reads, searches and shows them.
//  1. Every section and article parses with the frontmatter it needs (src/lib/help/parse.ts); folder and
//     file names are lower-case-with-hyphens, orders are unique in a section, icons are the shell's.
//  2. Links: /admin/help/… goes to a real section or article; other /admin/… and /api/… links, and every
//     article's `path`, go to a page or route the app has.
//  3. Pictures exist under public/help/; no shot: placeholders are left. A picture still to be taken is an
//     HTML comment on its own line, <!-- shot: <section>/<file>.jpg | Caption | alt -->, which shows nothing.
//  4. Callouts are one of the four (Good to know, Watch out, Admins only, Once switched on), and a
//     "Once switched on" names a SQL file that exists; no # headings; apostrophes are ’, as the app's
//     labels are (not ', except in code and addresses).
//  5. Search: the ranking rules on made-up articles (title > keywords > headings > summary > body, every
//     word, prefixes, plurals, small words and question words, ' and ’ alike, the exact title first),
//     highlighting, and every real article first for its own title.
//  6. Help for this page: an app path → the articles about it, a [id] placeholder for a record's page (on a
//     dynamic route, and never offered on another page beside it); only /admin pages are accepted.
//  7. Metis's search_help: at most three articles, each with its link and trimmed passages; questions
//     ("what does On hold mean") find the article about what they ask.
//  8. Rendering: callouts, tables, figures with captions, heading ids and "On this page"; comments hidden.
// It passes whatever content is there, as long as the content follows the rules.
// Usage: node --experimental-strip-types scripts/test-help.mjs
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = new URL('../src/', import.meta.url).href;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'server-only') return { url: 'data:text/javascript,export {}', shortCircuit: true };
    const spec = specifier.startsWith('@/') ? SRC + specifier.slice(2) : specifier;
    try {
      return next(spec, context);
    } catch (e) {
      if (!/^(?:\.\.?\/|file:)/.test(spec) || /\.\w+$/.test(spec)) throw e;
      return next(`${spec}.ts`, context);
    }
  },
});

const { Lexer } = await import('marked');
const { assemble, parseArticle, parseSection, accessLabel, splitFrontmatter } = await import('../src/lib/help/parse.ts');
const { loadHelp } = await import('../src/lib/help/load.ts');
const { allArticles, bestHits, buildHelpIndex, findArticle, findSection, passagesFor, searchLibrary } = await import('../src/lib/help/library.ts');
const { highlightParts, normalise, prepareIndex, queryTerms, searchPrepared, wordsOf } = await import('../src/lib/help/search.ts');
const { articlesForPath, cleanFrom, hasPlaceholder, helpHref, isPlaceholder, metisHref } = await import('../src/lib/help/context.ts');
const { calloutLabel, CALLOUTS, renderHelp } = await import('../src/lib/help/render.ts');
const { plainText } = await import('../src/lib/help/text.ts');

let failed = 0;
let passed = 0;
function ok(name, cond, detail = '') {
  if (cond) passed++;
  else failed++;
  if (!cond) console.log(`FAIL ${name}${detail ? `\n     ${String(detail).slice(0, 600)}` : ''}`);
}
function eq(name, got, want) {
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`);
}

// ── The shell's icon names (AdminShell.tsx `icons`), for _section.md's `icon`. ────────────────────
const shell = readFileSync(path.join(ROOT, 'src/components/admin/AdminShell.tsx'), 'utf8');
const iconsBlock = shell.slice(shell.indexOf('export const icons = {'), shell.indexOf('export type IconName'));
const ICONS = [...iconsBlock.matchAll(/^ {2}([a-z][\w]*): \(/gm)].map((m) => m[1]);
ok('the shell has icons, including help', ICONS.length > 10 && ICONS.includes('help') && ICONS.includes('home'), ICONS.join(','));

// ── The app's pages and API routes, for links. ────────────────────────────────────────────────────
const routes = [];
(function walk(dir, segs) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name.startsWith('_') || name.startsWith('@')) continue;
      // Old CMS page-editor links (/admin/<slug>) only redirect; they're not pages to link to.
      if (segs.join('/') === 'admin' && name === '[pageSlug]') continue;
      walk(p, /^\(.*\)$/.test(name) ? segs : [...segs, name]);
    } else if (/^(page|route)\.(tsx?|jsx?)$/.test(name)) routes.push({ segs, kind: name.startsWith('page') ? 'page' : 'route' });
  }
})(path.join(ROOT, 'src/app'), []);
function routeFor(pathname) {
  const parts = pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  // Under the same top folder (admin, api): the public site's catch-all page isn't an app page.
  const matches = routes.filter(({ segs }) => {
    if (segs[0] !== parts[0]) return false;
    let i = 0;
    for (let j = 0; j < segs.length; j++) {
      const s = segs[j];
      if (/^\[\[\.\.\..+\]\]$/.test(s)) return true;
      if (/^\[\.\.\..+\]$/.test(s)) return i < parts.length;
      if (i >= parts.length) return false;
      if (!/^\[.+\]$/.test(s) && s !== parts[i]) return false;
      i++;
    }
    return i === parts.length;
  });
  // The most specific: a route before a page (an /api path), fewer dynamic segments first.
  const dyn = (r) => r.segs.filter((x) => x.startsWith('[')).length;
  return matches.sort((x, y) => dyn(x) - dyn(y))[0];
}
ok('routes: /admin/crm/reports is a page', routeFor('/admin/crm/reports')?.kind === 'page');
ok('routes: a customer record /admin/crm/<id> is a page', routeFor('/admin/crm/b1000000-0000-4000-8000-000000000001')?.kind === 'page');
ok('routes: /admin/help is a page', routeFor('/admin/help')?.kind === 'page');
ok('routes: /api/sso/rams is a route', routeFor('/api/sso/rams')?.kind === 'route');
ok('routes: /admin/nowhere is not (the legacy redirect does not count)', !routeFor('/admin/nowhere'));
ok('routes: a customer page placeholder /admin/crm/[id] is the record page', routeFor('/admin/crm/[id]')?.segs.join('/') === 'admin/crm/[id]');
/** A path with its placeholders filled in, as the address of one record would be. */
const SAMPLE_ID = 'b1000000-0000-4000-8000-000000000001';
const sample = (p) => p.replace(/\[[^\]/]+\]/g, SAMPLE_ID);

// ── 1–4. The real content. ────────────────────────────────────────────────────────────────────────
const CONTENT = path.join(ROOT, 'src/content/help');
const lib = loadHelp(CONTENT, ICONS);
for (const p of lib.problems) ok(`content: ${p}`, false);
ok('content: there is at least one section with an article', lib.sections.some((s) => s.articles.length > 0));
ok('content: Getting started › Find your way around Help is there', !!findArticle(lib, 'getting-started', 'using-help'));
const articles = allArticles(lib);
const sqlFiles = new Set(readdirSync(path.join(ROOT, 'supabase')));

/** `<!-- shot: <section>/<file>.jpg | Caption | alt -->`, a picture still to be taken. */
const SHOT = /^<!-- shot: [a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*\.jpg \| [^|]*\S \| [^|]*\S -->$/;

function walkTokens(tokens, fn) {
  for (const t of tokens ?? []) {
    fn(t);
    if (t.type === 'list') for (const item of t.items) walkTokens(item.tokens, fn);
    if (t.type === 'table') for (const cell of [...t.header, ...t.rows.flat()]) walkTokens(cell.tokens, fn);
    if (Array.isArray(t.tokens)) walkTokens(t.tokens, fn);
  }
}

function checkLink(where, href) {
  const raw = href.replace(/&amp;/g, '&');
  if (/^https?:\/\//i.test(raw) || /^mailto:|^tel:/i.test(raw) || raw.startsWith('#')) return;
  const pathname = raw.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  if (pathname === '/admin/help' || pathname.startsWith('/admin/help/')) {
    const [, , , key, slug, extra] = pathname.split('/');
    const good = !key ? true : slug ? !extra && !!findArticle(lib, key, slug) : !!findSection(lib, key);
    ok(`${where}: Help link ${raw} goes to a real ${slug ? 'article' : 'section'}`, good);
    return;
  }
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/')) {
    ok(`${where}: link ${raw} goes to a page of the app`, !!routeFor(pathname));
    return;
  }
  ok(`${where}: link ${raw} is an app page (/admin/…), a Help article or a full https:// address`, false);
}

/** The words a reader sees: no code, no addresses, no comments' file names. */
const prose = (md) =>
  md
    .replace(/^```[\s\S]*?^```/gm, '')
    .replace(/`[^`]*`/g, '')
    .replace(/\]\([^)]*\)/g, ']')
    .replace(/<!-- shot: \S+/g, '');
const straight = (where, texts) => {
  const lines = texts.flatMap((t) => (t ?? '').split('\n')).filter((l) => l.includes("'"));
  ok(`${where}: apostrophes are ’ as on the app's screens, not '`, !lines.length, lines.slice(0, 3).join(' / '));
};
for (const s of lib.sections) {
  if (s.intro) for (const m of renderHelp(s.intro).html.matchAll(/href="([^"]*)"/g)) checkLink(`${s.key}/_section.md`, m[1]);
  straight(`${s.key}/_section.md`, [s.title, s.summary, prose(s.intro)]);
}
for (const a of articles) {
  const where = `${a.section}/${a.slug}.md`;
  const tokens = Lexer.lex(a.body, { gfm: true });
  if (a.path) {
    const pathname = a.path.split(/[?#]/)[0];
    const r = routeFor(pathname);
    ok(`${where}: path ${a.path} is a page of the app`, !!r && r.kind === 'page');
    const parts = pathname.split('/').filter(Boolean);
    if (r && parts.some(isPlaceholder)) {
      ok(`${where}: each placeholder in ${a.path} stands for a record (a [..] folder of the app)`, parts.every((p, i) => !isPlaceholder(p) || /^\[.+\]$/.test(r.segs[i])), r.segs.join('/'));
      // The other pages beside the record's (/admin/crm/reports beside /admin/crm/[id]) must not be offered it.
      for (const other of routes) {
        if (other.kind !== 'page' || other.segs.length < parts.length) continue;
        const beside = parts.every((p, i) => (isPlaceholder(p) ? true : other.segs[i] === p)) && parts.some((p, i) => isPlaceholder(p) && !/^\[.+\]$/.test(other.segs[i]));
        if (!beside) continue;
        const there = sample(`/${other.segs.join('/')}`);
        ok(`${where}: Help for ${there} is not this article (give that page an article with its own path)`, !articlesForPath(articles, there).includes(a));
      }
    }
  }
  if (a.where) ok(`${where}: where uses › between menu levels`, !/\s>\s|->|»/.test(a.where), a.where);
  straight(where, [a.title, a.summary, a.keywords.join(', '), a.where, prose(a.body)]);
  ok(`${where}: no shot: placeholders left`, !/\]\(\s*shot:/i.test(a.body), (a.body.match(/!\[[^\]]*\]\(\s*shot:[^)]*\)/gi) ?? []).join(' '));
  // A picture still to be taken: a comment on its own line, nothing else (the renderer shows no comments).
  for (const line of a.body.split('\n').filter((l) => l.includes('<!--') || /\bshot:/.test(l))) {
    ok(`${where}: a comment is a picture to take, alone on its line: <!-- shot: <section>/<file>.jpg | Caption | alt -->`, SHOT.test(line), line);
  }
  const pictures = new Set();
  walkTokens(tokens, (t) => {
    if (t.type === 'heading' && t.depth === 1) ok(`${where}: no # headings (the page has the title): "${t.text}"`, false);
    if (t.type === 'blockquote') {
      const label = calloutLabel(t);
      ok(
        `${where}: a blockquote is a callout starting with one of ${Object.keys(CALLOUTS).map((k) => `**${k}:**`).join(', ')}`,
        !!label && label in CALLOUTS,
        label ? `it starts with **${label}:**` : t.raw.slice(0, 120),
      );
      if (label === 'Once switched on') {
        const files = [...t.raw.matchAll(/([\w-]+\.sql)\b/g)].map((m) => m[1]);
        ok(`${where}: a "Once switched on" callout names the SQL file to run`, files.length > 0, t.raw.slice(0, 160));
        for (const f of files) ok(`${where}: ${f} is in supabase/`, sqlFiles.has(f));
      }
    }
    if (t.type === 'image' && !/^shot:/i.test(t.href)) {
      const src = t.href.split(/[?#]/)[0];
      pictures.add(src);
      ok(`${where}: picture ${src} is under /help/`, src.startsWith('/help/'));
      ok(`${where}: picture ${src} exists in public/`, src.startsWith('/') && existsSync(path.join(ROOT, 'public', decodeURIComponent(src))));
      ok(`${where}: picture ${src} has a caption (its title)`, !!t.title);
    }
  });
  const { html } = renderHelp(a.body);
  ok(`${where}: nothing of a picture still to take shows`, !/<!--|shot:/.test(html), html.match(/.{0,60}(?:<!--|shot:).{0,60}/s)?.[0]);
  for (const m of html.matchAll(/href="([^"]*)"/g)) checkLink(where, m[1]);
  // Pictures written as HTML (the Markdown ones are checked above).
  for (const m of html.matchAll(/<img[^>]*\ssrc="([^"]*)"/g)) {
    const src = m[1].replace(/&amp;/g, '&').split(/[?#]/)[0];
    if (pictures.has(src)) continue;
    ok(`${where}: picture ${src} exists in public/help/`, src.startsWith('/help/') && existsSync(path.join(ROOT, 'public', decodeURIComponent(src))));
  }
}

// ── 1. Parsing, on made-up files. ─────────────────────────────────────────────────────────────────
const art = (fm, body = 'Some words.\n') => `---\n${fm}\n---\n${body}`;
const GOOD = 'title: Add a thing\nsummary: How to add one.\norder: 10\nkeywords: new, create\nwhere: CRM › Things\npath: /admin/crm\naccess: crm';
eq('parse: a good article has no problems', parseArticle('crm', 'add', art(GOOD)).problems, []);
eq('parse: its fields', (({ title, summary, order, keywords, where, path: p, access, url }) => ({ title, summary, order, keywords, where, p, access, url }))(parseArticle('crm', 'add', art(GOOD)).article), {
  title: 'Add a thing',
  summary: 'How to add one.',
  order: 10,
  keywords: ['new', 'create'],
  where: 'CRM › Things',
  p: '/admin/crm',
  access: ['crm'],
  url: '/admin/help/crm/add',
});
eq('parse: quotes are taken off', splitFrontmatter('---\ntitle: "Quoted: yes"\n---\nx').data.title, 'Quoted: yes');
eq('parse: Windows line ends', parseArticle('crm', 'add', art(GOOD).replace(/\n/g, '\r\n')).problems, []);
const probs = (fm, body) => parseArticle('crm', 'x', art(fm, body)).problems.join(' | ');
ok('parse: no title', /"title" is missing/.test(probs(GOOD.replace('title: Add a thing\n', ''))));
ok('parse: no access', /"access" is missing/.test(probs(GOOD.replace('\naccess: crm', ''))));
ok('parse: an unknown permission', /"access: sales"/.test(probs(GOOD.replace('access: crm', 'access: sales'))));
ok('parse: order not a number', /whole number/.test(probs(GOOD.replace('order: 10', 'order: ten'))));
ok('parse: an unknown key', /unknown frontmatter key "author"/.test(probs(`${GOOD}\nauthor: me`)));
ok('parse: a key twice', /given twice/.test(probs(`${GOOD}\ntitle: Again`)));
ok('parse: a path that is not an app page', /must be an app page/.test(probs(GOOD.replace('path: /admin/crm', 'path: https://example.com'))));
eq('parse: a placeholder for a record', [probs(GOOD.replace('path: /admin/crm', 'path: /admin/crm/[id]')), parseArticle('crm', 'x', art(GOOD.replace('path: /admin/crm', 'path: /admin/crm/[id]'))).article.path], ['', '/admin/crm/[id]']);
ok('parse: a placeholder is a whole part', /whole part in square brackets/.test(probs(GOOD.replace('path: /admin/crm', 'path: /admin/crm/x[id]'))));
ok('parse: … not half of one', /whole part in square brackets/.test(probs(GOOD.replace('path: /admin/crm', 'path: /admin/crm/[id'))));
ok('parse: … and not straight after /admin', /must be a page's name/.test(probs(GOOD.replace('path: /admin/crm', 'path: /admin/[id]'))));
eq('placeholders: which paths have one', [hasPlaceholder('/admin/crm/[id]'), hasPlaceholder('/admin/projects/[id]?tab=site'), hasPlaceholder('/admin/crm'), hasPlaceholder('/admin/crm/reports')], [true, true, false, false]);
ok('parse: no body', /no body/.test(probs(GOOD, '\n')));
ok('parse: no frontmatter', /no frontmatter/.test(parseArticle('crm', 'x', 'Just words').problems.join()));
ok('parse: frontmatter not closed', /not closed/.test(parseArticle('crm', 'x', '---\ntitle: x\nWords').problems.join()));
eq('parse: several permissions', parseArticle('crm', 'x', art(GOOD.replace('access: crm', 'access: enquiries, crm'))).article.access, ['enquiries', 'crm']);
eq('access chip: one', accessLabel(['crm']), 'Needs CRM access');
eq('access chip: two', accessLabel(['enquiries', 'crm']), 'Needs Enquiries or CRM access');
eq('access chip: admins', accessLabel(['admin']), 'Admins only');
eq('access chip: everyone', accessLabel(['everyone']), 'Open to everyone');
const sec = parseSection('whatsapp', '---\ntitle: WhatsApp\nsummary: Chats.\norder: 50\nicon: whatsapp\n---\nIntro words.\n', ICONS);
eq('section: parses', [sec.problems, sec.section.title, sec.section.order, sec.section.icon, sec.section.intro], [[], 'WhatsApp', 50, 'whatsapp', 'Intro words.']);
ok('section: an icon the shell does not have', /not one of the shell's icons/.test(parseSection('x', '---\ntitle: X\nsummary: Y\norder: 1\nicon: rocket\n---\n', ICONS).problems.join()));
ok('section: no _section.md', /missing/.test(parseSection('x', null, ICONS).problems.join()));

// The loader: names, a missing _section.md, orders used twice, files that aren't articles.
{
  let dir = null;
  try {
    dir = mkdtempSync(path.join(tmpdir(), 'help-test-'));
    const put = (p, s) => {
      mkdirSync(path.dirname(path.join(dir, p)), { recursive: true });
      writeFileSync(path.join(dir, p), s);
    };
    put('crm/_section.md', '---\ntitle: CRM\nsummary: S\norder: 20\nicon: crm\n---\n');
    put('crm/b.md', art(GOOD.replace('order: 10', 'order: 20').replace('Add a thing', 'B')));
    put('crm/a.md', art(GOOD.replace('Add a thing', 'A')));
    put('crm/c.md', art(GOOD.replace('Add a thing', 'C')));
    put('crm/Bad Name.md', art(GOOD));
    put('crm/notes.txt', 'x');
    put('Upper/_section.md', '---\ntitle: U\nsummary: S\norder: 1\nicon: crm\n---\n');
    put('loose/x.md', art(GOOD));
    const l = loadHelp(dir, ICONS);
    eq('loader: sections in order, articles in order', l.sections.map((s) => `${s.key}:${s.articles.map((a) => a.slug).join(',')}`), ['crm:a,c,b', 'loose:x']);
    const all = l.problems.join(' | ');
    ok('loader: a file name with capitals or spaces', /Bad Name\.md: not an article/.test(all), all);
    ok('loader: a file that is not .md', /notes\.txt: not an article/.test(all), all);
    ok('loader: a folder name with capitals', /Upper\/: a section folder/.test(all), all);
    ok('loader: no _section.md', /loose\/_section\.md: _section\.md is missing/.test(all), all);
    ok('loader: an order used twice', /crm\/c\.md: "order: 10" is also used by a\.md/.test(all), all);
    eq('loader: no content folder is no sections', loadHelp(path.join(dir, 'nope')).sections, []);
  } catch (e) {
    ok(`loader fixtures (${e.message})`, false);
  } finally {
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
}

// ── 5. Search. ────────────────────────────────────────────────────────────────────────────────────
function fixture(defs) {
  const sections = [];
  const problems = [];
  for (const [key, list] of Object.entries(defs)) {
    const s = { ...parseSection(key, `---\ntitle: ${key.toUpperCase()}\nsummary: ${key}\norder: ${sections.length + 1}\nicon: help\n---\n`).section, articles: [] };
    list.forEach((d, i) => {
      const fm = [`title: ${d.title}`, `summary: ${d.summary ?? 'A summary.'}`, `order: ${(i + 1) * 10}`, `keywords: ${d.keywords ?? ''}`, `access: everyone`, d.path ? `path: ${d.path}` : ''].filter(Boolean).join('\n');
      s.articles.push(parseArticle(key, d.slug, art(fm, d.body ?? 'Words.\n')).article);
    });
    sections.push(s);
  }
  return assemble(sections, problems);
}
const F = fixture({
  whatsapp: [
    { slug: 'templates', title: 'Add a WhatsApp template', keywords: 'approval, Meta, outside 24 hours', summary: 'Write a template and send it to Meta.', body: '## Submit for approval\nPress **Submit**. Meta checks it.\n\n## Use it\nPick it in a chat.\n' },
    { slug: 'inbox', title: 'The WhatsApp inbox', keywords: 'chats, messages', summary: 'Read and answer customers on WhatsApp.', body: '## Templates in a chat\nWhen the window has shut, send a template.\n' },
  ],
  crm: [
    { slug: 'reports', title: 'CRM reports', keywords: 'ads, spend, sources', summary: 'Sales, sources and what the ads cost.', body: 'Meta lead ads show here.\n' },
    { slug: 'add-customer', title: 'Add a customer', keywords: 'new contact, opportunity', summary: 'Put someone new into the pipeline.', body: '## Their details\nName, phone and postcode.\n' },
  ],
  zoo: [
    { slug: 'in-body', title: 'Fifth', summary: 'Nothing here.', body: 'A zebra in the body.\n' },
    { slug: 'in-summary', title: 'Fourth', summary: 'A zebra in the summary.' },
    { slug: 'in-heading', title: 'Third', body: '## Zebra crossing\nWords.\n' },
    { slug: 'in-keywords', title: 'Second', keywords: 'zebra' },
    { slug: 'in-title', title: 'First zebra' },
  ],
});
const FP = prepareIndex(buildHelpIndex(F));
const top = (q, mode = 'all', n = 10) => searchPrepared(FP, q, { mode, limit: n }).map((h) => h.entry.url.split('/').slice(-1)[0]);
eq('search: title, then keywords, headings, summary, body', top('zebra'), ['in-title', 'in-keywords', 'in-heading', 'in-summary', 'in-body']);
eq('search: the start of a word is enough', top('temp')[0], 'templates');
eq('search: a plural finds the singular', top('templates')[0], 'templates');
eq('search: a match in the title beats one in a heading', top('template'), ['templates', 'inbox']);
eq('search: "approved" finds approval', top('approved')[0], 'templates');
eq('search: every word must match', top('whatsapp reports'), []);
eq('search: … or any, most words first, when asked', top('whatsapp reports', 'any').slice(0, 3).sort(), ['inbox', 'reports', 'templates']);
eq('search: small words are left out', top('how do I add a customer'), ['add-customer']);
eq('search: so are the words a question is wrapped in', [queryTerms('what does On hold mean'), queryTerms('how does the chaser work'), queryTerms('where do I find purchase orders')], [['hold'], ['chaser'], ['purchase', 'orders']]);
eq('search: … unless that is all there is ("my work")', [queryTerms('my work'), queryTerms('find')], [['work'], ['find']]);
eq('search: small words alone still search', queryTerms('how to'), ['how', 'to']);
eq('search: capitals and accents do not matter', top('WHATSÁPP inbox'), ['inbox']);
eq("search: ' and ’ (and ‘) are the same", [normalise("Don't"), normalise('Don’t'), normalise('‘Find’'), wordsOf("customer’s page")], ['dont', 'dont', 'find', ['customers', 'page']]);
{
  const A = fixture({ x: [{ slug: 'curly', title: 'Customer’s page', body: 'Press **Don’t copy any**.\n' }, { slug: 'straight', title: "Who's in", body: "It hasn't arrived.\n" }] });
  const AP = prepareIndex(buildHelpIndex(A));
  const find = (q) => searchPrepared(AP, q, { limit: 2 }).map((h) => h.entry.url.split('/').pop());
  eq("search: a straight ' finds a curly ’ and back", [find("customer's"), find("don't copy"), find('who’s'), find('hasn’t')], [['curly'], ['curly'], ['straight'], ['straight']]);
  eq('highlight: an apostrophe in the word', highlightParts('Don’t copy any', "don't").filter((p) => p.hit).map((p) => p.text), ['Don’t']);
}
eq('search: nothing typed, nothing found', top('   '), []);
eq('search: the heading that matched is shown', searchPrepared(FP, 'templates chat', { limit: 5 }).find((h) => h.entry.url.endsWith('/inbox'))?.heading, 'Templates in a chat');
eq('highlight: the part typed', highlightParts('Add a WhatsApp template', 'temp'), [
  { text: 'Add a WhatsApp ', hit: false },
  { text: 'temp', hit: true },
  { text: 'late', hit: false },
]);
eq('highlight: several words', highlightParts('Read and answer customers on WhatsApp.', 'whatsapp customer').filter((p) => p.hit).map((p) => p.text), ['customer', 'WhatsApp']);
eq('highlight: nothing to mark', highlightParts('Plain', ''), [{ text: 'Plain', hit: false }]);
// The exact title comes first, even when small words are all that tell it from the others.
{
  const T = fixture({
    whatsapp: [
      { slug: 'inbox-or-chats', title: 'WhatsApp inbox or WhatsApp chats? Who sees which', keywords: 'inbox, chats' },
      { slug: 'inbox', title: 'The WhatsApp inbox', keywords: 'messages' },
    ],
    metis: [{ slug: 'what-metis-did', title: 'See what Metis did', body: 'Who sees what she changed.\n' }],
    team: [
      { slug: 'subcontractors-page', title: 'The Subcontractors page', keywords: 'subcontractor, firms' },
      { slug: 'subcontractor-page', title: 'A subcontractor’s page' },
      { slug: 'who-sees-what', title: 'Who sees what' },
    ],
    surveys: [{ slug: 'booking', title: 'Book a survey with Find a time' }],
  });
  const TP = prepareIndex(buildHelpIndex(T));
  const first = (q) => searchPrepared(TP, q, { limit: 5 })[0]?.entry.url.split('/').slice(-1)[0];
  eq('search: the exact title first', ['The WhatsApp inbox', 'A subcontractor’s page', "A subcontractor's page", 'Who sees what', 'who sees what'].map(first), ['inbox', 'subcontractor-page', 'subcontractor-page', 'who-sees-what', 'who-sees-what']);
  eq('search: the words in the order typed, in a title', [first('find a time'), first('who sees wha')], ['booking', 'who-sees-what']);
}
// The real content: every article is first for its own title (or shares that title with the one that is).
const RP = prepareIndex(buildHelpIndex(lib));
for (const a of articles) {
  const hits = searchPrepared(RP, a.title, { limit: 3 });
  const same = (t) => queryTerms(t).join(' ') === queryTerms(a.title).join(' ') && t.toLowerCase() === a.title.toLowerCase();
  ok(`search: "${a.title}" finds ${a.section}/${a.slug} first`, hits[0]?.entry.url === a.url || (hits.some((h) => h.entry.url === a.url) && same(hits[0].entry.title)), hits.map((h) => h.entry.url).join(', '));
}
ok('search: "search help" finds Find your way around Help first', searchPrepared(RP, 'search help', { limit: 3 })[0]?.entry.url === '/admin/help/getting-started/using-help');
const index = buildHelpIndex(lib);
ok('index: compact (body words, not sentences)', index.every((e) => !/[.,]/.test(e.words) && e.words.split(' ').length === new Set(e.words.split(' ')).size));

// ── 6. Help for this page. ────────────────────────────────────────────────────────────────────────
const P = [
  { id: 'dash', path: '/admin' },
  { id: 'crm', path: '/admin/crm' },
  { id: 'reports', path: '/admin/crm/reports' },
  { id: 'projects', path: '/admin/projects' },
  { id: 'board', path: '/admin/projects?view=board' },
  { id: 'none', path: null },
];
const at = (from) => articlesForPath(P, from).map((a) => a.id);
eq('this page: the page itself', at('/admin/crm/reports'), ['reports']);
eq('this page: a record under a page', at('/admin/crm/b1000000-0000-4000-8000-000000000001'), ['crm']);
eq('this page: the query does not matter to a plain path', at('/admin/crm/reports?range=90'), ['reports']);
eq('this page: an article for a view comes first on that view', at('/admin/projects?view=board'), ['board', 'projects']);
eq('this page: … and not on another view', at('/admin/projects?view=schedule'), ['projects']);
eq('this page: the dashboard only on the dashboard', [at('/admin'), at('/admin/tasks')], [['dash'], []]);
eq('this page: a trailing slash', at('/admin/crm/'), ['crm']);
eq('this page: not an app page', [at('https://evil.example/admin/crm'), at('//evil.example/admin'), at('/adminx'), at('')], [[], [], [], []]);
eq('from: cleaned', [cleanFrom('/admin/crm#notes'), cleanFrom('/admin/crm?x=1'), cleanFrom('/admin\\..'), cleanFrom(42), cleanFrom('/admin/crm\nx')], ['/admin/crm', '/admin/crm?x=1', null, null, null]);
{
  const Q = [...P, { id: 'customer', path: '/admin/crm/[id]' }, { id: 'job', path: '/admin/projects/[id]' }, { id: 'job-site', path: '/admin/projects/[id]?tab=site' }, { id: 'chats', path: '/admin/crm/chats' }];
  const atQ = (from) => articlesForPath(Q, from).map((a) => a.id);
  eq('this page: a customer’s page (a [id] placeholder)', atQ(`/admin/crm/${SAMPLE_ID}`), ['customer']);
  eq('this page: … and below it', atQ(`/admin/crm/${SAMPLE_ID}/anything`), ['customer']);
  eq('this page: a page of its own beside it keeps its articles', [atQ('/admin/crm/reports'), atQ('/admin/crm/chats'), atQ(`/admin/crm/chats/${SAMPLE_ID}`)], [['reports'], ['chats'], ['chats']]);
  eq('this page: the list itself is not a record', atQ('/admin/crm'), ['crm']);
  eq('this page: a job’s page, a tab of it first', [atQ(`/admin/projects/${SAMPLE_ID}`), atQ(`/admin/projects/${SAMPLE_ID}?tab=site`)], [['job'], ['job-site', 'job']]);
}
eq('help link: carries the page', helpHref('/admin/crm/1?tab=notes'), '/admin/help?from=%2Fadmin%2Fcrm%2F1%3Ftab%3Dnotes');
eq('help link: from Help itself, Help home', [helpHref('/admin/help'), helpHref('/admin/help/crm/add'), helpHref('/admin/help?q=x')], ['/admin/help', '/admin/help', '/admin/help']);
eq('Ask Metis link: the question in the box', [metisHref('add a template'), metisHref('  ')], ['/admin/assistant?q=add%20a%20template', '/admin/assistant']);
for (const a of articles.filter((x) => x.path)) {
  ok(`this page: ${a.path} offers ${a.section}/${a.slug}`, articlesForPath(articles, sample(a.path)).includes(a));
}

// ── 7. Metis's search_help. ───────────────────────────────────────────────────────────────────────
{
  const r = searchLibrary(F, FP, 'how do I get a whatsapp template approved');
  ok('metis: at most three articles', r.results.length > 0 && r.results.length <= 3, JSON.stringify(r).slice(0, 300));
  eq('metis: the best one first, with its link', [r.matched, r.results[0]?.url, r.results[0]?.title], ['all', '/admin/help/whatsapp/templates', 'Add a WhatsApp template']);
  ok('metis: passages from the article', r.results[0]?.passages.some((p) => /Submit/.test(p)), JSON.stringify(r.results[0]?.passages));
  const some = searchLibrary(F, FP, 'whatsapp quarterly reports');
  eq('metis: none with every word → the ones with most, marked', some.matched, 'some');
  eq('metis: nothing at all', searchLibrary(F, FP, 'xylophone').matched, 'none');
  // A question about a label: the article named for it, not ones that happen to say "mean" too.
  const H = fixture({
    projects: [
      { slug: 'projects-list', title: 'The Projects list', body: 'Filter to the jobs on hold. What the colours mean.\n' },
      { slug: 'labour-pos', title: 'Labour POs', body: 'A PO can be on hold. What each status means.\n' },
    ],
    customers: [{ slug: 'lost-and-on-hold', title: 'Lost, on hold and reopening', body: 'Put a customer on hold when they pause.\n' }],
  });
  const HP = prepareIndex(buildHelpIndex(H));
  eq('metis: "what does On hold mean" → the On hold article first', searchLibrary(H, HP, 'what does On hold mean').results[0]?.url, '/admin/help/customers/lost-and-on-hold');
  const weak = bestHits(HP, 'hold colours');
  eq('metis: when every word is only in the text, a title with some of them is weighed too', [weak.hits.map((h) => h.entry.url.split('/').pop()), weak.matched], [['lost-and-on-hold', 'projects-list'], 'some']);
  eq('metis: … but every word in a title stays first', bestHits(HP, 'projects list').hits[0]?.entry.url.split('/').pop(), 'projects-list');
  const long = { ...F.sections[0].articles[0], body: Array.from({ length: 8 }, (_, i) => `## Part ${i}\n${'word '.repeat(150)}${i === 5 ? 'gasket' : ''}\n`).join('\n') };
  const ps = passagesFor(long, 'gasket');
  ok('metis: a long article gives the part that matches', ps.length >= 1 && ps.some((p) => /Part 5/.test(p)), ps.map((p) => p.slice(0, 40)).join(' / '));
  ok('metis: passages are trimmed', ps.every((p) => p.split(/\s+/).length <= 240), ps.map((p) => p.split(/\s+/).length).join(','));
  const links = passagesFor({ ...long, body: 'See [the inbox](/admin/help/whatsapp/inbox).\n' }, 'inbox');
  ok('metis: links to other articles are kept in the passage', /\/admin\/help\/whatsapp\/inbox/.test(links.join()), links.join());
  for (const a of articles) {
    const res = searchLibrary(lib, RP, a.title).results;
    ok(`metis: "${a.title}" → a Help link`, res.length > 0 && res.every((x) => x.url.startsWith('/admin/help/') && x.passages.length > 0));
  }
  // The questions the tool's description and Metis's instructions give as examples, when their articles are here.
  for (const [question, url] of [
    ['what does On hold mean', '/admin/help/customers/lost-and-on-hold'],
    ['how do I add a customer', '/admin/help/customers/add-a-customer'],
    ['add a WhatsApp template', '/admin/help/whatsapp/add-a-template'],
  ]) {
    if (!articles.some((a) => a.url === url)) continue;
    const res = searchLibrary(lib, RP, question).results;
    eq(`metis: "${question}" → ${url} first`, res[0]?.url, url);
  }
}

// ── 8. Rendering. ─────────────────────────────────────────────────────────────────────────────────
{
  const md = [
    '# Not a title',
    'Intro with [a page](/admin/crm) and [a site](https://example.com).',
    '## Steps',
    '1. Open it.\n2. Press **Save**.',
    '> **Good to know:** A tip.',
    '> **Watch out**: careful.',
    '> **Admins only:** Admins.\n>\n> Second paragraph.',
    '> **Once switched on:** Run purchase-orders.sql on Setup.',
    '> Just a quote.',
    '## Steps',
    '| Status | Means |\n|---|---|\n| New | Not seen |',
    '![The inbox](/help/whatsapp/inbox.jpg "The WhatsApp inbox")',
    '![Later](shot:whatsapp/x.jpg "Placeholder")',
    '<!-- shot: whatsapp/later.jpg | To take | A chat -->',
    'Words <!-- an aside --> go on.',
    '### Below',
  ].join('\n\n');
  const { html, toc } = renderHelp(md);
  for (const k of ['good', 'watch', 'admin', 'switch']) ok(`render: a ${k} callout`, html.includes(`hp-callout hp-callout--${k}`));
  ok('render: the callout label is taken out of the text', /<span>Good to know<\/span><\/p><div class="hp-callout__body"><p>A tip\.<\/p>/.test(html), html.match(/hp-callout--good.{0,300}/s)?.[0]);
  ok('render: the colon after the bold is taken out too', /<div class="hp-callout__body"><p>careful\.<\/p>/.test(html));
  ok('render: a callout keeps its later paragraphs', /Admins\.<\/p>\s*<p>Second paragraph\.<\/p>/.test(html));
  ok('render: a plain blockquote stays a blockquote', /<blockquote>\s*<p>Just a quote\.<\/p>/.test(html));
  ok('render: tables scroll in their own box', /<div class="hp-table"[^>]*><table>/.test(html));
  ok('render: a picture on its own is a figure with its caption', html.includes('<figure class="hp-fig"><div class="hp-fig__frame"><img src="/help/whatsapp/inbox.jpg" alt="The inbox"') && html.includes('<figcaption>The WhatsApp inbox</figcaption>'));
  ok('render: no figure inside a paragraph', !/<p>\s*<figure/.test(html));
  ok('render: a shot: placeholder shows nothing', !html.includes('shot:') && !html.includes('Placeholder'));
  ok('render: comments show nothing (a picture still to take, or any other)', !html.includes('<!--') && !html.includes('To take') && !html.includes('an aside') && /<p>Words\s+go on\.<\/p>/.test(html), html.match(/.{0,80}Words.{0,80}/s)?.[0]);
  ok('text: comments are not words to search', !/To take|an aside|later\.jpg/.test(plainText(md)) && /Words\s+go on/.test(plainText(md)));
  ok('test: the shot comment form', SHOT.test('<!-- shot: whatsapp/later.jpg | To take | A chat -->') && !SHOT.test('<!-- shot: whatsapp/later.jpg | To take -->') && !SHOT.test('x <!-- shot: a/b.jpg | C | d -->'));
  ok('render: # becomes ## (the page has the title)', /<h2 id="not-a-title">Not a title<\/h2>/.test(html) && !/<h1/.test(html));
  eq('render: On this page (ids made unique)', toc.map((t) => `${t.depth}:${t.id}`), ['2:not-a-title', '2:steps', '2:steps-2', '3:below']);
  ok('render: links to other sites open in a new tab', /href="https:\/\/example\.com" target="_blank" rel="noopener noreferrer"/.test(html));
  ok('render: links in the app do not', /<a href="\/admin\/crm">a page<\/a>/.test(html));
  const bad = Lexer.lex('> **Note:** something', { gfm: true })[0];
  eq('callouts: another label is found (and the test above fails on it)', [calloutLabel(bad), 'Note' in CALLOUTS], ['Note', false]);
}

console.log(`\n${passed} passed, ${failed} failed (${lib.sections.length} sections, ${articles.length} articles)`);
process.exit(failed ? 1 : 0);
