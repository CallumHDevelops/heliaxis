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

export interface GuideStep {
  title: string;
  body: string;
}

export const GUIDE_STEPS: GuideStep[] = [
  {
    title: '1 · Start a post',
    body: 'Hit “+ New Post”, pick a template, then choose how to start: Custom (write it yourself), Smart Post (the AI writes it from a topic), or Create from project (turn a real install into a post).',
  },
  {
    title: '2 · Pick a template & size',
    body: 'The left toolbar sets the template, canvas size (square, portrait, landscape, story), theme and texture. Switch size any time — the layout re-flows to fit.',
  },
  {
    title: '3 · Edit the words',
    body: 'The right toolbar holds the text fields. You can also click any text directly on the canvas to jump to that field. Wrap *a word* in asterisks to make it gold.',
  },
  {
    title: '4 · Add a photo',
    body: 'Under “Photo background”, choose an image from the shared library — a real install photo lifts engagement far more than a plain graphic. Posts built from a project can swap in any photo from that install.',
  },
  {
    title: '5 · Badges & manufacturer logos',
    body: 'Add accreditation badges (MCS, TrustMark, 0% VAT) and manufacturer logos that sit under “Trusted installers of”, bottom-right.',
  },
  {
    title: '6 · Manage projects',
    body: 'Open Projects from the account menu (top-right avatar). Add photos and system details, or import an OpenSolar proposal PDF and it fills the figures in for you.',
  },
  {
    title: '7 · Caption & hashtags',
    body: 'The suggested caption sits under the fields. Press ✦ Generate for an AI caption that complements the post. Copy caption grabs it with the hashtags.',
  },
  {
    title: '8 · Save, history & download',
    body: 'Everything autosaves. Save lets you keep editing, download, or start another post. History (top bar) shows everything the team has made so nobody repeats a post. Download PNG exports the current design.',
  },
  {
    title: 'One rule before posting',
    body: 'Any savings, payback or grant figure must be one you can evidence. Add your assumptions and a date wherever it matters.',
  },
];
