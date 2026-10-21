/**
 * The electrical certificate on the electrician's pack (SPEC 2.12, D16), as a registry of routes:
 *
 * - 'eic', 'eic_single', 'meiwc': the certificate made in the app (eic.ts, registered below). Its
 *   first screen asks which certificate (the office's choice offered), so its screens come first and
 *   say for themselves which routes they show on.
 * - 'own' (here): they upload the certificate from their scheme's software (NAPIT, NICEIC…) with its
 *   number; it's filed for the handover pack (CC21) and the other forms read its number.
 *
 * A route nothing has registered (an unknown value on an old assignment) shows the waiting step: the
 * certificate stays a required item, and the gate (EF0, and the server's at sign-off) can't pass.
 *
 * certDone() is "the certificate is complete" for F44 item 38 and the Finish list; certRef() is its
 * reference for F74 Part 2 and the heat pump record. Type-only imports, plus the rules and the EIC's form.
 */
import type { FlagRule, FormCtx, Step } from '../types';
import { certComplete, EIC_FLAGS, EIC_STEPS, eicSummary } from './eic';
import { routeOf as certRoute } from './eic-model';
import { el, stepComplete } from './shared';

export type CertRouteDef = {
  /** The steps for this route, shown only while the assignment is on it. Step keys are unique across routes. */
  steps: Step[];
  /** Its steps and flags say for themselves which routes they apply to (the EIC's); they come first. */
  ownShow?: boolean;
  /** More than "every must on its steps is answered" (the EIC's signatures, say). */
  done?: (c: FormCtx) => boolean;
  /** The certificate's reference for the other forms ("NAPIT EIC 123456"). */
  ref?: (c: FormCtx) => string | null;
  flags?: FlagRule[];
};

const ROUTES = new Map<string, CertRouteDef>();
/** One definition can serve several routes (the EIC's three). */
export const registerCertRoute = (route: string | string[], def: CertRouteDef) => {
  for (const r of [route].flat()) ROUTES.set(r, def);
};
export const certRouteReady = (route: string) => ROUTES.has(route);
/** A new electrician's route: the EIC made in the app. */
export const defaultCertRoute = () => (ROUTES.has('eic') ? 'eic' : 'own');
/**
 * The certificate this job is getting: the electrician's choice on the phone once made (eic_route),
 * else the office's ('eic' when nothing is set, as the database defaults it).
 */
export const routeOf = (c: FormCtx): string => certRoute(c);

/** Each definition once, with the routes it serves; the self-showing ones (the EIC's) first. */
function defs(): { def: CertRouteDef; routes: string[] }[] {
  const out = new Map<CertRouteDef, string[]>();
  for (const [route, def] of ROUTES) out.set(def, [...(out.get(def) ?? []), route]);
  return [...out].map(([def, routes]) => ({ def, routes })).sort((a, b) => Number(!!b.def.ownShow) - Number(!!a.def.ownShow));
}

const CERT_TYPES = [
  { key: 'eic', label: 'Electrical Installation Certificate (EIC)' },
  { key: 'meiwc', label: 'Minor Works certificate' },
];

registerCertRoute('own', {
  steps: [
    {
      key: 'cert-own',
      title: 'Your certificate',
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

// The certificate made in the app (eic.ts): its screens, its gate (the signatures included) and its flags.
registerCertRoute(['eic', 'eic_single', 'meiwc'], { steps: EIC_STEPS, ownShow: true, done: certComplete, ref: (c) => eicSummary(c).ref, flags: EIC_FLAGS });

/** Shown while the assignment's route isn't one the app knows: the certificate stays on the list of what's needed. */
const WAITING: Step = {
  key: 'cert',
  title: 'Certificate',
  show: (c) => !ROUTES.has(routeOf(c)),
  fields: [
    {
      key: 'CERT_WAIT',
      type: 'AUTO',
      label: 'Electrical certificate',
      hint: 'This job’s certificate isn’t one the app knows. Ask the office to set it again on the Site tab, or call 01633 965205.',
      level: 'must',
      done: () => false,
    },
  ],
};

/** The certificate steps: every registered route's (each shown only on its route), and the waiting step. */
export function certSteps(): Step[] {
  const out: Step[] = [];
  for (const { def, routes } of defs()) {
    for (const s of def.steps) out.push(def.ownShow ? s : { ...s, show: (c) => routes.includes(routeOf(c)) && (!s.show || s.show(c)) });
  }
  return [...out, WAITING];
}

/** The certificate's flags, for whichever route is in use. */
export function certFlags(): FlagRule[] {
  return defs().flatMap(({ def, routes }) => (def.flags ?? []).map((f) => (def.ownShow ? f : { ...f, when: (c: FormCtx) => routes.includes(routeOf(c)) && f.when(c) })));
}

/** Is the certificate complete (F44 item 38, the Finish list)? Steps hidden on its route don't count. */
export function certDone(c: FormCtx): boolean {
  const def = ROUTES.get(routeOf(c));
  if (!def) return false;
  return def.steps.filter((s) => !s.show || s.show(c)).every((s) => stepComplete(s, c)) && (def.done?.(c) ?? true);
}

/** The certificate's reference for the other forms, once it's known. */
export const certRef = (c: FormCtx): string | null => ROUTES.get(routeOf(c))?.ref?.(c) ?? null;
