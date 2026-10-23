// Light and dark mode, the stylesheet rules (src/app/theme.css explains them). No browser: reads the files.
//  1. No custom property refers to itself (`--muted: var(--muted)` is a cycle: the value becomes invalid).
//  2. Themed CSS never keys on the phone (`prefers-color-scheme`): that ignores the person's choice.
//     LEFTOVERS lists the files that still do, until their area is converted.
//  3. Nothing declares plain `color-scheme: light` on the page: Chrome still auto-darkens that.
//  4. Converted files (CONVERTED) use the tokens: no colour literals in their rules (a unit's own
//     custom properties may hold some, for a palette tuned on purpose), no re-declared theme tokens,
//     and every var(--x) they use exists.
// When an area is converted, add its files to CONVERTED and take them off LEFTOVERS.
// Usage: node scripts/test-theme-tokens.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/** Files done: the theme itself, the toggle, the admin shell and Metis. */
const CONVERTED = [
  'src/components/theme/theme-choice.css',
  'src/components/admin/admin-shell.css',
  'src/components/admin/global-search.css',
  'src/app/admin/assistant/assistant.css',
  // The frame round every admin page: the WhatsApp dock's strip, panel and chat list (not the open chat: whatsapp.css).
  'src/components/admin/whatsapp/dock.css',
  'src/components/theme/ThemeChoice.tsx',
  'src/components/theme/ThemeSync.tsx',
  'src/components/theme/BrandLogo.tsx',
  'src/components/admin/AdminShell.tsx',
  'src/components/admin/HeaderUser.tsx',
  'src/components/admin/AppRuntime.tsx',
  'src/components/admin/TopMenu.tsx',
  'src/components/admin/MoreMenu.tsx',
  'src/components/admin/MetisIcon.tsx',
  'src/app/admin/loading.tsx',
  'src/app/admin/assistant/AssistantView.tsx',
  'src/app/admin/app/page.tsx',
  'src/app/admin/app/AppDownload.tsx',
  'src/app/admin/app/SendToPhone.tsx',
  // Comms and the admin pages (wf-theme-comms): WhatsApp inbox, chats, templates, smart replies, imports,
  // Send later, chat tasks, media; the dashboard; tasks; users; setup; From Claude; the sign-in pages;
  // the blog list, analytics and heatmap chrome, the RAMS/social sign-in step and the design studio chrome.
  'src/app/admin/enquiries/whatsapp.css',
  'src/app/admin/enquiries/templates/templates.css',
  'src/app/admin/enquiries/import/import.css',
  'src/app/admin/enquiries/import/meta-import.css',
  'src/app/admin/enquiries/import/wa-import.css',
  'src/app/admin/hub.css',
  'src/app/admin/tasks/tasks.css',
  'src/app/admin/users/users.css',
  'src/app/admin/setup/setup.css',
  'src/app/admin/blog/blog-admin.css',
  'src/app/admin/geo/geo.css',
  'src/app/admin/cms-report/report.css',
  'src/app/admin/analytics/analytics.css',
  'src/app/admin/analytics/heatmap/heatmap.css',
  'src/app/admin/design/design.css',
  'src/components/admin/from-claude.css',
  'src/components/admin/contacted-catch-up.css',
  'src/components/admin/surveys-tabs.css',
  'src/components/admin/wa-template.css',
  'src/components/admin/whatsapp/chat-tasks.css',
  'src/components/admin/whatsapp/media.css',
  'src/components/admin/whatsapp/send-later.css',
  'src/components/auth/authStyles.ts',
  'src/components/auth/AuthShell.tsx',
  'src/app/login/LoginForm.tsx',
  'src/app/login/page.tsx',
  'src/app/register/page.tsx',
  'src/app/forgot-password/page.tsx',
  'src/app/reset-password/page.tsx',
  'src/app/pending/page.tsx',
  'src/app/admin/page.tsx',
  'src/app/admin/layout.tsx',
  'src/app/admin/HubView.tsx',
  'src/app/admin/HubMetaLeads.tsx',
  'src/app/admin/HubMyDay.tsx',
  'src/app/admin/approvals/page.tsx',
  'src/app/admin/tasks/page.tsx',
  'src/app/admin/tasks/TasksBoard.tsx',
  'src/app/admin/users/page.tsx',
  'src/app/admin/users/UsersManager.tsx',
  'src/app/admin/setup/env/page.tsx',
  'src/app/admin/setup/env/WhatsAppConnection.tsx',
  'src/app/admin/setup/guide/[name]/page.tsx',
  'src/app/admin/setup/sql/[file]/page.tsx',
  'src/app/admin/enquiries/inbox/page.tsx',
  'src/app/admin/enquiries/inbox/InboxList.tsx',
  'src/app/admin/enquiries/inbox/[id]/page.tsx',
  'src/app/admin/enquiries/inbox/[id]/ChatThread.tsx',
  'src/app/admin/enquiries/smart-replies/page.tsx',
  'src/app/admin/enquiries/smart-replies/SmartReplies.tsx',
  'src/app/admin/enquiries/templates/page.tsx',
  'src/app/admin/enquiries/templates/TemplatesManager.tsx',
  'src/app/admin/enquiries/import/page.tsx',
  'src/app/admin/enquiries/import/MetaImport.tsx',
  'src/app/admin/enquiries/import/WhatsAppImport.tsx',
  'src/app/admin/crm/chats/page.tsx',
  'src/app/admin/crm/chats/[id]/page.tsx',
  'src/app/admin/blog/page.tsx',
  'src/app/admin/blog/BlogAdminCreate.tsx',
  'src/app/admin/blog/BlogAdminList.tsx',
  'src/app/admin/blog/BlogAdminPostActions.tsx',
  'src/app/admin/geo/page.tsx',
  'src/app/admin/geo/GeoView.tsx',
  'src/app/admin/cms-report/page.tsx',
  'src/app/admin/cms-report/ReportView.tsx',
  'src/app/admin/analytics/page.tsx',
  'src/app/admin/analytics/HeatmapViewer.tsx',
  'src/app/admin/analytics/heatmap/page.tsx',
  'src/app/admin/sso/page.tsx',
  'src/app/admin/design/page.tsx',
  'src/app/admin/design/DesignStudio.tsx',
  'src/components/admin/ContactedCatchUp.tsx',
  'src/components/admin/CopyButton.tsx',
  'src/components/admin/FromClaude.tsx',
  'src/components/admin/GlobalSearch.tsx',
  'src/components/admin/NativePushCapture.tsx',
  'src/components/admin/PushBanner.tsx',
  'src/components/admin/SurveysTabs.tsx',
  'src/components/admin/TemplateSend.tsx',
  'src/components/admin/whatsapp/ChatPane.tsx',
  'src/components/admin/whatsapp/ChatTaskSheets.tsx',
  'src/components/admin/whatsapp/ChatTasks.tsx',
  'src/components/admin/whatsapp/DockChip.tsx',
  'src/components/admin/whatsapp/DockFrame.tsx',
  'src/components/admin/whatsapp/MediaBubble.tsx',
  'src/components/admin/whatsapp/SendLater.tsx',
  'src/components/admin/whatsapp/WhatsAppDock.tsx',
  'src/components/admin/whatsapp/WhatsAppPanel.tsx',
];
/** Literals a converted file may keep, and why. */
const ALLOWED_LITERALS = {
  // Full-height embeds (analytics) sit on near-black in both themes.
  'src/components/admin/AdminShell.tsx': ['#111'],
  // Metis's tile is brand artwork: ink with a gold glyph in both themes.
  'src/components/admin/MetisIcon.tsx': ['#ffd35c', '#e3a014', '#211f18'],
  // The photo viewer's backdrop: ::backdrop doesn't inherit custom properties in older browsers; black in both themes.
  'src/components/admin/whatsapp/media.css': ['rgba(20, 18, 12, 0.88)'],
  // What's drawn on the canvas (the design itself), not the studio's chrome.
  'src/app/admin/design/DesignStudio.tsx': ['#ffffff', '#211f18', '#f8bc1e'],
  // Written into the previewed public page (the iframe), which stays white.
  // and the heat scale drawn over it (a data colour ramp, the same in both themes).
  'src/app/admin/analytics/HeatmapViewer.tsx': ['#fff', 'rgb(0, 180, 255)', 'rgb(0, 220, 120)', 'rgb(255, 220, 0)', 'rgb(255, 120, 0)', 'rgb(220, 0, 40)'],
};
/** Area A, the CRM: home, board and list, the job record (all its tabs, sheets, fabs and the merge sheet),
    customers, projects, purchase orders, reports and the surveys tool. */
