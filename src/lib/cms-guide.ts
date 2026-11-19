/**
 * The interactive CMS guide (CMS › CMS guide): ten short lessons that teach someone new to build, check and publish pages on
 * heliaxis.co.uk. Each lesson has steps to tick off as they are done on the real screens, notes, and a quick quiz.
 * Everything here is plain data plus pure helpers (progress, printing), so it can be tested. The screen is CmsGuide.tsx.
 *
 * Facts come from the Help pages (src/content/help/website) and the rules in docs/WEBSITE-CONTENT-SPEC.md. If a screen in the
 * CMS changes, change the lesson that names it. Last checked: November 2026.
 */

export type GuideLink = { label: string; href: string };
export type Step = { text: string; open?: GuideLink; adminOnly?: boolean };
export type Callout = { kind: 'watch' | 'tip'; title: string; text: string };
export type Question = { q: string; options: string[]; answer: number; why: string };
export type Table = { head: [string, string]; rows: [string, string][] };

export type Lesson = {
  id: string;
  title: string;
  minutes: number;
  goal: string;
  read: string[];
  table?: Table;
  stepsTitle: string;
  steps: Step[];
  callouts: Callout[];
  quiz: Question[];
  help: GuideLink[];
};

const H = (slug: string, label: string): GuideLink => ({ label, href: `/admin/help/website/${slug}` });
const CMS: GuideLink = { label: 'Open Manage CMS', href: '/admin/cms' };

export const GUIDE_CHECKED = 'November 2026';

