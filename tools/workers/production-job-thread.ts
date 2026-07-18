import { parentPort, workerData } from "node:worker_threads";

import {
  executeProductionBundle,
  type QueuedProductionJob
} from "@/domains/artifacts/render-service";
import { closeDatabase } from "@/db/client";

if (!parentPort) throw new Error("The production job entrypoint must run in a worker thread");
const port = parentPort;

const job = workerData as QueuedProductionJob;

async function main(): Promise<void> {
  try {
    const result = await executeProductionBundle(job.id, job.actorAdminUserId, {
      onClaim: (leaseToken) => port.postMessage({ type: "claimed", leaseToken })
    });
    port.postMessage({ type: "result", result });
  } finally {
    await closeDatabase();
    port.close();
  }
}

void main().catch((error: unknown) => {
  // Surface the exception through worker_threads' `error` event so the parent
  // can mark a claimed job failed (or leave an unclaimed row queued).
  setImmediate(() => {
    throw error;
  });
});
