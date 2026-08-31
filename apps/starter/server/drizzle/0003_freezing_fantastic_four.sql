DROP INDEX `users_payment_customer_id_unique`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `payment_customer_id`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `payment_plan_tier`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `payment_plan_expires_at`;