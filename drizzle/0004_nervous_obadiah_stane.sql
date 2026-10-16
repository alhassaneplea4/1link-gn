ALTER TABLE "auth_tokens" DROP CONSTRAINT "auth_tokens_kind_ck";--> statement-breakpoint
ALTER TABLE "otp_codes" DROP CONSTRAINT "otp_channel_ck";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "two_factor_email" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "totp_secret" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "totp_enabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "recovery_codes" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deletion_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deletion_notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_kind_ck" CHECK ("auth_tokens"."kind" in ('email_verify', 'password_reset', 'account_delete'));--> statement-breakpoint
ALTER TABLE "otp_codes" ADD CONSTRAINT "otp_channel_ck" CHECK ("otp_codes"."channel" in ('whatsapp', 'sms', 'email'));