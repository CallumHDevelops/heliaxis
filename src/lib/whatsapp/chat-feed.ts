import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ChatCursor, ChatMessage, ChatReader } from '@/lib/projects/feed';

/**
 * Latest notes' WhatsApp rows, read from whatsapp_messages (the rules are readChatDays in
 * src/lib/projects/feed.ts). Newest first by time and then id, so a run of messages sent in the same
 * minute (imported chats are to the minute) is never split between two reads.
 * supabase/whatsapp-feed-index.sql makes these quick once there are lots of messages (optional).
 */

const COLS = 'id, enquiry_id, direction, kind, sent_by, rule_id, via, created_at';
const BATCH = 100;
/** The most of one day's messages read to count it (more than any day has). */
const REST_MAX = 5000;

const chunks = <T>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / BATCH) }, (_, i) => xs.slice(i * BATCH, i * BATCH + BATCH));
/** After `c` in newest-first order (database times as they came back, so nothing is rounded). */
const pastCursor = (c: ChatCursor) => `created_at.lt."${c.at}",and(created_at.eq."${c.at}",id.lt.${c.id})`;

/** `mine`: only messages this person sent (Latest notes' Mine). */
export function chatReader(mine: string | null): ChatReader {
  const db = createAdminClient();
  const base = (cols = COLS) => {
    const q = db.from('whatsapp_messages').select(cols);
    return mine ? q.eq('sent_by', mine) : q;
  };
  return {
    async page({ before, cursor, limit }) {
      let q = base();
      if (before) q = q.lte('created_at', before);
      if (cursor) q = q.or(pastCursor(cursor));
      const { data, error } = await q.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ChatMessage[];
    },
    async rest(enquiryIds, from, cursor) {
      const parts = await Promise.all(
        chunks(enquiryIds).map(async (ids) => {
          const { data } = await base()
            .in('enquiry_id', ids)
            .gte('created_at', from)
            .or(pastCursor(cursor))
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .limit(REST_MAX);
          return (data ?? []) as unknown as ChatMessage[];
        })
      );
      return parts.flat();
    },
    async busy(enquiryIds, after, to) {
      const parts = await Promise.all(
        chunks(enquiryIds).map(async (ids) => {
          const { data } = await base('enquiry_id').in('enquiry_id', ids).gt('created_at', after).lt('created_at', to).limit(1000);
          return ((data ?? []) as unknown as { enquiry_id: string }[]).map((m) => m.enquiry_id);
        })
      );
      return new Set(parts.flat());
    },
  };
}

/** The text of these messages, by id. */
export async function messageBodies(ids: string[]): Promise<Map<string, string | null>> {
  const db = createAdminClient();
  const parts = await Promise.all(
    chunks([...new Set(ids)]).map(async (batch) => {
      const { data } = await db.from('whatsapp_messages').select('id, body').in('id', batch);
      return (data ?? []) as { id: string; body: string | null }[];
    })
  );
  return new Map(parts.flat().map((m) => [m.id, m.body]));
}
