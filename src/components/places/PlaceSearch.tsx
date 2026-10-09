'use client';

import { Building2, Landmark, Link2, MapPin, Mountain, Plus, Search, ShoppingBag, Utensils } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { api } from '@/lib/api-client';
import { parseMapLink } from '@/lib/map-links';
import type { PlaceResult } from '@/services/places';

export type { PlaceResult };

export type ExtraOption = { id: string; label: string; detail?: string; icon?: ReactNode; onSelect: (query: string) => void };

const ICONS: Record<string, typeof MapPin> = { food: Utensils, nature: Mountain, shopping: ShoppingBag, sight: Landmark };

/**
 * Accessible place autocomplete (WAI-ARIA combobox). Results come from the
 * server's place provider; nothing is invented when it has no match. A
 * pasted map link or "lat, lng" is recognised and named by reverse lookup.
 */
export function PlaceSearch({ scope = 'any', near, placeholder, onSelect, extraOptions = [], autoFocus, inline, label = 'Search places', initialQuery = '', footer }: {
  scope?: 'any' | 'locality';
  near?: { lat: number; lng: number } | null;
  placeholder?: string;
  onSelect: (place: PlaceResult) => void;
  extraOptions?: ExtraOption[];
  autoFocus?: boolean;
  inline?: boolean;
  label?: string;
  initialQuery?: string;
  footer?: ReactNode;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [response, setResponse] = useState<{ key: string; results: PlaceResult[]; attribution: string; error: string | null } | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const nearLat = near?.lat;
  const nearLng = near?.lng;

  const link = parseMapLink(query);
  const text = query.trim();
  const searchable = text.length >= 2 && !link;
  const key = `${text}|${scope}|${nearLat ?? ''}|${nearLng ?? ''}`;
  // Results belong to the query they answered, so a stale response is never shown.
  const current = searchable && response?.key === key ? response : null;
  const state: 'idle' | 'loading' | 'done' | 'error' = !searchable ? 'idle' : !current ? 'loading' : current.error ? 'error' : 'done';
  const results = current?.results ?? [];
  const attribution = current?.attribution ?? '';
  const error = current?.error ?? '';

  useEffect(() => {
    if (!searchable) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const params = new URLSearchParams({ q: text, scope });
      if (nearLat !== undefined && nearLng !== undefined) { params.set('lat', String(nearLat)); params.set('lng', String(nearLng)); }
      try {
        const data = await api<{ results: PlaceResult[]; attribution: string }>(`/api/places/search?${params}`);
        if (cancelled) return;
        setResponse({ key, results: data.results, attribution: data.attribution, error: null });
        setActive(0);
      } catch (cause) {
        if (!cancelled) setResponse({ key, results: [], attribution: '', error: cause instanceof Error ? cause.message : 'Search is unavailable.' });
      }
    }, 280);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [searchable, text, key, scope, nearLat, nearLng]);

  const applyPastedLink = async () => {
    if (!link) return;
    let place: PlaceResult = { providerId: null, name: link.name ?? 'Pinned location', kind: 'pin', category: 'other', isLocality: false, address: `${link.lat.toFixed(5)}, ${link.lng.toFixed(5)}`, city: null, region: null, country: null, countryCode: null, lat: link.lat, lng: link.lng, timezone: null };
    try {
      const data = await api<{ result: PlaceResult | null }>(`/api/places/reverse?lat=${link.lat}&lng=${link.lng}`);
      if (data.result) place = { ...data.result, name: link.name ?? data.result.name, providerId: link.name ? null : data.result.providerId };
    } catch {
      // Keep the coordinates even if naming them fails.
    }
    choose(place);
  };

  const choose = (place: PlaceResult) => {
    onSelect(place);
    setQuery('');
    setOpen(false);
  };

  type Row = { key: string; render: ReactNode; run: () => void };
  const rows: Row[] = [];
  if (link) {
    rows.push({ key: 'link', run: () => void applyPastedLink(), render: <><span className="place-option-icon"><Link2 size={16} /></span><span className="place-option-text"><strong>{link.name ?? 'Use this pinned location'}</strong><span>From pasted link · {link.lat.toFixed(4)}, {link.lng.toFixed(4)}</span></span></> });
  }
  results.forEach((place) => {
    const Icon = place.isLocality ? Building2 : ICONS[place.category] ?? MapPin;
    rows.push({ key: place.providerId ?? `${place.lat},${place.lng}`, run: () => choose(place), render: <><span className="place-option-icon"><Icon size={16} /></span><span className="place-option-text"><strong>{place.name}</strong><span>{[place.isLocality ? null : place.kind.replaceAll('_', ' '), place.address ?? [place.region, place.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</span></span></> });
  });
  extraOptions.forEach((option) => {
    rows.push({ key: `extra-${option.id}`, run: () => { option.onSelect(query.trim()); setQuery(''); setOpen(false); }, render: <><span className="place-option-icon" style={{ background: 'var(--surface-sunken)', color: 'var(--ink-2)' }}>{option.icon ?? <Plus size={16} />}</span><span className="place-option-text"><strong>{option.label}</strong>{option.detail ? <span>{option.detail}</span> : null}</span></> });
  });

  const showList = (open || inline) && (query.trim().length >= 2 || extraOptions.length > 0 || !!link);
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActive((index) => Math.min(index + 1, rows.length - 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((index) => Math.max(index - 1, 0)); }
    else if (event.key === 'Enter') { if (rows[active]) { event.preventDefault(); rows[active].run(); } }
    else if (event.key === 'Escape' && open && !inline) { event.stopPropagation(); setOpen(false); }
  };

  return (
    <div className="place-search">
      <div className="input-with-icon">
        <Search size={16} aria-hidden />
        <input
          ref={inputRef}
          className="input"
          type="text"
          role="combobox"
          aria-label={label}
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && rows[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder ?? 'Search for a place, or paste a map link'}
          value={query}
          autoFocus={autoFocus}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
        />
      </div>
      {showList ? (
        <div className={`place-search-results${inline ? ' is-inline' : ''}`}>
          <div id={listId} role="listbox" aria-label="Suggestions">
            {rows.map((row, index) => (
              <button key={row.key} id={`${listId}-${index}`} type="button" role="option" aria-selected={index === active} className="place-option" tabIndex={-1}
                onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={row.run}>
                {row.render}
              </button>
            ))}
          </div>
          <div aria-live="polite">
            {state === 'loading' ? <div className="place-search-status">Searching…</div> : null}
            {state === 'done' && !results.length && !link ? <div className="place-search-status">No matches. Try a different spelling or a nearby landmark.</div> : null}
            {state === 'error' ? <div className="place-search-status" style={{ color: 'var(--danger)' }}>{error}</div> : null}
          </div>
          {results.length && attribution ? <div className="attribution" style={{ padding: '4px 10px' }}>{attribution}</div> : null}
          {footer}
        </div>
      ) : null}
    </div>
  );
}
