'use client';

import { useEffect, useRef } from 'react';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import type { Segment } from '@/lib/types';

export function TripMap({ segments, activeId, onSelect, compact = false }: { segments: Segment[]; activeId: string; onSelect: (id: string) => void; compact?: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    if (!container.current || mapRef.current) return;
    let cancelled = false;
    void import('maplibre-gl').then((maplibregl) => {
      if (cancelled || !container.current) return;
      const map = new maplibregl.Map({
        container: container.current,
        style: { version: 8, sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' } }, layers: [{ id: 'osm', type: 'raster', source: 'osm' }] },
        center: [137.1, 35.15], zoom: 4.8, attributionControl: false,
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
      map.on('load', () => {
        map.addSource('journey', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: segments.map((segment) => [segment.longitude, segment.latitude]) } } });
        map.addLayer({ id: 'journey-shadow', type: 'line', source: 'journey', paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': .85 } });
        map.addLayer({ id: 'journey-line', type: 'line', source: 'journey', paint: { 'line-color': '#c85f49', 'line-width': 3, 'line-dasharray': [2, 1] } });
      });
      markersRef.current = segments.map((segment, index) => {
        const element = document.createElement('button');
        element.type = 'button'; element.className = 'map-marker'; element.dataset.segmentId = segment.id;
        element.setAttribute('aria-label', `${index + 1}. ${segment.city}`); element.textContent = String(index + 1);
        element.style.setProperty('--marker-color', segment.color);
        element.addEventListener('click', () => onSelectRef.current(segment.id));
        return new maplibregl.Marker({ element }).setLngLat([segment.longitude, segment.latitude]).setPopup(new maplibregl.Popup({ offset: 18 }).setHTML(`<strong>${segment.city}</strong><br><span>Days ${segment.startDay}–${segment.endDay}</span>`)).addTo(map);
      });
      mapRef.current = map;
    });
    return () => { cancelled = true; markersRef.current.forEach((marker) => marker.remove()); mapRef.current?.remove(); mapRef.current = null; };
  }, [segments]);

  useEffect(() => {
    if (!mapRef.current) return;
    const selected = segments.find((segment) => segment.id === activeId);
    if (selected) mapRef.current.easeTo({ center: [selected.longitude, selected.latitude], zoom: compact ? 7 : 8, duration: 700 });
    container.current?.querySelectorAll('.map-marker').forEach((element) => element.classList.toggle('is-active', (element as HTMLElement).dataset.segmentId === activeId));
  }, [activeId, compact, segments]);

  return <div className={compact ? 'real-map compact' : 'real-map'} ref={container}><div className="map-loading">Loading journey map…</div></div>;
}
