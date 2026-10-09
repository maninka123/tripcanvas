import {
  Bike, BedDouble, Bus, CarFront, CarTaxiFront, Footprints, Landmark, Moon, Mountain, Plane, Route, Ship, ShoppingBag, Sparkles, StickyNote, TrainFront, Utensils, type LucideIcon,
} from 'lucide-react';
import type { Activity, ActivityCategory, BookingStatus, ExpenseCategory, StayType, TimeSlot, TransportMode } from '@/features/trips/types';

// Labels, icons and colours shared across the planner, budget and travel mode.
// Colour is never the only signal: every status also has a text label.

export const CATEGORY: Record<ActivityCategory, { label: string; icon: LucideIcon; color: string }> = {
  sight: { label: 'Sight', icon: Landmark, color: 'var(--cat-sight)' },
  food: { label: 'Food & drink', icon: Utensils, color: 'var(--cat-food)' },
  activity: { label: 'Activity', icon: Sparkles, color: 'var(--cat-activity)' },
  nature: { label: 'Nature', icon: Mountain, color: 'var(--cat-nature)' },
  shopping: { label: 'Shopping', icon: ShoppingBag, color: 'var(--cat-shopping)' },
  nightlife: { label: 'Nightlife', icon: Moon, color: 'var(--cat-nightlife)' },
  other: { label: 'Other', icon: Route, color: 'var(--cat-other)' },
};

export const CATEGORY_HEX: Record<ActivityCategory | 'transport' | 'stay' | 'note', string> = {
  sight: '#4a6896', food: '#b5552d', activity: '#23705f', nature: '#557235', shopping: '#85527f', nightlife: '#6449a0', other: '#5f6c65',
  transport: '#2f6385', stay: '#85631f', note: '#7b6a4d',
};

export const TRANSPORT: Record<TransportMode, { label: string; icon: LucideIcon }> = {
  flight: { label: 'Flight', icon: Plane },
  train: { label: 'Train', icon: TrainFront },
  bus: { label: 'Bus', icon: Bus },
  ferry: { label: 'Ferry', icon: Ship },
  car: { label: 'Car', icon: CarFront },
  taxi: { label: 'Taxi', icon: CarTaxiFront },
  transfer: { label: 'Transfer', icon: CarFront },
  walk: { label: 'Walk', icon: Footprints },
  bike: { label: 'Bike', icon: Bike },
  other: { label: 'Other', icon: Route },
};

export const STAY_TYPES: Record<StayType, string> = { hotel: 'Hotel', hostel: 'Hostel', apartment: 'Apartment', guesthouse: 'Guesthouse', other: 'Other' };

export const BOOKING: Record<BookingStatus, { label: string; badge: string }> = {
  none: { label: 'No booking needed', badge: '' },
  idea: { label: 'Idea', badge: 'badge-outline' },
  planned: { label: 'To book', badge: 'badge-warning' },
  booked: { label: 'Booked', badge: 'badge-success' },
  cancelled: { label: 'Cancelled', badge: 'badge-danger' },
};

export const SLOTS: Record<TimeSlot, string> = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', anytime: 'Anytime' };

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  accommodation: 'Accommodation', transport: 'Transport', food: 'Food & drink', activities: 'Activities', shopping: 'Shopping', other: 'Other',
};

export function activityIcon(activity: Activity): LucideIcon {
  if (activity.kind === 'transport' && activity.transport) return TRANSPORT[activity.transport.mode].icon;
  if (activity.kind === 'note') return StickyNote;
  return CATEGORY[activity.category].icon;
}

export function activityColor(activity: Activity): string {
  if (activity.kind === 'transport') return 'var(--cat-transport)';
  if (activity.kind === 'note') return 'var(--cat-note)';
  return CATEGORY[activity.category].color;
}

export const StayIcon = BedDouble;

export const COMMON_CURRENCIES = ['AUD', 'USD', 'EUR', 'GBP', 'CNY', 'JPY', 'NZD', 'CAD', 'SGD', 'HKD', 'THB', 'KRW', 'INR', 'LKR', 'CHF', 'VND', 'IDR', 'MYR', 'PHP', 'AED'];
