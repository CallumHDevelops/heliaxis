import { crmSession, isUuid, json } from '@/lib/crm/server';
import { bookingById, cancelBooking, moveBooking, staffConfirm, staffDecline, staffFrom } from '@/lib/booking/book';
import { readBody } from '@/lib/booking/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Staff actions on a booking: { action: 'confirm', force? } | { action: 'decline' } ("Offer another
 * time": returns the message for staff to send) | { action: 'cancel', reason? } | { action: 'move', start }.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = await readBody(req);
  const by = staffFrom(s);
  switch (b.action) {
    case 'confirm': {
      const o = await staffConfirm(id, by, b.force === true);
      return json(o.body, o.status);
    }
    case 'decline': {
      const o = await staffDecline(id, by);
      return json(o.body, o.status);
    }
    case 'cancel':
    case 'move': {
      const booking = await bookingById(id);
      if (!booking) return json({ error: 'Not found' }, 404);
      if (!['held', 'requested', 'confirmed'].includes(booking.status)) return json({ error: 'This booking was already cancelled.' }, 409);
      if (b.action === 'cancel') {
        const o = await cancelBooking(booking, { by, reason: typeof b.reason === 'string' ? b.reason : null });
        return json(o.body, o.status);
      }
      const start = Date.parse(String(b.start || ''));
      if (!Number.isFinite(start)) return json({ error: 'Pick a time.' }, 400);
      const o = await moveBooking(booking, start, { by });
      return json(o.body, o.status);
    }
    default:
      return json({ error: 'Unknown action' }, 400);
  }
}
