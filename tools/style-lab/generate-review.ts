import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  buildTargetCoreMask,
  createCurvedCupOpticalProfileV3,
  fnv1a64,
  generateTargetPlateMap,
  parseOpticalProfile,
  renderCanonicalPlate,
  renderOpticalProof,
  type OpticalProfile,
  type PlateTargetLut,
  type RawRgbaImage
} from "@/optics";
import {
  BAYER_DITHER_PROVIDER,
  CLUSTERED_DOT_HALFTONE_PROVIDER,
  ERROR_DIFFUSION_PROVIDER,
  executeStyle,
  HEX_MOSAIC_PROVIDER,
  serializeStyleRecipe,
  SQUARE_MOSAIC_PROVIDER,
  type StyleParameterMap,
  type StylePhysicalSpec,
  type StyleProvider
} from "@/rendering/styles";

const OUTPUT_ROOT = path.resolve("docs/assets/style-lab");
const WIDTH = 320;
const HEIGHT = 240;
const OPTICAL_SIZE = 320;
const PLATE_SIZE = 768;
const PLATE_DIAMETER_MM = 182.4924;
const PHYSICAL: StylePhysicalSpec = {
  widthMm: 96,
  heightMm: 72,
  minFeatureMm: 0.4,
  minPitchMm: 0.6
};
const PLATE_PHYSICAL: StylePhysicalSpec = {
  widthMm: PLATE_DIAMETER_MM,
  heightMm: PLATE_DIAMETER_MM,
  minFeatureMm: 0.4,
  minPitchMm: 0.6
};

type ReviewPreset = Readonly<{
  slug: string;
  label: string;
  provider: StyleProvider;
  params: StyleParameterMap;
  constrainedCandidates: readonly StyleParameterMap[];
}>;

const PRESETS: readonly ReviewPreset[] = [
  {
    slug: "square-mosaic",
    label: "Square mosaic",
    provider: SQUARE_MOSAIC_PROVIDER,
    params: { cellSizeMm: 4.8 },
    constrainedCandidates: [2.4, 3.6, 6.6].map((cellSizeMm) => ({ cellSizeMm }))
  },
  {
    slug: "hex-mosaic",
    label: "Hex mosaic",
    provider: HEX_MOSAIC_PROVIDER,
    params: { cellDiameterMm: 5.4 },
    constrainedCandidates: [2.7, 4, 7.2].map((cellDiameterMm) => ({ cellDiameterMm }))
  },
  {
    slug: "clustered-dot",
    label: "Clustered dots",
    provider: CLUSTERED_DOT_HALFTONE_PROVIDER,
    params: { pitchMm: 2.4, minDotDiameterMm: 0.4, maxDotDiameterMm: 3.39, gamma: 1 },
    constrainedCandidates: [
      { pitchMm: 1.2, minDotDiameterMm: 0.4, maxDotDiameterMm: 1.69, gamma: 1 },
      { pitchMm: 1.8, minDotDiameterMm: 0.4, maxDotDiameterMm: 2.54, gamma: 1 },
      { pitchMm: 3.6, minDotDiameterMm: 0.4, maxDotDiameterMm: 5.09, gamma: 1 }
    ]
  },
  {
    slug: "bayer-4",
    label: "Bayer 4x4",
    provider: BAYER_DITHER_PROVIDER,
    params: { matrixSize: 4, samplePitchMm: 1.2 },
    constrainedCandidates: [0.6, 0.9, 1.8].map((samplePitchMm) => ({ matrixSize: 4, samplePitchMm }))
  },
  {
    slug: "bayer-8",
    label: "Bayer 8x8",
    provider: BAYER_DITHER_PROVIDER,
    params: { matrixSize: 8, samplePitchMm: 1.2 },
    constrainedCandidates: [0.6, 0.9, 1.8].map((samplePitchMm) => ({ matrixSize: 8, samplePitchMm }))
  },
  {
    slug: "floyd-steinberg",
    label: "Floyd-Steinberg",
    provider: ERROR_DIFFUSION_PROVIDER,
    params: { kernel: 1, samplePitchMm: 1.2 },
    constrainedCandidates: [0.6, 0.9, 1.8].map((samplePitchMm) => ({ kernel: 1, samplePitchMm }))
  },
  {
    slug: "stucki",
    label: "Stucki",
    provider: ERROR_DIFFUSION_PROVIDER,
    params: { kernel: 2, samplePitchMm: 1.2 },
    constrainedCandidates: [0.6, 0.9, 1.8].map((samplePitchMm) => ({ kernel: 2, samplePitchMm }))
  },
];

