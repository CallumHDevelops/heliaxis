// What Publish puts live on the website (src/app/api/cms/publish/route.ts, src/app/api/cms/route.ts,
// src/lib/blog/cms-publish-rules.ts, doPublish in src/app/admin/cms-engine.ts): only the page or article
// being published goes live. Draft pages and Draft, Scheduled and Unpublished articles stay off the
// website; articles keep the status the server has (Schedule, Unschedule, Unpublish and the scheduled-publish
// job set it), so an editor tab opened before one of those can't undo it by saving or publishing; and
// only live articles are in the published copy and the rendered pages.
// Usage: node --experimental-strip-types scripts/test-cms-publish.mjs
import { readFileSync } from 'node:fs';
import * as kit from './site-test-kit.mjs';

const db = kit.setup({
  'next/server': `${kit.STUBS['next/server']}\nexport class NextRequest extends Request {}`,
});
const { eq } = kit;
const R = await import('../src/lib/blog/cms-publish-rules.ts');
const publishRoute = await import('../src/app/api/cms/publish/route.ts');
const saveRoute = await import('../src/app/api/cms/route.ts');

const DRAFT = 'heliaxis-cms-v1';
const PUBLISHED = 'heliaxis-cms-published';
const RENDERED = 'heliaxis-cms-rendered';
const kv = (key) => {
  const row = db.rows('cms_kv').find((r) => r.key === key);
  return row ? JSON.parse(row.value) : null;
};
const setKv = (key, value) => {
  db.t.cms_kv = db.rows('cms_kv').filter((r) => r.key !== key);
  db.rows('cms_kv').push({ key, value: JSON.stringify(value) });
};
const clone = (x) => JSON.parse(JSON.stringify(x));
const byId = (state, id) => state.pages.find((p) => p.id === id);
const slugs = (pages) => pages.map((p) => p.slug).sort();

const HOUR = 3_600_000;
const past = new Date(Date.now() - 48 * HOUR).toISOString();
const future = new Date(Date.now() + 48 * HOUR).toISOString();
const blog = (id, slug, extra = {}) => ({ id, name: `Article ${id}`, slug, type: 'blog', origin: 'ai-blog', blocks: [{ id: `${id}-b`, t: 'hero', p: {} }], ...extra });
const captured = { slug: '/blog/scheduled', name: 'Scheduled', html: '<div class="pv-page">captured</div>' };

/** The site as the server has it: what Schedule, Unpublish and the scheduled-publish job wrote. */
const SERVER = {
  pages: [
    { id: 'home', name: 'Home', slug: '/', type: 'page', blocks: [] },
    { id: 'about', name: 'About', slug: '/about', type: 'page', blocks: [] },
    { id: 'new', _draft: 1, name: 'Half-built page', slug: '/half-built', type: 'page', blocks: [] },
    blog('live', '/blog/live', { blogStatus: 'published', publishAt: past }),
    blog('draft', '/blog/draft'), // new from Create CMS page: no status
    blog('scheduled', '/blog/scheduled', { blogStatus: 'scheduled', publishAt: future, scheduledRender: captured }),
    blog('unpublished', '/blog/unpublished', { blogStatus: 'draft', publishAt: null, scheduledRender: null }),
  ],
  current: 0,
  site: { menu: [{ label: 'Solar' }] },
};

/* ── The rules ─────────────────────────────────────────────────────────────── */

// A tab opened before the old Publish marked everything live (or before Unpublish).
const stale = clone(SERVER);
for (const p of stale.pages) if (p.type === 'blog') Object.assign(p, { blogStatus: 'published', publishAt: p.publishAt || past, scheduledRender: null });
const kept = R.keepServerBlogStatus(stale, SERVER, null);
eq('a draft article keeps the server’s status (none), not the tab’s Live', [byId(kept, 'draft').blogStatus, 'blogStatus' in byId(kept, 'draft')], [undefined, false]);
eq('a scheduled article stays scheduled, with its time and captured page', [byId(kept, 'scheduled').blogStatus, byId(kept, 'scheduled').publishAt, byId(kept, 'scheduled').scheduledRender?.html], ['scheduled', future, captured.html]);
eq('an unpublished article stays a draft', byId(kept, 'unpublished').blogStatus, 'draft');
eq('a live article stays live', byId(kept, 'live').blogStatus, 'published');
const edited = clone(SERVER);
byId(edited, 'about').name = 'About us';
byId(edited, 'live').name = 'Live article, edited';
const keptEdits = R.keepServerBlogStatus(edited, SERVER, null);
eq('…and the tab’s own edits are kept (pages and articles)', [byId(keptEdits, 'about').name, byId(keptEdits, 'live').name], ['About us', 'Live article, edited']);
eq('website pages aren’t touched (a draft page stays a draft)', [byId(kept, 'new')._draft, byId(kept, 'home')], [1, SERVER.pages[0]]);

