import type { FeatureCollection, LineString, Point } from 'geojson';
import { activitiesForDay, connections, orderedDestinations } from '@/features/trips/selectors';
import type { TripAggregate } from '@/features/trips/types';
import { boundsOf, greatCircle, isLatLng, type Bounds, type LatLng } from '@/lib/geo';
import { CATEGORY_HEX } from '@/components/planner/meta';

// Builds the map's GeoJSON from the trip. Pure, so the map stays a thin
// renderer: change the trip and these collections change with it.

export type MapMode = 'trip' | 'destination' | 'day';
export type PointProps = { id: string; kind: 'activity' | 'stay' | 'destination'; label: string; title: string; color: string };
export type LineProps = { kind: 'connection' | 'flight' | 'approx' | 'route' };

export type MapData = {
  points: FeatureCollection<Point, PointProps>;
  lines: FeatureCollection<LineString, LineProps>;
  /** Ordered stops to request a calculated route for (day mode only). */
  routeStops: LatLng[];
  bounds: Bounds | null;
  cluster: boolean;
  summary: string;
};

const point = (lat: number, lng: number, properties: PointProps) => ({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [lng, lat] }, properties });
const line = (coordinates: [number, number][], kind: LineProps['kind']) => ({ type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates }, properties: { kind } });

export function buildMapData(aggregate: TripAggregate, mode: MapMode, dayId: string | null, destinationId: string | null): MapData {
  const points: MapData['points']['features'] = [];
  const lines: MapData['lines']['features'] = [];
  const destinations = orderedDestinations(aggregate);
  let routeStops: LatLng[] = [];
  let summary = '';

  if (mode === 'trip' || (mode === 'day' && !dayId) || (mode === 'destination' && !destinationId)) {
    const located = destinations.filter(isLatLng);
    located.forEach((destination, index) => points.push(point(destination.lat!, destination.lng!, { id: destination.id, kind: 'destination', label: String(index + 1), title: destination.name, color: destination.color })));
    for (const link of connections(aggregate)) {
      if (!isLatLng(link.from) || !isLatLng(link.to)) continue;
      const flight = link.transport.some((activity) => activity.transport?.mode === 'flight');
      lines.push(flight ? line(greatCircle(link.from, link.to), 'flight') : line([[link.from.lng!, link.from.lat!], [link.to.lng!, link.to.lat!]], 'connection'));
    }
    summary = located.length ? `${located.length} ${located.length === 1 ? 'destination' : 'destinations'}` : 'No destinations on the map yet';
    if (located.length < destinations.length) summary += ` · ${destinations.length - located.length} without a location`;
  } else if (mode === 'day' && dayId) {
    const day = aggregate.days.find((item) => item.id === dayId);
    const activities = activitiesForDay(aggregate, dayId).filter((activity) => activity.kind === 'place' && activity.bookingStatus !== 'cancelled');
    const located = activities.filter((activity) => isLatLng(activity.place));
    located.forEach((activity, index) => points.push(point(activity.place!.lat!, activity.place!.lng!, { id: activity.id, kind: 'activity', label: String(index + 1), title: activity.title, color: CATEGORY_HEX[activity.category] })));
    // Tonight's stay closes the day's route.
    const tonight = aggregate.stays.find((stay) => {
      const start = aggregate.days.find((item) => item.id === stay.startDayId);
      return start && day && day.number >= start.number && day.number < start.number + stay.nights && isLatLng(stay.place);
    });
    if (tonight) points.push(point(tonight.place!.lat!, tonight.place!.lng!, { id: tonight.id, kind: 'stay', label: '', title: tonight.name, color: CATEGORY_HEX.stay }));
    routeStops = [...located.map((activity) => ({ lat: activity.place!.lat!, lng: activity.place!.lng! })), ...(tonight ? [{ lat: tonight.place!.lat!, lng: tonight.place!.lng! }] : [])];
    if (routeStops.length >= 2) lines.push(line(routeStops.map((stop) => [stop.lng, stop.lat]), 'approx'));
    summary = `Day ${day?.number ?? ''} · ${located.length} of ${activities.length} ${activities.length === 1 ? 'place' : 'places'} on the map`;
  } else if (mode === 'destination' && destinationId) {
    const destination = destinations.find((item) => item.id === destinationId);
    const dayIds = new Set(aggregate.days.filter((day) => day.destinationId === destinationId).map((day) => day.id));
    const activities = aggregate.activities.filter((activity) => activity.kind === 'place' && isLatLng(activity.place) && ((activity.dayId && dayIds.has(activity.dayId)) || (!activity.dayId && activity.destinationId === destinationId)));
    for (const activity of activities) {
      const day = aggregate.days.find((item) => item.id === activity.dayId);
      points.push(point(activity.place!.lat!, activity.place!.lng!, { id: activity.id, kind: 'activity', label: day ? String(day.number) : '•', title: activity.title, color: CATEGORY_HEX[activity.category] }));
    }
    for (const stay of aggregate.stays.filter((item) => item.destinationId === destinationId && isLatLng(item.place))) {
      points.push(point(stay.place!.lat!, stay.place!.lng!, { id: stay.id, kind: 'stay', label: '', title: stay.name, color: CATEGORY_HEX.stay }));
    }
    if (!points.length && destination && isLatLng(destination)) points.push(point(destination.lat!, destination.lng!, { id: destination.id, kind: 'destination', label: '', title: destination.name, color: destination.color }));
    summary = `${destination?.name ?? 'Destination'} · ${activities.length} ${activities.length === 1 ? 'place' : 'places'} (numbers show the day)`;
  }

  const coordinates: LatLng[] = [...points.map((feature) => ({ lng: feature.geometry.coordinates[0], lat: feature.geometry.coordinates[1] })), ...lines.flatMap((feature) => feature.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })))];
  return {
    points: { type: 'FeatureCollection', features: points },
    lines: { type: 'FeatureCollection', features: lines },
    routeStops,
    bounds: boundsOf(coordinates),
    cluster: points.length > 30,
    summary,
  };
}
