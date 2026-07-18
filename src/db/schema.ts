import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

export const adminRoleEnum = pgEnum("admin_role", ["owner", "operator", "viewer"]);
export const profileStatusEnum = pgEnum("profile_status", ["draft", "published", "retired"]);
export const previewSessionStatusEnum = pgEnum("preview_session_status", [
  "draft",
  "confirmed",
  "checkout_pending",
  "paid",
  "production_ready",
  "completed",
  "expired"
]);
export const accessTokenKindEnum = pgEnum("access_token_kind", ["editor", "resume"]);
export const renderJobKindEnum = pgEnum("render_job_kind", ["preview", "production_bundle"]);
export const renderJobStatusEnum = pgEnum("render_job_status", ["queued", "running", "ready", "failed"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
};

export const adminUsers = pgTable(
  "admin_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: adminRoleEnum("role").notNull().default("viewer"),
    enabled: boolean("enabled").notNull().default(true),
    mustChangePassword: boolean("must_change_password").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => [uniqueIndex("admin_users_email_unique").on(sql`lower(${table.email})`)]
);

export const adminSessions = pgTable(
  "admin_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adminUserId: uuid("admin_user_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("admin_sessions_token_hash_unique").on(table.tokenHash),
    index("admin_sessions_user_idx").on(table.adminUserId),
    index("admin_sessions_expiry_idx").on(table.expiresAt)
  ]
);

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerSessionId: uuid("owner_session_id"),
    kind: text("kind").notNull(),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: bigint("byte_size", { mode: "number" }).notNull(),
    width: integer("width"),
    height: integer("height"),
    sha256: text("sha256").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("assets_storage_key_unique").on(table.storageKey),
    index("assets_owner_session_idx").on(table.ownerSessionId),
    index("assets_sha256_idx").on(table.sha256)
  ]
);

/**
 * Durable intent log for deleting private storage objects. The row is written in
 * the same database transaction that removes the corresponding asset record.
 * Storage deletion is idempotent, so a worker can safely retry after crashes or
 * transient filesystem/object-store failures.
 */