function createCanvas(): RawRgbaImage {
  const data = new Uint8Array(WIDTH * HEIGHT * 4);
  for (let pixel = 0; pixel < WIDTH * HEIGHT; pixel += 1) data[pixel * 4 + 3] = 255;
  return { width: WIDTH, height: HEIGHT, data };
}

function setPixel(image: RawRgbaImage, x: number, y: number, colour: readonly [number, number, number]): void {
  if (x < 0 || x >= image.width || y < 0 || y >= image.height) return;
  const offset = (y * image.width + x) * 4;
  image.data[offset] = colour[0];
  image.data[offset + 1] = colour[1];
  image.data[offset + 2] = colour[2];
  image.data[offset + 3] = 255;
}

function checkerFixture(): RawRgbaImage {
  const image = createCanvas();
  const colours = [[28, 52, 82], [240, 226, 187], [187, 73, 62], [62, 139, 122]] as const;
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const cell = (Math.floor(x / 24) + Math.floor(y / 24)) % 2;
      const quadrant = (x >= WIDTH / 2 ? 1 : 0) + (y >= HEIGHT / 2 ? 2 : 0);
      const base = colours[(quadrant + cell) % colours.length];
      setPixel(image, x, y, base);
    }
  }
  for (let y = 0; y < HEIGHT; y += 1) {
    const center = Math.floor(WIDTH * 0.5 + Math.sin(y / 15) * 26);
    for (let x = center - 3; x <= center + 3; x += 1) setPixel(image, x, y, [250, 250, 245]);
  }
  return image;
}

function portraitFixture(): RawRgbaImage {
  const image = createCanvas();
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const t = y / (HEIGHT - 1);
      setPixel(image, x, y, [Math.round(38 + 36 * t), Math.round(91 + 50 * t), Math.round(116 + 48 * t)]);
    }
  }
  const ellipse = (cx: number, cy: number, rx: number, ry: number, colour: readonly [number, number, number]) => {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y += 1) {
      for (let x = Math.floor(cx - rx); x <= cx + rx; x += 1) {
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) setPixel(image, x, y, colour);
      }
    }
  };
  ellipse(160, 244, 98, 92, [52, 46, 48]);
  ellipse(160, 118, 65, 83, [220, 166, 126]);
  ellipse(160, 71, 70, 48, [52, 40, 38]);
  ellipse(136, 116, 7, 4, [39, 35, 34]);
  ellipse(184, 116, 7, 4, [39, 35, 34]);
  ellipse(160, 153, 25, 8, [128, 66, 66]);
  ellipse(160, 149, 20, 4, [236, 186, 166]);
  for (let y = 117; y < 145; y += 1) setPixel(image, 160 + Math.floor((y - 117) * 0.18), y, [176, 112, 88]);
  return image;
}

const FONT: Readonly<Record<string, readonly string[]>> = {
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"]
};

function drawText(image: RawRgbaImage, text: string, x0: number, y0: number, scale: number): void {
  let cursor = x0;
  for (const character of text) {
    if (character === " ") {
      cursor += scale * 4;
      continue;
    }
    const glyph = FONT[character];
    if (!glyph) continue;
    for (let row = 0; row < glyph.length; row += 1) {
      for (let column = 0; column < glyph[row].length; column += 1) {
        if (glyph[row][column] !== "1") continue;
        for (let dy = 0; dy < scale; dy += 1) {
          for (let dx = 0; dx < scale; dx += 1) {
            setPixel(image, cursor + column * scale + dx, y0 + row * scale + dy, [28, 43, 42]);
          }
        }
      }
    }
    cursor += scale * 6;
  }
}

function textFixture(): RawRgbaImage {
  const image = createCanvas();
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) setPixel(image, x, y, [246, 239, 218]);
  }
  drawText(image, "REFLECT", 24, 56, 6);
  drawText(image, "123", 92, 130, 10);
  for (let x = 24; x < WIDTH - 24; x += 1) {
    setPixel(image, x, 34, [183, 72, 57]);
    setPixel(image, x, 205, [44, 113, 103]);
  }
  return image;
}

