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

export type AssetPreviewMetadata = {
  previewStorageKey: string;
  previewByteSize: number;
  previewSha256: string;
  previewWidth: number;
  previewHeight: number;
};

export function readAssetPreviewMetadata(asset: AssetRecord): AssetPreviewMetadata | undefined {
  const value = asset.metadata;
  if (
    typeof value.previewStorageKey !== "string" ||
    typeof value.previewByteSize !== "number" ||
    typeof value.previewSha256 !== "string" ||
    typeof value.previewWidth !== "number" ||
    typeof value.previewHeight !== "number"
  ) return undefined;
  return {
    previewStorageKey: value.previewStorageKey,
    previewByteSize: value.previewByteSize,
    previewSha256: value.previewSha256,
    previewWidth: value.previewWidth,
    previewHeight: value.previewHeight
  };
}

export function assetStorageKeys(asset: AssetRecord): string[] {
  const preview = readAssetPreviewMetadata(asset);
  return preview ? [asset.storageKey, preview.previewStorageKey] : [asset.storageKey];
}
