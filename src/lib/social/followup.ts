import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { ukDate } from './insights/collect';

const MARK = 'Follow-up task created';

/**
 * A quote-request comment gets a "Follow up" task and a note, once. The commenter is NOT turned into a CRM
 * customer (they only commented): the task just makes sure someone sends them the quote form or booking link,
 * using the suggested reply. Never throws.
 */
export async function createQuoteFollowUp(m: { id: string; platform: string; author_display_name: string | null; text: string }): Promise<boolean> {
  try {
    const db = createAdminClient();
    const { data: done } = await db.from('social_note').select('id').eq('mention_id', m.id).like('text', `${MARK}%`).limit(1);
    if (done?.length) return false;
    const who = m.author_display_name || 'someone';
    const title = `Follow up: ${who} asked for a quote on ${m.platform[0].toUpperCase()}${m.platform.slice(1)}`;
    const excerpt = m.text.replace(/\s+/g, ' ').slice(0, 160);
    const { error } = await db.from('tasks').insert({
      title,
      notes: `They commented: “${excerpt}”\nReview and copy the suggested reply, which points them to the quote form or booking link: /admin/social/review/${m.id}`,
      due_date: ukDate(),
      priority: 'high',
    });
    if (error) return false;
    await db.from('social_note').insert({ mention_id: m.id, text: `${MARK}: “${title}”. They have not been added as a customer.` });
    return true;
  } catch {
    return false;
  }
}
