'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { getSessionProfile } from '@/lib/auth';
import { deleteBuild, saveBuild } from '@/lib/builds-server';
import type { BuildItem } from '@/lib/builds';

const guard = async () => {
  const { user, profile } = await getSessionProfile();
  if (!user || profile?.status !== 'approved' || profile.role !== 'admin') throw new Error('Only an admin can change the build tracker.');
};

/** Save a build (a new one when it has no id yet). */
export async function save(item: Partial<BuildItem>): Promise<{ ok: true; item: BuildItem } | { ok: false; error: string }> {
  try {
    await guard();
    const saved = await saveBuild({ ...item, id: item.id || randomUUID() });
    revalidatePath('/admin/builds');
    return { ok: true, item: saved };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Couldn’t save it.' };
  }
}

export async function remove(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await guard();
    await deleteBuild(id);
    revalidatePath('/admin/builds');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Couldn’t delete it.' };
  }
}
