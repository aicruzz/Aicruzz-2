CREATE TABLE "character_voice_links" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"character_id" text NOT NULL,
	"voice_asset_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_characters" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"base_image_url" text,
	"expressions" json,
	"style_prompt" text,
	"thumbnail_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation_jobs_metadata" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"user_id" text NOT NULL,
	"module" text NOT NULL,
	"mode" text NOT NULL,
	"character_id" text,
	"asset_refs" json,
	"voice_mode" text,
	"voice_text" text,
	"voice_asset_id" text,
	"extra" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"thumbnail_url" text,
	"meta" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "character_voice_links" ADD CONSTRAINT "character_voice_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_voice_links" ADD CONSTRAINT "character_voice_links_character_id_custom_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."custom_characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_voice_links" ADD CONSTRAINT "character_voice_links_voice_asset_id_user_assets_id_fk" FOREIGN KEY ("voice_asset_id") REFERENCES "public"."user_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_characters" ADD CONSTRAINT "custom_characters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_jobs_metadata" ADD CONSTRAINT "generation_jobs_metadata_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_jobs_metadata" ADD CONSTRAINT "generation_jobs_metadata_character_id_custom_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."custom_characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_assets" ADD CONSTRAINT "user_assets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "character_voice_links_character_id_idx" ON "character_voice_links" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "character_voice_links_user_id_idx" ON "character_voice_links" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "custom_characters_user_id_idx" ON "custom_characters" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "generation_jobs_metadata_job_id_idx" ON "generation_jobs_metadata" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "generation_jobs_metadata_user_id_idx" ON "generation_jobs_metadata" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "generation_jobs_metadata_mode_idx" ON "generation_jobs_metadata" USING btree ("mode");--> statement-breakpoint
CREATE INDEX "user_assets_user_id_idx" ON "user_assets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_assets_type_idx" ON "user_assets" USING btree ("type");