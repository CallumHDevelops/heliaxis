'use client';

import { useEffect } from 'react';
import { initCmsFormRuntime, initPvFaq } from '@/lib/cms-form-runtime';

/** Binds sector/interest tiles, enquiry submit, and FAQ accordions for published CMS HTML. */
export function CmsFormRuntime() {
  useEffect(() => {
    initCmsFormRuntime();
    initPvFaq();
  }, []);
  return null;
}
