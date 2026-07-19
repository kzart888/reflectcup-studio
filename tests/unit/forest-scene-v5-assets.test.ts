import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

type GlbDocument = {
  accessors: Array<{ count: number }>;
  extensionsUsed?: string[];
  images?: Array<{ bufferView?: number; uri?: string }>;
  materials?: Array<{
    name?: string;
    alphaMode?: string;
    normalTexture?: unknown;
    pbrMetallicRoughness?: { metallicRoughnessTexture?: unknown };
  }>;
  meshes: Array<{ primitives: Array<{ indices: number }> }>;
  nodes?: Array<{ name?: string }>;
};

function parseGlb(relative: string): { bytes: Buffer; document: GlbDocument } {
  const bytes = readFileSync(path.resolve(relative));
  expect(bytes.subarray(0, 4).toString("ascii")).toBe("glTF");
  expect(bytes.readUInt32LE(4)).toBe(2);
  expect(bytes.readUInt32LE(8)).toBe(bytes.length);
  const jsonLength = bytes.readUInt32LE(12);
  expect(bytes.readUInt32LE(16)).toBe(0x4e4f534a);
  const document = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8").replace(/[\0 ]+$/u, ""));
  return { bytes, document };
}

const EXPECTED = [
  {
    tier: "low",
    bytes: 454_776,
    sha256: "46a9ce4b9e1217a40eedec5cca5e9c33f0564cfcc8ef1e076979749fda6b942e",
    triangles: 5_111,
  },
  {
    tier: "medium",
    bytes: 1_298_620,
    sha256: "3fa78f9e225c8e8f1104cd5c672bb410e2ca9292aeeffa56fddeb90d8c4c287b",
    triangles: 8_785,
  },
  {
    tier: "high",
    bytes: 3_775_268,
    sha256: "149fc9facc78ecc46a35ad302d58aef07d325c70a629df8fae78d35d14f192fa",
    triangles: 17_420,
  },
] as const;

describe("forest camp v5 CC0 derivatives", () => {
  it("ships the official-source 4K high-tier background inside its frozen budget", async () => {
    const relative = "public/scenes/forest-camp-evening/v5/background-4k.webp";
    const bytes = readFileSync(path.resolve(relative));
    expect(bytes.length).toBe(2_894_558);
    expect(createHash("sha256").update(bytes).digest("hex"))
      .toBe("b2c636a6a00b56f1b47a74428bcba301e956059a45188fbe46b3dc29f37168ee");
    await expect(sharp(bytes).metadata()).resolves.toMatchObject({
      format: "webp",
      width: 4096,
      height: 2048,
    });
  });

  for (const expected of EXPECTED) {
    it(`keeps the ${expected.tier} Pine Forest derivative immutable and game-ready`, () => {
      const relative = `public/scenes/forest-camp-evening/v5/models/pine-forest-props-${expected.tier}-${expected.sha256.slice(0, 16)}.glb`;
      const { bytes, document } = parseGlb(relative);
      expect(bytes.length).toBe(expected.bytes);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(expected.sha256);
      expect(document.extensionsUsed).toContain("EXT_meshopt_compression");
      expect(document.nodes).toHaveLength(20);
      expect(document.nodes?.some((node) => node.name === "pine-forest-ground")).toBe(false);
      expect(document.images).toHaveLength(12);
      expect(document.images?.every((image) => image.bufferView !== undefined && image.uri === undefined)).toBe(true);
      const triangles = document.meshes.reduce((total, mesh) => total + mesh.primitives.reduce(
        (meshTotal, primitive) => meshTotal + document.accessors[primitive.indices].count / 3,
        0,
      ), 0);
      expect(triangles).toBe(expected.triangles);
      expect(document.materials).toHaveLength(4);
      expect(document.materials?.some((material) => material.name?.startsWith("pine-forest-ground-"))).toBe(false);
      expect(document.materials?.every((material) => material.normalTexture)).toBe(true);
      expect(document.materials?.every(
        (material) => material.pbrMetallicRoughness?.metallicRoughnessTexture,
      )).toBe(true);
      expect(document.materials?.find((material) => material.name?.startsWith("fern-"))?.alphaMode).toBe("BLEND");
    });
  }
});
