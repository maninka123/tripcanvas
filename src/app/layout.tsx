import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono, Instrument_Serif } from 'next/font/google';
import { ToastProvider } from '@/components/ui/Toast';
import { HydrationMarker } from '@/components/layout/HydrationMarker';
import { TooltipProvider } from '@/components/ui/Menu';
import './globals.css';

const sans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const mono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });
const display = Instrument_Serif({ variable: '--font-display-serif', subsets: ['latin'], weight: '400' });

export const metadata: Metadata = {
  metadataBase: new URL('https://roamly-travel-planner.pasinduranasinghe123.chatgpt.site'),
  title: { default: 'TripCanvas — plan, map and carry your trips', template: '%s · TripCanvas' },
  description: 'Plan a whole journey on one canvas: destinations, day-by-day plans, a live map, transport, stays, budget and bookings — then take it with you.',
  applicationName: 'TripCanvas',
  openGraph: { title: 'TripCanvas', description: 'Your journeys, all in one place.', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'TripCanvas', description: 'Your journeys, all in one place.' },
};

export const viewport: Viewport = {
  themeColor: '#f6f3ec',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${display.variable}`}>
      <body>
        <a className="skip-link" href="#main">Skip to content</a>
        <HydrationMarker />
        <TooltipProvider>
          <ToastProvider>{children}</ToastProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
