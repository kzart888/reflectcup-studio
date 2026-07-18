import { existsSync } from "node:fs";

import { closeDatabase } from "../../src/db/client";
import {
  processStorageDeletionOutbox,
  purgeCompletedStorageDeletions
} from "../../src/storage/deletion-outbox";

for (const candidate of [".env.local", ".env"]) {
  if (existsSync(candidate)) process.loadEnvFile(candidate);
}

async function run() {
  let claimed = 0;
  let completed = 0;
  let failed = 0;
  for (let batch = 0; batch < 100; batch += 1) {
    const result = await processStorageDeletionOutbox({ limit: 100 });
    claimed += result.claimed;
    completed += result.completed;
    failed += result.failed;
    if (result.claimed < 100 || result.failed > 0) {
      const purged = await purgeCompletedStorageDeletions();
      return { claimed, completed, failed, purged };
    }
  }
  throw new Error("Storage deletion drain exceeded 10,000 objects; rerun after checking scheduler cadence");
}

run()
  .then((result) => {
    process.stdout.write(
      `Claimed ${result.claimed} storage tombstones; completed ${result.completed}; ${result.failed} scheduled for retry; purged ${result.purged} old tombstones.\n`
    );
    if (result.failed > 0) process.exitCode = 1;
  })
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(closeDatabase);