export const LESSONS: Lesson[] = [
  {
    id: 'rules',
    title: 'Start here: the four golden rules',
    minutes: 5,
    goal: 'Know the four things that can hurt the website or the business, before you touch a page.',
    read: [
      'Manage CMS is where every page on heliaxis.co.uk is built. Your changes save as you work, but nothing reaches the public website until someone presses Publish.',
      'Work through the lessons in order. Each has steps to tick off as you do them on the real screens, notes to read, and a short quiz. Your progress is saved in this browser.',
    ],
    stepsTitle: 'Read each rule, then tick it',
    steps: [
      { text: 'Rule 1. Publishing puts the whole website live: every page, every draft and every blog article in the CMS, not just the page you are working on. Check the Draft pages list and the Blog page before you publish.' },
      { text: 'Rule 2. One person edits at a time, in one browser tab. The whole site is saved as one document, so if two people save at once the last save wipes out the other’s work.' },
      { text: 'Rule 3. Nothing goes on a page unless it is true and we can prove it: no invented prices, savings, reviews, star ratings, customer or install counts, or years in business. Our credentials are MCS, RECC, NAPIT, TrustMark, SSIP, ISO 9001 and ISO 14001, and nothing else.' },
      { text: 'Rule 4. Read everything the AI writes before it goes anywhere near Publish. It drafts quickly and it can get facts wrong.' },
    ],
    callouts: [
      { kind: 'tip', title: 'Where to find this later', text: 'This guide is under CMS › CMS guide. The full help pages are under Help › Website, and you can search them for any word.' },
    ],
    quiz: [
      {
        q: 'You press Publish while working on the Solar Panels page. What goes live?',
        options: ['Only the Solar Panels page', 'The Solar Panels page and any pages you edited today', 'Every page, draft and blog article in the CMS', 'Only the pages marked Live'],
        answer: 2,
        why: 'Publishing sends the whole website live, including other people’s unfinished drafts. That is why you check Draft pages and the Blog page first.',
      },
      {
        q: 'A colleague has the CMS editor open in another browser tab. What is the risk to your work?',
        options: ['None: changes are merged', 'Whoever saves last can wipe out the other person’s changes', 'The page is locked until they close it', 'Your work is saved twice'],
        answer: 1,
        why: 'The whole site is saved as one document, so the last save replaces the one before it. Agree who is editing, and keep the CMS open in one tab only.',
      },
      {
        q: 'Which of these can go on a page?',
        options: ['MCS-certified installer', 'Rated 4.9 stars by our customers', 'NICEIC approved installer', 'Over 1,200 installations completed'],
        answer: 0,
        why: 'MCS is one of our credentials. Star ratings and install counts must be real and provable, and NICEIC is not ours to claim. Some template pages contain example figures like these: they must be removed.',
      },
    ],
    help: [H('who-can-use-website-tools', 'Who can use the website tools'), H('preview-and-publish', 'Preview and publish the website')],
  },
  {
    id: 'around',
    title: 'Find your way around',
    minutes: 10,
    goal: 'Know the dashboard and the editor well enough to find any page and tell a live page from a draft.',
    read: ['Manage CMS has two screens: a dashboard that lists every page, and the editor for one page. The editor needs room, so use a computer or tablet.'],
    stepsTitle: 'Do these on the real screens',
    steps: [
      { text: 'Open Manage CMS and look at the dashboard, headed Website.', open: CMS },
      { text: 'Find the Create buttons: + New page, + Landing page, + Case study, + From template and + Bulk pages. You will use them in lesson 4.' },
      { text: 'Under Your pages, type a word such as solar into the search box (or press the / key), then clear it.' },
      { text: 'Find the two lists, Live pages and Draft pages. Live means published at least once. Draft means never published.' },
      { text: 'Click Edit page on any live page. Look at the toolbar along the top: Heliaxis (back to the dashboard), the page name (a menu to jump to another page), Save, the three-dot menu, Preview and Publish.' },
      { text: 'Click the three tabs on the left, Sections, Images and SEO, then pick a section to see its settings appear underneath.' },
      { text: 'Above the preview, press Mobile and then Desktop to see the page at each size.' },
      { text: 'Click Heliaxis at the top left to go back to the dashboard. You have not changed anything.' },
    ],
    callouts: [
      { kind: 'tip', title: 'Blog articles are somewhere else', text: 'They are not in the page list. They live under CMS › Blog (lesson 8).' },
      { kind: 'tip', title: 'Saved is not live', text: 'The editor saves as you go: the top right says Saving to Supabase… and then Saved to Supabase. A saved change only reaches the public website when someone publishes.' },
    ],
    quiz: [
      {
        q: 'Where do blog articles appear?',
        options: ['With the other pages on the dashboard', 'Under CMS › Blog', 'Under Draft pages only', 'Only in Help'],
        answer: 1,
        why: 'Articles are kept off the dashboard page list so they do not get mixed up with website pages.',
      },
      {
        q: 'A page is under Draft pages. What does that mean?',
        options: ['It was unpublished by mistake', 'It is waiting for approval', 'It has never been published, so it is not on the public website', 'It only shows on mobile'],
        answer: 2,
        why: 'Draft pages are new and never published. But remember rule 1: the next publish puts them live.',
      },
      {
        q: 'You change a heading and the top right says Saved to Supabase. Is the change on the live website?',
        options: ['Yes, straight away', 'No: it is saved, but only goes live when someone publishes', 'Only after midnight', 'Only for logged-in visitors'],
        answer: 1,
        why: 'Saving and publishing are two different things. Saving keeps your work; publishing sends the whole site live.',
      },
    ],
    help: [H('website-editor', 'The website editor (Manage CMS)')],
  },
  {
    id: 'edit',
    title: 'Change words, buttons and pictures',
    minutes: 20,
    goal: 'Edit a page confidently: words, gold highlights, button links, pictures and sections. You will practise on a new page that you delete afterwards.',
    read: [
      'Every page is a stack of sections: a hero, a grid of features, an FAQ, a quote form and so on. You edit a page by changing what is in each section.',
      'Practise on a page of your own, so nothing on the real site can be broken. Call it Practice page and add your name.',
    ],
    stepsTitle: 'Practise on your own page',
    steps: [
      { text: 'Make a practice page. In the editor open the three-dot menu, choose New page, type Practice page and your name, and click Create page. (Or on the dashboard: + New page, then Blank page.)', open: CMS },
      { text: 'Click the headline in the preview and type a new one. Wrap two of its words in double asterisks, like **this**, to make them solar gold.' },
      { text: 'Right-click the button in the hero. In the Button link box type /free-solar-quote and click Save link. This is where the main button on every page should go.' },
      { text: 'Click + Add section at the bottom of the layout list and add an FAQ. It lands at the very bottom, below the footer: drag it by its ⋮⋮ handle up above the footer.' },
      { text: 'Open the FAQ section’s settings and scroll to Spacing. Change Pad top (px) to 40 and watch the preview move.' },
      { text: 'Pick a section that has a picture, click Choose, and pick one from the image library. Then open the Section SEO card under the picture and write Alt text that describes what the picture shows.' },
      { text: 'Delete the FAQ you added: click the × on it in the layout list, then Delete section. This cannot be undone, so only do it on your practice page.' },
      { text: 'Watch the status at the top right change to Saving to Supabase… and then Saved to Supabase.' },
    ],
    callouts: [
      { kind: 'watch', title: 'Example wording in templates', text: 'Some sections and templates arrive with example content, such as 1,200+ installs, a 4.9 star rating, made-up customers and sample prices. Replace every one with real, true details, or delete the section.' },
      { kind: 'watch', title: 'Testimonials', text: 'A Testimonials section is hidden on the live website until there are real customer stories to show, so there is no point adding one. Never type in a review that a customer did not write.' },
      { kind: 'tip', title: 'The footer belongs to each page', text: 'Each page has its own Site footer section. Changing it on one page does not change the others.' },
      { kind: 'tip', title: 'Buttons that go nowhere', text: 'If a button points at #quote on a page with no quote form, the live site now opens the quote form in a pop-up on that page (and goes to the free quote page if the pop-up cannot load). A page with its own quote form block scrolls to it instead. Still set every link properly.' },
      { kind: 'watch', title: 'The hero rating row', text: 'The row under a hero only shows when you fill in the rating and where it comes from (for example Google), and the install figure with what it counts. Nothing is filled in for you, and the old sample 4.9 and 1,200 figures are cleared. Leave it empty until the figures are verified.' },
    ],
    quiz: [
      {
        q: 'How do you make two words in a heading gold?',
        options: ['Make them bold', 'Type them in capitals', 'Wrap them in **double asterisks**', 'Use the Spacing settings'],
        answer: 2,
        why: 'Anything between double asterisks shows in solar gold, for example Cut your bills with **Welsh sunshine.**',
      },
      {
        q: 'Where should the main button on a page take people?',
        options: ['/blog', '/free-solar-quote', 'The home page', 'The phone number'],
        answer: 1,
        why: 'One quote page for every main button means every enquiry is counted in one place. Battery and heat pump pages can say Get my free quote, with the same link.',
      },
      {
        q: 'You add a section from the + Add section list. Where does it appear?',
        options: ['At the very bottom, below the footer, so you drag it into place', 'At the top of the page', 'Just below the section you had selected', 'In the Images tab'],
        answer: 0,
        why: 'A section you click is added at the very bottom of the page, below the footer. Drag it up by its ⋮⋮ handle.',
      },
    ],
    help: [H('edit-a-page', 'Edit a website page'), H('images', 'Images on the website')],
  },
  {
    id: 'create',
    title: 'Create new pages',
    minutes: 20,
    goal: 'Choose the right way to start a page, and use the AI builders without putting unchecked words on the website.',
    read: ['New pages always start as drafts: nobody outside the office sees them until the website is published. There are six ways to start one:'],
    table: {
      head: ['Start with', 'When to use it'],
      rows: [
        ['Blank page', 'A page you will build section by section.'],
        ['+ Landing page', 'A campaign page. There are 15 ready layouts: residential solar, battery storage, grants, EV charging, care homes and more.'],
        ['+ Case study', 'A real finished job. There are 3 layouts. Only with the customer’s permission.'],
        ['+ From template', 'A layout you or a colleague saved earlier with Save as template.'],
        ['AI page builder (admins)', 'One page written from a description of the topic.'],
        ['+ Bulk pages (admins)', 'Several service pages written at once from the ready-made content briefs.'],
      ],
    },
    stepsTitle: 'Try them (admins can do all of these)',
    steps: [
      { text: 'On the dashboard, click + Landing page and scroll through a few of the layouts. Close it without choosing one.', open: CMS },
      { text: 'Click + Bulk pages. Look at the list of 20 briefs, and notice that any whose page already exists say already exists and cannot be ticked.', adminOnly: true },
      { text: 'Tick one page that does not exist yet and press Generate. Keep this the only CMS tab open until it finishes: each page takes a minute or two.', adminOnly: true },
      { text: 'Find the new page under Draft pages on the dashboard and open it in the editor.' },
      { text: 'Read it from top to bottom, then work through the checklist in lesson 6. Fix anything that is wrong. Do not publish yet.' },
      { text: 'Open its SEO tab and check that the title, description and URL slug are filled in. The AI writes a first version; you will improve it in lesson 5.' },
    ],
    callouts: [
      { kind: 'tip', title: 'Which pages to make first', text: 'Do three or four in a sitting, in this order: solar and battery, battery storage, adding a battery to existing solar, battery backup. Then heat pumps, EV chargers, whole-home energy, and the commercial and sector pages.' },
      { kind: 'watch', title: 'Check the area wording', text: 'The AI may describe Heliaxis as a South Wales installer. Make sure each page says South Wales and the South West, and names only towns we really cover.' },
      { kind: 'watch', title: 'Templates come with example content', text: 'Landing-page and case-study layouts are full of example figures and made-up customers. Replace them with real details or delete them before publishing.' },
      { kind: 'watch', title: 'One tab while generating', text: 'The CMS saves the whole site in one go. Editing in another tab or on another computer while pages are being written can undo the new pages.' },
      { kind: 'tip', title: 'Names must be unique', text: 'No two pages can share a title or URL slug, and addresses that start /blog/ are kept for blog articles.' },
    ],
    quiz: [
      {
        q: 'A bulk-created page has finished writing. Is it on the website?',
        options: ['Yes, it is live as soon as it is written', 'Only the first one is live', 'No: it is a draft until someone reviews it and the website is published', 'Only if it has a photo'],
        answer: 2,
        why: 'Every generated page lands as a draft for you to read, check and fix.',
      },
      {
        q: 'Who can use the AI page builder and Bulk pages?',
        options: ['Admins only', 'Anyone with the Website CMS tick', 'Only the person who made the page', 'Nobody: they are switched off'],
        answer: 0,
        why: 'Generating pages uses the AI account, so it is limited to admins. Everyone with Website CMS can still edit, add and delete pages.',
      },
      {
        q: 'Why keep the CMS open in only one tab while Bulk create runs?',
        options: ['It runs faster', 'The AI cannot read two tabs', 'Google blocks it', 'The CMS saves the whole site in one go, so a save from another tab could undo the new pages'],
        answer: 3,
        why: 'Because the whole site is one document, the last save wins. Keep it to one tab, one person.',
      },
    ],
    help: [H('add-a-page', 'Add a new website page'), H('ai-page-builder', 'Write a page with the AI page builder'), H('save-as-template', 'Save a page as a template')],
  },
  {
    id: 'seo',
    title: 'Get found on Google',
    minutes: 15,
    goal: 'Set a page’s title, description, address and picture details so Google, and AI assistants, understand it.',
    read: ['Open a page in the editor and click the SEO tab. These settings decide how the page looks in Google results. They save as you go and go live at the next publish.'],
    table: {
      head: ['Setting', 'What to put'],
      rows: [
        ['Page title (SEO)', 'About 50 to 60 characters, with the main phrase first, for example Solar Panels Cardiff. Do not add | Heliaxis: the website adds the name for you.'],
        ['Meta description', 'About 120 to 155 characters. Say what the page offers and give a gentle reason to click, such as a free survey.'],
        ['URL slug', 'Lower case, words joined by hyphens, such as /solar-panels-cardiff. It must be unique.'],
        ['Hide from search engines (noindex)', 'Leave unticked for real pages. Tick it on practice pages.'],
      ],
    },
    stepsTitle: 'Do this on your practice page',
    steps: [
      { text: 'Open your practice page and click the SEO tab on the left.', open: CMS },
      { text: 'Write a Page title (SEO) of about 50 to 60 characters with the main phrase first. Leave off | Heliaxis.' },
      { text: 'Write a Meta description of about 120 to 155 characters.' },
      { text: 'Look at the URL slug, and notice that changing the Page title also changes the slug on a new page. Make the slug short and clear.' },
      { text: 'Tick Hide from search engines (noindex) on your practice page, so Google can never list it.' },
      { text: 'Check every picture on the page has Alt text (the Section SEO card under the picture), or is ticked Decorative image if it only decorates.' },
      { text: 'Open the SEO dashboard and find Waiting for you. Read one suggested title and description, edit them if you can improve them, and press Approve change only when you are happy. It goes live straight away.', open: { label: 'Open the SEO dashboard', href: '/admin/analytics/seo' } },
    ],
    callouts: [
      { kind: 'watch', title: 'Changing a live page’s address', text: 'Renaming a live page or changing its URL slug changes its web address once published. Links to the old one, in emails, adverts or the menu, will stop working, so update them too.' },
      { kind: 'tip', title: 'What the SEO dashboard does for you', text: 'Every Monday it checks every page for missing, short or long titles and descriptions, writes better ones and lists them under Waiting for you. You can approve them there without opening the editor.' },
      { kind: 'tip', title: 'Write for readers and for machines', text: 'Put the answer in the first sentence or two, use plain words and real headings, and keep important words as text: Google cannot read words that are only inside a picture.' },
    ],
    quiz: [
      {
        q: 'How long should a meta description be?',
        options: ['About 20 characters', 'About 500 characters', 'It does not matter', 'About 120 to 155 characters'],
        answer: 3,
        why: 'Too short says too little. Too long is cut off in the results.',
      },
      {
        q: 'Should you type | Heliaxis on the end of the Page title (SEO)?',
        options: ['No: the website adds the name automatically, so typing it makes it appear twice', 'Yes, always', 'Only on the home page', 'Only on blog articles'],
        answer: 0,
        why: 'Pages were showing Heliaxis twice in Google results for exactly this reason.',
      },
      {
        q: 'You change the URL slug of a live page and publish. What happens to links to the old address?',
        options: ['They redirect automatically', 'Nothing: they still work', 'They stop working until you update them', 'They go to the home page'],
        answer: 2,
        why: 'Change a live address only when you really must, and update every link that pointed at it.',
      },
    ],
    help: [H('page-settings-and-seo', 'Page settings and SEO'), H('images', 'Images on the website')],
  },
  {
    id: 'check',
    title: 'Check before you publish',
    minutes: 10,
    goal: 'Use this checklist for every page, every time. It catches the mistakes that cost trust, and that can break consumer-protection and advertising rules.',
    read: ['Open the page in the editor and work through all twelve checks. When every box is ticked the lesson turns green.'],
    stepsTitle: 'The publish checklist',
    steps: [
      { text: 'Every figure on the page is true and checkable. There are no invented prices, savings, payback periods, grant amounts or percentages.' },
      { text: 'There are no star ratings, review scores, customer or installation counts, years in business or awards, unless the owner has confirmed they are true and can prove them.' },
      { text: 'The only credentials named are MCS, RECC, NAPIT, TrustMark, SSIP, ISO 9001 and ISO 14001, and each is explained, not just listed. ISO 9001 is a certified quality management system and ISO 14001 a certified environmental management system: neither certifies the installation itself.' },
      { text: 'The area is described as South Wales and the South West, and only towns we really cover are named.' },
      { text: 'Any phone number is 01633 965205. Opening hours, if shown, are Monday to Friday 8am to 6pm and weekends 10am to 3pm.' },
      { text: 'There is no Testimonials section, and no sample wording, made-up names or example figures left over from a template.' },
      { text: 'The main button says Get my free solar quote (battery and heat pump pages may say Get my free quote) and goes to /free-solar-quote.' },
      { text: 'Photos are real, used with the customer’s permission, and show no names, house numbers or number plates. Every picture has Alt text.' },
      { text: 'You have looked at the page with Preview, and on both Desktop and Mobile in the editor. Nothing is cut off or broken, and nothing still says Untitled.' },
      { text: 'The SEO tab is filled in: title, description and URL slug.' },
      { text: 'Any saving or payback is described as an estimate that depends on the property, with its assumptions beside it. It is never a promise.' },
      { text: 'A second person, or the owner, has read the page.' },
    ],
    callouts: [
      { kind: 'tip', title: 'Not sure? Leave it out', text: 'If you do not have a fact, leave the sentence out and ask the owner. A page with fewer claims that are all true beats a longer page with one wrong one.' },
      { kind: 'watch', title: 'Why this matters', text: 'Fake or misleading reviews and claims that cannot be proved break UK consumer law and advertising rules. A false credential also damages trust the moment a customer checks it.' },
    ],
    quiz: [
      {
        q: 'A template section says Rated 4.9 stars by 1,200 customers. What do you do?',
        options: ['Leave it: it looks good', 'Change it to 5 stars', 'Delete it, or replace it with something true and provable', 'Move it to the bottom of the page'],
        answer: 2,
        why: 'Template figures are examples, not facts. Only claims we can prove stay.',
      },
      {
        q: 'Which phone number goes on the website?',
        options: ['01633 965205', '01633 965000', '029 2000 0000', 'Whichever is in the template'],
        answer: 0,
        why: '01633 965205 is the Heliaxis number used everywhere, so customers, Google and AI assistants all see one consistent number.',
      },
      {
        q: 'A page says NICEIC registered. What do you do?',
        options: ['Leave it', 'Make it smaller', 'Add TrustMark next to it', 'Remove it: Heliaxis is not NICEIC, and only the seven listed credentials may be named'],
        answer: 3,
        why: 'A false credential damages trust and breaks advertising rules. It is the most important fix on this list.',
      },
    ],
    help: [H('preview-and-publish', 'Preview and publish the website')],
  },
  {
    id: 'publish',
    title: 'Preview, publish and check it is live',
    minutes: 15,
    goal: 'Know exactly what Publish does, and practise everything except pressing the final button. In this lesson you do not publish.',
    read: ['Publishing sends the whole website live in one go. To keep training safe, you will go as far as the Publish box and then close it.'],
    stepsTitle: 'Practise safely',
    steps: [
      { text: 'On the dashboard, count how many pages are under Draft pages. Every one goes live at the next publish, including other people’s unfinished work. Decide with the team who publishes and when.', open: CMS },
      { text: 'Open CMS › Blog and check that no article marked Draft or Scheduled is one that should not go out. Every article goes live with the website.', open: { label: 'Open the Blog', href: '/admin/blog' } },
      { text: 'In your practice page’s editor click Preview. The page opens in a new tab as it will look. The website’s top menu and thin top bar are not part of it: check those on the live site afterwards.' },
      { text: 'Click Publish and read the box, Publish to your site. Find Will go live at. Then close the box. Do not click Publish now: your practice page would go on the website.' },
      { text: 'Delete your practice page: on the dashboard click Delete on its card, then Delete page. It cannot be undone.' },
      { text: 'Learn the live routine: Publish, Preview before publish if you want one last look, Publish now, wait for Published — live on your site, then click View live page →.' },
      { text: 'Learn the checks after publishing: open the live address in a private window, hard-refresh if you still see the old version, and look at it on a phone.' },
    ],
    callouts: [
      { kind: 'watch', title: 'Everyone with Website CMS can publish', text: 'That includes publishing the whole site by accident. Agree in the office who publishes, and when.' },
      { kind: 'tip', title: 'If publishing fails', text: 'You must be signed in as an approved admin to publish: sign in again and retry. Publish payload too large means too many big pictures: upload fewer or smaller ones, then publish again.' },
      { kind: 'tip', title: 'Deleting and the menu', text: 'A deleted page stays on the live site until the next publish, and menu or top bar changes only show after a publish. Publishing is always the last step.' },
      { kind: 'watch', title: 'Publish from the CMS screen', text: 'Pages are drawn in your browser when you publish, so it has to be done from the CMS screen. An AI assistant or a command-line tool cannot do it for you.' },
    ],
    quiz: [
      {
        q: 'You delete a live page on the dashboard. When does it leave the public website?',
        options: ['Straight away', 'After 24 hours', 'Never', 'At the next publish'],
        answer: 3,
        why: 'Until then the old live version is still there. Publishing is the step that makes every change real.',
      },
      {
        q: 'The Publish box says Publish payload too large. What is the likely cause?',
        options: ['Too many large pictures', 'Your internet is slow', 'Too many pages', 'The page title is too long'],
        answer: 0,
        why: 'The whole site is sent in one go, so big pictures add up. Upload fewer or smaller ones.',
      },
      {
        q: 'Who can press Publish?',
        options: ['Only admins', 'Only the person who edited last', 'Anyone with Website CMS access', 'Nobody: it publishes itself'],
        answer: 2,
        why: 'That is why you agree in the office who publishes and when.',
      },
    ],
    help: [H('preview-and-publish', 'Preview and publish the website')],
  },
  {
    id: 'blog',
    title: 'Blog articles',
    minutes: 15,
    goal: 'Find, preview, schedule and take down articles, and know what only admins can do.',
    read: ['Blog articles use a fixed article layout and are edited like any page, but they are listed on CMS › Blog, not on the dashboard. Thirteen finished articles are ready to be loaded as drafts.'],
    stepsTitle: 'Do these on the Blog page',
    steps: [
      { text: 'Open CMS › Blog. Find the Drafts, Scheduled and Live counts and the search box, Search title or slug…', open: { label: 'Open the Blog', href: '/admin/blog' } },
      { text: 'Press Load the written drafts if the ready-written articles are not already there. They arrive as drafts, not live.', adminOnly: true },
      { text: 'Open one draft with Edit and read it from start to finish. Check every figure and claim: some articles carry notes listing figures that need checking before they go live.' },
      { text: 'Click the three-dot menu on its line, then Preview. A bar says Preview — not published; use ← Back to articles to return.' },
      { text: 'When you have a checked, ready article, click Schedule, pick a date and time (at least 30 seconds ahead) and press Confirm schedule. One article a week is a good pace.', adminOnly: true },
      { text: 'Learn how to take one down: the three-dot menu, then Unpublish (back to a draft) or Delete (gone for good).' },
    ],
    callouts: [
      { kind: 'watch', title: 'Edit after scheduling', text: 'A scheduled article goes live exactly as it was when you scheduled it. If you edit it afterwards, click Unschedule and schedule it again, or your changes will not be in the live version.' },
      { kind: 'watch', title: 'Unpublish is not forever', text: 'The next time anyone publishes the website, every article goes live again, including ones you unpublished. To keep an article off for good, delete it.' },
      { kind: 'tip', title: 'Every article needs a next step', text: 'Each article should lead the reader to the free quote page. Check its main button goes to /free-solar-quote.' },
      { kind: 'tip', title: 'Writing new articles (admins)', text: 'In New article describe the topic and press Generate. When it says Draft ready, check the Page title and Slug (URL), then Create CMS page. Close any other open CMS editor first.' },
    ],
    quiz: [
      {
        q: 'You edit an article after scheduling it. What must you do for the edit to go live?',
        options: ['Nothing: edits are picked up automatically', 'Delete it and start again', 'Unschedule it and schedule it again', 'Publish the website twice'],
        answer: 2,
        why: 'Scheduling takes a copy as it stands at that moment, so schedule again after editing.',
      },
      {
        q: 'Someone publishes the website at 10am. An article is scheduled for 2pm. What happens?',
        options: ['It waits until 2pm', 'It goes live early, with the rest of the site', 'It is deleted', 'It is emailed to you'],
        answer: 1,
        why: 'Publishing puts every article live. If you want one held back, do not leave it scheduled while others publish.',
      },
      {
        q: 'How do you keep an unpublished article off the website for good?',
        options: ['Delete it', 'Unpublish it', 'Schedule it far in the future', 'Leave it as a draft'],
        answer: 0,
        why: 'Drafts and unpublished articles come back live at the next publish. Only deleting keeps one off for good.',
      },
    ],
    help: [H('blog', 'The Blog page'), H('write-a-blog-article', 'Write a blog article with AI'), H('publish-a-blog-article', 'Publish, schedule or take down a blog article')],
  },
  {
    id: 'assets',
    title: 'Pictures, logos, menu and top bar',
    minutes: 15,
    goal: 'Manage the image library, brand logos, the top menu and the thin top bar without breaking the site.',
    read: ['Every picture on the website comes from one shared image library, and the menu and top bar are edited in a separate screen. Like everything in the CMS, their changes only go live when the website is published.'],
    stepsTitle: 'Look around, and tidy up after yourself',
    steps: [
      { text: 'On the dashboard, under Site & admin, open Image library and click + Upload to add a small test picture.', open: CMS },
      { text: 'Select your test picture, type a Category label such as Practice and click Set category.' },
      { text: 'Select your test picture again and click Delete selected. Only ever delete pictures you are sure are not used.' },
      { text: 'Open Brand logos and look at the banner ticks. A ticked logo shows in the manufacturer banner. Do not change them in training.' },
      { text: 'Open Mega menu. Look at the top bar settings, then click a menu item to see its label and where it links. Look only: menu changes save as you go.' },
      { text: 'Find + Estimator, + Blog, + Funding, + FAQs and + Contact at the bottom: they add common links in one click.' },
    ],
    callouts: [
      { kind: 'watch', title: 'Deleting a picture removes it everywhere', text: 'Removing a picture from the library also removes it from every section that uses it, and cannot be undone. Brand logos are deleted at once, with no question asked.' },
      { kind: 'tip', title: 'Alt text', text: 'Alt text describes what is in a picture for screen readers and for Google. Write what you see, plainly. Tick Decorative image only if the picture adds nothing.' },
      { kind: 'tip', title: 'The rating box in the top bar', text: 'The top bar settings still have a Rating value box, but the website no longer shows a rating, because there are no reviews behind it. Leave the phone number as 01633 965205.' },
    ],
    quiz: [
      {
        q: 'What happens when you delete a picture from the image library?',
        options: ['Nothing: sections keep a copy', 'It moves to a Trash folder', 'Only the library is affected', 'It is removed from every section that uses it, and cannot be undone'],
        answer: 3,
        why: 'The library is shared, so deleting from it deletes everywhere.',
      },
      {
        q: 'When do menu changes appear on the live website?',
        options: ['Straight away', 'After the next publish', 'After a day', 'Only on mobile'],
        answer: 1,
        why: 'Like every other change, the menu goes live when the website is published.',
      },
      {
        q: 'What is alt text for?',
        options: ['Making the picture load faster', 'A caption shown under the picture', 'Describing the picture to screen readers and Google', 'Hiding the picture'],
        answer: 2,
        why: 'Alt text makes the page usable for people who cannot see the picture, and it helps Google understand what it shows.',
      },
    ],
    help: [H('images', 'Images on the website'), H('menu-and-top-bar', 'Edit the website menu and top bar')],
  },
  {
    id: 'routine',
    title: 'Your weekly routine and getting help',
    minutes: 5,
    goal: 'Know what a good half hour a week looks like, and where to get help.',
    read: ['Small, regular, checked changes beat big pushes. This routine keeps the website growing without anyone rushing.'],
    table: {
      head: ['When', 'What to do'],
      rows: [
        ['Monday', 'Open the SEO dashboard. Read Do this next and Waiting for you, and approve any good title or description.'],
        ['Every week, about 30 minutes', 'Review and publish three new pages using the lesson 6 checklist. Schedule one blog article.'],
        ['Every month', 'Look at Website analytics and the SEO dashboard together. Which pages are getting found? Do more of what works.'],
      ],
    },
    stepsTitle: 'Last steps',
    steps: [
      { text: 'Open the SEO dashboard and find Do this next and Waiting for you.', open: { label: 'Open the SEO dashboard', href: '/admin/analytics/seo' } },
      { text: 'Open Help and search for the word publish.', open: { label: 'Open Help', href: '/admin/help' } },
      { text: 'Find the Report button at the bottom right of the CMS. It sends a bug report or a feature request.' },
      { text: 'Write down who the admins are and who publishes the website.' },
      { text: 'If a menu item or tool is missing, ask an admin to tick Website CMS (and Analytics for the analytics pages) under Portal access on the Users page.' },
    ],
    callouts: [
      { kind: 'tip', title: 'When in doubt', text: 'Do not guess. Check the Help pages, ask an admin, or leave the change until you know. Nothing on the website is urgent enough to publish something untrue.' },
    ],
    quiz: [
      {
        q: 'An item you need is missing from the CMS menu. What do you do?',
        options: ['Use a colleague’s login', 'Wait for it to appear', 'Ask an admin to give you the right Portal access tick', 'Clear your browser'],
        answer: 2,
        why: 'Menu items only show for the access you have. An admin changes it on the Users page.',
      },
    ],
    help: [H('who-can-use-website-tools', 'Who can use the website tools'), H('website-analytics', 'Website analytics')],
  },
];