export const storageDeletionOutbox = pgTable(
  "storage_deletion_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storageKey: text("storage_key").notNull(),
    reason: text("reason").notNull(),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    lastError: text("last_error"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => [
    uniqueIndex("storage_deletion_outbox_storage_key_unique").on(table.storageKey),
    index("storage_deletion_outbox_pending_idx")
      .on(table.nextAttemptAt)
      .where(sql`${table.completedAt} is null`)
  ]
);

export const opticalProfiles = pgTable(
  "optical_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    label: text("label").notNull(),
    version: integer("version").notNull(),
    status: profileStatusEnum("status").notNull().default("draft"),
    profile: jsonb("profile").$type<Record<string, unknown>>().notNull(),
    checksum: text("checksum").notNull(),
    lutAssetId: uuid("lut_asset_id").references(() => assets.id, { onDelete: "restrict" }),
    maskAssetId: uuid("mask_asset_id").references(() => assets.id, { onDelete: "restrict" }),
    createdBy: uuid("created_by").references(() => adminUsers.id, { onDelete: "set null" }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => [
    uniqueIndex("optical_profiles_slug_version_unique").on(table.slug, table.version),
    uniqueIndex("optical_profiles_slug_published_unique")
      .on(table.slug)
      .where(sql`${table.status} = 'published'`),
    index("optical_profiles_status_idx").on(table.status)
  ]
);

export const previewSessions = pgTable(
  "preview_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    status: previewSessionStatusEnum("status").notNull().default("draft"),
    revision: integer("revision").notNull().default(0),
    opticalProfileId: uuid("optical_profile_id")
      .notNull()
      .references(() => opticalProfiles.id, { onDelete: "restrict" }),
    sceneId: text("scene_id").notNull().default("studio-neutral"),
    crop: jsonb("crop").$type<{ centerX: number; centerY: number; scale: number }>().notNull(),
    camera: jsonb("camera")
      .$type<{ position: readonly [number, number, number]; target: readonly [number, number, number] }>()
      .notNull(),
    sourceAssetId: uuid("source_asset_id").references(() => assets.id, { onDelete: "set null" }),
    previewAssetId: uuid("preview_asset_id").references(() => assets.id, { onDelete: "set null" }),
    styleStrategy: text("style_strategy").notNull().default("identity"),
    fillStrategy: text("fill_strategy").notNull().default("none"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => [
    index("preview_sessions_status_updated_idx").on(table.status, table.updatedAt),
    index("preview_sessions_expiry_idx").on(table.expiresAt),
    index("preview_sessions_profile_idx").on(table.opticalProfileId)
  ]
);

export const previewAccessTokens = pgTable(
  "preview_access_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    previewSessionId: uuid("preview_session_id")
      .notNull()
      .references(() => previewSessions.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    kind: accessTokenKindEnum("kind").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("preview_access_tokens_hash_unique").on(table.tokenHash),
    index("preview_access_tokens_session_kind_idx").on(table.previewSessionId, table.kind),
    index("preview_access_tokens_expiry_idx").on(table.expiresAt)
  ]
);

export const designSnapshots = pgTable(
  "design_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    previewSessionId: uuid("preview_session_id")
      .notNull()
      .references(() => previewSessions.id, { onDelete: "restrict" }),
    revision: integer("revision").notNull(),
    opticalProfileId: uuid("optical_profile_id")
      .notNull()
      .references(() => opticalProfiles.id, { onDelete: "restrict" }),
    sourceAssetId: uuid("source_asset_id").references(() => assets.id, { onDelete: "restrict" }),
    previewAssetId: uuid("preview_asset_id").references(() => assets.id, { onDelete: "restrict" }),
    design: jsonb("design").$type<Record<string, unknown>>().notNull(),
    checksum: text("checksum").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("design_snapshots_session_revision_unique").on(table.previewSessionId, table.revision),
    index("design_snapshots_session_idx").on(table.previewSessionId)
  ]
);

export const renderJobs = pgTable(
  "render_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    previewSessionId: uuid("preview_session_id")
      .notNull()
      .references(() => previewSessions.id, { onDelete: "cascade" }),
    snapshotId: uuid("snapshot_id").references(() => designSnapshots.id, { onDelete: "cascade" }),
    kind: renderJobKindEnum("kind").notNull(),
    status: renderJobStatusEnum("status").notNull().default("queued"),
    progress: integer("progress").notNull().default(0),
    input: jsonb("input").$type<Record<string, unknown>>().notNull().default({}),
    outputAssetId: uuid("output_asset_id").references(() => assets.id, { onDelete: "set null" }),
    error: text("error"),
    ...timestamps
  },
  (table) => [index("render_jobs_status_created_idx").on(table.status, table.createdAt)]
);

export const productionArtifacts = pgTable(
  "production_artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    snapshotId: uuid("snapshot_id")
      .notNull()
      .references(() => designSnapshots.id, { onDelete: "restrict" }),
    renderJobId: uuid("render_job_id").references(() => renderJobs.id, { onDelete: "set null" }),
    bundleAssetId: uuid("bundle_asset_id").references(() => assets.id, { onDelete: "restrict" }),
    manifest: jsonb("manifest").$type<Record<string, unknown>>().notNull().default({}),
    checksum: text("checksum"),
    createdBy: uuid("created_by").references(() => adminUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("production_artifacts_snapshot_idx").on(table.snapshotId)]
);

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedBy: uuid("updated_by").references(() => adminUsers.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorAdminUserId: uuid("actor_admin_user_id").references(() => adminUsers.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    requestId: text("request_id"),
    ipHash: text("ip_hash"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("audit_logs_created_idx").on(table.createdAt),
    index("audit_logs_actor_idx").on(table.actorAdminUserId),
    index("audit_logs_action_ip_created_idx").on(table.action, table.ipHash, table.createdAt),
    index("audit_logs_action_target_created_idx").on(table.action, table.targetId, table.createdAt)
  ]
);

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    normalizedEmail: text("normalized_email").notNull(),
    ipHash: text("ip_hash").notNull(),
    succeeded: boolean("succeeded").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("login_attempts_lookup_idx").on(table.normalizedEmail, table.ipHash, table.createdAt),
    index("login_attempts_failed_email_created_idx")
      .on(table.normalizedEmail, table.createdAt)
      .where(sql`${table.succeeded} = false`),
    index("login_attempts_failed_ip_created_idx")
      .on(table.ipHash, table.createdAt)
      .where(sql`${table.succeeded} = false`)
  ]
);

export type AdminRole = (typeof adminRoleEnum.enumValues)[number];
export type PreviewSessionRow = typeof previewSessions.$inferSelect;
export type OpticalProfileRow = typeof opticalProfiles.$inferSelect;
