/**
 * The content library: project photos the content team can use for social media and the website. Only photos of the work are shared (site,
 * progress and completion), never survey photos (customers' homes inside, consumer units, meters), snags or "other". The team sees the job's
 * reference, what was installed, the size and the postcode district, never the customer's name, address or contact details.
 */
export const CONTENT_CATEGORIES = ['site', 'progress', 'completion'] as const;
export const CONTENT_LABEL: Record<string, string> = { site: 'Site', progress: 'Progress', completion: 'Finished' };

export type ContentPhoto = {
  id: string;
  project_id: string;
  ref: string | null;
  title: string;
  products: string[];
  kwp: number | null;
  /** Postcode district only ("NP19"), never the full postcode. */
  area: string | null;
  category: string;
  caption: string | null;
  taken_at: string | null;
  created_at: string;
  width: number | null;
  height: number | null;
  thumb: string | null;
  url: string | null;
};

export const districtOf = (postcode: string | null | undefined): string | null => {
  const m = /^([A-Z]{1,2}\d[A-Z\d]?)\s*\d[A-Z]{2}$/i.exec(String(postcode ?? '').trim());
  return m ? m[1].toUpperCase() : null;
};