// The cron published the scheduled article while a tab still had it as Scheduled.
const cronDone = clone(SERVER);
Object.assign(byId(cronDone, 'scheduled'), { blogStatus: 'published', scheduledRender: null });
eq('an article the job put live stays live, whatever an older tab says', R.keepServerBlogStatus(clone(SERVER), cronDone, null).pages.find((p) => p.id === 'scheduled').blogStatus, 'published');

const deleted = { ...clone(SERVER), pages: SERVER.pages.filter((p) => p.id !== 'live') };
eq('an article the server doesn’t have (deleted in another tab) comes back only as a draft', byId(R.keepServerBlogStatus(stale, deleted, null), 'live').blogStatus, 'draft');

const now = new Date();
const pub = R.keepServerBlogStatus(stale, SERVER, 'scheduled', now);
eq('the article being published goes live now (a scheduled one is dated now, its captured page cleared)', [byId(pub, 'scheduled').blogStatus, byId(pub, 'scheduled').publishAt, byId(pub, 'scheduled').scheduledRender], ['published', now.toISOString(), null]);
eq('…a live one keeps its first date', byId(R.keepServerBlogStatus(stale, SERVER, 'live', now), 'live').publishAt, past);
eq('…and only that one: the others keep theirs', [byId(pub, 'draft').blogStatus, byId(pub, 'unpublished').blogStatus], [undefined, 'draft']);

eq('the published copy leaves out articles that aren’t live (pages stay)', slugs(R.withoutOfflineBlogs(kept).pages), ['/', '/about', '/blog/live', '/half-built']);
const allRendered = SERVER.pages.map((p) => ({ slug: p.slug, html: `<p>${p.id}</p>` }));
eq('the rendered pages leave out articles that aren’t live', slugs(R.liveRenderedPages(allRendered, kept)), ['/', '/about', '/blog/live', '/half-built']);
eq('…an old root address for an article is caught too', R.liveRenderedPages([{ slug: '/blog/old-root' }], { pages: [blog('o', '/old-root')] }), []);

/* ── Publish (the route) ───────────────────────────────────────────────────── */

const render = (state, keep) => state.pages.filter(keep).map((p) => ({ slug: p.slug, name: p.name, theme: '', seo: {}, html: `<div class="pv-page">${p.name}</div>` }));
/** What doPublish sends: every article (the server decides), pages that aren't drafts, and the page being published. */
const clientRendered = (state, cur) => render(state, (p) => p.type === 'blog' || !p._draft || p.id === cur);
const publish = (body) => kit.call(publishRoute, '/api/cms/publish', { body });

// Publish the draft article from a stale tab (statuses all Live, as the old Publish left them).
setKv(DRAFT, SERVER);
setKv(PUBLISHED, { pages: [] });
setKv(RENDERED, { css: '', pages: [] });
const r1 = await publish({ state: stale, rendered: { css: '.x{}', pages: clientRendered(stale, 'draft') }, publishBlogId: 'draft' });
eq('Publish works', r1.status, 200);
eq('only the article being published and live pages go on the website', slugs(kv(RENDERED).pages), ['/', '/about', '/blog/draft', '/blog/live']);
eq('…the half-built page, the scheduled and the unpublished article stay off', ['/half-built', '/blog/scheduled', '/blog/unpublished'].some((s) => kv(RENDERED).pages.some((p) => p.slug === s)), false);
eq('the saved site: that article is Live, the others keep the server’s status', ['live', 'draft', 'scheduled', 'unpublished'].map((id) => byId(kv(DRAFT), id).blogStatus), ['published', 'published', 'scheduled', 'draft']);
eq('…the scheduled one keeps its time and captured page for the job', [byId(kv(DRAFT), 'scheduled').publishAt, byId(kv(DRAFT), 'scheduled').scheduledRender?.html], [future, captured.html]);
eq('the published copy: only live articles (the Blog page lists the rest as Draft / Scheduled)', slugs(kv(PUBLISHED).pages.filter((p) => p.type === 'blog')), ['/blog/draft', '/blog/live']);
eq('…the menu goes with it', kv(PUBLISHED).site.menu, SERVER.site.menu);
eq('the rendered page’s CSS is kept', kv(RENDERED).css, '.x{}');

