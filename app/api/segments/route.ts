import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getDb } from '@/db';
import { tripSegments, trips } from '@/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

const schema=z.object({id:z.string().uuid(),tripId:z.string().uuid(),city:z.string().min(1),country:z.string().min(1),startDay:z.number().int().positive(),endDay:z.number().int().positive(),color:z.string().regex(/^#[0-9a-f]{6}$/i),latitude:z.number(),longitude:z.number()});
export async function POST(request:Request){const user=await getChatGPTUser();if(!user)return Response.json({error:'Authentication required.'},{status:401});const parsed=schema.safeParse(await request.json());if(!parsed.success)return Response.json({error:'Invalid destination.'},{status:400});const value=parsed.data;const db=getDb();const owned=await db.select({id:trips.id}).from(trips).where(and(eq(trips.id,value.tripId),eq(trips.ownerId,user.userId),isNull(trips.deletedAt))).limit(1);if(!owned.length)return Response.json({error:'Trip not found.'},{status:404});const existing=await db.select({id:tripSegments.id}).from(tripSegments).where(eq(tripSegments.tripId,value.tripId));await db.insert(tripSegments).values({id:value.id,tripId:value.tripId,destinationName:value.city,country:value.country,startDay:value.startDay,endDay:value.endDay,startDate:'',endDate:'',latitude:value.latitude,longitude:value.longitude,colour:value.color,sortOrder:existing.length});return Response.json({id:value.id},{status:201})}
