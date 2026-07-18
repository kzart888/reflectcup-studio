import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { clientAddress } from "@/domains/auth/http";
import { hashClientAddress } from "@/domains/auth/security";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("client address trust boundary", () => {
  it("ignores forwarding headers unless proxy trust is explicitly enabled", () => {
    delete process.env.TRUST_PROXY_HEADERS;
    const request = new NextRequest("http://127.0.0.1/api", {
      headers: { "x-forwarded-for": "203.0.113.10", "x-real-ip": "203.0.113.11" }
    });
    expect(clientAddress(request)).toBe("unavailable-untrusted-proxy");
  });

  it("uses only a syntactically valid trusted proxy address", () => {
    process.env.TRUST_PROXY_HEADERS = "true";
    expect(
      clientAddress(new NextRequest("http://127.0.0.1/api", { headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.2" } }))
    ).toBe("203.0.113.10");
    expect(
      clientAddress(new NextRequest("http://127.0.0.1/api", { headers: { "x-forwarded-for": "attacker-controlled" } }))
    ).toBe("unavailable-trusted-proxy");
  });

  it("rejects the documented placeholder secret in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", "replace-with-at-least-32-random-bytes");
    expect(() => hashClientAddress("127.0.0.1")).toThrow(/non-default secret/);
  });
});
