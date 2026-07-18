import { NextRequest } from "next/server";
import { z } from "zod";

import { adminCookieOptions, loginAdmin } from "@/domains/auth/admin-service";
import { apiErrorResponse, ApiError, clientAddress, dataResponse, enforceSameOrigin, parseJson } from "@/domains/auth/http";
import { ADMIN_COOKIE_NAME } from "@/lib/constants";

export const runtime = "nodejs";

const schema = z.object({ email: z.email().max(320), password: z.string().min(1).max(256) }).strict();

export async function POST(request: NextRequest) {
  try {
    enforceSameOrigin(request);
    const parsed = schema.safeParse(await parseJson(request));
    if (!parsed.success) throw new ApiError(400, "VALIDATION_FAILED", "Invalid login request", parsed.error.flatten());
    const result = await loginAdmin(parsed.data.email, parsed.data.password, clientAddress(request));
    const response = dataResponse({
      user: {
        id: result.principal.id,
        email: result.principal.email,
        role: result.principal.role,
        mustChangePassword: result.principal.mustChangePassword
      }
    });
    response.cookies.set(ADMIN_COOKIE_NAME, result.token, adminCookieOptions(result.maxAge));
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}
