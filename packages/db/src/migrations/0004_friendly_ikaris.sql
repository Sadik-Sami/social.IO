DROP TABLE "message_status" CASCADE;--> statement-breakpoint
ALTER TABLE "participant" ADD COLUMN "last_delivered_sequence" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "participant" ADD COLUMN "last_seen_sequence" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
DROP TYPE "public"."message_delivery_status";