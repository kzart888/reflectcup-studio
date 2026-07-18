import { describe, expect, it } from "vitest";

import { runArgon2Work } from "@/domains/auth/password-work-gate";

describe("administrator password work gate", () => {
  it("caps password work at two concurrent jobs and rejects an overfull queue", async () => {
    let releaseBlocker!: () => void;
    const blocker = new Promise<void>((resolve) => {
      releaseBlocker = resolve;
    });
    let active = 0;
    let maximumActive = 0;
    const work = async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await blocker;
      active -= 1;
    };

    const accepted = Array.from({ length: 10 }, () => runArgon2Work(work));
    await expect(runArgon2Work(work)).rejects.toMatchObject({
      status: 429,
      code: "LOGIN_PASSWORD_CAPACITY_EXCEEDED"
    });

    releaseBlocker();
    await Promise.all(accepted);
    expect(maximumActive).toBe(2);
  });
});
