import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { ConditionalChrome } from "@/components/ConditionalChrome";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://heliaxis.co.uk"),
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-GB">
      <head>
        <link rel="icon" href="/assets/favicon.png" type="image/png" />
        <link rel="apple-touch-icon" href="/assets/favicon.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#16222F" />
        <meta name="geo.region" content="GB-WLS" />
        <meta name="geo.placename" content="Wales" />
      </head>
      <body className={`${outfit.variable} font-sans antialiased`}>
        {/* Google Analytics */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-6LLJCP5HG6"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-6LLJCP5HG6');
          `}
        </Script>

        <ConditionalChrome>
          <Navigation />
        </ConditionalChrome>
        <main className="min-h-screen">{children}</main>
        <ConditionalChrome>
          <Footer />
        </ConditionalChrome>
      </body>
    </html>
  );
}
