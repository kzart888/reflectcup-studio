import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { FilesystemStorage } from "@/storage/filesystem-storage";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("FilesystemStorage", () => {
  it("streams stored objects without first materializing the complete file", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "reflectcup-storage-stream-"));
    roots.push(root);
    const storage = new FilesystemStorage(root);
    const bytes = Uint8Array.from({ length: 64 * 1024 }, (_, index) => index % 251);
    await storage.put("session/source.bin", bytes);

    const stream = await storage.openReadStream("session/source.bin");
    const streamed = new Uint8Array(await new Response(stream).arrayBuffer());
    expect(streamed).toEqual(bytes);
  });

  it("removes its temporary file when the atomic rename fails", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "reflectcup-storage-failure-"));
    roots.push(root);
    const storage = new FilesystemStorage(root);
    await mkdir(path.join(root, "collision"));

    await expect(storage.put("collision", Uint8Array.of(1, 2, 3))).rejects.toBeTruthy();
    expect((await readdir(root)).filter((entry) => entry.endsWith(".tmp"))).toEqual([]);
  });
});