/* ── Progress (kept in the browser) ──────────────────────────────────────────────── */

export type Progress = {
  /** Steps ticked, by "lessonId:index". */
  steps: Record<string, true>;
  /** Quiz questions answered correctly, by "lessonId:index". */
  quiz: Record<string, true>;
  name: string;
  /** The lesson last opened. */
  last: string;
  /** The date (YYYY-MM-DD) every lesson was first completed. */
  finishedAt: string;
};

export const emptyProgress = (): Progress => ({ steps: {}, quiz: {}, name: '', last: '', finishedAt: '' });
export const itemKey = (lessonId: string, i: number) => `${lessonId}:${i}`;

/** Progress as stored, tolerating anything (blank, old, damaged or tampered with). */
export function parseProgress(raw: string): Progress {
  const p = emptyProgress();
  try {
    const v = JSON.parse(raw || '{}') as Partial<Progress>;
    // Only keys that name a real step or question are kept, so a changed guide never counts ticks that no longer exist.
    const stepKeys = new Set(LESSONS.flatMap((l) => l.steps.map((_, i) => itemKey(l.id, i))));
    const quizKeys = new Set(LESSONS.flatMap((l) => l.quiz.map((_, i) => itemKey(l.id, i))));
    for (const k of Object.keys(v.steps ?? {})) if (v.steps?.[k] === true && stepKeys.has(k)) p.steps[k] = true;
    for (const k of Object.keys(v.quiz ?? {})) if (v.quiz?.[k] === true && quizKeys.has(k)) p.quiz[k] = true;
    p.name = String(v.name ?? '').slice(0, 80);
    p.last = LESSONS.some((l) => l.id === v.last) ? String(v.last) : '';
    p.finishedAt = /^\d{4}-\d{2}-\d{2}$/.test(String(v.finishedAt ?? '')) ? String(v.finishedAt) : '';
  } catch {
    // Damaged data starts again.
  }
  return p;
}

