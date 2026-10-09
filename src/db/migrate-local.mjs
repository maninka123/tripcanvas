#!/usr/bin/env node
// Applies the Drizzle migrations in ./drizzle to the local Miniflare D1 database
// used by `npm run dev`. Production migrations are applied by the hosting
// platform from the same ./drizzle directory (see docs/OPERATIONS.md).
//
// Usage: node src/db/migrate-local.mjs [migrate|reset]   (npm run db:migrate / db:reset)
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
// Matches LOCAL_STATE_DIR in vite.config.ts.
const cacheDir = join(root, 'node_modules', '.cache', 'tripcanvas');
const stateDir = join(cacheDir, 'state');
const configDir = join(cacheDir, 'wrangler');
const configPath = join(configDir, 'wrangler.local.json');
const command = process.argv[2] ?? 'migrate';

// Must match the binding the Vite Cloudflare plugin creates in vite.config.ts,
// so both tools resolve to the same SQLite file under .wrangler/state.
const config = {
  name: 'tripcanvas-local',
  compatibility_date: '2025-01-01',
  d1_databases: [
    {
      binding: 'DB',
      database_name: 'site-creator-d1',
      database_id: '00000000-0000-4000-8000-000000000000',
      migrations_dir: relative(configDir, join(root, 'drizzle')).replaceAll('\\', '/'),
    },
  ],
};

mkdirSync(configDir, { recursive: true });
writeFileSync(configPath, JSON.stringify(config, null, 2));

if (command === 'reset') {
  rmSync(join(stateDir, 'v3', 'd1'), { recursive: true, force: true });
  console.log('Local D1 state removed.');
}

const wrangler = join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const result = spawnSync(
  process.execPath,
  [wrangler, 'd1', 'migrations', 'apply', 'DB', '--local', '--config', configPath, '--persist-to', stateDir],
  { cwd: root, stdio: 'inherit', env: { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: join(cacheDir, 'logs'), WRANGLER_WRITE_LOGS: 'false', MINIFLARE_REGISTRY_PATH: join(cacheDir, 'registry') } },
);
process.exit(result.status ?? 1);
