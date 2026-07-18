import { existsSync } from "node:fs";
import { and, eq } from "drizzle-orm";

import { closeDatabase, getDatabase } from "../../src/db/client";
import { appSettings, assets, opticalProfiles } from "../../src/db/schema";
import { sha256, stableJson } from "../../src/domains/auth/security";
import { createNominalOpticalProfile, generateOpticalProfile } from "../../src/optics";
import { getStorage } from "../../src/storage/filesystem-storage";

function loadLocalEnvironment(): void {
  for (const candidate of [".env.local", ".env"]) {
    if (existsSync(candidate)) process.loadEnvFile(candidate);
  }
}

async function installAsset(kind: string, extension: string, mimeType: string, bytes: Uint8Array) {
  const digest = sha256(bytes);
  const existing = await getDatabase().query.assets.findFirst({
    where: and(eq(assets.kind, kind), eq(assets.sha256, digest))
  });
  if (existing) return existing;
  const key = `optical-profiles/nominal-v1/${digest}.${extension}`;
  await getStorage().put(key, bytes);
  const [asset] = await getDatabase()
    .insert(assets)
    .values({
      kind,
      storageKey: key,
      mimeType,
      byteSize: bytes.byteLength,
      sha256: digest,
      metadata: { endian: kind === "optical-lut" ? "little" : undefined }
    })
    .returning();
  return asset;
}

async function main(): Promise<void> {
  loadLocalEnvironment();
  const generated = generateOpticalProfile(
    createNominalOpticalProfile({ status: "published", targetSamples: [129, 129], lutSize: [512, 512] })
  );
  const targetBytes = new Uint8Array(
    generated.plateToTarget.targetUv.buffer,
    generated.plateToTarget.targetUv.byteOffset,
    generated.plateToTarget.targetUv.byteLength
  );
  const lutAsset = await installAsset("optical-lut", "rg32f", "application/octet-stream", targetBytes);
  const maskAsset = await installAsset("optical-mask", "r8", "application/octet-stream", generated.plateToTarget.validMask);
  const checksum = sha256(stableJson(generated.profile));
  const existing = await getDatabase().query.opticalProfiles.findFirst({
    where: and(eq(opticalProfiles.slug, generated.profile.slug), eq(opticalProfiles.version, generated.profile.version))
  });
  if (!existing) {
    await getDatabase().insert(opticalProfiles).values({
      slug: generated.profile.slug,
      label: generated.profile.label,
      version: generated.profile.version,
      status: "published",
      profile: generated.profile as unknown as Record<string, unknown>,
      checksum,
      lutAssetId: lutAsset.id,
      maskAssetId: maskAsset.id,
      publishedAt: new Date()
    });
  } else if (existing.status === "draft") {
    await getDatabase()
      .update(opticalProfiles)
      .set({
        label: generated.profile.label,
        status: "published",
        profile: generated.profile as unknown as Record<string, unknown>,
        checksum,
        lutAssetId: lutAsset.id,
        maskAssetId: maskAsset.id,
        publishedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(opticalProfiles.id, existing.id));
  }

  const defaults: Record<string, unknown> = {
    "preview.toneMappingExposure": 1.08,
    "preview.mobileDprCap": 1.5,
    "preview.desktopDprCap": 2,
    "preview.keyLightMultiplier": 1
  };
  for (const [key, value] of Object.entries(defaults)) {
    await getDatabase()
      .insert(appSettings)
      .values({ key, value })
      .onConflictDoNothing({ target: appSettings.key });
  }
  process.stdout.write(`Installed published profile ${generated.profile.slug}@${generated.profile.version}.\n`);
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(closeDatabase);
