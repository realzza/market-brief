import type { Metadata } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "The Market Brief — Multi-Analyst AI Analysis",
  description: "Editorial AI analysis of tracked market voices' commentary",
  // video.twimg.com 403s any cross-site Referer (hotlink protection) but
  // serves requests that send none. `same-origin` keeps the Referer for our
  // own requests and strips it cross-origin, so embedded tweet videos play.
  referrer: "same-origin",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('serenity-theme')||'light';document.documentElement.setAttribute('data-theme',t);document.documentElement.setAttribute('data-density','standard');}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