export const serializeProgress = (p: Progress) => JSON.stringify(p);

export type LessonCounts = { steps: number; stepsDone: number; quiz: number; quizDone: number; done: boolean; started: boolean };

export function lessonCounts(l: Lesson, p: Progress): LessonCounts {
  const stepsDone = l.steps.filter((_, i) => p.steps[itemKey(l.id, i)]).length;
  const quizDone = l.quiz.filter((_, i) => p.quiz[itemKey(l.id, i)]).length;
  return { steps: l.steps.length, stepsDone, quiz: l.quiz.length, quizDone, done: stepsDone === l.steps.length && quizDone === l.quiz.length, started: stepsDone + quizDone > 0 };
}

export function totals(p: Progress): { done: number; total: number; pct: number; lessonsDone: number; lessons: number } {
  let done = 0;
  let total = 0;
  let lessonsDone = 0;
  for (const l of LESSONS) {
    const c = lessonCounts(l, p);
    done += c.stepsDone + c.quizDone;
    total += c.steps + c.quiz;
    if (c.done) lessonsDone++;
  }
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0, lessonsDone, lessons: LESSONS.length };
}

/** Records the day everything was first finished (and forgets it if something is unticked later). */
function withFinish(p: Progress, today: string): Progress {
  const all = totals(p).lessonsDone === LESSONS.length;
  return { ...p, finishedAt: all ? p.finishedAt || today : '' };
}

