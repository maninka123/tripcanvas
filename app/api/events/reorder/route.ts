import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getDb } from '@/db';
import { events, trips } from '@/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

const schema=z.object({tripId:z.string().uuid(),dayId:z.string(),items:z.array(z.object({id:z.string().uuid(),sortOrder:z.number().int().nonnegative()})).max(500)});
export async function PATCH(request:Request){const user=await getChatGPTUser();if(!user)return Response.json({error:'Authentication required.'},{status:401});const parsed=schema.safeParse(await request.json());if(!parsed.success)return Response.json({error:'Invalid reorder request.'},{status:400});const value=parsed.data;const db=getDb();const owned=await db.select({id:trips.id}).from(trips).where(and(eq(trips.id,value.tripId),eq(trips.ownerId,user.userId),isNull(trips.deletedAt))).limit(1);if(!owned.length)return Response.json({error:'Trip not found.'},{status:404});for(const item of value.items){await db.update(events).set({sortOrder:item.sortOrder,updatedAt:new Date().toISOString()}).where(and(eq(events.id,item.id),eq(events.tripId,value.tripId),eq(events.dayId,value.dayId)))}return Response.json({updated:value.items.length})}
