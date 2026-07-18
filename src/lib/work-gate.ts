import { ApiError } from "@/domains/auth/http";

/** Small in-process backpressure gate for CPU/memory-heavy local MVP work. */
export class WorkGate {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(
    private readonly concurrency: number,
    private readonly maximumQueue: number,
    private readonly errorCode: string
  ) {}

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.active >= this.concurrency) {
      if (this.waiters.length >= this.maximumQueue) {
        throw new ApiError(429, this.errorCode, "The server is busy with similar work. Try again shortly.");
      }
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.active += 1;
    try {
      return await work();
    } finally {
      this.active -= 1;
      this.waiters.shift()?.();
    }
  }
}