export function toggleStep(p: Progress, lessonId: string, i: number, today: string): Progress {
  const k = itemKey(lessonId, i);
  const steps = { ...p.steps };
  if (steps[k]) delete steps[k];
  else steps[k] = true;
  return withFinish({ ...p, steps, last: lessonId }, today);
}

export function markRight(p: Progress, lessonId: string, i: number, today: string): Progress {
  return withFinish({ ...p, quiz: { ...p.quiz, [itemKey(lessonId, i)]: true }, last: lessonId }, today);
}

/* ── Printing: a handout to give someone, and a completion sheet ──────────────────────────────── */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const LETTERS = 'ABCDEFGH';

const PRINT_CSS = `
*{box-sizing:border-box}
body{font:14px/1.5 Arial,Helvetica,sans-serif;color:#211f18;margin:0;padding:28px 36px;max-width:820px}
h1{font-size:26px;margin:0 0 4px}h2{font-size:18px;margin:26px 0 4px;padding-top:14px;border-top:2px solid #211f18;break-after:avoid}
h3{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#6b665a;margin:16px 0 6px;break-after:avoid}
p{margin:0 0 8px}.sub{color:#6b665a;margin-bottom:14px}.goal{font-weight:700}
ol,ul{margin:0;padding:0;list-style:none}li{margin:0 0 7px;break-inside:avoid}
.step{display:flex;gap:10px;align-items:flex-start}.box{flex:none;width:14px;height:14px;border:1.5px solid #211f18;border-radius:3px;margin-top:3px}
.badge{font-size:11px;font-weight:700;border:1px solid #6b665a;border-radius:99px;padding:0 6px;margin-left:6px;color:#6b665a}
.note{border-left:4px solid #f8bc1e;background:#faf6ea;padding:7px 10px;margin:8px 0;break-inside:avoid}.note.watch{border-left-color:#b3261e;background:#fbefee}.note b{display:block}
table{border-collapse:collapse;width:100%;margin:6px 0 10px}td,th{border:1px solid #cfc9ba;padding:5px 8px;text-align:left;vertical-align:top}th{background:#f1ede0}
.q{margin:0 0 10px;break-inside:avoid}.q b{display:block;margin-bottom:3px}.opt{margin-left:16px}
.help{font-size:12px;color:#6b665a}.key{margin-top:30px;break-before:page}
@media print{body{padding:0}}
`;

