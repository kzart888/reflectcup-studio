import { WorkGate } from "@/lib/work-gate";

// Argon2 is deliberately expensive. Keep its memory/CPU use bounded even when
// an attacker distributes requests across many email addresses and IPs.
const argon2WorkGate = new WorkGate(2, 8, "LOGIN_PASSWORD_CAPACITY_EXCEEDED");

export function runArgon2Work<T>(work: () => Promise<T>): Promise<T> {
  return argon2WorkGate.run(work);
}
