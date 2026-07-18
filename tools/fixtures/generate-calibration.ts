import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const size = 2048;
const cells = 16;
const cell = size / cells;
const output = resolve(process.cwd(), "public", "calibration");

function checkerboard() {
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const light = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0;
      const value = light ? 244 : 24;
      rgba[index] = value;
      rgba[index + 1] = value;
      rgba[index + 2] = value;
      rgba[index + 3] = 255;
    }
  }
  return rgba;
}

const numberedCells = Array.from({ length: cells * cells }, (_, index) => {
  const row = Math.floor(index / cells);
  const column = index % cells;
  const x = column * cell;
  const y = row * cell;
  const light = (row + column) % 2 === 0;
  return `<text x="${x + 9}" y="${y + 28}" class="cell ${light ? "on-light" : "on-dark"}">${String(row + 1).padStart(2, "0")}-${String(column + 1).padStart(2, "0")}</text>`;
}).join("\n");

const cornerMarks = [
  [cell - 48, cell - 48, "#ed4b3f"],
  [size - 48, cell - 48, "#26a65b"],
  [cell - 48, size - 48, "#2f6fed"],
  [size - 48, size - 48, "#f3ca3e"]
].map(([x, y, fill]) => `<rect x="${x}" y="${y}" width="32" height="32" rx="5" fill="${fill}" stroke="#fff" stroke-width="4"/>`).join("\n");

const labels = `
<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <style>
    .label { font: 700 54px Arial, sans-serif; fill: #ffffff; stroke: #111111; stroke-width: 10px; paint-order: stroke; }
    .small { font: 700 34px Arial, sans-serif; fill: #ffffff; stroke: #111111; stroke-width: 8px; paint-order: stroke; }
    .cell { font: 700 21px Arial, sans-serif; paint-order: stroke; stroke-width: 3px; }
    .on-light { fill: #111111; stroke: #ffffff; }
    .on-dark { fill: #ffffff; stroke: #111111; }
  </style>
  ${cornerMarks}
  <path d="M1024 190 L1024 570 M1024 190 L920 330 M1024 190 L1128 330" fill="none" stroke="#e83b32" stroke-width="42" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M1858 1024 L1478 1024 M1858 1024 L1718 920 M1858 1024 L1718 1128" fill="none" stroke="#2f6fed" stroke-width="42" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="925" y="680" class="label">UP</text>
  <text x="1420" y="950" class="label">RIGHT</text>
  <circle cx="1024" cy="1024" r="102" fill="#ffffff" stroke="#111111" stroke-width="20"/>
  <circle cx="1024" cy="1024" r="22" fill="#111111"/>
  <text x="760" y="1195" class="small">REFLECTCUP 16×16</text>
  ${numberedCells}
</svg>`;

const textOrientationTarget = `
<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f7f2e8"/>
      <stop offset="0.5" stop-color="#d8e9ef"/>
      <stop offset="1" stop-color="#283844"/>
    </linearGradient>
  </defs>
  <rect width="2048" height="2048" fill="url(#background)"/>
  <rect x="96" y="96" width="1856" height="1856" rx="72" fill="none" stroke="#171c20" stroke-width="20"/>
  <path d="M1024 170 L1024 430 M1024 170 L930 290 M1024 170 L1118 290" fill="none" stroke="#e34134" stroke-width="32" stroke-linecap="round"/>
  <path d="M1878 1024 L1618 1024 M1878 1024 L1758 930 M1878 1024 L1758 1118" fill="none" stroke="#235fca" stroke-width="32" stroke-linecap="round"/>
  <g text-anchor="middle" font-family="Arial, sans-serif" fill="#101820">
    <text x="1024" y="610" font-size="126" font-weight="800">REFLECT CUP</text>
    <text x="1024" y="760" font-size="82" font-weight="700">FACE · TEXT · EDGE</text>
    <text x="1024" y="910" font-size="66">ABCDEFGHIJKLMNOPQRSTUVWXYZ</text>
    <text x="1024" y="1025" font-size="66">0123456789</text>
    <text x="1024" y="1170" font-size="96" font-weight="800">UP ↑   RIGHT →</text>
    <text x="1024" y="1320" font-size="60">Readable only at the design view</text>
    <text x="1024" y="1455" font-size="48">Aa Bb Cc · 12 pt · 24 pt · 48 pt</text>
  </g>
  <g fill="none" stroke="#101820">
    <circle cx="1024" cy="1710" r="150" stroke-width="18"/>
    <circle cx="1024" cy="1710" r="75" stroke-width="10"/>
    <path d="M824 1710 H1224 M1024 1510 V1910" stroke-width="10"/>
  </g>
  <rect x="96" y="96" width="180" height="68" fill="#e34134"/>
  <rect x="1772" y="96" width="180" height="68" fill="#2a9d63"/>
  <rect x="96" y="1884" width="180" height="68" fill="#235fca"/>
  <rect x="1772" y="1884" width="180" height="68" fill="#e2bd27"/>
</svg>`;

async function main() {
  await mkdir(output, { recursive: true });
  await sharp(checkerboard(), { raw: { width: size, height: size, channels: 4 } })
    .composite([{ input: Buffer.from(labels) }])
    .png({ compressionLevel: 9 })
    .withMetadata({ density: 300 })
    .toFile(resolve(output, "reflection-checker-2048.png"));

  const frequency = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const band = Math.max(1, Math.floor(2 ** (x / size * 7)));
      const value = Math.floor(y / band) % 2 === 0 ? 245 : 15;
      frequency[index] = value;
      frequency[index + 1] = Math.round(value * (0.65 + 0.35 * x / size));
      frequency[index + 2] = 255 - value * 0.72;
      frequency[index + 3] = 255;
    }
  }

  await sharp(frequency, { raw: { width: size, height: size, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(resolve(output, "frequency-sweep-2048.png"));

  await sharp(Buffer.from(textOrientationTarget))
    .png({ compressionLevel: 9 })
    .withMetadata({ density: 300 })
    .toFile(resolve(output, "text-orientation-2048.png"));

  console.log(`Calibration fixtures written to ${output}`);
}

void main();
