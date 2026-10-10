ALTER TABLE "users" ADD COLUMN "locale" text DEFAULT 'fr' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_locale_ck" CHECK ("users"."locale" in ('fr', 'en'));