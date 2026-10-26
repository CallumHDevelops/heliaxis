// What Publish puts live on the website (src/app/api/cms/publish/route.ts, src/app/api/cms/route.ts,
// src/lib/blog/cms-publish-rules.ts, doPublish in src/app/admin/cms-engine.ts): only the page or article
// being published goes live. Draft pages and Draft, Scheduled and Unpublished articles stay off the
// website; articles keep the status the server has (Schedule, Unschedule, Unpublish and the scheduled-publish
// job set it), so an editor tab opened before one of those can't undo it by saving or publishing; and
// only live articles are in the published copy and the rendered pages. Pages keep the draft flag the server
// has too, so a tab opened while a page was a draft can't make it one again after it's published, and Publish
// never takes a page that's live (or the one being published) off the website, while a tab still running the
// editor from before Publish sent page ids can't put a draft page live. And scheduled articles go live
// by themselves: the every-minute job (/api/cron/whatsapp-outbox) runs publishDueScheduledBlogs
// (src/lib/blog/cms-blog-schedule.ts), harmlessly alongside an outside ping of its own route; a write
// that fails leaves the article Scheduled for the next minute, and Unschedule (cancelCmsBlogSchedule)
// won't call an article that has already gone live a draft. The job writes the website's pages, then the
// published copy, then the saved site, so the Blog list (listCmsAiBlogs) never shows an article as Live
// that isn't on the website, and an Unschedule after a failed write leaves the list and the copy agreeing.
// Unpublish (unpublishCmsBlog) writes the other way round, the website's pages last, so a failed write leaves
// the article on the website, Live in the list, and Unpublish again finishes it.
// Usage: node --experimental-strip-types scripts/test-cms-publish.mjs
import { readFileSync } from 'node:fs';
import * as kit from './site-test-kit.mjs';

const db = kit.setup({
  'next/server': `${kit.STUBS['next/server']}\nexport class NextRequest extends Request {}`,
  // The every-minute job's other work isn't what's tested here.
  '@/lib/whatsapp/inbox': 'export async function processOutbox() { return { sent: 0 }; } export async function remindUnanswered() { return 0; } export async function notifyEnquiryTeam() {}',
  '@/lib/crm/server': `${kit.STUBS['@/lib/crm/server']}\nexport async function remindNextSteps() { return 0; }`,
  '@/lib/crm/automation': 'export async function runCrmAutomations() { return {}; }',
  '@/lib/tasks-server': 'export async function remindDueTasks() { return 0; }',
  '@/lib/booking/jobs': 'export async function runBookingJobs() { return {}; }',
  '@/lib/ms365': 'export async function pollMailbox() { return 0; }',
  '@/lib/crm/merge': 'export async function finishMergeFiles() { return 0; }',
});
const { eq } = kit;
const R = await import('../src/lib/blog/cms-publish-rules.ts');
const publishRoute = await import('../src/app/api/cms/publish/route.ts');
const saveRoute = await import('../src/app/api/cms/route.ts');
const minuteRoute = await import('../src/app/api/cron/whatsapp-outbox/route.ts');
const blogCronRoute = await import('../src/app/api/cron/publish-scheduled-blogs/route.ts');
const scheduleRoute = await import('../src/app/api/blog/schedule/route.ts');
const { listCmsAiBlogs } = await import('../src/lib/blog/cms-ai-blogs.ts');
const { getCmsBlogArticleBySlug } = await import('../src/lib/blog/cms-public.ts');
// The Blog list and the public article read the database only when it's set up.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'a-test-key';

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

