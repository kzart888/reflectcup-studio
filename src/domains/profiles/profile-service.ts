import { opticalProfiles } from "@/db/schema";
import { ApiError } from "@/domains/auth/http";
import { sha256, stableJson } from "@/domains/auth/security";
import { fnv1a64, opticalProfileSchema, type OpticalProfile } from "@/optics";
import { findAsset, type AssetRecord } from "@/repositories/assets";
import { getStorage } from "@/storage/filesystem-storage";

export type ValidatedOpticalRuntime = {
  document: OpticalProfile;
  lutAsset: AssetRecord;
  maskAsset: AssetRecord;
  lutBytes: Uint8Array;
  maskBytes: Uint8Array;
};

type ProfileIdentity = {
  slug: string;
  label: string;
  version: number;
  status?: OpticalProfile["status"];
};

const validatedRuntimeCache = new Map<string, Promise<ValidatedOpticalRuntime>>();

function validationError(message: string, details?: unknown): ApiError {
  return new ApiError(422, "PROFILE_VALIDATION_FAILED", message, details);
}

function parseDocument(document: unknown, identity?: ProfileIdentity): OpticalProfile {
  const parsed = opticalProfileSchema.safeParse(document);
  if (!parsed.success) {
    throw validationError("Optical profile document is invalid", parsed.error.flatten());
  }
  if (
    identity &&
    (parsed.data.slug !== identity.slug ||
      parsed.data.label !== identity.label ||
      parsed.data.version !== identity.version ||
      (identity.status !== undefined && parsed.data.status !== identity.status))
  ) {
    throw validationError("Optical profile document identity does not match its database record");
  }
  return parsed.data;
}

async function readAndVerifyAsset(asset: AssetRecord, expectedKind: "optical-lut" | "optical-mask"): Promise<Uint8Array> {
  if (asset.kind !== expectedKind || asset.ownerSessionId !== null || asset.mimeType !== "application/octet-stream") {
    throw validationError(`${expectedKind} must be an unowned application/octet-stream asset`);
  }
  let bytes: Uint8Array;
  try {
    bytes = await getStorage().get(asset.storageKey);
  } catch {
    throw validationError(`${expectedKind} is missing from private storage`);
  }
  if (bytes.byteLength !== asset.byteSize || sha256(bytes) !== asset.sha256) {
    throw validationError(`${expectedKind} database metadata does not match the stored bytes`);
  }
  return bytes;
}

export async function validateOpticalProfileCandidate(input: {
  document: unknown;
  lutAssetId: string | null | undefined;
  maskAssetId: string | null | undefined;
  identity?: ProfileIdentity;
}): Promise<ValidatedOpticalRuntime> {
  const document = parseDocument(input.document, input.identity);
  if (!input.lutAssetId || !input.maskAssetId) {
    throw validationError("Optical profile requires both LUT and mask assets");
  }
  const [lutAsset, maskAsset] = await Promise.all([findAsset(input.lutAssetId), findAsset(input.maskAssetId)]);
  if (!lutAsset || !maskAsset) throw validationError("Optical profile LUT or mask asset does not exist");

  const [lutBytes, maskBytes] = await Promise.all([
    readAndVerifyAsset(lutAsset, "optical-lut"),
    readAndVerifyAsset(maskAsset, "optical-mask")
  ]);
  const [width, height] = document.mapping.lutSize;
  const expectedLutBytes = width * height * 2 * Float32Array.BYTES_PER_ELEMENT;
  const expectedMaskBytes = width * height;
  if (lutBytes.byteLength !== expectedLutBytes || maskBytes.byteLength !== expectedMaskBytes) {
    throw validationError("Optical profile assets do not match the declared LUT dimensions", {
      expected: { lutBytes: expectedLutBytes, maskBytes: expectedMaskBytes },
      actual: { lutBytes: lutBytes.byteLength, maskBytes: maskBytes.byteLength }
    });
  }
  const expectedLutChecksum = `${fnv1a64(lutBytes)}${fnv1a64(maskBytes)}`;
  if (!document.checksums.lut || document.checksums.lut !== expectedLutChecksum) {
    throw validationError("Optical profile LUT checksum does not match its assets");
  }
  return { document, lutAsset, maskAsset, lutBytes, maskBytes };
}

export async function validateStoredOpticalProfile(
  profile: typeof opticalProfiles.$inferSelect
): Promise<ValidatedOpticalRuntime> {
  const cacheKey = [
    profile.id,
    profile.updatedAt.getTime(),
    profile.checksum,
    profile.lutAssetId,
    profile.maskAssetId
  ].join(":");
  let validation = validatedRuntimeCache.get(cacheKey);
  if (!validation) {
    validation = (async () => {
      const runtime = await validateOpticalProfileCandidate({
        document: profile.profile,
        lutAssetId: profile.lutAssetId,
        maskAssetId: profile.maskAssetId,
        identity: {
          slug: profile.slug,
          label: profile.label,
          version: profile.version,
          // Retirement controls selection for new sessions, but it must not
          // rewrite the immutable published profile document or checksum.
          status: profile.status === "retired" ? undefined : profile.status
        }
      });
      if (profile.status === "retired" && !["published", "retired"].includes(runtime.document.status)) {
        throw validationError("A retired profile must contain a formerly published or retired document");
      }
      if (profile.checksum !== sha256(stableJson(runtime.document))) {
        throw validationError("Optical profile record checksum does not match its document");
      }
      return runtime;
    })();
    validatedRuntimeCache.set(cacheKey, validation);
    validation.catch(() => validatedRuntimeCache.delete(cacheKey));
  }
  return validation;
}

export function serializeProfile(profile: typeof opticalProfiles.$inferSelect) {
  return {
    id: profile.id,
    slug: profile.slug,
    label: profile.label,
    version: profile.version,
    status: profile.status,
    checksum: profile.checksum,
    lutAssetId: profile.lutAssetId,
    maskAssetId: profile.maskAssetId,
    profile: profile.profile,
    publishedAt: profile.publishedAt?.toISOString(),
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString()
  };
}
