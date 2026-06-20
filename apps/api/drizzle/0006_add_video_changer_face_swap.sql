ALTER TABLE "video_jobs" ADD COLUMN "job_type" text DEFAULT 'GENERATE' NOT NULL;--> statement-breakpoint
ALTER TABLE "video_jobs" ADD COLUMN "target_image_url" text;