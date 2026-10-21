import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import { PublicTrackers } from "@/components/analytics/PublicTrackers";
import { ThemeSync } from "@/components/theme/ThemeSync";
import { SELF_ROUTE_SCRIPT } from "@/lib/theme/routes";
import { themeContext, themeViewport } from "@/lib/theme/server";
import { BOOT_SCRIPT } from "@/lib/theme/shared";
import "./globals.css";
import "./theme.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://heliaxis.co.uk"),
  // The staff pages swap in /admin.webmanifest (src/app/admin/layout.tsx).
  manifest: "/manifest.json",
  title: {
    default: "Heliaxis | Renewable Energy Solutions Wales & South West England",
    template: "%s | Heliaxis",
  },
  description:
    "Heliaxis delivers renewable energy solutions for homes, businesses, local authorities and public sector organisations across Wales and the South West of England. Solar PV, battery storage, infrared heating, and LED lighting.",
  keywords: [
    "renewable energy Wales",
    "solar panels Wales",
    "battery storage",
    "solar PV installation",
    "infrared heating",
    "LED lighting",
    "decarbonisation",
    "energy efficiency",
    "commercial solar",
    "residential solar",
    "housing association energy",
    "public sector renewable energy",
    "Feed-in Tariff",
    "Smart Export Guarantee",
    "SEG Wales",
  ],
  authors: [{ name: "Heliaxis" }],
  creator: "Heliaxis",
  publisher: "Heliaxis",
  openGraph: {
    type: "website",
    locale: "en_GB",
    url: "https://heliaxis.co.uk",
    siteName: "Heliaxis",
    title: "Heliaxis | Renewable Energy Solutions Wales & South West England",
    description:
      "Energy That Revolves Around You. Delivering renewable energy solutions for homes, businesses and public sector organisations across Wales and the South West of England.",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Heliaxis Renewable Energy Solutions",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Heliaxis | Renewable Energy Solutions",
    description:
      "Energy That Revolves Around You. Delivering renewable energy solutions for homes, businesses and public sector organisations.",
    images: ["/og-image.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    google: "your-google-verification-code",
  },
};

/**
 * color-scheme and theme-color for this page and the person's Light / Dark / Match phone choice
 * (src/lib/theme). The public website keeps its navy theme-color and declares no scheme, as before.
 */
export async function generateViewport(): Promise<Viewport> {
  return themeViewport();
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Themed pages (staff app, trades, customers, sign-in) carry the theme on <html>, rendered from the
  // cookies and corrected before first paint by BOOT_SCRIPT. suppressHydrationWarning covers only
  // <html>'s own attributes, which that script may change before React hydrates. A page built ahead
  // of time (route undefined: the site app's home and shell) works out its own from the address first.
  const t = await themeContext();
  const route = t.route;
  const boot = route ? BOOT_SCRIPT : route === undefined ? SELF_ROUTE_SCRIPT + BOOT_SCRIPT : null;
  return (
    <html
      lang="en-GB"
      suppressHydrationWarning
      data-theme-scope={route?.scope}
      data-theme={route ? t.resolved : undefined}
      data-theme-pref={route ? t.pref : undefined}
      data-bar={route ? `${route.bar[0]} ${route.bar[1]}` : undefined}
    >
      <head>
        {boot && <script dangerouslySetInnerHTML={{ __html: boot }} />}
        <link rel="icon" href="/assets/favicon.png" type="image/png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="geo.region" content="GB-WLS" />
        <meta name="geo.placename" content="Wales" />
      </head>
      <body className={`${outfit.variable} font-sans antialiased`}>
        {boot && <ThemeSync />}
        <PublicTrackers />

        {children}
      </body>
    </html>
  );
}
