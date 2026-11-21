import 'server-only';

/** WhatsApp delivery of the estimate: filled in properly by the WhatsApp step. */
export async function sendQuoteOnWhatsApp(a: { enquiryId: string; to: string; name: string; reference: string; pdfUrl: string | null }): Promise<{ ok: boolean; id?: string | null; error?: string | null; note?: string }> {
  void a;
  return { ok: false, error: 'WhatsApp delivery is not switched on yet', note: 'not-built' };
}
