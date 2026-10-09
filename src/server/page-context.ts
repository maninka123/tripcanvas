import { getDb } from '@/db';
import { ensureUser, toCurrentUser, type CurrentUser } from './auth';
import { requireChatGPTUser } from './chatgpt-auth';
import type { Db } from '@/db/client';

/** For server-rendered pages: redirects to sign-in, then returns the user and database. */
export async function pageContext(returnTo: string): Promise<{ db: Db; user: CurrentUser }> {
  const user = toCurrentUser(await requireChatGPTUser(returnTo));
  const db = getDb();
  await ensureUser(db, user);
  return { db, user };
}
