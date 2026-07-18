import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { zlibSync } from "fflate";

const size = 2048;
const cells = 16;
const cell = size / cells;
const output = resolve(process.cwd(), "public", "calibration");
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

type Color = readonly [number, number, number, number];

function crc32(value: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of value) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data = Buffer.alloc(0)): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, checksum]);
}

/**
 * Encode RGBA pixels without native image libraries. The pure-JS compressor,
 * fixed filter strategy and explicit metadata make committed fixtures byte-for-
 * byte identical on Windows and Linux CI.
 */
function encodePng(pixels: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const pixelsPerMeter = Math.round(300 / 0.0254);
  const physicalDimensions = Buffer.alloc(9);
  physicalDimensions.writeUInt32BE(pixelsPerMeter, 0);
  physicalDimensions.writeUInt32BE(pixelsPerMeter, 4);
  physicalDimensions[8] = 1;

  const stride = size * 4;
  const scanlines = Buffer.alloc((stride + 1) * size);
  for (let row = 0; row < size; row += 1) {
    const target = row * (stride + 1);
    scanlines[target] = 0;
    pixels.copy(scanlines, target + 1, row * stride, (row + 1) * stride);
  }

  const compressed = Buffer.from(zlibSync(scanlines, { level: 9 }));
  return Buffer.concat([
    pngSignature,
    pngChunk("IHDR", ihdr),
    pngChunk("sRGB", Buffer.from([0])),
    pngChunk("pHYs", physicalDimensions),
    pngChunk("IDAT", compressed),
    pngChunk("IEND")
  ]);
}

const FONT: Record<string, readonly string[]> = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"]
};

function putPixel(buffer: Buffer, x: number, y: number, color: Color): void {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const offset = (Math.floor(y) * size + Math.floor(x)) * 4;
  buffer[offset] = color[0];
  buffer[offset + 1] = color[1];
  buffer[offset + 2] = color[2];
  buffer[offset + 3] = color[3];
}

function fillRect(buffer: Buffer, x: number, y: number, width: number, height: number, color: Color): void {
  const startX = Math.max(0, Math.floor(x));
  const startY = Math.max(0, Math.floor(y));
  const endX = Math.min(size, Math.ceil(x + width));
  const endY = Math.min(size, Math.ceil(y + height));
  for (let py = startY; py < endY; py += 1) {
    for (let px = startX; px < endX; px += 1) putPixel(buffer, px, py, color);
  }
}

function strokeRect(buffer: Buffer, x: number, y: number, width: number, height: number, thickness: number, color: Color): void {
  fillRect(buffer, x, y, width, thickness, color);
  fillRect(buffer, x, y + height - thickness, width, thickness, color);
  fillRect(buffer, x, y, thickness, height, color);
  fillRect(buffer, x + width - thickness, y, thickness, height, color);
}

function fillCircle(buffer: Buffer, cx: number, cy: number, radius: number, color: Color): void {
  const radiusSquared = radius * radius;
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= radiusSquared) putPixel(buffer, x, y, color);
    }
  }
}

function strokeCircle(buffer: Buffer, cx: number, cy: number, radius: number, thickness: number, color: Color): void {
  const outer = radius + thickness / 2;
  const inner = Math.max(0, radius - thickness / 2);
  const outerSquared = outer * outer;
  const innerSquared = inner * inner;
  for (let y = Math.floor(cy - outer); y <= Math.ceil(cy + outer); y += 1) {
    for (let x = Math.floor(cx - outer); x <= Math.ceil(cx + outer); x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const distance = dx * dx + dy * dy;
      if (distance <= outerSquared && distance >= innerSquared) putPixel(buffer, x, y, color);
    }
  }
}

function drawLine(buffer: Buffer, x0: number, y0: number, x1: number, y1: number, thickness: number, color: Color): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    fillCircle(buffer, x0 + dx * t, y0 + dy * t, thickness / 2, color);
  }
}

function textWidth(text: string, scale: number): number {
  return Math.max(0, text.length * 6 * scale - scale);
}

function drawText(
  buffer: Buffer,
  text: string,
  x: number,
  y: number,
  scale: number,
  color: Color,
  align: "left" | "center" = "left"
): void {
  const normalized = text.toUpperCase();
  let cursor = align === "center" ? x - textWidth(normalized, scale) / 2 : x;
  for (const character of normalized) {
    const glyph = FONT[character] ?? FONT[" "];
    for (let row = 0; row < glyph.length; row += 1) {
      for (let column = 0; column < glyph[row].length; column += 1) {
        if (glyph[row][column] === "1") fillRect(buffer, cursor + column * scale, y + row * scale, scale, scale, color);
      }
    }
    cursor += 6 * scale;
  }
}

