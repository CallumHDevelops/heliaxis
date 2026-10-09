import 'server-only';
import { createHash } from 'crypto';
import { DEFAULT_RATES, HELIAXIS_PARTY, SCHEDULE_A_FIELDS, SECTIONS } from './agreement';
import { NTP_SECTIONS } from './ntp-agreement';
import type { AgreementSnapshot, NtpSnapshot } from './types';

/**
 * Fingerprints for signed agreements.
 *
 * A signed snapshot is stored as Postgres jsonb, and jsonb does NOT keep object
 * key order (it sorts keys by length, then bytewise). The original fingerprints
 * were sha256(JSON.stringify(snapshot)) in the order the snapshot was built, so
 * re-hashing the stored copy gave a different answer and every agreement looked
 * "altered" even though nothing had changed.
 *
 * Now: new fingerprints use canonical JSON (keys sorted at every level), which
 * survives any round trip. Signatures made before this change are verified by
 * putting the stored snapshot's keys back into the order they were built in
 * (taken from the same code that built them) and hashing that.
 */

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** JSON with object keys sorted at every level (arrays keep their order). */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : canonicalJson(x))).join(',')}]`;
  if (isObj(v)) {
    const keys = Object.keys(v).filter((k) => v[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

/**
 * Rebuild `value` with object keys in the order they appear in `template`
 * (keys the template doesn't know keep their current relative order, after).
 * A template of `null` means "leave this value's order as it is".
 */
function reorderLike(value: unknown, template: unknown): unknown {
  if (template === null || template === undefined) return value;
  if (Array.isArray(value)) {
    const t = Array.isArray(template) ? template : [];
    return value.map((v, i) => reorderLike(v, t.length ? t[Math.min(i, t.length - 1)] : null));
  }
  if (isObj(value) && isObj(template)) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(template)) if (k in value) out[k] = reorderLike(value[k], template[k]);
    for (const k of Object.keys(value)) if (!(k in out)) out[k] = value[k];
    return out;
  }
  return value;
}

/** Bank details are collected alongside Schedule B but aren't part of the signed contract text. */
function contractual(s: AgreementSnapshot): AgreementSnapshot {
  const details = { ...(s.details || {}) };
  delete details.bankAccountName;
  delete details.sortCode;
  delete details.accountNumber;
  return { ...s, details };
}

/** Fingerprint for a NEW framework signature. */
export function agreementFingerprint(snapshot: AgreementSnapshot) {
  return sha256(canonicalJson(contractual(snapshot)));
}

/** Fingerprint for a NEW NTP agreement. */
export function ntpFingerprint(snapshot: NtpSnapshot) {
  return sha256(canonicalJson(snapshot));
}

// Build order of each snapshot, mirroring buildSnapshot() / buildNtpSnapshot() at the time
// the original fingerprints were made. Values that came out of the database already
// (details, bespoke rates) were in jsonb order when hashed, so they're left as stored (null).
const AGREEMENT_ORDER = {
  version: 0,
  ref: 0,
  companyName: 0,
  contactName: 0,
  trade: 0,
  rateOption: 0,
  bespokeRates: null,
  defaultRates: DEFAULT_RATES,
  details: null,
  heliaxis: HELIAXIS_PARTY,
  sections: SECTIONS,
  scheduleA: SCHEDULE_A_FIELDS,
};
const NTP_ORDER = {
  version: 0,
  ref: 0,
  frameworkRef: 0,
  companyName: 0,
  ntpName: 0,
  technologies: [{ key: 0, label: 0, standard: 0 }],
  minDaysPerMonth: 0,
  supervision: { geography: 0, installsPerMonth: 0, typicalDuration: 0, installersToSupervise: 0, notes: 0 },
  fee: 0,
  heliaxis: HELIAXIS_PARTY,
  sections: NTP_SECTIONS,
};

/** Does this stored framework snapshot still match the fingerprint taken when it was signed? */
export function agreementIntact(snapshot: AgreementSnapshot, storedHash: string) {
  if (agreementFingerprint(snapshot) === storedHash) return true;
  const legacy = reorderLike(contractual(snapshot), AGREEMENT_ORDER);
  return sha256(JSON.stringify(legacy)) === storedHash;
}

/** Does this stored NTP snapshot still match the fingerprint taken when it was issued? */
export function ntpIntact(snapshot: NtpSnapshot, storedHash: string) {
  if (ntpFingerprint(snapshot) === storedHash) return true;
  return sha256(JSON.stringify(reorderLike(snapshot, NTP_ORDER))) === storedHash;
}
