ALTER TABLE "video_jobs" ADD COLUMN "revised_prompt" text;--> statement-breakpoint
ALTER TABLE "video_jobs" ADD COLUMN "parent_job_id" text;--> statement-breakpoint
ALTER TABLE "video_jobs" ADD COLUMN "variation_index" integer;--> statement-breakpoint
ALTER TABLE "video_jobs" ADD COLUMN "agent_meta" jsonb;