import type { Metadata, Viewport } from 'next';
import { Hanken_Grotesk, JetBrains_Mono, Outfit } from 'next/font/google';
import './globals.css';

const body = Hanken_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-hanken',
  display: 'swap',
});

// Display face, matching heliaxis.co.uk. The brand spec specifies Ezra; swap
// this for next/font/local once the Ezra family is added to src/fonts/.
const display = Outfit({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800', '900'],
  variable: '--font-outfit',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Heliaxis RAMS',
    template: '%s · Heliaxis RAMS',
  },
  description:
    'Risk Assessments and Method Statements for Heliaxis renewable energy installations.',
  robots: { index: false, follow: false },
  icons: { icon: '/brand/spark.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#211F18',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${body.variable} ${display.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
