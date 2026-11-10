/** Brand image helpers shared by the admin, PDFs and the landing page. Pure. */
import type { AssetUrls } from './letterData';
import type { LetterData } from './types';

export function assetPublicUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/storage/v1/object/public/prospectpv-assets/${path.split('/').map(encodeURIComponent).join('/')}`;
}

/** Slot → storage path (from the database) → slot → public URL. */
export function urlsFromPaths(base: string, paths: Record<string, string | null | undefined>): AssetUrls {
  return Object.fromEntries(Object.entries(paths).filter(([, p]) => !!p).map(([slot, p]) => [slot, assetPublicUrl(base, p!)])) as AssetUrls;
}

/** Current brand images win over whatever was stored when the letter was made. */
export function overlayImages(data: LetterData, urls: AssetUrls): LetterData {
  return {
    ...data,
    images: {
      ...data.images,
      logo: urls.logo ?? data.images.logo,
      logoWhite: urls.logo_white ?? data.images.logoWhite,
      accreditations: urls.accreditations ?? data.images.accreditations,
      hero: urls.hero ?? data.images.hero,
      install: urls.install ?? data.images.install,
      team: urls.team ?? data.images.team,
      esaUnit: urls.esa_unit ?? data.images.esaUnit,
    },
    sender: { ...data.sender, signatureUrl: urls.signature ?? data.sender.signatureUrl, photoUrl: urls.director_photo ?? data.sender.photoUrl },
  };
}
