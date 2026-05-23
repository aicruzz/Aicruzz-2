CREATE TYPE "public"."ApiPlan" AS ENUM('DEVELOPER_BASIC', 'DEVELOPER_PRO', 'DEVELOPER_ELITE');--> statement-breakpoint
CREATE TYPE "public"."CartoonType" AS ENUM('ANIMATED_AD', 'HUMAN_CARTOON', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "public"."CryptoCurrency" AS ENUM('BTC', 'USDT_TRC20', 'USDT_ERC20');--> statement-breakpoint
CREATE TYPE "public"."CryptoStatus" AS ENUM('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."JobStatus" AS ENUM('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."LogSeverity" AS ENUM('INFO', 'WARN', 'ERROR', 'CRITICAL');--> statement-breakpoint
CREATE TYPE "public"."MessageRole" AS ENUM('USER', 'ASSISTANT', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."QualityMode" AS ENUM('STANDARD', 'HIGH', 'ULTRA');--> statement-breakpoint
CREATE TYPE "public"."Role" AS ENUM('USER', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."SessionStatus" AS ENUM('ACTIVE', 'ENDED', 'INTERRUPTED');--> statement-breakpoint
CREATE TYPE "public"."SubscriptionStatus" AS ENUM('ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED', 'TRIALING');--> statement-breakpoint
CREATE TYPE "public"."TransactionStatus" AS ENUM('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."TransactionType" AS ENUM('FUND', 'DEDUCT', 'REFUND', 'ADMIN_CREDIT', 'ADMIN_DEDUCT', 'EXPIRY', 'RESTORE', 'BONUS');--> statement-breakpoint
CREATE TYPE "public"."VideoResolution" AS ENUM('SD_480P', 'HD_720P', 'FHD_1080P');--> statement-breakpoint
CREATE TABLE "activity_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"action" text NOT NULL,
	"module" text,
	"severity" "LogSeverity" DEFAULT 'INFO' NOT NULL,
	"details" json,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"total_requests" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp,
	"ip_whitelist" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "api_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"plan" "ApiPlan" NOT NULL,
	"status" "SubscriptionStatus" DEFAULT 'ACTIVE' NOT NULL,
	"requests_per_minute" integer NOT NULL,
	"requests_per_month" integer NOT NULL,
	"requests_used_this_month" integer DEFAULT 0 NOT NULL,
	"last_reset_at" timestamp DEFAULT now() NOT NULL,
	"usd_price_monthly" double precision NOT NULL,
	"current_period_start" timestamp NOT NULL,
	"current_period_end" timestamp NOT NULL,
	"stripe_subscription_id" text,
	"stripe_customer_id" text,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"cancelled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "api_subscriptions_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "cartoon_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"template_id" text,
	"type" "CartoonType" NOT NULL,
	"status" "JobStatus" DEFAULT 'QUEUED' NOT NULL,
	"prompt" text,
	"style_prompt" text,
	"input_image_url" text,
	"input_video_url" text,
	"duration_secs" double precision DEFAULT 5 NOT NULL,
	"aspect_ratio" text DEFAULT '16:9' NOT NULL,
	"animation_style" text DEFAULT 'cartoon' NOT NULL,
	"credits_charged" double precision DEFAULT 0 NOT NULL,
	"credit_refunded" boolean DEFAULT false NOT NULL,
	"provider" text,
	"queue_job_id" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"output_url" text,
	"thumbnail_url" text,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cartoon_scenes" (
	"id" text PRIMARY KEY NOT NULL,
	"template_id" text NOT NULL,
	"name" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"prompt" text,
	"image_url" text,
	"duration_secs" double precision DEFAULT 3 NOT NULL,
	"transition" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cartoon_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"thumbnail_url" text,
	"type" "CartoonType" DEFAULT 'CUSTOM' NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"role" "MessageRole" NOT NULL,
	"content" text NOT NULL,
	"image_url" text,
	"video_url" text,
	"provider" text,
	"model" text,
	"tokens_used" integer,
	"latency_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chats" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text DEFAULT 'New Chat' NOT NULL,
	"model" text DEFAULT 'claude-sonnet-4-6' NOT NULL,
	"strategy" text DEFAULT 'AUTO' NOT NULL,
	"total_credits" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crypto_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"currency" "CryptoCurrency" NOT NULL,
	"usd_amount" double precision NOT NULL,
	"wallet_address" text NOT NULL,
	"tx_hash" text,
	"proof_image_url" text,
	"notes" text,
	"status" "CryptoStatus" DEFAULT 'PENDING' NOT NULL,
	"admin_note" text,
	"approved_by" text,
	"approved_at" timestamp,
	"rejected_at" timestamp,
	"credits_to_add" double precision,
	"bonus_credits" double precision,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal_consents" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"module" text NOT NULL,
	"version" text DEFAULT '1.0' NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"accepted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_cam_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"status" "SessionStatus" DEFAULT 'ACTIVE' NOT NULL,
	"credits_per_second" double precision DEFAULT 0.2 NOT NULL,
	"total_seconds" integer DEFAULT 0 NOT NULL,
	"total_credits" double precision DEFAULT 0 NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" "TransactionType" NOT NULL,
	"status" "TransactionStatus" DEFAULT 'PENDING' NOT NULL,
	"usd_amount" double precision,
	"credits_base" double precision DEFAULT 0 NOT NULL,
	"credits_bonus" double precision DEFAULT 0 NOT NULL,
	"credits_restored" double precision DEFAULT 0 NOT NULL,
	"credits_total" double precision DEFAULT 0 NOT NULL,
	"balance_before" double precision DEFAULT 0 NOT NULL,
	"balance_after" double precision DEFAULT 0 NOT NULL,
	"description" text NOT NULL,
	"module" text,
	"metadata" json,
	"stripe_payment_intent_id" text,
	"stripe_session_id" text,
	"crypto_payment_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"device_info" text,
	"ip_address" text,
	"is_valid" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"name" text,
	"role" "Role" DEFAULT 'USER' NOT NULL,
	"is_blocked" boolean DEFAULT false NOT NULL,
	"blocked_reason" text,
	"legal_consented" boolean DEFAULT false NOT NULL,
	"legal_consent_at" timestamp,
	"email_verified" boolean DEFAULT false NOT NULL,
	"avatar_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "video_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"status" "JobStatus" DEFAULT 'QUEUED' NOT NULL,
	"prompt" text,
	"input_image_url" text,
	"input_video_url" text,
	"voice_enabled" boolean DEFAULT false NOT NULL,
	"duration_seconds" integer DEFAULT 5 NOT NULL,
	"resolution" "VideoResolution" DEFAULT 'HD_720P' NOT NULL,
	"quality_mode" "QualityMode" DEFAULT 'STANDARD' NOT NULL,
	"provider" text,
	"credits_charged" double precision DEFAULT 0 NOT NULL,
	"credit_refunded" boolean DEFAULT false NOT NULL,
	"output_url" text,
	"thumbnail_url" text,
	"error_message" text,
	"queue_job_id" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"credits" double precision DEFAULT 0 NOT NULL,
	"pending_restore" double precision DEFAULT 0 NOT NULL,
	"total_funded_usd" double precision DEFAULT 0 NOT NULL,
	"expires_at" timestamp,
	"last_funded_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_subscriptions" ADD CONSTRAINT "api_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cartoon_jobs" ADD CONSTRAINT "cartoon_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cartoon_jobs" ADD CONSTRAINT "cartoon_jobs_template_id_cartoon_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."cartoon_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cartoon_scenes" ADD CONSTRAINT "cartoon_scenes_template_id_cartoon_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."cartoon_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cartoon_templates" ADD CONSTRAINT "cartoon_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crypto_payments" ADD CONSTRAINT "crypto_payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_consents" ADD CONSTRAINT "legal_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_logs_user_id_idx" ON "activity_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "activity_logs_action_idx" ON "activity_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "activity_logs_created_at_idx" ON "activity_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "api_keys_user_id_idx" ON "api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "api_keys_key_idx" ON "api_keys" USING btree ("key");--> statement-breakpoint
CREATE INDEX "cartoon_jobs_user_id_idx" ON "cartoon_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cartoon_jobs_status_idx" ON "cartoon_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cartoon_jobs_created_at_idx" ON "cartoon_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "cartoon_scenes_template_id_idx" ON "cartoon_scenes" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "cartoon_scenes_order_idx" ON "cartoon_scenes" USING btree ("order");--> statement-breakpoint
CREATE INDEX "cartoon_templates_user_id_idx" ON "cartoon_templates" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cartoon_templates_is_public_idx" ON "cartoon_templates" USING btree ("is_public");--> statement-breakpoint
CREATE INDEX "chat_messages_chat_id_idx" ON "chat_messages" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "chat_messages_created_at_idx" ON "chat_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "chats_user_id_idx" ON "chats" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "chats_created_at_idx" ON "chats" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "crypto_payments_user_id_idx" ON "crypto_payments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "crypto_payments_status_idx" ON "crypto_payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "crypto_payments_created_at_idx" ON "crypto_payments" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "legal_consents_user_id_module_idx" ON "legal_consents" USING btree ("user_id","module");--> statement-breakpoint
CREATE INDEX "legal_consents_user_id_idx" ON "legal_consents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "live_cam_sessions_user_id_idx" ON "live_cam_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "live_cam_sessions_status_idx" ON "live_cam_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "transactions_user_id_idx" ON "transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "transactions_type_idx" ON "transactions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "transactions_status_idx" ON "transactions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "transactions_created_at_idx" ON "transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_sessions_user_id_idx" ON "user_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_sessions_token_hash_idx" ON "user_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "users_is_blocked_idx" ON "users" USING btree ("is_blocked");--> statement-breakpoint
CREATE INDEX "video_jobs_user_id_idx" ON "video_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "video_jobs_status_idx" ON "video_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "video_jobs_created_at_idx" ON "video_jobs" USING btree ("created_at");