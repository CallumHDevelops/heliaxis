import type { PackKey } from '@/lib/docs/packs';

/**
 * The views of a job's Docs tab. Kept out of DocsHub.tsx on purpose: that file is a client component, and a server page that imports a
 * value (not just a type) from it gets a placeholder instead of the real list ("DOCS_VIEWS.includes is not a function").
 */
export type DocsView = PackKey | 'general';
export const DOCS_VIEWS: DocsView[] = ['proposal', 'inhouse', 'handover', 'general'];