// Another tab published the half-built page; this one was opened while it was still a draft.
const newLive = clone(SERVER);
delete byId(newLive, 'new')._draft;
const isDraft = (state, id) => '_draft' in byId(state, id);
eq('a page the server has live loses a stale tab’s draft flag', isDraft(R.keepServerPageDraft(clone(SERVER), newLive, null), 'new'), false);
eq('…a page the server has as a draft stays one, whatever the tab says', byId(R.keepServerPageDraft(newLive, SERVER, null), 'new')._draft, 1);
const unsaved = clone(SERVER);
unsaved.pages.push({ id: 'fresh', _draft: 1, name: 'Fresh', slug: '/fresh', type: 'page', blocks: [] });
eq('…a new page the server hasn’t had yet keeps the tab’s flag', byId(R.keepServerPageDraft(unsaved, SERVER, null), 'fresh')._draft, 1);
eq('the page being published goes live', isDraft(R.keepServerPageDraft(clone(SERVER), SERVER, 'new'), 'new'), false);
eq('a page on the website now stays live (by its id), whichever page is published', isDraft(R.keepServerPageDraft(clone(SERVER), SERVER, 'home', [{ id: 'new', slug: '/half-built' }]), 'new'), false);
eq('a page on the website now stays live (rendered before the copy had ids: by its address)', isDraft(R.keepServerPageDraft(clone(SERVER), SERVER, null, [{ slug: '/half-built' }]), 'new'), false);
eq('…but not because another page’s copy is at that address', isDraft(R.keepServerPageDraft(clone(SERVER), SERVER, null, [{ id: 'deleted', slug: '/half-built' }]), 'new'), true);
eq('articles aren’t touched', byId(R.keepServerPageDraft(stale, newLive, 'draft'), 'draft'), byId(stale, 'draft'));

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
const allRendered = SERVER.pages.map((p) => ({ id: p.id, slug: p.slug, html: `<p>${p.id}</p>` }));
eq('the rendered pages leave out articles that aren’t live, and draft pages', slugs(R.liveRenderedPages(allRendered, kept)), ['/', '/about', '/blog/live']);
eq('…a page that isn’t a draft is kept', slugs(R.liveRenderedPages(allRendered, newLive)).includes('/half-built'), true);
eq('…an old root address for an article is caught too', R.liveRenderedPages([{ slug: '/blog/old-root' }], { pages: [blog('o', '/old-root')] }), []);
// A tab still running the editor from before Publish sent ids renders every page, drafts too, without ids.
const idless = SERVER.pages.map((p) => ({ slug: p.slug, html: `<p>${p.id}</p>` }));
eq('rendered pages without ids: a draft page is left out by its address', slugs(R.liveRenderedPages(idless, kept)), ['/', '/about', '/blog/live']);
eq('…a page that isn’t a draft is kept', slugs(R.liveRenderedPages(idless, newLive)).includes('/half-built'), true);

/* ── Publish (the route) ───────────────────────────────────────────────────── */

/** What doPublish sends: every page and article, with its id (the server decides which go on the website). */
const clientRendered = (state) => state.pages.map((p) => ({ id: p.id, slug: p.slug, name: p.name, theme: '', seo: {}, html: `<div class="pv-page">${p.name}</div>` }));
const publish = (body) => kit.call(publishRoute, '/api/cms/publish', { body });

// Publish the draft article from a stale tab (statuses all Live, as the old Publish left them).
setKv(DRAFT, SERVER);
setKv(PUBLISHED, { pages: [] });
setKv(RENDERED, { css: '', pages: [] });
const r1 = await publish({ state: stale, rendered: { css: '.x{}', pages: clientRendered(stale) }, publishBlogId: 'draft' });
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
const r2 = await publish({ state: clone(SERVER), rendered: { css: '', pages: clientRendered(SERVER) }, publishPageId: 'new' });
eq('publishing the half-built page puts it live, and no article', [r2.status, slugs(kv(RENDERED).pages)], [200, ['/', '/about', '/blog/live', '/half-built']]);
eq('…and it isn’t a draft in the saved site, before the tab’s own save says so', isDraft(kv(DRAFT), 'new'), false);

// Then a tab opened while it was a draft publishes Home: the page stays live.
const r2b = await publish({ state: clone(SERVER), rendered: { css: '', pages: clientRendered(SERVER) }, publishPageId: 'home' });
eq('a stale tab’s Publish doesn’t take a page another tab published off the website', [r2b.status, slugs(kv(RENDERED).pages).includes('/half-built')], [200, true]);
eq('…or make it a draft again', isDraft(kv(DRAFT), 'new'), false);
// A page on the website that the saved site still has as a draft (a tab's save after the old Publish).
setKv(DRAFT, SERVER);
setKv(RENDERED, { css: '', pages: [{ slug: '/', html: 'home' }, { slug: '/half-built', html: 'live' }] });
await publish({ state: clone(SERVER), rendered: { css: '', pages: clientRendered(SERVER) }, publishPageId: 'home' });
eq('a page already on the website stays there, and stops being a draft', [slugs(kv(RENDERED).pages).includes('/half-built'), isDraft(kv(DRAFT), 'new')], [true, false]);
setKv(DRAFT, SERVER);
setKv(RENDERED, { css: '', pages: [{ id: 'deleted', slug: '/half-built', html: 'a deleted page' }] });
await publish({ state: clone(SERVER), rendered: { css: '', pages: clientRendered(SERVER) }, publishPageId: 'home' });
eq('…a draft at the address of a deleted page stays off', [slugs(kv(RENDERED).pages).includes('/half-built'), isDraft(kv(DRAFT), 'new')], [false, true]);
// A page on the website by its id that the saved site has as a draft (another tab's save landed mid-publish).
setKv(DRAFT, SERVER);
setKv(RENDERED, { css: '', pages: [{ id: 'home', slug: '/', html: 'home' }, { id: 'new', slug: '/half-built', html: 'live' }] });
await publish({ state: clone(SERVER), rendered: { css: '', pages: clientRendered(SERVER) }, publishPageId: 'home' });
eq('a page on the website (by its id) stays there when another page is published, and stops being a draft', [slugs(kv(RENDERED).pages).includes('/half-built'), isDraft(kv(DRAFT), 'new')], [true, false]);

