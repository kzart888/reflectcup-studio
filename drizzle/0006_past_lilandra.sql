CREATE TABLE "storage_deletion_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_key" text NOT NULL,
	"reason" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "storage_deletion_outbox_storage_key_unique" ON "storage_deletion_outbox" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "storage_deletion_outbox_pending_idx" ON "storage_deletion_outbox" USING btree ("next_attempt_at") WHERE "storage_deletion_outbox"."completed_at" is null;