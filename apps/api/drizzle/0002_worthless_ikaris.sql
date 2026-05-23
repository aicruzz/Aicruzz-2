CREATE TABLE "featured_banners" (
	"id" text PRIMARY KEY NOT NULL,
	"module" text NOT NULL,
	"title" text NOT NULL,
	"prompt" text NOT NULL,
	"video_url" text NOT NULL,
	"thumbnail_url" text,
	"tags" json,
	"metadata" json,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_new" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"rotation_interval" integer DEFAULT 6000 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "featured_banners_module_idx" ON "featured_banners" USING btree ("module");--> statement-breakpoint
CREATE INDEX "featured_banners_active_idx" ON "featured_banners" USING btree ("is_active");