// Publish a new page from the editor: it goes live, the article statuses don't move.
setKv(DRAFT, SERVER);
const r2 = await publish({ state: clone(SERVER), rendered: { css: '', pages: clientRendered(SERVER, 'new') } });
eq('publishing the half-built page puts it live, and no article', [r2.status, slugs(kv(RENDERED).pages)], [200, ['/', '/about', '/blog/live', '/half-built']]);

// The menu's own Publish (state, no rendered pages) and the old no-body publish.
setKv(DRAFT, SERVER);
setKv(RENDERED, { css: '', pages: [{ slug: '/about', html: 'kept' }] });
await publish({ state: stale });
eq('Publish menu: the rendered pages are left as they were', kv(RENDERED).pages, [{ slug: '/about', html: 'kept' }]);
eq('…and a stale tab’s statuses don’t reach the saved site or the published copy', [byId(kv(DRAFT), 'unpublished').blogStatus, kv(PUBLISHED).pages.some((p) => p.id === 'unpublished')], ['draft', false]);
setKv(DRAFT, SERVER);
const r3 = await kit.call(publishRoute, '/api/cms/publish', {});
eq('a publish with nothing sent publishes the saved site, without its offline articles', [r3.status, slugs(kv(PUBLISHED).pages.filter((p) => p.type === 'blog'))], [200, ['/blog/live']]);

/* ── Save (an editor tab's autosave) ───────────────────────────────────────── */

setKv(DRAFT, SERVER);
const save = (value) => kit.call(saveRoute, '/api/cms', { body: { key: DRAFT, value } });
const s1 = await save(JSON.stringify(stale));
eq('a stale tab’s save keeps the server’s article statuses', [s1.status, ['live', 'draft', 'scheduled', 'unpublished'].map((id) => byId(kv(DRAFT), id).blogStatus)], [200, ['published', undefined, 'scheduled', 'draft']]);
eq('…and still saves its edits', (await save(JSON.stringify(keptEdits)), byId(kv(DRAFT), 'about').name), 'About us');
eq('the save route still only takes the editor’s document', (await kit.call(saveRoute, '/api/cms', { body: { key: 'crm-settings', value: '{}' } })).status, 400);

/* ── The editor ────────────────────────────────────────────────────────────── */

const engine = readFileSync(new URL('../src/app/admin/cms-engine.ts', import.meta.url), 'utf8');
const doPublish = engine.slice(engine.indexOf('async function doPublish(){'), engine.indexOf('function closeModal(){'));
eq('doPublish no longer marks every article Live', /\(STATE\.pages\|\|\[\]\)\.forEach\(function\(pg,i\)\{[^}]*blogStatus/.test(doPublish), false);
eq('…it marks only the article being published, and tells the server which one', [/if\(curBlog\)\{cur\.blogStatus='published'/.test(doPublish), /publishBlogId:curBlog\?cur\.id:null/.test(doPublish)], [true, true]);
eq('…draft pages other than the one being published aren’t rendered', /\.filter\(function\(pg\)\{return isCmsBlogPage\(pg\)\|\|!pg\._draft\|\|pg===cur;\}\)/.test(doPublish), true);
eq('…and only that page stops being a draft', [/STATE\.pages\.forEach\(function\(p\)\{if\(p&&p\._draft\)\{delete p\._draft/.test(doPublish), /if\(cur&&cur\._draft\)\{delete cur\._draft/.test(doPublish)], [false, true]);

kit.done();
