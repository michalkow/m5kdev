DROP INDEX `users_stripe_customer_id_unique`;--> statement-breakpoint
ALTER TABLE `users` ADD `closed_at` integer;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `stripe_customer_id`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_apikeys` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`start` text,
	`prefix` text,
	`key` text NOT NULL,
	`config_id` text DEFAULT 'default' NOT NULL,
	`reference_id` text NOT NULL,
	`user_id` text,
	`refill_interval` integer,
	`refill_amount` integer,
	`last_refill_at` integer,
	`enabled` integer NOT NULL,
	`rate_limit_enabled` integer NOT NULL,
	`rate_limit_time_window` integer,
	`rate_limit_max` integer,
	`request_count` integer NOT NULL,
	`remaining` integer,
	`last_request` integer,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`permissions` text,
	`metadata` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_apikeys`("id", "name", "start", "prefix", "key", "config_id", "reference_id", "user_id", "refill_interval", "refill_amount", "last_refill_at", "enabled", "rate_limit_enabled", "rate_limit_time_window", "rate_limit_max", "request_count", "remaining", "last_request", "expires_at", "created_at", "updated_at", "permissions", "metadata") SELECT "id", "name", "start", "prefix", "key", 'default', "user_id", "user_id", "refill_interval", "refill_amount", "last_refill_at", "enabled", "rate_limit_enabled", "rate_limit_time_window", "rate_limit_max", "request_count", "remaining", "last_request", "expires_at", "created_at", "updated_at", "permissions", "metadata" FROM `apikeys`;--> statement-breakpoint
DROP TABLE `apikeys`;--> statement-breakpoint
ALTER TABLE `__new_apikeys` RENAME TO `apikeys`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `organizations` ADD `currency` text;--> statement-breakpoint
ALTER TABLE `organizations` ADD `stripe_customer_id` text;--> statement-breakpoint
ALTER TABLE `organizations` ADD `stripe_sandbox_customer_id` text;--> statement-breakpoint
ALTER TABLE `organizations` ADD `billing_exempt` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `allow_cardless_trial` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `cardless_trial_consumed` text DEFAULT '{}';--> statement-breakpoint
ALTER TABLE `organizations` ADD `closed_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_stripe_customer_id_unique` ON `organizations` (`stripe_customer_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_stripe_sandbox_customer_id_unique` ON `organizations` (`stripe_sandbox_customer_id`);--> statement-breakpoint
ALTER TABLE `files` DROP COLUMN `team_id`;