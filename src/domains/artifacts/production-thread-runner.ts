import { Worker } from "node:worker_threads";

import type { ProductionExecutionResult, QueuedProductionJob } from "@/domains/artifacts/render-service";

type ProductionThreadMessage =
  | { type: "claimed"; leaseToken: string }
  | { type: "result"; result: ProductionExecutionResult };

export interface ProductionThreadRunnerOptions {
  entryUrl: URL;
  job: QueuedProductionJob;
  timeoutMs: number;
  heartbeatIntervalMs: number;
  heartbeat: (jobId: string, leaseToken: string) => Promise<boolean>;
  failClaimedJob: (jobId: string, error: unknown, leaseToken: string) => Promise<void>;
  onDiagnostic?: (message: string, error?: unknown) => void;
}

/**
 * Executes one production job in an isolated Node worker thread. The parent
 * thread owns the lease heartbeat because CPU-heavy pixel generation can block
 * timers inside the rendering thread.
 */
export function runProductionJobThread(options: ProductionThreadRunnerOptions): Promise<ProductionExecutionResult> {
  const worker = new Worker(options.entryUrl, {
    workerData: options.job,
    name: `reflectcup-production-${options.job.id}`
  });

  return new Promise((resolve) => {
    let claimed = false;
    let leaseToken: string | undefined;
    let settled = false;
    let failurePending = false;
    let heartbeatTimer: NodeJS.Timeout | undefined;

    const clearTimers = () => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
    };

    const finish = (result: ProductionExecutionResult) => {
      if (settled || failurePending) return;
      settled = true;
      clearTimers();
      resolve(result);
    };

    const failAfterUnexpectedExit = (error: unknown) => {
      if (settled || failurePending) return;
      failurePending = true;
      // A worker can emit `error` just before a previously posted `claimed`
      // message reaches the parent. Give the message queue one turn so a
      // claimed DB row is failed immediately rather than waiting for recovery.
      setImmediate(() => {
        if (settled) return;
        settled = true;
        clearTimers();
        void (claimed && leaseToken
          ? options.failClaimedJob(options.job.id, error, leaseToken).catch((persistenceError: unknown) => {
              options.onDiagnostic?.("Could not persist a crashed production job", persistenceError);
            })
          : Promise.resolve()).finally(() => resolve(claimed ? "failed" : "not_claimed"));
      });
    };

    worker.on("message", (message: ProductionThreadMessage) => {
      if (message.type === "claimed" && !claimed && typeof message.leaseToken === "string") {
        claimed = true;
        leaseToken = message.leaseToken;
        heartbeatTimer = setInterval(() => {
          void options.heartbeat(options.job.id, message.leaseToken)
            .then((active) => {
              if (!active && !settled) {
                void worker.terminate().finally(() => {
                  failAfterUnexpectedExit(new Error("Production job lease is no longer active"));
                });
              }
            })
            .catch((error: unknown) => {
              options.onDiagnostic?.("Production-job heartbeat failed", error);
            });
        }, options.heartbeatIntervalMs);
        heartbeatTimer.unref();
        return;
      }
      if (message.type === "result") finish(message.result);
    });

    worker.once("error", (error) => failAfterUnexpectedExit(error));
    worker.once("exit", (code) => {
      if (!settled) {
        failAfterUnexpectedExit(new Error(`Production worker thread exited before reporting a result (code ${code})`));
      }
    });

    const timeoutTimer = setTimeout(() => {
      const error = new Error(`Production rendering exceeded ${options.timeoutMs} ms`);
      void worker.terminate().finally(() => failAfterUnexpectedExit(error));
    }, options.timeoutMs);
    timeoutTimer.unref();
  });
}
