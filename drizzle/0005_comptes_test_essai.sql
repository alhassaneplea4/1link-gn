-- Les comptes de test (un par type de profil) servent à vérifier chaque offre : leur essai gratuit ne doit pas expirer.
UPDATE "users" SET "free_trial_ends_at" = now() + interval '3650 days' WHERE "email" LIKE '%@comptes-test.invalid';--> statement-breakpoint
UPDATE "users" SET "paid_trial_used_at" = now() WHERE "email" LIKE '%@comptes-test.invalid' AND "paid_trial_used_at" IS NULL AND "id" IN (SELECT "user_id" FROM "subscriptions" WHERE "plan_id" <> 'free');
