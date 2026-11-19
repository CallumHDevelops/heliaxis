import Link from 'next/link';
import { Phase, PageHead } from '../common';

export default function Health() {
  return (
    <>
      <PageHead title="Site health" sub="The weekly site audit, and the checks that decide whether a page can rank at all." />
      <Phase phase={4} what="M7: index checks for the 50 most important pages, sitemap coverage, orphan pages, canonicals, schema validation, mobile Lighthouse and AI crawler access.">
        <p className="sx-note">
          The weekly audit and its title and description proposals still run every Monday at 05:00 (now from the Search dispatcher); see them on the <Link href="/admin/analytics/seo">SEO report</Link>. Crawler access is on the <Link href="/admin/search/settings">setup checklist</Link>.
        </p>
      </Phase>
    </>
  );
}
