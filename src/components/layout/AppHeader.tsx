'use client';

import { Bookmark, LogOut, Map as MapIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Menu, MenuItem, MenuLabel } from '@/components/ui/Menu';

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="logo" aria-label="TripCanvas — My Trips">
      <svg width="28" height="28" viewBox="0 0 64 64" aria-hidden>
        <rect width="64" height="64" rx="16" fill="#1f4d3a" />
        <path d="M14 44c8-2 10-14 18-16s12 6 18-4" fill="none" stroke="#f6f3ec" strokeWidth="4.5" strokeLinecap="round" strokeDasharray="0.1 8.5" />
        <circle cx="14" cy="44" r="5" fill="#f6f3ec" />
        <path d="M50 14c-5.5 0-9 4-9 8.6 0 6 9 13.4 9 13.4s9-7.4 9-13.4c0-4.6-3.5-8.6-9-8.6z" fill="#e07a4e" />
        <circle cx="50" cy="22.5" r="3.2" fill="#1f4d3a" />
      </svg>
      {compact ? null : <span>TripCanvas</span>}
    </Link>
  );
}

const NAV = [
  { href: '/', label: 'My Trips', icon: MapIcon, match: (path: string) => path === '/' || path.startsWith('/trips') },
  { href: '/places', label: 'Saved Places', icon: Bookmark, match: (path: string) => path.startsWith('/places') },
];

/** Top bar for My Trips and Saved Places. The trip planner has its own header. */
export function AppHeader({ user, actions }: { user: { name: string; email: string }; actions?: ReactNode }) {
  const pathname = usePathname() ?? '/';
  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Logo />
        <nav className="app-nav" aria-label="Main">
          {NAV.map(({ href, label, icon: Icon, match }) => (
            <Link key={href} href={href} className="app-nav-link" aria-current={match(pathname) ? 'page' : undefined}>
              <Icon size={17} aria-hidden /> <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="spacer" />
        {actions}
        <UserMenu user={user} />
      </div>
    </header>
  );
}

/** Clears offline copies and unsent edits from this device, then signs out. */
export async function signOut() {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith('tripcanvas.')) localStorage.removeItem(key);
  } catch { /* storage unavailable */ }
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('tc-')).map((key) => caches.delete(key)));
  } catch { /* Cache API unavailable */ }
  window.location.href = '/signout-with-chatgpt?return_to=/';
}

export function UserMenu({ user }: { user: { name: string; email: string } }) {
  const initials = user.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2) || 'T';
  return (
    <Menu label="Account" trigger={<button type="button" className="avatar-btn" aria-label={`Account: ${user.name}`}><span className="avatar">{initials}</span></button>}>
      <MenuLabel>{user.email}</MenuLabel>
      <MenuItem icon={<LogOut size={16} />} onSelect={() => void signOut()}>Sign out</MenuItem>
    </Menu>
  );
}
