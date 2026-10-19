import type { LeadField } from './api';

/** Lead Ads answers → the fields an enquiry row stores. Pure, so it's easy to check. */
export type MappedLead = {
  name: string;
  email: string;
  phone: string;
  postcode: string;
  organization: string;
  interest: string;
  message: string;
  whatsappOptIn: boolean;
};

const YES = /^(yes|y|true|1|agree|i agree|ok|okay|sure|whatsapp)\b/i;

function pretty(fieldName: string) {
  const s = fieldName.replace(/[_?]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function mapLeadFields(fields: LeadField[]): MappedLead {
  const out: MappedLead = {
    name: '',
    email: '',
    phone: '',
    postcode: '',
    organization: '',
    interest: '',
    message: '',
    whatsappOptIn: false,
  };
  let first = '';
  let last = '';
  const extra: string[] = [];
  for (const f of fields) {
    const key = f.name.toLowerCase();
    const val = (f.values || []).join(', ').trim();
    if (!val) continue;
    if (key === 'full_name' || key === 'name') out.name = val;
    else if (key === 'first_name') first = val;
    else if (key === 'last_name') last = val;
    else if (key === 'email' || key === 'work_email') out.email = val;
    else if (key === 'phone_number' || key === 'phone' || key === 'work_phone_number') out.phone = val;
    else if (key === 'post_code' || key === 'zip_code' || key === 'postcode' || key === 'zip') out.postcode = val.toUpperCase();
    else if (key === 'company_name' || key === 'company') out.organization = val;
    else if (key.includes('whatsapp')) out.whatsappOptIn = YES.test(val);
    else if (/interest|service|product|looking_for/.test(key)) out.interest = out.interest ? `${out.interest}, ${val}` : val;
    else extra.push(`${pretty(f.name)}: ${val}`);
  }
  if (!out.name) out.name = [first, last].filter(Boolean).join(' ');
  out.message = extra.join(' · ');
  return out;
}

/**
 * What a lead becomes on the enquiry: its answers, the interest line (with company and any other
 * answers folded in), the source and the WhatsApp opt-in. Shared by the live webhook and the
 * importer so old and new leads look the same. `optInAll` is META_LEADS_WHATSAPP_OPT_IN (the forms
 * ask for WhatsApp permission). `optInSource` is how the permission is recorded on the enquiry.
 */
export function leadToEnquiry(fields: LeadField[], adName: string | null | undefined, optInAll: boolean) {
  const lead = mapLeadFields(fields);
  const interest =
    [lead.interest, lead.organization ? `Org: ${lead.organization}` : '', lead.message ? `Message: ${lead.message}` : '']
      .filter(Boolean)
      .join(' · ') || null;
  const whatsappOptIn = lead.whatsappOptIn || optInAll;
  return {
    lead,
    interest,
    source: adName ? `meta: ${adName}` : 'meta-lead-ad',
    whatsappOptIn,
    optInSource: whatsappOptIn ? ('meta-lead-form' as const) : null,
  };
}
