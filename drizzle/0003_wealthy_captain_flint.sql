ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_plan_ck";--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "trial_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "free_trial_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "paid_trial_used_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_ck" CHECK ("subscriptions"."plan_id" in ('free', 'basic', 'pro', 'business'));--> statement-breakpoint
UPDATE "users" SET "free_trial_ends_at" = now() + interval '7 days' WHERE "free_trial_ends_at" IS NULL;--> statement-breakpoint
UPDATE "users" SET "paid_trial_used_at" = now() WHERE "id" IN (SELECT "user_id" FROM "subscriptions" WHERE "plan_id" <> 'free');
