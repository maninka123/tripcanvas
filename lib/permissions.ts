export type TripRole = 'owner'|'editor'|'viewer';
export const canViewTrip = (role: TripRole | null) => role !== null;
export const canEditTrip = (role: TripRole | null) => role === 'owner' || role === 'editor';
export const canDeleteTrip = (role: TripRole | null) => role === 'owner';
