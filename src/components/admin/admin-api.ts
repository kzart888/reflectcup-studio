"use client";

type ErrorEnvelope = {
  error?: { code?: string; message?: string; details?: unknown };
};

export class AdminApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export async function adminRequest<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload = (await response.json().catch(() => ({}))) as ErrorEnvelope & { data?: T };
  if (!response.ok) {
    const error = new AdminApiError(
      response.status,
      payload.error?.code ?? "REQUEST_FAILED",
      payload.error?.message ?? "请求未能完成",
      payload.error?.details,
    );
    if (response.status === 401) window.dispatchEvent(new Event("reflectcup:admin-auth-expired"));
    throw error;
  }
  if (payload.data === undefined) throw new AdminApiError(500, "INVALID_RESPONSE", "服务器返回了无效数据");
  return payload.data;
}

const localizedErrors: Record<string, string> = {
  INVALID_CREDENTIALS: "邮箱或密码不正确。",
  LOGIN_RATE_LIMITED: "尝试次数过多，请稍后再试。",
  CURRENT_PASSWORD_INVALID: "当前密码不正确。",
  PASSWORD_CHANGE_REQUIRED: "请先更换初始密码。",
  INSUFFICIENT_ROLE: "当前账号没有执行此操作的权限。",
  SELF_ROLE_CHANGE_REJECTED: "不能修改自己的权限或停用自己的账号。",
  ADMIN_EMAIL_EXISTS: "该邮箱已经是管理员账号。",
  PROFILE_IMMUTABLE: "已发布或已退役的光学模型不可修改。",
  PROFILE_ASSETS_MISSING: "发布前必须配置 LUT 和遮罩资源。",
  PROFILE_ASSET_INVALID: "LUT 或遮罩资源不存在。",
  ORIGIN_REJECTED: "请求来源验证失败，请刷新页面后重试。",
};

export function readableAdminError(error: unknown): string {
  if (error instanceof AdminApiError) return localizedErrors[error.code] ?? error.message;
  return error instanceof Error ? error.message : "请求未能完成，请稍后重试。";
}
