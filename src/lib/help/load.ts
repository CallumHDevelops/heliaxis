import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { assemble, isHelpSlug, parseArticle, parseSection, type HelpLibrary, type HelpSection } from './parse';

/**
 * Reads the Help content from disk: <root>/<section>/_section.md and <root>/<section>/<slug>.md. Only
 * names that are lower-case-with-hyphens are read, and only from inside `root`. What's wrong with a file is
 * listed in `problems` (scripts/test-help.mjs fails on any); the app leaves out an article it can't read.
 * On Vercel the files are bundled with the pages that read them (outputFileTracingIncludes, next.config.ts).
 */
export function loadHelp(root: string, icons: readonly string[] | null = null): HelpLibrary {
  const problems: string[] = [];
  const sections: HelpSection[] = [];
  if (!existsSync(root)) return { sections, problems };
  for (const key of readdirSync(root).sort()) {
    const dir = path.join(root, key);
    if (key.startsWith('.') || !statSync(dir).isDirectory()) continue;
    if (!isHelpSlug(key)) {
      problems.push(`${key}/: a section folder is lower-case words joined by hyphens`);
      continue;
    }
    const sectionFile = path.join(dir, '_section.md');
    const s = parseSection(key, existsSync(sectionFile) ? readFileSync(sectionFile, 'utf8') : null, icons);
    for (const p of s.problems) problems.push(`${key}/_section.md: ${p}`);
    const section: HelpSection = { ...s.section, articles: [] };
    for (const file of readdirSync(dir).sort()) {
      if (file === '_section.md' || file.startsWith('.')) continue;
      const slug = file.replace(/\.md$/, '');
      if (!file.endsWith('.md') || !isHelpSlug(slug)) {
        problems.push(`${key}/${file}: not an article (articles are <lower-case-with-hyphens>.md; pictures go in public/help/${key}/)`);
        continue;
      }
      const a = parseArticle(key, slug, readFileSync(path.join(dir, file), 'utf8'));
      for (const p of a.problems) problems.push(`${key}/${file}: ${p}`);
      // Readable enough to show: a title and some body. The rest is the test's job.
      if (a.article.body.trim()) section.articles.push(a.article);
    }
    sections.push(section);
  }
  return assemble(sections, problems);
}
