/**
 * The electrical certificate on the electrician's pack (SPEC 2.12, D16), as a registry of routes:
 *
 * - 'own' (here): they upload the certificate from their scheme's software (NAPIT, NICEIC…) with its
 *   number; it's filed for the handover pack (CC21) and the other forms read its number.
 * - 'eic', 'eic_single', 'meiwc': the certificate made in the app (Unit 3), which registers its steps
 *   with registerCertRoute. Until a route is registered, its step says so and the certificate stays a
 *   required item: the gate (EF0, and the server's at sign-off) can't pass without it.
 *
 * certDone() is "the certificate is complete" for F44 item 38 and the Finish list; certRef() is its
 * reference for F74 Part 2 and the heat pump record. Type-only imports, plus the rules.
 */
import type { FlagRule, FormCtx, Step } from '../types';
import { el, stepComplete } from './shared';

export type CertRouteDef = {
  /** The steps for this route, shown only while the assignment is on it. Step keys are unique across routes. */
  steps: Step[];
  /** More than "every must on its steps is answered" (the EIC's signatures, say). */
  done?: (c: FormCtx) => boolean;
  /** The certificate's reference for the other forms ("NAPIT EIC 123456"). */
  ref?: (c: FormCtx) => string | null;
  flags?: FlagRule[];
};

const ROUTES = new Map<string, CertRouteDef>();
/** Unit 3 calls this for 'eic', 'eic_single' and 'meiwc' (the module that does must be imported by forms/index.ts). */
export const registerCertRoute = (route: string, def: CertRouteDef) => void ROUTES.set(route, def);
export const certRouteReady = (route: string) => ROUTES.has(route);
/** A new electrician's route: the EIC made in the app once it's built, until then their own certificate. */
export const defaultCertRoute = () => (ROUTES.has('eic') ? 'eic' : 'own');
/** The assignment's route ('eic' when nothing is set, as the database defaults it). */
export const routeOf = (c: FormCtx) => el(c).cert_route || 'eic';

const CERT_TYPES = [
  { key: 'eic', label: 'Electrical Installation Certificate (EIC)' },
  { key: 'meiwc', label: 'Minor Works certificate' },
];

registerCertRoute('own', {
  steps: [
    {
      key: 'cert-own',
      title: 'Certificate',
      intro: 'Upload the certificate from your scheme’s software. It goes in the customer’s handover pack.',
      fields: [
        { key: 'CERT_TYPE', type: 'SEL', label: 'Which certificate?', level: 'must', options: CERT_TYPES },
        {
          key: 'CERT_SCHEME',
          type: 'TEXT',
          label: 'Your scheme',
          hint: 'NAPIT, NICEIC or the like, with your registration number.',
          level: 'should',
          suggest: (c) => {
            const words = [el(c).scheme, el(c).scheme_number].filter(Boolean).join(' ');
            return words ? { v: words, src: 'job', text: words } : null;
          },
        },
        { key: 'CERT_NO', type: 'TEXT', label: 'Certificate number', level: 'must' },
        { key: 'CERT_FILE', type: 'PHOTOS', label: 'The certificate', hint: 'The PDF, or a clear photo of each page.', level: 'must', need: 1, files: true },
      ],
    },
  ],
  ref: (c) => {
    const no = typeof c.values.CERT_NO === 'string' ? c.values.CERT_NO.trim() : '';
    if (!no) return null;
    const scheme = typeof c.values.CERT_SCHEME === 'string' ? c.values.CERT_SCHEME.trim().split(/\s+/)[0] : '';
    return [scheme, c.values.CERT_TYPE === 'meiwc' ? 'Minor Works' : 'EIC', no].filter(Boolean).join(' ');
  },
});

/** Shown while the assignment's route isn't built yet: the certificate stays on the list of what's needed. */
const WAITING: Step = {
  key: 'cert',
  title: 'Certificate',
  show: (c) => !ROUTES.has(routeOf(c)),
  fields: [
    {
      key: 'CERT_WAIT',
      type: 'AUTO',
      label: 'Electrical certificate',
      hint: 'The certificate made in this app isn’t switched on yet. Ask the office to set this job to “upload your own certificate”, or call 01633 965205.',
      level: 'must',
      done: () => false,
    },
  ],
};

/** The certificate steps: every registered route's (each shown only on its route), and the waiting step. */
export function certSteps(): Step[] {
  const out: Step[] = [];
  for (const [route, def] of ROUTES) for (const s of def.steps) out.push({ ...s, show: (c) => routeOf(c) === route && (!s.show || s.show(c)) });
  return [...out, WAITING];
}

/** The certificate's flags, for whichever route is in use. */
export function certFlags(): FlagRule[] {
  return [...ROUTES.entries()].flatMap(([route, def]) => (def.flags ?? []).map((f) => ({ ...f, when: (c: FormCtx) => routeOf(c) === route && f.when(c) })));
}

/** Is the certificate complete (F44 item 38, the Finish list)? */
export function certDone(c: FormCtx): boolean {
  const def = ROUTES.get(routeOf(c));
  if (!def) return false;
  return def.steps.every((s) => stepComplete(s, c)) && (def.done?.(c) ?? true);
}

/** The certificate's reference for the other forms, once it's known. */
export const certRef = (c: FormCtx): string | null => ROUTES.get(routeOf(c))?.ref?.(c) ?? null;
