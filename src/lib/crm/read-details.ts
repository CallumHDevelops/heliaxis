import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { betterName, extractContactDetails } from '@/lib/contact-details';
import { logActivity } from '@/lib/crm/server';

/**
 * A customer's message gives their details ("Regards, David Bird, Is y Garn, Pencaer, Goodwick", "SA64 0JQ", their email): put them on
 * the customer and the job, but only where something is still blank (a surname is added to the first name WhatsApp gave us). Says what it
 * did on the job's timeline. Never throws.
 */
export async function fillFromMessage(enquiryId: string, text: string, via: 'WhatsApp' | 'email'): Promise<string[]> {
  try {
    const d = extractContactDetails(text);
    if (!d.name && !d.postcode && !d.address && !d.email) return [];
    const db = createAdminClient();
    const { data: e } = await db.from('enquiries').select('id, name, email, postcode').eq('id', enquiryId).maybeSingle();
    if (!e) return [];
    const { data: jobs } = await db.from('crm_projects').select('id, title, stage, address, postcode, created_at').eq('enquiry_id', enquiryId).order('created_at', { ascending: false }).limit(20);
    const job = (jobs ?? []).find((j) => j.stage !== 'complete' && j.stage !== 'lost') ?? (jobs ?? [])[0] ?? null;

    const did: string[] = [];
    const eUp: Record<string, string> = {};
    const name = betterName(e.name as string, d.name);
    if (name) {
      eUp.name = name;
      did.push(`name ${name}`);
    }
    if (d.email && !String(e.email ?? '').trim()) {
      eUp.email = d.email;
      did.push(`email ${d.email}`);
    }
    if (d.postcode && !String(e.postcode ?? '').trim()) {
      eUp.postcode = d.postcode;
      did.push(`postcode ${d.postcode}`);
    }
    if (Object.keys(eUp).length) await db.from('enquiries').update(eUp).eq('id', enquiryId);

    if (job) {
      const jUp: Record<string, string> = {};
      if (d.address && !String(job.address ?? '').trim()) {
        jUp.address = d.address.slice(0, 300);
        did.push(`address ${d.address}`);
      }
      const pc = d.postcode && !String(job.postcode ?? '').trim() ? d.postcode : null;
      if (pc) jUp.postcode = pc;
      // The job's own title follows when it was just the name (and postcode): "David" → "David Bird · SA64 0JQ".
      const was = `${e.name}${e.postcode ? ` · ${e.postcode}` : ''}`;
      if ((name || eUp.postcode) && (!job.title || job.title === was || job.title === e.name)) {
        jUp.title = `${eUp.name ?? e.name}${(eUp.postcode ?? e.postcode) ? ` · ${eUp.postcode ?? e.postcode}` : ''}`;
      }
      if (Object.keys(jUp).length) await db.from('crm_projects').update(jUp).eq('id', job.id);
    }
    if (did.length) await logActivity({ enquiryId, projectId: (job?.id as string | undefined) ?? null, kind: 'system', body: `Filled in from their ${via}: ${did.join(', ')}` }).catch(() => null);
    return did;
  } catch {
    return [];
  }
}
