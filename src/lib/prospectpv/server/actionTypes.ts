/** Result shapes shared by the server actions and the forms that call them. */
export type ActionOk<T = unknown> = { ok: true } & T;
export type ActionFail = {
  ok: false;
  /** One sentence for the top of the form. */
  message?: string;
  /** Per-field messages, keyed by the form's field names. */
  errors?: Record<string, string>;
  /** Things still missing before a letter can be created, each with where to set it. */
  blocking?: { label: string; href: string }[];
};
export type ActionResult<T = unknown> = ActionOk<T> | ActionFail;

export const ASSET_SLOTS = [
  { slot: 'logo', label: 'Logo (colour)', help: 'For light backgrounds. PNG or JPG.' },
  { slot: 'logo_white', label: 'Logo (white)', help: 'For dark bands. PNG with a transparent background.' },
  { slot: 'accreditations', label: 'Accreditation logos', help: 'MCS, RECC and NAPIT together in one image, wide and short. Printed in every letter footer.' },
  { slot: 'esa_unit', label: 'GoodWe ESA photo', help: 'Shown on the back of each letter.' },
  { slot: 'install', label: 'Finished install photo', help: 'Shown on the front of some templates.' },
  { slot: 'hero', label: 'Hero photo', help: 'Optional.' },
  { slot: 'team', label: 'Team photo', help: 'Shown on the landing page.' },
  { slot: 'signature', label: 'Signature', help: 'PNG with a transparent background.' },
  { slot: 'director_photo', label: 'Director photo', help: 'Shown on the personal letter template.' },
] as const;
export type AssetSlot = (typeof ASSET_SLOTS)[number]['slot'];
