import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  createCurvedCupOpticalProfile,
  createCurvedCupOpticalProfileV3,
  createNominalOpticalProfile,
  generateOpticalProfile
} from "../../src/optics";

type ProfileSelection = "nominal-v1" | "curved-cup-v2" | "curved-cup-v3";

function readProfileSelection(): ProfileSelection {
  const profileIndex = process.argv.indexOf("--profile");
  const requested = profileIndex >= 0 ? process.argv[profileIndex + 1] : "nominal-v1";
  if (requested !== "nominal-v1" && requested !== "curved-cup-v2" && requested !== "curved-cup-v3") {
    throw new Error("--profile must be nominal-v1, curved-cup-v2 or curved-cup-v3");
  }
  return requested;
}

function readOutputDirectory(selection: ProfileSelection): string {
  const outputIndex = process.argv.indexOf("--output");
  const requested = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
  if (outputIndex >= 0 && !requested) throw new Error("--output requires a directory path");
  return path.resolve(requested ?? `public/optical-profiles/${selection}`);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function main() {
  const selection = readProfileSelection();
  const outputDirectory = readOutputDirectory(selection);
  // Published means selectable by the digital MVP, not physically calibrated.
  const generated = generateOpticalProfile(
    selection === "nominal-v1"
      ? createNominalOpticalProfile({ status: "published" })
      : selection === "curved-cup-v2"
        ? createCurvedCupOpticalProfile({ status: "published" })
        : createCurvedCupOpticalProfileV3({ status: "published" }),
  );
  const hasCoreRegionAssets = selection !== "nominal-v1";
  const lutBytes = Buffer.from(
    generated.plateToTarget.targetUv.buffer,
    generated.plateToTarget.targetUv.byteOffset,
    generated.plateToTarget.targetUv.byteLength
  );
  const plateMaskBytes = Buffer.from(generated.plateToTarget.validMask);
  // nominal-v1 is an immutable published fixture: its historical target-valid-mask is the
  // raw ray-hit diagnostic. Curved releases carry an explicit customer core mask and debug mask.
  const targetMaskBytes = Buffer.from(selection === "nominal-v1"
    ? generated.targetRegion.rayHitMask
    : generated.targetRegion.coreMask);
  const plateMaskPng = await sharp(plateMaskBytes, {
    raw: { width: generated.plateToTarget.width, height: generated.plateToTarget.height, channels: 1 }
  }).png().toBuffer();
  const targetMaskPng = await sharp(targetMaskBytes, {
    raw: { width: generated.targetToPlate.width, height: generated.targetToPlate.height, channels: 1 }
  }).png().toBuffer();
  const profileJson = Buffer.from(JSON.stringify(generated.profile, null, 2));
  const contourJson = Buffer.from(JSON.stringify(generated.targetRegion.contour, null, 2));
  const rayHitMaskPng = hasCoreRegionAssets ? await sharp(generated.targetRegion.rayHitMask, {
    raw: { width: generated.targetToPlate.width, height: generated.targetToPlate.height, channels: 1 }
  }).png().toBuffer() : undefined;
  const coreMaskPng = hasCoreRegionAssets ? targetMaskPng : undefined;
  const extraFiles = hasCoreRegionAssets ? {
    "target-ray-hit-mask.png": {
      bytes: rayHitMaskPng!.byteLength,
      sha256: sha256(rayHitMaskPng!),
      format: "image/png"
    },
    "target-core-mask.png": {
      bytes: coreMaskPng!.byteLength,
      sha256: sha256(coreMaskPng!),
      format: "image/png"
    },
    "target-core-contour.json": {
      bytes: contourJson.byteLength,
      sha256: sha256(contourJson),
      format: "application/json; normalized target-uv; evenodd"
    }
  } : {};
  const manifestJson = Buffer.from(JSON.stringify({
    schemaVersion: 1,
    profileId: generated.profile.id,
    profileVersion: generated.profile.version,
    files: {
      "profile.json": { bytes: profileJson.byteLength, sha256: sha256(profileJson), format: "application/json" },
      "plate-to-target.rg32f": { bytes: lutBytes.byteLength, sha256: sha256(lutBytes), format: "RG32F little-endian" },
      "plate-valid-mask.bin": { bytes: plateMaskBytes.byteLength, sha256: sha256(plateMaskBytes), format: "R8" },
      "plate-valid-mask.png": { bytes: plateMaskPng.byteLength, sha256: sha256(plateMaskPng), format: "image/png" },
      "target-valid-mask.png": { bytes: targetMaskPng.byteLength, sha256: sha256(targetMaskPng), format: "image/png" },
      ...extraFiles
    }
  }, null, 2));
  await mkdir(outputDirectory, { recursive: true });

  const writes = [
    writeFile(path.join(outputDirectory, "profile.json"), profileJson),
    writeFile(path.join(outputDirectory, "manifest.json"), manifestJson),
    writeFile(path.join(outputDirectory, "plate-to-target.rg32f"), lutBytes),
    writeFile(path.join(outputDirectory, "plate-valid-mask.bin"), plateMaskBytes),
    writeFile(path.join(outputDirectory, "plate-valid-mask.png"), plateMaskPng),
    writeFile(path.join(outputDirectory, "target-valid-mask.png"), targetMaskPng)
  ];
  if (hasCoreRegionAssets) {
    writes.push(
      writeFile(path.join(outputDirectory, "target-ray-hit-mask.png"), rayHitMaskPng!),
      writeFile(path.join(outputDirectory, "target-core-mask.png"), coreMaskPng!),
      writeFile(path.join(outputDirectory, "target-core-contour.json"), contourJson)
    );
  }
  await Promise.all(writes);

  process.stdout.write(`Generated ${generated.profile.id} in ${outputDirectory}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
