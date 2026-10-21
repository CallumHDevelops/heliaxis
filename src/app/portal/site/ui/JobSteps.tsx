'use client';

import type { PackRecord } from '@/lib/site/offline';
import type { Answers } from '@/lib/site/types';

/**
 * The job's form on the job screen: "16 questions, 9 photos, about 10 minutes", the step list with
 * progress and ticks, What's left, and (with `rest`, /portal/site/job/<id>/<step>) a step's own
 * screen. The forms engine draws these (1G); a job with no form yet shows nothing here.
 */
export const JobSteps: (props: { rec: PackRecord; answers: Answers; rest: string[] }) => React.ReactNode = () => null;
