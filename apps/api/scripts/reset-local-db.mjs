#!/usr/bin/env node
/**
 * Drop the local D1 state and replay every migration from 0001.
 *
 * Why this exists: the local migration ledger can drift out of step with the
 * schema (hand-applying a file, or an interrupted `migrations apply`, leaves
 * the column created but unrecorded). Wrangler then re-runs that migration on
 * the next apply and dies with `duplicate column name`, and the local queue
 * stalls — no later migration can be applied until someone unpicks it by hand.
 *
 * Replaying from empty is cheaper and more reliable than reconciling. Local
 * only: this never touches the remote database.
 */
import { rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const d1State = join(apiRoot, '.wrangler', 'state', 'v3', 'd1');

function run(args) {
  const result = spawnSync('npx', ['wrangler', ...args], {
    cwd: apiRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (existsSync(d1State)) {
  rmSync(d1State, { recursive: true, force: true });
  console.log('Removed local D1 state at .wrangler/state/v3/d1');
} else {
  console.log('No local D1 state to remove.');
}

run(['d1', 'migrations', 'apply', 'fit-db', '--local']);
console.log('\nLocal database rebuilt from 0001. Run `npm run seed:local` for data.');
