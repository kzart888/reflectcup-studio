import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://reflectcup:reflectcup@127.0.0.1:54329/reflectcup"
  },
  strict: true,
  verbose: true
});
