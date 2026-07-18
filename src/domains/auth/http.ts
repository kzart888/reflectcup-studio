import { isIP } from "node:net";
import { NextRequest, NextResponse } from "next/server";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

export function apiErrorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status }
    );
  }
  console.error(error);
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "The request could not be completed" } },
    { status: 500 }
  );
}

export function dataResponse<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ data }, init);
}

export function enforceSameOrigin(request: NextRequest): void {
  const origin = request.headers.get("origin");
  const configuredOrigin = process.env.APP_ORIGIN;
  const expected = configuredOrigin ? new URL(configuredOrigin).origin : request.nextUrl.origin;
  if (!origin || origin !== expected) {
    throw new ApiError(403, "ORIGIN_REJECTED", "This write request must originate from the application");
  }
}

export function clientAddress(request: NextRequest): string {
  if (process.env.TRUST_PROXY_HEADERS !== "true") return "unavailable-untrusted-proxy";
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded && isIP(forwarded)) return forwarded;
  const realIp = request.headers.get("x-real-ip")?.trim();
  return realIp && isIP(realIp) ? realIp : "unavailable-trusted-proxy";
}

export async function readBodyLimited(request: NextRequest, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new ApiError(413, "REQUEST_BODY_TOO_LARGE", `Request body may not exceed ${maxBytes} bytes`);
  }
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new ApiError(413, "REQUEST_BODY_TOO_LARGE", `Request body may not exceed ${maxBytes} bytes`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function parseJson<T>(request: NextRequest, maxBytes = 64 * 1024): Promise<T> {
  try {
    const bytes = await readBodyLimited(request, maxBytes);
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON");
  }
}

export async function parseFormDataLimited(request: NextRequest, maxBytes: number): Promise<FormData> {
  const contentType = request.headers.get("content-type");
  if (!contentType?.toLowerCase().startsWith("multipart/form-data;")) {
    throw new ApiError(400, "INVALID_MULTIPART", "Upload must use multipart form data");
  }
  const bytes = await readBodyLimited(request, maxBytes);
  try {
    return await new Request(request.url, {
      method: "POST",
      headers: { "content-type": contentType },
      body: Buffer.from(bytes)
    }).formData();
  } catch {
    throw new ApiError(400, "INVALID_MULTIPART", "Upload must use valid multipart form data");
  }
}
