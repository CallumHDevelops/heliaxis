/** Validates a smart reply from the editor. Partial = PATCH (only the fields sent). */
export function cleanRule(b: Record<string, unknown>, partial = false) {
  const out: Record<string, unknown> = {};
  if (!partial || 'name' in b) {
    const name = String(b.name ?? '').trim();
    if (!name) return { error: 'Give the reply a name.' };
    out.name = name.slice(0, 80);
  }
  if (!partial || 'keywords' in b) {
    const raw = Array.isArray(b.keywords) ? b.keywords : String(b.keywords ?? '').split(',');
    const keywords = [...new Set(raw.map((k) => String(k).trim().toLowerCase()).filter(Boolean))].slice(0, 30);
    if (!keywords.length) return { error: 'Add at least one keyword.' };
    out.keywords = keywords;
  }
  if (!partial || 'reply' in b) {
    const reply = String(b.reply ?? '').trim();
    if (!reply) return { error: 'Write the reply.' };
    if (reply.length > 4096) return { error: 'Replies are limited to 4,096 characters.' };
    out.reply = reply;
  }
  if ('enabled' in b) out.enabled = !!b.enabled;
  if ('priority' in b) out.priority = Math.round(Number(b.priority) || 0);
  if (!partial || 'delay_min_seconds' in b || 'delay_max_seconds' in b) {
    const min = Math.round(Number(b.delay_min_seconds ?? 240));
    const max = Math.round(Number(b.delay_max_seconds ?? 300));
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < 0 || max > 3 * 3600) {
      return { error: 'Delays must be between 0 seconds and 3 hours.' };
    }
    out.delay_min_seconds = Math.min(min, max);
    out.delay_max_seconds = Math.max(min, max);
  }
  if ('follow_up_hours' in b) {
    const h = b.follow_up_hours === null || b.follow_up_hours === '' ? null : Number(b.follow_up_hours);
    if (h !== null && (!Number.isFinite(h) || h < 0.25 || h > 14 * 24)) return { error: 'Chase after 15 minutes to 14 days, or leave it blank.' };
    out.follow_up_hours = h;
  }
  if ('follow_up_text' in b) out.follow_up_text = String(b.follow_up_text ?? '').trim().slice(0, 1000) || null;
  if (partial) out.updated_at = new Date().toISOString();
  return out;
}
