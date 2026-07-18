import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";

import { closeDatabase, getDatabase } from "../../src/db/client";
import { adminUsers } from "../../src/db/schema";
import { hashPassword, normalizeEmail } from "../../src/domains/auth/security";
import { findAdminByEmail } from "../../src/repositories/admin";

function loadLocalEnvironment(): void {
  for (const candidate of [".env.local", ".env"]) {
    if (existsSync(candidate)) process.loadEnvFile(candidate);
  }
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  loadLocalEnvironment();
  const email = normalizeEmail(argument("email") ?? process.env.ADMIN_EMAIL ?? "");
  if (!email || !email.includes("@")) {
    throw new Error("Provide an owner email with --email owner@example.com or ADMIN_EMAIL");
  }
  if (await findAdminByEmail(email)) throw new Error(`An administrator already exists for ${email}`);
  const suppliedPassword = argument("password") ?? process.env.ADMIN_INITIAL_PASSWORD;
  const password = suppliedPassword || `${randomBytes(18).toString("base64url")}Aa1!`;
  const [owner] = await getDatabase()
    .insert(adminUsers)
    .values({
      email,
      passwordHash: await hashPassword(password),
      role: "owner",
      mustChangePassword: true
    })
    .returning();

  process.stdout.write(`Created owner ${owner.email}.\n`);
  process.stdout.write(`Initial password (shown once): ${password}\n`);
  process.stdout.write("The owner must change this password after the first login.\n");
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(closeDatabase);
