import { existsSync } from "node:fs";
import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import { closeDatabase, getDatabase } from "../../src/db/client";

function loadLocalEnvironment(): void {
  for (const candidate of [".env.local", ".env"]) {
    if (existsSync(candidate)) process.loadEnvFile(candidate);
  }
}

async function main(): Promise<void> {
  loadLocalEnvironment();
  await migrate(getDatabase(), { migrationsFolder: path.resolve("drizzle") });
  process.stdout.write("Database migrations completed.\n");
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(closeDatabase);
