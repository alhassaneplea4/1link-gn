CREATE TABLE "passkeys" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"public_key" text NOT NULL,
	"counter" bigint DEFAULT 0 NOT NULL,
	"transports" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"device_type" text DEFAULT 'multiDevice' NOT NULL,
	"backed_up" boolean DEFAULT false NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_devices" (
	"user_id" text NOT NULL,
	"device_hash" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"country" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webauthn_challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"user_id" text,
	"challenge" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "webauthn_kind_ck" CHECK ("webauthn_challenges"."kind" in ('register', 'login'))
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "auth_factor" text DEFAULT 'single' NOT NULL;--> statement-breakpoint
ALTER TABLE "passkeys" ADD CONSTRAINT "passkeys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "passkeys_user_idx" ON "passkeys" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_devices_pk" ON "user_devices" USING btree ("user_id","device_hash");--> statement-breakpoint
CREATE INDEX "user_devices_seen_idx" ON "user_devices" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "webauthn_challenges_exp_idx" ON "webauthn_challenges" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_factor_ck" CHECK ("sessions"."auth_factor" in ('single', 'mfa', 'passkey'));