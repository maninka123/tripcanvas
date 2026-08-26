import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://roamly-travel-planner.pasinduranasinghe123.chatgpt.site'),
  title: 'Roamly — Visual travel planning',
  description: 'A beautiful visual workspace where every part of your journey stays connected.',
  openGraph: {
    title: 'Roamly — Visual travel planning',
    description: 'Every journey, beautifully connected.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Roamly — Every journey, beautifully connected.' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Roamly — Visual travel planning',
    description: 'Every journey, beautifully connected.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
