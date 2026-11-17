import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseKv, toKv } from '@/lib/kv-json';
import { cleanBuild, starterBuilds, type BuildItem } from './builds';

const KEY = 'build-tracker';
type Db = ReturnType<typeof createAdminClient>;

/** Every build, newest change first. The first read ever fills it with the work in hand (starterBuilds). */
export async function readBuilds(db: Db = createAdminClient()): Promise<BuildItem[]> {
  const { data } = await db.from('cms_kv').select('value').eq('key', KEY).maybeSingle();
  if (!data) {
    const items = starterBuilds();
    await writeBuilds(items, db);
    return items;
  }
  const v = parseKv<{ items?: BuildItem[] }>(data.value);
  return (Array.isArray(v.items) ? v.items : []).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function writeBuilds(items: BuildItem[], db: Db) {
  const { error } = await db.from('cms_kv').upsert({ key: KEY, value: toKv({ items: items.slice(0, 300) }), updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

/** Add or change one build. */
export async function saveBuild(input: Partial<BuildItem> & { id: string }, db: Db = createAdminClient()): Promise<BuildItem> {
  const items = await readBuilds(db);
  const before = items.find((x) => x.id === input.id);
  const item = cleanBuild({ ...before, ...input, createdAt: before?.createdAt });
  await writeBuilds([item, ...items.filter((x) => x.id !== item.id)], db);
  return item;
}

export async function deleteBuild(id: string, db: Db = createAdminClient()) {
  const items = await readBuilds(db);
  await writeBuilds(items.filter((x) => x.id !== id), db);
}
