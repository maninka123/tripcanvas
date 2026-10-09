import { env } from 'cloudflare:workers';
import { getDb } from '@/db';
import type { Db } from '@/db/client';
import { ensureUser, requireUser, type CurrentUser } from './auth';

export type RequestContext = { db: Db; user: CurrentUser };

/** Authenticated database context for a route handler. */
export async function authContext(): Promise<RequestContext> {
  const user = await requireUser();
  const db = getDb();
  await ensureUser(db, user);
  return { db, user };
}

export function serverEnv(): Cloudflare.Env {
  return env as Cloudflare.Env;
}
