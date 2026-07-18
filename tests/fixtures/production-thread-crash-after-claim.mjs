import { parentPort } from "node:worker_threads";

parentPort.postMessage({ type: "claimed", leaseToken: "fixture-lease" });
setImmediate(() => {
  throw new Error("fixture crash after claim");
});
