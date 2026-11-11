CREATE TABLE "username_holds" (
	"username" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"until" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "username_holds_until_idx" ON "username_holds" USING btree ("until");