'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
// Bundled as a plain asset: MapLibre runs this file in a web worker.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { Crosshair, Info, Navigation, X } from 'lucide-react';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePlannerUI } from '@/components/planner/planner-state';
import { Button, IconButton } from '@/components/ui/Button';
import { useTrip } from '@/features/trips/client/TripContext';
import { api } from '@/lib/api-client';
import { directionsLink } from '@/lib/urls';
import type { RouteResult } from '@/services/routing';
import { buildMapData, type MapMode } from './map-data';

// Map tiles: OpenFreeMap (free, no key, OpenStreetMap data). Replace with a
// commercial style URL for high-traffic production use (docs/OPERATIONS.md).
export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

type RouteMode = 'walk' | 'drive' | 'bike';
type RouteState = { status: 'idle' | 'loading' | 'ready' | 'unavailable'; coordinates: [number, number][][]; minutes: number; km: number; attribution: string };
const routeCache = new Map<string, RouteResult>();

export function MapPane() {
  const { view: aggregate } = useTrip();
  const ui = usePlannerUI();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [routeMode, setRouteMode] = useState<RouteMode>('walk');
  const [routeResults, setRouteResults] = useState<Record<string, RouteResult | 'error'>>({});
  const handlers = useRef({ select: (_id: string, _kind: string) => {} });

  const day = ui.dayNumber ? aggregate.days.find((item) => item.number === ui.dayNumber) ?? null : null;
  const destinationId = ui.destinationFocus ?? day?.destinationId ?? aggregate.destinations[0]?.id ?? null;
  const mode: MapMode = ui.mapMode === 'day' && day ? 'day' : ui.mapMode === 'destination' && destinationId ? 'destination' : 'trip';
  const data = useMemo(() => buildMapData(aggregate, mode, day?.id ?? null, destinationId), [aggregate, mode, day?.id, destinationId]);
  const selectedId = ui.selection?.id ?? null;

  // Map event listeners are registered once; they call the latest handler through this ref.
  useEffect(() => {
    handlers.current.select = (id, kind) => {
      if (kind === 'destination') { ui.setDestinationFocus(id); ui.setMapMode('destination'); return; }
      if (kind === 'stay') { ui.select({ type: 'stay', id }); ui.openEditor({ type: 'stay', id }); return; }
      ui.select({ type: 'activity', id }, { scroll: true });
    };
  });

  // Calculated route for the selected day, derived from results keyed by mode and stops.
  const stopsKey = data.routeStops.map((stop) => `${stop.lat.toFixed(5)},${stop.lng.toFixed(5)}`).join(';');
  const routeKey = mode === 'day' && data.routeStops.length >= 2 ? `${routeMode}|${stopsKey}` : null;
  const routeEntry = routeKey ? routeResults[routeKey] ?? routeCache.get(routeKey) : undefined;
  const route = useMemo<RouteState>(() => {
    if (!routeKey) return { status: 'idle', coordinates: [], minutes: 0, km: 0, attribution: '' };
    if (routeEntry === undefined) return { status: 'loading', coordinates: [], minutes: 0, km: 0, attribution: '' };
    if (routeEntry === 'error' || !routeEntry.legs.length) return { status: 'unavailable', coordinates: [], minutes: 0, km: 0, attribution: '' };
    return { status: 'ready', coordinates: routeEntry.legs.map((leg) => leg.coordinates), minutes: routeEntry.legs.reduce((sum, leg) => sum + leg.durationMinutes, 0), km: routeEntry.legs.reduce((sum, leg) => sum + leg.distanceKm, 0), attribution: routeEntry.attribution };
  }, [routeKey, routeEntry]);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | null = null;
    void import('maplibre-gl').then((maplibregl) => {
      if (cancelled || !container.current) return;
      maplibregl.setWorkerUrl(maplibreWorkerUrl);
      let created: MapLibreMap;
      try {
        created = new maplibregl.Map({ container: container.current, style: MAP_STYLE_URL, center: [105, 30], zoom: 2.4, attributionControl: { compact: true }, cooperativeGestures: false, dragRotate: false });
      } catch {
        setFailed(true);
        return;
      }
      map = created;
      created.touchZoomRotate.disableRotation();
      created.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      created.on('error', (event) => { if (String(event.error?.message ?? '').includes('style')) setFailed(true); });
      created.on('load', () => {
        if (!map) return;
        map.addSource('lines', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        // Clusters only form when many places crowd together at low zoom.
        map.addSource('points', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, cluster: true, clusterRadius: 42, clusterMaxZoom: 11, clusterMinPoints: 6 });
        map.addLayer({ id: 'lines-casing', type: 'line', source: 'lines', paint: { 'line-color': '#ffffff', 'line-width': 6, 'line-opacity': 0.8 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
        map.addLayer({ id: 'lines', type: 'line', source: 'lines', paint: { 'line-color': ['match', ['get', 'kind'], 'flight', '#2f6385', '#1f4d3a'], 'line-width': 2.5, 'line-dasharray': [2, 2] }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
        map.addLayer({ id: 'route-casing', type: 'line', source: 'route', paint: { 'line-color': '#ffffff', 'line-width': 8 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
        map.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#1f4d3a', 'line-width': 4.5 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
        map.addLayer({ id: 'clusters', type: 'circle', source: 'points', filter: ['has', 'point_count'], paint: { 'circle-color': '#1f4d3a', 'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 30, 26], 'circle-stroke-width': 3, 'circle-stroke-color': '#e3ede6' } });
        map.addLayer({ id: 'cluster-count', type: 'symbol', source: 'points', filter: ['has', 'point_count'], layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12, 'text-font': ['Noto Sans Bold'] }, paint: { 'text-color': '#ffffff' } });
        map.addLayer({ id: 'point-halo', type: 'circle', source: 'points', filter: ['==', ['get', 'id'], ''], paint: { 'circle-radius': 22, 'circle-color': '#b5552d', 'circle-opacity': 0.25 } });
        map.addLayer({ id: 'points', type: 'circle', source: 'points', filter: ['!', ['has', 'point_count']], paint: { 'circle-radius': ['match', ['get', 'kind'], 'destination', 14, 'stay', 11, 12], 'circle-color': ['get', 'color'], 'circle-stroke-width': 2.5, 'circle-stroke-color': '#ffffff' } });
        map.addLayer({ id: 'point-labels', type: 'symbol', source: 'points', filter: ['!', ['has', 'point_count']], layout: { 'text-field': ['get', 'label'], 'text-size': 12, 'text-font': ['Noto Sans Bold'], 'text-allow-overlap': true, 'text-ignore-placement': true }, paint: { 'text-color': '#ffffff' } });
        map.addLayer({ id: 'point-names', type: 'symbol', source: 'points', minzoom: 5, filter: ['!', ['has', 'point_count']], layout: { 'text-field': ['get', 'title'], 'text-size': 12, 'text-font': ['Noto Sans Regular'], 'text-offset': [0, 1.6], 'text-anchor': 'top', 'text-max-width': 10, 'text-optional': true }, paint: { 'text-color': '#1b2520', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 } });
        map.on('click', 'points', (event) => {
          const feature = event.features?.[0];
          if (feature) handlers.current.select(String(feature.properties.id), String(feature.properties.kind));
        });
        map.on('click', 'clusters', async (event) => {
          const feature = event.features?.[0];
          const source = map?.getSource('points') as GeoJSONSource | undefined;
          if (!feature || !source || !map) return;
          const zoom = await source.getClusterExpansionZoom(Number(feature.properties.cluster_id));
          map.easeTo({ center: (feature.geometry as unknown as { coordinates: [number, number] }).coordinates, zoom });
        });
        map.on('mouseenter', 'clusters', () => { if (map) map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'clusters', () => { if (map) map.getCanvas().style.cursor = ''; });
        map.on('mouseenter', 'points', () => { if (map) map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'points', () => { if (map) map.getCanvas().style.cursor = ''; });
        mapRef.current = map;
        setReady(true);
      });
    }).catch(() => setFailed(true));
    return () => { cancelled = true; map?.remove(); mapRef.current = null; };
  }, []);

  // Update data in place (no map re-creation).
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource('points') as GeoJSONSource | undefined)?.setData(data.points);
    const approx = route.status === 'ready' ? { ...data.lines, features: data.lines.features.filter((feature) => feature.properties.kind !== 'approx') } : data.lines;
    (map.getSource('lines') as GeoJSONSource | undefined)?.setData(approx);
    (map.getSource('route') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: route.status === 'ready' ? route.coordinates.map((coordinates) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates }, properties: {} })) : [] });
  }, [ready, data, route]);

  // Highlight the selected item and bring it into view.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.setFilter('point-halo', ['==', ['get', 'id'], selectedId ?? '']);
    const feature = data.points.features.find((item) => item.properties.id === selectedId);
    if (feature && !map.getBounds().contains(feature.geometry.coordinates as [number, number])) map.easeTo({ center: feature.geometry.coordinates as [number, number], duration: 500 });
  }, [ready, selectedId, data]);

  // Fit to what is shown when the view changes (not on every edit).
  const fitKey = `${mode}:${day?.id ?? ''}:${destinationId ?? ''}:${data.points.features.length > 0}`;
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !data.bounds) return;
    const [[west, south], [east, north]] = data.bounds;
    if (west === east && south === north) map.easeTo({ center: [west, south], zoom: mode === 'trip' ? 9 : 13, duration: 600 });
    else map.fitBounds(data.bounds, { padding: { top: 76, bottom: 96, left: 48, right: 64 }, maxZoom: mode === 'day' ? 15 : mode === 'destination' ? 13 : 9, duration: 700 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refit only when the view changes
  }, [ready, fitKey]);

  // Fetch a route the first time a set of stops is shown.
  useEffect(() => {
    if (!routeKey || routeEntry !== undefined) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      api<RouteResult>('/api/routes', { method: 'POST', json: { mode: routeMode, points: data.routeStops.slice(0, 20) } })
        .then((result) => { routeCache.set(routeKey, result); if (!cancelled) setRouteResults((current) => ({ ...current, [routeKey]: result })); })
        .catch(() => { if (!cancelled) setRouteResults((current) => ({ ...current, [routeKey]: 'error' })); });
    }, 350);
    return () => { cancelled = true; window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the stops, not the array identity
  }, [routeKey, routeEntry]);

  const selected = selectedId ? aggregate.activities.find((activity) => activity.id === selectedId) ?? null : null;
  const fit = () => {
    const map = mapRef.current;
    if (map && data.bounds) map.fitBounds(data.bounds, { padding: 56, maxZoom: mode === 'day' ? 15 : 13, duration: 600 });
  };

  return (
    <section className="map-pane" aria-label="Map">
      <div className="map-toolbar">
        <div className="segmented" role="group" aria-label="Map shows">
          <button type="button" aria-pressed={mode === 'trip'} onClick={() => ui.setMapMode('trip')}>Trip</button>
          <button type="button" aria-pressed={mode === 'destination'} disabled={!destinationId} onClick={() => ui.setMapMode('destination')}>Destination</button>
          <button type="button" aria-pressed={mode === 'day'} onClick={() => { if (!ui.dayNumber && aggregate.days[0]) ui.setDayNumber(aggregate.days[0].number); ui.setMapMode('day'); }}>Day{day ? ` ${day.number}` : ''}</button>
        </div>
        {mode === 'day' && data.routeStops.length >= 2 ? (
          <select className="select map-route-mode" aria-label="Route by" value={routeMode} onChange={(event) => setRouteMode(event.target.value as RouteMode)}>
            <option value="walk">Walking</option><option value="drive">Driving</option><option value="bike">Cycling</option>
          </select>
        ) : null}
        <span className="spacer" />
        <IconButton label="Fit map to places" outline onClick={fit}><Crosshair size={16} /></IconButton>
      </div>
      <div className="map-canvas" ref={container} role="region" aria-label={`Map: ${data.summary}`} />
      {failed ? <div className="map-fallback"><Info size={18} aria-hidden /> The map could not load. Your itinerary still works — check your connection and reload.</div> : null}
      {!ready && !failed ? <div className="map-loading" aria-hidden>Loading map…</div> : null}
      <div className="map-legend" aria-live="polite">
        <span>{data.summary}</span>
        {mode === 'day' && data.routeStops.length >= 2 ? (
          route.status === 'ready' ? <span><strong>{route.km.toFixed(1)} km · about {Math.round(route.minutes)} min</strong> {routeMode === 'walk' ? 'walking' : routeMode === 'drive' ? 'driving' : 'cycling'} between stops · {route.attribution}</span>
          : route.status === 'loading' ? <span>Calculating route…</span>
          : <span className="is-approx">Dashed lines are straight-line connections, not a route — no {routeMode === 'walk' ? 'walking' : routeMode === 'drive' ? 'driving' : 'cycling'} route is available.</span>
        ) : null}
        {mode === 'trip' && data.lines.features.length ? <span className="is-approx">Lines show the order of travel, not the actual path{data.lines.features.some((feature) => feature.properties.kind === 'flight') ? '; curved lines are flights' : ''}.</span> : null}
      </div>
      {selected && selected.place && typeof selected.place.lat === 'number' ? (
        <div className="map-card" role="dialog" aria-label={selected.title}>
          <div className="spacer" style={{ minWidth: 0 }}>
            <strong className="truncate" style={{ display: 'block' }}>{selected.title}</strong>
            <span className="tiny subtle truncate" style={{ display: 'block' }}>{selected.place.address ?? selected.place.name}</span>
          </div>
          <a className="btn btn-sm" href={directionsLink(selected.place)} target="_blank" rel="noopener noreferrer"><Navigation size={14} aria-hidden /> Directions</a>
          <Button size="sm" variant="primary" onClick={() => ui.openEditor({ type: 'activity', id: selected.id })}>Open</Button>
          <IconButton size="sm" label="Close" onClick={() => ui.select(null)}><X size={14} /></IconButton>
        </div>
      ) : null}
    </section>
  );
}
