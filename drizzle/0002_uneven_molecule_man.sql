ALTER TABLE "knowledge_chunks" ADD COLUMN "chunk_index" integer;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD COLUMN "content" text;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD COLUMN "citation_label" text;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD COLUMN "tenant" text DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD COLUMN "index_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD COLUMN "checksum" text;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD COLUMN "effective_date" text;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD COLUMN "version" text;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD COLUMN "authority_level" text;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD COLUMN "acl_tags_json" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "review_tasks" ADD COLUMN "task_type" text;--> statement-breakpoint
ALTER TABLE "review_tasks" ADD COLUMN "reason_codes_json" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "review_tasks" ADD COLUMN "target_chunk_ids_json" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "review_tasks" ADD COLUMN "target_document_id" uuid;--> statement-breakpoint
ALTER TABLE "review_tasks" ADD COLUMN "assignee" text;--> statement-breakpoint
ALTER TABLE "review_tasks" ADD COLUMN "owner" text;--> statement-breakpoint
ALTER TABLE "review_tasks" ADD COLUMN "resolution_type" text;--> statement-breakpoint
ALTER TABLE "review_tasks" ADD COLUMN "resolved_at" timestamp;