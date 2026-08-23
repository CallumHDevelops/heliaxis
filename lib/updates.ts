// Post Studio — in-app guide + "what's new" changelog.
// Bump APP_VERSION whenever you add a WHATS_NEW entry: on next sign-in every
// user sees the update once (tracked in localStorage), then it stops showing.

export const APP_VERSION = '2025.08.23';

export interface UpdateEntry {
  version: string;
  date: string;
  title: string;
  items: string[];
}

// Newest first. The topmost entry's version should match APP_VERSION.
export const WHATS_NEW: UpdateEntry[] = [
  {
    version: '2025.08.23',
    date: '23 August 2025',
    title: 'Projects, smarter posts & a tidier studio',
    items: [
      'New Post now opens a chooser: start Custom, let the AI write it (Smart Post), or Create from a real project.',
      'Projects: store your real installs — add photos and system details, or import an OpenSolar PDF to fill them in automatically.',
      'Create from project writes a post from the real figures and drops a site photo straight onto the canvas.',
      'The AI now writes a caption that adds to the post instead of repeating what’s already on the image.',
      'Smarter landscape layout, better spacing on stat posts, and a more compact toolbar with less scrolling.',
      'New “How it works” guide (the ? button, top right) and this what’s-new panel.',
    ],
  },
];

export interface TourStep {
  // CSS selector of the element to spotlight (usually a [data-tour="…"]).
  // Omit for a centred, element-free step (intro / outro).
  target?: string;
  title: string;
  body: string;
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  // which mobile panel tab must be visible for the target to exist
  mobileTab?: 'design' | 'content';
}

export const TOUR_STEPS: TourStep[] = [
  {
    title: 'Welcome to Post Studio',
    body: 'A quick, hands-on tour of how to make an on-brand post from start to finish. Use Next / Back (or ← → keys), and Skip any time. Everything you touch here is the real thing — feel free to click along.',
    placement: 'center',
  },
  {
    target: '[data-tour="new-post"]',
    title: 'Start a new post',
    body: 'This opens a chooser: pick a template, then start Custom (write it yourself), Smart Post (the AI writes it from a topic), or Create from project (turn a real install into a post).',
    placement: 'bottom',
  },
  {
    target: '[data-tour="template"]',
    title: 'Pick a template',
    body: 'Each template is a different post shape — a big stat, a testimonial, a myth-buster, an offer, and more. The fields on the right change to match.',
    placement: 'right',
    mobileTab: 'design',
  },
  {
    target: '[data-tour="size"]',
    title: 'Choose a size',
    body: 'Square, portrait, landscape or story. Switch any time — the layout re-flows to fit, including a special side-by-side treatment for landscape.',
    placement: 'right',
    mobileTab: 'design',
  },
  {
    target: '[data-tour="theme"]',
    title: 'Theme & texture',
    body: 'Flip between dark, light and gold looks, and toggle the subtle cross-hatch texture.',
    placement: 'right',
    mobileTab: 'design',
  },
  {
    target: '[data-tour="photo"]',
    title: 'Add a photo background',
    body: 'A real install photo lifts engagement far more than a plain graphic. Pick one from the shared library — posts built from a project can swap in any photo from that install.',
    placement: 'right',
    mobileTab: 'design',
  },
  {
    target: '[data-tour="badges"]',
    title: 'Badges & logos',
    body: 'Add accreditation badges (MCS, TrustMark, 0% VAT) and manufacturer logos that sit under “Trusted installers of”, bottom-right.',
    placement: 'right',
    mobileTab: 'design',
  },
  {
    target: '[data-tour="canvas"]',
    title: 'Your live preview',
    body: 'This is the finished post. Click any text directly on the canvas to jump to its field — and wrap *a word* in asterisks to make it gold.',
    placement: 'left',
  },
  {
    target: '[data-tour="content"]',
    title: 'Edit the words',
    body: 'All the text fields live here. Type and the canvas updates instantly.',
    placement: 'left',
    mobileTab: 'content',
  },
  {
    target: '[data-tour="caption"]',
    title: 'Caption & hashtags',
    body: 'The suggested caption sits under the fields. Press ✦ Generate for an AI caption that adds to the post rather than repeating it, then Copy caption to grab it with the hashtags.',
    placement: 'left',
    mobileTab: 'content',
  },
  {
    target: '[data-tour="generate"]',
    title: 'Let the AI write it',
    body: 'Generate opens the AI writer: give it a topic and it drafts on-brand copy, checked against your team’s history so nobody repeats a post.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="account"]',
    title: 'Projects & libraries',
    body: 'Open this menu for Projects (store real installs, or import an OpenSolar PDF to fill the figures automatically), the image library, and manufacturer logos.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="history"]',
    title: 'History & saving',
    body: 'Everything autosaves. History shows everything the team has made so nobody repeats a post, Save lets you keep editing / download / start another, and Download PNG exports the design.',
    placement: 'bottom',
  },
  {
    title: 'One rule before posting',
    body: 'Any savings, payback or grant figure must be one you can evidence. Add your assumptions and a date wherever it matters. That’s it — you’re ready to post.',
    placement: 'center',
  },
];