function printWindow(title: string, body: string): string {
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PRINT_CSS}</style></head><body>${body}<script>window.addEventListener('load',function(){setTimeout(function(){window.print()},250)})</script></body></html>`;
}

/** The whole guide as one printable page: empty tick boxes, quiz questions, and the answers on the last page for whoever is training. */
export function guideHtml(): string {
  const lessons = LESSONS.map((l, n) => {
    const table = l.table ? `<table><tr><th>${esc(l.table.head[0])}</th><th>${esc(l.table.head[1])}</th></tr>${l.table.rows.map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join('')}</table>` : '';
    return `<section><h2>Lesson ${n + 1}: ${esc(l.title)} <span class="badge">${l.minutes} min</span></h2>
<p class="goal">${esc(l.goal)}</p>${l.read.map((t) => `<p>${esc(t)}</p>`).join('')}${table}
<h3>${esc(l.stepsTitle)}</h3><ol>${l.steps.map((s) => `<li class="step"><span class="box"></span><span>${esc(s.text)}${s.adminOnly ? '<span class="badge">Admins only</span>' : ''}${s.open ? ` <span class="help">(${esc(s.open.href)})</span>` : ''}</span></li>`).join('')}</ol>
${l.callouts.map((c) => `<div class="note ${c.kind}"><b>${c.kind === 'watch' ? 'Watch out: ' : 'Good to know: '}${esc(c.title)}</b>${esc(c.text)}</div>`).join('')}
<h3>Check yourself</h3>${l.quiz.map((q, qi) => `<div class="q"><b>${qi + 1}. ${esc(q.q)}</b>${q.options.map((o, oi) => `<div class="opt">${LETTERS[oi]}. ${esc(o)}</div>`).join('')}</div>`).join('')}
<p class="help">More detail: ${l.help.map((h) => `${esc(h.label)} (${esc(h.href)})`).join('; ')}</p></section>`;
  }).join('');
  const answers = LESSONS.map((l, n) => `<p><b>Lesson ${n + 1}.</b> ${l.quiz.map((q, qi) => `${qi + 1}: ${LETTERS[q.answer]}`).join(', ')}</p>`).join('');
  const body = `<h1>Heliaxis CMS guide</h1><p class="sub">How to build, check and publish pages on heliaxis.co.uk. Ten lessons, about ${LESSONS.reduce((a, l) => a + l.minutes, 0)} minutes in all. The interactive version is in HAP under CMS › CMS guide. Last checked ${esc(GUIDE_CHECKED)}.</p>${lessons}<section class="key"><h2>Answers (for whoever is training)</h2>${answers}</section>`;
  return printWindow('Heliaxis CMS guide', body);
}

/** A one-page record that someone has finished the guide. */
export function completionHtml(p: Progress): string {
  const t = totals(p);
  const when = p.finishedAt ? new Date(`${p.finishedAt}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';
  const body = `<h1>CMS guide completed</h1><p class="sub">Heliaxis, heliaxis.co.uk</p>
<p><b>${esc(p.name || 'Name not entered')}</b> has worked through the Heliaxis CMS guide${when ? ` (completed ${esc(when)})` : ''}.</p>
<p>${t.lessonsDone} of ${t.lessons} lessons, ${t.done} of ${t.total} steps and quiz questions.</p>
<table><tr><th>Lesson</th><th>Steps</th><th>Quiz</th></tr>${LESSONS.map((l) => {
    const c = lessonCounts(l, p);
    return `<tr><td>${esc(l.title)}</td><td>${c.stepsDone} of ${c.steps}</td><td>${c.quizDone} of ${c.quiz}</td></tr>`;
  }).join('')}</table>
<p class="help">Signed off by: ____________________________ &nbsp; Date: ______________</p>`;
  return printWindow('CMS guide completed', body);
}
