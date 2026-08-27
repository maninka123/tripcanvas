import { z } from 'zod';

export const tripSchema = z.object({ name:z.string().min(2,'Trip name is required'), startDate:z.string().min(1), endDate:z.string().min(1), currency:z.string().length(3), budget:z.number().min(0), travellers:z.number().int().min(1).max(50) }).refine((value)=>value.endDate>=value.startDate,{message:'End date must be on or after start date',path:['endDate']});
export const eventSchema = z.object({ title:z.string().min(2,'Add a title'), category:z.enum(['Accommodation','Transport','Attraction','Food','Activity','Note']), dayId:z.string().min(1), time:z.string().optional(), location:z.string().optional(), origin:z.string().optional(), destination:z.string().optional(), transportMode:z.string().optional(), provider:z.string().optional(), description:z.string().max(1200,'Keep notes under 1,200 characters').optional(), estimatedCost:z.number().min(0), bookingStatus:z.enum(['Researching','Shortlisted','Need to Book','Reserved','Booked','Paid','Cancelled','Not Required']), url:z.string().url('Enter a complete URL').or(z.literal('')).optional() });
export type TripInput = z.infer<typeof tripSchema>;
export type EventInput = z.infer<typeof eventSchema>;
