import { Phase, PageHead } from '../common';

export default function Plan() {
  return (
    <>
      <PageHead title="Plan" sub="Which pages to build or improve, scored and queued." />
      <Phase phase={3} what="The opportunity planner (M3): every keyword source grouped by SERP overlap (one page per group, never a page per variation), mapped to Improve, Create or Hold, and scored by volume × position gain × intent × proof ÷ difficulty, with the formula on screen." />
    </>
  );
}
