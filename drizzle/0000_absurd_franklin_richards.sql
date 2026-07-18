CREATE TYPE "public"."access_token_kind" AS ENUM('editor', 'resume');--> statement-breakpoint
CREATE TYPE "public"."admin_role" AS ENUM('owner', 'operator', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."preview_session_status" AS ENUM('draft', 'confirmed', 'checkout_pending', 'paid', 'production_ready', 'completed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."profile_status" AS ENUM('draft', 'published', 'retired');--> statement-breakpoint
CREATE TYPE "public"."render_job_kind" AS ENUM('preview', 'production_bundle');--> statement-breakpoint
CREATE TYPE "public"."render_job_status" AS ENUM('queued', 'running', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "admin_role" DEFAULT 'viewer' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_session_id" uuid,
	"kind" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"width" integer,
	"height" integer,
	"sha256" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_admin_user_id" uuid,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"request_id" text,
	"ip_hash" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "design_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"preview_session_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"optical_profile_id" uuid NOT NULL,
	"source_asset_id" uuid,
	"preview_asset_id" uuid,
	"design" jsonb NOT NULL,
	"checksum" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"normalized_email" text NOT NULL,
	"ip_hash" text NOT NULL,
	"succeeded" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "optical_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"version" integer NOT NULL,
	"status" "profile_status" DEFAULT 'draft' NOT NULL,
	"profile" jsonb NOT NULL,
	"checksum" text NOT NULL,
	"lut_asset_id" uuid,
	"mask_asset_id" uuid,
	"created_by" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preview_access_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"preview_session_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"kind" "access_token_kind" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preview_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "preview_session_status" DEFAULT 'draft' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"optical_profile_id" uuid NOT NULL,
	"scene_id" text DEFAULT 'studio-neutral' NOT NULL,
	"crop" jsonb NOT NULL,
	"camera" jsonb NOT NULL,
	"source_asset_id" uuid,
	"preview_asset_id" uuid,
	"style_strategy" text DEFAULT 'identity' NOT NULL,
	"fill_strategy" text DEFAULT 'none' NOT NULL,
	"confirmed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"render_job_id" uuid,
	"bundle_asset_id" uuid,
	"manifest" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"checksum" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "render_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"preview_session_id" uuid NOT NULL,
	"snapshot_id" uuid,
	"kind" "render_job_kind" NOT NULL,
	"status" "render_job_status" DEFAULT 'queued' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output_asset_id" uuid,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_admin_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_admin_user_id_admin_users_id_fk" FOREIGN KEY ("actor_admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_snapshots" ADD CONSTRAINT "design_snapshots_preview_session_id_preview_sessions_id_fk" FOREIGN KEY ("preview_session_id") REFERENCES "public"."preview_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_snapshots" ADD CONSTRAINT "design_snapshots_optical_profile_id_optical_profiles_id_fk" FOREIGN KEY ("optical_profile_id") REFERENCES "public"."optical_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_snapshots" ADD CONSTRAINT "design_snapshots_source_asset_id_assets_id_fk" FOREIGN KEY ("source_asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_snapshots" ADD CONSTRAINT "design_snapshots_preview_asset_id_assets_id_fk" FOREIGN KEY ("preview_asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optical_profiles" ADD CONSTRAINT "optical_profiles_lut_asset_id_assets_id_fk" FOREIGN KEY ("lut_asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optical_profiles" ADD CONSTRAINT "optical_profiles_mask_asset_id_assets_id_fk" FOREIGN KEY ("mask_asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optical_profiles" ADD CONSTRAINT "optical_profiles_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preview_access_tokens" ADD CONSTRAINT "preview_access_tokens_preview_session_id_preview_sessions_id_fk" FOREIGN KEY ("preview_session_id") REFERENCES "public"."preview_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preview_sessions" ADD CONSTRAINT "preview_sessions_optical_profile_id_optical_profiles_id_fk" FOREIGN KEY ("optical_profile_id") REFERENCES "public"."optical_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preview_sessions" ADD CONSTRAINT "preview_sessions_source_asset_id_assets_id_fk" FOREIGN KEY ("source_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preview_sessions" ADD CONSTRAINT "preview_sessions_preview_asset_id_assets_id_fk" FOREIGN KEY ("preview_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_artifacts" ADD CONSTRAINT "production_artifacts_snapshot_id_design_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."design_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_artifacts" ADD CONSTRAINT "production_artifacts_render_job_id_render_jobs_id_fk" FOREIGN KEY ("render_job_id") REFERENCES "public"."render_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_artifacts" ADD CONSTRAINT "production_artifacts_bundle_asset_id_assets_id_fk" FOREIGN KEY ("bundle_asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_artifacts" ADD CONSTRAINT "production_artifacts_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "render_jobs" ADD CONSTRAINT "render_jobs_preview_session_id_preview_sessions_id_fk" FOREIGN KEY ("preview_session_id") REFERENCES "public"."preview_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "render_jobs" ADD CONSTRAINT "render_jobs_snapshot_id_design_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."design_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "render_jobs" ADD CONSTRAINT "render_jobs_output_asset_id_assets_id_fk" FOREIGN KEY ("output_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_sessions_token_hash_unique" ON "admin_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "admin_sessions_user_idx" ON "admin_sessions" USING btree ("admin_user_id");--> statement-breakpoint
CREATE INDEX "admin_sessions_expiry_idx" ON "admin_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_users_email_unique" ON "admin_users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "assets_storage_key_unique" ON "assets" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "assets_owner_session_idx" ON "assets" USING btree ("owner_session_id");--> statement-breakpoint
CREATE INDEX "assets_sha256_idx" ON "assets" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_admin_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "design_snapshots_session_revision_unique" ON "design_snapshots" USING btree ("preview_session_id","revision");--> statement-breakpoint
CREATE INDEX "design_snapshots_session_idx" ON "design_snapshots" USING btree ("preview_session_id");--> statement-breakpoint
CREATE INDEX "login_attempts_lookup_idx" ON "login_attempts" USING btree ("normalized_email","ip_hash","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "optical_profiles_slug_version_unique" ON "optical_profiles" USING btree ("slug","version");--> statement-breakpoint
CREATE INDEX "optical_profiles_status_idx" ON "optical_profiles" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "preview_access_tokens_hash_unique" ON "preview_access_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "preview_access_tokens_session_kind_idx" ON "preview_access_tokens" USING btree ("preview_session_id","kind");--> statement-breakpoint
CREATE INDEX "preview_access_tokens_expiry_idx" ON "preview_access_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "preview_sessions_status_updated_idx" ON "preview_sessions" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "preview_sessions_profile_idx" ON "preview_sessions" USING btree ("optical_profile_id");--> statement-breakpoint
CREATE INDEX "production_artifacts_snapshot_idx" ON "production_artifacts" USING btree ("snapshot_id");--> statement-breakpoint
CREATE INDEX "render_jobs_status_created_idx" ON "render_jobs" USING btree ("status","created_at");