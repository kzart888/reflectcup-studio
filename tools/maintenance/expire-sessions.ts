import { existsSync } from "node:fs";

import { closeDatabase } from "../../src/db/client";
import { expireStaleSessions } from "../../src/domains/sessions/retention-service";

for (const candidate of [".env.local", ".env"]) {
  if (existsSync(candidate)) process.loadEnvFile(candidate);
}

async function run() {
  const all: Awaited<ReturnType<typeof expireStaleSessions>> = [];
  for (let batch = 0; batch < 100; batch += 1) {
    const results = await expireStaleSessions(new Date(), 100);
    all.push(...results);
    if (results.length < 100) return all;
  }
  throw new Error("Expiration exceeded 10,000 sessions in one run; rerun after checking scheduler cadence");
}

run()
  .then((results) => {
    const removedAssets = results.reduce((total, result) => total + result.removedAssets, 0);
    const failures = results.reduce((total, result) => total + result.storageFailures, 0);
    process.stdout.write(`Expired ${results.length} sessions; removed ${removedAssets} assets; ${failures} storage failures.\n`);
    if (failures > 0) process.exitCode = 1;
  })
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(closeDatabase);