const CONVERTED_CRM = [
  'src/app/admin/crm/crm.css',
  'src/app/admin/crm/merge.css',
  'src/app/admin/crm/[id]/extras.css',
  'src/app/admin/crm/[id]/handover.css',
  'src/app/admin/crm/[id]/site.css',
  'src/app/admin/crm/[id]/site-eic.css',
  'src/app/admin/crm/reports/reports.css',
  'src/app/admin/crm/settings/handover-settings.css',
  'src/app/admin/enquiries/enquiries.css',
  'src/app/admin/projects/projects.css',
  'src/app/admin/projects/orders/orders.css',
  'src/app/admin/surveys/diary.css',
  'src/app/admin/surveys/surveys.css',
  ...['CrmBoard', 'CrmBoardView', 'CrmCard', 'CrmHome', 'CrmListView', 'CrmSearch', 'CrmUi', 'LatestNotes', 'MergeSheet', 'MyWork', 'NeedsReply', 'page'].map((f) => `src/app/admin/crm/${f}.tsx`),
  ...['ActivityTab', 'AssignmentSheet', 'CustomerColumn', 'HandoverCard', 'HandoverSheets', 'HandoverTab', 'PhotosTab', 'ProjectExtras', 'ProjectView', 'RecordFabs', 'RecordHeader', 'RecordSheets', 'ReviewDrawer', 'SiteEic', 'SiteElectrician', 'SitePeople', 'SiteReviewPanel', 'SiteTab', 'TasksCard', 'page', 'record-page'].map((f) => `src/app/admin/crm/[id]/${f}.tsx`),
  ...['reports/CrmReports', 'reports/page', 'settings/CrmSettingsView', 'settings/HandoverSettings', 'settings/page'].map((f) => `src/app/admin/crm/${f}.tsx`),
  ...['DeleteCustomers', 'EnquiriesCrm', 'page'].map((f) => `src/app/admin/enquiries/${f}.tsx`),
  ...['NewProjectSheet', 'NewProjectTrades', 'ProjectsBoard', 'page', '[id]/ProjectOverview', '[id]/page'].map((f) => `src/app/admin/projects/${f}.tsx`),
  ...['OrderSheet', 'OrdersPage', 'OrdersTab', 'OrdersUi', 'SupplierForm', 'page'].map((f) => `src/app/admin/projects/orders/${f}.tsx`),
  ...['DiaryEntrySheet', 'DiaryView', 'FindTimeSheet', 'NewSurveySheet', 'SurveysList', 'page', 'done/page', 'drafts/page', 'settings/BookingSettingsView', 'settings/page', 'shell/page', 'start/page', 'todo/page'].map((f) => `src/app/admin/surveys/${f}.tsx`),
  ...['AshpSurvey', 'MarkupEditor', 'PhotoRun', 'PhotoSlot', 'SurveyForm', 'page', 'report/SurveyReport', 'report/page'].map((f) => `src/app/admin/surveys/[id]/${f}.tsx`),
];
CONVERTED.push(...CONVERTED_CRM);
// Mark-up drawn onto survey photos (saved into the image and the report): the same in both themes.
ALLOWED_LITERALS['src/app/admin/surveys/[id]/MarkupEditor.tsx'] = ['#F8BC1E', '#E02424', '#111'];
ALLOWED_LITERALS['src/app/admin/surveys/[id]/PhotoSlot.tsx'] = ['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.75)'];
/** Area C, the trades: the site app (/portal/site), the subcontractor onboarding portal and its documents
    (agreement, NTP, the document viewer, the signature pad), and the office's subcontractor pages. */
