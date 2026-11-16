import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { Hanken_Grotesk, JetBrains_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import './studio-base.css';

// Post Studio's own faces: Ezra for the posts and headings, Hanken Grotesk and JetBrains Mono for the tool itself.
const ezra = localFont({
  src: [
    { path: './fonts/Ezra_Black.otf', weight: '900', style: 'normal' },
    { path: './fonts/Ezra_ExtraBold.otf', weight: '800', style: 'normal' },
    { path: './fonts/Ezra_Bold.otf', weight: '700', style: 'normal' },
    { path: './fonts/Ezra_Medium.otf', weight: '500', style: 'normal' },
  ],
  variable: '--font-ezra',
  display: 'swap',
});
const hanken = Hanken_Grotesk({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-body', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = { title: 'Post Studio', robots: { index: false, follow: false } };

export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`hx-studio ${ezra.variable} ${hanken.variable} ${mono.variable}`}>
      {/* The brand faces the "My Brand" kit offers (the canvas uses the literal family names). */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Poppins:wght@700;800;900&family=Montserrat:wght@700;800;900&family=Playfair+Display:wght@700;800;900&family=Oswald:wght@600;700&family=Bebas+Neue&family=Inter:wght@400;500;600&family=Roboto:wght@400;500;700&family=Work+Sans:wght@400;500;600&display=swap"
      />
      {children}
    </div>
  );
}
