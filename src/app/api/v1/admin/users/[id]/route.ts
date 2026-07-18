import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { adminSessions, adminUsers } from "@/db/schema";
import { authenticateAdmin, requireRole, writeAudit } from "@/domains/auth/admin-service";
import { apiErrorResponse, ApiError, dataResponse, enforceSameOrigin, parseJson } from "@/domains/auth/http";

export const runtime = "nodejs";

const schema = z
  .object({ role: z.enum(["owner", "operator", "viewer"]).optional(), enabled: z.boolean().optional() })
  .strict()
  .refine((value) => value.role !== undefined || value.enabled !== undefined, "No changes were supplied");

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  try {
    enforceSameOrigin(request);
    const principal = await authenticateAdmin(request);
    requireRole(principal, "owner");
    const { id } = await context.params;
    if (id === principal.id) {
      throw new ApiError(409, "SELF_ROLE_CHANGE_REJECTED", "Use another owner account to change your own role or enabled state");
    }
    const parsed = schema.safeParse(await parseJson(request));
    if (!parsed.success) throw new ApiError(400, "VALIDATION_FAILED", "Invalid administrator update", parsed.error.flatten());
    const [user] = await getDatabase()
      .update(adminUsers)
      .set({ role: parsed.data.role, enabled: parsed.data.enabled, updatedAt: new Date() })
      .where(eq(adminUsers.id, id))
      .returning();
    if (!user) throw new ApiError(404, "ADMIN_NOT_FOUND", "Administrator was not found");
    if (parsed.data.enabled === false || parsed.data.role) {
      await getDatabase().delete(adminSessions).where(eq(adminSessions.adminUserId, id));
    }
    await writeAudit({
      actorAdminUserId: principal.id,
      action: "admin_user.updated",
      targetType: "admin_user",
      targetId: id,
      metadata: parsed.data
    });
    return dataResponse({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        enabled: user.enabled,
        mustChangePassword: user.mustChangePassword,
        lastLoginAt: user.lastLoginAt?.toISOString(),
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString()
      }
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
