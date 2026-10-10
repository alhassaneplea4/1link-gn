CREATE TABLE "activity_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "activity_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	"subject" text NOT NULL,
	CONSTRAINT "activity_kind_ck" CHECK ("activity_events"."kind" in ('signup', 'publish', 'report'))
);
--> statement-breakpoint
CREATE TABLE "app_errors" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "app_errors_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"route" text NOT NULL,
	"message" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" text,
	"actor_label" text NOT NULL,
	"action" text NOT NULL,
	"target" text NOT NULL,
	"ip" text,
	"level" text DEFAULT 'info' NOT NULL,
	CONSTRAINT "audit_level_ck" CHECK ("audit_logs"."level" in ('info', 'warning', 'critical'))
);
--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_tokens_kind_ck" CHECK ("auth_tokens"."kind" in ('email_verify', 'password_reset'))
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"code_hash" text NOT NULL,
	"channel" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "otp_channel_ck" CHECK ("otp_codes"."channel" in ('whatsapp', 'sms'))
);
--> statement-breakpoint
CREATE TABLE "page_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "page_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"page_id" text NOT NULL,
	"kind" text NOT NULL,
	"block_id" text,
	"source" text,
	"device" text NOT NULL,
	"country" text,
	"visitor" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "page_events_kind_ck" CHECK ("page_events"."kind" in ('view', 'click'))
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"username" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"draft" jsonb NOT NULL,
	"published" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "pages_username_ck" CHECK ("pages"."username" is null or "pages"."username" ~ '^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$'),
	CONSTRAINT "pages_status_ck" CHECK ("pages"."status" in ('draft', 'published', 'suspended'))
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'GNF' NOT NULL,
	"status" text NOT NULL,
	"method" text NOT NULL,
	"provider" text,
	"provider_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_status_ck" CHECK ("payments"."status" in ('paid', 'pending', 'failed', 'refunded')),
	CONSTRAINT "payments_method_ck" CHECK ("payments"."method" in ('mobile_money', 'card', 'bank')),
	CONSTRAINT "payments_amount_ck" CHECK ("payments"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"window_start" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"page_id" text,
	"username" text NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"content_excerpt" text DEFAULT '' NOT NULL,
	"reporter_hash" text NOT NULL,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reports_reason_ck" CHECK ("reports"."reason" in ('spam', 'impersonation', 'inappropriate', 'scam', 'copyright', 'other')),
	CONSTRAINT "reports_status_ck" CHECK ("reports"."status" in ('open', 'in_review', 'resolved', 'dismissed')),
	CONSTRAINT "reports_priority_ck" CHECK ("reports"."priority" in ('low', 'medium', 'high'))
);
--> statement-breakpoint
CREATE TABLE "security_events" (
	"id" text PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	"subject" text NOT NULL,
	"user_id" text,
	"ip" text,
	"level" text DEFAULT 'info' NOT NULL,
	CONSTRAINT "security_kind_ck" CHECK ("security_events"."kind" in ('failed_login', 'password_reset', 'role_change', 'suspicious_activity', 'new_device')),
	CONSTRAINT "security_level_ck" CHECK ("security_events"."level" in ('info', 'warning', 'critical'))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"plan_id" text DEFAULT 'free' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"period" text DEFAULT 'monthly' NOT NULL,
	"renews_at" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"provider" text,
	"provider_ref" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_plan_ck" CHECK ("subscriptions"."plan_id" in ('free', 'pro', 'business')),
	CONSTRAINT "subscriptions_status_ck" CHECK ("subscriptions"."status" in ('active', 'trialing', 'past_due', 'canceled', 'pending')),
	CONSTRAINT "subscriptions_period_ck" CHECK ("subscriptions"."period" in ('monthly', 'yearly'))
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"subject" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tickets_status_ck" CHECK ("support_tickets"."status" in ('open', 'pending', 'solved')),
	CONSTRAINT "tickets_priority_ck" CHECK ("support_tickets"."priority" in ('low', 'medium', 'high'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text,
	"phone" text,
	"password_hash" text,
	"name" text NOT NULL,
	"email_verified_at" timestamp with time zone,
	"phone_verified_at" timestamp with time zone,
	"category" text,
	"onboarding_done" boolean DEFAULT false NOT NULL,
	"onboarding_state" jsonb,
	"admin_role" text,
	"status" text DEFAULT 'active' NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"country" text,
	"terms_accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_active_at" timestamp with time zone,
	CONSTRAINT "users_contact_ck" CHECK ("users"."email" is not null or "users"."phone" is not null),
	CONSTRAINT "users_email_lower_ck" CHECK ("users"."email" is null or "users"."email" = lower("users"."email")),
	CONSTRAINT "users_status_ck" CHECK ("users"."status" in ('active', 'suspended')),
	CONSTRAINT "users_category_ck" CHECK ("users"."category" is null or "users"."category" in ('individual', 'creator', 'professional', 'business', 'organization')),
	CONSTRAINT "users_admin_role_ck" CHECK ("users"."admin_role" is null or "users"."admin_role" in ('super_admin', 'admin', 'moderator', 'support', 'analyst', 'finance'))
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"legal_name" text NOT NULL,
	"registry_number" text DEFAULT '' NOT NULL,
	"proof_url" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decision_note" text,
	"decided_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "verifications_status_ck" CHECK ("verifications"."status" in ('pending', 'approved', 'rejected')),
	CONSTRAINT "verifications_kind_ck" CHECK ("verifications"."kind" in ('person', 'business', 'organization'))
);
--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_events" ADD CONSTRAINT "page_events_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_at_idx" ON "activity_events" USING btree ("at");--> statement-breakpoint
CREATE INDEX "app_errors_at_idx" ON "app_errors" USING btree ("at");--> statement-breakpoint
CREATE INDEX "audit_at_idx" ON "audit_logs" USING btree ("at");--> statement-breakpoint
CREATE INDEX "audit_target_idx" ON "audit_logs" USING btree ("target");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_tokens_hash_uq" ON "auth_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "auth_tokens_user_kind_idx" ON "auth_tokens" USING btree ("user_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "media_user_hash_uq" ON "media" USING btree ("user_id","sha256");--> statement-breakpoint
CREATE INDEX "media_user_idx" ON "media" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "otp_phone_idx" ON "otp_codes" USING btree ("phone","created_at");--> statement-breakpoint
CREATE INDEX "page_events_page_at_idx" ON "page_events" USING btree ("page_id","at");--> statement-breakpoint
CREATE INDEX "page_events_at_idx" ON "page_events" USING btree ("at");--> statement-breakpoint
CREATE UNIQUE INDEX "pages_user_uq" ON "pages" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pages_username_uq" ON "pages" USING btree ("username");--> statement-breakpoint
CREATE INDEX "pages_status_idx" ON "pages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payments_user_idx" ON "payments" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_ref_uq" ON "payments" USING btree ("provider","provider_ref");--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "reports_page_idx" ON "reports" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "security_at_idx" ON "security_events" USING btree ("at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_user_uq" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tickets_status_idx" ON "support_tickets" USING btree ("status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_uq" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "users_created_idx" ON "users" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "users_admin_role_idx" ON "users" USING btree ("admin_role");--> statement-breakpoint
CREATE INDEX "verifications_user_idx" ON "verifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "verifications_one_pending_uq" ON "verifications" USING btree ("user_id") WHERE "verifications"."status" = 'pending';