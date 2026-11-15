import { describe, expect, it } from 'vitest';
import { cmsArticleAiSchema } from '@/lib/blog/cms-article-template';
import { BLOG_DRAFTS } from '@/content/blog-drafts';

const text = (a: (typeof BLOG_DRAFTS)[number]) => [a.title, a.headline, a.sub, a.introText, a.bodyHtml1, a.bodyHtml2, a.ctaHeadline, a.ctaSub, a.homeDesc, a.businessDesc, ...a.homeBullets, ...a.businessBullets].join(' ');
const words = (html: string) => html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
const ALLOWED = ['/book-a-survey', '/book-a-call', '/get-a-quote', '/free-solar-quote', '/solar-estimator', '/commercial-funding'];

describe('the written blog articles', () => {
  it('there is a good number of them', () => {
    expect(BLOG_DRAFTS.length).toBeGreaterThanOrEqual(12);
  });
  it('slugs are unique', () => {
    const slugs = BLOG_DRAFTS.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
  for (const a of BLOG_DRAFTS) {
    describe(a.slug, () => {
      it('fits the article template', () => {
        expect(() => cmsArticleAiSchema.parse(a)).not.toThrow();
      });
      it('is long enough to be useful', () => {
        expect(words(a.bodyHtml1) + words(a.bodyHtml2)).toBeGreaterThan(590);
      });
      it('has FAQs and button rows, and links only to real pages', () => {
        expect((a.bodyHtml2.match(/<h3>/g) ?? []).length).toBeGreaterThanOrEqual(5);
        expect((a.bodyHtml1 + a.bodyHtml2).match(/data-button=/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
        for (const m of (a.bodyHtml1 + a.bodyHtml2).matchAll(/href="([^"]+)"/g)) expect(ALLOWED).toContain(m[1]);
      });
      it('makes no claim the company cannot make', () => {
        const t = text(a);
        expect(t).not.toMatch(/NICEIC|award-winning|rated (?:excellent|5)|years of experience|thousands of (?:happy )?customers|guaranteed savings/i);
        expect(t).not.toMatch(/revolutionary|game.?chang|cutting.edge|seamless|in today's fast/i);
        expect(t).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
      });
      it('says where it has been careful, for a person to check', () => {
        expect(a.editorNotes?.length ?? 0).toBeGreaterThan(0);
      });
    });
  }
});
