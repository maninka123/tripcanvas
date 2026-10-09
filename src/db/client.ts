import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from './schema';

export type Db = DrizzleD1Database<typeof schema>;

/** Wraps a D1 binding. Portable: used by the Worker and by integration tests. */
export function createDb(database: D1Database): Db {
  return drizzle(database, { schema });
}
