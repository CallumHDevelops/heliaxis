'use client';

import { useEffect } from 'react';
import { initCmsFormRuntime } from '@/lib/cms-form-runtime';

/** Binds sector/interest tiles + enquiry submit for published CMS HTML. */
export function CmsFormRuntime() {
  useEffect(() => {
    initCmsFormRuntime();
  }, []);
  return null;
}
