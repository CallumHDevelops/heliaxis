/** Plain branded page for "link not found", "too many requests" and opt-out. Server-safe. */
import type { ReactNode } from 'react';
import { Wordmark } from '@/components/prospectpv/brand/Spark';
import { LANDING_CSS } from './landingCss';

export function SimplePage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="pvl">
      <style dangerouslySetInnerHTML={{ __html: LANDING_CSS }} />
      <div className="pvl-center">
        <Wordmark size={18} />
        <h1>{title}</h1>
        {children}
      </div>
    </div>
  );
}

/** Deliberately generic: never confirms whether a code exists. */
export function LinkNotFound({ phone }: { phone?: string | null }) {
  return (
    <SimplePage title="This link isn’t working">
      <p>It may have expired, or there may be a typo in the address. Check the web address printed on your letter.</p>
      {phone ? (
        <p>
          You can also call us on <a href={`tel:${phone.replace(/\s/g, '')}`}>{phone}</a> and we’ll help.
        </p>
      ) : null}
    </SimplePage>
  );
}

export function TooManyRequests() {
  return (
    <SimplePage title="Please try again in a minute">
      <p>We’ve had a lot of requests from your connection. Wait a minute, then refresh the page.</p>
    </SimplePage>
  );
}
