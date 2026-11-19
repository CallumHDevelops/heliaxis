/**
 * Content studio (spec §5 M4) shapes, stored as jsonb in seo_content (brief, proof, draft, checks). Pure: no database.
 */

export type ContentKind = 'cms_page' | 'blog';
export type ContentMode = 'new' | 'refresh';
export type ContentStatus = 'brief' | 'proof' | 'drafting' | 'draft' | 'in_review' | 'approved' | 'published' | 'rejected';
export type PageType = 'pillar' | 'town' | 'case_study' | 'cost_guide' | 'comparison' | 'sector' | 'article';
export type Intent = 'local_commercial' | 'commercial' | 'informational';

export const STATUS_LABEL: Record<ContentStatus, string> = {
  brief: 'Brief',
  proof: 'Proof pack',
  drafting: 'Writing',
  draft: 'Draft',
  in_review: 'In review',
  approved: 'Approved',
  published: 'Published',
  rejected: 'Rejected',
};

export type OutlineItem = {
  h2: string;
  /** Why it is in the outline, in words a person can check ("6 of 10 top pages have it"). */
  why: string;
  source: 'shared' | 'paa' | 'teardown' | 'titles' | 'default';
  count?: number;
};

export type LinkSuggestion = { path: string; title: string; why: string };

export type Brief = {
  generatedAt: string;
  target: {
    name: string;
    primary: string;
    phrases: string[];
    keywordIds: number[];
    service: string | null;
    town: string | null;
    intent: Intent;
    pageType: PageType;
    action: 'create' | 'improve' | 'hold';
    targetPage: string | null;
  };
  audience: string;
  outline: OutlineItem[];
  questions: string[];
  words: { min: number; max: number; median: number | null; pages: number; note: string };
  schema: string[];
  linksOut: LinkSuggestion[];
  linksIn: LinkSuggestion[];
  cta: { label: string; href: string };
  /** The top 10 the brief was built from (titles only when there are no page facts). */
  top10: { pos: number; domain: string | null; url: string | null; title: string | null; words: number | null }[];
  sources: { serpDate: string | null; teardownDate: string | null; factsPages: number; paa: number };
  notes: string[];
};

export type ProofProject = { town: string; sizeKwp: number | null; batteryKwh: number | null; date: string; summary: string; photoUrl: string; photoPermission: boolean };
export type ProofReview = { quote: string; name: string; town: string; source: string; date: string; stars: number | null };
export type ProofPackage = { id: string; name: string; priceIncVat: number | null; kwp: number | null; usableKwh: number | null; panels: string; warranties: string; checkedAt: string };
/** `money`: a person marked this figure as a £ amount (a price or a saving), so a draft may quote it as money. */
export type ProofFigure = { label: string; value: string; source: string; checked: string; money?: boolean };

export type Proof = {
  projects: ProofProject[];
  reviews: ProofReview[];
  packages: ProofPackage[];
  figures: ProofFigure[];
  dno: string;
  council: string;
  /** Heliaxis-only facts: what surveys in this area find, roof types, typical problems. */
  findings: string;
  author: { name: string; role: string; bio: string; photo: string };
  updatedAt: string | null;
  updatedBy: string | null;
};

export const EMPTY_PROOF: Proof = {
  projects: [],
  reviews: [],
  packages: [],
  figures: [],
  dno: '',
  council: '',
  findings: '',
  author: { name: '', role: '', bio: '', photo: '' },
  updatedAt: null,
  updatedBy: null,
};

/** A CMS block, as src/lib/cms/ai-page.ts returns it ({t, p}); ids are added when it is written to the CMS. */
export type DraftBlock = { id?: string; t: string; p: Record<string, unknown> };

export type Draft = {
  kind: ContentKind;
  title: string;
  description: string;
  slug: string;
  /** cms_page: the blocks in reading order. */
  blocks?: DraftBlock[];
  /** blog: the article fields of the fixed blog template (src/lib/blog/cms-article-template.ts). */
  article?: Record<string, unknown>;
  /** JSON-LD, as text, so a person can edit it and the check can parse it. */
  schema: string;
  model: string;
  writtenAt: string;
  lastChecked: string;
  writtenBy?: string | null;
  editedBy?: string | null;
  editedAt?: string | null;
};

export type CheckIssue = { text: string; where?: string };
export type CheckResult = { key: string; label: string; ok: boolean; blocking: boolean; detail: string; issues: CheckIssue[] };
export type Checks = { ranAt: string; ok: boolean; results: CheckResult[] };