function landscapeFixture(): RawRgbaImage {
  const image = createCanvas();
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const sky = Math.min(1, y / 160);
      setPixel(image, x, y, [Math.round(242 - sky * 112), Math.round(170 - sky * 62), Math.round(112 - sky * 34)]);
    }
  }
  for (let x = 0; x < WIDTH; x += 1) {
    const ridge = Math.round(112 + Math.sin(x / 27) * 18 + Math.sin(x / 11) * 6);
    for (let y = ridge; y < HEIGHT; y += 1) setPixel(image, x, y, [46, 78, 68]);
    const near = Math.round(168 + Math.sin(x / 19) * 12);
    for (let y = near; y < HEIGHT; y += 1) setPixel(image, x, y, [30, 52, 45]);
  }
  for (let y = 157; y < 214; y += 1) {
    const halfWidth = Math.round((y - 157) * 0.78);
    for (let x = 226 - halfWidth; x <= 226 + halfWidth; x += 1) setPixel(image, x, y, [212, 132, 64]);
  }
  for (let y = 167; y < 214; y += 1) setPixel(image, 226, y, [82, 55, 43]);
  for (let y = 35; y < 145; y += 1) {
    for (let x = 52; x < 59; x += 1) setPixel(image, x, y, [45, 41, 35]);
  }
  return image;
}

const FIXTURES = [
  { slug: "checker", label: "Checker + direction", image: checkerFixture() },
  { slug: "portrait", label: "Portrait", image: portraitFixture() },
  { slug: "text", label: "Short text", image: textFixture() },
  { slug: "landscape", label: "Photo-like landscape", image: landscapeFixture() }
] as const;

