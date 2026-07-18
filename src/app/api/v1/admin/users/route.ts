import { asc } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { adminUsers } from "@/db/schema";
import { authenticateAdmin, requireRole, writeAudit } from "@/domains/auth/admin-service";
import { apiErrorResponse, ApiError, dataResponse, enforceSameOrigin, parseJson } from "@/domains/auth/http";
import { hashPassword, normalizeEmail } from "@/domains/auth/security";

export const runtime = "nodejs";

const createSchema = z
  .object({ email: z.email().max(320), password: z.string().min(12).max(256), role: z.enum(["owner", "operator", "viewer"]) })
  .strict();

function serializeUser(user: typeof adminUsers.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    enabled: user.enabled,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt?.toISOString(),
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString()
  };
}

export async function GET(request: NextRequest) {
  try {
    const principal = await authenticateAdmin(request);
    requireRole(principal, "owner");
    const users = await getDatabase().select().from(adminUsers).orderBy(asc(adminUsers.email));
    return dataResponse({ users: users.map(serializeUser) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    enforceSameOrigin(request);
    const principal = await authenticateAdmin(request);
    requireRole(principal, "owner");
    const parsed = createSchema.safeParse(await parseJson(request));
    if (!parsed.success) throw new ApiError(400, "VALIDATION_FAILED", "Invalid administrator", parsed.error.flatten());
    const [user] = await getDatabase()
      .insert(adminUsers)
      .values({
        email: normalizeEmail(parsed.data.email),
        passwordHash: await hashPassword(parsed.data.password),
        role: parsed.data.role,
        mustChangePassword: true
      })
      .returning();
    await writeAudit({ actorAdminUserId: principal.id, action: "admin_user.created", targetType: "admin_user", targetId: user.id });
    return dataResponse({ user: serializeUser(user) }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      return apiErrorResponse(new ApiError(409, "ADMIN_EMAIL_EXISTS", "An administrator with this email already exists"));
    }
    return apiErrorResponse(error);
  }
}