// A tab still running the editor from before Publish sent ids (during the update): every page, drafts too, no ids,
// no page named, every article marked Live; then its save with every draft flag cleared.
const oldBundle = (state) => state.pages.map((p) => ({ slug: p.slug, name: p.name, theme: '', seo: {}, html: `<div class="pv-page">${p.name}</div>` }));
setKv(DRAFT, SERVER);
setKv(RENDERED, { css: '', pages: [{ slug: '/', html: 'home' }, { slug: '/about', html: 'about' }] });
await publish({ state: stale, rendered: { css: '', pages: oldBundle(stale) } });
eq('an old tab’s Publish doesn’t put a draft page on the website', [slugs(kv(RENDERED).pages), isDraft(kv(DRAFT), 'new')], [['/', '/about', '/blog/live'], true]);
const cleared = clone(stale);
for (const p of cleared.pages) delete p._draft;
await kit.call(saveRoute, '/api/cms', { body: { key: DRAFT, value: JSON.stringify(cleared) } });
await publish({ state: clone(SERVER), rendered: { css: '', pages: clientRendered(SERVER) }, publishPageId: 'home' });
eq('…so a later Publish of another page doesn’t keep it there by its address either', [slugs(kv(RENDERED).pages).includes('/half-built'), isDraft(kv(DRAFT), 'new')], [false, true]);
setKv(DRAFT, SERVER);
setKv(RENDERED, { css: '', pages: [{ slug: '/', html: 'home' }, { slug: '/half-built', html: 'live' }] });
await publish({ state: stale, rendered: { css: '', pages: oldBundle(stale) } });
eq('…but a page already on the website (by its address) stays there', [slugs(kv(RENDERED).pages).includes('/half-built'), isDraft(kv(DRAFT), 'new')], [true, false]);

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
setKv(DRAFT, newLive);
await save(JSON.stringify(SERVER));
eq('a tab opened while a page was a draft can’t make it one again once it’s published', isDraft(kv(DRAFT), 'new'), false);
setKv(DRAFT, SERVER);
await save(JSON.stringify(newLive));
eq('…and a save can’t make a draft page live without publishing it', byId(kv(DRAFT), 'new')._draft, 1);
eq('the save route still only takes the editor’s document', (await kit.call(saveRoute, '/api/cms', { body: { key: 'crm-settings', value: '{}' } })).status, 400);

/* ── The editor ────────────────────────────────────────────────────────────── */