async function encode(image: RawRgbaImage): Promise<Buffer> {
  return sharp(image.data, { raw: { width: image.width, height: image.height, channels: 4 } })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
}

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function labelSvg(width: number, height: number, text: string, size = 16): Buffer {
  const escaped = text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#f5f1e8"/>
    <text x="${width / 2}" y="${height / 2 + size * 0.35}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${size}" font-weight="600" fill="#203a36">${escaped}</text>
  </svg>`);
}

function letterboxSquare(input: RawRgbaImage): RawRgbaImage {
  const size = Math.max(input.width, input.height);
  const data = new Uint8Array(size * size * 4);
  for (let pixel = 0; pixel < size * size; pixel += 1) {
    data[pixel * 4] = 247;
    data[pixel * 4 + 1] = 243;
    data[pixel * 4 + 2] = 233;
    data[pixel * 4 + 3] = 255;
  }
  const offsetX = Math.floor((size - input.width) / 2);
  const offsetY = Math.floor((size - input.height) / 2);
  for (let y = 0; y < input.height; y += 1) {
    for (let x = 0; x < input.width; x += 1) {
      const sourceOffset = (y * input.width + x) * 4;
      const targetOffset = ((y + offsetY) * size + x + offsetX) * 4;
      data.set(input.data.subarray(sourceOffset, sourceOffset + 4), targetOffset);
    }
  }
  return { width: size, height: size, data };
}

type ProofMetrics = Readonly<{
  sampleCount: number;
  mse: number;
  psnrDb: number | null;
}>;

function proofMetrics(actual: RawRgbaImage, expected: RawRgbaImage): ProofMetrics {
  if (actual.width !== expected.width || actual.height !== expected.height) {
    throw new Error("Proof and target dimensions must match");
  }
  let squaredError = 0;
  let channelCount = 0;
  let sampleCount = 0;
  for (let y = 1; y < actual.height - 1; y += 1) {
    for (let x = 1; x < actual.width - 1; x += 1) {
      let interior = true;
      for (let dy = -1; dy <= 1 && interior; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (actual.data[((y + dy) * actual.width + x + dx) * 4 + 3] === 0) {
            interior = false;
            break;
          }
        }
      }
      if (!interior) continue;
      const offset = (y * actual.width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const difference = actual.data[offset + channel] - expected.data[offset + channel];
        squaredError += difference * difference;
        channelCount += 1;
      }
      sampleCount += 1;
    }
  }
  if (channelCount === 0) throw new Error("Optical proof contains no scorable interior samples");
  const mse = squaredError / channelCount;
  return {
    sampleCount,
    mse,
    psnrDb: mse === 0 ? null : 10 * Math.log10((255 * 255) / mse)
  };
}

function roundedMetrics(metrics: ProofMetrics): Record<string, number | null> {
  return {
    sampleCount: metrics.sampleCount,
    mse: Math.round(metrics.mse * 1e6) / 1e6,
    psnrDb: metrics.psnrDb === null ? null : Math.round(metrics.psnrDb * 1e6) / 1e6
  };
}

function applyTargetCoreMask(
  image: RawRgbaImage,
  coreMask: Uint8Array,
  maskWidth: number,
  maskHeight: number
): RawRgbaImage {
  if (coreMask.length !== maskWidth * maskHeight) throw new Error("Target core mask dimensions are invalid");
  const data = Uint8Array.from(image.data);
  for (let y = 0; y < image.height; y += 1) {
    const maskY = image.height === 1 ? 0 : Math.round(y / (image.height - 1) * (maskHeight - 1));
    for (let x = 0; x < image.width; x += 1) {
      const maskX = image.width === 1 ? 0 : Math.round(x / (image.width - 1) * (maskWidth - 1));
      if (coreMask[maskY * maskWidth + maskX] !== 0) continue;
      const offset = (y * image.width + x) * 4;
      data[offset] = 0;
      data[offset + 1] = 0;
      data[offset + 2] = 0;
      data[offset + 3] = 0;
    }
  }
  return { width: image.width, height: image.height, data };
}

type PublishedOpticsEvidence = Readonly<{
  profileSha256: string;
  lutSha256: string;
  validMaskSha256: string;
  coreMaskPngSha256: string;
}>;

type PublishedV3Optics = Readonly<{
  profile: OpticalProfile;
  lut: PlateTargetLut;
  targetToPlate: ReturnType<typeof generateTargetPlateMap>;
  targetCoreMask: Uint8Array;
  evidence: PublishedOpticsEvidence;
}>;

function requireManifestFile(
  manifest: unknown,
  name: string,
  bytes: Buffer
): void {
  const files = (manifest as { files?: Record<string, { bytes?: unknown; sha256?: unknown }> }).files;
  const evidence = files?.[name];
  if (!evidence || evidence.bytes !== bytes.byteLength || evidence.sha256 !== sha256(bytes)) {
    throw new Error(`Published curved-cup-v3 manifest mismatch for ${name}`);
  }
}

async function loadPublishedV3Optics(): Promise<PublishedV3Optics> {
  const root = path.resolve("public/optical-profiles/curved-cup-v3");
  const [profileBytes, manifestBytes, uvBytes, maskBytes, coreMaskPng] = await Promise.all([
    readFile(path.join(root, "profile.json")),
    readFile(path.join(root, "manifest.json")),
    readFile(path.join(root, "plate-to-target.rg32f")),
    readFile(path.join(root, "plate-valid-mask.bin")),
    readFile(path.join(root, "target-core-mask.png"))
  ]);
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as unknown;
  requireManifestFile(manifest, "profile.json", profileBytes);
  requireManifestFile(manifest, "plate-to-target.rg32f", uvBytes);
  requireManifestFile(manifest, "plate-valid-mask.bin", maskBytes);
  requireManifestFile(manifest, "target-core-mask.png", coreMaskPng);

  const profile = parseOpticalProfile(JSON.parse(profileBytes.toString("utf8")) as unknown);
  const manifestIdentity = manifest as { profileId?: unknown; profileVersion?: unknown };
  if (manifestIdentity.profileId !== profile.id || manifestIdentity.profileVersion !== profile.version) {
    throw new Error("Published curved-cup-v3 manifest identity does not match profile.json");
  }
  const expected = createCurvedCupOpticalProfileV3({ status: "published" });
  if (
    profile.id !== expected.id
    || profile.version !== expected.version
    || profile.status !== "published"
    || profile.checksums.geometry !== expected.checksums.geometry
    || profile.checksums.generator !== expected.checksums.generator
    || JSON.stringify(profile.mapping) !== JSON.stringify(expected.mapping)
  ) {
    throw new Error("Published curved-cup-v3 profile does not match the immutable runtime definition");
  }
  const [width, height] = profile.mapping.lutSize;
  if (uvBytes.byteLength !== width * height * 2 * Float32Array.BYTES_PER_ELEMENT) {
    throw new Error("Published curved-cup-v3 LUT byte length is invalid");
  }
  if (maskBytes.byteLength !== width * height) {
    throw new Error("Published curved-cup-v3 valid-mask byte length is invalid");
  }
  const targetUvView = new Float32Array(
    uvBytes.buffer,
    uvBytes.byteOffset,
    uvBytes.byteLength / Float32Array.BYTES_PER_ELEMENT
  );
  const lut = {
    width,
    height,
    targetUv: Float32Array.from(targetUvView),
    validMask: Uint8Array.from(maskBytes)
  };
  const computedLutChecksum = fnv1a64(lut.targetUv) + fnv1a64(lut.validMask);
  if (!profile.checksums.lut || profile.checksums.lut !== computedLutChecksum) {
    throw new Error("Published curved-cup-v3 LUT checksum does not match profile.json");
  }

  const targetToPlate = generateTargetPlateMap(profile);
  const generatedCoreMask = buildTargetCoreMask(profile, targetToPlate);
  const decoded = await sharp(coreMaskPng).raw().toBuffer({ resolveWithObject: true });
  if (decoded.info.width !== targetToPlate.width || decoded.info.height !== targetToPlate.height) {
    throw new Error("Published curved-cup-v3 target core mask dimensions are invalid");
  }
  const publishedCoreMask = new Uint8Array(targetToPlate.width * targetToPlate.height);
  for (let pixel = 0; pixel < publishedCoreMask.length; pixel += 1) {
    const value = decoded.data[pixel * decoded.info.channels];
    for (let channel = 1; channel < decoded.info.channels; channel += 1) {
      if (decoded.data[pixel * decoded.info.channels + channel] !== value) {
        throw new Error("Published curved-cup-v3 target core mask must be grayscale");
      }
    }
    publishedCoreMask[pixel] = value;
    if (publishedCoreMask[pixel] !== generatedCoreMask[pixel]) {
      throw new Error("Published curved-cup-v3 target core mask differs from the reversible generator");
    }
  }

  return {
    profile,
    lut,
    targetToPlate,
    targetCoreMask: publishedCoreMask,
    evidence: {
      profileSha256: sha256(profileBytes),
      lutSha256: sha256(uvBytes),
      validMaskSha256: sha256(maskBytes),
      coreMaskPngSha256: sha256(coreMaskPng)
    }
  };
}

type OpticalReviewCase = Readonly<{
  images: Readonly<Record<
    "reference" | "targetStyled" | "targetPlate" | "targetProof" | "platePlate" | "plateProof" |
    "constrainedPlate" | "constrainedProof",
    RawRgbaImage
  >>;
  manifest: Record<string, unknown>;
}>;

async function generateOpticalReviewCase(
  source: RawRgbaImage,
  preset: ReviewPreset,
  lut: PlateTargetLut,
  targetToPlate: ReturnType<typeof generateTargetPlateMap>,
  targetCoreMask: Uint8Array,
  targetPhysical: StylePhysicalSpec
): Promise<OpticalReviewCase> {
  const crop = { centerX: 0.5, centerY: 0.5, scale: 1 } as const;
  const targetStyled = await executeStyle(preset.provider, source, {
    params: preset.params,
    seed: 20260718,
    domain: "target",
    physical: targetPhysical
  });
  const targetPlate = renderCanonicalPlate({ size: PLATE_SIZE, source: targetStyled.image, lut, crop });
  const targetProof = applyTargetCoreMask(
    renderOpticalProof(targetPlate, targetToPlate, OPTICAL_SIZE),
    targetCoreMask,
    targetToPlate.width,
    targetToPlate.height
  );

  const identityPlate = renderCanonicalPlate({ size: PLATE_SIZE, source, lut, crop });
  const plateStyled = await executeStyle(preset.provider, identityPlate, {
    params: preset.params,
    seed: 20260718,
    domain: "plate",
    physical: PLATE_PHYSICAL
  });
  const plateProof = applyTargetCoreMask(
    renderOpticalProof(plateStyled.image, targetToPlate, OPTICAL_SIZE),
    targetCoreMask,
    targetToPlate.width,
    targetToPlate.height
  );

  const constrained = await executeStyle(preset.provider, identityPlate, {
    params: preset.params,
    seed: 20260718,
    domain: "plate-constrained",
    physical: PLATE_PHYSICAL
  }, {
    candidateParams: preset.constrainedCandidates,
    evaluate(candidate) {
      return proofMetrics(applyTargetCoreMask(
        renderOpticalProof(candidate, targetToPlate, OPTICAL_SIZE),
        targetCoreMask,
        targetToPlate.width,
        targetToPlate.height
      ), source).mse;
    }
  });
  const constrainedProof = applyTargetCoreMask(
    renderOpticalProof(constrained.image, targetToPlate, OPTICAL_SIZE),
    targetCoreMask,
    targetToPlate.width,
    targetToPlate.height
  );

  const targetLoopMetrics = proofMetrics(targetProof, targetStyled.image);
  const targetSourceMetrics = proofMetrics(targetProof, source);
  const plateSourceMetrics = proofMetrics(plateProof, source);
  const constrainedSourceMetrics = proofMetrics(constrainedProof, source);

  return {
    images: {
      reference: source,
      targetStyled: targetStyled.image,
      targetPlate,
      targetProof,
      platePlate: plateStyled.image,
      plateProof,
      constrainedPlate: constrained.image,
      constrainedProof
    },
    manifest: {
      style: preset.slug,
      targetRecipe: JSON.parse(serializeStyleRecipe(targetStyled.recipe)),
      plateRecipe: JSON.parse(serializeStyleRecipe(plateStyled.recipe)),
      constrainedRecipe: JSON.parse(serializeStyleRecipe(constrained.recipe)),
      constrainedCandidateCount: preset.constrainedCandidates.length + 1,
      constrainedScore: constrained.score === undefined ? null : Math.round(constrained.score * 1e6) / 1e6,
      metrics: {
        targetLoopAgainstStyledGoal: roundedMetrics(targetLoopMetrics),
        targetProofAgainstSource: roundedMetrics(targetSourceMetrics),
        plateProofAgainstSource: roundedMetrics(plateSourceMetrics),
        constrainedProofAgainstSource: roundedMetrics(constrainedSourceMetrics)
      }
    }
  };
}

const OPTICAL_COLUMNS = [
  { key: "reference", label: "Original target" },
  { key: "targetStyled", label: "TARGET · styled goal" },
  { key: "targetPlate", label: "TARGET · plate" },
  { key: "targetProof", label: "TARGET · reflection" },
  { key: "platePlate", label: "PLATE · plate" },
  { key: "plateProof", label: "PLATE · reflection" },
  { key: "constrainedPlate", label: "CONSTRAINED · plate" },
  { key: "constrainedProof", label: "CONSTRAINED · reflection" }
] as const;

function psnrLabel(value: unknown): string {
  return typeof value === "number" ? `${value.toFixed(1)} dB` : "lossless";
}

function constrainedParamLabel(style: string, params: Record<string, number>): string {
  if (style === "square-mosaic") return `cell ${params.cellSizeMm} mm`;
  if (style === "hex-mosaic") return `diam ${params.cellDiameterMm} mm`;
  if (style === "clustered-dot") {
    return `p${params.pitchMm} · d${params.minDotDiameterMm}-${params.maxDotDiameterMm} mm`;
  }
  if (style.startsWith("bayer-")) return `${params.matrixSize}x${params.matrixSize} · p${params.samplePitchMm} mm`;
  return `${params.kernel === 1 ? "FS" : "Stucki"} · p${params.samplePitchMm} mm`;
}

async function createOpticalContactSheet(
  cases: readonly OpticalReviewCase[]
): Promise<Buffer> {
  const thumbSize = 150;
  const headerHeight = 54;
  const labelHeight = 38;
  const rowHeight = thumbSize + labelHeight;
  const width = OPTICAL_COLUMNS.length * thumbSize;
  const height = headerHeight + cases.length * rowHeight;
  const composites: Array<{ input: Buffer; left: number; top: number }> = [];

  for (let column = 0; column < OPTICAL_COLUMNS.length; column += 1) {
    composites.push({
      input: labelSvg(thumbSize, headerHeight, OPTICAL_COLUMNS[column].label, 12),
      left: column * thumbSize,
      top: 0
    });
  }
  for (let row = 0; row < cases.length; row += 1) {
    const reviewCase = cases[row];
    const style = String(reviewCase.manifest.style);
    const metrics = reviewCase.manifest.metrics as Record<string, Record<string, unknown>>;
    const constrainedRecipe = reviewCase.manifest.constrainedRecipe as { params: Record<string, number> };
    for (let column = 0; column < OPTICAL_COLUMNS.length; column += 1) {
      const key = OPTICAL_COLUMNS[column].key;
      const image = reviewCase.images[key];
      const png = await encode(image);
      const thumbnail = await sharp(png)
        .resize(thumbSize, thumbSize, { fit: "contain", background: "#f5f1e8" })
        .toBuffer();
      let footer = style;
      if (key === "targetProof") {
        footer = `${style} · loop ${psnrLabel(metrics.targetLoopAgainstStyledGoal.psnrDb)}`;
      } else if (key === "plateProof") {
        footer = `${style} · ${psnrLabel(metrics.plateProofAgainstSource.psnrDb)}`;
      } else if (key === "constrainedProof") {
        footer = `${style} · ${psnrLabel(metrics.constrainedProofAgainstSource.psnrDb)}`;
      } else if (key === "constrainedPlate") {
        footer = constrainedParamLabel(style, constrainedRecipe.params);
      }
      composites.push({ input: thumbnail, left: column * thumbSize, top: headerHeight + row * rowHeight });
      composites.push({
        input: labelSvg(thumbSize, labelHeight, footer, 9),
        left: column * thumbSize,
        top: headerHeight + row * rowHeight + thumbSize
      });
    }
  }

  return sharp({ create: { width, height, channels: 4, background: "#f5f1e8" } })
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function main(): Promise<void> {
  await mkdir(path.join(OUTPUT_ROOT, "inputs"), { recursive: true });
  await mkdir(path.join(OUTPUT_ROOT, "outputs"), { recursive: true });
  await mkdir(path.join(OUTPUT_ROOT, "optical-domains"), { recursive: true });
  const optics = await loadPublishedV3Optics();
  const { profile, lut, targetToPlate, targetCoreMask } = optics;
  const targetPhysical: StylePhysicalSpec = {
    widthMm: profile.designCamera.targetFrame.width * 1_000,
    heightMm: profile.designCamera.targetFrame.height * 1_000,
    minFeatureMm: 0.4,
    minPitchMm: 0.6
  };
  const manifestOutputs: Array<Record<string, unknown>> = [];
  const rendered = new Map<string, Buffer>();

  for (const fixture of FIXTURES) {
    const inputBuffer = await encode(fixture.image);
    const inputPath = `inputs/${fixture.slug}.png`;
    await writeFile(path.join(OUTPUT_ROOT, inputPath), inputBuffer);
    rendered.set(`${fixture.slug}:input`, inputBuffer);
    manifestOutputs.push({ fixture: fixture.slug, style: "input", path: inputPath, sha256: sha256(inputBuffer) });

    await mkdir(path.join(OUTPUT_ROOT, "outputs", fixture.slug), { recursive: true });
    for (const preset of PRESETS) {
      const result = await executeStyle(preset.provider, fixture.image, {
        params: preset.params,
        seed: 20260718,
        domain: "target",
        physical: PHYSICAL
      });
      const buffer = await encode(result.image);
      const outputPath = `outputs/${fixture.slug}/${preset.slug}.png`;
      await writeFile(path.join(OUTPUT_ROOT, outputPath), buffer);
      rendered.set(`${fixture.slug}:${preset.slug}`, buffer);
      manifestOutputs.push({
        fixture: fixture.slug,
        style: preset.slug,
        path: outputPath,
        sha256: sha256(buffer),
        recipe: JSON.parse(serializeStyleRecipe(result.recipe))
      });
    }
  }

  const thumbWidth = 200;
  const thumbHeight = 150;
  const headerHeight = 54;
  const labelHeight = 32;
  const rowHeight = thumbHeight + labelHeight;
  const columns = [{ slug: "input", label: "Input" }, ...PRESETS];
  const sheetWidth = columns.length * thumbWidth;
  const sheetHeight = headerHeight + FIXTURES.length * rowHeight;
  const composites: Array<{ input: Buffer; left: number; top: number }> = [];
  for (let column = 0; column < columns.length; column += 1) {
    composites.push({ input: labelSvg(thumbWidth, headerHeight, columns[column].label, 15), left: column * thumbWidth, top: 0 });
  }
  for (let row = 0; row < FIXTURES.length; row += 1) {
    const fixture = FIXTURES[row];
    for (let column = 0; column < columns.length; column += 1) {
      const key = `${fixture.slug}:${columns[column].slug}`;
      const thumbnail = await sharp(rendered.get(key))
        .resize(thumbWidth, thumbHeight, { fit: "fill" })
        .toBuffer();
      composites.push({ input: thumbnail, left: column * thumbWidth, top: headerHeight + row * rowHeight });
      composites.push({
        input: labelSvg(thumbWidth, labelHeight, column === 0 ? fixture.label : `${fixture.label} · ${columns[column].label}`, 11),
        left: column * thumbWidth,
        top: headerHeight + row * rowHeight + thumbHeight
      });
    }
  }
  const contactSheet = await sharp({
    create: { width: sheetWidth, height: sheetHeight, channels: 4, background: "#f5f1e8" }
  }).composite(composites).png({ compressionLevel: 9 }).toBuffer();
  await writeFile(path.join(OUTPUT_ROOT, "review-contact-sheet.png"), contactSheet);

  const opticalDomains: Array<Record<string, unknown>> = [];
  for (const fixture of FIXTURES) {
    process.stdout.write(`Generating curved-cup-v3 optical domain review for ${fixture.slug}...\n`);
    const source = letterboxSquare(fixture.image);
    const cases: OpticalReviewCase[] = [];
    for (const preset of PRESETS) {
      cases.push(await generateOpticalReviewCase(
        source,
        preset,
        lut,
        targetToPlate,
        targetCoreMask,
        targetPhysical
      ));
    }
    const opticalContactSheet = await createOpticalContactSheet(cases);
    const relativePath = `optical-domains/${fixture.slug}-contact-sheet.png`;
    await writeFile(path.join(OUTPUT_ROOT, relativePath), opticalContactSheet);
    opticalDomains.push({
      fixture: fixture.slug,
      path: relativePath,
      sha256: sha256(opticalContactSheet),
      cases: cases.map((reviewCase) => reviewCase.manifest)
    });
  }

  const manifest = {
    schemaVersion: 3,
    generatorVersion: "style-lab-optical-domains-v3",
    deterministicSeed: 20260718,
    colourAndMetric: {
      processing: "8-bit sRGB-domain RGBA; source alpha preserved",
      score: "RGB MSE and derived PSNR on the 3x3-eroded reversible target core",
      warning: "Research ranking only; not perceptual, ICC or physical-print validation"
    },
    dimensions: { width: WIDTH, height: HEIGHT },
    physical: PHYSICAL,
    rasterization: {
      flat: {
        pixels: [WIDTH, HEIGHT],
        frameMm: [PHYSICAL.widthMm, PHYSICAL.heightMm]
      },
      target: {
        pixels: [OPTICAL_SIZE, OPTICAL_SIZE],
        frameMm: [targetPhysical.widthMm, targetPhysical.heightMm],
        mmPerPixel: [targetPhysical.widthMm / OPTICAL_SIZE, targetPhysical.heightMm / OPTICAL_SIZE]
      },
      plate: {
        pixels: [PLATE_SIZE, PLATE_SIZE],
        diameterMm: PLATE_DIAMETER_MM,
        mmPerPixel: PLATE_DIAMETER_MM / PLATE_SIZE,
        note: "millimetre parameters are conservatively rounded upward to whole pixels"
      }
    },
    opticalProfile: {
      id: profile.id,
      version: profile.version,
      geometryChecksum: profile.checksums.geometry,
      generatorChecksum: profile.checksums.generator,
      lutChecksum: profile.checksums.lut,
      ...optics.evidence
    },
    contactSheet: { path: "review-contact-sheet.png", sha256: sha256(contactSheet) },
    outputs: manifestOutputs,
    opticalDomains
  };
  await writeFile(path.join(OUTPUT_ROOT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  process.stdout.write(
    `Generated ${manifestOutputs.length} flat review images and ${opticalDomains.length} optical domain sheets in ${OUTPUT_ROOT}\n`
  );
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
