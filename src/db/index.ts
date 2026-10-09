import { env } from 'cloudflare:workers';
import { createDb, type Db } from './client';

export { createDb, type Db };

export function getDb(): Db {
  if (!env.DB) {
    throw new Error('Cloudflare D1 binding `DB` is unavailable. Check the `d1` field in .openai/hosting.json.');
  }
  return createDb(env.DB);
}
