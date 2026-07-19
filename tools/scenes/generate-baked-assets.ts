import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

const SIZE = 1024;

type SoftEllipse = {
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
  rotation: number;
  opacity: number;
  falloff: number;
};

function ellipseAlpha(x: number, y: number, ellipse: SoftEllipse): number {
  const cosine = Math.cos(ellipse.rotation);
  const sine = Math.sin(ellipse.rotation);
  const dx = x - ellipse.centerX;
  const dy = y - ellipse.centerY;
  const localX = cosine * dx + sine * dy;
  const localY = -sine * dx + cosine * dy;
  const distance = Math.sqrt(
    (localX * localX) / (ellipse.radiusX * ellipse.radiusX) +
    (localY * localY) / (ellipse.radiusY * ellipse.radiusY),
  );
  const edge = Math.max(0, 1 - distance);
  return ellipse.opacity * Math.pow(edge, ellipse.falloff);
}

async function writeShadow(
  outputPath: string,
  ellipses: readonly SoftEllipse[],
  color: readonly [number, number, number],
): Promise<void> {
  const rgba = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const u = (x + 0.5) / SIZE;
      const v = (y + 0.5) / SIZE;
      let remaining = 1;
      for (const ellipse of ellipses) remaining *= 1 - ellipseAlpha(u, v, ellipse);
      const alpha = Math.round(255 * (1 - remaining));
      const offset = (y * SIZE + x) * 4;
      rgba[offset] = color[0];
      rgba[offset + 1] = color[1];
      rgba[offset + 2] = color[2];
      rgba[offset + 3] = alpha;
    }
  }
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    await sharp(rgba, { raw: { width: SIZE, height: SIZE, channels: 4 } })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer(),
  );
}

async function main(): Promise<void> {
  const root = process.cwd();
  await Promise.all([
    writeShadow(
      path.join(root, "public/scenes/shared/f30bf914fdcc7fc6/cup-contact-ao.png"),
      [
        { centerX: 0.3356, centerY: 0.5, radiusX: 0.235, radiusY: 0.22, rotation: 0, opacity: 0.26, falloff: 3.8 },
        { centerX: 0.3356, centerY: 0.5, radiusX: 0.185, radiusY: 0.175, rotation: 0, opacity: 0.22, falloff: 1.8 },
      ],
      [28, 24, 20],
    ),
    writeShadow(
      path.join(root, "public/scenes/warm-craftsman-home/v2/table-shadow.png"),
      [
        { centerX: 0.46, centerY: 0.5, radiusX: 0.3, radiusY: 0.23, rotation: -0.12, opacity: 0.25, falloff: 2.7 },
        { centerX: 0.62, centerY: 0.57, radiusX: 0.32, radiusY: 0.12, rotation: 0.22, opacity: 0.15, falloff: 2.4 },
        { centerX: 0.42, centerY: 0.49, radiusX: 0.16, radiusY: 0.12, rotation: 0, opacity: 0.2, falloff: 1.9 },
      ],
      [36, 29, 22],
    ),
    writeShadow(
      path.join(root, "public/scenes/forest-camp-evening/v2/table-shadow.png"),
      [
        { centerX: 0.54, centerY: 0.5, radiusX: 0.31, radiusY: 0.23, rotation: 0.1, opacity: 0.3, falloff: 2.6 },
        { centerX: 0.37, centerY: 0.43, radiusX: 0.34, radiusY: 0.12, rotation: 0.28, opacity: 0.2, falloff: 2.5 },
        { centerX: 0.58, centerY: 0.5, radiusX: 0.16, radiusY: 0.12, rotation: 0, opacity: 0.24, falloff: 1.8 },
      ],
      [18, 20, 17],
    ),
    writeShadow(
      path.join(root, "public/scenes/studio-neutral/v2/table-shadow.png"),
      [
        { centerX: 0.5, centerY: 0.5, radiusX: 0.3, radiusY: 0.23, rotation: 0, opacity: 0.22, falloff: 2.8 },
        { centerX: 0.58, centerY: 0.52, radiusX: 0.24, radiusY: 0.1, rotation: 0.18, opacity: 0.12, falloff: 2.4 },
      ],
      [29, 30, 28],
    ),
  ]);
  process.stdout.write("Generated baked contact and table-shadow assets.\n");
}

void main();
