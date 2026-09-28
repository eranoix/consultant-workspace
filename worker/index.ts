import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { loadEnv } from '../scripts/env';
import { pool } from '../src/lib/server/db';
import { registerJobs, runDue } from '../src/lib/server/services/cron';

loadEnv();

const TICK_MS = Number(process.env.WORKER_TICK_MS ?? 15_000);
const BEAT_FILE = process.env.WORKER_BEAT_FILE ?? '/tmp/cw-worker-beat';

if (process.argv.includes('--healthcheck')) {
  const ok = existsSync(BEAT_FILE) && Date.now() - Number(readFileSync(BEAT_FILE, 'utf8')) < TICK_MS * 4;
  process.exit(ok ? 0 : 1);
}

let stopping = false;
const log = (s: string) => console.log(`${new Date().toISOString()} ${s}`);

async function loop() {
  const db = pool();
  await registerJobs(db);
  log(`worker: started, tick ${TICK_MS} ms`);
  while (!stopping) {
    try {
      await runDue(db, new Date(), log);
      writeFileSync(BEAT_FILE, String(Date.now()));
    } catch (err) {
      log(`worker: tick failed: ${(err as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, TICK_MS));
  }
  await db.end();
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    log(`worker: ${sig}, finishing the current tick`);
    stopping = true;
  });
}

loop().catch((err) => {
  console.error('worker crashed:', err);
  process.exit(1);
});
