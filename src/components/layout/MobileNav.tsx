'use client';

import { Bookmark, Map as MapIcon, Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Bottom navigation for phones on the top-level pages. */
export function MobileNav() {
  const pathname = usePathname() ?? '/';
  return (
    <nav className="mobile-nav" aria-label="Main">
      <Link href="/" aria-current={pathname === '/' ? 'page' : undefined}><MapIcon size={21} aria-hidden />My Trips</Link>
      <Link href="/trips/new" aria-current={pathname === '/trips/new' ? 'page' : undefined}><Plus size={21} aria-hidden />New trip</Link>
      <Link href="/places" aria-current={pathname.startsWith('/places') ? 'page' : undefined}><Bookmark size={21} aria-hidden />Saved</Link>
    </nav>
  );
}
