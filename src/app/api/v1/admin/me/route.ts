import { NextRequest } from "next/server";

import { authenticateAdmin } from "@/domains/auth/admin-service";
import { apiErrorResponse, dataResponse } from "@/domains/auth/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const principal = await authenticateAdmin(request);
    return dataResponse({
      user: {
        id: principal.id,
        email: principal.email,
        role: principal.role,
        mustChangePassword: principal.mustChangePassword
      }
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
