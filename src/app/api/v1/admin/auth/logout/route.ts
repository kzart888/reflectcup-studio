import { NextRequest } from "next/server";

import { ADMIN_COOKIE_NAME } from "@/lib/constants";
import { adminCookieOptions, authenticateAdmin, logoutAdmin } from "@/domains/auth/admin-service";
import { apiErrorResponse, dataResponse, enforceSameOrigin } from "@/domains/auth/http";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    enforceSameOrigin(request);
    const principal = await authenticateAdmin(request);
    await logoutAdmin(request, principal);
    const response = dataResponse({ loggedOut: true });
    response.cookies.set(ADMIN_COOKIE_NAME, "", adminCookieOptions(0));
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}
