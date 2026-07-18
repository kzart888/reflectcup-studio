import { eq } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { assets } from "@/db/schema";

export type AssetRecord = typeof assets.$inferSelect;

export async function findAsset(id: string): Promise<AssetRecord | undefined> {
  return getDatabase().query.assets.findFirst({ where: eq(assets.id, id) });
}

export async function insertAsset(input: typeof assets.$inferInsert): Promise<AssetRecord> {
  const [asset] = await getDatabase().insert(assets).values(input).returning();
  return asset;
}