const engine = readFileSync(new URL('../src/app/admin/cms-engine.ts', import.meta.url), 'utf8');
const doPublish = engine.slice(engine.indexOf('async function doPublish(){'), engine.indexOf('function closeModal(){'));
eq('doPublish no longer marks every article Live', /\(STATE\.pages\|\|\[\]\)\.forEach\(function\(pg,i\)\{[^}]*blogStatus/.test(doPublish), false);
eq('…it marks only the article being published, and tells the server which one', [/if\(curBlog\)\{cur\.blogStatus='published'/.test(doPublish), /publishBlogId:curBlog\?cur\.id:null/.test(doPublish)], [true, true]);
eq('…every page is sent, with its id (the server leaves out the drafts, by the flag it has)', [/var pages=STATE\.pages\.map\(function\(pg\)\{\s*return\{id:pg\.id,/.test(doPublish), /pg\._draft/.test(doPublish)], [true, false]);
eq('…and tells the server which page is being published', /publishPageId:\(cur&&!curBlog\)\?cur\.id:null/.test(doPublish), true);
eq('…and only that page stops being a draft', [/STATE\.pages\.forEach\(function\(p\)\{if\(p&&p\._draft\)\{delete p\._draft/.test(doPublish), /if\(cur&&cur\._draft\)\{delete cur\._draft/.test(doPublish)], [false, true]);

/* ── Scheduled articles go live by themselves ──────────────────────────────── */

const due = new Date(Date.now() - 2 * 60_000).toISOString();
const dueRender = { slug: '/blog/due', name: 'Due', html: '<div class="pv-page">due, as scheduled</div>' };
const SCHEDULED = {
  pages: [
    { id: 'home', name: 'Home', slug: '/', type: 'page', blocks: [] },
    blog('due', '/blog/due', { blogStatus: 'scheduled', publishAt: due, scheduledRender: dueRender }),
    blog('later', '/blog/later', { blogStatus: 'scheduled', publishAt: future, scheduledRender: { ...dueRender, slug: '/blog/later' } }),
    blog('draft', '/blog/draft'),
  ],
};
setKv(DRAFT, SCHEDULED);
setKv(PUBLISHED, { pages: [SCHEDULED.pages[0]] });
setKv(RENDERED, { css: '.site{}', pages: [{ slug: '/', html: 'home' }] });
const minute = () => kit.call(minuteRoute, '/api/cron/whatsapp-outbox', { method: 'GET' });
const m1 = await minute();
eq('the every-minute job publishes the article whose time has come', [m1.status, m1.body.ok, m1.body.blogs], [200, true, { published: 1, slugs: ['/blog/due'] }]);
eq('…it’s on the website as it was when scheduled', kv(RENDERED).pages.find((p) => p.slug === '/blog/due')?.html, dueRender.html);
eq('…Live in the saved site and the published copy', [byId(kv(DRAFT), 'due').blogStatus, byId(kv(DRAFT), 'due').publishAt, kv(PUBLISHED).pages.some((p) => p.id === 'due')], ['published', due, true]);
eq('…the one for later and the draft are left alone', [byId(kv(DRAFT), 'later').blogStatus, byId(kv(DRAFT), 'draft').blogStatus, kv(RENDERED).pages.map((p) => p.slug)], ['scheduled', undefined, ['/', '/blog/due']]);
eq('…the rest of the job still runs', [m1.body.sent, m1.body.crm, m1.body.booking], [0, {}, {}]);
// Nothing due: only the saved site is read.
const reads = [];
const from = db.from;
db.from = (table) => {
  const b = from(table);
  const eqKey = b.eq;
  b.eq = (c, v) => (table === 'cms_kv' && c === 'key' && reads.push(v), eqKey(c, v));
  return b;
};
const m2 = await minute();
eq('next minute: nothing more to publish (running twice is harmless)', m2.body.blogs, { published: 0, slugs: [] });
eq('…and only the saved site was read', reads.filter((k) => k.startsWith('heliaxis-cms')), [DRAFT]);
db.from = from;
eq('an outside ping of the old route finds nothing left either', (await kit.call(blogCronRoute, '/api/cron/publish-scheduled-blogs', { method: 'GET' })).body, { ok: true, published: 0, slugs: [] });
// A write that fails is reported, and the rest of the job carries on.
Object.assign(byId(SCHEDULED, 'later'), { publishAt: due });
setKv(DRAFT, SCHEDULED);
db.from = (table) => {
  const b = from(table);
  if (table === 'cms_kv') b.upsert = (r) => ({ then: (res) => res({ data: null, error: { message: `couldn’t write ${r.key}` } }) });
  return b;
};
const m3 = await minute();
db.from = from;
eq('a failed write shows in the job’s reply, and the job still answers', [m3.status, m3.body.ok, /couldn’t write/.test(m3.body.blogs?.error ?? '')], [200, true, true]);
// Only one write fails: nothing is left half-published, and the next minute finishes the job.
Object.assign(byId(SCHEDULED, 'later'), { publishAt: future });
const resetDocs = () => (setKv(DRAFT, SCHEDULED), setKv(PUBLISHED, { pages: [SCHEDULED.pages[0]] }), setKv(RENDERED, { css: '.site{}', pages: [{ slug: '/', html: 'home' }] }));
/** The docs the job writes, in the order it starts them; `key`'s write fails. */
const written = [];
const failing = (key) => {
  written.length = 0;
  db.from = (table) => {
    const b = from(table);
    const upsert = b.upsert;
    if (table === 'cms_kv') b.upsert = (r, o) => (written.push(r.key), r.key === key ? { then: (res) => res({ data: null, error: { message: `couldn’t write ${r.key}` } }) } : upsert(r, o));
    return b;
  };
};
/** The article's line on the Blog list. */
const listed = async (id) => {
  const row = (await listCmsAiBlogs()).find((b) => b.id === id);
  return { status: row?.status, live: row?.live };
};
resetDocs();
failing(RENDERED);
const m4 = await minute();
db.from = from;
eq('the website’s pages fail to write: reported, and the article is still Scheduled with its captured page', [/couldn’t write heliaxis-cms-rendered/.test(m4.body.blogs?.error ?? ''), byId(kv(DRAFT), 'due').blogStatus, byId(kv(DRAFT), 'due').scheduledRender?.html], [true, 'scheduled', dueRender.html]);
eq('…nothing after it is written, so the Blog list shows it Scheduled (past its time), not Live', [written, kv(PUBLISHED).pages.some((p) => p.id === 'due'), await listed('due')], [[RENDERED], false, { status: 'scheduled', live: false }]);
failing(null);
const m5 = await minute();
db.from = from;
eq('…so the next minute puts it live', [m5.body.blogs, kv(RENDERED).pages.find((p) => p.slug === '/blog/due')?.html, byId(kv(DRAFT), 'due').blogStatus], [{ published: 1, slugs: ['/blog/due'] }, dueRender.html, 'published']);
eq('…writing the website’s pages, then the published copy, then the saved site', written, [RENDERED, PUBLISHED, DRAFT]);
resetDocs();
failing(PUBLISHED);
const m7 = await minute();
db.from = from;
eq('the published copy fails to write: it’s on the website, so the Blog list’s Live is right and View opens it', [/couldn’t write heliaxis-cms-published/.test(m7.body.blogs?.error ?? ''), written, await listed('due'), (await getCmsBlogArticleBySlug('due'))?.html], [true, [RENDERED, PUBLISHED], { status: 'published', live: true }, dueRender.html]);
eq('…still Scheduled in the saved site, so the next minute finishes it', [byId(kv(DRAFT), 'due').blogStatus, (await minute()).body.blogs, kv(PUBLISHED).pages.some((p) => p.id === 'due'), byId(kv(DRAFT), 'due').blogStatus], ['scheduled', { published: 1, slugs: ['/blog/due'] }, true, 'published']);
resetDocs();
failing(DRAFT);
const m6 = await minute();
db.from = from;
eq('the saved site fails to write: it’s on the website, still Scheduled for the next minute', [/couldn’t write heliaxis-cms-v1/.test(m6.body.blogs?.error ?? ''), kv(RENDERED).pages.some((p) => p.slug === '/blog/due'), byId(kv(DRAFT), 'due').blogStatus], [true, true, 'scheduled']);

/* ── Unschedule an article the job has already put live ────────────────────── */

const unschedule = (id) => kit.call(scheduleRoute, '/api/blog/schedule', { method: 'DELETE', body: { id, slug: byId(SCHEDULED, id).slug } });
// A Blog list loaded before the job ran still offers Unschedule.
const u1 = await unschedule('due');
eq('Unschedule on an article that’s on the website (saved site not yet Live) is refused', [u1.status, /already gone live/.test(u1.body.error ?? ''), byId(kv(DRAFT), 'due').blogStatus], [400, true, 'scheduled']);
await minute();
const u2 = await unschedule('due');
eq('Unschedule on an article the job has put live is refused, and says to use Unpublish', [u2.status, /already gone live.*Unpublish/.test(u2.body.error ?? '')], [400, true]);
eq('…it stays Live, on the website', [byId(kv(DRAFT), 'due').blogStatus, kv(RENDERED).pages.some((p) => p.slug === '/blog/due'), kv(PUBLISHED).pages.some((p) => p.id === 'due')], ['published', true, true]);
const u3 = await unschedule('later');
eq('Unschedule before the time still makes it a draft', [u3.status, byId(kv(DRAFT), 'later').blogStatus, byId(kv(DRAFT), 'later').publishAt, byId(kv(DRAFT), 'later').scheduledRender], [200, 'draft', null, null]);
// The website's pages failed to write, and a Blog list loaded before the time unschedules it.
resetDocs();
failing(RENDERED);
await minute();
db.from = from;
const u4 = await unschedule('due');
eq('Unschedule after the website’s pages failed to write makes it a draft', [u4.status, byId(kv(DRAFT), 'due').blogStatus], [200, 'draft']);
eq('…and the Blog list and the published copy agree: a draft, not Live', [await listed('due'), kv(PUBLISHED).pages.some((p) => p.id === 'due')], [{ status: 'draft', live: false }, false]);
eq('…and the next minute leaves it a draft', [(await minute()).body.blogs, await listed('due')], [{ published: 0, slugs: [] }, { status: 'draft', live: false }]);
// Only the published copy failed: it's on the website, so a stale Unschedule is refused.
resetDocs();
failing(PUBLISHED);
await minute();
db.from = from;
const u5 = await unschedule('due');
eq('Unschedule after only the published copy failed to write is refused (it’s on the website)', [u5.status, /already gone live/.test(u5.body.error ?? ''), byId(kv(DRAFT), 'due').blogStatus, await listed('due')], [400, true, 'scheduled', { status: 'published', live: true }]);
const list = readFileSync(new URL('../src/app/admin/blog/BlogAdminList.tsx', import.meta.url), 'utf8');
const runCancel = list.slice(list.indexOf('async function runCancelSchedule('), list.indexOf('async function runUnpublish('));
eq('a refused Unschedule reloads the Blog list, so the article shows as Live with Unpublish', runCancel.slice(runCancel.indexOf('catch (e) {'), runCancel.indexOf('} finally {')).includes('router.refresh();'), true);

/* ── Unpublish a live article ──────────────────────────────────────────────── */

const unpublishRoute = await import('../src/app/api/blog/unpublish/route.ts');
const unpublish = (id) => kit.call(unpublishRoute, '/api/blog/unpublish', { body: { id, slug: byId(SCHEDULED, id).slug } });
/** The job has put it live: in the saved site, the published copy and the website's pages. */
const resetLive = async () => (resetDocs(), await minute());
/** What View opens (null is a 404). */
const view = async (slug) => (await getCmsBlogArticleBySlug(slug))?.html ?? null;
await resetLive();
failing(PUBLISHED);
const p1 = await unpublish('due');
db.from = from;
eq('Unpublish: the published copy fails to write: reported, and the website’s pages aren’t written', [p1.status, /couldn’t write heliaxis-cms-published/.test(p1.body.error ?? ''), written], [400, true, [DRAFT, PUBLISHED]]);
eq('…it’s still on the website, so the Blog list’s Live is right and View opens it', [await listed('due'), await view('due')], [{ status: 'published', live: true }, dueRender.html]);
failing(null);
const p2 = await unpublish('due');
db.from = from;
eq('…Unpublish again finishes it: a draft, out of the published copy and off the website', [p2.status, await listed('due'), kv(PUBLISHED).pages.some((p) => p.id === 'due'), await view('due')], [200, { status: 'draft', live: false }, false, null]);
eq('…writing the saved site, then the published copy, then the website’s pages', written, [DRAFT, PUBLISHED, RENDERED]);
await resetLive();
failing(DRAFT);
const p3 = await unpublish('due');
db.from = from;
eq('the saved site fails to write: nothing else is written, and it’s Live and View opens it', [p3.status, written, await listed('due'), await view('due')], [400, [DRAFT], { status: 'published', live: true }, dueRender.html]);
await resetLive();
failing(RENDERED);
const p4 = await unpublish('due');
db.from = from;
eq('the website’s pages fail to write: it’s still on the website, Live, and View opens it', [p4.status, await listed('due'), await view('due')], [400, { status: 'published', live: true }, dueRender.html]);
// A doc that can't be read isn't written back empty.
for (const [key, doc] of [[PUBLISHED, 'the published copy'], [RENDERED, 'the website’s pages']]) {
  await resetLive();
  const before = [kv(DRAFT), kv(PUBLISHED), kv(RENDERED)];
  db.from = (table) => {
    const b = from(table);
    const eqKey = b.eq;
    b.eq = (c, v) => (table === 'cms_kv' && v === key ? { maybeSingle: async () => ({ data: null, error: { message: `couldn’t read ${v}` } }) } : eqKey(c, v));
    return b;
  };
  const p5 = await unpublish('due');
  db.from = from;
  eq(`${doc} can’t be read: reported, and nothing is written (or written back empty)`, [p5.status, p5.body.error, [kv(DRAFT), kv(PUBLISHED), kv(RENDERED)]], [400, `couldn’t read ${key}`, before]);
}

kit.done();
