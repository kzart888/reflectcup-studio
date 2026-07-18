import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  buildTargetValidMask,
  createNominalOpticalProfile,
  generateOpticalProfile
} from "../../src/optics";

function readOutputDirectory(): string {
  const outputIndex = process.argv.indexOf("--output");
  const requested = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
  if (outputIndex >= 0 && !requested) throw new Error("--output requires a directory path");
  return path.resolve(requested ?? "public/optical-profiles/nominal-v1");
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function main() {
  const outputDirectory = readOutputDirectory();
  // Published means selectable by the digital MVP, not physically calibrated.
  const generated = generateOpticalProfile(createNominalOpticalProfile({ status: "published" }));
  const targetMask = buildTargetValidMask(generated.targetToPlate);
  const lutBytes = Buffer.from(
    generated.plateToTarget.targetUv.buffer,
    generated.plateToTarget.targetUv.byteOffset,
    generated.plateToTarget.targetUv.byteLength
  );
  const plateMaskBytes = Buffer.from(generated.plateToTarget.validMask);
  const targetMaskBytes = Buffer.from(targetMask);
  const plateMaskPng = await sharp(plateMaskBytes, {
    raw: { width: generated.plateToTarget.width, height: generated.plateToTarget.height, channels: 1 }
  }).png().toBuffer();
  const targetMaskPng = await sharp(targetMaskBytes, {
    raw: { width: generated.targetToPlate.width, height: generated.targetToPlate.height, channels: 1 }
  }).png().toBuffer();
  const profileJson = Buffer.from(JSON.stringify(generated.profile, null, 2));
  const manifestJson = Buffer.from(JSON.stringify({
    schemaVersion: 1,
    profileId: generated.profile.id,
    profileVersion: generated.profile.version,
    files: {
      "profile.json": { bytes: profileJson.byteLength, sha256: sha256(profileJson), format: "application/json" },
      "plate-to-target.rg32f": { bytes: lutBytes.byteLength, sha256: sha256(lutBytes), format: "RG32F little-endian" },
      "plate-valid-mask.bin": { bytes: plateMaskBytes.byteLength, sha256: sha256(plateMaskBytes), format: "R8" },
      "plate-valid-mask.png": { bytes: plateMaskPng.byteLength, sha256: sha256(plateMaskPng), format: "image/png" },
      "target-valid-mask.png": { bytes: targetMaskPng.byteLength, sha256: sha256(targetMaskPng), format: "image/png" }
    }
  }, null, 2));
  await mkdir(outputDirectory, { recursive: true });

  await Promise.all([
    writeFile(path.join(outputDirectory, "profile.json"), profileJson),
    writeFile(path.join(outputDirectory, "manifest.json"), manifestJson),
    writeFile(path.join(outputDirectory, "plate-to-target.rg32f"), lutBytes),
    writeFile(path.join(outputDirectory, "plate-valid-mask.bin"), plateMaskBytes),
    writeFile(path.join(outputDirectory, "plate-valid-mask.png"), plateMaskPng),
    writeFile(path.join(outputDirectory, "target-valid-mask.png"), targetMaskPng)
  ]);

  process.stdout.write(`Generated ${generated.profile.id} in ${outputDirectory}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
