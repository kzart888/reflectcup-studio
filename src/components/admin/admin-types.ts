import type { PreviewSession, PreviewSessionStatus } from "@/lib/contracts";

export type AdminRole = "owner" | "operator" | "viewer";

export type AdminUser = {
  id: string;
  email: string;
  role: AdminRole;
  enabled?: boolean;
  mustChangePassword: boolean;
  lastLoginAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type AdminSessionRecord = Omit<PreviewSession, "opticalRuntime" | "previewSettings"> & {
  status: PreviewSessionStatus;
  snapshotId?: string | null;
  snapshotRevision?: number | null;
  snapshotChecksum?: string | null;
};

export type AdminOpticalProfile = {
  id: string;
  slug: string;
  label: string;
  version: number;
  status: "draft" | "published" | "retired";
  checksum: string;
  lutAssetId: string | null;
  maskAssetId: string | null;
  profile: Record<string, unknown>;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type ProductionArtifact = {
  id: string;
  snapshotId: string;
  renderJobId?: string;
  checksum?: string;
  manifest: Record<string, unknown>;
  bundle?: { id: string; url: string; mimeType: string; sha256: string };
  createdAt: string;
};

export const roleWeight: Record<AdminRole, number> = {
  viewer: 0,
  operator: 1,
  owner: 2,
};

export function hasRole(role: AdminRole, minimum: AdminRole): boolean {
  return roleWeight[role] >= roleWeight[minimum];
}
