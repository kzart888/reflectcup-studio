import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";

import { runProductionJobThread } from "@/domains/artifacts/production-thread-runner";

const job = {
  id: "00000000-0000-4000-8000-000000000001",
  actorAdminUserId: "00000000-0000-4000-8000-000000000002"
};

function fixture(name: string): URL {
  return pathToFileURL(path.resolve("tests", "fixtures", name));
}

describe("production worker-thread runner", () => {
  it("keeps the claimed job lease alive and returns the child result", async () => {
    const heartbeat = vi.fn(async () => true);
    const failClaimedJob = vi.fn(async () => undefined);

    await expect(runProductionJobThread({
      entryUrl: fixture("production-thread-success.mjs"),
      job,
      timeoutMs: 2_000,
      heartbeatIntervalMs: 5,
      heartbeat,
      failClaimedJob
    })).resolves.toBe("ready");

    expect(heartbeat).toHaveBeenCalled();
    expect(failClaimedJob).not.toHaveBeenCalled();
  });

  it("marks a claimed job failed when its child thread crashes", async () => {
    const failClaimedJob = vi.fn(async () => undefined);

    await expect(runProductionJobThread({
      entryUrl: fixture("production-thread-crash-after-claim.mjs"),
      job,
      timeoutMs: 2_000,
      heartbeatIntervalMs: 50,
      heartbeat: async () => true,
      failClaimedJob
    })).resolves.toBe("failed");

    expect(failClaimedJob).toHaveBeenCalledWith(job.id, expect.any(Error), "fixture-lease");
  });

  it("leaves an unclaimed job queued when the child cannot start", async () => {
    const failClaimedJob = vi.fn(async () => undefined);

    await expect(runProductionJobThread({
      entryUrl: fixture("production-thread-crash-before-claim.mjs"),
      job,
      timeoutMs: 2_000,
      heartbeatIntervalMs: 50,
      heartbeat: async () => true,
      failClaimedJob
    })).resolves.toBe("not_claimed");

    expect(failClaimedJob).not.toHaveBeenCalled();
  });
});
