import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { Hanken_Grotesk, JetBrains_Mono } from 'next/font/google';
import PWARegister from '@/components/PWARegister';
import './globals.css';

// Self-hosted Ezra. Drop the .otf files into /fonts (see fonts/README.txt).
const ezra = localFont({
  src: [
    { path: '../fonts/Ezra_Black.otf', weight: '900', style: 'normal' },
    { path: '../fonts/Ezra_ExtraBold.otf', weight: '800', style: 'normal' },
    { path: '../fonts/Ezra_Bold.otf', weight: '700', style: 'normal' },
    { path: '../fonts/Ezra_Medium.otf', weight: '500', style: 'normal' },
  ],
  variable: '--font-ezra',
  display: 'swap',
});

const hanken = Hanken_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Heliaxis · Post Studio',
  description: 'On-brand social posts & reels for Heliaxis.',
  robots: { index: false, follow: false },
  applicationName: 'Post Studio',
  appleWebApp: {
    capable: true,
    title: 'Post Studio',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#211F18',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${ezra.variable} ${hanken.variable} ${mono.variable}`}>
      <body>
        {children}
        <PWARegister />
      </body>
    </html>
  );
}
