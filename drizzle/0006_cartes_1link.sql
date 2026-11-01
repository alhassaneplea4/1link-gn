CREATE TABLE "card_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"reference" text NOT NULL,
	"user_id" text NOT NULL,
	"page_id" text NOT NULL,
	"product_id" text NOT NULL,
	"kind" text NOT NULL,
	"units" integer NOT NULL,
	"cards_count" integer NOT NULL,
	"unit_price" integer NOT NULL,
	"total" integer NOT NULL,
	"currency" text NOT NULL,
	"design" jsonb NOT NULL,
	"delivery" jsonb NOT NULL,
	"status" text DEFAULT 'awaiting_payment' NOT NULL,
	"payment_method" text,
	"payment_ref" text,
	"paid_at" timestamp with time zone,
	"design_approved_at" timestamp with time zone,
	"design_note" text DEFAULT '' NOT NULL,
	"print_partner" text DEFAULT '' NOT NULL,
	"partner_ref" text DEFAULT '' NOT NULL,
	"carrier" text DEFAULT '' NOT NULL,
	"tracking_ref" text DEFAULT '' NOT NULL,
	"shipped_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_orders_status_ck" CHECK ("card_orders"."status" in ('awaiting_payment', 'paid', 'validating', 'in_production', 'quality_check', 'shipped', 'delivered', 'canceled')),
	CONSTRAINT "card_orders_kind_ck" CHECK ("card_orders"."kind" in ('qr', 'nfc')),
	CONSTRAINT "card_orders_units_ck" CHECK ("card_orders"."units" >= 1 and "card_orders"."cards_count" >= 1 and "card_orders"."total" >= 0)
);
--> statement-breakpoint
CREATE TABLE "card_products" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"quantity" integer NOT NULL,
	"price" integer NOT NULL,
	"currency" text DEFAULT 'GNF' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_products_kind_ck" CHECK ("card_products"."kind" in ('qr', 'nfc')),
	CONSTRAINT "card_products_price_ck" CHECK ("card_products"."price" >= 0),
	CONSTRAINT "card_products_quantity_ck" CHECK ("card_products"."quantity" >= 1)
);
--> statement-breakpoint
CREATE TABLE "card_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cards" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"order_id" text NOT NULL,
	"user_id" text NOT NULL,
	"page_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"disabled_by" text,
	"scan_count" integer DEFAULT 0 NOT NULL,
	"last_scanned_at" timestamp with time zone,
	"nfc_chip_id" text DEFAULT '' NOT NULL,
	"nfc_programmed_url" text DEFAULT '' NOT NULL,
	"nfc_result" text DEFAULT 'untested' NOT NULL,
	"nfc_programmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cards_status_ck" CHECK ("cards"."status" in ('active', 'disabled')),
	CONSTRAINT "cards_kind_ck" CHECK ("cards"."kind" in ('qr', 'nfc')),
	CONSTRAINT "cards_nfc_result_ck" CHECK ("cards"."nfc_result" in ('untested', 'passed', 'failed')),
	CONSTRAINT "cards_disabled_by_ck" CHECK ("cards"."disabled_by" is null or "cards"."disabled_by" in ('owner', 'admin'))
);
--> statement-breakpoint
ALTER TABLE "card_orders" ADD CONSTRAINT "card_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_orders" ADD CONSTRAINT "card_orders_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_orders" ADD CONSTRAINT "card_orders_product_id_card_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."card_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_order_id_card_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."card_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "card_orders_reference_uq" ON "card_orders" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "card_orders_user_idx" ON "card_orders" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "card_orders_status_idx" ON "card_orders" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cards_code_uq" ON "cards" USING btree ("code");--> statement-breakpoint
CREATE INDEX "cards_order_idx" ON "cards" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "cards_user_idx" ON "cards" USING btree ("user_id");--> statement-breakpoint
-- Tarifs initiaux indicatifs (GNF) : modifiables ensuite depuis l'Admin Center (rubrique Cartes de visite).
INSERT INTO "card_products" ("id", "kind", "quantity", "price", "currency", "active") VALUES
  ('qr_basic', 'qr', 1, 40000, 'GNF', true),
  ('nfc_premium', 'nfc', 1, 75000, 'GNF', true),
  ('qr_pack10', 'qr', 10, 350000, 'GNF', true),
  ('nfc_pack10', 'nfc', 10, 600000, 'GNF', true);
