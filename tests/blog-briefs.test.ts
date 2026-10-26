import { describe, expect, it } from 'vitest';
import { BLOG_BRIEFS } from '@/lib/blog/briefs';
import { sanitizeArticleHtml } from '@/lib/blog/cms-article-template';
import { BLOG_SYSTEM, blogUserMessage } from '@/lib/blog/prompt';

describe('blog briefs and prompt', () => {
  it('has fifteen distinct, complete briefs', () => {
    expect(BLOG_BRIEFS).toHaveLength(15);
    expect(new Set(BLOG_BRIEFS.map((b) => b.id)).size).toBe(15);
    for (const b of BLOG_BRIEFS) {
      expect(b.title.length).toBeGreaterThan(10);
      expect(b.keyword).toBeTruthy();
      expect(b.brief.length).toBeGreaterThan(200);
    }
  });

  it('keeps headings, lists and tables but strips attributes and scripts', () => {
    const out = sanitizeArticleHtml(
      '<h2 class="x">Size</h2><table style="x"><thead><tr><th>kWp</th></tr></thead><tbody><tr><td>4</td></tr></tbody></table><ul><li>a</li></ul><script>alert(1)</script><img src="x">',
    );
    expect(out).toContain('<h2>Size</h2>');
    expect(out).toContain('<table><thead><tr><th>kWp</th>');
    expect(out).toContain('<ul><li>a</li></ul>');
    expect(out).not.toMatch(/script|img|class|style/i);
  });

  it('asks for the answer first, FAQs and editor notes, and carries the brief', () => {
    expect(BLOG_SYSTEM).toMatch(/Answer first/);
    expect(BLOG_SYSTEM).toMatch(/Frequently asked questions/);
    expect(BLOG_SYSTEM).toMatch(/editorNotes/);
    expect(blogUserMessage({ prompt: 'Topic X', keyword: 'solar Wales' })).toMatch(/Topic X[\s\S]*solar Wales/);
  });
});
