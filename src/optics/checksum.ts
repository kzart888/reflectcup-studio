/** Stable, dependency-free 64-bit FNV-1a for cache keys (not a security hash). */
export function fnv1a64(value: string | ArrayBufferView): string {
  const bytes = typeof value === "string"
    ? new TextEncoder().encode(value)
    : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}
