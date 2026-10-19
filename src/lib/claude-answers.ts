import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Answers to Claude's questions, typed into the "From Claude" card. Claude can't see this
 * database, but it can read GitHub, so each answer is also posted as a comment on one
 * "Answers for Claude" issue in the repo (needs GITHUB_ANSWERS_TOKEN: a fine-grained token with
 * Issues read & write on that repo). The issue is locked so only repo collaborators can comment;
 * Claude only trusts comments posted by the token's account in this format. Answers are kept here
 * too, in cms_kv 'setup-answers', which only the server writes.
 */

const ANSWERS_KEY = 'setup-answers';
const ISSUE_KEY = 'claude-answers-issue';
const repo = () => process.env.GITHUB_ANSWERS_REPO || 'CallumHDevelops/heliaxis';
export const answersConfigured = () => !!process.env.GITHUB_ANSWERS_TOKEN;

export type SavedAnswer = { text: string; name: string; at: string; sent: boolean; url?: string };
type Gh<T> = { ok: boolean; status: number; data: T | null };

async function gh<T>(path: string, init: RequestInit = {}): Promise<Gh<T>> {
  try {
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
      signal: AbortSignal.timeout(10_000),
    });
    return { ok: res.ok, status: res.status, data: (await res.json().catch(() => null)) as T | null };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

/** What GitHub's answer means, in plain English. */
function githubProblem(status: number): string {
  if (status === 401) return 'GitHub refused the key: it has expired or was copied wrong. Make a new one (Let Claude read the answers you type here).';
  if (status === 403) return 'GitHub says the key isn’t allowed to do that. It needs Issues: Read and write on the heliaxis repo.';
  if (status === 404 || status === 410) return 'GitHub can’t find the repo with that key. Check it has access to heliaxis.';
  return 'GitHub didn’t answer. Try again in a minute.';
}

/** Public repos make the answer public too, so the card asks first. Throws a plain-English problem. */
export async function answersVisibility(): Promise<'public' | 'private' | 'off'> {
  if (!answersConfigured()) return 'off';
  const r = await gh<{ private?: boolean }>(`/repos/${repo()}`);
  if (!r.ok) throw new Error(githubProblem(r.status));
  return r.data?.private === true ? 'private' : 'public';
}

/** For showing on the card: never throws. */
export async function savedAnswers(): Promise<Record<string, SavedAnswer>> {
  return readAnswers().catch(() => ({}));
}

/** Strict read for saving: a failed or unreadable read stops the save rather than wiping answers. */
async function readAnswers(): Promise<Record<string, SavedAnswer>> {
  const { data, error } = await createAdminClient().from('cms_kv').select('value').eq('key', ANSWERS_KEY).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.value) return {};
  const v = JSON.parse(data.value);
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('setup-answers is not readable');
  return v;
}

async function kvSet(key: string, value: string) {
  const { error } = await createAdminClient().from('cms_kv').upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

async function keep(id: string, a: SavedAnswer) {
  const all = await readAnswers();
  all[id] = a;
  await kvSet(ANSWERS_KEY, JSON.stringify(all));
}

/** The open, locked "Answers for Claude" issue (made the first time). Throws on anything unclear. */
async function answersIssue(): Promise<number> {
  const { data, error } = await createAdminClient().from('cms_kv').select('value').eq('key', ISSUE_KEY).maybeSingle();
  if (error) throw new Error('Couldn’t read the saved issue number. Try again.');
  const known = Number(data?.value) || 0;
  if (known) {
    const r = await gh<{ state?: string; locked?: boolean }>(`/repos/${repo()}/issues/${known}`);
    if (r.ok && r.data?.state === 'open') {
      if (!r.data.locked) await gh(`/repos/${repo()}/issues/${known}/lock`, { method: 'PUT', body: '{}' });
      return known;
    }
    // Only a deleted or closed issue means "start a new one"; anything else, try again later.
    if (!(r.ok || r.status === 404 || r.status === 410)) throw new Error(githubProblem(r.status));
  }
  const made = await gh<{ number?: number }>(`/repos/${repo()}/issues`, {
    method: 'POST',
    body: JSON.stringify({
      title: 'Answers for Claude',
      body:
        'Answers typed into the Heliaxis admin (the “From Claude” card on the dashboard), one per comment. ' +
        'This issue is locked: only comments posted by the Heliaxis app’s GitHub account count as answers.',
    }),
  });
  if (!made.ok || !made.data?.number) throw new Error(githubProblem(made.status));
  await gh(`/repos/${repo()}/issues/${made.data.number}/lock`, { method: 'PUT', body: '{}' });
  await kvSet(ISSUE_KEY, String(made.data.number));
  return made.data.number;
}

/** "@someone" would ping a GitHub user; a zero-width space stops that. */
const quiet = (s: string) => s.replace(/@(?=\w)/g, '@​');

/**
 * Save an answer here first, then post it where Claude can read it. Returns whether it reached
 * GitHub; throws a plain-English problem if saving or posting failed.
 */
export async function saveAnswer(p: { id: string; question: string; text: string; name: string }): Promise<SavedAnswer> {
  const at = new Date().toISOString();
  const saved: SavedAnswer = { text: p.text, name: p.name, at, sent: false };
  await keep(p.id, saved);
  if (!answersConfigured()) return saved;

  const issue = await answersIssue();
  const quoted = quiet(p.text)
    .split('\n')
    .map((l) => `> ${l}`)
    .join('\n');
  const who = quiet(p.name.replace(/\s+/g, ' ').trim());
  const body = `### ${quiet(p.question)}\nTo-do \`${p.id}\` · answered by ${who}, ${at.slice(0, 16).replace('T', ' ')} UTC\n\n${quoted}`;
  const r = await gh<{ html_url?: string }>(`/repos/${repo()}/issues/${issue}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
  if (!r.ok) throw new Error(githubProblem(r.status));
  const sent: SavedAnswer = { ...saved, sent: true, url: r.data?.html_url };
  // Claude has it now; a failure recording that here mustn't make anyone send it twice.
  await keep(p.id, sent).catch(() => null);
  return sent;
}
