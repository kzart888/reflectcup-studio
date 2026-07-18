import { parentPort } from "node:worker_threads";

parentPort.postMessage({ type: "claimed", leaseToken: "fixture-lease" });
setTimeout(() => {
  parentPort.postMessage({ type: "result", result: "ready" });
  parentPort.close();
}, 35);
