'use client';

import { useEffect } from 'react';
import { captureNativeFromUrl } from '@/lib/push-client';

/**
 * On the sign-in page: keep the Android app's token from the address (it arrives with the first
 * launch, which lands here when signed out), so AppRuntime can register it after sign-in.
 */
export function NativePushCapture() {
  useEffect(() => {
    captureNativeFromUrl();
  }, []);
  return null;
}