function checkerboard(): Buffer {
  const rgba = Buffer.alloc(size * size * 4);
  const dark: Color = [24, 24, 24, 255];
  const light: Color = [244, 244, 244, 255];
  for (let row = 0; row < cells; row += 1) {
    for (let column = 0; column < cells; column += 1) {
      fillRect(rgba, column * cell, row * cell, cell, cell, (row + column) % 2 === 0 ? light : dark);
    }
  }

  const red: Color = [237, 62, 52, 255];
  const blue: Color = [47, 111, 237, 255];
  drawLine(rgba, 1024, 210, 1024, 570, 34, red);
  drawLine(rgba, 1024, 210, 920, 330, 34, red);
  drawLine(rgba, 1024, 210, 1128, 330, 34, red);
  drawLine(rgba, 1838, 1024, 1478, 1024, 34, blue);
  drawLine(rgba, 1838, 1024, 1718, 920, 34, blue);
  drawLine(rgba, 1838, 1024, 1718, 1128, 34, blue);
  strokeCircle(rgba, 1024, 1024, 102, 20, [17, 17, 17, 255]);
  fillCircle(rgba, 1024, 1024, 82, [255, 255, 255, 255]);
  fillCircle(rgba, 1024, 1024, 22, [17, 17, 17, 255]);
  drawText(rgba, "UP", 1024, 620, 8, [17, 17, 17, 255], "center");
  drawText(rgba, "RIGHT", 1540, 870, 7, [255, 255, 255, 255], "center");
  drawText(rgba, "REFLECTCUP 16-16", 1024, 1160, 6, [255, 255, 255, 255], "center");

  const cornerColors: readonly Color[] = [
    [237, 75, 63, 255],
    [38, 166, 91, 255],
    [47, 111, 237, 255],
    [243, 202, 62, 255]
  ];
  const corners = [[cell - 42, cell - 42], [size - 42, cell - 42], [cell - 42, size - 42], [size - 42, size - 42]] as const;
  corners.forEach(([x, y], index) => {
    fillRect(rgba, x - 3, y - 3, 34, 34, [255, 255, 255, 255]);
    fillRect(rgba, x, y, 28, 28, cornerColors[index]);
  });

  // Labels are drawn last so every cell identifier remains visible even where
  // the optical orientation marks cross the checker.
  for (let row = 0; row < cells; row += 1) {
    for (let column = 0; column < cells; column += 1) {
      const label = `${String(row + 1).padStart(2, "0")}-${String(column + 1).padStart(2, "0")}`;
      const color: Color = (row + column) % 2 === 0 ? [17, 17, 17, 255] : [255, 255, 255, 255];
      drawText(rgba, label, column * cell + 6, row * cell + 6, 3, color);
    }
  }
  return rgba;
}

function textOrientationTarget(): Buffer {
  const rgba = Buffer.alloc(size * size * 4);
  const start = [247, 242, 232] as const;
  const end = [40, 56, 68] as const;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const t = (x + y) / (2 * (size - 1));
      putPixel(rgba, x, y, [
        Math.round(start[0] + (end[0] - start[0]) * t),
        Math.round(start[1] + (end[1] - start[1]) * t),
        Math.round(start[2] + (end[2] - start[2]) * t),
        255
      ]);
    }
  }

  const ink: Color = [16, 24, 32, 255];
  const red: Color = [235, 63, 52, 255];
  const blue: Color = [37, 95, 202, 255];
  strokeRect(rgba, 96, 96, 1856, 1856, 20, ink);
  fillRect(rgba, 96, 96, 180, 68, red);
  fillRect(rgba, 1772, 96, 180, 68, [42, 157, 99, 255]);
  fillRect(rgba, 96, 1884, 180, 68, blue);
  fillRect(rgba, 1772, 1884, 180, 68, [226, 189, 39, 255]);

  drawLine(rgba, 1024, 175, 1024, 405, 28, red);
  drawLine(rgba, 1024, 175, 934, 280, 28, red);
  drawLine(rgba, 1024, 175, 1114, 280, 28, red);
  drawLine(rgba, 1870, 1024, 1640, 1024, 28, blue);
  drawLine(rgba, 1870, 1024, 1765, 934, 28, blue);
  drawLine(rgba, 1870, 1024, 1765, 1114, 28, blue);

  drawText(rgba, "REFLECT CUP", 1024, 480, 18, ink, "center");
  drawText(rgba, "FACE TEXT EDGE", 1024, 690, 12, ink, "center");
  drawText(rgba, "ABCDEFGHIJKLMNOPQRSTUVWXYZ", 1024, 875, 8, ink, "center");
  drawText(rgba, "0123456789", 1024, 1010, 11, ink, "center");
  drawText(rgba, "UP", 730, 1180, 14, ink, "center");
  drawText(rgba, "RIGHT", 1240, 1180, 14, ink, "center");
  drawText(rgba, "DESIGN VIEW ONLY", 1024, 1390, 10, ink, "center");
  drawText(rgba, "A1 B2 C3 12 24 48", 1024, 1510, 8, ink, "center");
  strokeCircle(rgba, 1024, 1740, 145, 18, ink);
  strokeCircle(rgba, 1024, 1740, 72, 10, ink);
  drawLine(rgba, 825, 1740, 1223, 1740, 8, ink);
  drawLine(rgba, 1024, 1541, 1024, 1939, 8, ink);
  return rgba;
}

function frequencySweep(): Buffer {
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
  return frequency;
}

async function writeFixture(name: string, pixels: Buffer): Promise<void> {
  await writeFile(resolve(output, name), encodePng(pixels));
}

async function main() {
  await mkdir(output, { recursive: true });
  await writeFixture("reflection-checker-2048.png", checkerboard());
  await writeFixture("frequency-sweep-2048.png", frequencySweep());
  await writeFixture("text-orientation-2048.png", textOrientationTarget());
  console.log(`Calibration fixtures written to ${output}`);
}

void main();
