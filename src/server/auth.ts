import { users } from '@/db/schema';
import { getChatGPTUser, type ChatGPTUser } from '@/server/chatgpt-auth';
import type { Db } from '@/db/client';
import { unauthenticated } from './http';

export type CurrentUser = { id: string; email: string; displayName: string };

/**
 * The signed-in user from the hosting platform's authenticated headers.
 * The platform strips these headers from incoming requests and sets them
 * itself, so they cannot be forged by a client. Locally, the Sites Vite
 * plugin injects a fixed development user; production builds do not.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getChatGPTUser();
  if (!user) throw unauthenticated();
  return toCurrentUser(user);
}

export function toCurrentUser(user: ChatGPTUser): CurrentUser {
  return { id: user.userId, email: user.email.toLowerCase(), displayName: user.fullName ?? user.email.split('@')[0] };
}

/** Records the user so trips can reference them; cheap upsert, safe to repeat. */
export async function ensureUser(db: Db, user: CurrentUser): Promise<void> {
  await db.insert(users)
    .values({ id: user.id, email: user.email, displayName: user.displayName })
    .onConflictDoUpdate({ target: users.id, set: { email: user.email, displayName: user.displayName } });
}
