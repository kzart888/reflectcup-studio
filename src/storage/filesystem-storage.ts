import { createReadStream } from "node:fs";
import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";

import type { StorageAdapter, StoredObject } from "@/storage/storage-adapter";

export class FilesystemStorage implements StorageAdapter {
  private readonly root: string;

  constructor(root = process.env.STORAGE_ROOT ?? "./storage") {
    this.root = path.resolve(root);
  }

  private resolveKey(key: string): string {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9/_\-.]*$/.test(key) || key.includes("..")) {
      throw new Error("Invalid storage key");
    }

    const resolved = path.resolve(this.root, key);
    const relative = path.relative(this.root, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Storage key escapes the configured root");
    }

    return resolved;
  }

  async put(key: string, body: Uint8Array): Promise<StoredObject> {
    const destination = this.resolveKey(key);
    await mkdir(path.dirname(destination), { recursive: true });
    const temporary = `${destination}.${randomUUID()}.tmp`;
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(temporary, "wx", 0o600);
      await handle.writeFile(body);
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(temporary, destination);
    } catch (error) {
      if (handle) await handle.close().catch(() => undefined);
      await rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
    return { key, byteSize: body.byteLength };
  }

  async get(key: string): Promise<Uint8Array> {
    return readFile(this.resolveKey(key));
  }

  async openReadStream(key: string): Promise<ReadableStream<Uint8Array>> {
    const resolved = this.resolveKey(key);
    // Force an early ENOENT/permission failure so the API can still return a
    // structured response before response headers have been committed.
    await stat(resolved);
    return Readable.toWeb(createReadStream(resolved)) as ReadableStream<Uint8Array>;
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolveKey(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.resolveKey(key));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }
}

let storage: StorageAdapter | undefined;

export function getStorage(): StorageAdapter {
  storage ??= new FilesystemStorage();
  return storage;
}
