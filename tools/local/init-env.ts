import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const target = resolve(process.cwd(), ".env.local");

if (existsSync(target)) {
  console.log(".env.local already exists; no changes made.");
  process.exit(0);
}

const secret = randomBytes(48).toString("base64url");
const content = [
  "DATABASE_URL=postgresql://reflectcup:reflectcup@127.0.0.1:54329/reflectcup",
  "STORAGE_ROOT=./storage",
  "APP_ORIGIN=http://127.0.0.1:3000",
  `SESSION_SECRET=${secret}`,
  "TRUST_PROXY_HEADERS=false",
  "NEXT_PUBLIC_APP_NAME=ReflectCup Studio",
  ""
].join("\n");

writeFileSync(target, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
console.log("Created .env.local with a random session secret.");
