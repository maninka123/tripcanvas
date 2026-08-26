import { getDb } from '@/db';
import { trips, tripDays, tripTravellers, users } from '@/db/schema';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { tripSchema } from '@/lib/validation';
import { generateDays } from '@/lib/travel-calculations';
import { z } from 'zod';

const requestSchema = tripSchema.extend({ id: z.string().uuid() });

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: 'Authentication required.' }, { status: 401 });
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: 'Please check the trip details.', fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  const value = parsed.data; const db = getDb(); const days = generateDays(value.startDate, value.endDate);
  await db.insert(users).values({ id:user.userId, email:user.email, displayName:user.displayName }).onConflictDoUpdate({ target:users.id, set:{ email:user.email, displayName:user.displayName } });
  await db.insert(trips).values({ id:value.id, ownerId:user.userId, name:value.name, startDate:value.startDate, endDate:value.endDate, baseCurrency:value.currency, budget:value.budget, status:'idea' });
  await db.insert(tripTravellers).values({ id:crypto.randomUUID(), tripId:value.id, userId:user.userId, role:'owner' });
  await db.insert(tripDays).values(days.map((day)=>({ id:`${value.id}-day-${day.dayNumber}`, tripId:value.id, dayNumber:day.dayNumber, date:day.date, title:'Open day' })));
  return Response.json({ id:value.id }, { status: 201 });
}
