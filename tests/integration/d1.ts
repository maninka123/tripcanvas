import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { getPlatformProxy } from 'wrangler';
import { createDb, type Db } from '@/db/client';

// Starts a throwaway Miniflare D1 database with every migration applied, so
// integration tests exercise the real SQL, constraints and batch semantics.

export type TestDatabase = { db: Db; raw: D1Database; dispose: () => Promise<void> };

export async function createTestDatabase(): Promise<TestDatabase> {
  const dir = mkdtempSync(join(tmpdir(), 'tripcanvas-d1-'));
  const configPath = join(dir, 'wrangler.json');
  writeFileSync(configPath, JSON.stringify({
    name: 'tripcanvas-test',
    compatibility_date: '2025-01-01',
    d1_databases: [{ binding: 'DB', database_name: 'test', database_id: '00000000-0000-4000-8000-0000000000aa' }],
  }));
  const proxy = await getPlatformProxy<{ DB: D1Database }>({ configPath, persist: { path: join(dir, 'state') } });
  const raw = proxy.env.DB;
  const migrationsDir = resolve(__dirname, '../../drizzle');
  for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()) {
    const statements = readFileSync(join(migrationsDir, file), 'utf8').split('--> statement-breakpoint').map((statement) => statement.trim()).filter(Boolean);
    for (const statement of statements) await raw.prepare(statement).run();
  }
  return {
    db: createDb(raw),
    raw,
    dispose: async () => {
      await proxy.dispose();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
