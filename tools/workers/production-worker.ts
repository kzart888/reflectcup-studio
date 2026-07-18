import { closeDatabase } from "@/db/client";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  findNextQueuedProductionJob,
  heartbeatProductionJob,
  markProductionJobFailed,
  recoverProductionJobs
} from "@/domains/artifacts/render-service";
import { runProductionJobThread } from "@/domains/artifacts/production-thread-runner";

for (const environmentFile of [".env.local", ".env"]) {
  try {
    // Node 24 loads only currently-unset keys, so orchestrator/container
    // environment variables retain precedence over local developer files.
    process.loadEnvFile(environmentFile);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

const args = new Set(process.argv.slice(2));
const once = args.has("--once");
const durationFromEnvironment = (name: string, fallback: number, minimum: number) => {
  const parsed = Number(process.env[name] ?? fallback);
  return Number.isFinite(parsed) ? Math.max(minimum, parsed) : fallback;
};
const pollMs = durationFromEnvironment("PRODUCTION_WORKER_POLL_MS", 1_000, 100);
const heartbeatMs = durationFromEnvironment("PRODUCTION_WORKER_HEARTBEAT_MS", 30_000, 5_000);
const timeoutMs = durationFromEnvironment("PRODUCTION_WORKER_TIMEOUT_MS", 15 * 60_000, 60_000);
const threadEntryUrl = pathToFileURL(path.join(__dirname, "production-job-thread.cjs"));

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    stopping = true;
  });
}

const delay = (milliseconds: number) => new Promise<void>((resolve) => {
  setTimeout(resolve, milliseconds);
});

async function main(): Promise<void> {
  const recovered = await recoverProductionJobs();
  if (recovered > 0) console.info(`Recovered ${recovered} stale production job(s)`);

  while (!stopping) {
    const job = await findNextQueuedProductionJob();
    if (!job) {
      if (once) return;
      await delay(pollMs);
      continue;
    }

    const result = await runProductionJobThread({
      entryUrl: threadEntryUrl,
      job,
      timeoutMs,
      heartbeatIntervalMs: heartbeatMs,
      heartbeat: heartbeatProductionJob,
      failClaimedJob: markProductionJobFailed,
      onDiagnostic: (message, error) => console.error(message, error)
    });
    console.info(`Production job ${job.id}: ${result}`);
    if (once) return;
  }
}

void main()
  .catch((error: unknown) => {
    console.error("ReflectCup production worker stopped unexpectedly", error);
    process.exitCode = 1;
  })
  .finally(() => closeDatabase());