const CONVERTED_TRADES = [
  ...['site.css', 'form.css', 'electrician.css', 'eic.css', 'layout.tsx', 'page.tsx', 'shell/page.tsx', 'j/[token]/page.tsx', 'job/[id]/page.tsx', 'job/[id]/[...step]/page.tsx'].map((f) => `src/app/portal/site/${f}`),
  ...['CheckSign', 'CustomerSign', 'DoneScreen', 'FileSlot', 'Home', 'JobScreen', 'JobSteps', 'Landing', 'PhotoSlot', 'PoCard', 'Review', 'ScanSheet', 'SiteApp', 'StepScreen', 'StringsStep', 'bits', 'custom', 'rows', 'widgets', 'eic/Boards', 'eic/Instruments', 'eic/Prop', 'eic/Sign', 'eic/Sources'].map((f) => `src/app/portal/site/ui/${f}.tsx`),
  ...['portal.css', 'layout.tsx', 'page.tsx', 'SignIn.tsx', 'app/PortalApp.tsx', 'app/page.tsx', 'app/agreement/page.tsx', 'app/ntp/[id]/page.tsx', 'ntp-sign/[token]/NtpSignForm.tsx', 'ntp-sign/[token]/page.tsx'].map((f) => `src/app/portal/(onboarding)/${f}`),
  ...['agreement.css', 'doc-viewer.css', 'signature-pad.css', 'AgreementDocument.tsx', 'DocViewer.tsx', 'NtpDocument.tsx', 'PrintButton.tsx', 'SignaturePad.tsx'].map((f) => `src/components/subcontractors/${f}`),
  ...['subcontractors.css', 'SubcontractorsList.tsx', 'TermsForm.tsx', 'page.tsx', '[id]/SiteContactsCard.tsx', '[id]/SubcontractorDetail.tsx', '[id]/page.tsx', '[id]/agreement/page.tsx', '[id]/ntp/[ntpId]/page.tsx'].map((f) => `src/app/admin/subcontractors/${f}`),
];
CONVERTED.push(...CONVERTED_TRADES);
// A saved signature's ink: dark on a transparent ground in both themes (it goes into documents and PDFs).
ALLOWED_LITERALS['src/components/subcontractors/SignaturePad.tsx'] = ['#1a1a3a'];
/** Stylesheets loaded together with another that declares the unit's palette: they may use its names. */
const SHARES = {
  'src/app/portal/site/form.css': ['src/app/portal/site/site.css'],
  'src/app/portal/site/electrician.css': ['src/app/portal/site/site.css'],
  'src/app/portal/site/eic.css': ['src/app/portal/site/site.css'],
};
/** Still keyed on the phone's setting; their areas convert them to html[data-theme]. */
const LEFTOVERS = [];
/** Not themed: the public website, the CMS editor (pinned light), the brand page. */
const OUT_OF_SCOPE = [/^src\/app\/\(site\)\//, /^src\/app\/branding\//, /^src\/app\/admin\/cms\.css$/, /^src\/app\/admin\/preview\//, /^src\/components\/(site|home|blog|legal|cms)\//];
/** Custom properties that come from elsewhere on purpose (layout, not colour). */
const EXTERNAL_VARS = new Set(['--hx-tabbar', '--hx-dock', '--font-outfit']);

/** The customers' pages (wf-theme-portal): their portal (/my), their booking link (/book; the website's
    booking form shares booking.css and keeps its own values), the app download page and WhatsApp permission. */
CONVERTED.push(
  'src/app/my/[token]/portal.css',
  'src/app/my/[token]/PortalView.tsx',
  'src/app/my/[token]/HandoverSection.tsx',
  'src/app/my/[token]/page.tsx',
  'src/components/booking/booking.css',
  'src/components/booking/BookingFlow.tsx',
  'src/components/booking/Turnstile.tsx',
  'src/app/book/[token]/page.tsx',
  'src/app/get-app/page.tsx',
  'src/app/admin/crm/whatsapp-permission/WaPermissionView.tsx',
  'src/app/admin/crm/whatsapp-permission/page.tsx'
);

const files = [];
(function walk(dir) {
  for (const name of readdirSync(join(ROOT, dir))) {
    const p = `${dir}/${name}`;
    if (statSync(join(ROOT, p)).isDirectory()) walk(p);
    else if (/\.(css|tsx?)$/.test(name)) files.push(p);
  }
})('src');
const themed = (p) => !OUT_OF_SCOPE.some((re) => re.test(p));
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

const failures = [];
const fail = (msg) => failures.push(msg);

// Tokens defined by theme.css (both themes).
const themeCss = stripComments(read('src/app/theme.css'));
const TOKENS = new Set([...themeCss.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
for (const t of ['--bg', '--surface', '--surface-2', '--raised', '--field', '--text', '--text-2', '--muted', '--border', '--border-strong', '--accent', '--accent-ink', '--accent-text', '--ok', '--warn', '--danger', '--info', '--focus']) {
  if (!TOKENS.has(t)) fail(`theme.css: ${t} is missing`);
}
// Tokens from globals.css (shadcn) that theme.css's names must not collide with.
const globals = stripComments(read('src/app/globals.css'));
for (const name of ['--muted', '--accent', '--border']) {
  if (new RegExp(`(^|[\\s;{])${name}\\s*:`).test(globals)) fail(`globals.css re-declares ${name} (use --sc-${name.slice(2)}): it would shadow the theme token`);
}

// 1–3 over every themed stylesheet (and <style> blocks in TSX).
for (const p of files.filter(themed)) {
  const src = stripComments(read(p));
  for (const m of src.matchAll(/(--[\w-]+)\s*:\s*var\(\s*(--[\w-]+)\s*\)/g)) if (m[1] === m[2]) fail(`${p}: ${m[1]}: var(${m[2]}) refers to itself`);
  if (p.endsWith('.css') && /prefers-color-scheme/.test(src) && !LEFTOVERS.includes(p)) fail(`${p}: keys on prefers-color-scheme; use :root[data-theme='dark'] (src/app/theme.css)`);
  // On the page or on an island (.hx-light): plain `light` is still auto-darkened by Chrome on a dark phone.
  if (/color-scheme\s*:\s*light\s*[;}]/.test(src)) fail(`${p}: declares plain "color-scheme: light"; Chrome still auto-darkens it (use "only light")`);
}
for (const p of LEFTOVERS) if (!/prefers-color-scheme/.test(stripComments(read(p)))) console.log(`note: ${p} no longer uses prefers-color-scheme — take it off LEFTOVERS`);
// Nested layouts must not set their own color-scheme (it would override the person's choice), nor a
// theme-color other than their area's bar (the site app repeats its ink bar for its prerendered pages).
for (const p of ['src/app/portal/site/layout.tsx', 'src/app/portal/(onboarding)/layout.tsx', 'src/app/admin/layout.tsx']) {
  const src = stripComments(read(p));
  if (/colorScheme/.test(src)) fail(`${p}: sets colorScheme; the root layout does (src/lib/theme)`);
  const tc = /themeColor\s*:\s*([^,\n}]+)/.exec(src);
  if (tc && !(p === 'src/app/portal/site/layout.tsx' && tc[1].trim() === 'INK_BAR[0]')) fail(`${p}: sets themeColor ${tc[1].trim()}; the root layout does (src/lib/theme/routes.ts)`);
}

// 4. Converted files.
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
// The whole literal (so ALLOWED_LITERALS can name an rgba() too).
const RGB = /rgba?\(\s*\d[^)]*\)/g;
for (const p of CONVERTED) {
  const raw = read(p);
  const src = stripComments(raw);
  const allowed = new Set((ALLOWED_LITERALS[p] ?? []).map((s) => s.toLowerCase()));
  const own = new Set([...src.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  for (const f of SHARES[p] ?? []) for (const m of stripComments(read(f)).matchAll(/(--[\w-]+)\s*:/g)) own.add(m[1]);
  for (const re of [HEX, RGB]) {
    for (const m of src.matchAll(re)) {
      if (allowed.has(m[0].toLowerCase())) continue;
      // In CSS, a unit's own custom property may hold a literal (a palette tuned on purpose, with its dark value).
      const before = src.slice(0, m.index);
      const start = Math.max(before.lastIndexOf(';'), before.lastIndexOf('{'), before.lastIndexOf('\n'));
      const decl = before.slice(start + 1).trim();
      if (/^--[\w-]+\s*:/.test(decl)) continue;
      // An HTML id or a URL fragment, not a colour.
      if (/(href|id|url)\s*[=(:]\s*[`'"]?[^`'"]*$/.test(before.slice(-40))) continue;
      const line = before.split('\n').length;
      fail(`${p}:${line}: colour literal ${m[0]} (use a token from src/app/theme.css)`);
    }
  }
  for (const t of TOKENS) {
    if (p.endsWith('.css') && new RegExp(`(^|[\\s;{])${t}\\s*:`).test(src) && !/^--(as|hx)-/.test(t)) fail(`${p}: re-declares the theme token ${t}`);
  }
  for (const m of src.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)) {
    const v = m[1];
    if (!TOKENS.has(v) && !own.has(v) && !EXTERNAL_VARS.has(v)) fail(`${p}: var(${v}) is not a theme token or declared here`);
  }
}

if (failures.length) {
  console.log(failures.map((f) => `FAIL ${f}`).join('\n'));
  console.log(`\n${failures.length} problem(s)`);
  process.exit(1);
}
console.log(`ok: ${files.filter(themed).length} themed files checked, ${CONVERTED.length} converted files use the tokens (${relative(ROOT, join(ROOT, 'src/app/theme.css'))}: ${TOKENS.size} tokens)`);
