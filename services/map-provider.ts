export type Coordinate = [longitude: number, latitude: number];
export type MapRoute = { coordinates: Coordinate[]; durationMinutes?: number; distanceKm?: number };

export interface MapProvider {
  geocode(query: string): Promise<Coordinate[]>;
  route(points: Coordinate[], mode: string): Promise<MapRoute>;
}

export class ManualMapProvider implements MapProvider {
  async geocode(): Promise<Coordinate[]> { return []; }
  async route(points: Coordinate[]): Promise<MapRoute> { return { coordinates: points }; }
}
