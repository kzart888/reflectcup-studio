import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { RawRgbaImage } from "@/optics/types";
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
const PHYSICAL: StylePhysicalSpec = {
  widthMm: 96,
  heightMm: 72,
  minFeatureMm: 0.4,
  minPitchMm: 0.6
};

type ReviewPreset = Readonly<{
  slug: string;
  label: string;
  provider: StyleProvider;
  params: StyleParameterMap;
}>;

const PRESETS: readonly ReviewPreset[] = [
  { slug: "square-mosaic", label: "Square mosaic", provider: SQUARE_MOSAIC_PROVIDER, params: { cellSizeMm: 4.8 } },
  { slug: "hex-mosaic", label: "Hex mosaic", provider: HEX_MOSAIC_PROVIDER, params: { cellDiameterMm: 5.4 } },
  {
    slug: "clustered-dot",
    label: "Clustered dots",
    provider: CLUSTERED_DOT_HALFTONE_PROVIDER,
    params: { pitchMm: 2.4, minDotDiameterMm: 0.4, maxDotDiameterMm: 2.2, gamma: 1 }
  },
  { slug: "bayer-4", label: "Bayer 4x4", provider: BAYER_DITHER_PROVIDER, params: { matrixSize: 4, samplePitchMm: 1.2 } },
  { slug: "bayer-8", label: "Bayer 8x8", provider: BAYER_DITHER_PROVIDER, params: { matrixSize: 8, samplePitchMm: 1.2 } },
  { slug: "floyd-steinberg", label: "Floyd-Steinberg", provider: ERROR_DIFFUSION_PROVIDER, params: { kernel: 1, samplePitchMm: 1.2 } },
  { slug: "stucki", label: "Stucki", provider: ERROR_DIFFUSION_PROVIDER, params: { kernel: 2, samplePitchMm: 1.2 } }
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

async function main(): Promise<void> {
  await mkdir(path.join(OUTPUT_ROOT, "inputs"), { recursive: true });
  await mkdir(path.join(OUTPUT_ROOT, "outputs"), { recursive: true });
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

  const manifest = {
    schemaVersion: 1,
    generatorVersion: "style-lab-v1",
    deterministicSeed: 20260718,
    dimensions: { width: WIDTH, height: HEIGHT },
    physical: PHYSICAL,
    contactSheet: { path: "review-contact-sheet.png", sha256: sha256(contactSheet) },
    outputs: manifestOutputs
  };
  await writeFile(path.join(OUTPUT_ROOT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  process.stdout.write(`Generated ${manifestOutputs.length} review images and contact sheet in ${OUTPUT_ROOT}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
