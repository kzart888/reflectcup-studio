import { existsSync } from "node:fs";
import { and, eq, ne } from "drizzle-orm";
import sharp from "sharp";

import { closeDatabase, getDatabase } from "../../src/db/client";
import { appSettings, assets, opticalProfiles } from "../../src/db/schema";
import { sha256, stableJson } from "../../src/domains/auth/security";
import { createCurvedCupOpticalProfile, createCurvedCupOpticalProfileV3, createNominalOpticalProfile, generateOpticalProfile, type GeneratedOpticalProfile } from "../../src/optics";
import { getStorage } from "../../src/storage/filesystem-storage";

function loadLocalEnvironment(): void {
  for (const candidate of [".env.local", ".env"]) {
    if (existsSync(candidate)) process.loadEnvFile(candidate);
  }
}

async function installAsset(
  profileKey: string,
  kind: string,
  extension: string,
  mimeType: string,
  bytes: Uint8Array,
  metadata: Record<string, unknown> = {}
) {
  const digest = sha256(bytes);
  const existing = await getDatabase().query.assets.findFirst({
    where: and(eq(assets.kind, kind), eq(assets.sha256, digest))
  });
  if (existing) return existing;
  const key = `optical-profiles/${profileKey}/${digest}.${extension}`;
  await getStorage().put(key, bytes);
  const [asset] = await getDatabase()
    .insert(assets)
    .values({
      kind,
      storageKey: key,
      mimeType,
      byteSize: bytes.byteLength,
      sha256: digest,
      metadata: { ...metadata, endian: kind === "optical-lut" ? "little" : undefined }
    })
    .returning();
  return asset;
}

async function installProfile(
  generated: GeneratedOpticalProfile,
  databaseStatus: "published" | "retired" = "published",
): Promise<void> {
  const profileKey = `${generated.profile.slug}-v${generated.profile.version}`;
  const checksum = sha256(stableJson(generated.profile));
  const targetBytes = new Uint8Array(
    generated.plateToTarget.targetUv.buffer,
    generated.plateToTarget.targetUv.byteOffset,
    generated.plateToTarget.targetUv.byteLength
  );
  const lutAsset = await installAsset(profileKey, "optical-lut", "rg32f", "application/octet-stream", targetBytes);
  const maskAsset = await installAsset(profileKey, "optical-mask", "r8", "application/octet-stream", generated.plateToTarget.validMask);
  const [targetWidth, targetHeight] = generated.profile.mapping.targetSamples;
  const targetMaskBytes = await sharp(generated.targetRegion.coreMask, {
    raw: { width: targetWidth, height: targetHeight, channels: 1 }
  }).png({ compressionLevel: 9 }).toBuffer();
  const targetContourBytes = Buffer.from(JSON.stringify(generated.targetRegion.contour));
  const targetMetadata = {
    profileSlug: generated.profile.slug,
    profileVersion: generated.profile.version,
    profileChecksum: checksum
  };
  await Promise.all([
    installAsset(profileKey, "optical-target-mask", "png", "image/png", targetMaskBytes, targetMetadata),
    installAsset(profileKey, "optical-target-contour", "json", "application/json", targetContourBytes, targetMetadata)
  ]);
  const existing = await getDatabase().query.opticalProfiles.findFirst({
    where: and(eq(opticalProfiles.slug, generated.profile.slug), eq(opticalProfiles.version, generated.profile.version))
  });
  if (databaseStatus === "published") {
    await getDatabase()
      .update(opticalProfiles)
      .set({ status: "retired", updatedAt: new Date() })
      .where(and(
        eq(opticalProfiles.slug, generated.profile.slug),
        eq(opticalProfiles.status, "published"),
        ne(opticalProfiles.version, generated.profile.version),
      ));
  }
  if (!existing) {
    await getDatabase().insert(opticalProfiles).values({
      slug: generated.profile.slug,
      label: generated.profile.label,
      version: generated.profile.version,
      status: databaseStatus,
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
        status: databaseStatus,
        profile: generated.profile as unknown as Record<string, unknown>,
        checksum,
        lutAssetId: lutAsset.id,
        maskAssetId: maskAsset.id,
        publishedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(opticalProfiles.id, existing.id));
  } else if (existing.status !== databaseStatus) {
    await getDatabase()
      .update(opticalProfiles)
      .set({
        status: databaseStatus,
        publishedAt: databaseStatus === "published" ? new Date() : existing.publishedAt,
        updatedAt: new Date(),
      })
      .where(eq(opticalProfiles.id, existing.id));
  }
  process.stdout.write(`Installed ${databaseStatus} profile ${generated.profile.slug}@${generated.profile.version}.\n`);
}

async function main(): Promise<void> {
  loadLocalEnvironment();
  await installProfile(generateOpticalProfile(
    createNominalOpticalProfile({ status: "published", targetSamples: [129, 129], lutSize: [512, 512] })
  ));
  await installProfile(generateOpticalProfile(
    createCurvedCupOpticalProfile({ status: "published", targetSamples: [513, 513], lutSize: [512, 512] })
  ), "retired");
  await installProfile(generateOpticalProfile(
    createCurvedCupOpticalProfileV3({ status: "published", targetSamples: [513, 513], lutSize: [512, 512] })
  ));

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
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(closeDatabase);
