export type TripStatus = 'Idea' | 'Planning' | 'Booked' | 'Upcoming' | 'Currently Travelling' | 'Completed' | 'Archived';
export type BookingStatus = 'Researching' | 'Shortlisted' | 'Need to Book' | 'Reserved' | 'Booked' | 'Paid' | 'Cancelled' | 'Not Required';
export type EventCategory = 'Accommodation' | 'Transport' | 'Attraction' | 'Food' | 'Activity' | 'Note';

export type Trip = {
  id: string; name: string; dates: string; startDate: string; endDate: string; duration: number; route: string; countries: string[]; status: TripStatus; budget: number; planned: number; paid: number; progress: number; travellers: string[]; cover: string;
};

export type Segment = {
  id: string; city: string; country: string; startDay: number; endDay: number; color: string; latitude: number; longitude: number;
};

export type ItineraryEvent = {
  id: string; dayId: string | null; title: string; category: EventCategory; subcategory?: string; time?: string; timePrecision: 'exact' | 'approximate' | 'all_day' | 'unscheduled'; description?: string; origin?: string; destination?: string; transportMode?: string; provider?: string; serviceNumber?: string; duration?: string; location?: string; latitude?: number; longitude?: number; estimatedCost: number; actualCost?: number; currency: string; bookingStatus: BookingStatus; paymentStatus: 'Not Paid' | 'Deposit Paid' | 'Paid' | 'Refunded'; links?: { title: string; url: string; type: string; description: string }[]; details?: string[]; sortOrder: number;
};

export type TripDay = { id: string; number: number; date: string; title: string; segmentId: string; events: ItineraryEvent[] };
export type Booking = { id: string; title: string; category: string; provider?: string; reference?: string; status: BookingStatus; paymentStatus: string; deadline?: string; cancellationDeadline?: string; cost: number; currency: string };
export type SavedPlace = { id: string; title: string; category: string; city: string; note: string };
