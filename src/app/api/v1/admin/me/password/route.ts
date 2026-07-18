import { and, eq, ne } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { adminSessions, adminUsers } from "@/db/schema";
import { authenticateAdmin, writeAudit } from "@/domains/auth/admin-service";
import { apiErrorResponse, ApiError, dataResponse, enforceSameOrigin, parseJson } from "@/domains/auth/http";
import { hashPassword, verifyPassword } from "@/domains/auth/security";

export const runtime = "nodejs";

const schema = z
  .object({ currentPassword: z.string().min(1).max(256), newPassword: z.string().min(12).max(256) })
  .strict();

export async function PATCH(request: NextRequest) {
  try {
    enforceSameOrigin(request);
    const principal = await authenticateAdmin(request);
    const parsed = schema.safeParse(await parseJson(request));
    if (!parsed.success) throw new ApiError(400, "VALIDATION_FAILED", "Invalid password update", parsed.error.flatten());
    const user = await getDatabase().query.adminUsers.findFirst({ where: eq(adminUsers.id, principal.id) });
    if (!user || !(await verifyPassword(user.passwordHash, parsed.data.currentPassword))) {
      throw new ApiError(401, "CURRENT_PASSWORD_INVALID", "Current password is incorrect");
    }
    const passwordHash = await hashPassword(parsed.data.newPassword);
    await getDatabase().transaction(async (transaction) => {
      await transaction
        .update(adminUsers)
        .set({ passwordHash, mustChangePassword: false, updatedAt: new Date() })
        .where(eq(adminUsers.id, principal.id));
      await transaction
        .delete(adminSessions)
        .where(and(eq(adminSessions.adminUserId, principal.id), ne(adminSessions.id, principal.sessionId)));
    });
    await writeAudit({
      actorAdminUserId: principal.id,
      action: "admin.password_changed",
      targetType: "admin_user",
      targetId: principal.id
    });
    return dataResponse({ changed: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
