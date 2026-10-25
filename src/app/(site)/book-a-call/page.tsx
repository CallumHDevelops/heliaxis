import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * /book-a-call: a short link for replies and emails. It opens the booking form on "Phone call"
 * (?reason=quote marks it a quote consultation) and keeps any utm_ tags so the source is still tracked.
 */
export default async function BookACall({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    const one = Array.isArray(v) ? v[0] : v;
    if (one && (k.startsWith('utm_') || k === 'reason' || k === 'postcode' || k === 'type')) out.set(k, one);
  }
  out.set('mode', 'phone');
  redirect(`/book-a-survey?${out.toString()}`);
}
