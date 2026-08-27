'use client';

import { useEffect, useRef } from 'react';
import { LocateFixed } from 'lucide-react';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import type { Segment } from '@/lib/types';

export function TripMap({ segments, activeId, onSelect, compact = false }: { segments: Segment[]; activeId: string; onSelect: (id: string) => void; compact?: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const onSelectRef = useRef(onSelect);
  const segmentsRef = useRef(segments);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { segmentsRef.current = segments; }, [segments]);

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

      // The route is drawn as a lightweight SVG overlay (kept in sync with the
      // map's camera) rather than a GL line layer: it renders identically on
      // every browser/GPU combination, with no dependency on the map's style
      // pipeline having finished loading a vector layer.
      const drawRoute = () => {
        const svg = svgRef.current;
        if (!svg) return;
        const points = segmentsRef.current.map((segment) => map.project([segment.longitude, segment.latitude]));
        if (points.length < 2) { svg.innerHTML = ''; return; }
        const d = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
        svg.innerHTML = `<path d="${d}" fill="none" stroke="#ffffff" stroke-width="7" stroke-opacity="0.9" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#c85f49" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1 9"/>`;
      };
      map.on('move', drawRoute);
      map.on('resize', drawRoute);
      map.on('load', drawRoute);

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

  const recenter = () => {
    const map = mapRef.current;
    const points = segmentsRef.current;
    if (!map || points.length === 0) return;
    if (points.length === 1) { map.easeTo({ center: [points[0].longitude, points[0].latitude], zoom: compact ? 7 : 8, duration: 700 }); return; }
    const lngs = points.map((p) => p.longitude); const lats = points.map((p) => p.latitude);
    map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: compact ? 50 : 80, duration: 700 });
  };

  return <div className={compact ? 'real-map compact' : 'real-map'} ref={container}><svg ref={svgRef} className="route-overlay"/><button type="button" className="map-recenter" onClick={recenter} aria-label="Recenter map on the whole route" title="Recenter on route"><LocateFixed size={16}/></button><div className="map-loading">Loading journey map…</div></div>;
}
