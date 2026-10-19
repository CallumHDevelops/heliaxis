import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Answers to Claude's questions, typed into the "From Claude" card. Claude can't see this
 * database, but it can read GitHub, so each answer is also posted as a comment on one
 * "Answers for Claude" issue in the repo (needs GITHUB_ANSWERS_TOKEN: a fine-grained token with
 * Issues read & write on that repo). Answers are kept here too, in cms_kv 'setup-answers', which
 * only the server writes.
 */

const ANSWERS_KEY = 'setup-answers';
const ISSUE_KEY = 'claude-answers-issue';
const repo = () => process.env.GITHUB_ANSWERS_REPO || 'CallumHDevelops/heliaxis';
export const answersConfigured = () => !!process.env.GITHUB_ANSWERS_TOKEN;

export type SavedAnswer = { text: string; name: string; at: string; sent: boolean; url?: string };

async function gh<T>(path: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; data: T | null }> {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${process.env.GITHUB_ANSWERS_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });
  return { ok: res.ok, status: res.status, data: (await res.json().catch(() => null)) as T | null };
}

/** Public repos make the answer public too, so the card asks first. */
export async function answersArePublic(): Promise<boolean> {
  if (!answersConfigured()) return false;
  const r = await gh<{ private?: boolean }>(`/repos/${repo()}`);
  return !(r.ok && r.data?.private === true);
}

export async function savedAnswers(): Promise<Record<string, SavedAnswer>> {
  const { data } = await createAdminClient().from('cms_kv').select('value').eq('key', ANSWERS_KEY).maybeSingle();
  try {
    const v = JSON.parse(data?.value || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

async function kvSet(key: string, value: string) {
  const { error } = await createAdminClient().from('cms_kv').upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

/** The open "Answers for Claude" issue, made the first time. */
async function answersIssue(): Promise<number | null> {
  const { data } = await createAdminClient().from('cms_kv').select('value').eq('key', ISSUE_KEY).maybeSingle();
  const known = Number(data?.value);
  if (known) {
    const r = await gh<{ state?: string }>(`/repos/${repo()}/issues/${known}`);
    if (r.ok && r.data?.state === 'open') return known;
  }
  const made = await gh<{ number?: number }>(`/repos/${repo()}/issues`, {
    method: 'POST',
    body: JSON.stringify({
      title: 'Answers for Claude',
      body: 'Answers typed into the Heliaxis admin (the “From Claude” card on the dashboard). Claude reads this issue. Each comment is one answer.',
    }),
  });
  if (!made.ok || !made.data?.number) return null;
  await kvSet(ISSUE_KEY, String(made.data.number));
  return made.data.number;
}

/** "@someone" would ping a GitHub user; a zero-width space stops that. */
const quiet = (s: string) => s.replace(/@(?=\w)/g, '@​');

/** Save an answer and post it where Claude can read it. */
export async function saveAnswer(p: { id: string; question: string; text: string; name: string }): Promise<SavedAnswer> {
  const at = new Date().toISOString();
  let sent = false;
  let url: string | undefined;
  if (answersConfigured()) {
    const issue = await answersIssue();
    if (issue) {
      const quoted = quiet(p.text)
        .split('\n')
        .map((l) => `> ${l}`)
        .join('\n');
      const body = `### ${quiet(p.question)}\nTo-do \`${p.id}\` · answered by ${quiet(p.name)}, ${at.slice(0, 16).replace('T', ' ')} UTC\n\n${quoted}`;
      const r = await gh<{ html_url?: string }>(`/repos/${repo()}/issues/${issue}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      });
      sent = r.ok;
      url = r.data?.html_url;
    }
  }
  const all = await savedAnswers();
  const saved: SavedAnswer = { text: p.text, name: p.name, at, sent, url };
  all[p.id] = saved;
  await kvSet(ANSWERS_KEY, JSON.stringify(all));
  return saved;
}
