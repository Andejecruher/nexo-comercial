import { AppProviders } from '@/components/shared/providers/app-providers';
import { brandChrome, buildOpenGraph, buildTwitter, siteConfig } from '@/lib/shared/seo';
import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';

const montserrat = localFont({
  src: './fonts/montserrat-latin-variable.woff2',
  variable: '--font-montserrat',
  weight: '100 900',
  display: 'swap',
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.baseUrl),

  title: {
    template: '%s | Nexo Comercial',
    default: siteConfig.defaultTitle,
  },
  description: siteConfig.defaultDescription,
  keywords: ['Nexo Comercial'],
  authors: [{ name: siteConfig.siteName, url: siteConfig.baseUrl }],
  creator: siteConfig.siteName,
  publisher: siteConfig.siteName,

  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },

  openGraph: buildOpenGraph({
    title: siteConfig.defaultTitle,
    description: siteConfig.defaultDescription,
    path: '/',
  }),

  twitter: buildTwitter({
    title: siteConfig.defaultTitle,
    description: siteConfig.defaultDescription,
  }),

  alternates: {
    canonical: siteConfig.baseUrl,
  },

  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: '/apple-icon.png',
  },

  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: brandChrome.themeColor },
    { media: '(prefers-color-scheme: dark)', color: brandChrome.themeColorDarkScheme },
  ],
  colorScheme: 'light',
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Nexo Comercial',
  url: siteConfig.baseUrl,
  description: siteConfig.defaultDescription,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className="bg-background"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        <meta charSet="utf-8" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="msapplication-TileColor" content={brandChrome.themeColor} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={`${montserrat.variable} font-sans antialiased`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
