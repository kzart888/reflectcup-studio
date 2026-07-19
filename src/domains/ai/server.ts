import "server-only";

/**
 * Server-only AI entry point. Unlike the shared `@/domains/ai` barrel, this
 * module intentionally reaches Node crypto and Sharp and must not be imported
 * by a Client Component.
 */
export * from "./target-preparation";
