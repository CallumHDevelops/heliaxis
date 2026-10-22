import type { Metadata } from 'next';
import { ThemeChoice } from '@/components/theme/ThemeChoice';
import { themeContext } from '@/lib/theme/server';
import { CheckView } from './CheckView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Light and dark check',
  robots: { index: false, follow: false },
};

/** Opened on a phone to see whether its browser darkens our Light pages (no sign-in). */
export default async function ThemeCheckPage() {
  const { pref } = await themeContext();

  return (
    <main className="tc">
      <div className="tc-card">
        <h1>Light and dark check</h1>
        <p className="tc-lede">Tap Light, then screenshot this page and send it over.</p>
        <ThemeChoice serverPref={pref} />
        <CheckView />
      </div>

      <style>{`
        .tc { min-height: 100vh; display: grid; place-items: center; padding: 24px 16px; box-sizing: border-box;
          background: var(--bg); color: var(--text); font-family: 'Segoe UI', system-ui, sans-serif; }
        .tc-card { width: 100%; max-width: 440px; background: var(--surface); border: 1px solid var(--border); border-radius: 6px;
          padding: 24px 20px; box-sizing: border-box; display: grid; gap: 14px; }
        .tc h1 { font-size: 1.3rem; line-height: 1.25; margin: 0; }
        .tc-lede, .tc-wait { color: var(--muted); line-height: 1.5; margin: 0; }
        .tc-verdict { margin: 0; padding: 12px 14px; border-radius: 4px; font-weight: 700; line-height: 1.45; border: 1px solid var(--border); }
        .tc-verdict--bad { border-color: currentColor; }
        .tc-swatch { padding: 14px; border-radius: 4px; background: var(--bg); color: var(--text); border: 1px solid var(--border); font-size: .9rem; }
        .tc-lines { margin: 0; padding: 0 0 0 18px; font-size: .78rem; line-height: 1.5; color: var(--text-2); overflow-wrap: anywhere; }
        .tc-copy { justify-self: start; font: inherit; font-weight: 700; padding: 10px 14px; border-radius: 3px;
          border: 1px solid var(--border); background: var(--bg); color: var(--text); }
      `}</style>
    </main>
  );
}
