/**
 * Categories for the document library (uploaded files, CRM › CRM settings › Document library) and for the
 * templates in Sales › Documents. One list, so a category means the same in both. Pure.
 */
export const DOC_LIBRARY_CATEGORIES = ['Compliance', 'Certificates and declarations', 'Brochures and guides', 'Finance', 'Tenders and proposals', 'Terms and policies', 'Manuals and datasheets', 'Letters', 'Other'] as const;
export type DocLibraryCategory = (typeof DOC_LIBRARY_CATEGORIES)[number];

/** A category from the list, or null (none chosen or not on the list). */
export const cleanLibraryCategory = (v: unknown): DocLibraryCategory | null => DOC_LIBRARY_CATEGORIES.find((c) => c === String(v ?? '').trim()) ?? null;
