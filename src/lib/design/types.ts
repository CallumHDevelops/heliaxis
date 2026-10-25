/**
 * Design studio document model — shared by the editor (client) and the API (server).
 *
 * All lengths are millimetres, measured from the top-left of the MEDIA box (the full
 * printed sheet including bleed). On the canvas, 1 unit = 1 PostScript point (1/72 in),
 * so the exported PDF needs no unit conversion beyond flipping the y axis.
 */

export type Box = { x: number; y: number; w: number; h: number };

/** A fold or crease line (dashed guide; never printed). `at` is mm from the media top-left. */
export type Fold = { axis: 'x' | 'y'; at: number };

/** Areas the printer says to keep text out of (e.g. pop-up wrap-around panels). */
export type Zone = { label: string; box: Box; kind: 'wrap' | 'nogo' };

export type PageGeometry = {
  /** Full sheet = trim + bleed (or a printer template's MediaBox). */
  mediaW: number;
  mediaH: number;
  /** The cut line. */
  trim: Box;
  /** Safe area inset inside the trim, in mm. */
  safe: number;
  folds?: Fold[];
  zones?: Zone[];
  /** Printer note shown in the UI, e.g. "Printer template drawn at 25% — set up at full size". */
  note?: string | null;
  /**
   * Where a printer template's page image lands on this sheet, in mm (absent = stretched over the
   * whole sheet). Set when the sheet is only part of the template's page: a press PDF whose slug
   * (crop marks) runs round its BleedBox, or a template with a margin round its artwork.
   */
  tplBox?: Box;
};

/** A printer's PDF template the design sits on. The PDF itself lives in storage. */
export type TemplateRef = {
  path: string;
  name: string;
  title?: string | null;
  libraryId?: string | null;
  /** 1-based page of the PDF used as the guide. */
  page: number;
  /** 'over' = die-lines drawn over the artwork, 'under' = behind it, 'off' = hidden. */
  mode: 'over' | 'under' | 'off';
  opacity: number;
  /** Print the template itself in the exported PDF (almost never — templates are guides). */
  include: boolean;
};

export type DesignPage = { id: string; name: string; json: Record<string, unknown> };

export type OutputOptions = {
  /** Brand colours and shapes as DeviceCMYK instead of RGB. */
  cmyk: boolean;
  /** Crop marks + registration in a slug around the sheet. */
  cropMarks: boolean;
};

export type DesignDoc = {
  v: 2;
  formatId: string;
  formatLabel: string;
  geometry: PageGeometry;
  template?: TemplateRef | null;
  pages: DesignPage[];
  output?: OutputOptions;
};

export type ProjectSummary = {
  id: string;
  name: string;
  format_id: string;
  updated_at: string;
  thumb_url: string | null;
};

export type TemplateSummary = {
  id: string;
  name: string;
  title: string | null;
  storage_path: string;
  size: number | null;
  geometry: PageGeometry;
  /** 1-based page of the PDF the geometry was read from. */
  page?: number;
  created_at: string;
};

export type UploadItem = { path: string; name: string; size: number | null; mime: string | null; created_at: string | null };

export const MM_PER_PT = 25.4 / 72;
export const PT_PER_MM = 72 / 25.4;
