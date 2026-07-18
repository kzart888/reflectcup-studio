import { createHash, createHmac, randomBytes } from "node:crypto";

import { hash, verify } from "@node-rs/argon2";

const PASSWORD_MIN_LENGTH = 12;
const ARGON2_OPTIONS = {
  algorithm: 2,
  memoryCost: 64 * 1024,
  timeCost: 3,
  parallelism: 1,
  outputLen: 32
} as const;

let dummyPasswordHash: Promise<string> | undefined;

export function createOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function sha256(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function assertStrongPassword(password: string): void {
  if (password.length < PASSWORD_MIN_LENGTH || password.length > 256) {
    throw new Error(`Password must contain between ${PASSWORD_MIN_LENGTH} and 256 characters`);
  }
}

export function hashPassword(password: string): Promise<string> {
  assertStrongPassword(password);
  return hash(password, ARGON2_OPTIONS);
}

export function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return verify(passwordHash, password);
}

export async function consumeComparablePasswordWork(password: string): Promise<void> {
  dummyPasswordHash ??= hash("reflectcup-invalid-account-password", ARGON2_OPTIONS);
  await verify(await dummyPasswordHash, password);
}

export function hashClientAddress(address: string): string {
  const secret = process.env.SESSION_SECRET;
  const insecurePlaceholder = "replace-with-at-least-32-random-bytes";
  if (!secret || secret.length < 32 || secret === insecurePlaceholder) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET must be a non-default secret containing at least 32 characters");
    }
    return sha256(`development-only:${address}`);
  }
  return createHmac("sha256", secret).update(address, "utf8").digest("hex");
}

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
}
