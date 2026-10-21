'use client';

import type { SitePack } from '@/lib/site/pack-shared';
import type { Answers } from '@/lib/site/types';

/** "Roof checks · 4 of 9" for a job card, from its form and the answers on this phone. Null until the job has a form. */
export const jobProgress: (pack: SitePack, answers: Answers) => string | null = () => null;
