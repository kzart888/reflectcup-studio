import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "@/db/schema";

type Database = NodePgDatabase<typeof schema>;

const globalDatabase = globalThis as typeof globalThis & {
  reflectCupPool?: Pool;
  reflectCupDatabase?: Database;
};

function databaseUrl(): string {
  return process.env.DATABASE_URL ?? "postgresql://reflectcup:reflectcup@127.0.0.1:54329/reflectcup";
}

export function getPool(): Pool {
  if (!globalDatabase.reflectCupPool) {
    globalDatabase.reflectCupPool = new Pool({
      connectionString: databaseUrl(),
      max: process.env.NODE_ENV === "production" ? 20 : 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000
    });
  }

  return globalDatabase.reflectCupPool;
}

export function getDatabase(): Database {
  if (!globalDatabase.reflectCupDatabase) {
    globalDatabase.reflectCupDatabase = drizzle(getPool(), { schema });
  }

  return globalDatabase.reflectCupDatabase;
}

export async function closeDatabase(): Promise<void> {
  if (globalDatabase.reflectCupPool) {
    await globalDatabase.reflectCupPool.end();
    globalDatabase.reflectCupPool = undefined;
    globalDatabase.reflectCupDatabase = undefined;
  }
}
