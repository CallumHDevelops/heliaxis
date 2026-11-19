import Link from 'next/link';
import { Phase, PageHead } from '../common';

export default function Competitors() {
  return (
    <>
      <PageHead title="Competitors" sub="What the top 10 do to rank, and where we fall short." />
      <Phase phase={2} what="The SERP teardown (M2): page facts for every top-10 result, Business Profile strength for every map-pack business, a “What it takes” card per search built only from stored facts, and a page per rival domain.">
        <p className="sx-note">
          Until then, the top 100 for each search is in <Link href="/admin/search/rankings">Rankings</Link>, and the old competitor write-up is on the <Link href="/admin/analytics/seo">SEO report</Link>.
        </p>
      </Phase>
    </>
  );
}
